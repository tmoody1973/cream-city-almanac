import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { censusUrl, parseCensus, requestsFor } from "./lib/census";
import type { Est } from "./lib/factMath";
import { fetchWithTimeout } from "./lib/http";

const N03 = "document:neighborhood-portrait-spreadsheet";
const TIMEOUT_MS = 30_000;
const vEst = v.object({ estimate: v.number(), moe: v.union(v.number(), v.null()) });

// The survey periods DYCU's portraits use: each file's year is the ACS 5-year release it comes from.
export const portraitPeriods = internalQuery({
  args: {},
  handler: async (ctx): Promise<number[]> => {
    const members = await ctx.db.query("members").withIndex("by_family", (q) => q.eq("familyKey", N03)).collect();
    return [...new Set(members.flatMap((m) => m.years))].filter((y) => y >= 2010).sort();
  },
});

export const storeCityFigures = internalMutation({
  args: { period: v.number(), values: v.record(v.string(), vEst) },
  handler: async (ctx, { period, values }) => {
    const old = await ctx.db.query("cityFigures").withIndex("by_period", (q) => q.eq("period", period)).first();
    if (old) await ctx.db.patch(old._id, { values, fetchedAt: Date.now() });
    else await ctx.db.insert("cityFigures", { period, values, fetchedAt: Date.now() });
  },
});

export const cityValues = internalQuery({
  args: { period: v.number() },
  handler: async (ctx, { period }): Promise<Record<string, Est> | null> =>
    (await ctx.db.query("cityFigures").withIndex("by_period", (q) => q.eq("period", period)).first())?.values ?? null,
});

// Weekly (build.finish) or alone: `npx convex run cityFigures:refreshCityFigures`. Notes, never throws; a period is
// replaced only when all its requests succeed, so a failure keeps last week's figures.
export const refreshCityFigures = internalAction({
  args: {},
  handler: async (ctx): Promise<string[]> => {
    const key = process.env.CENSUS_API_KEY;
    if (!key) return ["CENSUS_API_KEY is not set (run: npx convex env set CENSUS_API_KEY <key>); city figures not refreshed."];
    const notes: string[] = [];
    for (const period of await ctx.runQuery(internal.cityFigures.portraitPeriods, {})) {
      try {
        const values: Record<string, Est> = {};
        for (const r of requestsFor()) {
          const res = await fetchWithTimeout(censusUrl(period, r.kind, r.codes, key), {}, TIMEOUT_MS);
          if (!res.ok) throw new Error(`Census request failed: ${res.status}`);
          Object.assign(values, parseCensus(await res.json(), r.codes));
        }
        await ctx.runMutation(internal.cityFigures.storeCityFigures, { period, values });
      } catch (e) {
        // Never store the key: error text from fetch can include the full request URL.
        const why = (e instanceof Error ? e.message : String(e)).replace(/key=[^&\s]+/g, "key=\u2026");
        // An HTTP error is about one period; a timeout or network failure means the service is down, so stop
        // rather than wait out every remaining request inside the weekly build.
        if (!why.startsWith("Census request failed:")) {
          notes.push(`Census unreachable; city figures not refreshed, kept the last ones stored: ${why}`);
          break;
        }
        notes.push(`City figures for ${period} unavailable, kept last week's: ${why}`);
      }
    }
    return notes;
  },
});
