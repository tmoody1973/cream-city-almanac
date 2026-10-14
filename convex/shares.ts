import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import { action, internalMutation, query, type ActionCtx } from "./_generated/server";
import { rateLimiter } from "./limits";
import { isShareable, newShareId, shareCard, shareDate, SITE, type Shared, type ShareResult, type ShareTool } from "../ui/lib/shareCard";

// Share links (spec 2026-10-14-share-link-design.md). The browser sends only which tool made the card and its
// arguments; the server re-runs that tool as the sharer and stores the card's own export, so no number or word on a
// shared page ever came from the browser.

// The same Convex function Ask's tool calls, with the same argument validators and rate limits. A tract tool's
// answer is the model's slim copy; its full detail is what it just saved under its key.
async function rerun(ctx: ActionCtx, tool: ShareTool, args: never): Promise<unknown> {
  switch (tool) {
    case "getNumber": return ctx.runQuery(api.ask.getNumber, args);
    case "countStops": return ctx.runQuery(api.stops.countStops, args);
    case "countTurnout": return ctx.runQuery(api.elections.countTurnout, args);
    case "countRecords": return ctx.runAction(api.city.countRecords, args);
    case "timeSpan": return ctx.runAction(api.spans.timeSpan, args);
    case "readReport": return ctx.runAction(api.ask.readReport, args);
    case "rankTracts":
    case "compareYears":
    case "relateTracts": {
      const fn = tool === "rankTracts" ? api.tracts.rankTracts : tool === "compareYears" ? api.tracts.compareYears : api.tracts.relateTracts;
      const r = (await ctx.runAction(fn, args)) as { status: string; key?: string };
      return r.status === "ok" && r.key ? ctx.runQuery(api.tracts.tractDetail, { key: r.key, now: Date.now() }) : r;
    }
  }
}

export const create = action({
  args: { tool: v.string(), args: v.any() },
  handler: async (ctx, a): Promise<ShareResult> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { ok: false, reason: "signed-out" };
    if (!isShareable(a.tool)) return { ok: false, reason: "not-shareable" };
    if (!(await rateLimiter.limit(ctx, "askShares", { key: identity.tokenIdentifier })).ok) return { ok: false, reason: "limit" };
    let shared: Shared | null = null;
    try {
      shared = shareCard(a.tool, await rerun(ctx, a.tool, a.args as never), { origin: SITE, date: shareDate(Date.now()) });
    } catch (e) {
      // Arguments that don't fit, or the source failing: no link. The arguments aren't logged (they can hold typed words).
      console.error(`share ${a.tool} failed:`, e instanceof Error ? e.message : String(e));
    }
    if (!shared) return { ok: false, reason: "failed" };
    const card = JSON.stringify(shared);
    for (let i = 0; i < 3; i++) {
      const shareId = newShareId();
      if (await ctx.runMutation(internal.shares.store, { shareId, kind: a.tool, card, by: identity.tokenIdentifier })) return { ok: true, id: shareId };
    }
    return { ok: false, reason: "failed" };
  },
});

export const store = internalMutation({
  args: { shareId: v.string(), kind: v.string(), card: v.string(), by: v.string() },
  handler: async (ctx, a): Promise<boolean> => {
    const clash = await ctx.db.query("shares").withIndex("by_shareId", (q) => q.eq("shareId", a.shareId)).first();
    if (clash) return false;
    await ctx.db.insert("shares", { ...a, createdAt: Date.now() });
    return true;
  },
});

// Anyone with the link: the snapshot and when it was shared, never who shared it.
export const get = query({
  args: { id: v.string() },
  handler: async (ctx, { id }): Promise<{ kind: string; shared: Shared; createdAt: number } | null> => {
    const row = await ctx.db.query("shares").withIndex("by_shareId", (q) => q.eq("shareId", id)).first();
    return row ? { kind: row.kind, shared: JSON.parse(row.card) as Shared, createdAt: row.createdAt } : null;
  },
});

// Taking a link down, by hand: npx convex run shares:remove '{"id":"…"}' --prod
export const remove = internalMutation({
  args: { id: v.string() },
  handler: async (ctx, { id }): Promise<boolean> => {
    const row = await ctx.db.query("shares").withIndex("by_shareId", (q) => q.eq("shareId", id)).first();
    if (!row) return false;
    await ctx.db.delete(row._id);
    return true;
  },
});
