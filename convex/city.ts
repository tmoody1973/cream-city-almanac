import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { action, internalAction, internalQuery, type ActionCtx } from "./_generated/server";
import { chicagoDay } from "./lib/ask";
import { datastoreSql, datastoreSqlPage } from "./lib/ckan";
import { POINTS_CAP, rankGroups, tallyPoints } from "./lib/cityPoints";
import { toMapData, type MapData } from "./lib/cityMap";
import { EMPTY_FILE_NOTE, withOverrides } from "./lib/cityProfile";
import { CITY_MEASURES, MEASURE_FILES, measuresFor } from "./lib/cityMeasures";
import { buildCount, groupLabelFor, MAX_GROUPS } from "./lib/citySql";
import { buildMeasure } from "./lib/measureSql";
import { buildYearCount, buildYearMeasure } from "./lib/propertyYears";
import { forModel, shapeMeasure, type MeasureAll, type MeasureGroup, type MeasureOther } from "./lib/measureShape";
import type { Bbox, Geometry } from "./lib/geo";
import { matchName } from "./lib/neighborhoodNames";
import { MIN_HOMES, tractGeoid } from "./lib/propertyMeasures";
import { newestCountyUrl } from "./lib/tractPlaces";
import { rateLimiter } from "./limits";
import { MAP_TTL_MS, mapKey } from "./map";
import type { Fam } from "./tracts";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const vFilter = v.object({ column: v.string(), values: v.optional(v.array(v.string())), over: v.optional(v.number()), under: v.optional(v.number()) });
const MAX_TRACT_SHAPES = 50; // the tract cards' cap (ui/lib/tractShapes.ts)

// Named so the action below can type what it gets back (a function can't infer its own reference's result).
type CountContext = { code: string; key: string; name: string; city: boolean; topic: string; modified: string; profile: Doc<"cityProfiles"> | null; caveat: string | null } | null;

export const countContext = internalQuery({
  args: { code: v.string() },
  handler: async (ctx, { code }): Promise<CountContext> => {
    const family = await ctx.db.query("families").withIndex("by_code", (q) => q.eq("code", code)).first();
    if (!family) return null;
    const base = { code: family.code, key: family.key, name: family.name, city: family.source === "city", topic: family.topic, modified: family.latestModified };
    if (!base.city) return { ...base, profile: null, caveat: null };
    const profile = await ctx.db.query("cityProfiles").withIndex("by_family", (q) => q.eq("familyKey", family.key)).first();
    const card = await ctx.db.query("cards").withIndex("by_family", (q) => q.eq("familyKey", family.key)).first();
    return { ...base, profile: profile ? withOverrides(profile) : null, caveat: card?.caveats[0] ?? null };
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
      dateColumn: string | null; coverage: string | null; resourceName: string | null; files?: "only" | "current" | "archive" | "both"; note?: string | null; source?: string; latestYear?: string; namesPeople: boolean;
      area: string | null; noLocation: number; map: MapData | null; mapError?: true;
      of?: { count: number; label: string }; tractMap?: { url: string; ids: string[]; total: number };
    }
  | { status: "outside-coverage"; code: string; name: string; coverage: string; note?: string }
  | { status: "choose"; code: string; name: string; column: string; asked: string; choices: string[] }
  | { status: "bad-column"; code: string; name: string; column: string; columns: string[] }
  | { status: "bad-dates"; code: string; name: string; from: string; to: string; reason?: string }
  | { status: "no-neighborhood"; code: string; name: string; asked: string; nearest: string[] }
  | { status: "no-locations"; code: string; name: string }
  | { status: "too-broad"; code: string; name: string; area?: string }
  | { status: "not-found"; code: string }
  | { status: "not-city"; code: string; name: string }
  | { status: "not-live"; code: string; name: string; note?: string }
  | { status: "unavailable"; code: string; name: string }
  | { status: "busy" }
  | { status: "bad-input" }
  | {
      status: "measured"; code: string; name: string;
      measure: { id: string; name: string; unit: "dollars" | "dollars per hour"; caveat: string; column: string; things: string; summable: boolean; skipZero: boolean; namesPeople: boolean; date: string | null };
      groupBy: string | null; period: string; filters: string[]; groups: MeasureGroup[]; other: MeasureOther | null; all: MeasureAll; averageAsked: boolean; splits: string[]; source?: string; note?: string; latestYear?: string;
    }
  | { status: "no-measure"; code: string; name: string; files: string[] }
  | { status: "no-number-filter"; code: string; name: string; column: string }
  | { status: "choose-measure"; code: string; name: string; measures: { id: string; name: string }[] };

// Date groups arrive as "2026-08" (month) or "2026" (year) text; column groups are named like the profile names them.
const groupName = (label: string | null, g: unknown) => {
  const s = String(g ?? "");
  if (label === "year") return s.slice(0, 4);
  if (label === "month") return `${MONTHS[Number(s.slice(5, 7)) - 1]} ${s.slice(0, 4)}`;
  return label ? groupLabelFor(label, s) : s;
};

// Counts City records live. Arguments are checked against the dataset's profile (convex/lib/citySql.ts); returns
// counts only, never rows.
export type CountInput = { code: string; neighborhood?: string; from?: string; to?: string; filters?: { column: string; values?: string[]; over?: number; under?: number }[]; groupBy?: string; years?: { from: number; to: number } };

export const countRecords = action({
  args: { code: v.string(), neighborhood: v.optional(v.string()), from: v.optional(v.string()), to: v.optional(v.string()), filters: v.optional(v.array(vFilter)), groupBy: v.optional(v.string()), years: v.optional(v.object({ from: v.number(), to: v.number() })), measure: v.optional(v.object({ id: v.string(), average: v.optional(v.boolean()) })) },
  handler: async (ctx, args): Promise<CountResult> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Sign in to ask");
    if (!(await rateLimiter.limit(ctx, "askCity", { key: identity.tokenIdentifier })).ok) return { status: "busy" as const };
    if (args.measure) return runMeasure(ctx, { ...args, measure: args.measure });
    const result = await runCount(ctx, args);
    // Ask's card draws this map by calling api.map.mapCells with the same arguments; leave the answer where that
    // call looks, so the cells never ride in the conversation and the card's fetch is a free cache hit. Groups don't
    // change the cells, so a grouped count is stored as the ungrouped question the card asks.
    if (result.status === "ok" && result.map) {
      const { groupBy: _groupBy, ...where } = args;
      const { key } = await mapKey(where);
      await ctx.runMutation(internal.map.remember, { key, result: JSON.stringify({ ...result, groups: [], other: 0, otherLabel: null }), expiresAt: Date.now() + MAP_TTL_MS });
    }
    return result;
  },
});

// Everything a count does after sign-in and the rate limit; the public map action reuses it.
export async function runCount(ctx: ActionCtx, input: CountInput): Promise<CountResult> {
  const plan = await planCount(ctx, input);
  return "status" in plan ? plan : askCity(ctx, plan);
}

// A total / median / average of one approved money column (spec 2026-10-12-city-measures-design.md §6). Same gate and
// file lookup as counts; never rows, and small groups hidden in files that name people.
export async function runMeasure(ctx: ActionCtx, { code, neighborhood, measure, ...args }: CountInput & { measure: { id: string; average?: boolean } }): Promise<CountResult> {
  const wanted = code.trim().toUpperCase();
  const data: CountContext = await ctx.runQuery(internal.city.countContext, { code: wanted });
  if (!data) return { status: "not-found" as const, code: wanted };
  const { name, profile } = data;
  if (!data.city) return { status: "not-city" as const, code: data.code, name };
  if (data.topic === "Elections") return { status: "not-live" as const, code: data.code, name, note: ELECTIONS_NOTE };
  if (!profile) return { status: "not-live" as const, code: data.code, name };
  if (profile.rowCount === 0) return { status: "not-live" as const, code: data.code, name, note: EMPTY_FILE_NOTE };
  const options = measuresFor(data.key);
  if (!options.length) return { status: "no-measure" as const, code: data.code, name, files: MEASURE_FILES };
  const m = options.find((x) => x.id === measure.id.trim());
  if (!m) return { status: "choose-measure" as const, code: data.code, name, measures: options.map(({ id, name: label }) => ({ id, name: label })) };
  if (neighborhood?.trim()) return { status: "no-locations" as const, code: data.code, name };
  const amount = args.filters?.find((f) => f.over !== undefined || f.under !== undefined);
  if (amount) return { status: "no-number-filter" as const, code: data.code, name, column: amount.column };
  const filters = args.filters?.map(({ column, values }) => ({ column, values }));
  const built = args.years ? buildYearMeasure(profile, m, { ...args, years: args.years, filters }) : buildMeasure(profile, m, { ...args, filters }, chicagoDay(Date.now()));
  if (!built.ok) {
    const { ok: _ok, ...refusal } = built;
    return { ...refusal, code: data.code, name };
  }
  try {
    const [groupRows, allRows] = await Promise.all([
      built.groupSql ? datastoreSql<Record<string, unknown>>(built.groupSql, built.timeoutMs) : Promise.resolve(null),
      datastoreSql<Record<string, unknown>>(built.allSql, built.timeoutMs),
    ]);
    // Across assessment years the headline is the newest year (its group row); unreadable and $0 counts cover every year.
    const span = allRows[0] ?? {};
    const newest = built.latestYear ? groupRows?.find((r) => String(r.g) === built.latestYear) ?? { n: 0, total: null, median: null, average: null } : null;
    const all = newest ? { ...newest, unreadable: span.unreadable, zeros: span.zeros } : span;
    const shaped = forModel(shapeMeasure(groupRows, all, { namesPeople: m.namesPeople, byYear: built.groupLabel === "year" }), { summable: m.summable, average: Boolean(measure.average) });
    return {
      status: "measured" as const, code: data.code, name,
      measure: { id: m.id, name: m.name, unit: m.unit, caveat: m.caveat, column: m.column, things: m.things, summable: m.summable, skipZero: m.skipZero, namesPeople: m.namesPeople, date: m.date },
      groupBy: built.groupLabel, period: built.period, filters: built.filterLabels, ...shaped,
      averageAsked: Boolean(measure.average), splits: [...m.splits, ...(m.date || args.years ? ["year"] : [])],
      ...(built.source ? { source: built.source } : {}), ...(built.note ? { note: built.note } : {}), ...(built.latestYear ? { latestYear: built.latestYear } : {}),
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`City measure failed for ${data.code}: ${message}`);
    return /Timed out/.test(message) ? { status: "too-broad" as const, code: data.code, name } : { status: "unavailable" as const, code: data.code, name };
  }
}

type Plan = { data: NonNullable<CountContext>; profile: Doc<"cityProfiles">; found: Extract<Found, { kind: "one" }> | null; built: Extract<ReturnType<typeof buildCount>, { ok: true }> };

// The checks that need no City query (unknown code, bad column or dates, unknown neighborhood, …): a refusal, or
// a plan ready to send. The public map spends its City budget only on a plan.
export async function planCount(ctx: ActionCtx, { code, neighborhood, ...args }: CountInput): Promise<CountResult | Plan> {
  const wanted = code.trim().toUpperCase();
  const data: CountContext = await ctx.runQuery(internal.city.countContext, { code: wanted });
  if (!data) return { status: "not-found" as const, code: wanted };
  const { name, profile } = data;
  if (!data.city) return { status: "not-city" as const, code: data.code, name };
  if (data.topic === "Elections") return { status: "not-live" as const, code: data.code, name, note: ELECTIONS_NOTE };
  if (!profile) return { status: "not-live" as const, code: data.code, name };
  if (profile.rowCount === 0) return { status: "not-live" as const, code: data.code, name, note: EMPTY_FILE_NOTE };
  // Assessment years (spec 2026-10-13-property-history-design §5): their own builder; no neighborhoods or maps.
  if (args.years) {
    if (neighborhood?.trim()) return { status: "no-locations" as const, code: data.code, name };
    const built = buildYearCount(profile, { ...args, years: args.years });
    if (!built.ok) {
      const { ok: _ok, ...refusal } = built;
      return { ...refusal, code: data.code, name };
    }
    return { data, profile, found: null, built };
  }
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
  return { data, profile, found, built };
}

export async function askCity(ctx: ActionCtx, { data, profile, found, built }: Plan): Promise<CountResult> {
  const { name } = data;
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
        caveat: data.caveat, dateColumn: built.dateColumn, coverage: built.coverage, resourceName: profile.resourceName ?? null, files: built.files, note: built.note, namesPeople: profile.namesPeople,
        area, noLocation: cityCount(missing), map: toMapData(tally.cells, found.name),
      };
    }
    const [total] = await datastoreSql<{ n: string }>(built.totalSql, built.timeoutMs);
    const count = cityCount(total);
    const rows = built.groupSql ? await datastoreSql<{ g: unknown; n: string }>(built.groupSql, built.timeoutMs) : [];
    const byDate = built.groupLabel === "month" || built.groupLabel === "year";
    // Date groups come newest first (so a cap keeps the recent months); show them oldest to newest.
    const groups = (byDate ? [...rows].reverse() : rows).map((r) => ({ label: groupName(built.groupLabel, r.g), count: cityCount(r) }));
    const [future] = built.futureSql ? await datastoreSql<{ n: string }>(built.futureSql) : [{ n: "0" }];
    const futureExcluded = cityCount(future);
    const of = built.ofSql ? { count: cityCount((await datastoreSql<{ n: string }>(built.ofSql, built.timeoutMs))[0]), label: "with an assessed value" } : undefined;
    let tractMap: { url: string; ids: string[]; total: number } | undefined;
    if (built.tractSql) {
      // Its own try: a failed tract query loses the map, never the count.
      try {
        const rows = await datastoreSql<{ t: unknown; hit: unknown; n: unknown }>(built.tractSql);
        const most = rows
          .map((r) => ({ id: tractGeoid(r.t), hit: Number(r.hit), n: Number(r.n) }))
          .filter((r): r is { id: string; hit: number; n: number } => r.id !== null && r.n >= MIN_HOMES && r.hit / r.n > 0.5)
          .sort((x, y) => y.hit / y.n - x.hit / x.n);
        const e02: Fam | null = await ctx.runQuery(internal.tracts.familyForTracts, { code: "E02" });
        const url = newestCountyUrl(e02?.members ?? []);
        if (url) tractMap = { url, ids: most.slice(0, MAX_TRACT_SHAPES).map((r) => r.id), total: most.length };
      } catch (e) {
        console.error(`City tract shares failed for ${data.code}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    let map: MapData | null = null;
    if (built.gridSql) {
      // The map has its own try: a failed grid query loses the map, never the count.
      try {
        const page = await datastoreSqlPage<{ i: unknown; j: unknown; n: unknown }>(built.gridSql);
        // Rows missing a cell or count are skipped, so a malformed City row can't draw a NaN cell.
        // A cut-off grid would under-draw the map; leave it out rather than draw part of it.
        if (!page.truncated && page.records.length < POINTS_CAP) map = toMapData(new Map(page.records.filter((c) => [c.i, c.j, c.n].every((x) => Number.isFinite(Number(x)))).map((c) => [`${Number(c.i)},${Number(c.j)}`, Number(c.n)])), null);
      } catch (e) {
        console.error(`City map grid failed for ${data.code}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    const shown = groups.reduce((s, g) => s + g.count, 0);
    // Overlapping groups (an incident with two offenses is in both) can't be summed, so no remainder is shown.
    const capped = rows.length === MAX_GROUPS && !built.overlap;
    return {
      status: "ok" as const, code: data.code, name, count, groups,
      other: capped ? Math.max(0, count - shown) : 0,
      otherLabel: capped ? (byDate ? "Earlier" : "Other") : null, overlap: built.overlap,
      period: built.period, filters: built.filterLabels, futureExcluded,
      caveat: data.caveat, dateColumn: built.dateColumn, coverage: built.coverage, resourceName: profile.resourceName ?? null, files: built.files, note: built.note, namesPeople: profile.namesPeople,
      ...(built.source ? { source: built.source } : {}), ...(built.latestYear ? { latestYear: built.latestYear } : {}),
      area: null, noLocation: 0, map,
      ...(of ? { of } : {}), ...(tractMap ? { tractMap } : {}),
      // The dataset records locations but this count has no map (the grid failed or was cut off): not "no locations".
      ...(built.gridSql && !map ? { mapError: true as const } : {}),
    };
  } catch (e) {
    console.error(`City count failed for ${data.code}: ${e instanceof Error ? e.message : String(e)}`);
    return { status: "unavailable" as const, code: data.code, name };
  }
}

// The live check before a release: every approved measure, whole file, against the City's server. Read-only.
// Run with `npx convex run city:checkMeasures` (add --prod for the live site).
export const checkMeasures = internalAction({
  args: {},
  handler: async (ctx): Promise<{ id: string; ok: boolean; error?: string; all?: MeasureAll }[]> => {
    const out: { id: string; ok: boolean; error?: string; all?: MeasureAll }[] = [];
    for (const m of CITY_MEASURES) {
      const raw = await ctx.runQuery(internal.spans.profileFor, { familyKey: m.familyKey });
      if (!raw) { out.push({ id: m.id, ok: false, error: "no profile" }); continue; }
      const built = buildMeasure(withOverrides(raw), m, {}, chicagoDay(Date.now()));
      if (!built.ok) { out.push({ id: m.id, ok: false, error: built.status }); continue; }
      try {
        const rows = await datastoreSql<Record<string, unknown>>(built.allSql);
        out.push({ id: m.id, ok: true, all: shapeMeasure(null, rows[0], { namesPeople: m.namesPeople, byYear: false }).all });
      } catch (e) {
        out.push({ id: m.id, ok: false, error: e instanceof Error ? e.message : String(e) });
      }
    }
    return out;
  },
});
