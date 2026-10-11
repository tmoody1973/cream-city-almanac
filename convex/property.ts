import { internal } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";
import { datastoreSql } from "./lib/ckan";
import {
  assessmentYear, EXACT, measureById, measureMenu, measureMeaning, measureSql, measureValues, MPROP_RID, parseCutoff, type Measure,
} from "./lib/propertyMeasures";
import type { TractValue } from "./lib/tractStats";
import type { Fam, Header, Refusal, Spend } from "./tracts";

// The property side of a tract tool (spec 2026-10-11 §6): H28 turns into exact per-tract figures. Owner and address
// columns can't be named here: the only columns are the measures.
export type PropertySide = { code: string; name: string; caveats: string[]; measure: Measure; cutoff?: number; meaning: string; year: string; rid: string; shapesUrl: string };
export const NO_PROPERTY = "no property figure: outside the City or fewer than 30 homes";
const DAY_MS = 24 * 3_600_000;
const yearOf = (s: string) => Number(s.match(/\d{4}/)?.[0] ?? 0);

// The property file when `code` names it, else null (the DYCU path takes it). Database only: free.
export async function propertySide(ctx: ActionCtx, code: string, column: string, cutoff?: number): Promise<PropertySide | Refusal | null> {
  const data = await ctx.runQuery(internal.city.countContext, { code: code.trim().toUpperCase() });
  if (!data?.profile || data.profile.resourceId !== MPROP_RID) return null;
  const measure = measureById(column);
  if (!measure) return { status: "choose-column", columns: measureMenu() };
  const c = measure.cutoff ? parseCutoff(cutoff) : undefined;
  if (c === null) return { status: "choose-column", columns: measureMenu(), reason: `${measure.id} needs a cutoff in whole dollars, from 1,000 to 10,000,000` };
  const year = assessmentYear(data.profile.categories);
  if (!year) return { status: "unavailable" };
  // A count has no DYCU dataset of its own; tract outlines come from E02's newest County layer.
  const e02: Fam | null = await ctx.runQuery(internal.tracts.familyForTracts, { code: "E02" });
  const county = (e02?.members ?? []).filter((m) => m.place === "County").sort((x, y) => yearOf(y.year) - yearOf(x.year));
  return {
    code: data.code, name: data.name, caveats: data.caveat ? [data.caveat] : [], measure, ...(c ? { cutoff: c } : {}),
    meaning: measureMeaning(measure, c ?? undefined), year, rid: data.profile.resourceId, shapesUrl: county[0]?.url ?? "",
  };
}

// The measure's per-tract figures, from the cache or the City (spends the person's tract budget first).
export async function loadProperty(ctx: ActionCtx, s: PropertySide, spend: Spend): Promise<{ values: TractValue[]; leftOut: number } | "busy" | null> {
  if (!(await spend())) return "busy";
  const key = `property:${s.rid}:${s.year}:${s.measure.id}:${s.cutoff ?? ""}`;
  try {
    const hit: string | null = await ctx.runQuery(internal.map.cached, { key, now: Date.now() });
    if (hit) return JSON.parse(hit) as { values: TractValue[]; leftOut: number };
  } catch (e) {
    console.error(`Property cache read failed for ${key}: ${e instanceof Error ? e.message : String(e)}`);
  }
  let rows: { t: unknown; v: unknown; n: unknown }[];
  try {
    rows = await datastoreSql(measureSql(s.rid, s.measure, s.year, s.cutoff));
  } catch (e) {
    console.error(`Property measure failed for ${key}: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
  const m = measureValues(rows);
  // An answer with no tract in it is the City failing quietly: say so, and don't remember it for a day.
  if (!m.values.length) {
    console.error(`Property measure returned no tracts for ${key}`);
    return null;
  }
  const loaded = { values: m.values, leftOut: m.thin + m.noTract };
  try {
    await ctx.runMutation(internal.map.remember, { key, result: JSON.stringify(loaded), expiresAt: Date.now() + DAY_MS });
  } catch (e) {
    console.error(`Property cache write failed for ${key}: ${e instanceof Error ? e.message : String(e)}`);
  }
  return loaded;
}

// Property figures cover the City only, whatever place was asked; the url gives the card its tract outlines.
export const propertyHead = (s: PropertySide, n: number, leftOut: number): Header => ({
  code: s.code, name: s.name, column: s.measure.id, meaning: s.meaning, kind: s.measure.kind, place: "City", year: `${s.year} assessment`,
  n, leftOut, leftOutWhy: "fewer than 30 homes, or no tract", confidence: EXACT, url: s.shapesUrl, caveats: s.caveats,
});
