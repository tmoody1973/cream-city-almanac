import { fetchWithTimeout } from "./http";
import type { TractValue } from "./tractStats";
import type { Column } from "./types";

export type RangeCols = { kind: "moe90"; moe: string } | { kind: "ci95"; lo: string; hi: string } | null;

const find = (names: string[], want: string) => names.find((n) => n.toLowerCase() === want.toLowerCase());

type Glossary = { field: string; meaning: string }[];

// The question a definition asks, minus its "Estimate - " / "Margin of Error - " lead and any "Calculation:" tail.
const question = (meaning: string, lead: RegExp) => {
  const m = meaning.replace(/^\s+/, "");
  return lead.test(m) ? m.replace(lead, "").split(/\s+calculation:/i)[0].toLowerCase().replace(/\s+/g, " ").trim() : null;
};

export function rangeColumns(column: string, fieldNames: string[], glossary: Glossary = []): RangeCols {
  const moe = find(fieldNames, `${column}_moe`);
  if (moe) return { kind: "moe90", moe };
  const meaning = glossary.find((g) => g.field.toLowerCase() === column.toLowerCase())?.meaning ?? "";
  const x = question(meaning, /^estimate - /i);
  if (x) {
    for (const g of glossary) {
      const field = find(fieldNames, g.field);
      if (field && question(g.meaning, /^margin of error - /i) === x) return { kind: "moe90", moe: field };
    }
  }
  const lo = find(fieldNames, "Low_Confidence_Limit") ?? find(fieldNames, "Low_Confidence");
  const hi = find(fieldNames, "High_Confidence_Limit") ?? find(fieldNames, "High_Confidence");
  return lo && hi ? { kind: "ci95", lo, hi } : null;
}

// Decided from DYCU's own wording: medians, averages and indexes are values; "rate/percent/share" are rates; a count says
// "number of" or "total" at the start of its definition. Whole words only, so "moderate" is not a rate.
export function columnKind(name: string, meaning: string): "rate" | "count" | "value" {
  const s = `${name} ${meaning}`.toLowerCase().replace(/_/g, " ");
  if (/median|average|\bmean\b|index|score/.test(s)) return "value";
  if (/\brate\b|percent|percentage|\bpct\b|share|prevalence|proportion/.test(s) || /^per_/i.test(name)) return "rate";
  const lead = meaning.trim().toLowerCase().replace(/^estimate - /, "");
  if (/^(number|total)/.test(lead) || /^(households|population|total)/i.test(name)) return "count";
  return "value";
}

const NUMERIC = new Set(["Double", "Single", "Integer", "SmallInteger", "BigInteger"]);
export const isNumericField = (c: Column) => NUMERIC.has(c.type);

// Milwaukee County is 55079; a bare 6-digit tract gets the prefix. Anything else (other counties too) is not a tract id.
export function normalizeGeoid(x: unknown): string | null {
  if (x === null || x === undefined) return null;
  const s = String(x).trim();
  if (/^55079\d{6}$/.test(s)) return s;
  if (/^\d{6}$/.test(s)) return `55079${s}`;
  return null;
}

export const tractNumber = (geoid: string) => String(Number(geoid.slice(5)) / 100);

// Census "jam" values (−666666666, −222222222, …) mark estimates that couldn't be computed; they and blanks are left out.
const usable = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x) && x > -99999;

// A range is only drawn from sane limits: a margin is >= 0 (sentinels and negatives are not margins), a CDC interval has lo <= value <= hi.
// Otherwise the tract keeps its value and gets no range, never a backwards one.
function rangeFor(a: Record<string, unknown>, value: number, range: RangeCols): Pick<TractValue, "lo" | "hi" | "kind"> {
  if (range?.kind === "moe90") {
    const m = a[range.moe];
    if (usable(m) && m >= 0) return { lo: value - m, hi: value + m, kind: "moe90" };
  } else if (range?.kind === "ci95") {
    const lo = a[range.lo], hi = a[range.hi];
    if (usable(lo) && usable(hi) && lo <= value && value <= hi) return { lo, hi, kind: "ci95" };
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
const MAX_PAGES = 10;
export const rowsUrl = (featureServerUrl: string, fields: string[], offset: number) =>
  `${featureServerUrl}/query?where=1%3D1&outFields=${encodeURIComponent(fields.join(","))}&returnGeometry=false&resultOffset=${offset}&resultRecordCount=${PAGE}&f=json`;

export async function fetchTractRows(featureServerUrl: string, column: string, range: RangeCols) {
  const fields = ["GEOID", column, ...(range?.kind === "moe90" ? [range.moe] : range?.kind === "ci95" ? [range.lo, range.hi] : [])];
  const features: { attributes: Record<string, unknown> }[] = [];
  let offset = 0;
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await fetchWithTimeout(rowsUrl(featureServerUrl, fields, offset), {}, 30_000);
    if (!res.ok) throw new Error(`FeatureServer ${res.status} for ${featureServerUrl}`);
    const body = (await res.json()) as { features?: { attributes: Record<string, unknown> }[]; exceededTransferLimit?: boolean; error?: { message?: string } };
    if (body.error) throw new Error(`FeatureServer error: ${body.error.message ?? "unknown"}`);
    const got = body.features ?? [];
    features.push(...got);
    offset += got.length;
    if (!body.exceededTransferLimit) return parseRows(features, column, range);
  }
  throw new Error(`FeatureServer has more than ${MAX_PAGES} pages for ${featureServerUrl}; refusing a partial result`);
}
