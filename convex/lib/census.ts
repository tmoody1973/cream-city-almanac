import type { Est } from "./factMath";
import { FACTS, type CensusPick } from "./factSheet";

// The City of Milwaukee's figures for the fact sheet's headlines, from the Census Bureau's ACS 5-year API (spec §5).
const BASE = "https://api.census.gov/data";
const MILWAUKEE = "for=place:53000&in=state:55";
export const censusUrl = (period: number, kind: CensusPick["kind"], codes: string[], key: string) =>
  `${BASE}/${period}/acs/acs5${kind}?get=${codes.flatMap((c) => [`${c}E`, `${c}M`]).join(",")}&${MILWAUKEE}&key=${key}`;

export function requestsFor(): { kind: CensusPick["kind"]; codes: string[] }[] {
  const by = new Map<CensusPick["kind"], Set<string>>();
  for (const f of FACTS) if (f.census) for (const c of [...f.census.parts, f.census.of]) by.set(f.census.kind, (by.get(f.census.kind) ?? new Set()).add(c));
  return [...by].map(([kind, codes]) => ({ kind, codes: [...codes].sort() }));
}

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
