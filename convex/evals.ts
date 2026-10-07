import { v } from "convex/values";
import { internalAction, internalQuery } from "./_generated/server";
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
