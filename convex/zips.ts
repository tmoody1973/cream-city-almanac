import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action } from "./_generated/server";
import { censusUrl, parseCensus, requestsFor, scrubKey, zctaGeo } from "./lib/census";
import type { Est } from "./lib/factMath";
import { fetchWithTimeout } from "./lib/http";
import { zipRows, type ZipRow } from "./lib/zipFigures";
import { checkZip, COUNTY_ZIPS } from "./lib/zips";
import { rateLimiter } from "./limits";
import { accountLimit } from "./lib/testAccounts";

const ZIP_TIMEOUT_MS = 15_000;
export type ZipResult =
  | { status: "ok"; zip: string; period: string; cityShare: number; mainPlace: string; population: Est | null; race: ZipRow[]; facts: ZipRow[] }
  | { status: "bad-zip" | "outside" | "unavailable"; zip: string }
  | { status: "busy" };

// Who lives in one ZIP area, live from the Census survey (spec 2026-10-14-zip-profile §5). Totals and shares only.
// Shares the City count's allowance. The survey years are the newest the stored city figures have, so they match.
export const zipProfile = action({
  args: { zip: v.string() },
  handler: async (ctx, { zip }): Promise<ZipResult> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Sign in to ask");
    const z = checkZip(zip);
    if (!z) return { status: "bad-zip", zip: zip.trim() };
    const area = COUNTY_ZIPS[z];
    if (!area) return { status: "outside", zip: z };
    if (!(await rateLimiter.limit(ctx, accountLimit("askCity", identity), { key: identity.tokenIdentifier })).ok) return { status: "busy" };
    const key = process.env.CENSUS_API_KEY;
    const city = await ctx.runQuery(internal.cityFigures.latestCityFigures, {});
    if (!key || !city) {
      console.error(`Census ZIP ${z} unavailable: ${!key ? "CENSUS_API_KEY is not set" : "no city figures stored"}`);
      return { status: "unavailable", zip: z };
    }
    try {
      const parts = await Promise.all(
        requestsFor().map(async (r) => {
          const res = await fetchWithTimeout(censusUrl(city.period, r.kind, r.codes, key, zctaGeo(z)), {}, ZIP_TIMEOUT_MS);
          if (!res.ok) throw new Error(`Census request failed: ${res.status}`);
          return parseCensus(await res.json(), r.codes);
        }),
      );
      const values: Record<string, Est> = Object.assign({}, ...parts);
      return { status: "ok", zip: z, period: `${city.period - 4}–${city.period}`, ...area, ...zipRows(values, city.values) };
    } catch (e) {
      console.error(`Census ZIP ${z} failed: ${scrubKey(e instanceof Error ? e.message : String(e))}`);
      return { status: "unavailable", zip: z };
    }
  },
});
