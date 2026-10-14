import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalAction, internalQuery } from "./_generated/server";
import { chicagoDay } from "./lib/ask";
import { EMPTY_FILE_NOTE } from "./lib/cityProfile";
import { datastoreSql } from "./lib/ckan";
import { buildSpan, SPAN_QUERY_TIMEOUT_MS } from "./lib/spanSql";
import { pairEnd, pairsFor, SPAN_PAIRS, type SpanPair } from "./lib/spanPairs";
import { shapeSpan, type SpanAll, type SpanGroup } from "./lib/spanShape";
import { rateLimiter } from "./limits";

type PairOut = Omit<SpanPair, "familyKey" | "file">;
export type SpanResult =
  | { status: "ok"; code: string; name: string; pair: PairOut; asOf: string | null; groupBy: string | null; overlap: boolean; period: string; filters: string[]; coverage: string | null; columns: string[]; groups: SpanGroup[]; other: number; all: SpanAll }
  | { status: "not-found"; code: string }
  | { status: "not-city" | "too-broad" | "unavailable"; code: string; name: string }
  | { status: "not-live"; code: string; name: string; note?: string }
  | { status: "no-pair"; code: string; name: string; files: string[] }
  | { status: "choose-pair"; code: string; name: string; pairs: { id: string; name: string; from: string; to: string }[] }
  | { status: "bad-column"; code: string; name: string; column: string; columns: string[] }
  | { status: "choose"; code: string; name: string; column: string; asked: string; choices: string[] }
  | { status: "bad-dates"; code: string; name: string; from: string; to: string }
  | { status: "outside-coverage"; code: string; name: string; coverage: string }
  | { status: "busy" };

const vFilter = v.object({ column: v.string(), values: v.optional(v.array(v.string())) });
const FILES = [...new Set(SPAN_PAIRS.map((p) => p.file))];

// How long things take between an approved pair's two dates, live on the City's server (spec 2026-10-12 §6).
// Returns totals per group only, never rows. Shares the City count's allowance.
export const timeSpan = action({
  args: { code: v.string(), pair: v.optional(v.string()), groupBy: v.optional(v.string()), from: v.optional(v.string()), to: v.optional(v.string()), filters: v.optional(v.array(vFilter)) },
  handler: async (ctx, { code, pair: asked, ...args }): Promise<SpanResult> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Sign in to ask");
    if (!(await rateLimiter.limit(ctx, "askCity", { key: identity.tokenIdentifier })).ok) return { status: "busy" };
    const wanted = code.trim().toUpperCase();
    const data = await ctx.runQuery(internal.city.countContext, { code: wanted });
    if (!data) return { status: "not-found", code: wanted };
    const { name } = data;
    if (!data.city) return { status: "not-city", code: data.code, name };
    if (!data.profile) return { status: "not-live", code: data.code, name };
    if (data.profile.rowCount === 0) return { status: "not-live", code: data.code, name, note: EMPTY_FILE_NOTE };
    const pairs = pairsFor(data.key);
    if (!pairs.length) return { status: "no-pair", code: data.code, name, files: FILES };
    const pair = asked ? pairs.find((p) => p.id === asked.trim()) : pairs.length === 1 ? pairs[0] : undefined;
    if (!pair) return { status: "choose-pair", code: data.code, name, pairs: pairs.map((p) => ({ id: p.id, name: p.name, from: p.from, to: pairEnd(p) })) };
    const asOf = asOfDay(pair, data.modified, Date.now());
    const built = buildSpan(data.profile, pair, args, chicagoDay(Date.now()), asOf ?? undefined);
    if (!built.ok) {
      const { ok: _ok, ...refusal } = built;
      return { ...refusal, code: data.code, name };
    }
    try {
      const [groupRows, allRows] = await Promise.all([
        built.groupSql ? datastoreSql<Record<string, unknown>>(built.groupSql, SPAN_QUERY_TIMEOUT_MS) : Promise.resolve(null),
        datastoreSql<Record<string, unknown>>(built.allSql, SPAN_QUERY_TIMEOUT_MS),
      ]);
      const shaped = shapeSpan(groupRows, allRows[0], built.overlap, built.groupLabel === "year");
      const { familyKey: _k, file: _f, ...out } = pair;
      return { status: "ok", code: data.code, name, pair: out, asOf, groupBy: built.groupLabel, overlap: built.overlap, period: built.period, filters: built.filterLabels, coverage: built.coverage, columns: built.columns, ...shaped };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error(`City time span failed for ${data.code}: ${message}`);
      return { status: /Timed out/.test(message) ? "too-broad" : "unavailable", code: data.code, name };
    }
  },
});

// The day an age is measured to (spec §6): today, or the day the City last updated the file; a between pair has none.
export function asOfDay(pair: SpanPair, modified: string | undefined, now: number): string | null {
  if (pair.kind !== "age") return null;
  const day = modified?.slice(0, 10);
  return pair.asOf === "file" && day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : chicagoDay(now);
}

export const modifiedFor = internalQuery({
  args: { familyKey: v.string() },
  handler: async (ctx, { familyKey }): Promise<string | null> => (await ctx.db.query("families").withIndex("by_key", (q) => q.eq("key", familyKey)).first())?.latestModified ?? null,
});

export const profileFor = internalQuery({
  args: { familyKey: v.string() },
  handler: (ctx, { familyKey }) => ctx.db.query("cityProfiles").withIndex("by_family", (q) => q.eq("familyKey", familyKey)).first(),
});

// The live check before a release (spec §9): every approved pair, measured whole, against the City's server.
// Read-only. Run with `npx convex run spans:checkPairs` (add --prod for the live site).
export const checkPairs = internalAction({
  args: {},
  handler: async (ctx): Promise<{ id: string; ok: boolean; error?: string; all?: SpanAll }[]> => {
    const out: { id: string; ok: boolean; error?: string; all?: SpanAll }[] = [];
    for (const pair of SPAN_PAIRS) {
      const profile = await ctx.runQuery(internal.spans.profileFor, { familyKey: pair.familyKey });
      if (!profile) { out.push({ id: pair.id, ok: false, error: "no profile" }); continue; }
      const modified = await ctx.runQuery(internal.spans.modifiedFor, { familyKey: pair.familyKey });
      const built = buildSpan(profile, pair, {}, chicagoDay(Date.now()), asOfDay(pair, modified ?? undefined, Date.now()) ?? undefined);
      if (!built.ok) { out.push({ id: pair.id, ok: false, error: built.status }); continue; }
      try {
        const rows = await datastoreSql<Record<string, unknown>>(built.allSql, SPAN_QUERY_TIMEOUT_MS);
        out.push({ id: pair.id, ok: true, all: shapeSpan(null, rows[0], false, false).all });
      } catch (e) {
        out.push({ id: pair.id, ok: false, error: e instanceof Error ? e.message : String(e) });
      }
    }
    return out;
  },
});
