import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalQuery } from "./_generated/server";
import { embed, gatewayKey } from "./lib/gateway";
import { passesTop3, QUESTIONS } from "./lib/evalQuestions";
import { runSearch } from "./search";

export const searchReportCard = internalAction({
  args: {},
  handler: async (ctx) => {
    const misses: { question: string; expected: string[]; got: string[] }[] = [];
    for (const q of QUESTIONS) {
      const res = await runSearch(ctx, { query: q.question });
      const got = res.results.map((r) => r.key);
      if (!passesTop3(q.expect, got)) misses.push({ question: q.question, expected: q.expect, got: got.slice(0, 3) });
    }
    const passed = QUESTIONS.length - misses.length;
    return { total: QUESTIONS.length, passed, rate: passed / QUESTIONS.length, misses };
  },
});

export const randomCards = internalQuery({
  args: { n: v.number() },
  handler: async (ctx, { n }) => {
    const cards = await ctx.db.query("cards").collect();
    const picked = [...cards].sort(() => Math.random() - 0.5).slice(0, n);
    const out = [];
    for (const { embedding, ...card } of picked) {
      const family = await ctx.db.query("families").withIndex("by_key", (q) => q.eq("key", card.familyKey)).first();
      out.push({ family: family?.name ?? card.familyKey, code: family?.code ?? "", card });
    }
    return out;
  },
});

// Diagnostic: the top vector similarity scores for a query, used to calibrate search's relevance floor.
export const vectorScores = internalAction({
  args: { query: v.string() },
  handler: async (ctx, { query }): Promise<{ cards: number[]; chunks: number[] }> => {
    const settings = await ctx.runQuery(internal.settings.get, {});
    const { vectors } = await embed([query], settings.embedModel, gatewayKey());
    const [cards, chunks] = await Promise.all([
      ctx.vectorSearch("cards", "by_embedding", { vector: vectors[0], limit: 5 }),
      ctx.vectorSearch("docChunks", "by_embedding", { vector: vectors[0], limit: 5 }),
    ]);
    const round = (n: number) => Math.round(n * 1000) / 1000;
    return { cards: cards.map((c) => round(c._score)), chunks: chunks.map((c) => round(c._score)) };
  },
});
