import { v } from "convex/values";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { chicagoDay, costUsd, dailyLimit } from "./lib/ask";
import { readSettings } from "./settings";

async function today(ctx: QueryCtx, user: string) {
  const day = chicagoDay(Date.now());
  const count = await ctx.db.query("askCounts").withIndex("by_day_user", (q) => q.eq("day", day).eq("user", user)).unique();
  const spend = await ctx.db.query("askSpend").withIndex("by_day", (q) => q.eq("day", day)).unique();
  return { day, count, spend };
}

// What the chat shows: questions left today and whether the site budget has paused Ask.
export const status = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const s = await readSettings(ctx);
    const { count, spend } = await today(ctx, identity.tokenIdentifier);
    const limit = dailyLimit(identity, s);
    return { limit, left: Math.max(0, limit - (count?.questions ?? 0)), paused: (spend?.usd ?? 0) >= s.askDailyCapUsd, newsroom: limit === s.askNewsroomLimit };
  },
});

// Called by the Ask route before the model runs; reserves the question so a failed answer still counts.
export const begin = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { ok: false as const, reason: "signed-out" as const };
    const s = await readSettings(ctx);
    const { day, count, spend } = await today(ctx, identity.tokenIdentifier);
    if ((spend?.usd ?? 0) >= s.askDailyCapUsd) return { ok: false as const, reason: "paused" as const };
    if ((count?.questions ?? 0) >= dailyLimit(identity, s)) return { ok: false as const, reason: "limit" as const };
    if (count) await ctx.db.patch(count._id, { questions: count.questions + 1 });
    else await ctx.db.insert("askCounts", { day, user: identity.tokenIdentifier, questions: 1 });
    return { ok: true as const };
  },
});

// Called by the Ask route's model wrapper after each model step. The secret keeps a signed-in
// person from inflating the site spend (and pausing Ask for everyone) by calling this directly.
export const recordUsage = mutation({
  args: { secret: v.string(), inputTokens: v.number(), outputTokens: v.number() },
  handler: async (ctx, { secret, inputTokens, outputTokens }) => {
    const expected = process.env.ASK_METER_SECRET;
    if (!expected || secret !== expected) throw new Error("Not allowed");
    const s = await readSettings(ctx);
    const day = chicagoDay(Date.now());
    const usd = costUsd({ inputTokens: Math.max(0, inputTokens), outputTokens: Math.max(0, outputTokens) }, s);
    const spend = await ctx.db.query("askSpend").withIndex("by_day", (q) => q.eq("day", day)).unique();
    if (spend) await ctx.db.patch(spend._id, { usd: spend.usd + usd });
    else await ctx.db.insert("askSpend", { day, usd });
    return null;
  },
});
