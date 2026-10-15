# Neighborhood Answers Built From Census Tracts (Part 1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `rankTracts` and `relateTracts` answer in the City's neighborhoods by default. Each neighborhood figure is built from DYCU's census tracts and weighted by residents, then shown on a card shaped like the ZIP health card. Census tracts stay available on request.

**Architecture:**
- **Weekly data:** the build keeps every neighborhood piece of each tract (1% or more) and each tract's population (Census ACS B01003).
- **The math:** pure functions in `convex/lib/neighborhoodFigures.ts` build neighborhood and city figures from a measure's tract values and rank or compare them.
- **The tools:**
  - `rankTracts` and `relateTracts` gain `unit`;
  - for a rate with populations stored, they return `tool: "rank-n"` / `"relate-n"`;
  - otherwise they return today's tract answer, with a `unitNote` saying why.
- **The cards:** new card components and words in `ui/lib/neighborhoodText.ts`. The map loader gains a `field` option for the City's neighborhood layer.

**Tech Stack:** Convex (actions, queries, convex-test), Census ACS API, Next.js 16 / React 19, CopilotKit, Vitest (edge-runtime), Playwright.

**Spec:** `docs/superpowers/specs/2026-10-15-neighborhood-answers-design.md`

## Global Constraints

- **Unit:**
  - `unit` defaults to `"neighborhood"`;
  - the answer is the tract answer when any of these holds: `unit` is `"tract"`, `neighborhood` (one area) is set, either side is the City's property file, `Header.kind` isn't `"rate"`, or no tract populations are stored.
- **`unitNote` text** (only when `unit` was not explicitly `"tract"`):
  - not a rate: "This measure can't be combined across census areas, so these are census areas.";
  - no populations: "Neighborhood figures aren't ready yet, so these are census areas.";
  - property file: "The City's property figures are medians, which can't be combined across census areas, so these are census areas."
- **Pieces:**
  - City neighborhood shares of a tract's area, 1% or more, from `cityShares(tract, hoods, 1)`;
  - the display list `city` stays at 10% or more (decision 031).
- **Residents in a piece:** `population × share / 100`.
- **Neighborhood figure:**
  - the value is the residents-weighted average;
  - the half-width is `√Σ (wᵢ·halfWidthᵢ)²`, keeping the range kind;
  - no range if any piece lacks one.
- **Left out:**
  - fewer than **1,000** residents (`MIN_RESIDENTS`): named on the card;
  - pieces with values covering under half the neighborhood's residents: "too little data".
- **City benchmark:** built the same way over every City tract. A tract's City residents are its population × min(100, Σ piece shares) / 100.
- **Verdicts against the city:**
  - clearly higher: `lo > city.value`;
  - clearly lower: `hi < city.value`;
  - otherwise about the same;
  - too uncertain: `isUnreliable`;
  - no range published: `lo === null`.
- **Mismatch:** `a` (the condition) is cut at thirds of neighborhoods; `b` (the measure asked about) is compared with the city figure. "Clear" means the whole range is past the line.
- **"Go together":** Spearman's correlation over usable neighborhoods; at least 20 (`RELATE_MIN`).
- **Census key:** never in code, notes or logs. Notes pass through `scrubKey`.
- **Permissions:**
  - dev push and dev data runs need Tarik's OK (Task 6);
  - prod data is Tarik's;
  - never stage `.superpowers/` or `clerk-creamcityalmanac.app.zone`.
- **Commit trailer:** `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- **Decision 052:** "What actually happened" stays blank.

## Review Focus

1. **Existing tract tests and behavior keep working.** Without stored populations, every call falls back to the tract answer. Pinned in Task 3: the existing `tracts.test.ts` suite passes unchanged.
2. **A neighborhood made mostly of tracts DYCU left out** (no value) is left out with "too little data", never shown from a sliver. Pinned in Task 1.
3. **Neighborhood names with apostrophes or periods** ("O'Connor", "St. Joseph") must not break the map query: quotes are doubled, and only allowed characters pass. Pinned in Task 4.
4. **The scripted e2e routes that expect tract cards keep getting them.** The scripted model passes `unit: "tract"` on those calls. Pinned in Task 5.
5. **The Census key never appears in a build note,** even on a timeout. Pinned in Task 2.

---

### Task 1: The neighborhood math (pure)

**Files:**
- Create: `convex/lib/neighborhoodFigures.ts`, `tests/lib/neighborhoodFigures.test.ts`

**Interfaces:**
- Consumes: `TractValue`, `RangeKind`, `isUnreliable`, `halfWidth`, `quantile`, `spearman`, `relationship` (`convex/lib/tractStats.ts`).
- Produces:

```ts
export const MIN_RESIDENTS = 1_000;
export type Piece = { name: string; share: number };
export type NFigure = { name: string; value: number; lo: number | null; hi: number | null; kind: RangeKind | null; residents: number; tracts: number };
export type Built = { figures: NFigure[]; small: { name: string; residents: number }[]; thin: string[]; city: NFigure | null };
export type NVerdict = "higher" | "lower" | "same" | "uncertain" | "no-range";
export function buildNeighborhoods(values: TractValue[], pieces: Map<string, Piece[]>, pops: Map<string, number>): Built;
export const asValue: (f: NFigure) => TractValue;
export function versusCity(f: NFigure, city: NFigure | null): NVerdict | null;
export function nMismatch<T extends { name: string; a: NFigure; b: NFigure }>(pairs: T[], aSide: "high" | "low", bSide: "high" | "low", cityB: number): { cutA: number; n: number; fits: T[]; close: T[]; uncertain: string[] };
export function nTogether<T extends { a: NFigure; b: NFigure }>(pairs: T[]): { n: number; strength: "too-few" | "little" | "weak" | "moderate" | "strong"; direction: "higher" | "lower" };
```

- [ ] **Step 1: Write the failing test** in `tests/lib/neighborhoodFigures.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildNeighborhoods, MIN_RESIDENTS, nMismatch, nTogether, versusCity, type NFigure } from "../../convex/lib/neighborhoodFigures";
import type { TractValue } from "../../convex/lib/tractStats";

// Two tracts: A (4,000 people) is 75% Alpha, 25% Beta; B (2,000 people) is 100% Beta. Tract C (300 people) is 100% Gamma.
const v = (geoid: string, value: number, half: number | null): TractValue => ({ geoid, value, lo: half === null ? null : value - half, hi: half === null ? null : value + half, kind: half === null ? null : "moe90" });
const pieces = new Map([["A", [{ name: "Alpha", share: 75 }, { name: "Beta", share: 25 }]], ["B", [{ name: "Beta", share: 100 }]], ["C", [{ name: "Gamma", share: 100 }]]]);
const pops = new Map([["A", 4000], ["B", 2000], ["C", 300]]);

describe("building neighborhood figures", () => {
  it("weights each piece by its residents and combines the ranges", () => {
    const b = buildNeighborhoods([v("A", 20, 2), v("B", 40, 4), v("C", 5, 1)], pieces, pops);
    const alpha = b.figures.find((f) => f.name === "Alpha")!;
    expect(alpha).toMatchObject({ value: 20, residents: 3000, tracts: 1, kind: "moe90" });
    expect(alpha.hi! - alpha.value).toBeCloseTo(2, 6);
    // Beta: 1,000 people from A at 20, 2,000 from B at 40 → (1000·20 + 2000·40) / 3000 = 33.33…
    const beta = b.figures.find((f) => f.name === "Beta")!;
    expect(beta.value).toBeCloseTo(33.333, 2);
    expect(beta.residents).toBe(3000);
    // half-width √((1/3·2)² + (2/3·4)²)
    expect(beta.hi! - beta.value).toBeCloseTo(Math.sqrt((2 / 3) ** 2 + (8 / 3) ** 2), 6);
  });
  it(`leaves out neighborhoods under ${MIN_RESIDENTS} residents, by name`, () => {
    const b = buildNeighborhoods([v("A", 20, 2), v("B", 40, 4), v("C", 5, 1)], pieces, pops);
    expect(b.figures.map((f) => f.name).sort()).toEqual(["Alpha", "Beta"]);
    expect(b.small).toEqual([{ name: "Gamma", residents: 300 }]);
  });
  it("leaves out a neighborhood whose valued pieces cover under half its residents (review focus 2)", () => {
    const b = buildNeighborhoods([v("A", 20, 2)], pieces, pops); // B has no value: Beta keeps only A's 1,000 of 3,000
    expect(b.thin).toEqual(["Beta"]);
    expect(b.figures.map((f) => f.name)).toEqual(["Alpha"]);
  });
  it("has no range when a piece lacks one", () => {
    const b = buildNeighborhoods([v("A", 20, null), v("B", 40, 4)], pieces, pops);
    expect(b.figures.find((f) => f.name === "Beta")).toMatchObject({ lo: null, hi: null });
  });
  it("builds the city the same way over every City tract", () => {
    const b = buildNeighborhoods([v("A", 20, 2), v("B", 40, 4), v("C", 5, 1)], pieces, pops);
    // (4000·20 + 2000·40 + 300·5) / 6300
    expect(b.city!.value).toBeCloseTo((80000 + 80000 + 1500) / 6300, 6);
    expect(b.city!.residents).toBe(6300);
  });
  it("judges a neighborhood against the city by its whole range", () => {
    const city: NFigure = { name: "City of Milwaukee", value: 30, lo: 29, hi: 31, kind: "moe90", residents: 1, tracts: 1 };
    const f = (value: number, half: number | null): NFigure => ({ name: "x", value, lo: half === null ? null : value - half, hi: half === null ? null : value + half, kind: "moe90", residents: 2000, tracts: 1 });
    expect(versusCity(f(40, 2), city)).toBe("higher");
    expect(versusCity(f(20, 2), city)).toBe("lower");
    expect(versusCity(f(31, 2), city)).toBe("same");
    expect(versusCity(f(31, null), city)).toBe("no-range");
    expect(versusCity(f(10, 9), city)).toBe("uncertain");
    expect(versusCity(f(10, 1), null)).toBeNull();
  });
});

describe("comparing neighborhoods", () => {
  const fig = (name: string, value: number): NFigure => ({ name, value, lo: value - 1, hi: value + 1, kind: "moe90", residents: 5000, tracts: 2 });
  const pairs = Array.from({ length: 24 }, (_, i) => ({ name: `N${i}`, a: fig(`N${i}`, i), b: fig(`N${i}`, 50 + i) }));
  it("finds 'b low despite a high' against the city figure and the thirds of a", () => {
    const withLow = [...pairs, { name: "Odd", a: fig("Odd", 30), b: fig("Odd", 10) }];
    const r = nMismatch(withLow, "high", "low", 50);
    expect(r.fits.map((p) => p.name)).toEqual(["Odd"]);
  });
  it("says whether two measures go together across neighborhoods", () => {
    expect(nTogether(pairs)).toMatchObject({ n: 24, strength: "strong", direction: "higher" });
    expect(nTogether(pairs.slice(0, 10)).strength).toBe("too-few");
  });
});
```

- [ ] **Step 2: Run it to watch it fail**

Run: `npx vitest run tests/lib/neighborhoodFigures.test.ts`
Expected: FAIL, because the module doesn't exist.

- [ ] **Step 3: Write `convex/lib/neighborhoodFigures.ts`**

```ts
import { halfWidth, isUnreliable, quantile, relationship, spearman, type RangeKind, type TractValue } from "./tractStats";

// Neighborhood figures built from census tracts (spec 2026-10-15-neighborhood-answers §4): each tract's piece in a City
// neighborhood counts by its residents (population × share of the tract's area inside). Rates only; the caller checks.
export const MIN_RESIDENTS = 1_000;
export type Piece = { name: string; share: number };
export type NFigure = { name: string; value: number; lo: number | null; hi: number | null; kind: RangeKind | null; residents: number; tracts: number };
export type Built = { figures: NFigure[]; small: { name: string; residents: number }[]; thin: string[]; city: NFigure | null };
export type NVerdict = "higher" | "lower" | "same" | "uncertain" | "no-range";

type Part = { residents: number; v: TractValue };

// One weighted figure from its parts; a part with no range leaves the figure with none.
function combine(name: string, parts: Part[], residents: number): NFigure {
  const covered = parts.reduce((s, p) => s + p.residents, 0);
  const w = (p: Part) => p.residents / covered;
  const value = parts.reduce((s, p) => s + w(p) * p.v.value, 0);
  const halves = parts.map((p) => halfWidth(p.v));
  const ranged = halves.every((h) => h !== null);
  const half = ranged ? Math.sqrt(parts.reduce((s, p, i) => s + (w(p) * (halves[i] as number)) ** 2, 0)) : null;
  return { name, value, lo: half === null ? null : value - half, hi: half === null ? null : value + half, kind: parts[0]?.v.kind ?? null, residents: Math.round(residents), tracts: parts.length };
}

export function buildNeighborhoods(values: TractValue[], pieces: Map<string, Piece[]>, pops: Map<string, number>): Built {
  const byGeoid = new Map(values.map((x) => [x.geoid, x]));
  const total = new Map<string, number>();
  const parts = new Map<string, Part[]>();
  const cityParts: Part[] = [];
  let cityTotal = 0;
  for (const [geoid, ps] of pieces) {
    const pop = pops.get(geoid) ?? 0;
    const value = byGeoid.get(geoid);
    const inCity = (pop * Math.min(100, ps.reduce((s, p) => s + p.share, 0))) / 100;
    cityTotal += inCity;
    if (value && inCity > 0) cityParts.push({ residents: inCity, v: value });
    for (const p of ps) {
      const residents = (pop * p.share) / 100;
      total.set(p.name, (total.get(p.name) ?? 0) + residents);
      if (value && residents > 0) parts.set(p.name, [...(parts.get(p.name) ?? []), { residents, v: value }]);
    }
  }
  const figures: NFigure[] = [];
  const small: { name: string; residents: number }[] = [];
  const thin: string[] = [];
  for (const [name, residents] of [...total].sort((x, y) => x[0].localeCompare(y[0]))) {
    if (residents < MIN_RESIDENTS) { small.push({ name, residents: Math.round(residents) }); continue; }
    const ps = parts.get(name) ?? [];
    if (ps.reduce((s, p) => s + p.residents, 0) < residents / 2) { thin.push(name); continue; }
    figures.push(combine(name, ps, residents));
  }
  const cityCovered = cityParts.reduce((s, p) => s + p.residents, 0);
  const city = cityParts.length && cityCovered >= cityTotal / 2 ? combine("City of Milwaukee", cityParts, cityTotal) : null;
  return { figures, small, thin, city };
}

export const asValue = (f: NFigure): TractValue => ({ geoid: f.name, value: f.value, lo: f.lo, hi: f.hi, kind: f.kind });

export function versusCity(f: NFigure, city: NFigure | null): NVerdict | null {
  if (!city) return null;
  if (f.lo === null || f.hi === null) return "no-range";
  if (isUnreliable(asValue(f))) return "uncertain";
  return f.lo > city.value ? "higher" : f.hi < city.value ? "lower" : "same";
}

const usable = <T extends { a: NFigure; b: NFigure }>(p: T) => !isUnreliable(asValue(p.a)) && !isUnreliable(asValue(p.b));

// "b low (or high) despite a high (or low)": a against the thirds of neighborhoods, b against the city's figure.
export function nMismatch<T extends { name: string; a: NFigure; b: NFigure }>(pairs: T[], aSide: "high" | "low", bSide: "high" | "low", cityB: number) {
  const ok = pairs.filter(usable);
  const cutA = quantile(ok.map((p) => p.a.value).sort((x, y) => x - y), aSide === "high" ? 2 / 3 : 1 / 3);
  const onA = (f: NFigure) => (aSide === "high" ? f.value >= cutA : f.value <= cutA);
  const onB = (f: NFigure) => (bSide === "low" ? f.value < cityB : f.value > cityB);
  const clearA = (f: NFigure) => (aSide === "high" ? f.lo !== null && f.lo >= cutA : f.hi !== null && f.hi <= cutA);
  const clearB = (f: NFigure) => (bSide === "low" ? f.hi !== null && f.hi < cityB : f.lo !== null && f.lo > cityB);
  const margin = (p: T) => Math.min(aSide === "high" ? p.a.value - cutA : cutA - p.a.value, bSide === "low" ? cityB - p.b.value : p.b.value - cityB);
  const order = (xs: T[]) => [...xs].sort((x, y) => margin(y) - margin(x));
  const fits = ok.filter((p) => clearA(p.a) && clearB(p.b));
  const close = ok.filter((p) => !fits.includes(p) && onA(p.a) && onB(p.b));
  return { cutA, n: ok.length, fits: order(fits), close: order(close), uncertain: pairs.filter((p) => !usable(p)).map((p) => p.name) };
}

export function nTogether<T extends { a: NFigure; b: NFigure }>(pairs: T[]) {
  const ok = pairs.filter(usable);
  const rel = relationship(spearman(ok.map((p) => p.a.value), ok.map((p) => p.b.value)), ok.length);
  return { n: ok.length, strength: rel.strength, direction: rel.direction };
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/lib/neighborhoodFigures.test.ts`
Expected: PASS (8 tests). Check that `RangeKind` and `halfWidth` are exported from `tractStats.ts`; they are, at lines 2 and 6.

- [ ] **Step 5: Commit**

```bash
git add convex/lib/neighborhoodFigures.ts tests/lib/neighborhoodFigures.test.ts
git commit -m "feat: neighborhood figures from census tracts, weighted by residents, with ranges and a city benchmark

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Weekly pieces and tract populations

**Files:**
- Modify:
  - `convex/lib/tractPlaces.ts` (`cityShares` minimum), `convex/lib/census.ts` (`tractPopulationUrl`, `parseTractPopulations`);
  - `convex/schema.ts` (`tractNeighborhoods.pieces`, `tractPopulations`), `convex/buildStore.ts` (mutations);
  - `convex/build.ts` (refresh), `convex/neighborhoods.test.ts`.
- Test: `tests/lib/tractPlaces.test.ts`, `tests/lib/census.test.ts`

**Interfaces:**
- Produces:
  - `cityShares(tract, hoods, min = 10)`;
  - `tractPopulationUrl(period: number, key: string): string`;
  - `parseTractPopulations(json: unknown): { geoid: string; population: number }[]`;
  - **tables:** `tractNeighborhoods` rows gain `pieces?: { name: string; share: number }[]`, and `tractPopulations` (`{ geoid, population, period }`, index `by_geoid`).

- [ ] **Step 1: Write the failing tests.**

  Append to `tests/lib/tractPlaces.test.ts`:

```ts
describe("every piece of a tract (neighborhood answers §3.1)", () => {
  it("keeps pieces down to the minimum asked for", () => {
    const sq = (x0: number, x1: number) => ({ type: "Polygon" as const, coordinates: [[[x0, 0], [x1, 0], [x1, 1], [x0, 1], [x0, 0]]] });
    const tract = sq(0, 1);
    const hoods = [
      { name: "Big", geometry: sq(0, 0.95), bbox: { minLon: 0, minLat: 0, maxLon: 0.95, maxLat: 1 } },
      { name: "Sliver", geometry: sq(0.95, 1), bbox: { minLon: 0.95, minLat: 0, maxLon: 1, maxLat: 1 } },
    ];
    expect(cityShares(tract, hoods).map((s) => s.name)).toEqual(["Big"]);
    expect(cityShares(tract, hoods, 1).map((s) => s.name)).toEqual(["Big", "Sliver"]);
  });
});
```

  (Add `cityShares` to that file's import from `../../convex/lib/tractPlaces` if it isn't there.)

  Append to `tests/lib/census.test.ts`:

```ts
describe("tract populations (neighborhood answers §3.2)", () => {
  it("asks for every Milwaukee County tract's population", () => {
    expect(tractPopulationUrl(2024, "KEY")).toBe("https://api.census.gov/data/2024/acs/acs5?get=B01003_001E&for=tract:*&in=state:55&in=county:079&key=KEY");
  });
  it("reads the Census table, dropping missing figures", () => {
    const json = [["B01003_001E", "state", "county", "tract"], ["4012", "55", "079", "186000"], ["-666666666", "55", "079", "000100"], ["0", "55", "079", "980000"]];
    expect(parseTractPopulations(json)).toEqual([{ geoid: "55079186000", population: 4012 }, { geoid: "55079980000", population: 0 }]);
    expect(() => parseTractPopulations({ error: "x" })).toThrow(/changed shape/);
  });
});
```

  (Add `parseTractPopulations, tractPopulationUrl` to that file's import from `../../convex/lib/census`.)

- [ ] **Step 2: Run them to watch them fail**

Run: `npx vitest run tests/lib/tractPlaces.test.ts tests/lib/census.test.ts`
Expected: FAIL. The minimum is ignored, and the Census functions are missing.

- [ ] **Step 3: Implement.**

  In `convex/lib/tractPlaces.ts`:
  - change `export function cityShares(tract: Geometry, hoods: Hood[]): CityShare[] {` to `export function cityShares(tract: Geometry, hoods: Hood[], min = MIN_SHARE): CityShare[] {`;
  - in its body, change `.filter((s) => s.share >= MIN_SHARE)` to `.filter((s) => s.share >= min)`;
  - update its comment to: "Each point counts for the City neighborhood it falls in; neighborhoods under `min` percent of the tract (10 for display) are left out."

  Append to `convex/lib/census.ts`:

```ts
// Every Milwaukee County tract's total population (B01003), for weighting neighborhood figures (spec
// 2026-10-15-neighborhood-answers §3.2). One request; the key never leaves this URL (notes go through scrubKey).
export const tractPopulationUrl = (period: number, key: string) =>
  `${BASE}/${period}/acs/acs5?get=B01003_001E&for=tract:*&in=state:55&in=county:079&key=${key}`;

export function parseTractPopulations(json: unknown): { geoid: string; population: number }[] {
  if (!Array.isArray(json) || !Array.isArray(json[0])) throw new Error("Census tract populations changed shape");
  const [head, ...rows] = json as string[][];
  const at = (name: string) => head.indexOf(name);
  const [p, s, c, t] = [at("B01003_001E"), at("state"), at("county"), at("tract")];
  if ([p, s, c, t].some((i) => i < 0)) throw new Error("Census tract populations changed shape");
  return rows.flatMap((r) => {
    const population = Number(r[p]);
    const geoid = `${r[s]}${r[c]}${r[t]}`;
    return Number.isFinite(population) && population >= 0 && /^\d{11}$/.test(geoid) ? [{ geoid, population }] : [];
  });
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/lib/tractPlaces.test.ts tests/lib/census.test.ts`
Expected: PASS.

- [ ] **Step 5: Store and refresh, test first.** Append to the `describe("refreshNeighborhoods", …)` block in `convex/neighborhoods.test.ts`:

```ts
  it("keeps every piece of each tract, and each tract's population (neighborhood answers §3)", async () => {
    const t = await seed();
    await t.run((ctx) => ctx.db.insert("cityFigures", { period: 2024, values: {}, fetchedAt: 0 }));
    vi.stubEnv("CENSUS_API_KEY", "TESTKEY");
    installFakeFetch({ cityNeighborhoods: layer, tractShapes: tractLayer, zctaShapes: zipLayer, census: () => [["B01003_001E", "state", "county", "tract"], ["4012", "55", "079", "186000"]] });
    expect(await t.action(internal.build.refreshNeighborhoods, {})).toEqual([]);
    const row = await t.run((ctx) => ctx.db.query("tractNeighborhoods").withIndex("by_geoid", (q) => q.eq("geoid", "55079186000")).first());
    expect(row!.pieces).toEqual([{ name: "Harambee", share: 100 }]);
    expect(await t.run((ctx) => ctx.db.query("tractPopulations").collect())).toMatchObject([{ geoid: "55079186000", population: 4012, period: 2024 }]);
    vi.unstubAllEnvs();
  });
  it("keeps last week's populations, and never puts the key in a note, when the Census fails (review focus 5)", async () => {
    const t = await seed();
    await t.run((ctx) => ctx.db.insert("cityFigures", { period: 2024, values: {}, fetchedAt: 0 }));
    await t.run((ctx) => ctx.db.insert("tractPopulations", { geoid: "55079186000", population: 4000, period: 2023 }));
    vi.stubEnv("CENSUS_API_KEY", "SECRETKEY");
    installFakeFetch({ cityNeighborhoods: layer, tractShapes: tractLayer, zctaShapes: zipLayer, censusStatus: 500 });
    const notes = await t.action(internal.build.refreshNeighborhoods, {});
    expect(notes).toEqual([expect.stringMatching(/^Tract populations unavailable, kept last week's: /)]);
    expect(notes.join(" ")).not.toContain("SECRETKEY");
    expect(await t.run((ctx) => ctx.db.query("tractPopulations").collect())).toMatchObject([{ population: 4000 }]);
    vi.unstubAllEnvs();
  });
```

  (Check the shape of `cityFigures` documents in `convex/schema.ts`. If `fetchedAt` or `values` differ, use the schema's fields; the test only needs a period of 2024.)

  Then implement:
  - **`convex/schema.ts`:** in `tractNeighborhoods`, add `pieces: v.optional(v.array(v.object({ name: v.string(), share: v.number() }))),` after `city`. After it, add:

```ts
  // Each Milwaukee County tract's population (Census ACS B01003), weekly, to weight neighborhood figures.
  tractPopulations: defineTable({ geoid: v.string(), population: v.number(), period: v.number() }).index("by_geoid", ["geoid"]),
```

  - **`convex/buildStore.ts`:**
    - in `replaceTractNeighborhoods`, change the row validator to `v.object({ geoid: v.string(), city: v.array(v.object({ name: v.string(), share: v.number() })), pieces: v.array(v.object({ name: v.string(), share: v.number() })) })`;
    - add:

```ts
export const replaceTractPopulations = internalMutation({
  args: { rows: v.array(v.object({ geoid: v.string(), population: v.number(), period: v.number() })) },
  handler: async (ctx, { rows }) => {
    for (const r of await ctx.db.query("tractPopulations").collect()) await ctx.db.delete(r._id);
    for (const r of rows) await ctx.db.insert("tractPopulations", r);
  },
});
```

  - **`convex/build.ts`:**
    - in `refreshTractNeighborhoods`, change the rows line to:

```ts
    const rows = tracts.map((t) => ({ geoid: t.geoid, city: cityShares(t.geometry, hoods), pieces: cityShares(t.geometry, hoods, 1) })).filter((r) => r.pieces.length > 0);
```

    - after `notes.push(...(await refreshZipNeighborhoods(ctx, hoods)));` in `refreshNeighborhoods`, add `notes.push(...(await refreshTractPopulations(ctx)));`;
    - add the function below (and import `parseTractPopulations, scrubKey, tractPopulationUrl` from `./lib/census`):

```ts
// Each County tract's population from the Census Bureau, for neighborhood figures. Replaced only when read; the
// key never reaches a note.
async function refreshTractPopulations(ctx: ActionCtx): Promise<string[]> {
  try {
    const key = process.env.CENSUS_API_KEY;
    const city = await ctx.runQuery(internal.cityFigures.latestCityFigures, {});
    if (!key) throw new Error("CENSUS_API_KEY is not set");
    if (!city) throw new Error("no city figures stored, so no survey period");
    const rows = parseTractPopulations(await (await fetchOk(tractPopulationUrl(city.period, key), "Census tract populations")).json());
    if (rows.length === 0) throw new Error("the Census returned no tracts");
    await ctx.runMutation(internal.buildStore.replaceTractPopulations, { rows: rows.map((r) => ({ ...r, period: city.period })) });
    return [];
  } catch (e) {
    return [`Tract populations unavailable, kept last week's: ${scrubKey(message(e))}`];
  }
}
```

    - Check that `scrubKey` is exported from `convex/lib/census.ts` (Z1 added it). If its signature differs from `(s: string) => string`, adapt the call.

  - **Existing neighborhood tests that assert `notes` equal `[]`** now also need a Census fake. Add `census: () => [["B01003_001E", "state", "county", "tract"], ["4012", "55", "079", "186000"]]` to those `installFakeFetch` calls, and stub `CENSUS_API_KEY` plus insert a `cityFigures` row in those tests.
    - Do it with a small helper at the top of that describe: `const withCensus = async (t: Awaited<ReturnType<typeof seed>>) => { await t.run((ctx) => ctx.db.insert("cityFigures", { period: 2024, values: {}, fetchedAt: 0 })); vi.stubEnv("CENSUS_API_KEY", "TESTKEY"); };`, called after `seed()` in each test that expects exact notes.
    - Add `vi.unstubAllEnvs()` to the file's `afterEach`.

- [ ] **Step 6: Run the tests**

Run: `npx convex codegen 2>&1 | tail -1; npx vitest run convex/neighborhoods.test.ts convex/tracts.test.ts convex/build.test.ts tests/lib && npx tsc --noEmit -p . && npx tsc -p convex/tsconfig.json --noEmit`
Expected: PASS. (`convex codegen` only analyzes; it doesn't deploy. Verified on 2026-10-15 with `function-spec`.)

- [ ] **Step 7: Commit**

```bash
git add convex/lib/tractPlaces.ts convex/lib/census.ts convex/schema.ts convex/buildStore.ts convex/build.ts convex/neighborhoods.test.ts tests/lib/tractPlaces.test.ts tests/lib/census.test.ts convex/_generated/api.d.ts
git commit -m "feat: weekly every neighborhood piece of each tract and each tract's Census population

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: The tools answer by neighborhood

**Files:**
- Modify: `convex/tracts.ts`, `convex/tracts.test.ts`, `lib/ask/tools.ts`

**Interfaces:**
- Consumes: Task 1 (`buildNeighborhoods`, `versusCity`, `nMismatch`, `nTogether`, `asValue`, `NFigure`); Task 2 (`pieces`, `tractPopulations`).
- Produces (`convex/tracts.ts`):

```ts
export type NRow = NFigure & { verdict: NVerdict | null };
export type NRankDetail = { status: "ok"; tool: "rank-n"; header: Header; direction: "high" | "low"; city: NFigure | null; top: NRow[]; uncertain: NRow[]; small: { name: string; residents: number }[]; thin: string[]; key: string };
export type NRelateDetail = { status: "ok"; tool: "relate-n"; mode: "relate" | "mismatch"; a: Header; b: Header; city: { a: NFigure | null; b: NFigure | null }; n: number; strength: "too-few" | "little" | "weak" | "moderate" | "strong"; direction: "higher" | "lower"; aSide?: "high" | "low"; bSide?: "high" | "low"; cutA?: number; fits: { name: string; a: NRow; b: NRow }[]; close: { name: string; a: NRow; b: NRow }[]; uncertain: string[]; small: { name: string; residents: number }[]; key: string };
// RankDetail and RelateDetail gain: unitNote?: string
```

  - `rankParams` / `relateParams` gain `unit: z.enum(["neighborhood", "tract"]).optional()`.

- [ ] **Step 1: Write the failing tests.** Append to `convex/tracts.test.ts`:

```ts
describe("by neighborhood (neighborhood answers)", () => {
  // The 25 poverty tracts split across two City neighborhoods, every tract 2,000 people.
  async function seedNeighborhoods() {
    const t = await seedTracts();
    const rows = povertyRows().features.map((f) => f.attributes.GEOID as string);
    await t.run(async (ctx) => {
      for (const [i, geoid] of rows.entries()) {
        const old = await ctx.db.query("tractNeighborhoods").withIndex("by_geoid", (q) => q.eq("geoid", geoid)).first();
        const pieces = [{ name: i < 13 ? "North" : "South", share: 100 }];
        if (old) await ctx.db.patch(old._id, { pieces }); else await ctx.db.insert("tractNeighborhoods", { geoid, city: pieces, pieces });
        await ctx.db.insert("tractPopulations", { geoid, population: 2000, period: 2022 });
      }
    });
    return t;
  }
  it("ranks neighborhoods built from tracts, with the city figure and verdicts", async () => {
    const t = await seedNeighborhoods();
    installFakeFetch({ columns: POV_FIELDS, tractRows: povertyRows });
    const r = await t.withIdentity(reader).action(api.tracts.rankTracts, { code: "e02", column: "pov_rate", place: "City", year: "2022", direction: "high" });
    expect(r).toMatchObject({ status: "ok", tool: "rank-n", header: { code: "E02", kind: "rate" } });
    if (r.status !== "ok" || r.tool !== "rank-n") return;
    expect(r.top.map((x) => x.name)).toEqual(["South", "North"]);
    expect(r.city).toMatchObject({ name: "City of Milwaukee", residents: 50000 });
    expect(r.top[0].verdict).toBe("higher");
    expect(await t.query(api.tracts.tractDetail, { key: r.key, now: Date.now() })).toMatchObject({ tool: "rank-n" });
  });
  it("answers in tracts when asked, and says why when it falls back (review focus 1)", async () => {
    const t = await seedNeighborhoods();
    installFakeFetch({ columns: POV_FIELDS, tractRows: povertyRows });
    const asked = await t.withIdentity(reader).action(api.tracts.rankTracts, { code: "e02", column: "pov_rate", place: "City", year: "2022", direction: "high", unit: "tract" });
    expect(asked).toMatchObject({ tool: "rank" });
    expect((asked as { unitNote?: string }).unitNote).toBeUndefined();
    const fresh = await seedTracts(); // no populations stored
    const fell = await fresh.withIdentity(reader).action(api.tracts.rankTracts, { code: "e02", column: "pov_rate", place: "City", year: "2022", direction: "high" });
    expect(fell).toMatchObject({ tool: "rank", unitNote: "Neighborhood figures aren't ready yet, so these are census areas." });
  });
  it("keeps a count measure in tracts, saying it can't be combined", async () => {
    const t = await seedNeighborhoods();
    installFakeFetch({ columns: POV_FIELDS, tractRows: (u) => ({ features: povertyRows().features.map((f) => ({ attributes: { GEOID: f.attributes.GEOID, households: 100, pov_rate: f.attributes.pov_rate } })) }) });
    const r = await t.withIdentity(reader).action(api.tracts.rankTracts, { code: "e02", column: "households", place: "City", year: "2022", direction: "high" });
    expect(r).toMatchObject({ tool: "rank", unitNote: "This measure can't be combined across census areas, so these are census areas." });
  });
  it("compares two measures by neighborhood", async () => {
    const t = await seedNeighborhoods();
    installFakeFetch({ columns: POV_FIELDS, tractRows: povertyRows });
    const r = await t.withIdentity(reader).action(api.tracts.relateTracts, { a: { code: "e02", column: "pov_rate" }, b: { code: "e02", column: "pov_rate" }, place: "City", year: "2022", mode: "relate" });
    expect(r).toMatchObject({ status: "ok", tool: "relate-n", n: 2, strength: "too-few" });
  });
});
```

  If `household` counts read as kind `"count"` through `columnKind`, the third test pins the fallback. If `columnKind` reads `households` some other way, pick the fixture column `columnKind` treats as a count; check `convex/lib/tractData.ts`'s `columnKind`.

- [ ] **Step 2: Run them to watch them fail**

Run: `npx vitest run convex/tracts.test.ts -t "by neighborhood"`
Expected: FAIL, because `unit` and `rank-n` don't exist yet.

- [ ] **Step 3: Implement in `convex/tracts.ts`.**
  - **Imports:** add `import { buildNeighborhoods, nMismatch, nTogether, versusCity, type NFigure, type NVerdict, type Piece } from "./lib/neighborhoodFigures";`.
  - **Types:**
    - add the `NRow`, `NRankDetail` and `NRelateDetail` types from the Interfaces block;
    - add `unitNote?: string` to `RankDetail` and to `RelateDetail`;
    - add `NRankDetail | NRelateDetail` to `tractDetail`'s return union.
  - **The inputs query and helpers:**

```ts
// Neighborhood answers' inputs (spec 2026-10-15-neighborhood-answers §3): each tract's pieces and population.
export const neighborhoodInputs = internalQuery({
  args: {},
  handler: async (ctx) => ({
    pieces: (await ctx.db.query("tractNeighborhoods").collect()).map((r) => ({ geoid: r.geoid, pieces: r.pieces ?? [] })),
    pops: (await ctx.db.query("tractPopulations").collect()).map((r) => ({ geoid: r.geoid, population: r.population })),
  }),
});

const vUnit = v.optional(v.union(v.literal("neighborhood"), v.literal("tract")));
const UNIT_NOTE = {
  notRate: "This measure can't be combined across census areas, so these are census areas.",
  notReady: "Neighborhood figures aren't ready yet, so these are census areas.",
  property: "The City's property figures are medians, which can't be combined across census areas, so these are census areas.",
} as const;

// Neighborhood figures for one measure, or why they can't be built (the tract answer then carries the reason).
async function neighborhoodsOf(ctx: ActionCtx, values: TractValue[]): Promise<ReturnType<typeof buildNeighborhoods> | null> {
  const { pieces, pops } = await ctx.runQuery(internal.tracts.neighborhoodInputs, {});
  if (!pops.length) return null;
  return buildNeighborhoods(values, new Map(pieces.filter((p) => p.pieces.length).map((p) => [p.geoid, p.pieces as Piece[]])), new Map(pops.map((p) => [p.geoid, p.population])));
}
const nRow = (f: NFigure, city: NFigure | null): NRow => ({ ...f, verdict: versusCity(f, city) });
```

  - **`rankTracts`:**
    - args gain `unit: vUnit`;
    - right after `const head = …;` and before `const { key, save } = await store(…)`, add:

```ts
    const wantN = (args.unit ?? "neighborhood") === "neighborhood" && !area;
    let unitNote: string | undefined;
    if (wantN) {
      if (side.property) unitNote = UNIT_NOTE.property;
      else if (head.kind !== "rate") unitNote = UNIT_NOTE.notRate;
      else {
        const built = await neighborhoodsOf(ctx, all);
        if (!built) unitNote = UNIT_NOTE.notReady;
        else {
          const ranked = rankValues(built.figures.map((f) => ({ geoid: f.name, value: f.value, lo: f.lo, hi: f.hi, kind: f.kind })), args.direction, 10);
          const byName = new Map(built.figures.map((f) => [f.name, f]));
          const { key, save } = await store(ctx, { tool: "rank-n", ...args, year: head.year, code: head.code, column: head.column });
          const detail: NRankDetail = {
            status: "ok", tool: "rank-n", header: head, direction: args.direction, city: built.city,
            top: ranked.top.map((x) => nRow(byName.get(x.geoid)!, built.city)),
            uncertain: ranked.unreliable.map((x) => nRow(byName.get(x.geoid)!, built.city)),
            small: built.small, thin: built.thin, key,
          };
          await save(detail);
          return detail;
        }
      }
    }
```

    - and add `...(unitNote ? { unitNote } : {})` to the existing `detail: RankDetail = { … }` object;
    - since `rankTracts` now returns `NRankDetail` too, widen its return type to `Promise<RankDetail | NRankDetail | Refusal>`.
  - **`relateTracts`:**
    - args gain `unit: vUnit`;
    - widen its return type to `Promise<RelateAnswer | NRelateDetail | Refusal>`;
    - after `const va = ra.rows, vb = rb.rows;`, add:

```ts
    const wantN = (args.unit ?? "neighborhood") === "neighborhood" && !area;
    let unitNote: string | undefined;
    if (wantN) {
      if (ra.property || rb.property) unitNote = UNIT_NOTE.property;
      else if (ra.head(args.place, 0, 0).kind !== "rate" || rb.head(args.place, 0, 0).kind !== "rate") unitNote = UNIT_NOTE.notRate;
      else {
        const [na, nb] = await Promise.all([neighborhoodsOf(ctx, va.values), neighborhoodsOf(ctx, vb.values)]);
        if (!na || !nb) unitNote = UNIT_NOTE.notReady;
        else {
          const bBy = new Map(nb.figures.map((f) => [f.name, f]));
          const pairs = na.figures.flatMap((a) => (bBy.has(a.name) ? [{ name: a.name, a, b: bBy.get(a.name)! }] : []));
          const together = nTogether(pairs);
          const aSide = args.aSide ?? "high", bSide = args.bSide ?? "low";
          const mm = args.mode === "mismatch" && nb.city ? nMismatch(pairs, aSide, bSide, nb.city.value) : null;
          const both = (p: { name: string; a: NFigure; b: NFigure }) => ({ name: p.name, a: nRow(p.a, na.city), b: nRow(p.b, nb.city) });
          const { key, save } = await store(ctx, { tool: "relate-n", ...args });
          const detail: NRelateDetail = {
            status: "ok", tool: "relate-n", mode: args.mode,
            a: ra.head(args.place, pairs.length, 0), b: rb.head(args.place, pairs.length, 0),
            city: { a: na.city, b: nb.city }, n: together.n, strength: together.strength, direction: together.direction,
            ...(mm ? { aSide, bSide, cutA: mm.cutA } : {}),
            fits: (mm?.fits ?? []).map(both), close: (mm?.close ?? []).map(both), uncertain: mm?.uncertain ?? [],
            small: [...na.small, ...nb.small.filter((s) => !na.small.some((x) => x.name === s.name))], key,
          };
          await save(detail);
          return detail;
        }
      }
    }
```

    - and add `...(unitNote ? { unitNote } : {})` to the existing `detail: RelateDetail` object.
  - **`lib/ask/tools.ts`:**
    - add `unit: z.enum(["neighborhood", "tract"]).optional().describe("neighborhood (default): the City's neighborhoods, built from tracts (rates only); tract: census tracts, only when the person says census tracts or tracts")` to `rankParams` and to `relateParams`;
    - in the `rankTracts` and `relateTracts` descriptions, after their first sentence, add: `By default it answers in the City's neighborhoods, built from census tracts weighted by residents (rates only; counts, medians and the City's property file stay in tracts, and the card says so); pass unit "tract" only when the person asks about census tracts.`

- [ ] **Step 4: Run the tests**

Run: `npx convex codegen 2>&1 | tail -1; npx vitest run convex/tracts.test.ts tests/ui && npx tsc --noEmit -p . && npx tsc -p convex/tsconfig.json --noEmit`
Expected:
- PASS, including every existing `tracts.test.ts` test unchanged (review focus 1);
- new type errors elsewhere are expected only in UI code that switches on `tool`, which Task 4 handles. If `tsc` fails only there, note it and continue to Task 4 before committing, then commit Tasks 3 and 4 together.

- [ ] **Step 5: Commit** (or fold into Task 4's commit, per Step 4)

```bash
git add convex/tracts.ts convex/tracts.test.ts lib/ask/tools.ts convex/_generated/api.d.ts
git commit -m "feat: rankTracts and relateTracts answer by neighborhood (rates, populations stored); tracts on request, with the reason when they fall back

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: The neighborhood cards

**Files:**
- Create: `ui/lib/neighborhoodText.ts`, `ui/components/NeighborhoodCards.tsx`, `tests/ui/neighborhoodText.test.ts`
- Modify: `ui/components/AskCards.tsx`, `ui/components/TractCards.tsx` (`unitNote`), `ui/lib/tractShapes.ts` and `ui/components/CityMap.tsx` (`field`), `tests/ui/tractShapes.test.ts`, `ui/lib/shareCard.ts`, `tests/ui/shareCard.test.ts`

**Interfaces:**
- Consumes: Task 3 types (`NRankDetail`, `NRelateDetail`, `NRow`) via `@/convex/tracts` (type-only).
- Produces:
  - `nLead(r)`, `cityLine(r)`, `nTable(r)`, `nNotes(r)`, `nMap(r)`, `nExport(r, ctx)`, `nFollowUps(args, r)` (`ui/lib/neighborhoodText.ts`);
  - `NeighborhoodRankCard`, `NeighborhoodRelateCard`;
  - `tractShapesUrl(url, ids, field?)`;
  - `TractShapes.field?: string`.

- [ ] **Step 1: Write the failing test** in `tests/ui/neighborhoodText.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { toCsv } from "../../ui/lib/cardExport";
import { cityLine, nExport, nFollowUps, nLead, nMap, nNotes, nTable } from "../../ui/lib/neighborhoodText";
import type { NRankDetail, NRelateDetail } from "../../convex/tracts";

const head = { code: "E09", name: "Rent Burdened Households", column: "pct_burdened", meaning: "Percentage of renter households paying 30% or more of income on rent", kind: "rate" as const, place: "City", year: "2023", n: 300, leftOut: 0, confidence: "90% confidence (Census)", url: "https://x/FeatureServer/0", caveats: [] };
const row = (name: string, value: number, verdict: "higher" | "same" | "lower") => ({ name, value, lo: value - 2, hi: value + 2, kind: "moe90" as const, residents: 9000, tracts: 3, verdict });
const rank: NRankDetail = { status: "ok", tool: "rank-n", header: head, direction: "high", city: { name: "City of Milwaukee", value: 51.2, lo: 50.6, hi: 51.8, kind: "moe90", residents: 560000, tracts: 290 }, top: [row("Harambee", 68.1, "higher"), row("Lindsay Heights", 66, "higher"), row("Metcalfe Park", 64.4, "higher")], uncertain: [], small: [{ name: "Buchel Park", residents: 120 }], thin: [], key: "tracts:x" };
const ctx = { origin: "https://www.creamcityalmanac.app", date: "October 15, 2026" };

describe("neighborhood card words", () => {
  it("leads with the answer, in neighborhoods, and shows the city figure", () => {
    expect(nLead(rank)).toEqual({ strong: "Highest rent burdened households: Harambee, Lindsay Heights, Metcalfe Park.", rest: null });
    expect(cityLine(rank)).toBe("City of Milwaukee: 51.2% (50.6%–51.8%).");
  });
  it("rows read neighborhood, figure with range, and the verdict", () => {
    expect(nTable(rank).rows[0]).toEqual(["Harambee", "68.1% (66.1%–70.1%)", "clearly higher"]);
  });
  it("says how the figures were built, names who was left out, and keeps codes out of the words", () => {
    const n = nNotes(rank).join("\n");
    expect(n).toContain("Neighborhood figures are built from census areas, weighted by how many residents live in each part, so they're approximate.");
    expect(n).toContain("Left out (fewer than 1,000 residents): Buchel Park.");
    expect(n).toContain("Percentage of renter households paying 30% or more of income on rent");
    expect(n).not.toMatch(/\bE09\b|pct_burdened/);
  });
  it("credits DYCU on the export, with the dataset link", () => {
    const e = nExport(rank, ctx);
    expect(toCsv(e)).toContain("Data You Can Use");
    expect(e.notes.join("\n")).toContain("/d/E09");
  });
  it("maps the neighborhoods by the City layer's own names", () => {
    expect(nMap(rank)).toMatchObject({ fits: ["HARAMBEE", "LINDSAY HEIGHTS", "METCALFE PARK"], close: [], field: "NEIGHBORHD", noun: "neighborhood" });
  });
  it("offers the same question by census area", () => {
    expect(nFollowUps({ code: "E09", column: "pct_burdened", place: "City", year: "2023", direction: "high" }, rank)).toEqual([{ label: "BY CENSUS AREA", question: "Rank census tracts by Rent Burdened Households (E09, pct_burdened, City 2023), by census tract." }]);
  });
  it("leads a mismatch with the closest neighborhoods", () => {
    const rel: NRelateDetail = { status: "ok", tool: "relate-n", mode: "mismatch", a: head, b: { ...head, code: "H04", name: "Households with Broadband", meaning: "Percentage of households with a broadband subscription" }, city: { a: rank.city, b: { ...rank.city!, value: 80 } }, n: 120, strength: "moderate", direction: "lower", aSide: "high", bSide: "low", cutA: 58, fits: [], close: [{ name: "Riverwest", a: row("Riverwest", 60, "higher"), b: row("Riverwest", 75, "lower") }], uncertain: [], small: [], key: "tracts:y" };
    expect(nLead(rel).strong).toBe("No neighborhood clearly has high rent burdened households with low households with broadband. Possible: Riverwest.");
  });
});
```

- [ ] **Step 2: Run it to watch it fail**

Run: `npx vitest run tests/ui/neighborhoodText.test.ts`
Expected: FAIL, because the module doesn't exist.

- [ ] **Step 3: Write `ui/lib/neighborhoodText.ts`**

```ts
import type { FollowUp } from "@/ui/components/FollowUps";
import type { Header, NRankDetail, NRelateDetail, NRow } from "@/convex/tracts";
import type { NFigure } from "@/convex/lib/neighborhoodFigures";
import { exported, safeName, type CardExport, type Ctx } from "./cardExport";

// Neighborhood answers' words and export (spec 2026-10-15-neighborhood-answers §6). Code writes every sentence and
// figure; names, never dataset codes or column names, appear in the words (codes stay in links and the CSV).
export type NDetail = NRankDetail | NRelateDetail;
export const CITY_NEIGHBORHOODS_LAYER = "https://milwaukeemaps.milwaukee.gov/arcgis/rest/services/planning/special_districts/MapServer/4";
const SITE = "https://www.creamcityalmanac.app";

const plain = (h: Pick<Header, "name">) => h.name.replace(/\s*\([^)]*\)/g, "").toLowerCase();
const isPct = (h: Header) => /percent|percentage|share|rate|%/i.test(h.meaning) || h.kind === "rate";
const num = (v: number, h: Header) => (isPct(h) ? `${v.toFixed(1)}%` : v.toLocaleString("en-US", { maximumFractionDigits: 1 }));
const fig = (f: Pick<NFigure, "value" | "lo" | "hi"> | null, h: Header) =>
  !f ? "—" : f.lo === null || f.hi === null ? `${num(f.value, h)} (no range published)` : `${num(f.value, h)} (${num(f.lo, h)}–${num(f.hi, h)})`;
const VERDICT = { higher: "clearly higher", lower: "clearly lower", same: "about the same", uncertain: "too uncertain to say", "no-range": "no range published" } as const;
const verdict = (r: NRow) => (r.verdict ? VERDICT[r.verdict] : "—");
const names = (rs: { name: string }[]) => `${rs.slice(0, 3).map((r) => r.name).join(", ")}${rs.length > 3 ? ` and ${rs.length - 3} more` : ""}`;

export function nLead(r: NDetail): { strong: string; rest: string | null } {
  if (r.tool === "rank-n") return { strong: `${r.direction === "high" ? "Highest" : "Lowest"} ${plain(r.header)}: ${names(r.top)}.`, rest: null };
  const a = plain(r.a), b = plain(r.b);
  if (r.mode === "relate") {
    if (r.strength === "too-few") return { strong: "Too few neighborhoods have both figures to say.", rest: null };
    if (r.strength === "little") return { strong: `Across neighborhoods, ${a} and ${b} show little pattern.`, rest: null };
    return { strong: `Neighborhoods with higher ${a} tend to have ${r.direction} ${b} (a ${r.strength} pattern).`, rest: null };
  }
  const phrase = `${r.aSide ?? "high"} ${a} with ${r.bSide ?? "low"} ${b}`;
  if (r.fits.length) return { strong: `${r.fits.length === 1 ? "Clearest lead" : "Clear matches"}: ${names(r.fits)}.`, rest: r.close.length ? `Possible: ${names(r.close)}.` : null };
  if (r.close.length) return { strong: `No neighborhood clearly has ${phrase}. Possible: ${names(r.close)}.`, rest: null };
  return { strong: `No neighborhood has ${phrase}.`, rest: null };
}

export const cityLine = (r: NDetail): string | null => {
  const city = r.tool === "rank-n" ? r.city : r.city.b;
  const h = r.tool === "rank-n" ? r.header : r.b;
  return city ? `City of Milwaukee: ${fig(city, h)}.` : null;
};

export function nTable(r: NDetail): { head: string[]; rows: string[][] } {
  if (r.tool === "rank-n") return { head: ["Neighborhood", r.header.name, "Compared with the city"], rows: r.top.map((x) => [x.name, fig(x, r.header), verdict(x)]) };
  const rows = [...r.fits.map((p) => [p.name, fig(p.a, r.a), fig(p.b, r.b), "clear match"]), ...r.close.map((p) => [p.name, fig(p.a, r.a), fig(p.b, r.b), "possible match"])];
  return { head: ["Neighborhood", r.a.name, r.b.name, "Match"], rows };
}

const headers = (r: NDetail) => (r.tool === "rank-n" ? [r.header] : [r.a, r.b]);
export function nNotes(r: NDetail): string[] {
  const out = headers(r).map((h) => `${h.name}: ${h.meaning}`);
  out.push("Neighborhood figures are built from census areas, weighted by how many residents live in each part, so they're approximate.");
  if (r.tool === "relate-n" && r.mode === "mismatch" && r.cutA !== undefined) {
    out.push(`${r.aSide === "low" ? "Low" : "High"} ${plain(r.a)}: the third of neighborhoods with the ${r.aSide === "low" ? "least" : "most"} (${r.aSide === "low" ? "at or below" : "at or above"} ${num(r.cutA, r.a)}). ${r.bSide === "high" ? "High" : "Low"} ${plain(r.b)}: ${r.bSide === "high" ? "above" : "below"} the city's figure. "Clear" means a neighborhood's whole range is past both lines.`);
  } else {
    out.push("“Clearly higher” or “lower” means the neighborhood's whole range is above or below the city's figure.");
  }
  const conf = headers(r)[0].confidence;
  if (conf) out.push(`Ranges are the margins of error (${conf}).`);
  if (r.small.length) out.push(`Left out (fewer than 1,000 residents): ${r.small.map((s) => s.name).join(", ")}.`);
  if (r.tool === "rank-n" && r.thin.length) out.push(`Left out (too little data): ${r.thin.join(", ")}.`);
  return out;
}

const credits = (r: NDetail) => headers(r).map((h) => `Data You Can Use: ${h.name}, ${h.place} ${h.year}. ${SITE}/d/${h.code}`);

// The City's neighborhood layer names areas in capitals ("HARAMBEE"); the stored names are title case.
export function nMap(r: NDetail): { url: string; fits: string[]; close: string[]; field: string; noun: string } | null {
  const fits = (r.tool === "rank-n" ? r.top : r.fits).map((x) => x.name.toUpperCase());
  const close = r.tool === "rank-n" ? [] : r.close.map((x) => x.name.toUpperCase());
  return fits.length || close.length ? { url: CITY_NEIGHBORHOODS_LAYER, fits, close, field: "NEIGHBORHD", noun: "neighborhood" } : null;
}

export function nExport(r: NDetail, ctx: Ctx): CardExport {
  const lead = nLead(r);
  const t = nTable(r);
  const raw = (f: NFigure | null) => [f?.value ?? null, f?.lo ?? null, f?.hi ?? null, f?.residents ?? null];
  const rows = r.tool === "rank-n" ? r.top.map((x) => [x.name, ...raw(x), x.verdict ?? ""]) : [...r.fits, ...r.close].map((p) => [p.name, ...raw(p.a), ...raw(p.b)]);
  const head = r.tool === "rank-n"
    ? ["Neighborhood", r.header.name, "Range low", "Range high", "Residents", "Compared with the city"]
    : ["Neighborhood", r.a.name, `${r.a.name} low`, `${r.a.name} high`, "Residents", r.b.name, `${r.b.name} low`, `${r.b.name} high`, "Residents"];
  return {
    title: r.tool === "rank-n" ? `Neighborhoods · ${r.header.name}` : `Neighborhoods · ${r.a.name} and ${r.b.name}`,
    lines: [lead.rest ? `${lead.strong} ${lead.rest}` : lead.strong, ...(cityLine(r) ? [cityLine(r) as string] : [])],
    csv: { head, rows },
    text: t,
    notes: [...nNotes(r), ...credits(r), exported(ctx)],
    filename: safeName(["neighborhoods", ...headers(r).map((h) => h.code)]),
  };
}

export function nFollowUps(args: { code: string; column: string; place: string; year: string; direction?: string }, r: NDetail): FollowUp[] {
  const h = r.tool === "rank-n" ? r.header : r.a;
  return [{ label: "BY CENSUS AREA", question: `Rank census tracts by ${h.name} (${args.code}, ${args.column}, ${args.place} ${args.year}), by census tract.` }];
}
```

  The relate follow-up uses `r.a` and the rank wording. That's acceptable for the first slice; ledger it if you think it reads wrong.

- [ ] **Step 4: Map field.** In `ui/lib/tractShapes.ts`, replace `tractShapesUrl` with:

```ts
// The highlighted shapes' outlines. Ids are checked before they go in the where clause: tract ids or ZIPs (GEOID), or the
// City layer's neighborhood names (letters, digits, spaces and . ' & - /; quotes doubled), so nothing else is injected.
export function tractShapesUrl(featureServerUrl: string, ids: string[], field = "GEOID"): string | null {
  const ok = field === "GEOID" ? (g: string) => /^(\d{11}|\d{5})$/.test(g) : (g: string) => /^[A-Z0-9 .'&\/-]{1,60}$/.test(g);
  if (!ids.length || ids.some((g) => !ok(g))) return null;
  const where = `${field} IN (${ids.map((g) => `'${g.replace(/'/g, "''")}'`).join(",")})`;
  return `${featureServerUrl}/query?where=${encodeURIComponent(where)}&outFields=${field}&outSR=4326&f=geojson`;
}
```

  Add to `tests/ui/tractShapes.test.ts`:

```ts
  it("asks the City's neighborhood layer by name, doubling quotes and refusing anything else (review focus 3)", () => {
    expect(tractShapesUrl("https://x/MapServer/4", ["O'CONNOR", "ST. JOSEPH"], "NEIGHBORHD")).toContain(encodeURIComponent("NEIGHBORHD IN ('O''CONNOR','ST. JOSEPH')"));
    expect(tractShapesUrl("https://x/MapServer/4", ["X); DROP"], "NEIGHBORHD")).toBeNull();
  });
```

  In `ui/components/CityMap.tsx`:
  - `export type TractShapes = { url: string; fits: string[]; close: string[]; noun?: string; field?: string };`;
  - call `tractShapesUrl(t.url, [...t.fits, ...t.close], t.field)`;
  - every `["get", "GEOID"]` in the tract layers becomes `["get", t.field ?? "GEOID"]`.

- [ ] **Step 5: Cards and wiring.** Create `ui/components/NeighborhoodCards.tsx`:

```tsx
"use client";

import type { NRankDetail, NRelateDetail } from "@/convex/tracts";
import { cityLine, nExport, nLead, nMap, nNotes, nTable, type NDetail } from "@/ui/lib/neighborhoodText";
import { CityMap } from "./CityMapLoader";
import { ExportBar } from "./ExportBar";
import { ProvenanceTag } from "./ProvenanceTag";
import styles from "./ask.module.css";

// Neighborhood answers built from census tracts (spec 2026-10-15-neighborhood-answers §6), shaped like the ZIP health card.
function NeighborhoodCard({ r, kind }: { r: NDetail; kind: "neighborhood-rank" | "neighborhood-relate" }) {
  const lead = nLead(r);
  const t = nTable(r);
  const map = nMap(r);
  const title = r.tool === "rank-n" ? `Neighborhoods · ${r.header.name}` : `Neighborhoods · ${r.a.name} and ${r.b.name}`;
  return (
    <figure className={styles.excerpt} data-card={kind}>
      <figcaption className={styles.excerptTitle}>{title} <ProvenanceTag source="DYCU" /></figcaption>
      <p className={styles.tractSummary} data-summary><strong>{lead.strong}</strong>{lead.rest && ` ${lead.rest}`}</p>
      {cityLine(r) && <p className={styles.source} data-city>{cityLine(r)}</p>}
      {t.rows.length > 0 && (
        <div className={styles.tractScroll} tabIndex={0} role="region" aria-label={`${title}, scroll sideways for more`}>
          <table className={styles.excerptTable}>
            <thead><tr>{t.head.map((h, i) => <th key={i} scope="col">{h}</th>)}</tr></thead>
            <tbody>{t.rows.map((row) => <tr key={row[0]}>{row.map((c, i) => (i === 0 ? <th key={i} scope="row">{c}</th> : <td key={i}>{c}</td>))}</tr>)}</tbody>
          </table>
        </div>
      )}
      {map && <div className={styles.tractMap} data-tract-map><CityMap tracts={map} height={220} /></div>}
      {nNotes(r).map((n) => <p key={n} className={styles.source}>{n}</p>)}
      <ExportBar make={(ctx) => nExport(r, ctx)} />
    </figure>
  );
}
export const NeighborhoodRankCard = ({ r }: { r: NRankDetail }) => <NeighborhoodCard r={r} kind="neighborhood-rank" />;
export const NeighborhoodRelateCard = ({ r }: { r: NRelateDetail }) => <NeighborhoodCard r={r} kind="neighborhood-relate" />;
```

  In `ui/components/AskCards.tsx`'s `rankTracts` and `relateTracts` renders, branch inside the `card` and `next` callbacks:
  - **rank card:** `(r) => r.tool === "rank-n" ? <ShareScope tool="rankTracts" args={props.parameters}><NeighborhoodRankCard r={r} /></ShareScope> : <ShareScope …><RankCard r={r} onOpen={onOpen} /></ShareScope>`;
  - **rank follow-ups:** `(r) => r.tool === "rank-n" ? nFollowUps(props.parameters as never, r) : areaFollowUps(…existing…)`;
  - **relate:** the same, with `NeighborhoodRelateCard` and `relate-n`.

  Import `NeighborhoodRankCard, NeighborhoodRelateCard` and `nFollowUps`.

  In `ui/components/TractCards.tsx`, render `{r.unitNote && <p className={styles.source} data-unit-note>{r.unitNote}</p>}` right under the summary line of `RankCard` and `RelateCard` (read `unitNote` from `full ?? r`).

  In `ui/lib/shareCard.ts`:
  - `rankTracts` becomes `ok && r.tool === "rank" ? … : ok && r.tool === "rank-n" ? card(nExport(r as never, ctx)) : null`;
  - `relateTracts` likewise with `relate-n`;
  - import `nExport` from `./neighborhoodText`. That file's value imports are `./cardExport` only, and its `@/` imports are type-only, so it's Convex-safe.

  In `tests/ui/shareCard.test.ts`, add a case: `shareCard("rankTracts", <the rank fixture above>, ctx)` returns a card whose notes contain "Data You Can Use".

- [ ] **Step 6: Run tests and typechecks**

Run: `npx vitest run tests/ui && npx tsc --noEmit -p . && npx tsc -p convex/tsconfig.json --noEmit && npm run build > /tmp/n-build.log 2>&1; echo build=$?`
Expected: PASS and `build=0`.

- [ ] **Step 7: Commit**

```bash
git add ui/lib/neighborhoodText.ts ui/components/NeighborhoodCards.tsx tests/ui/neighborhoodText.test.ts ui/components/AskCards.tsx ui/components/TractCards.tsx ui/lib/tractShapes.ts ui/components/CityMap.tsx tests/ui/tractShapes.test.ts ui/lib/shareCard.ts tests/ui/shareCard.test.ts
git commit -m "feat: neighborhood rank and compare cards: code's lead, city figure, ranges, neighborhood map, DYCU credit; tract cards say why they're tracts

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Routing, scripted model, grading list, docs

**Files:**
- Modify: `lib/ask/prompt.ts`, `lib/ask/model.ts`, `tests/ui/askTools.test.ts`, `scripts/ask-questions.ts`, `e2e/ask.spec.ts`, `DESIGN.md`
- Create: `docs/decisions/052-neighborhood-answers.md`

- [ ] **Step 1: Write the failing test.** Add to `tests/ui/askTools.test.ts`:

```ts
describe("neighborhood answers routing (spec 2026-10-15-neighborhood-answers §2)", () => {
  it("words decide, then the topic", () => {
    expect(ASK_PROMPT).toContain("If the person says \"neighborhood\", answer by neighborhood; if they say \"ZIP\", use zipHealth or zipProfile.");
    expect(ASK_PROMPT).toContain("Housing, income, internet, education and jobs \"where\" questions answer by neighborhood with the tract tools (unit neighborhood, the default)");
    expect(ASK_PROMPT).toContain("pass unit \"tract\" only when the person asks about census tracts");
  });
});
```

Run: `npx vitest run tests/ui/askTools.test.ts`
Expected: FAIL.

- [ ] **Step 2: The rule.** In `lib/ask/prompt.ts`, after the `zipHealth` line (`- Where-questions about health, food, …`), add:

```
- If the person says "neighborhood", answer by neighborhood; if they say "ZIP", use zipHealth or zipProfile. Housing, income, internet, education and jobs "where" questions answer by neighborhood with the tract tools (unit neighborhood, the default): rankTracts for "which neighborhoods have the most …", relateTracts for "low despite high" or "do they go together". Pass unit "tract" only when the person asks about census tracts. If the card says the figures are census areas, its note says why; don't repeat it.
```

Run: `npx vitest run tests/ui/askTools.test.ts`
Expected: PASS.

- [ ] **Step 3: The scripted model** (`lib/ask/model.ts`):
  - add `unit: "tract"` to every existing `call("rankTracts", { … })` and `call("relateTracts", { … })` argument object (review focus 4), and to the routing comment;
  - add, before the `"rank tracts"` branch: `: question.includes("neighborhoods with the most") ? call("rankTracts", { code: "E02", column: "pov_rate", place: "County", year: "2023", direction: "high" })`;
  - add to the routing comment: `"neighborhoods with the most" → rankTracts E02 County 2023 by neighborhood (the default unit);`.

  Check with `grep -n 'call("rankTracts"\|call("relateTracts"' lib/ask/model.ts`. Every line but the new one must contain `unit: "tract"`.

- [ ] **Step 4: Browser test.** In `e2e/ask.spec.ts`'s "signed in" describe, after "rank tracts by poverty"-style tests, add:

```ts
  test("a which-neighborhoods question draws the neighborhood card with the city figure", async ({ page }) => {
    test.skip(!(await dycuUp(page)), "DYCU unreachable");
    await ask(page, "Which neighborhoods with the most poverty?");
    const card = page.locator("[data-card=neighborhood-rank]:visible");
    const fallback = page.locator("[data-unit-note]:visible");
    await expect(card.or(fallback)).toBeVisible({ timeout: 60_000 });
    test.skip(await fallback.isVisible(), "Neighborhood figures aren't stored on this deployment yet (run build:refreshNeighborhoods)");
    await expect(card.locator("[data-city]")).toContainText("City of Milwaukee:");
    await expect(card).not.toContainText(/\bE02\b|pov_rate/);
  });
```

- [ ] **Step 5: Grading list.** In `scripts/ask-questions.ts`, add:

```ts
  { q: "Which neighborhoods have the highest rent burden?", tool: "rankTracts", expect: { tool: "rank-n" }, final: true },
  { q: "Do neighborhoods with more renters have less internet at home?", tool: "relateTracts", expect: { tool: "relate-n" }, final: true },
```

  Run: `npx vitest run tests/ui/askExamples.test.ts`
  Expected: PASS.

- [ ] **Step 6: DESIGN.md and decision 052.**
  - **DESIGN.md:** after "### ZIP health (Ask)", add:

```markdown
### Neighborhood figures (Ask)
`[data-card=neighborhood-rank]` and `[data-card=neighborhood-relate]`: the City's neighborhoods, built from DYCU's census tracts weighted by residents (rates only). Bold code-written lead naming neighborhoods; "City of Milwaukee: {figure} ({range})."; rows with ranges and a verdict against the city (or the match strength); the matching neighborhoods outlined on the map; notes on how the figures are built, the cutoff, the range, who was left out (under 1,000 residents, too little data); DYCU credit. A "BY CENSUS AREA" button asks the same question by tract. Tract cards that answer a neighborhood question say why they're tracts (`[data-unit-note]`).
```

  - **`docs/decisions/052-neighborhood-answers.md`**, in 050's format:
    - **Decision:** rank and compare-two answer by the City's neighborhoods, built from DYCU's census tracts weighted by residents; tracts on request.
    - **Why:** readers think in neighborhoods; ZIP health covers health and food by ZIP, and the rest of DYCU's measures still answered in tracts.
    - **Options:**
      - build from tracts weighted by residents (chosen);
      - DYCU's 27 areas only (published figures, but no health or food measures and only 27 areas);
      - keep tracts and reword them.
    - **Chose:** Tarik, 2026-10-15. Revisits decision 035 ("never blend tracts"): the blend is labeled approximate, and the tract answer is one click away.
    - **Gave up:**
      - exactness: residents are assumed evenly spread within a tract, and household rates are weighted by people;
      - counts and medians stay in tracts;
      - neighborhoods under 1,000 residents are left out;
      - the City's property file stays in tracts;
      - year-to-year change by neighborhood is not in this slice.
    - **How we'll know:**
      - the City total built from the pieces is within 3% of the Census Bureau's City population;
      - the graded neighborhood questions reach `rank-n` / `relate-n`;
      - nobody reports a neighborhood figure far from DYCU's own portrait for its 27 areas.
    - **What actually happened:** blank.

- [ ] **Step 7: Whole suite, typecheck and build**

Run: `npx vitest run > /tmp/n-suite.log 2>&1; grep -E "Test Files|Tests " /tmp/n-suite.log; npx tsc --noEmit -p . && npx tsc -p convex/tsconfig.json --noEmit && npm run build > /tmp/n-build.log 2>&1; echo build=$?`
Expected: all pass and `build=0`. If only `convex/buildStore.test.ts` times out under load, rerun it alone.

- [ ] **Step 8: Commit**

```bash
git add lib/ask/prompt.ts lib/ask/model.ts tests/ui/askTools.test.ts scripts/ask-questions.ts e2e/ask.spec.ts DESIGN.md docs/decisions/052-neighborhood-answers.md
git commit -m "feat: neighborhood routing, scripted route and browser check; graded questions; DESIGN.md and decision 052

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Live checks (needs Tarik's OK)

- [ ] **Step 1: Ask Tarik** for:
  - a dev push;
  - one dev `build:refreshNeighborhoods`, which re-reads the City's neighborhoods, DYCU's tract outlines, ZIP outlines and now tract populations;
  - a real-AI grade of the two new questions and the tract and ZIP questions (about 10 questions, ~$1.20).

- [ ] **Step 2 (with OK):** `npx convex dev --once && npx convex run build:refreshNeighborhoods`
  Expected: `[]`.

- [ ] **Step 3: Check the data.** Using a one-off `npx convex run` on dev queries, or a dev-only `npx convex data` read:
  - `tractPopulations` holds about 300 rows;
  - most `tractNeighborhoods` rows have `pieces`;
  - **the City total check:** Σ over City tracts of `population × min(100, Σ shares)/100` is within 3% of the stored city population. Compute it with `npx convex data tractPopulations` and `npx convex data tractNeighborhoods` exported to JSON, then a small `node -e` script. The city figure is the `cityFigures` row's population value (the code the ZIP card uses).

- [ ] **Step 4: Graded run.** `npm run ask:card -- --only=<1-based indices of the two new questions and the tract/ZIP questions> --cap=2`. Report each question's result. The report card's `--only` numbering starts at 1.
