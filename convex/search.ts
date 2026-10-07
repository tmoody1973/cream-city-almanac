import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { action, internalQuery, query, type ActionCtx, type QueryCtx } from "./_generated/server";
import { embed, gatewayKey } from "./lib/gateway";
import { STALE_BUILD_MS } from "./buildStore";
import { rateLimiter } from "./limits";
import { applyFilters, fuseRanks, keywordQuery, MIN_VECTOR_SCORE, normalizeQuery, relevantRanks, type Hit } from "./lib/rank";
import type { ResultRow, SearchResponse } from "./lib/types";

const searchArgs = {
  query: v.string(),
  topic: v.optional(v.string()),
  place: v.optional(v.string()),
  year: v.optional(v.number()),
};

export const toRow = (f: Doc<"families">): ResultRow => ({
  key: f.key,
  code: f.code,
  name: f.name,
  kind: f.kind,
  topic: f.topic,
  places: f.places,
  years: f.years,
  latestModified: f.latestModified,
  snippet: null,
});

export const searchCatalog = action({
  args: searchArgs,
  // Only the public endpoint spends the shared embedding allowance; internal callers (the report card) never do.
  handler: async (ctx, args): Promise<SearchResponse> => {
    const capped = normalizeQuery(args.query) ? !(await rateLimiter.limit(ctx, "searchEmbeds")).ok : false;
    return runSearch(ctx, args, { capped });
  },
});

export async function runSearch(
  ctx: ActionCtx,
  args: { query: string; topic?: string; place?: string; year?: number },
  opts: { capped?: boolean } = {},
): Promise<SearchResponse> {
  const q = normalizeQuery(args.query);
  if (!q) {
    const rows: ResultRow[] = await ctx.runQuery(internal.search.rundown, {});
    return { mode: "rundown", degraded: false, results: applyFilters(rows, args) };
  }

  let degraded = false;
  let keyword: Hit[] = [];
  const kq = keywordQuery(q);
  if (kq) {
    try {
      keyword = await ctx.runQuery(internal.search.keywordHits, { query: kq, topic: args.topic });
    } catch (e) {
      degraded = true;
      console.warn(`keyword search failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  let vectorLists: Hit[][] = [];
  try {
    if (opts.capped) throw new Error("public search embedding cap reached");
    const settings = await ctx.runQuery(internal.settings.get, {});
    const { vectors } = await embed([q], settings.embedModel, gatewayKey());
    const relevant = <T extends { _score: number }>(hits: T[]) => hits.filter((h) => h._score >= MIN_VECTOR_SCORE);
    const [cards, chunks] = await Promise.all([
      ctx.vectorSearch("cards", "by_embedding", { vector: vectors[0], limit: 20 }).then(relevant),
      ctx.vectorSearch("docChunks", "by_embedding", { vector: vectors[0], limit: 30 }).then(relevant),
    ]);
    const resolved: { cards: Hit[]; chunks: Hit[] } = await ctx.runQuery(internal.search.resolveVectorHits, {
      cardIds: cards.map((c) => c._id),
      chunkIds: chunks.map((c) => c._id),
    });
    vectorLists = [resolved.cards, resolved.chunks];
  } catch (e) {
    degraded = true;
    console.warn(`search degraded to keywords: ${e instanceof Error ? e.message : String(e)}`);
  }

  const fused = fuseRanks([keyword, ...vectorLists]);
  // Keyword-only (degraded) search keeps its full list; the relevance rule assumes several rankings to agree.
  const ranked = (vectorLists.length ? relevantRanks(fused) : fused).slice(0, 40);
  const rows: ResultRow[] = await ctx.runQuery(internal.search.summaries, { keys: ranked.map((r) => r.familyKey) });
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const results = ranked.flatMap((r) => {
    const row = byKey.get(r.familyKey);
    return row ? [{ ...row, snippet: r.snippet }] : [];
  });
  return { mode: "search", degraded, results: applyFilters(results, args).slice(0, 20) };
}

export const keywordHits = internalQuery({
  args: { query: v.string(), topic: v.optional(v.string()) },
  handler: async (ctx, { query: q, topic }): Promise<Hit[]> => {
    const rows = await ctx.db
      .query("families")
      .withSearchIndex("search_text", (s) => (topic ? s.search("searchText", q).eq("topic", topic) : s.search("searchText", q)))
      .take(20);
    return rows.map((r) => ({ familyKey: r.key }));
  },
});

export const resolveVectorHits = internalQuery({
  args: { cardIds: v.array(v.id("cards")), chunkIds: v.array(v.id("docChunks")) },
  handler: async (ctx, { cardIds, chunkIds }) => {
    const cards: Hit[] = [];
    for (const id of cardIds) {
      const card = await ctx.db.get(id);
      if (card) cards.push({ familyKey: card.familyKey });
    }
    const chunks: Hit[] = [];
    for (const id of chunkIds) {
      const chunk = await ctx.db.get(id);
      if (!chunk) continue;
      const member = await ctx.db.query("members").withIndex("by_hubId", (q) => q.eq("hubId", chunk.hubId)).first();
      if (!member) continue;
      chunks.push({
        familyKey: member.familyKey,
        snippet: { hubId: chunk.hubId, title: member.title, section: chunk.section, text: chunk.text.slice(0, 280) },
      });
    }
    return { cards, chunks };
  },
});

export const summaries = internalQuery({
  args: { keys: v.array(v.string()) },
  handler: async (ctx, { keys }) => {
    const rows: ResultRow[] = [];
    for (const key of keys) {
      const f = await ctx.db.query("families").withIndex("by_key", (q) => q.eq("key", key)).first();
      if (f) rows.push(toRow(f));
    }
    return rows;
  },
});

export async function rundownRows(ctx: QueryCtx): Promise<ResultRow[]> {
  return (await ctx.db.query("families").withIndex("by_latestModified").order("desc").take(10)).map(toRow);
}

export const rundown = internalQuery({
  args: {},
  handler: (ctx) => rundownRows(ctx),
});

export const catalogStatus = query({
  args: {},
  handler: async (ctx) => {
    const latest = await ctx.db.query("builds").order("desc").first();
    const lastGood = await ctx.db
      .query("builds")
      .withIndex("by_status", (q) => q.eq("status", "completed"))
      .order("desc")
      .first();
    return {
      asOf: lastGood?.finishedAt ?? null,
      lastRunFailed: latest?.status === "failed",
      running: latest?.status === "running" && Date.now() - latest.startedAt < STALE_BUILD_MS,
      counts: lastGood?.hubCounts ?? null,
    };
  },
});
