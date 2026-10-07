import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { internalMutation, internalQuery, type MutationCtx } from "./_generated/server";
import { codeLetter, nextCode } from "./lib/codes";
import { searchTextWithCard } from "./lib/families";
import { renderReport } from "./lib/report";
import type { FamilyInput } from "./lib/types";
import { vDictionary, vFamilyInput, vMismatch } from "./validators";

export const STALE_BUILD_MS = 2 * 60 * 60 * 1000;

export const beginBuild = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const running = await ctx.db.query("builds").withIndex("by_status", (q) => q.eq("status", "running")).collect();
    for (const b of running) {
      if (now - b.startedAt < STALE_BUILD_MS) {
        throw new Error(`A build is already running (started ${new Date(b.startedAt).toISOString()})`);
      }
      await ctx.db.patch(b._id, { status: "failed", finishedAt: now, notes: [...b.notes, "Marked failed: stale after 2 hours"] });
    }
    return ctx.db.insert("builds", {
      status: "running",
      startedAt: now,
      finishedAt: null,
      pending: 0,
      done: 0,
      skipped: 0,
      failed: 0,
      costUsd: 0,
      firecrawlCalls: 0,
      notes: [],
      mismatch: null,
      orphanChunksDeleted: 0,
      report: null,
    });
  },
});

export const failBuild = internalMutation({
  args: { buildId: v.id("builds"), reason: v.string() },
  handler: async (ctx, { buildId, reason }) => {
    const b = await ctx.db.get(buildId);
    if (!b) return;
    const final = { ...b, status: "failed" as const, finishedAt: Date.now(), notes: [...b.notes, reason] };
    await ctx.db.patch(buildId, {
      status: final.status,
      finishedAt: final.finishedAt,
      notes: final.notes,
      report: renderReport(final),
    });
  },
});

export const listOverrides = internalQuery({
  args: {},
  handler: async (ctx) => ({
    items: (await ctx.db.query("itemOverrides").collect()).map(({ hubId, measure, place, years }) => ({
      hubId,
      measure,
      place,
      years,
    })),
    dictionaries: (await ctx.db.query("dictionaryOverrides").collect()).map(({ familyKey, tab }) => ({ familyKey, tab })),
  }),
});

export const addDictionaryOverride = internalMutation({
  args: { familyKey: v.string(), tab: v.string() },
  handler: async (ctx, { familyKey, tab }) => {
    const existing = await ctx.db
      .query("dictionaryOverrides")
      .withIndex("by_familyKey", (q) => q.eq("familyKey", familyKey))
      .first();
    if (existing) await ctx.db.patch(existing._id, { tab });
    else await ctx.db.insert("dictionaryOverrides", { familyKey, tab });
  },
});

export const swapCatalog = internalMutation({
  args: { buildId: v.id("builds"), families: v.array(vFamilyInput), dictionaries: v.array(vDictionary) },
  handler: async (ctx, { families, dictionaries }) => {
    const live = await ctx.db.query("families").collect();
    if (live.length > 0 && families.length < Math.ceil(live.length * 0.9)) {
      return {
        ok: false as const,
        reason: `Feed produced ${families.length} families; live catalog has ${live.length}. Refusing to shrink by more than 10%.`,
      };
    }
    const liveByKey = new Map(live.map((f) => [f.key, f]));
    const incoming = new Set(families.map((f) => f.key));
    for (const old of live) if (!incoming.has(old.key)) await retireFamily(ctx, old);
    for (const f of families) await upsertFamily(ctx, f, liveByKey.get(f.key) ?? null);
    for (const d of await ctx.db.query("dictionaries").collect()) await ctx.db.delete(d._id);
    for (const d of dictionaries) await ctx.db.insert("dictionaries", d);
    return { ok: true as const };
  },
});

async function issueCode(ctx: MutationCtx, familyKey: string, letter: string): Promise<string> {
  const prior = await ctx.db.query("codes").withIndex("by_familyKey", (q) => q.eq("familyKey", familyKey)).first();
  if (prior) {
    if (prior.retiredAt !== null) await ctx.db.patch(prior._id, { retiredAt: null });
    return prior.code;
  }
  const issued = (await ctx.db.query("codes").withIndex("by_letter", (q) => q.eq("letter", letter)).collect()).map(
    (c) => c.number,
  );
  const { code, number } = nextCode(letter, issued);
  await ctx.db.insert("codes", { code, letter, number, familyKey, retiredAt: null });
  return code;
}

async function upsertFamily(ctx: MutationCtx, f: FamilyInput, existing: Doc<"families"> | null) {
  const { members, ...fields } = f;
  const code = existing?.code ?? (await issueCode(ctx, f.key, codeLetter(f.kind, f.topic)));
  const card = await ctx.db.query("cards").withIndex("by_family", (q) => q.eq("familyKey", f.key)).first();
  const searchText = card ? searchTextWithCard(f.baseSearchText, card) : f.baseSearchText;
  if (existing) await ctx.db.patch(existing._id, { ...fields, code, searchText });
  else await ctx.db.insert("families", { ...fields, code, searchText });
  const oldMembers = await ctx.db.query("members").withIndex("by_family", (q) => q.eq("familyKey", f.key)).collect();
  for (const m of oldMembers) await ctx.db.delete(m._id);
  for (const m of members) await ctx.db.insert("members", { familyKey: f.key, ...m });
}

async function retireFamily(ctx: MutationCtx, fam: Doc<"families">) {
  const members = await ctx.db.query("members").withIndex("by_family", (q) => q.eq("familyKey", fam.key)).collect();
  for (const m of members) await ctx.db.delete(m._id);
  const cards = await ctx.db.query("cards").withIndex("by_family", (q) => q.eq("familyKey", fam.key)).collect();
  for (const c of cards) await ctx.db.delete(c._id);
  const code = await ctx.db.query("codes").withIndex("by_familyKey", (q) => q.eq("familyKey", fam.key)).first();
  if (code) await ctx.db.patch(code._id, { retiredAt: Date.now() });
  await ctx.db.delete(fam._id);
}

export const setPending = internalMutation({
  args: { buildId: v.id("builds"), pending: v.number(), notes: v.array(v.string()), mismatch: vMismatch },
  handler: async (ctx, { buildId, pending, notes, mismatch }) => {
    await ctx.db.patch(buildId, { pending, notes, mismatch });
  },
});

export const latestReport = internalQuery({
  args: {},
  handler: async (ctx) => (await ctx.db.query("builds").order("desc").first())?.report ?? null,
});
