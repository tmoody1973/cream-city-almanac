# Neighborhood Fact Sheet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A printable fact sheet at `/n/[slug]` for each of DYCU's 27 profiled areas. It shows about 9 headline figures from DYCU's portraits, each beside the City of Milwaukee's figure from the same Census survey, with a margin-tested verdict. Ask links to it.

**Architecture:**
- **Pure helpers:** `convex/lib/factMath.ts` (Census margin formulas, the verdict) and `convex/lib/factSheet.ts` (the hand-checked headline list, plus reading a portrait's rows into figures).
- **City figures:**
  - a weekly build step, `refreshCityFigures` (`convex/cityFigures.ts`), fetches the Census variables for the City for each portrait period;
  - `convex/lib/census.ts` builds the requests and parses the replies;
  - results are stored raw by variable code in `cityFigures`.
- **Assembly:** a public query, `api.factSheet.sheet`, assembles a sheet from `portraitTables` plus `cityFigures`.
- **The page:** a server-rendered `/n/[slug]` page, after an approved design comp.
- **Ask:** a small `factSheet` tool and card.

**Tech Stack:** Convex (queries, internal actions, convex-test), Next.js 16 App Router (server components, `fetchQuery`), CopilotKit v2, Zod, Vitest, Playwright, the Impeccable skill for the comp, the Census Bureau's data API.

**Spec:** `docs/superpowers/specs/2026-10-12-neighborhood-fact-sheet-design.md`

## Global Constraints

- **Portrait vintage V matches the Census ACS 5-year release V.** For example, the "2024" portrait is 2020–2024 and uses `https://api.census.gov/data/2024/acs/acs5`. The period text reads `${V-4}–${V}`.
- **Census codes** (verified 2026-10-12 against the 2021–2024 variable lists; same meaning in every year):
  - **B17001:** _001 total, _002 below poverty.
  - **B19001:** _001 total, _002–_005 the bands under $25,000.
  - **B08201:** _001 total, _002 no vehicle.
  - **DP04:** _0001 total units, _0002 occupied, _0003 vacant, _0047 renter-occupied, _0136 units paying rent (GRAPI computable), _0141 30.0–34.9%, _0142 35.0% or more.
  - **S1501:** _C01_006 population 25+, _C01_007 less than 9th grade, _C01_008 9th–12th no diploma, _C01_012 bachelor's, _C01_013 graduate.
- **City of Milwaukee:** `for=place:53000&in=state:55`.
- **Key:** `CENSUS_API_KEY` is a Convex environment variable, never in code. It is set on development (2026-10-12) and must be set on production before merge (Tarik's OK).
- **Margins are 90%** (Census).
  - A sum's margin is √(Σ moe²).
  - A proportion's margin is √(moe_X² − p²·moe_Y²)/Y. When the part under the root is negative, use √(moe_X² + p²·moe_Y²)/Y.
  - The verdict is "higher" or "lower" only when |p_n − p_c| > √(moe_n² + moe_c²).
- **Exact copy:**
  - verdicts: "clearly higher than the city", "clearly lower than the city", "about the same as the city (within the margin of error)";
  - note: "The neighborhood is part of the city, so this comparison is approximate.";
  - source: "U.S. Census Bureau, American Community Survey 5-year estimates, City of Milwaukee".
- **No AI-written text on the page.**
- **A never-guessed figure:** an entry whose rows aren't found shows "Not in DYCU's file for this year" and is never computed.
- **Commits** end with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`. Never stage `.superpowers/` or `clerk-creamcityalmanac.app.zone`.

## Review Focus

1. **A period the city has no figures for** (the Census fetch failed, or a new year isn't published yet) must show "City figure unavailable", never another period's figure (Task 4 test).
2. **A portrait year whose rows are labelled differently** must drop that headline with "Not in DYCU's file for this year", never pick a near-miss row. Matching is exact, after trimming (Task 2 test).
3. **The Census's special negative values** (−555555555 means no sampling error, so the margin is 0; −666666666, −222222222 and the like are missing) must never become numbers on the page (Task 3 test).
4. **A slug with odd punctuation:** "Silver City, Burnham Park, and Layton Park" must round-trip, and an unknown slug lists the 27 areas (Task 4 test).
5. **A neighborhood rate with a zero or missing "out of" row** must produce no rate rather than divide by zero (Task 1 test).

---

## File Structure

| File | Responsibility |
|---|---|
| `convex/lib/factMath.ts` (new) | `Est`, `sumOf`, `shareOf`, `versus` |
| `convex/lib/factSheet.ts` (new) | `FACTS` list, `readRow`, `neighborhoodFigure`, `cityFigure`, `headline`, `areaSlug`, `tractGeoid` |
| `convex/lib/census.ts` (new) | `censusUrl`, `parseCensus`, `requestsFor` |
| `convex/cityFigures.ts` (new) | `refreshCityFigures` internal action, `storeCityFigures` / `portraitPeriods` internals |
| `convex/factSheet.ts` (new) | public `sheet` and `findSheet` queries |
| `convex/schema.ts` | + `cityFigures` table |
| `convex/build.ts` | call `refreshCityFigures` in `finish` |
| `convex/catalog.ts` | export `tablesFor` |
| `tests/helpers/fakeFetch.ts` | + `census` / `censusStatus` options |
| `ui/lib/factText.ts` (new) | words and exports for the page and card |
| `app/n/[slug]/page.tsx`, `ui/components/FactSheet.tsx` (new), `ui/components/factSheet.module.css` (new) | the page |
| `lib/ask/*`, `ui/components/AskCards.tsx` | the `factSheet` tool and card |
| Docs | decision 036, How it works, DESIGN.md, e2e |

**Rulings carried from planning (re-ledger at execution):**
- **Unemployment is dropped from the headline list.** DYCU's employment table holds rates with implausible margins (Harambee 2024: 13.4% ± 32.9 points), consistent with the formula-error warning Ask already shows. Spec §4 says an unmatched entry is dropped and noted. Cost if wrong: one figure missing; it can return once DYCU fixes the file.
- **Population is the Male + Female "Total" rows of Sex and Age.** DYCU's Total column is 0 in 78 of 79 tables. The sheet notes it.
- **City figures are stored raw by Census code** (`values: Record<code, Est>`), not in the spec §5 shape (`parts`/`of`/`rate` per figure). The same `FACTS` entries then compute both the neighborhood and the city side at read time, so the two can't drift, and a changed headline needs no refetch. Cost if wrong: none to the page; one schema field differs from the spec's text.
- **Testing the margin formulas:** the spec cites the Census guide's worked examples; the tests use hand-computed cases of the same formulas (in Task 1), because the guide's numbers aren't in the repo. Cost if wrong: none to the math, which the formula pins.

---

### Task 1: The math

**Files:** Create `convex/lib/factMath.ts`. Test: `tests/lib/factMath.test.ts`.

**Interfaces — Produces:**
- `type Est = { estimate: number; moe: number | null }`
- `sumOf(xs: Est[]): Est`
- `shareOf(part: Est, of: Est): Est | null`
- `type Verdict = "higher" | "lower" | "same" | "unknown"`
- `versus(n: Est, c: Est): Verdict`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { shareOf, sumOf, versus } from "../../convex/lib/factMath";

describe("Census margin math", () => {
  it("adds estimates and combines margins as the square root of the summed squares", () => {
    expect(sumOf([{ estimate: 10, moe: 3 }, { estimate: 20, moe: 4 }])).toEqual({ estimate: 30, moe: 5 });
    expect(sumOf([{ estimate: 10, moe: 3 }, { estimate: 20, moe: null }])).toEqual({ estimate: 30, moe: null });
  });
  it("gives a proportion's margin by the Census formula, and the ratio form when that goes negative", () => {
    const p = shareOf({ estimate: 40, moe: 6 }, { estimate: 100, moe: 8 })!;
    expect(p.estimate).toBe(0.4);
    expect(p.moe).toBeCloseTo(Math.sqrt(36 - 0.16 * 64) / 100, 10);
    const r = shareOf({ estimate: 90, moe: 2 }, { estimate: 100, moe: 10 })!;
    expect(r.moe).toBeCloseTo(Math.sqrt(4 + 0.81 * 100) / 100, 10);
  });
  it("gives no rate when the 'out of' figure is zero or missing", () => {
    expect(shareOf({ estimate: 5, moe: 1 }, { estimate: 0, moe: 0 })).toBeNull();
    expect(shareOf({ estimate: 5, moe: 1 }, { estimate: Number.NaN, moe: 0 })).toBeNull();
  });
  it("calls a difference only when it is larger than both margins combined", () => {
    expect(versus({ estimate: 0.35, moe: 0.03 }, { estimate: 0.228, moe: 0.008 })).toBe("higher");
    expect(versus({ estimate: 0.1, moe: 0.03 }, { estimate: 0.228, moe: 0.008 })).toBe("lower");
    expect(versus({ estimate: 0.24, moe: 0.03 }, { estimate: 0.228, moe: 0.008 })).toBe("same");
    expect(versus({ estimate: 0.5, moe: null }, { estimate: 0.228, moe: 0.008 })).toBe("unknown");
  });
});
```

- [ ] **Step 2:** Run `npx vitest run tests/lib/factMath.test.ts`. Expected: FAIL (module not found).

- [ ] **Step 3: Implement** `convex/lib/factMath.ts`

```ts
// The Census Bureau's approximations for derived ACS estimates (Understanding and Using ACS Data, appendix). Pure.
// Margins are at 90% confidence; a null margin means the source gave none, and nothing derived from it gets one.
export type Est = { estimate: number; moe: number | null };

export function sumOf(xs: Est[]): Est {
  const estimate = xs.reduce((t, x) => t + x.estimate, 0);
  const moe = xs.some((x) => x.moe === null) ? null : Math.sqrt(xs.reduce((t, x) => t + (x.moe as number) ** 2, 0));
  return { estimate, moe };
}

// p = X / Y. When the part under the square root goes negative, the Census guide says to use the ratio form.
export function shareOf(part: Est, of: Est): Est | null {
  if (!(of.estimate > 0)) return null;
  const p = part.estimate / of.estimate;
  if (part.moe === null || of.moe === null) return { estimate: p, moe: null };
  const inner = part.moe ** 2 - p ** 2 * of.moe ** 2;
  return { estimate: p, moe: Math.sqrt(inner >= 0 ? inner : part.moe ** 2 + p ** 2 * of.moe ** 2) / of.estimate };
}

export type Verdict = "higher" | "lower" | "same" | "unknown";
// A neighborhood against the city: different only when the gap is larger than both margins combined.
export function versus(n: Est, c: Est): Verdict {
  if (n.moe === null || c.moe === null) return "unknown";
  const gap = n.estimate - c.estimate;
  if (!(Math.abs(gap) > Math.sqrt(n.moe ** 2 + c.moe ** 2))) return "same";
  return gap > 0 ? "higher" : "lower";
}
```

- [ ] **Step 4:** Run `npx vitest run tests/lib/factMath.test.ts`. Expected: PASS (4).

- [ ] **Step 5: Commit** `git add convex/lib/factMath.ts tests/lib/factMath.test.ts && git commit -m "feat: Census margin math for fact sheets"` (with the trailer).

---

### Task 2: The headline list and reading a portrait

**Files:** Create `convex/lib/factSheet.ts`. Test: `tests/lib/factSheet.test.ts`.

**Interfaces:**
- **Consumes:** `Est`, `sumOf`, `shareOf`, `versus` from Task 1.
- **Produces:**
  - `type PortraitTable = { slug: string; groups: string[]; rows: { label: string; heading: boolean; values: ({ estimate: string; moe: string } | null)[] }[] }`
  - `type CensusPick = { kind: "" | "/profile" | "/subject"; parts: string[]; of: string }`
  - `type FactEntry = { id: string; label: string; meaning: string; topic: string; parts: string[]; of?: string; groups?: number[]; census: CensusPick | null }`
  - `FACTS: FactEntry[]` (9 entries)
  - `readRow(t: PortraitTable, label: string, groups: number[]): Est | null`
  - `type Figure = { rate: Est | null; count: Est; of: Est | null }`
  - `neighborhoodFigure(e, tables): Figure | null`
  - `cityFigure(e, values: Record<string, Est> | undefined): Figure | null`
  - `type Headline = { id; label; meaning; isCount: boolean; hood: Figure | null; city: Figure | null; verdict: Verdict }`
  - `headline(e, tables, values): Headline`
  - `areaSlug(name: string): string`
  - `tractGeoid(tract: string): string`

- [ ] **Step 1: Write the failing test.** The fixture uses Harambee 2024's real rows.

```ts
import { describe, expect, it } from "vitest";
import { areaSlug, cityFigure, FACTS, headline, neighborhoodFigure, readRow, tractGeoid, type PortraitTable } from "../../convex/lib/factSheet";

const t = (slug: string, groups: string[], rows: [string, ...(string | null)[]][]): PortraitTable => ({
  slug, groups, rows: rows.map(([label, ...vals]) => ({ label, heading: false, values: vals.map((v) => (v === null ? null : { estimate: v.split("±")[0], moe: v.split("±")[1] ?? "0" })) })),
});
const harambee: PortraitTable[] = [
  t("poverty-status-by-age", [""], [["Total", "18894±1000"], ["Income in the past 12 months below poverty level", "6520±600"]]),
  t("household-income", [""], [["Total", "8000±177"], ["Less than $10,000", "1017±93"], ["$10,000 to $14,999", "867±102"], ["$15,000 to $19,999", "512±80"], ["$20,000 to $24,999", "638±99"]]),
  t("occupancy-and-tenure", [""], [["Total Housing Units:", "9457±300"], ["Vacant Housing Units", "1457±200"], ["Occupied Housing Units:", "8000±177"], ["Renter-Occupied Housing Units", "5745±300"]]),
  t("rent-paid", [""], [["Occupied units paying rent", "5660±300"], ["Occupied units paying rent (excluding units where GRAPI cannot be computed)", "5549±300"], ["30.0 to 34.9 percent", "483±100"], ["35.0 percent or more", "2737±250"]]),
  t("vehicles-per-household", [""], [["Total:", "8000±177"], ["No vehicle available", "2586±250"]]),
  t("educational-attainment", ["Total", "Male", "Female"], [["Bachelor's degree or higher", "65±30", "36±20", "29±15"], ["Population 25 years and over", "10991±500", "4814±300", "6177±300"], ["Less than 9th grade", "224±80", null, null], ["9th to 12th grade, no diploma", "1362±200", null, null], ["Bachelor's degree", "1408±200", null, null], ["Graduate or professional degree", "798±150", null, null]]),
  t("sex-and-age", ["Total", "Male", "Female"], [["Total", "0±0", "9087±861", "9963±985"]]),
];
const city = { B17001_001: { estimate: 552601, moe: 503 }, B17001_002: { estimate: 125891, moe: 4212 } };

describe("the headline list", () => {
  it("has 9 well-formed entries with unique ids", () => {
    expect(FACTS.map((f) => f.id)).toEqual(["population", "poverty", "low-income", "renters", "vacant", "rent-burden", "no-car", "degree", "no-diploma"]);
    for (const f of FACTS) expect(f.parts.length).toBeGreaterThan(0);
  });
});

describe("reading DYCU's portrait", () => {
  it("reads a row exactly by label, and adds groups when asked", () => {
    const sa = harambee.find((x) => x.slug === "sex-and-age")!;
    expect(readRow(sa, "Total", [1, 2])).toEqual({ estimate: 19050, moe: Math.sqrt(861 ** 2 + 985 ** 2) });
    expect(readRow(sa, "Totals", [0])).toBeNull();
  });
  it("turns rows into a rate with its margin, and a count for population", () => {
    const pov = neighborhoodFigure(FACTS.find((f) => f.id === "poverty")!, harambee)!;
    expect(pov.rate!.estimate).toBeCloseTo(6520 / 18894, 10);
    expect(neighborhoodFigure(FACTS.find((f) => f.id === "population")!, harambee)).toMatchObject({ rate: null, count: { estimate: 19050 } });
    expect(neighborhoodFigure(FACTS.find((f) => f.id === "degree")!, harambee)!.count.estimate).toBe(2206);
  });
  it("drops a figure whose rows aren't in the file, never a near miss", () => {
    const renamed = harambee.map((x) => (x.slug === "vehicles-per-household" ? t("vehicles-per-household", [""], [["Total", "8000±177"], ["No vehicles", "2586±250"]]) : x));
    expect(neighborhoodFigure(FACTS.find((f) => f.id === "no-car")!, renamed)).toBeNull();
  });
  it("sets the neighborhood beside the city with a verdict, and says unavailable when the city has none", () => {
    const h = headline(FACTS.find((f) => f.id === "poverty")!, harambee, city);
    expect(h.verdict).toBe("higher");
    expect(h.city!.rate!.estimate).toBeCloseTo(125891 / 552601, 10);
    expect(headline(FACTS.find((f) => f.id === "poverty")!, harambee, undefined)).toMatchObject({ city: null, verdict: "unknown" });
    expect(cityFigure(FACTS.find((f) => f.id === "no-car")!, city)).toBeNull();
  });
});

describe("names and tracts", () => {
  it("makes stable slugs and tract ids", () => {
    expect(areaSlug("Silver City, Burnham Park, and Layton Park")).toBe("silver-city-burnham-park-and-layton-park");
    expect(areaSlug("Walker's Point")).toBe("walkers-point");
    expect(tractGeoid("71")).toBe("55079007100");
    expect(tractGeoid("1865.02")).toBe("55079186502");
  });
});
```

- [ ] **Step 2:** Run `npx vitest run tests/lib/factSheet.test.ts`. Expected: FAIL (module not found).

- [ ] **Step 3: Implement** `convex/lib/factSheet.ts`

```ts
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
```

- [ ] **Step 4:** Run `npx vitest run tests/lib/factSheet.test.ts`. Expected: PASS.

- [ ] **Step 5: Check every live portrait** (development, read-only)

Add, in `convex/factSheet.ts` (new file; Task 4 adds the public queries to it):

```ts
import { internalQuery } from "./_generated/server";
import { FACTS, neighborhoodFigure, type PortraitTable } from "./lib/factSheet";

// Every portrait × every headline: which entries don't resolve (spec §4: drop and note, never guess). Run on dev before relying on the list.
export const checkFacts = internalQuery({
  args: {},
  handler: async (ctx) => {
    const fam = await ctx.db.query("families").withIndex("by_key", (q) => q.eq("key", "document:neighborhood-portrait-spreadsheet")).first();
    if (!fam) return { portraits: 0, missing: ["no portrait family"] };
    const members = await ctx.db.query("members").withIndex("by_family", (q) => q.eq("familyKey", fam.key)).collect();
    const missing: string[] = [];
    let portraits = 0;
    for (const m of members) {
      const tables = (await ctx.db.query("portraitTables").withIndex("by_hubId", (q) => q.eq("hubId", m.hubId)).collect()) as unknown as PortraitTable[];
      if (!tables.length) continue;
      portraits++;
      for (const f of FACTS) if (!neighborhoodFigure(f, tables)) missing.push(`${m.title}: ${f.id}`);
    }
    return { portraits, missing };
  },
});
```

Run: `npx convex run factSheet:checkFacts` (development; it reads only).
Expected:
- `portraits: 99`;
- `missing` is empty, or lists only the 2021 files' `sex-and-age` (2021 has a Total column).

Ledger every other line as a ruling. Drop an entry from `FACTS` only if it is missing for most years, and ask Tarik first if that would leave fewer than 7.

- [ ] **Step 6: Commit** `convex/lib/factSheet.ts`, `convex/factSheet.ts` and `tests/lib/factSheet.test.ts`: "feat: the fact sheet's headline list, read from DYCU's portrait rows".

---

### Task 3: City figures from the Census

**Files:**
- Create: `convex/lib/census.ts`, `convex/cityFigures.ts`
- Modify: `convex/schema.ts`, `convex/build.ts`, `tests/helpers/fakeFetch.ts`
- Test: `tests/lib/census.test.ts`, `convex/cityFigures.test.ts`

**Interfaces:**
- **Consumes:** `FACTS`, `Est`.
- **Produces:**
  - `censusUrl(period: number, kind: CensusPick["kind"], codes: string[], key: string): string`
  - `parseCensus(body: unknown, codes: string[]): Record<string, Est>`, which throws on a malformed reply
  - `requestsFor(): { kind; codes: string[] }[]`
  - table `cityFigures { period: number; values: Record<string, {estimate: number; moe: number | null}>; fetchedAt: number }` with index `by_period`
  - `internal.cityFigures.refreshCityFigures({}) → string[]` (notes)
  - `internal.cityFigures.cityValues({ period }) → Record<string, Est> | null`

- [ ] **Step 1: Write the failing unit test** in `tests/lib/census.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { censusUrl, parseCensus, requestsFor } from "../../convex/lib/census";

describe("Census requests", () => {
  it("asks for each code's estimate and margin for the City of Milwaukee", () => {
    expect(censusUrl(2024, "/profile", ["DP04_0001", "DP04_0003"], "k")).toBe("https://api.census.gov/data/2024/acs/acs5/profile?get=DP04_0001E,DP04_0001M,DP04_0003E,DP04_0003M&for=place:53000&in=state:55&key=k");
  });
  it("groups every headline's codes into one request per table kind", () => {
    const r = requestsFor();
    expect(r.map((x) => x.kind).sort()).toEqual(["", "/profile", "/subject"]);
    expect(r.find((x) => x.kind === "")!.codes).toEqual(expect.arrayContaining(["B17001_001", "B17001_002", "B19001_005", "B08201_002"]));
  });
  it("reads the reply, keeps 'no sampling error' as a zero margin and never turns a special value into a number", () => {
    const body = [["B17001_001E", "B17001_001M", "B17001_002E", "B17001_002M", "state", "place"], ["552601", "-555555555", "125891", "-222222222", "55", "53000"]];
    expect(parseCensus(body, ["B17001_001", "B17001_002"])).toEqual({ B17001_001: { estimate: 552601, moe: 0 }, B17001_002: { estimate: 125891, moe: null } });
    expect(parseCensus([["B17001_001E", "B17001_001M"], ["-666666666", "5"]], ["B17001_001"])).toEqual({});
    expect(() => parseCensus("<html>", ["B17001_001"])).toThrow();
  });
});
```

- [ ] **Step 2: Write the failing database test** in `convex/cityFigures.test.ts`

```ts
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { installFakeFetch } from "../tests/helpers/fakeFetch";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");
afterEach(() => { vi.unstubAllGlobals(); delete process.env.CENSUS_API_KEY; });

async function seed() {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    await ctx.db.insert("families", { key: "document:neighborhood-portrait-spreadsheet", code: "N03", name: "Neighborhood Portrait Spreadsheet", kind: "document", topic: "Neighborhoods", keywords: [], places: [], years: [2023, 2024], latestModified: "2026-01-22", baseSearchText: "", searchText: "", dictionaryTab: null });
    for (const y of [2023, 2024]) await ctx.db.insert("members", { familyKey: "document:neighborhood-portrait-spreadsheet", hubId: `h${y}`, title: `${y} Harambee Neighborhood Portrait Spreadsheet`, yearLabel: String(y), place: "Harambee", years: [y], kind: "document", landingPage: "", featureServerUrl: null, modified: "2026-01-22", downloads: {}, description: "", keywords: [] });
  });
  return t;
}
const reply = (url: string) => {
  const codes = [...new URL(url).searchParams.get("get")!.split(",")];
  return [codes, codes.map((c) => (c.endsWith("M") ? "10" : "100"))];
};

describe("refreshCityFigures", () => {
  it("stores every period a portrait uses, by variable", async () => {
    const t = await seed();
    process.env.CENSUS_API_KEY = "k";
    const fake = installFakeFetch({ census: reply });
    expect(await t.action(internal.cityFigures.refreshCityFigures, {})).toEqual([]);
    expect(fake.count("api.census.gov/data/2024/")).toBe(3);
    expect(await t.query(internal.cityFigures.cityValues, { period: 2023 })).toMatchObject({ B17001_001: { estimate: 100, moe: 10 } });
  });
  it("keeps last week's figures and notes the failure when the Census fails", async () => {
    const t = await seed();
    process.env.CENSUS_API_KEY = "k";
    installFakeFetch({ census: reply });
    await t.action(internal.cityFigures.refreshCityFigures, {});
    installFakeFetch({ census: reply, censusStatus: 500 });
    const notes = await t.action(internal.cityFigures.refreshCityFigures, {});
    expect(notes[0]).toMatch(/City figures for 2023 unavailable, kept last week's/);
    expect(await t.query(internal.cityFigures.cityValues, { period: 2024 })).not.toBeNull();
  });
  it("says so without a key, and fetches nothing", async () => {
    const t = await seed();
    const fake = installFakeFetch({ census: reply });
    expect((await t.action(internal.cityFigures.refreshCityFigures, {}))[0]).toMatch(/CENSUS_API_KEY is not set/);
    expect(fake.count("api.census.gov")).toBe(0);
  });
});
```

The `seed` field set must match the `families` and `members` validators. Copy any missing required fields from `convex/tracts.test.ts`'s `seedTracts`, and ledger the change.

- [ ] **Step 3:** Run `npx vitest run tests/lib/census.test.ts convex/cityFigures.test.ts`. Expected: FAIL (modules and the `census` fake option missing).

- [ ] **Step 4: Implement**

`tests/helpers/fakeFetch.ts`:
- add `census?: (url: string) => unknown; censusStatus?: number;` to `FakeOptions`;
- before the final 404 fallback, add:

```ts
    if (url.includes("api.census.gov")) return json(opts.censusStatus ?? 200, opts.census?.(url) ?? []);
```

`convex/lib/census.ts`:

```ts
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
```

`convex/schema.ts`: add, beside `tractNeighborhoods`:

```ts
  // The City of Milwaukee's ACS figures for the fact sheet, by portrait period (vintage), raw by variable code.
  cityFigures: defineTable({
    period: v.number(),
    values: v.record(v.string(), v.object({ estimate: v.number(), moe: v.union(v.number(), v.null()) })),
    fetchedAt: v.number(),
  }).index("by_period", ["period"]),
```

`convex/cityFigures.ts`:

```ts
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { censusUrl, parseCensus, requestsFor } from "./lib/census";
import type { Est } from "./lib/factMath";
import { fetchWithTimeout } from "./lib/http";

const N03 = "document:neighborhood-portrait-spreadsheet";
const TIMEOUT_MS = 30_000;
const vEst = v.object({ estimate: v.number(), moe: v.union(v.number(), v.null()) });

// The survey periods DYCU's portraits use: each file's year is the ACS 5-year release it comes from.
export const portraitPeriods = internalQuery({
  args: {},
  handler: async (ctx): Promise<number[]> => {
    const members = await ctx.db.query("members").withIndex("by_family", (q) => q.eq("familyKey", N03)).collect();
    return [...new Set(members.flatMap((m) => m.years))].filter((y) => y >= 2010).sort();
  },
});

export const storeCityFigures = internalMutation({
  args: { period: v.number(), values: v.record(v.string(), vEst) },
  handler: async (ctx, { period, values }) => {
    const old = await ctx.db.query("cityFigures").withIndex("by_period", (q) => q.eq("period", period)).first();
    if (old) await ctx.db.patch(old._id, { values, fetchedAt: Date.now() });
    else await ctx.db.insert("cityFigures", { period, values, fetchedAt: Date.now() });
  },
});

export const cityValues = internalQuery({
  args: { period: v.number() },
  handler: async (ctx, { period }): Promise<Record<string, Est> | null> =>
    (await ctx.db.query("cityFigures").withIndex("by_period", (q) => q.eq("period", period)).first())?.values ?? null,
});

// Weekly (build.finish) or alone: `npx convex run cityFigures:refreshCityFigures`. Notes, never throws; a period is
// replaced only when all its requests succeed, so a failure keeps last week's figures.
export const refreshCityFigures = internalAction({
  args: {},
  handler: async (ctx): Promise<string[]> => {
    const key = process.env.CENSUS_API_KEY;
    if (!key) return ["CENSUS_API_KEY is not set (run: npx convex env set CENSUS_API_KEY <key>); city figures not refreshed."];
    const notes: string[] = [];
    for (const period of await ctx.runQuery(internal.cityFigures.portraitPeriods, {})) {
      try {
        const values: Record<string, Est> = {};
        for (const r of requestsFor()) {
          const res = await fetchWithTimeout(censusUrl(period, r.kind, r.codes, key), {}, TIMEOUT_MS);
          if (!res.ok) throw new Error(`Census request failed: ${res.status}`);
          Object.assign(values, parseCensus(await res.json(), r.codes));
        }
        await ctx.runMutation(internal.cityFigures.storeCityFigures, { period, values });
      } catch (e) {
        notes.push(`City figures for ${period} unavailable, kept last week's: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return notes;
  },
});
```

`convex/build.ts`, in `finish`: after the `neighborhoodNotes` try/catch, add the block below, and pass `notes: [...neighborhoodNotes, ...cityNotes]` to `completeBuild`:

```ts
    let cityNotes: string[];
    try {
      cityNotes = await ctx.runAction(internal.cityFigures.refreshCityFigures, {});
    } catch (e) {
      cityNotes = [`City figures refresh failed: ${message(e)}`];
    }
```

- [ ] **Step 5:** Run `npx vitest run tests/lib/census.test.ts convex/cityFigures.test.ts && npx vitest run --no-file-parallelism && npx tsc --noEmit`. Expected: PASS, with the whole suite green.

- [ ] **Step 6: Live check on development** (Tarik's dev push OK required)
  - `npx convex dev --once`, then `npx convex run cityFigures:refreshCityFigures`. Expected: `[]`.
  - Then `npx convex data cityFigures`. Expected: 4 rows (2021–2024); 2024 has `B17001_001` 552601 and `B17001_002` 125891.
  - Compare 125891/552601 = 22.8% with the Census Bureau's published Milwaukee city poverty rate for 2020–2024 (data.census.gov table S1701, place 5553000). Record both numbers in the ledger.

- [ ] **Step 7: Commit:** "feat: weekly City of Milwaukee figures from the Census for fact sheets".

---

### Task 4: The sheet's data

**Files:**
- Modify: `convex/factSheet.ts` (add public queries), `convex/catalog.ts` (export `tablesFor`)
- Test: `convex/factSheet.test.ts`

**Interfaces:**
- **Consumes:** Tasks 2 and 3.
- **Produces:**
  - `api.factSheet.sheet({ slug, year? }) → SheetOk | { status: "not-found"; areas: { slug: string; name: string }[] }`, where `SheetOk` is:

    ```ts
    {
      status: "ok"; slug: string; name: string; year: number; years: number[]; period: string;
      headlines: Headline[]; tables: PortraitTable[];
      source: { title: string; landingPage: string };
      map: { url: string; geoids: string[] } | null;
      cityFetchedAt: number | null;
    }
    ```

  - `api.factSheet.findSheet({ neighborhood }) → { status: "ok"; slug; name; year; period; headlines: Headline[] (poverty, rent-burden, no-car) } | { status: "no-neighborhood"; asked: string; nearest: string[] }`

- [ ] **Step 1: Write the failing test** in `convex/factSheet.test.ts`. Seed:
  - the N03 family and members (as in Task 3), for "Harambee" (2023, 2024) and "Silver City, Burnham Park, and Layton Park" (2024);
  - `portraitTables` for each, using Task 2's Harambee rows;
  - `cityFigures` for 2024 only;
  - a `neighborhoods` row `{definition: "dycu", name: "Harambee", matchKey: "harambee", tracts: [{ years: [2024], tracts: ["1860"] }]}`;
  - an E02 family with a County member that has a featureServerUrl.

  Then assert:

```ts
  it("assembles the newest year with the city beside each headline, a map and the source", async () => {
    const r = await t.query(api.factSheet.sheet, { slug: "harambee" });
    expect(r).toMatchObject({ status: "ok", name: "Harambee", year: 2024, years: [2024, 2023], period: "2020–2024", map: { geoids: ["55079186000"] } });
    if (r.status !== "ok") return;
    expect(r.headlines.find((h) => h.id === "poverty")).toMatchObject({ verdict: "higher" });
    expect(r.tables.length).toBeGreaterThan(0);
  });
  it("never shows another period's city figure", async () => {
    const r = await t.query(api.factSheet.sheet, { slug: "harambee", year: 2023 });
    if (r.status !== "ok") throw new Error("expected ok");
    expect(r.headlines.every((h) => h.city === null)).toBe(true);
    expect(r.cityFetchedAt).toBeNull();
  });
  it("round-trips a long name and lists the areas for an unknown slug", async () => {
    expect(await t.query(api.factSheet.sheet, { slug: "silver-city-burnham-park-and-layton-park" })).toMatchObject({ status: "ok", name: "Silver City, Burnham Park, and Layton Park" });
    expect(await t.query(api.factSheet.sheet, { slug: "nowhere" })).toMatchObject({ status: "not-found", areas: expect.arrayContaining([{ slug: "harambee", name: "Harambee" }]) });
  });
  it("finds a sheet by a typed name for Ask, and offers the nearest names on a miss", async () => {
    expect(await t.query(api.factSheet.findSheet, { neighborhood: "harambee" })).toMatchObject({ status: "ok", slug: "harambee", headlines: [{ id: "poverty" }, { id: "rent-burden" }, { id: "no-car" }] });
    expect(await t.query(api.factSheet.findSheet, { neighborhood: "Harambe" })).toMatchObject({ status: "no-neighborhood", nearest: expect.arrayContaining(["Harambee"]) });
  });
```

- [ ] **Step 2:** Run `npx vitest run convex/factSheet.test.ts`. Expected: FAIL (`sheet` not exported).

- [ ] **Step 3: Implement**
  - In `convex/catalog.ts`, change `async function tablesFor(` to `export async function tablesFor(`.
  - Append to `convex/factSheet.ts`:

```ts
import { v } from "convex/values";
import { query, type QueryCtx } from "./_generated/server";
import { tablesFor } from "./catalog";
import { matchName, nameKey } from "./lib/neighborhoodNames";
import { placeKey } from "./lib/portrait";
import { newestCountyUrl } from "./lib/tractPlaces";
import { areaSlug, FACTS, headline, tractGeoid } from "./lib/factSheet";
// (merge with the imports already at the top of the file)

const N03 = "document:neighborhood-portrait-spreadsheet";
const CARD_FACTS = ["poverty", "rent-burden", "no-car"];

// DYCU's profiled areas: every portrait member with a place, newest year first per area.
async function areas(ctx: QueryCtx) {
  const members = await ctx.db.query("members").withIndex("by_family", (q) => q.eq("familyKey", N03)).collect();
  const by = new Map<string, typeof members>();
  for (const m of members) if (m.place) by.set(m.place, [...(by.get(m.place) ?? []), m]);
  return [...by].map(([name, ms]) => ({ name, slug: areaSlug(name), members: ms.sort((a, b) => (b.years[0] ?? 0) - (a.years[0] ?? 0)) })).sort((a, b) => a.name.localeCompare(b.name));
}

async function tractMap(ctx: QueryCtx, name: string, year: number) {
  const def = await ctx.db.query("neighborhoods").withIndex("by_definition_matchKey", (q) => q.eq("definition", "dycu").eq("matchKey", placeKey(name))).first();
  const tracts = (def?.tracts ?? []).filter((e) => e.years.includes(year)).flatMap((e) => e.tracts);
  const e02 = await ctx.db.query("families").withIndex("by_code", (q) => q.eq("code", "E02")).first();
  const ms = e02 ? await ctx.db.query("members").withIndex("by_family", (q) => q.eq("familyKey", e02.key)).collect() : [];
  const url = newestCountyUrl(ms.filter((m) => m.featureServerUrl && m.place).map((m) => ({ place: m.place as string, year: m.yearLabel ?? String(m.years[0] ?? ""), url: m.featureServerUrl as string })));
  return url && tracts.length ? { url, geoids: tracts.map(tractGeoid) } : null;
}

async function assemble(ctx: QueryCtx, area: Awaited<ReturnType<typeof areas>>[number], year?: number) {
  const withTables = [];
  for (const m of area.members) if ((await tablesFor(ctx, m.hubId)).length) withTables.push(m);
  const pick = withTables.find((m) => m.years[0] === year) ?? withTables[0];
  if (!pick) return null;
  const y = pick.years[0];
  const tables = (await tablesFor(ctx, pick.hubId)) as unknown as PortraitTable[];
  const city = await ctx.db.query("cityFigures").withIndex("by_period", (q) => q.eq("period", y)).first();
  return {
    status: "ok" as const, slug: area.slug, name: area.name, year: y, years: withTables.map((m) => m.years[0]), period: `${y - 4}–${y}`,
    headlines: FACTS.map((f) => headline(f, tables, city?.values)), tables,
    source: { title: pick.title, landingPage: pick.landingPage }, map: await tractMap(ctx, area.name, y), cityFetchedAt: city?.fetchedAt ?? null,
  };
}

export const sheet = query({
  args: { slug: v.string(), year: v.optional(v.number()) },
  handler: async (ctx, { slug, year }) => {
    const all = await areas(ctx);
    const area = all.find((a) => a.slug === slug.trim().toLowerCase());
    const got = area ? await assemble(ctx, area, year) : null;
    return got ?? { status: "not-found" as const, areas: all.map(({ slug: s, name }) => ({ slug: s, name })) };
  },
});

export const findSheet = query({
  args: { neighborhood: v.string() },
  handler: async (ctx, { neighborhood }) => {
    const all = await areas(ctx);
    const m = matchName(neighborhood.slice(0, 80), all.map((a) => ({ ...a, matchKey: nameKey(a.name) })));
    if (m.kind !== "one") return { status: "no-neighborhood" as const, asked: neighborhood.slice(0, 80), nearest: m.kind === "choose" ? m.names.slice(0, 3) : m.nearest };
    const got = await assemble(ctx, m.row);
    if (!got) return { status: "no-neighborhood" as const, asked: neighborhood.slice(0, 80), nearest: [] };
    return { status: "ok" as const, slug: got.slug, name: got.name, year: got.year, period: got.period, headlines: got.headlines.filter((h) => CARD_FACTS.includes(h.id)) };
  },
});
```

- [ ] **Step 4:** Run `npx vitest run convex/factSheet.test.ts && npx vitest run --no-file-parallelism && npx tsc --noEmit`. Expected: PASS.

- [ ] **Step 5: Commit:** "feat: fact sheet data: headlines beside the city, tables, map and source".

---

### Task 5: The design comp (STOP for Tarik's pick)

**Files:** `.impeccable/mocks/fact-sheet-*`, `.impeccable/surfaces/fact-sheet.md`.

- [ ] **Step 1: Read the Impeccable skill** (`~/.claude/skills/impeccable`) and its comp step as used in `docs/superpowers/plans/2026-10-08-phase-3a-neighborhood-spreadsheets.md` (lines 943–954). Read DESIGN.md in full.
- [ ] **Step 2: Write the comp prompt** to `.impeccable/mocks/fact-sheet-prompt.md`. It must:
  - restate DESIGN.md's system: "The Marked-Up Rundown", paper and ink, Saira display, red only as grease pencil, no cards, shadows or radii;
  - give the page's content in the order of spec §7, using Harambee 2024's real numbers from `api.factSheet.sheet` on development (run it with `npx convex run factSheet:sheet '{"slug":"harambee"}'`);
  - ask for two directions.
- [ ] **Step 3: Generate the comps:** two directions × laptop (1536×1024) and phone (1024×1536), plus one print (US Letter, portrait) of each direction. Use `impeccable generate-image --ref <capture of /d/N03> --prompt-file .impeccable/mocks/fact-sheet-prompt.md --out .impeccable/mocks/fact-sheet-<a|b>-<laptop|phone|print>.webp`. Read each image.
- [ ] **Step 4: STOP.** Show Tarik the six images, recommend one direction and say why, and wait for his pick. Record it in each comp's `.webp.json` sidecar (`"approved": true`) and in `.impeccable/surfaces/fact-sheet.md` (scope, audience, the approved comps, a direction contract).
- [ ] **Step 5: Commit** `.impeccable/mocks/fact-sheet-*` and `.impeccable/surfaces/fact-sheet.md`: "design: fact sheet comp (approved direction)".

---

### Task 6: The page

**Files:**
- Create: `app/n/[slug]/page.tsx`, `ui/components/FactSheet.tsx`, `ui/components/factSheet.module.css`, `ui/lib/factText.ts`
- Test: `tests/ui/factText.test.ts`, `e2e/factsheet.spec.ts`

**Interfaces:**
- **Consumes:** `SheetOk` (Task 4), `ExportBar` / `CardExport` (`ui/lib/cardExport.ts`), `CityMap` via `CityMapLoader` with `tracts: { url, fits: geoids, close: [] }`.
- **Produces:**
  - `pct(e: Est | null): string` ("34.5%")
  - `margin(e: Est | null): string` ("± 2.1 points")
  - `verdictText(v: Verdict): string`
  - `countLine(f: Figure): string` ("6,520 of 18,894")
  - `factSheetExport(s: SheetOk, ctx: Ctx): CardExport`
  - constants `NOTE_APPROX`, `CENSUS_SOURCE`, `MARGIN_NOTE`

- [ ] **Step 1: Write the failing unit test** in `tests/ui/factText.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { CENSUS_SOURCE, countLine, factSheetExport, margin, NOTE_APPROX, pct, verdictText } from "../../ui/lib/factText";

describe("fact sheet words", () => {
  it("writes rates, margins, counts and verdicts plainly", () => {
    expect(pct({ estimate: 0.34509, moe: 0.0211 })).toBe("34.5%");
    expect(margin({ estimate: 0.34509, moe: 0.0211 })).toBe("± 2.1 points");
    expect(margin({ estimate: 0.3, moe: null })).toBe("");
    expect(countLine({ rate: null, count: { estimate: 6520, moe: 600 }, of: { estimate: 18894, moe: 1000 } })).toBe("6,520 of 18,894");
    expect(verdictText("higher")).toBe("clearly higher than the city");
    expect(verdictText("same")).toBe("about the same as the city (within the margin of error)");
    expect(verdictText("unknown")).toBe("");
    expect(NOTE_APPROX).toBe("The neighborhood is part of the city, so this comparison is approximate.");
    expect(CENSUS_SOURCE).toBe("U.S. Census Bureau, American Community Survey 5-year estimates, City of Milwaukee");
  });
  it("exports every headline with unrounded values, margins and both sources", () => {
    const s = { status: "ok", slug: "harambee", name: "Harambee", year: 2024, years: [2024], period: "2020–2024", tables: [], map: null, cityFetchedAt: 1, source: { title: "2024 Harambee Neighborhood Portrait Spreadsheet", landingPage: "https://dycu.test/p" },
      headlines: [{ id: "poverty", label: "People in poverty", meaning: "m", isCount: false, verdict: "higher", hood: { rate: { estimate: 0.345, moe: 0.02 }, count: { estimate: 6520, moe: 600 }, of: { estimate: 18894, moe: 1000 } }, city: { rate: { estimate: 0.228, moe: 0.008 }, count: { estimate: 125891, moe: 4212 }, of: { estimate: 552601, moe: 503 } } }] } as never;
    const e = factSheetExport(s, { origin: "https://almanac.test", date: "October 12, 2026" });
    expect(e.csv.head).toEqual(["Figure", "Harambee", "Harambee margin", "City of Milwaukee", "City margin", "Compared with the city", "Harambee count", "Out of"]);
    expect(e.csv.rows[0]).toEqual(["People in poverty", 0.345, 0.02, 0.228, 0.008, "clearly higher than the city", 6520, 18894]);
    expect(e.notes.join(" ")).toContain(CENSUS_SOURCE);
    expect(e.notes.join(" ")).toContain("https://dycu.test/p");
  });
});
```

- [ ] **Step 2:** Run it. Expected: FAIL.

- [ ] **Step 3: Implement** `ui/lib/factText.ts`

```ts
import type { Est, Verdict } from "@/convex/lib/factMath";
import type { Figure, Headline } from "@/convex/lib/factSheet";
import { exported, safeName, type CardExport, type Ctx } from "./cardExport";

export const NOTE_APPROX = "The neighborhood is part of the city, so this comparison is approximate.";
export const CENSUS_SOURCE = "U.S. Census Bureau, American Community Survey 5-year estimates, City of Milwaukee";
export const MARGIN_NOTE = "Figures are survey estimates; margins of error are at 90% confidence.";
export const MISSING = "Not in DYCU's file for this year";
export const NO_CITY = "City figure unavailable";
const n = (x: number) => Math.round(x).toLocaleString("en-US");
export const pct = (e: Est | null) => (e ? `${(e.estimate * 100).toFixed(1)}%` : "—");
export const margin = (e: Est | null) => (e?.moe === null || e?.moe === undefined ? "" : `± ${(e.moe * 100).toFixed(1)} points`);
export const countLine = (f: Figure) => (f.of ? `${n(f.count.estimate)} of ${n(f.of.estimate)}` : n(f.count.estimate));
const VERDICT: Record<Verdict, string> = { higher: "clearly higher than the city", lower: "clearly lower than the city", same: "about the same as the city (within the margin of error)", unknown: "" };
export const verdictText = (v: Verdict) => VERDICT[v];

type SheetOk = { name: string; slug: string; year: number; period: string; headlines: Headline[]; source: { title: string; landingPage: string } };
export function factSheetExport(s: SheetOk, ctx: Ctx): CardExport {
  const rows = s.headlines.map((h) => [h.label, h.hood?.rate?.estimate ?? h.hood?.count.estimate ?? null, h.hood?.rate?.moe ?? h.hood?.count.moe ?? null, h.city?.rate?.estimate ?? null, h.city?.rate?.moe ?? null, verdictText(h.verdict), h.hood?.count.estimate ?? null, h.hood?.of?.estimate ?? null]);
  return {
    title: `${s.name} fact sheet · ${s.period}`,
    lines: [`${s.name}, ${s.period} American Community Survey`, NOTE_APPROX, MARGIN_NOTE],
    csv: { head: ["Figure", s.name, `${s.name} margin`, "City of Milwaukee", "City margin", "Compared with the city", `${s.name} count`, "Out of"], rows },
    text: { head: ["Figure", s.name, "City of Milwaukee", "Compared with the city"], rows: s.headlines.map((h) => [h.label, h.isCount ? (h.hood ? countLine(h.hood) : MISSING) : h.hood?.rate ? `${pct(h.hood.rate)} ${margin(h.hood.rate)}` : MISSING, h.isCount ? "" : h.city?.rate ? `${pct(h.city.rate)} ${margin(h.city.rate)}` : NO_CITY, verdictText(h.verdict)]) },
    notes: [`Source: Data You Can Use, ${s.source.title}: ${s.source.landingPage}`, `City figures: ${CENSUS_SOURCE}, ${s.period}.`, `Sheet: ${ctx.origin}/n/${s.slug}?year=${s.year}`, exported(ctx)],
    filename: safeName(`almanac_fact-sheet_${s.slug}_${s.year}`),
  };
}
```

Check the real signatures of `exported` and `safeName` in `ui/lib/cardExport.ts` and adjust the calls if they differ; ledger the change.

- [ ] **Step 4:** Run the unit test. Expected: PASS.

- [ ] **Step 5: Write the failing browser test** in `e2e/factsheet.spec.ts`

```ts
import { expect, test } from "./fixtures";

test("a fact sheet sets each headline beside the city, prints, and fits the screen", async ({ page }) => {
  await page.goto("/n/harambee");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Harambee");
  const poverty = page.locator("[data-fact=poverty]");
  await expect(poverty).toContainText("People in poverty");
  await expect(poverty.locator("[data-city]")).toContainText("%");
  await expect(poverty.locator("[data-verdict]")).toContainText(/than the city|about the same/);
  await expect(page.getByText("U.S. Census Bureau, American Community Survey 5-year estimates, City of Milwaukee")).toBeVisible();
  await expect(page.getByRole("button", { name: /print/i })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("the year switcher picks another year, and an unknown name lists the areas", async ({ page }) => {
  await page.goto("/n/harambee?year=2023");
  await expect(page.locator("[data-period]")).toContainText("2019–2023");
  await page.goto("/n/nowhere");
  await expect(page.getByRole("link", { name: "Harambee" })).toBeVisible();
});
```

Run it against a build without the page. Expected: FAIL (404).

- [ ] **Step 6: Build the page to the approved comp.** Follow the Impeccable build steps the earlier pages used: archive the old build, start the build phase with the approved laptop comp, and use the capture spec with the hero gate.

`app/n/[slug]/page.tsx`:

```tsx
import { fetchQuery } from "convex/nextjs";
import type { Metadata } from "next";
import { api } from "@/convex/_generated/api";
import { FactSheet, FactSheetIndex } from "@/ui/components/FactSheet";

export const revalidate = 300;
type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ year?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const s = await fetchQuery(api.factSheet.sheet, { slug });
  return { title: s.status === "ok" ? `${s.name} fact sheet · Cream City Almanac` : "Fact sheets · Cream City Almanac" };
}

export default async function Page({ params, searchParams }: Props) {
  const { slug } = await params;
  const { year } = await searchParams;
  const y = Number(year);
  const s = await fetchQuery(api.factSheet.sheet, { slug, ...(Number.isInteger(y) ? { year: y } : {}) });
  return s.status === "ok" ? <FactSheet s={s} /> : <FactSheetIndex areas={s.areas} />;
}
```

`ui/components/FactSheet.tsx` must render the following (markup and styling follow the approved comp, in `factSheet.module.css`):
- **Header:**
  - `<h1>` with the area's name, and the text "Neighborhood fact sheet";
  - `<p data-period>` reading `${period} American Community Survey`;
  - the year switcher, as links `?year=Y`.
- **One `<section data-fact={id}>` per headline.** Each holds:
  - the label;
  - the neighborhood's `pct` + `margin`, or for `isCount`, `countLine`; or `MISSING` when `hood` is null;
  - `<span data-city>` with the city's `pct` + `margin`, or `NO_CITY`; nothing at all for population;
  - `<p data-verdict>` with `verdictText`;
  - `countLine` and `meaning`.
- **`NOTE_APPROX` and `MARGIN_NOTE`.**
- **The map:** `CityMap` with `tracts={{ url: s.map.url, fits: s.map.geoids, close: [] }}`, shown when `s.map` is set.
- **All tables:** one `<details>` per table with its rows.
- **Sources:** the DYCU link, `CENSUS_SOURCE` with the period, and the date.
- **Print:** a `<button>` labelled "Print or save as PDF" (`window.print()`, client component), plus `<ExportBar make={(ctx) => factSheetExport(s, ctx)} />`.
- **`FactSheetIndex`** lists every area as a link.

In `factSheet.module.css`, add `@media print { … }`. It:
- hides the site navigation, the buttons, the ExportBar and `details`;
- sets `@page { size: letter; margin: 0.5in; }`;
- keeps each headline section unbroken with `break-inside: avoid`.

- [ ] **Step 7: Run the checks**
  - Rebuild and restart on port 3100, then run `BASE_URL=http://localhost:3100 npx playwright test e2e/factsheet.spec.ts`. Expected: PASS on desktop and phone.
  - Take a print-media screenshot (`page.emulateMedia({ media: "print" })`) of `/n/harambee` with a throwaway spec, deleted after. Read it: title, headlines, map and sources on one page.
- [ ] **Step 8: Commit:** "feat: printable neighborhood fact sheets at /n/[name]".

---

### Task 7: Ask

**Files:**
- Modify: `lib/ask/tools.ts`, `lib/ask/backend.ts`, `lib/ask/prompt.ts`, `lib/ask/model.ts`, `ui/components/AskCards.tsx`, `ui/lib/refusalChoices.ts`
- Test: `tests/ui/askTools.test.ts`, `e2e/ask.spec.ts`

- [ ] **Step 1: Write the failing test** (append to `tests/ui/askTools.test.ts`)

```ts
describe("fact sheets", () => {
  it("offers a factSheet tool that takes a neighborhood name, and the prompt sends fact-sheet questions to it", () => {
    const tool = askTools(backend({})).find((t) => t.name === "factSheet")!;
    expect(tool).toBeDefined();
    expect((tool.parameters as { shape: Record<string, unknown> }).shape).toHaveProperty("neighborhood");
    expect(ASK_PROMPT).toContain("factSheet");
  });
});
```

Add `sheet: async () => ({ status: "no-neighborhood", asked: "", nearest: [] }) as never` to the test's `backend` helper.

- [ ] **Step 2:** Run it. Expected: FAIL.

- [ ] **Step 3: Implement**

`lib/ask/tools.ts`:
- add `"factSheet"` to `AskToolName`;
- add `export type SheetResult = FunctionReturnType<typeof api.factSheet.findSheet>;`;
- add `sheet(a: { neighborhood: string }): Promise<SheetResult>;` to `AskBackend`;
- add to `askTools`:

```ts
    {
      name: "factSheet",
      description: "A one-page fact sheet for one of DYCU's 27 profiled neighborhoods (Harambee, Clarke Square, Sherman Park …): its headline figures beside the City of Milwaukee's, with a link to the printable page. Use it for \"fact sheet\", \"profile\", \"overview\" or \"how does it compare with the city\". If it returns no-neighborhood, say fact sheets cover DYCU's 27 areas, offer the names it returned, and offer the tract tools for other neighborhoods. Never restate its figures.",
      parameters: z.object({ neighborhood: z.string().max(80) }),
      execute: (a: { neighborhood: string }) => b.sheet(a),
    },
```

`lib/ask/backend.ts`: add `sheet: (a) => fetchQuery(api.factSheet.findSheet, a),`.

`lib/ask/prompt.ts`: add this line after the getNumber rule:

```
- For a fact sheet, profile or overview of a DYCU neighborhood, or how one compares with the city, call factSheet; the card links to the printable page.
```

`lib/ask/model.ts`: add a scripted branch before the `"poverty"` branch:

```ts
                : question.includes("fact sheet")
                ? call("factSheet", { neighborhood: "Harambee" })
```

`ui/components/AskCards.tsx`: add a renderer.
- **On `ok`:** a short card, `data-card="fact-sheet"`, with:
  - the name and period;
  - the three headlines, each its `pct` (or `countLine`) beside the city's `pct` and `verdictText`;
  - `<a href={`/n/${r.slug}`}>Open the fact sheet →</a>`.
- **On `no-neighborhood`:** `FollowUps pick` with one button per nearest name (`Give me a fact sheet for ${name}.`).

- [ ] **Step 4: Add the browser test** (`e2e/ask.spec.ts`, signed in)

```ts
  test("a fact-sheet question links to the printable sheet", async ({ page }) => {
    await ask(page, "Give me a fact sheet for Harambee");
    const card = page.locator("[data-card=fact-sheet]:visible");
    await expect(card).toBeVisible({ timeout: 40_000 });
    await expect(card.getByRole("link", { name: /Open the fact sheet/ })).toHaveAttribute("href", "/n/harambee");
  });
```

Run the unit tests, tsc, then build and run the e2e. Expected: PASS on desktop and phone.

- [ ] **Step 5: Graded question.** Add to `scripts/ask-questions.ts`:

```ts
  { q: "Give me a fact sheet for Clarke Square", tool: "factSheet", expect: { slug: "clarke-square" }, final: true },
```

Run `npm run ask:card -- --only=<its position>`. Expected: 1/1.

- [ ] **Step 6: Commit:** "feat: Ask answers fact-sheet questions with a card and a link".

---

### Task 8: Docs

**Files:** create `docs/decisions/036-neighborhood-fact-sheet.md`; modify `ui/components/HowItWorks.tsx`, `DESIGN.md`, `e2e/how.spec.ts`, `.env.example`.

- [ ] **Step 1: Write the failing test** (append to `e2e/how.spec.ts`)

```ts
test("it explains fact sheets and where the city figure comes from", async ({ page }) => {
  await page.goto("/how-it-works");
  await expect(page.getByText(/fact sheet/i).first()).toBeVisible();
  await expect(page.getByText(/U\.S\. Census Bureau/)).toBeVisible();
});
```

Run it. Expected: FAIL.

- [ ] **Step 2: Write the docs**
  - **Decision 036,** in the decision format, with "What actually happened" left blank. It covers:
    - why DYCU's 27 areas, not City neighborhoods;
    - why Census figures for the city;
    - the margin test and the approximate-comparison caveat;
    - the dropped unemployment figure;
    - the Male + Female population.
  - **How it works:** one paragraph in "What the AI does", after the neighborhood-tracts paragraph. It says:
    - fact sheets exist for DYCU's 27 areas;
    - each figure sits beside the City of Milwaukee's from the U.S. Census Bureau's same survey;
    - "clearly higher" means the gap is larger than both margins of error;
    - the AI writes none of it.
  - **DESIGN.md:** "### Fact sheet", from the approved comp.
  - **`.env.example`:** add `CENSUS_API_KEY` to the comment listing Convex secrets.
- [ ] **Step 3:** Rebuild, then run `BASE_URL=http://localhost:3100 npx playwright test e2e/how.spec.ts`. Expected: PASS (all).
- [ ] **Step 4: Commit:** "docs: decision 036, How it works and DESIGN.md on fact sheets".
