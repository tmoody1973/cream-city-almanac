import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { action, internalQuery, type ActionCtx } from "./_generated/server";
import { chicagoDay } from "./lib/ask";
import { datastoreSql, datastoreSqlPage } from "./lib/ckan";
import { POINTS_CAP, rankGroups, tallyPoints } from "./lib/cityPoints";
import { toMapData, type MapData } from "./lib/cityMap";
import { buildCount, groupLabelFor, MAX_GROUPS } from "./lib/citySql";
import type { Bbox, Geometry } from "./lib/geo";
import { matchName } from "./lib/neighborhoodNames";
import { rateLimiter } from "./limits";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const vFilter = v.object({ column: v.string(), values: v.array(v.string()) });

// Named so the action below can type what it gets back (a function can't infer its own reference's result).
type CountContext = { code: string; name: string; city: boolean; topic: string; profile: Doc<"cityProfiles"> | null; caveat: string | null } | null;

export const countContext = internalQuery({
  args: { code: v.string() },
  handler: async (ctx, { code }): Promise<CountContext> => {
    const family = await ctx.db.query("families").withIndex("by_code", (q) => q.eq("code", code)).first();
    if (!family) return null;
    const base = { code: family.code, name: family.name, city: family.source === "city", topic: family.topic };
    if (!base.city) return { ...base, profile: null, caveat: null };
    const profile = await ctx.db.query("cityProfiles").withIndex("by_family", (q) => q.eq("familyKey", family.key)).first();
    const card = await ctx.db.query("cards").withIndex("by_family", (q) => q.eq("familyKey", family.key)).first();
    return { ...base, profile, caveat: card?.caveats[0] ?? null };
  },
});

type Found =
  | { kind: "one"; name: string; geometry: string; bbox: Bbox }
  | { kind: "choose"; names: string[] }
  | { kind: "none"; nearest: string[] }
  | { kind: "empty" };

// The City's official boundary for a typed name: one match, a short choice, or none (never a guess).
export const findNeighborhood = internalQuery({
  args: { asked: v.string() },
  handler: async (ctx, { asked }): Promise<Found> => {
    const rows = await ctx.db.query("neighborhoods").withIndex("by_definition_matchKey", (q) => q.eq("definition", "city")).collect();
    if (rows.length === 0) return { kind: "empty" };
    const m = matchName(asked, rows);
    if (m.kind !== "one") return m;
    return { kind: "one", name: m.row.name, geometry: m.row.geometry!, bbox: m.row.bbox! };
  },
});

// An election file's rows are wards with vote totals: a "count" there would be a count of wards.
const ELECTIONS_NOTE = "Election results list wards and vote totals, not records to count.";

// A count the City returned, or a throw (so the card says "unavailable", never a made-up 0).
function cityCount(row: { n?: unknown } | undefined): number {
  const raw = row?.n;
  const n = raw === null || raw === undefined || String(raw).trim() === "" ? NaN : Number(raw);
  if (!Number.isFinite(n)) throw new Error(`City returned no usable count: ${JSON.stringify(row ?? null)}`);
  return n;
}

export type CountResult =
  | {
      status: "ok"; code: string; name: string; count: number; groups: { label: string; count: number }[]; other: number; otherLabel: "Earlier" | "Other" | null;
      overlap: boolean; period: string; filters: string[]; futureExcluded: number; caveat: string | null;
      dateColumn: string | null; coverage: string | null; resourceName: string | null; namesPeople: boolean;
      area: string | null; noLocation: number; map: MapData | null;
    }
  | { status: "outside-coverage"; code: string; name: string; coverage: string }
  | { status: "choose"; code: string; name: string; column: string; asked: string; choices: string[] }
  | { status: "bad-column"; code: string; name: string; column: string; columns: string[] }
  | { status: "bad-dates"; code: string; name: string; from: string; to: string }
  | { status: "no-neighborhood"; code: string; name: string; asked: string; nearest: string[] }
  | { status: "no-locations"; code: string; name: string }
  | { status: "too-broad"; code: string; name: string; area: string }
  | { status: "not-found"; code: string }
  | { status: "not-city"; code: string; name: string }
  | { status: "not-live"; code: string; name: string; note?: string }
  | { status: "unavailable"; code: string; name: string }
  | { status: "busy" };

// Date groups arrive as "2026-08" (month) or "2026" (year) text; column groups are named like the profile names them.
const groupName = (label: string | null, g: unknown) => {
  const s = String(g ?? "");
  if (label === "year") return s.slice(0, 4);
  if (label === "month") return `${MONTHS[Number(s.slice(5, 7)) - 1]} ${s.slice(0, 4)}`;
  return label ? groupLabelFor(label, s) : s;
};

// Counts City records live. Arguments are checked against the dataset's profile (convex/lib/citySql.ts); returns
// counts only, never rows.
export type CountInput = { code: string; neighborhood?: string; from?: string; to?: string; filters?: { column: string; values: string[] }[]; groupBy?: string };

export const countRecords = action({
  args: { code: v.string(), neighborhood: v.optional(v.string()), from: v.optional(v.string()), to: v.optional(v.string()), filters: v.optional(v.array(vFilter)), groupBy: v.optional(v.string()) },
  handler: async (ctx, args): Promise<CountResult> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Sign in to ask");
    if (!(await rateLimiter.limit(ctx, "askCity", { key: identity.tokenIdentifier })).ok) return { status: "busy" as const };
    return runCount(ctx, args);
  },
});

// Everything a count does after sign-in and the rate limit; the public map action reuses it.
export async function runCount(ctx: ActionCtx, { code, neighborhood, ...args }: CountInput): Promise<CountResult> {
  const wanted = code.trim().toUpperCase();
  const data: CountContext = await ctx.runQuery(internal.city.countContext, { code: wanted });
  if (!data) return { status: "not-found" as const, code: wanted };
  const { name, profile } = data;
  if (!data.city) return { status: "not-city" as const, code: data.code, name };
  if (data.topic === "Elections") return { status: "not-live" as const, code: data.code, name, note: ELECTIONS_NOTE };
  if (!profile || profile.rowCount === 0) return { status: "not-live" as const, code: data.code, name };
  let found: Extract<Found, { kind: "one" }> | null = null;
  if (neighborhood?.trim()) {
    const f: Found = await ctx.runQuery(internal.city.findNeighborhood, { asked: neighborhood });
    if (f.kind === "empty") return { status: "unavailable" as const, code: data.code, name };
    if (f.kind === "choose") return { status: "choose" as const, code: data.code, name, column: "neighborhood", asked: neighborhood, choices: f.names };
    if (f.kind === "none") return { status: "no-neighborhood" as const, code: data.code, name, asked: neighborhood, nearest: f.nearest };
    found = f;
  }
  const built = buildCount(profile, args, chicagoDay(Date.now()), found?.bbox);
  if (!built.ok) {
    const { ok: _ok, ...refusal } = built;
    return { ...refusal, code: data.code, name };
  }
  // A named neighborhood must never fall through to the citywide count (e.g. its boundary row has no rectangle).
  if (found && !built.points) return { status: "unavailable" as const, code: data.code, name };
  try {
    if (found && built.points) {
      const area = `${found.name} (City of Milwaukee boundary)`;
      // The City's own flag says its row limit cut the page, whatever our cap is.
      const { records: rows, truncated } = await datastoreSqlPage<{ lat: unknown; lon: unknown; g?: unknown }>(built.points.sql);
      if (truncated || rows.length >= POINTS_CAP) return { status: "too-broad" as const, code: data.code, name, area };
      const [missing] = await datastoreSql<{ n: string }>(built.points.missingSql);
      const byDate = built.groupLabel === "month" || built.groupLabel === "year";
      const tally = tallyPoints(rows, JSON.parse(found.geometry) as Geometry, built.overlap);
      const ranked = rankGroups(tally.groups, byDate, built.overlap, MAX_GROUPS);
      return {
        status: "ok" as const, code: data.code, name, count: tally.count,
        groups: built.groupLabel ? ranked.top.map(([g, n]) => ({ label: groupName(built.groupLabel, g), count: n })) : [],
        other: ranked.other, otherLabel: ranked.capped ? (byDate ? "Earlier" : "Other") : null, overlap: built.overlap,
        period: built.period, filters: built.filterLabels, futureExcluded: 0,
        caveat: data.caveat, dateColumn: built.dateColumn, coverage: built.coverage, resourceName: profile.resourceName ?? null, namesPeople: profile.namesPeople,
        area, noLocation: cityCount(missing), map: toMapData(tally.cells, found.name),
      };
    }
    const [total] = await datastoreSql<{ n: string }>(built.totalSql);
    const count = cityCount(total);
    const rows = built.groupSql ? await datastoreSql<{ g: unknown; n: string }>(built.groupSql) : [];
    const byDate = built.groupLabel === "month" || built.groupLabel === "year";
    // Date groups come newest first (so a cap keeps the recent months); show them oldest to newest.
    const groups = (byDate ? [...rows].reverse() : rows).map((r) => ({ label: groupName(built.groupLabel, r.g), count: cityCount(r) }));
    const [future] = built.futureSql ? await datastoreSql<{ n: string }>(built.futureSql) : [{ n: "0" }];
    const futureExcluded = cityCount(future);
    let map: MapData | null = null;
    if (built.gridSql) {
      const page = await datastoreSqlPage<{ i: unknown; j: unknown; n: unknown }>(built.gridSql);
      // A cut-off grid would under-draw the map; leave it out rather than draw part of it.
      if (!page.truncated && page.records.length < POINTS_CAP) map = toMapData(new Map(page.records.map((c) => [`${Number(c.i)},${Number(c.j)}`, Number(c.n)])), null);
    }
    const shown = groups.reduce((s, g) => s + g.count, 0);
    // Overlapping groups (an incident with two offenses is in both) can't be summed, so no remainder is shown.
    const capped = rows.length === MAX_GROUPS && !built.overlap;
    return {
      status: "ok" as const, code: data.code, name, count, groups,
      other: capped ? Math.max(0, count - shown) : 0,
      otherLabel: capped ? (byDate ? "Earlier" : "Other") : null, overlap: built.overlap,
      period: built.period, filters: built.filterLabels, futureExcluded,
      caveat: data.caveat, dateColumn: built.dateColumn, coverage: built.coverage, resourceName: profile.resourceName ?? null, namesPeople: profile.namesPeople,
      area: null, noLocation: 0, map,
    };
  } catch (e) {
    console.error(`City count failed for ${data.code}: ${e instanceof Error ? e.message : String(e)}`);
    return { status: "unavailable" as const, code: data.code, name };
  }
}
