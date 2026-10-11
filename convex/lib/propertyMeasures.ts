import { MPROP_RID } from "./cityProfile";
import { num } from "./citySql";
import type { TractValue } from "./tractStats";

// The City's Master Property File as one exact figure per census tract (docs/superpowers/specs/
// 2026-10-11-property-overlap-design.md §5). Pure: SQL text and row parsing. Only this file's fixed text, the profile's
// resource id and validated numbers enter the SQL; owner and address columns appear nowhere.
export { MPROP_RID };
export const MIN_HOMES = 30; // fewer homes than this and one house swings the tract's figure
export const EXACT = "exact (City records)";

export type MeasureId = "median_value" | "share_over" | "share_under" | "owner_share" | "median_year_built";
export type Measure = { id: MeasureId; name: string; meaning: string; kind: "rate" | "value"; cutoff: boolean };

export const MEASURES: Measure[] = [
  { id: "median_value", name: "Typical home value", meaning: "Median assessed value of homes (houses and condos)", kind: "value", cutoff: false },
  { id: "share_over", name: "Share of homes over a cutoff", meaning: "Percentage of homes (houses and condos) assessed over the cutoff", kind: "rate", cutoff: true },
  { id: "share_under", name: "Share of homes under a cutoff", meaning: "Percentage of homes (houses and condos) assessed under the cutoff", kind: "rate", cutoff: true },
  { id: "owner_share", name: "Owner-occupied share", meaning: "Percentage of homes (houses and condos) marked owner-occupied", kind: "rate", cutoff: false },
  { id: "median_year_built", name: "Typical year built", meaning: "Median year built of houses", kind: "value", cutoff: false },
];

export const measureById = (column: string): Measure | null => MEASURES.find((m) => m.id === column.trim().toLowerCase()) ?? null;

// What a choose-column refusal offers: the measures only, each marked as having a range (an exact one).
export const measureMenu = () =>
  MEASURES.map((m) => ({ column: m.id, meaning: m.cutoff ? `${m.meaning} (set cutoff, whole dollars)` : m.meaning, range: true as const }));

export const measureMeaning = (m: Measure, cutoff?: number) =>
  m.cutoff && cutoff ? m.meaning.replace("the cutoff", `$${cutoff.toLocaleString("en-US")}`) : m.meaning;

export const parseCutoff = (c: unknown): number | null =>
  typeof c === "number" && Number.isInteger(c) && c >= 1_000 && c <= 10_000_000 ? c : null;

const YEAR = /^\d{4}$/;
const RID = /^[0-9a-f-]{36}$/;

// The assessment year the file holds: its most common YR_ASSMT (a few retired parcels keep an older year).
export function assessmentYear(categories: { column: string; values: { value: string }[] }[]): string | null {
  const v = categories.find((c) => c.column === "YR_ASSMT")?.values[0]?.value ?? null;
  return v && YEAR.test(v) ? v : null;
}

export function measureSql(rid: string, m: Measure, year: string, cutoff?: number): string {
  if (!RID.test(rid)) throw new Error("Not a CKAN resource id");
  if (!YEAR.test(year)) throw new Error("Not an assessment year");
  const value = num("C_A_TOTAL");
  const from = `FROM "${rid}"`;
  const homes = `"C_A_CLASS" IN ('1', '5') AND ${value} > 0 AND "YR_ASSMT" = '${year}'`;
  const by = `GROUP BY "GEO_TRACT"`;
  const share = (when: string) => `SELECT "GEO_TRACT" AS t, 100.0 * SUM(CASE WHEN ${when} THEN 1 ELSE 0 END) / COUNT(*) AS v, COUNT(*) AS n ${from} WHERE ${homes} ${by}`;
  switch (m.id) {
    case "median_value":
      return `SELECT "GEO_TRACT" AS t, percentile_cont(0.5) WITHIN GROUP (ORDER BY ${value}) AS v, COUNT(*) AS n ${from} WHERE ${homes} ${by}`;
    case "share_over":
    case "share_under": {
      const c = parseCutoff(cutoff);
      if (c === null) throw new Error("A share needs a cutoff in whole dollars");
      return share(`${value} ${m.id === "share_over" ? ">" : "<"} ${c}`);
    }
    case "owner_share":
      return share(`"OWN_OCPD" = 'O'`);
    case "median_year_built": {
      const built = num("YR_BUILT"); // the City keeps year built for residential (class 1) parcels only
      return `SELECT "GEO_TRACT" AS t, percentile_disc(0.5) WITHIN GROUP (ORDER BY ${built}) AS v, COUNT(*) AS n ${from} WHERE "C_A_CLASS" = '1' AND ${value} > 0 AND "YR_ASSMT" = '${year}' AND ${built} >= 1800 ${by}`;
    }
  }
}

// GEO_TRACT holds the tract without leading zeros ("101" is 000101); DYCU's GEOID is Milwaukee County's 55079 + six digits.
export function tractGeoid(t: unknown): string | null {
  const s = String(t ?? "").trim();
  if (!/^\d{1,6}$/.test(s)) return null;
  const six = s.padStart(6, "0");
  return six === "000000" ? null : `55079${six}`;
}

export function measureValues(rows: { t: unknown; v: unknown; n: unknown }[]): { values: TractValue[]; thin: number; noTract: number } {
  const values: TractValue[] = [];
  let thin = 0, noTract = 0;
  for (const r of rows) {
    const geoid = tractGeoid(r.t);
    if (!geoid) { noTract++; continue; }
    const v = r.v === null || r.v === undefined || r.v === "" ? NaN : Number(r.v);
    if (!(Number(r.n) >= MIN_HOMES) || !Number.isFinite(v)) { thin++; continue; }
    values.push({ geoid, value: v, lo: v, hi: v, kind: "exact" });
  }
  return { values, thin, noTract };
}
