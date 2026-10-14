import { shareOf, sumOf, versus, type Est, type Verdict } from "./factMath";
import { cityFigure, FACTS, type Figure } from "./factSheet";

// A ZIP area's figures from Census values (spec 2026-10-14-zip-profile §5): code computes every one. Race and
// ethnicity from B03002 (Hispanic or Latino origin by race); the 8 measures are the fact sheets' own formulas.
export const RACE_TOTAL = "B03002_001";
export const RACE: { id: string; label: string; codes: string[] }[] = [
  { id: "white", label: "White (not Hispanic)", codes: ["B03002_003"] },
  { id: "black", label: "Black (not Hispanic)", codes: ["B03002_004"] },
  { id: "asian", label: "Asian (not Hispanic)", codes: ["B03002_006"] },
  { id: "two-or-more", label: "Two or more races (not Hispanic)", codes: ["B03002_009"] },
  // Native American, Pacific Islander and some other race: each small, so one row.
  { id: "other", label: "Other races (not Hispanic)", codes: ["B03002_005", "B03002_007", "B03002_008"] },
  { id: "hispanic", label: "Hispanic or Latino (any race)", codes: ["B03002_012"] },
];
export const RACE_CODES = [RACE_TOTAL, ...RACE.flatMap((r) => r.codes)];

export type ZipRow = { id: string; label: string; meaning: string; zip: Figure | null; city: Figure | null; verdict: Verdict };

function raceFigure(codes: string[], values: Record<string, Est> | undefined): Figure | null {
  const parts = codes.map((c) => values?.[c]);
  const of = values?.[RACE_TOTAL];
  if (parts.some((p) => !p) || !of) return null;
  const count = sumOf(parts as Est[]);
  return { rate: shareOf(count, of), count, of };
}

const verdictOf = (zip: Figure | null, city: Figure | null): Verdict => (zip?.rate && city?.rate ? versus(zip.rate, city.rate) : "unknown");

export function zipRows(values: Record<string, Est>, city: Record<string, Est> | undefined): { population: Est | null; race: ZipRow[]; facts: ZipRow[] } {
  const race: ZipRow[] = RACE.map((r) => {
    const zip = raceFigure(r.codes, values);
    const c = raceFigure(r.codes, city);
    return { id: r.id, label: r.label, meaning: "Share of residents.", zip, city: c, verdict: verdictOf(zip, c) };
  });
  const facts: ZipRow[] = FACTS.filter((e) => e.census).map((e) => {
    const zip = cityFigure(e, values);
    const c = cityFigure(e, city);
    return { id: e.id, label: e.label, meaning: e.meaning, zip, city: c, verdict: verdictOf(zip, c) };
  });
  return { population: values[RACE_TOTAL] ?? null, race, facts };
}
