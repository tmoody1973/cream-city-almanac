import type { Est } from "./factMath";
import { FACTS, type CensusPick } from "./factSheet";
import { RACE_CODES } from "./zipFigures";

// The City of Milwaukee's figures for the fact sheet's headlines and Ask's ZIP card, from the Census Bureau's ACS 5-year
// API (spec §5); and one ZIP area's, for that card (spec 2026-10-14-zip-profile §5).
const BASE = "https://api.census.gov/data";
const MILWAUKEE = "for=place:53000&in=state:55";
// A ZIP code tabulation area: national geography, no state needed (ACS 5-year, level 860).
export const zctaGeo = (zip: string) => `for=zip%20code%20tabulation%20area:${zip}`;
export const censusUrl = (period: number, kind: CensusPick["kind"], codes: string[], key: string, geo = MILWAUKEE) =>
  `${BASE}/${period}/acs/acs5${kind}?get=${codes.flatMap((c) => [`${c}E`, `${c}M`]).join(",")}&${geo}&key=${key}`;

// Every headline's codes, plus race and ethnicity (B03002) for the ZIP card's comparison, one request per table kind.
export function requestsFor(): { kind: CensusPick["kind"]; codes: string[] }[] {
  const by = new Map<CensusPick["kind"], Set<string>>([["", new Set(RACE_CODES)]]);
  for (const f of FACTS) if (f.census) for (const c of [...f.census.parts, f.census.of]) by.set(f.census.kind, (by.get(f.census.kind) ?? new Set()).add(c));
  return [...by].map(([kind, codes]) => ({ kind, codes: [...codes].sort() }));
}

// Never log the key: fetch errors can carry the full request URL.
export const scrubKey = (s: string) => s.replace(/key=[^&\s]+/g, "key=\u2026");

// The Census's annotation values: -555555555 means "no sampling error" (margin 0); any other large negative is missing.
const NO_ERROR = -555555555;
const value = (s: unknown) => (typeof s === "string" || typeof s === "number" ? Number(s) : Number.NaN);
export function parseCensus(body: unknown, codes: string[]): Record<string, Est> {
  if (!Array.isArray(body) || body.length < 2 || !Array.isArray(body[0]) || !Array.isArray(body[1])) throw new Error("Census reply was not a table");
  const [head, row] = body as unknown[][];
  const out: Record<string, Est> = {};
  for (const c of codes) {
    const estimate = value(row[head.indexOf(`${c}E`)]);
    const m = value(row[head.indexOf(`${c}M`)]);
    if (!Number.isFinite(estimate) || estimate < 0) continue;
    out[c] = { estimate, moe: m === NO_ERROR ? 0 : Number.isFinite(m) && m >= 0 ? m : null };
  }
  return out;
}
