import { shareOf, sumOf, versus, type Est, type Verdict } from "./factMath";

// The fact sheet's headline figures (spec 2026-10-12-neighborhood-fact-sheet §4): hand-checked against DYCU's portrait
// rows and the Census variables (2021–2024). Rows are matched exactly; an entry that doesn't match is dropped, never guessed.
export type PortraitTable = { slug: string; groups: string[]; rows: { label: string; heading: boolean; values: ({ estimate: string; moe: string } | null)[] }[] };
export type CensusPick = { kind: "" | "/profile" | "/subject"; parts: string[]; of: string };
export type FactEntry = { id: string; label: string; meaning: string; topic: string; parts: string[]; of?: string; groups?: number[]; census: CensusPick | null };

export const FACTS: FactEntry[] = [
  { id: "population", label: "People", meaning: "Residents, from DYCU's age table (its Male and Female columns; DYCU's Total column is blank in its file).", topic: "sex-and-age", parts: ["Total"], groups: [1, 2], census: null },
  { id: "poverty", label: "People in poverty", meaning: "Residents whose household income was below the federal poverty line.", topic: "poverty-status-by-age", parts: ["Income in the past 12 months below poverty level"], of: "Total", census: { kind: "", parts: ["B17001_002"], of: "B17001_001" } },
  { id: "low-income", label: "Households earning under $25,000", meaning: "Households whose income last year was under $25,000.", topic: "household-income", parts: ["Less than $10,000", "$10,000 to $14,999", "$15,000 to $19,999", "$20,000 to $24,999"], of: "Total", census: { kind: "", parts: ["B19001_002", "B19001_003", "B19001_004", "B19001_005"], of: "B19001_001" } },
  { id: "renters", label: "Renter households", meaning: "Occupied homes that are rented rather than owned.", topic: "occupancy-and-tenure", parts: ["Renter-Occupied Housing Units"], of: "Occupied Housing Units:", census: { kind: "/profile", parts: ["DP04_0047"], of: "DP04_0002" } },
  { id: "vacant", label: "Vacant homes", meaning: "Housing units with no one living in them.", topic: "occupancy-and-tenure", parts: ["Vacant Housing Units"], of: "Total Housing Units:", census: { kind: "/profile", parts: ["DP04_0003"], of: "DP04_0001" } },
  { id: "rent-burden", label: "Renters paying 30% or more of income on rent", meaning: "Renting households whose rent and utilities take 30% or more of their income.", topic: "rent-paid", parts: ["30.0 to 34.9 percent", "35.0 percent or more"], of: "Occupied units paying rent (excluding units where GRAPI cannot be computed)", census: { kind: "/profile", parts: ["DP04_0141", "DP04_0142"], of: "DP04_0136" } },
  { id: "no-car", label: "Households with no vehicle", meaning: "Households with no car, truck or van available.", topic: "vehicles-per-household", parts: ["No vehicle available"], of: "Total:", census: { kind: "", parts: ["B08201_002"], of: "B08201_001" } },
  { id: "degree", label: "Adults 25+ with a bachelor's degree or more", meaning: "Adults 25 and older whose highest schooling is a bachelor's, graduate or professional degree.", topic: "educational-attainment", parts: ["Bachelor's degree", "Graduate or professional degree"], of: "Population 25 years and over", census: { kind: "/subject", parts: ["S1501_C01_012", "S1501_C01_013"], of: "S1501_C01_006" } },
  { id: "no-diploma", label: "Adults 25+ without a high school diploma", meaning: "Adults 25 and older who didn't finish high school or an equivalency.", topic: "educational-attainment", parts: ["Less than 9th grade", "9th to 12th grade, no diploma"], of: "Population 25 years and over", census: { kind: "/subject", parts: ["S1501_C01_007", "S1501_C01_008"], of: "S1501_C01_006" } },
];

const num = (s: string | undefined) => (s === undefined || s.trim() === "" ? Number.NaN : Number(s));
// One row by its exact label (trimmed), its estimate and margin summed over the given value groups.
export function readRow(t: PortraitTable, label: string, groups: number[]): Est | null {
  const row = t.rows.find((r) => !r.heading && r.label.trim() === label);
  if (!row) return null;
  const vals = groups.map((g) => row.values[g]);
  if (vals.some((x) => !x || !Number.isFinite(num(x.estimate)))) return null;
  return sumOf(vals.map((x) => ({ estimate: num(x!.estimate), moe: Number.isFinite(num(x!.moe)) ? num(x!.moe) : null })));
}

export type Figure = { rate: Est | null; count: Est; of: Est | null };
export function neighborhoodFigure(e: FactEntry, tables: PortraitTable[]): Figure | null {
  const t = tables.find((x) => x.slug === e.topic);
  if (!t) return null;
  const groups = e.groups ?? [0];
  const parts = e.parts.map((p) => readRow(t, p, groups));
  if (parts.some((p) => p === null)) return null;
  const count = sumOf(parts as Est[]);
  if (!e.of) return { rate: null, count, of: null };
  const of = readRow(t, e.of, groups);
  if (!of) return null;
  return { rate: shareOf(count, of), count, of };
}

export function cityFigure(e: FactEntry, values: Record<string, Est> | undefined): Figure | null {
  if (!e.census || !values) return null;
  const parts = e.census.parts.map((c) => values[c]);
  const of = values[e.census.of];
  if (parts.some((p) => !p) || !of) return null;
  const count = sumOf(parts);
  return { rate: shareOf(count, of), count, of };
}

export type Headline = { id: string; label: string; meaning: string; isCount: boolean; hood: Figure | null; city: Figure | null; verdict: Verdict };
export function headline(e: FactEntry, tables: PortraitTable[], values: Record<string, Est> | undefined): Headline {
  const hood = neighborhoodFigure(e, tables);
  const city = cityFigure(e, values);
  const verdict = hood?.rate && city?.rate ? versus(hood.rate, city.rate) : "unknown";
  return { id: e.id, label: e.label, meaning: e.meaning, isCount: !e.of, hood, city, verdict };
}

// "Silver City, Burnham Park, and Layton Park" → "silver-city-burnham-park-and-layton-park".
export const areaSlug = (name: string) => name.toLowerCase().replace(/['’]/g, "").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
// DYCU's tract numbers ("71", "1865.02") → Milwaukee County GEOIDs.
export const tractGeoid = (tract: string) => `55079${String(Math.round(Number(tract) * 100)).padStart(6, "0")}`;
