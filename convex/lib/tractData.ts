import { fetchWithTimeout } from "./http";
import type { TractValue } from "./tractStats";
import type { Column } from "./types";

export type RangeCols = { kind: "moe90"; moe: string } | { kind: "ci95"; lo: string; hi: string } | null;

const find = (names: string[], want: string) => names.find((n) => n.toLowerCase() === want.toLowerCase());

export function rangeColumns(column: string, fieldNames: string[]): RangeCols {
  const moe = find(fieldNames, `${column}_moe`);
  if (moe) return { kind: "moe90", moe };
  const lo = find(fieldNames, "Low_Confidence_Limit");
  const hi = find(fieldNames, "High_Confidence_Limit");
  return lo && hi ? { kind: "ci95", lo, hi } : null;
}

export function columnKind(name: string, meaning: string): "rate" | "count" | "value" {
  const s = `${name} ${meaning}`.toLowerCase();
  if (/rate|percent|pct|per_|share|prevalence|proportion/.test(s)) return "rate";
  if (/count|total|number|households|population|persons|people/.test(s)) return "count";
  return "value";
}

const NUMERIC = new Set(["Double", "Single", "Integer", "SmallInteger", "BigInteger"]);
export const isNumericField = (c: Column) => NUMERIC.has(c.type);

// Milwaukee County is 55079; a bare 6-digit tract gets the prefix. Anything else is not a tract id.
export function normalizeGeoid(x: unknown): string | null {
  if (x === null || x === undefined) return null;
  const s = String(x).trim();
  if (/^\d{11}$/.test(s)) return s;
  if (/^\d{6}$/.test(s)) return `55079${s}`;
  return null;
}

export const tractNumber = (geoid: string) => String(Number(geoid.slice(5)) / 100);

// Census "jam" values (−666666666, −222222222, …) mark estimates that couldn't be computed; they and blanks are left out.
const usable = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x) && x > -99999;

// A range is only drawn from sane limits: a margin is >= 0 (sentinels and negatives are not margins), a CDC interval has lo <= hi.
// Otherwise the tract keeps its value and gets no range, never a backwards one.
function rangeFor(a: Record<string, unknown>, value: number, range: RangeCols): Pick<TractValue, "lo" | "hi" | "kind"> {
  if (range?.kind === "moe90") {
    const m = a[range.moe];
    if (usable(m) && m >= 0) return { lo: value - m, hi: value + m, kind: "moe90" };
  } else if (range?.kind === "ci95") {
    const lo = a[range.lo], hi = a[range.hi];
    if (usable(lo) && usable(hi) && lo <= hi) return { lo, hi, kind: "ci95" };
  }
  return { lo: null, hi: null, kind: null };
}

export function parseRows(features: { attributes: Record<string, unknown> }[], column: string, range: RangeCols) {
  const values: TractValue[] = [];
  let leftOut = 0;
  for (const { attributes: a } of features) {
    const geoid = normalizeGeoid(a.GEOID ?? a.geoid);
    const value = a[column];
    if (!geoid || !usable(value)) { leftOut++; continue; }
    values.push({ geoid, value, ...rangeFor(a, value, range) });
  }
  return { values, leftOut };
}

const PAGE = 2000;
export const rowsUrl = (featureServerUrl: string, fields: string[], offset: number) =>
  `${featureServerUrl}/query?where=1%3D1&outFields=${encodeURIComponent(fields.join(","))}&returnGeometry=false&resultOffset=${offset}&resultRecordCount=${PAGE}&f=json`;

export async function fetchTractRows(featureServerUrl: string, column: string, range: RangeCols) {
  const fields = ["GEOID", column, ...(range?.kind === "moe90" ? [range.moe] : range?.kind === "ci95" ? [range.lo, range.hi] : [])];
  const features: { attributes: Record<string, unknown> }[] = [];
  for (let page = 0; page < 10; page++) {
    const res = await fetchWithTimeout(rowsUrl(featureServerUrl, fields, page * PAGE), {}, 30_000);
    if (!res.ok) throw new Error(`FeatureServer ${res.status} for ${featureServerUrl}`);
    const body = (await res.json()) as { features?: { attributes: Record<string, unknown> }[]; exceededTransferLimit?: boolean; error?: { message?: string } };
    if (body.error) throw new Error(`FeatureServer error: ${body.error.message ?? "unknown"}`);
    features.push(...(body.features ?? []));
    if (!body.exceededTransferLimit) break;
  }
  return parseRows(features, column, range);
}
