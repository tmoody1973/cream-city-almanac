import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { internalMutation, internalQuery, type MutationCtx } from "./_generated/server";
import { codeLetter, nextCode } from "./lib/codes";
import { searchTextWithCard } from "./lib/families";
import { renderReport } from "./lib/report";
import type { FamilyInput } from "./lib/types";
import { readSettings } from "./settings";
import { vCard, vOutcome, vPortraitTable } from "./validators";
import { vDictionary, vFamilyInput, vMismatch } from "./validators";

export const STALE_BUILD_MS = 2 * 60 * 60 * 1000;
// A feed may not shrink the live catalog (families or items) by more than 10% in one run.
const MIN_KEEP_RATIO = 0.9;

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
    if (!b || b.status !== "running") return;
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
    if (live.length > 0 && families.length < Math.ceil(live.length * MIN_KEEP_RATIO)) {
      return {
        ok: false as const,
        reason: `Feed produced ${families.length} families; live catalog has ${live.length}. Refusing to shrink by more than 10%.`,
      };
    }
    const liveMembers = (await ctx.db.query("members").collect()).length;
    const incomingMembers = families.reduce((n, f) => n + f.members.length, 0);
    if (liveMembers > 0 && incomingMembers < Math.ceil(liveMembers * MIN_KEEP_RATIO)) {
      return {
        ok: false as const,
        reason: `Feed produced ${incomingMembers} items; live catalog has ${liveMembers}. Refusing to shrink by more than 10%.`,
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

async function ensureCode(ctx: MutationCtx, familyKey: string, letter: string, name: string): Promise<string> {
  const prior = await ctx.db.query("codes").withIndex("by_familyKey", (q) => q.eq("familyKey", familyKey)).first();
  if (prior) {
    if (prior.retiredAt !== null || prior.name !== name) await ctx.db.patch(prior._id, { retiredAt: null, name });
    return prior.code;
  }
  const issued = (await ctx.db.query("codes").withIndex("by_letter", (q) => q.eq("letter", letter)).collect()).map(
    (c) => c.number,
  );
  const { code, number } = nextCode(letter, issued);
  await ctx.db.insert("codes", { code, letter, number, familyKey, name, retiredAt: null });
  return code;
}

async function upsertFamily(ctx: MutationCtx, f: FamilyInput, existing: Doc<"families"> | null) {
  const { members, ...fields } = f;
  const code = await ensureCode(ctx, f.key, codeLetter(f.kind, f.topic), f.name);
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
  args: {
    buildId: v.id("builds"),
    pending: v.number(),
    hubCounts: v.object({ rawData: v.number(), reports: v.number(), visualizations: v.number() }),
    pdfReports: v.number(),
    notes: v.array(v.string()),
    mismatch: vMismatch,
  },
  handler: async (ctx, { buildId, ...fields }) => {
    await ctx.db.patch(buildId, fields);
  },
});

export const latestReport = internalQuery({
  args: {},
  handler: async (ctx) => (await ctx.db.query("builds").order("desc").first())?.report ?? null,
});

export const familyContext = internalQuery({
  args: { familyKey: v.string() },
  handler: async (ctx, { familyKey }) => {
    const family = await ctx.db.query("families").withIndex("by_key", (q) => q.eq("key", familyKey)).first();
    if (!family) return null;
    const members = await ctx.db.query("members").withIndex("by_family", (q) => q.eq("familyKey", familyKey)).collect();
    const dictionary = family.dictionaryTab
      ? await ctx.db.query("dictionaries").withIndex("by_tab", (q) => q.eq("tab", family.dictionaryTab!)).first()
      : null;
    const card = await ctx.db.query("cards").withIndex("by_family", (q) => q.eq("familyKey", familyKey)).first();
    const sources = await ctx.db.query("sources").collect();
    return {
      family: { key: family.key, name: family.name, kind: family.kind, places: family.places, years: family.years },
      members: members.map((m) => ({
        hubId: m.hubId,
        modified: m.modified,
        description: m.description,
        featureServerUrl: m.featureServerUrl,
      })),
      dictionary: dictionary ? { tab: dictionary.tab, dataSource: dictionary.dataSource, fields: dictionary.fields } : null,
      sources: sources.map((s) => ({ name: s.name, summary: s.summary, limits: s.limits })),
      existing: card ? { inputHash: card.inputHash, basic: card.basic } : null,
      settings: await readSettings(ctx),
    };
  },
});

export const reportContext = internalQuery({
  args: { hubId: v.string() },
  handler: async (ctx, { hubId }) => {
    const member = await ctx.db.query("members").withIndex("by_hubId", (q) => q.eq("hubId", hubId)).first();
    if (!member) return null;
    const chunk = await ctx.db.query("docChunks").withIndex("by_hubId", (q) => q.eq("hubId", hubId)).first();
    return {
      member: { hubId, title: member.title, modified: member.modified },
      indexedModified: chunk?.modified ?? null,
      settings: await readSettings(ctx),
    };
  },
});

export const reserveSpend = internalMutation({
  args: { buildId: v.id("builds"), usd: v.number() },
  handler: async (ctx, { buildId, usd }) => {
    const b = await ctx.db.get(buildId);
    if (!b) return false;
    const { buildCapUsd } = await readSettings(ctx);
    if (b.costUsd + usd > buildCapUsd) return false;
    await ctx.db.patch(buildId, { costUsd: b.costUsd + usd });
    return true;
  },
});

export const settleSpend = internalMutation({
  args: { buildId: v.id("builds"), usd: v.number() },
  handler: async (ctx, { buildId, usd }) => {
    const b = await ctx.db.get(buildId);
    if (b) await ctx.db.patch(buildId, { costUsd: Math.max(0, b.costUsd + usd) });
  },
});

export const reserveFirecrawl = internalMutation({
  args: { buildId: v.id("builds") },
  handler: async (ctx, { buildId }) => {
    const b = await ctx.db.get(buildId);
    if (!b) return false;
    const { maxFirecrawlCallsPerRun } = await readSettings(ctx);
    if (b.firecrawlCalls >= maxFirecrawlCallsPerRun) return false;
    await ctx.db.patch(buildId, { firecrawlCalls: b.firecrawlCalls + 1 });
    return true;
  },
});

export const replaceCard = internalMutation({
  args: { inputHash: v.string(), card: vCard, embedding: v.array(v.float64()) },
  handler: async (ctx, { inputHash, card, embedding }) => {
    const family = await ctx.db.query("families").withIndex("by_key", (q) => q.eq("key", card.familyKey)).first();
    if (!family) return;
    const old = await ctx.db.query("cards").withIndex("by_family", (q) => q.eq("familyKey", card.familyKey)).collect();
    for (const c of old) await ctx.db.delete(c._id);
    await ctx.db.insert("cards", { ...card, inputHash, embedding });
    await ctx.db.patch(family._id, { searchText: searchTextWithCard(family.baseSearchText, card) });
  },
});

export const replaceChunks = internalMutation({
  args: {
    hubId: v.string(),
    modified: v.string(),
    chunks: v.array(v.object({ section: v.string(), text: v.string(), embedding: v.array(v.float64()) })),
  },
  handler: async (ctx, { hubId, modified, chunks }) => {
    const old = await ctx.db.query("docChunks").withIndex("by_hubId", (q) => q.eq("hubId", hubId)).collect();
    for (const c of old) await ctx.db.delete(c._id);
    for (const c of chunks) await ctx.db.insert("docChunks", { hubId, modified, ...c });
  },
});

export const markDone = internalMutation({
  args: { buildId: v.id("builds"), outcome: vOutcome, note: v.optional(v.string()) },
  handler: async (ctx, { buildId, outcome, note }) => {
    const b = await ctx.db.get(buildId);
    if (!b || b.status !== "running") return;
    const next = {
      done: b.done + (outcome === "done" ? 1 : 0),
      skipped: b.skipped + (outcome === "skipped" ? 1 : 0),
      failed: b.failed + (outcome === "failed" ? 1 : 0),
      notes: note ? [...b.notes, note].slice(-200) : b.notes,
    };
    await ctx.db.patch(buildId, next);
    if (b.pending > 0 && next.done + next.skipped + next.failed === b.pending) {
      await ctx.scheduler.runAfter(0, internal.build.finish, { buildId });
    }
  },
});

export const cleanupOrphanChunks = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db.query("docChunks").paginate({ cursor, numItems: 50 });
    let deleted = 0;
    for (const chunk of page.page) {
      const member = await ctx.db.query("members").withIndex("by_hubId", (q) => q.eq("hubId", chunk.hubId)).first();
      if (!member) {
        await ctx.db.delete(chunk._id);
        deleted++;
      }
    }
    return { deleted, isDone: page.isDone, continueCursor: page.continueCursor };
  },
});

export const completeBuild = internalMutation({
  args: { buildId: v.id("builds"), orphanChunksDeleted: v.number() },
  handler: async (ctx, { buildId, orphanChunksDeleted }) => {
    const b = await ctx.db.get(buildId);
    if (!b || b.status !== "running") return;
    const final = { ...b, status: "completed" as const, finishedAt: Date.now(), orphanChunksDeleted };
    await ctx.db.patch(buildId, {
      status: final.status,
      finishedAt: final.finishedAt,
      orphanChunksDeleted,
      report: renderReport(final),
    });
  },
});

export const sourceAges = internalQuery({
  args: {},
  handler: async (ctx) => (await ctx.db.query("sources").collect()).map((s) => ({ name: s.name, fetchedAt: s.fetchedAt })),
});

export const upsertSource = internalMutation({
  args: { name: v.string(), url: v.string(), summary: v.string(), limits: v.string() },
  handler: async (ctx, source) => {
    const existing = await ctx.db.query("sources").withIndex("by_name", (q) => q.eq("name", source.name)).first();
    const row = { ...source, fetchedAt: Date.now() };
    if (existing) await ctx.db.patch(existing._id, row);
    else await ctx.db.insert("sources", row);
  },
});

export const indexedModified = internalQuery({
  args: { hubIds: v.array(v.string()) },
  handler: async (ctx, { hubIds }) => {
    const out: { hubId: string; modified: string }[] = [];
    for (const hubId of hubIds) {
      const chunk = await ctx.db.query("docChunks").withIndex("by_hubId", (q) => q.eq("hubId", hubId)).first();
      if (chunk) out.push({ hubId, modified: chunk.modified });
    }
    return out;
  },
});

export const portraitContext = internalQuery({
  args: { hubId: v.string() },
  handler: async (ctx, { hubId }) => {
    const member = await ctx.db.query("members").withIndex("by_hubId", (q) => q.eq("hubId", hubId)).first();
    if (!member) return null;
    const stored = await ctx.db.query("portraitTables").withIndex("by_hubId", (q) => q.eq("hubId", hubId)).first();
    return {
      member: { hubId, place: member.place ?? member.title, year: member.years[0] ?? null, modified: member.modified },
      indexedModified: stored?.modified ?? null,
      settings: await readSettings(ctx),
    };
  },
});

export const portraitIndexed = internalQuery({
  args: { hubIds: v.array(v.string()) },
  handler: async (ctx, { hubIds }) => {
    const out: { hubId: string; modified: string }[] = [];
    for (const hubId of hubIds) {
      const t = await ctx.db.query("portraitTables").withIndex("by_hubId", (q) => q.eq("hubId", hubId)).first();
      if (t) out.push({ hubId, modified: t.modified });
    }
    return out;
  },
});

export const replacePortrait = internalMutation({
  args: {
    hubId: v.string(),
    modified: v.string(),
    tables: v.array(vPortraitTable),
    chunks: v.array(v.object({ section: v.string(), text: v.string(), embedding: v.array(v.float64()) })),
  },
  handler: async (ctx, { hubId, modified, tables, chunks }) => {
    for (const old of await ctx.db.query("portraitTables").withIndex("by_hubId", (q) => q.eq("hubId", hubId)).collect()) {
      await ctx.db.delete(old._id);
    }
    for (const old of await ctx.db.query("docChunks").withIndex("by_hubId", (q) => q.eq("hubId", hubId)).collect()) {
      await ctx.db.delete(old._id);
    }
    for (const table of tables) await ctx.db.insert("portraitTables", { hubId, modified, ...table });
    for (const c of chunks) await ctx.db.insert("docChunks", { hubId, modified, ...c });
  },
});
