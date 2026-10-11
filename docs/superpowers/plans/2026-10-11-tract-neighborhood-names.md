# City Neighborhood Names per Tract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every tract row names the City's official neighborhoods covering it (biggest first, "+N" for the rest), and every DYCU area that includes it, not just the first.

**Architecture:** The weekly neighborhoods refresh downloads DYCU's 301 tract outlines, matches each against the City's 190 neighborhood shapes by counting grid points, and stores each tract's neighborhoods with their shares in a new `tractNeighborhoods` table. The tract tools load that table once per answer and give every row `city: CityShare[]` and `dycu: string[]` instead of `neighborhood: string | null`. The cards render a Neighborhood column (native `<details>` for "+N") and a DYCU area column.

**Tech Stack:** Convex (actions, mutations, convex-test), Next.js 16 / React, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-11-tract-neighborhood-names-design.md`

## Global Constraints

- Keep a City neighborhood only when it covers **≥ 10%** of the tract (rounded whole percent); sort biggest first, ties by name.
- Grid: **40×40** over the tract's box; if fewer than **200** points land inside, retry at **80**, then **160**.
- "**mostly X**" when X's share is **≥ 50**, otherwise "**partly X**".
- "—" (U+2014) for an empty Neighborhood or DYCU area cell; never a guessed name.
- The tract-outline address is never hard-coded: E02's newest **County** member's `featureServerUrl`.
- The `tractNeighborhoods` table is replaced only when this run read both the City shapes and the tract outlines and matched at least one tract; otherwise keep last week's and add the note `Tract neighborhoods unavailable, kept last week's: <reason>`.
- No new dependencies. Reuse `bboxOf`, `inBbox`, `inShape` (`convex/lib/geo.ts`).
- Footer text (verbatim): `Neighborhood: the City's official neighborhoods covering at least 10% of the tract, biggest first. DYCU area: the areas DYCU's reports group the tract into.`
- Never stage `.superpowers/` or `clerk-creamcityalmanac.app.zone`. Commit trailer: `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- Pushing to the development Convex deployment and running a build there each need Tarik's explicit OK (Task 7).

## Review Focus

1. **A card cached before this change** (tract details live 24 h in `mapCache`) has `neighborhood` and no `city`/`dycu`: the card must render "—", not crash. Pinned in Task 5 (`dycuText(undefined)` test; `Places` guards `city?.length`).
2. **The City layer fails but the tract layer works** (or the reverse): the match must not be rebuilt from missing shapes. Pinned in Task 3.
3. **DYCU's service returns a truncated list** (`exceededTransferLimit`): storing a partial match would silently drop tracts. `parseTractShapes` throws; pinned in Task 1.
4. **A 2019 or 2015–16 dataset** whose tract ids aren't on the 2020 map: rows show "—" (no stored match), never a neighbor's name. Covered by the `city.get(geoid) ?? []` path; pinned in Task 4.
5. **Phone width with the extra column:** the table scrolls inside its card; the page never scrolls sideways at 390 px. Pinned in Task 6's browser test.

Checked 2026-10-11 against dev: of 93 dataset years with tract maps, only `access-to-grocery-stores` 2019 (6 of 263 ids) and `school-proficiency` 2015–16 (671 non-tract ids) are not on the 2020 map. They will show "—".

---

### Task 1: Matching a tract to City neighborhoods

**Files:**
- Create: `convex/lib/tractPlaces.ts`
- Test: `tests/lib/tractPlaces.test.ts`

**Interfaces:**
- Consumes: `bboxOf`, `inBbox`, `inShape`, `Geometry`, `Bbox`, `Point` from `convex/lib/geo.ts`.
- Produces:
  - `type CityShare = { name: string; share: number }`
  - `type Hood = { name: string; geometry: Geometry; bbox: Bbox }`
  - `insidePoints(tract: Geometry): Point[]`
  - `cityShares(tract: Geometry, hoods: Hood[]): CityShare[]`
  - `parseTractShapes(geojson: unknown): { geoid: string; geometry: Geometry }[]`
  - `allTractsUrl(featureServerUrl: string): string`
  - `newestCountyUrl(members: { place: string; year: string; url: string }[]): string | null`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/lib/tractPlaces.test.ts
import { describe, expect, it } from "vitest";
import type { Geometry } from "../../convex/lib/geo";
import { bboxOf } from "../../convex/lib/geo";
import { allTractsUrl, cityShares, insidePoints, newestCountyUrl, parseTractShapes } from "../../convex/lib/tractPlaces";

const box = (w: number, s: number, e: number, n: number): Geometry => ({ type: "Polygon", coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] });
const hood = (name: string, g: Geometry) => ({ name, geometry: g, bbox: bboxOf(g) });
const tract = box(0, 0, 10, 10);

describe("cityShares", () => {
  it("splits a tract between two neighborhoods by area", () => {
    expect(cityShares(tract, [hood("West", box(0, 0, 5, 10)), hood("East", box(5, 0, 10, 10))])).toEqual([{ name: "East", share: 50 }, { name: "West", share: 50 }]);
  });
  it("drops a piece under 10% and keeps one at 10% (grid columns are 0.25 wide)", () => {
    // 0..0.8 holds 3 of 40 columns (7.5%, rounds to 8); 0..1.0 holds 4 (10%).
    expect(cityShares(tract, [hood("Sliver", box(0, 0, 0.8, 10)), hood("Rest", box(0.8, 0, 10, 10))]).map((s) => s.name)).toEqual(["Rest"]);
    expect(cityShares(tract, [hood("Edge", box(0, 0, 1, 10)), hood("Rest", box(1, 0, 10, 10))])).toEqual([{ name: "Rest", share: 90 }, { name: "Edge", share: 10 }]);
  });
  it("leaves a tract's hole out", () => {
    const donut: Geometry = { type: "Polygon", coordinates: [box(0, 0, 10, 10).coordinates[0], [[2.5, 2.5], [7.5, 2.5], [7.5, 7.5], [2.5, 7.5], [2.5, 2.5]]] };
    expect(cityShares(donut, [hood("Middle", box(2.5, 2.5, 7.5, 7.5))])).toEqual([]);
    expect(cityShares(donut, [hood("All", box(-1, -1, 11, 11))])).toEqual([{ name: "All", share: 100 }]);
  });
  it("returns nothing for a tract outside every neighborhood, or with no area", () => {
    expect(cityShares(tract, [hood("Far", box(50, 50, 60, 60))])).toEqual([]);
    expect(cityShares(box(1, 1, 1, 1), [hood("All", box(-1, -1, 11, 11))])).toEqual([]);
  });
  it("samples a thin diagonal tract on a finer grid", () => {
    const sliver: Geometry = { type: "Polygon", coordinates: [[[0, 0], [0.2, 0], [10.2, 10], [10, 10], [0, 0]]] };
    expect(insidePoints(sliver).length).toBeGreaterThanOrEqual(200);
    const [first] = cityShares(sliver, [hood("South", box(-1, -1, 11, 5)), hood("North", box(-1, 5, 11, 11))]);
    expect(first.share).toBeGreaterThanOrEqual(45);
  });
});

describe("parseTractShapes", () => {
  it("keeps 11-digit GEOIDs with polygons", () => {
    const g = box(0, 0, 1, 1);
    const layer = { type: "FeatureCollection", features: [
      { properties: { GEOID: "55079186000" }, geometry: g },
      { properties: { GEOID: "1860" }, geometry: g },
      { properties: { GEOID: "55079000101" }, geometry: null },
    ] };
    expect(parseTractShapes(layer)).toEqual([{ geoid: "55079186000", geometry: g }]);
  });
  it("refuses a truncated list, so a partial match is never stored", () => {
    expect(() => parseTractShapes({ type: "FeatureCollection", features: [], properties: { exceededTransferLimit: true } })).toThrow(/truncated/);
    expect(() => parseTractShapes({ error: { message: "x" } })).toThrow(/no features/);
  });
});

describe("addresses", () => {
  it("asks for every tract's outline", () => {
    expect(allTractsUrl("https://x.test/FeatureServer/0")).toBe("https://x.test/FeatureServer/0/query?where=1%3D1&outFields=GEOID&outSR=4326&f=geojson");
  });
  it("picks the newest County map", () => {
    expect(newestCountyUrl([{ place: "City", year: "2024", url: "c24" }, { place: "County", year: "2022", url: "k22" }, { place: "County", year: "2024", url: "k24" }])).toBe("k24");
    expect(newestCountyUrl([{ place: "City", year: "2024", url: "c24" }])).toBeNull();
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/lib/tractPlaces.test.ts`
Expected: FAIL, "Failed to resolve import ../../convex/lib/tractPlaces".

- [ ] **Step 3: Write the implementation**

```ts
// convex/lib/tractPlaces.ts
import { bboxOf, inBbox, inShape, type Bbox, type Geometry, type Point } from "./geo";

// A tract's City neighborhoods by share of its area (docs/superpowers/specs/2026-10-11-tract-neighborhood-names-design.md).
export type CityShare = { name: string; share: number };
export type Hood = { name: string; geometry: Geometry; bbox: Bbox };

const MIN_SHARE = 10; // percent of the tract
const MIN_POINTS = 200;
const GRIDS = [40, 80, 160];

// Points on a grid over the tract's box that fall inside the tract; a thin tract gets a finer grid.
// ponytail: sampled, about ±2% at 40×40; exact overlap would need a geometry library.
export function insidePoints(tract: Geometry): Point[] {
  const b = bboxOf(tract);
  let inside: Point[] = [];
  for (const n of GRIDS) {
    inside = [];
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const p = { lon: b.minLon + ((i + 0.5) * (b.maxLon - b.minLon)) / n, lat: b.minLat + ((j + 0.5) * (b.maxLat - b.minLat)) / n };
      if (inShape(p, tract)) inside.push(p);
    }
    if (inside.length >= MIN_POINTS) break;
  }
  return inside;
}

// Each point counts for the City neighborhood it falls in; neighborhoods under 10% of the tract are left out.
export function cityShares(tract: Geometry, hoods: Hood[]): CityShare[] {
  const inside = insidePoints(tract);
  if (!inside.length) return [];
  const counts = new Map<string, number>();
  for (const p of inside) {
    const h = hoods.find((x) => inBbox(p, x.bbox) && inShape(p, x.geometry));
    if (h) counts.set(h.name, (counts.get(h.name) ?? 0) + 1);
  }
  return [...counts]
    .map(([name, c]) => ({ name, share: Math.round((100 * c) / inside.length) }))
    .filter((s) => s.share >= MIN_SHARE)
    .sort((x, y) => y.share - x.share || x.name.localeCompare(y.name));
}

type Feature = { properties?: { GEOID?: unknown } | null; geometry?: { type?: unknown; coordinates?: unknown } | null };

// DYCU's tract outlines. A truncated answer is refused: a partial match would drop tracts without saying so.
export function parseTractShapes(geojson: unknown): { geoid: string; geometry: Geometry }[] {
  const fc = geojson as { features?: Feature[]; properties?: { exceededTransferLimit?: boolean }; exceededTransferLimit?: boolean } | null;
  if (fc?.properties?.exceededTransferLimit || fc?.exceededTransferLimit) throw new Error("the tract outline list was truncated");
  if (!Array.isArray(fc?.features)) throw new Error("tract outlines returned no features");
  return fc.features.flatMap((f) => {
    const geoid = String(f.properties?.GEOID ?? "");
    const g = f.geometry;
    if (!/^\d{11}$/.test(geoid) || !g || (g.type !== "Polygon" && g.type !== "MultiPolygon") || !Array.isArray(g.coordinates)) return [];
    return [{ geoid, geometry: { type: g.type, coordinates: g.coordinates } as Geometry }];
  });
}

export const allTractsUrl = (featureServerUrl: string) => `${featureServerUrl}/query?where=1%3D1&outFields=GEOID&outSR=4326&f=geojson`;

// E02's newest County map: every county tract, the same outlines the count cards' tract maps use.
export const newestCountyUrl = (members: { place: string; year: string; url: string }[]): string | null =>
  members.filter((m) => m.place === "County").sort((x, y) => Number(y.year.slice(0, 4)) - Number(x.year.slice(0, 4)))[0]?.url ?? null;
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run tests/lib/tractPlaces.test.ts`
Expected: PASS (10 tests). If the "drops under 10%" case fails on rounding, check the column-center arithmetic in the test comment before touching `MIN_SHARE`.

- [ ] **Step 5: Use `newestCountyUrl` in the count cards' map (one copy of the rule)**

In `convex/city.ts`, replace
```ts
        const url = (e02?.members ?? []).filter((m) => m.place === "County").sort((x, y) => Number(y.year.slice(0, 4)) - Number(x.year.slice(0, 4)))[0]?.url;
```
with
```ts
        const url = newestCountyUrl(e02?.members ?? []);
```
and add `import { newestCountyUrl } from "./lib/tractPlaces";`.

Run: `npx tsc --noEmit -p . && npx vitest run convex/city.test.ts`
Expected: no type errors; city tests PASS.

- [ ] **Step 6: Commit**

```bash
git add convex/lib/tractPlaces.ts tests/lib/tractPlaces.test.ts convex/city.ts
git commit -m "feat: match a tract to the City's neighborhoods by counting grid points

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Every DYCU area a tract belongs to

**Files:**
- Modify: `convex/lib/tractNames.ts`
- Test: `tests/lib/tractNames.test.ts` (create)

**Interfaces:**
- Produces: `neighborhoodsFor(tract: string, year: number, defs: DycuDef[]): string[]` (replaces `neighborhoodFor`; `latestDefYear` unchanged).

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/tractNames.test.ts
import { describe, expect, it } from "vitest";
import { neighborhoodsFor } from "../../convex/lib/tractNames";

const defs = [
  { name: "Harambee", tracts: [{ years: [2023], tracts: ["1860", "45"] }] },
  { name: "Hillside", tracts: [{ years: [2023], tracts: ["1860"] }] },
  { name: "Lindsay Heights", tracts: [{ years: [2022, 2023], tracts: ["1860"] }] },
];

describe("neighborhoodsFor", () => {
  it("names every DYCU area that lists the tract that year, in definition order", () => {
    expect(neighborhoodsFor("1860", 2023, defs)).toEqual(["Harambee", "Hillside", "Lindsay Heights"]);
    expect(neighborhoodsFor("1860", 2022, defs)).toEqual(["Lindsay Heights"]);
  });
  it("returns none for a tract in no area", () => {
    expect(neighborhoodsFor("601", 2023, defs)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/lib/tractNames.test.ts`
Expected: FAIL, "neighborhoodsFor is not a function" (or a missing-export error).

- [ ] **Step 3: Replace `neighborhoodFor`**

In `convex/lib/tractNames.ts`, replace the comment and function:
```ts
// A tract's DYCU neighborhood for a year, from the translator's definitions (DYCU's reports name the tracts). DYCU
// defines its 28 report neighborhoods only, so most tracts have none: the card shows "—", never a guess.
export type DycuDef = { name: string; tracts?: { years: number[]; tracts: string[] }[] };

export function neighborhoodFor(tract: string, year: number, defs: DycuDef[]): string | null {
  for (const d of defs) for (const entry of d.tracts ?? []) if (entry.years.includes(year) && entry.tracts.includes(tract)) return d.name;
  return null;
}
```
with
```ts
// A tract's DYCU areas for a year, from the translator's definitions (DYCU's reports name the tracts). A tract can be
// in several (1860 is in Harambee, Hillside and Lindsay Heights); most tracts are in none, and the card shows "—".
export type DycuDef = { name: string; tracts?: { years: number[]; tracts: string[] }[] };

export const neighborhoodsFor = (tract: string, year: number, defs: DycuDef[]): string[] =>
  defs.filter((d) => (d.tracts ?? []).some((e) => e.years.includes(year) && e.tracts.includes(tract))).map((d) => d.name);
```

- [ ] **Step 4: Run it to see it pass**

Run: `npx vitest run tests/lib/tractNames.test.ts`
Expected: PASS (2 tests). (`convex/tracts.ts` still imports `neighborhoodFor`; Task 4 changes that. Don't run tsc here.)

- [ ] **Step 5: Commit**

```bash
git add convex/lib/tractNames.ts tests/lib/tractNames.test.ts
git commit -m "feat: every DYCU area a tract belongs to, not just the first

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: The weekly match, stored

**Files:**
- Modify: `convex/schema.ts` (new table after `neighborhoods`)
- Modify: `convex/buildStore.ts` (new mutation after `replaceNeighborhoods`)
- Modify: `convex/build.ts` (`refreshNeighborhoods`, plus a helper)
- Modify: `tests/helpers/fakeFetch.ts` (tract-outline route)
- Test: `convex/neighborhoods.test.ts`

**Interfaces:**
- Consumes: `cityShares`, `parseTractShapes`, `allTractsUrl`, `newestCountyUrl`, `Hood` (Task 1); `internal.tracts.familyForTracts`.
- Produces: table `tractNeighborhoods: { geoid: string; city: { name: string; share: number }[] }` with index `by_geoid`; `internal.buildStore.replaceTractNeighborhoods({ rows })`.

- [ ] **Step 1: Add the fake tract-outline route**

In `tests/helpers/fakeFetch.ts`, add to `FakeOptions`:
```ts
  tractShapes?: unknown; // DYCU's tract outlines (f=geojson)
  tractShapesStatus?: number;
```
and add this route **before** the existing `if (url.includes("/FeatureServer/0/query?") && opts.tractRows)` line:
```ts
    if (url.includes("/FeatureServer/0/query?") && url.includes("f=geojson") && (opts.tractShapes || opts.tractShapesStatus))
      return json(opts.tractShapesStatus ?? 200, opts.tractShapes ?? {});
```

- [ ] **Step 2: Write the failing tests**

In `convex/neighborhoods.test.ts`:

(a) After the `layer` constant, add:
```ts
// Two tracts: one on Harambee's square (100% Harambee), one far outside the City (not stored).
const tractLayer = { type: "FeatureCollection", features: [
  { properties: { GEOID: "55079186000" }, geometry: { type: "Polygon", coordinates: [ring] } },
  { properties: { GEOID: "55079060100" }, geometry: { type: "Polygon", coordinates: [[[-88.0, 42.9], [-87.99, 42.9], [-87.99, 42.91], [-88.0, 42.91], [-88.0, 42.9]]] } },
] };
const E02_URL = "https://services.test/arcgis/rest/services/2024%20County%20Poverty/FeatureServer/0";
```

(b) In `seed()`, inside `t.run`, after the N03 lines, add E02 with a County map:
```ts
    await ctx.db.insert("families", { ...family("dataset:poverty", "E02", "Households Living in Poverty"), kind: "dataset" as const, topic: "Economy" });
    await ctx.db.insert("members", { ...member("dataset:poverty", "p24", "Poverty 2024"), kind: "dataset" as const, place: "County", years: [2024], yearLabel: "2024", featureServerUrl: E02_URL });
```

(c) Change the first test's fake fetch to `installFakeFetch({ cityNeighborhoods: layer, tractShapes: tractLayer });` so its `expect(notes).toEqual([])` still holds.

(d) Add these tests at the end of the `describe("refreshNeighborhoods", …)` block:
```ts
  const tractRows = (t: Awaited<ReturnType<typeof seed>>) =>
    t.run(async (ctx) => (await ctx.db.query("tractNeighborhoods").collect()).map((r) => [r.geoid, r.city]));

  it("stores each tract's City neighborhoods, leaving out tracts outside the City", async () => {
    const t = await seed();
    installFakeFetch({ cityNeighborhoods: layer, tractShapes: tractLayer });
    expect(await t.action(internal.build.refreshNeighborhoods, {})).toEqual([]);
    expect(await tractRows(t)).toEqual([["55079186000", [{ name: "Harambee", share: 100 }]]]);
  });
  it("keeps last week's match when the tract outlines are down, and says so", async () => {
    const t = await seed();
    installFakeFetch({ cityNeighborhoods: layer, tractShapes: tractLayer });
    await t.action(internal.build.refreshNeighborhoods, {});
    installFakeFetch({ cityNeighborhoods: layer, tractShapesStatus: 503 });
    const notes = await t.action(internal.build.refreshNeighborhoods, {});
    expect(await tractRows(t)).toEqual([["55079186000", [{ name: "Harambee", share: 100 }]]]);
    expect(notes).toEqual([expect.stringMatching(/^Tract neighborhoods unavailable, kept last week's: /)]);
  });
  it("never rebuilds the match without this week's City shapes", async () => {
    const t = await seed();
    installFakeFetch({ cityNeighborhoods: layer, tractShapes: tractLayer });
    await t.action(internal.build.refreshNeighborhoods, {});
    installFakeFetch({ cityNeighborhoodsStatus: 503, tractShapes: { type: "FeatureCollection", features: [] } });
    const notes = await t.action(internal.build.refreshNeighborhoods, {});
    expect(await tractRows(t)).toHaveLength(1);
    expect(notes[1]).toMatch(/^Tract neighborhoods unavailable, kept last week's: the City's neighborhoods weren't read/);
  });
  it("keeps last week's match when no tract matches at all", async () => {
    const t = await seed();
    installFakeFetch({ cityNeighborhoods: layer, tractShapes: tractLayer });
    await t.action(internal.build.refreshNeighborhoods, {});
    installFakeFetch({ cityNeighborhoods: layer, tractShapes: { type: "FeatureCollection", features: [tractLayer.features[1]] } });
    const notes = await t.action(internal.build.refreshNeighborhoods, {});
    expect(await tractRows(t)).toHaveLength(1);
    expect(notes).toEqual([expect.stringMatching(/no tract matched a City neighborhood/)]);
  });
```

- [ ] **Step 3: Run them to see them fail**

Run: `npx vitest run convex/neighborhoods.test.ts`
Expected: FAIL. The new tests fail on the missing `tractNeighborhoods` table (convex-test: table not in schema) or on notes not matching.

- [ ] **Step 4: Add the table**

In `convex/schema.ts`, after the `neighborhoods` table's closing `.index(...)`, add:
```ts

  // Each census tract's City neighborhoods (≥10% of its area, biggest first), matched weekly from the City's shapes
  // and DYCU's tract outlines (convex/lib/tractPlaces.ts). Tracts outside the City aren't stored.
  tractNeighborhoods: defineTable({
    geoid: v.string(),
    city: v.array(v.object({ name: v.string(), share: v.number() })),
  }).index("by_geoid", ["geoid"]),
```

- [ ] **Step 5: Add the replace mutation**

In `convex/buildStore.ts`, after `replaceNeighborhoods`, add:
```ts

// The whole match is replaced together, only after a run that read both the City's shapes and DYCU's tract outlines.
export const replaceTractNeighborhoods = internalMutation({
  args: { rows: v.array(v.object({ geoid: v.string(), city: v.array(v.object({ name: v.string(), share: v.number() })) })) },
  handler: async (ctx, { rows }) => {
    for (const r of await ctx.db.query("tractNeighborhoods").collect()) await ctx.db.delete(r._id);
    for (const r of rows) await ctx.db.insert("tractNeighborhoods", r);
  },
});
```

- [ ] **Step 6: Compute the match in the refresh**

In `convex/build.ts`:

Add imports:
```ts
import type { Geometry } from "./lib/geo";
import { allTractsUrl, cityShares, newestCountyUrl, parseTractShapes, type Hood } from "./lib/tractPlaces";
```

In `refreshNeighborhoods`, replace the City block
```ts
    const notes: string[] = [];
    try {
      const { rows, skipped } = parseCityNeighborhoods(await (await fetchOk(NEIGHBORHOODS_URL, "City neighborhoods")).json());
      if (rows.length === 0) throw new Error("no neighborhoods in the layer");
      await ctx.runMutation(internal.buildStore.replaceNeighborhoods, { definition: "city", rows });
      if (skipped.length) notes.push(`City neighborhoods skipped (no usable shape): ${skipped.join(", ")}`);
    } catch (e) {
      notes.push(`City neighborhoods unavailable, kept last week's: ${message(e)}`);
    }
```
with
```ts
    const notes: string[] = [];
    let hoods: Hood[] | null = null; // this run's City shapes, for the tract match; null when the layer wasn't read
    try {
      const { rows, skipped } = parseCityNeighborhoods(await (await fetchOk(NEIGHBORHOODS_URL, "City neighborhoods")).json());
      if (rows.length === 0) throw new Error("no neighborhoods in the layer");
      await ctx.runMutation(internal.buildStore.replaceNeighborhoods, { definition: "city", rows });
      hoods = rows.map((r) => ({ name: r.name, geometry: JSON.parse(r.geometry) as Geometry, bbox: r.bbox }));
      if (skipped.length) notes.push(`City neighborhoods skipped (no usable shape): ${skipped.join(", ")}`);
    } catch (e) {
      notes.push(`City neighborhoods unavailable, kept last week's: ${message(e)}`);
    }
    notes.push(...(await refreshTractNeighborhoods(ctx, hoods)));
```

After `refreshNeighborhoods` (before `async function fetchOk`), add:
```ts
// Each tract's City neighborhoods (convex/lib/tractPlaces.ts), from this run's City shapes and DYCU's tract outlines
// (E02's newest County map). Replaced only when both were read and at least one tract matched.
async function refreshTractNeighborhoods(ctx: ActionCtx, hoods: Hood[] | null): Promise<string[]> {
  try {
    if (!hoods) throw new Error("the City's neighborhoods weren't read this week");
    const e02 = await ctx.runQuery(internal.tracts.familyForTracts, { code: "E02" });
    const url = newestCountyUrl(e02?.members ?? []);
    if (!url) throw new Error("E02 has no County tract map");
    const tracts = parseTractShapes(await (await fetchOk(allTractsUrl(url), "Tract outlines")).json());
    const rows = tracts.map((t) => ({ geoid: t.geoid, city: cityShares(t.geometry, hoods) })).filter((r) => r.city.length > 0);
    if (rows.length === 0) throw new Error("no tract matched a City neighborhood");
    await ctx.runMutation(internal.buildStore.replaceTractNeighborhoods, { rows });
    return [];
  } catch (e) {
    return [`Tract neighborhoods unavailable, kept last week's: ${message(e)}`];
  }
}
```
(`ActionCtx` is already imported in `convex/build.ts`.)

- [ ] **Step 7: Regenerate bindings and run the tests**

Run: `npx convex codegen && npx vitest run convex/neighborhoods.test.ts`
Expected: PASS (all tests in the file, including the `finish` test). `npx convex codegen` updates `convex/_generated` locally only; it does not deploy.

- [ ] **Step 8: Commit**

```bash
git add convex/schema.ts convex/buildStore.ts convex/build.ts convex/_generated tests/helpers/fakeFetch.ts convex/neighborhoods.test.ts
git commit -m "feat: weekly match of each tract to the City's neighborhoods, kept when a source is down

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Tract tools carry both kinds of names

**Files:**
- Modify: `convex/tracts.ts` (types at lines 18, 228, 230; `dycuDefs` at 56; `toRow` at 146; call sites at 201–210, 273–285, 339–364)
- Test: `convex/tracts.test.ts`

**Interfaces:**
- Consumes: `neighborhoodsFor` (Task 2), `CityShare` (Task 1), table `tractNeighborhoods` (Task 3).
- Produces (later tasks render these):
  - `TractRow = { geoid; tract; city: CityShare[]; dycu: string[]; value; lo; hi; unreliable }`
  - `ChangeRow = { geoid; tract; city: CityShare[]; dycu: string[]; from; to; change; direction }`
  - `Point = { geoid; tract; city: CityShare[]; dycu: string[]; a; b; unreliable; mark }`
  - `internal.tracts.tractNames` (replaces `internal.tracts.dycuDefs`).

- [ ] **Step 1: Update and add the failing tests**

In `convex/tracts.test.ts`:

(a) In `seedTracts()`, after the `neighborhoods` insert, add:
```ts
    await ctx.db.insert("tractNeighborhoods", { geoid: "55079186000", city: [{ name: "Hillside", share: 51 }, { name: "Halyard Park", share: 27 }] });
```

(b) Change line 52's expectation to:
```ts
    expect(r.top[0]).toMatchObject({ tract: "1860", city: [{ name: "Hillside", share: 51 }, { name: "Halyard Park", share: 27 }], dycu: ["Harambee"], value: 58, lo: 54, hi: 62, unreliable: false });
    // A tract with no stored match (outside the City, or not on the 2020 map) names nothing.
    expect(r.top[1]).toMatchObject({ city: [], dycu: [] });
```

(c) Change line 204's expectation to:
```ts
    expect(r).toMatchObject({ status: "ok", mode: "mismatch", fits: [{ a: { tract: "1860", city: [{ name: "Hillside", share: 51 }, { name: "Halyard Park", share: 27 }], dycu: ["Harambee"] } }] });
```

(d) Search the file for any other `neighborhood:` expectation (`git grep -n "neighborhood" convex/tracts.test.ts`) and convert each the same way: `neighborhood: "X"` → `dycu: ["X"]`, `neighborhood: null` → `dycu: []`.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run convex/tracts.test.ts`
Expected: FAIL. The rows still carry `neighborhood`, not `city`/`dycu`.

- [ ] **Step 3: Change the types and the loader**

In `convex/tracts.ts`:

Imports: replace
```ts
import { latestDefYear, neighborhoodFor, type DycuDef } from "./lib/tractNames";
```
with
```ts
import { latestDefYear, neighborhoodsFor, type DycuDef } from "./lib/tractNames";
import type { CityShare } from "./lib/tractPlaces";
```

Line 18:
```ts
export type TractRow = { geoid: string; tract: string; city: CityShare[]; dycu: string[]; value: number; lo: number | null; hi: number | null; unreliable: boolean };
```

Replace `dycuDefs` (line 56–60) with:
```ts
// Both kinds of names for the tract rows: DYCU's area definitions and each tract's City neighborhoods (weekly match).
export const tractNames = internalQuery({
  args: {},
  handler: async (ctx): Promise<{ defs: DycuDef[]; city: { geoid: string; city: CityShare[] }[] }> => ({
    defs: (await ctx.db.query("neighborhoods").collect()).filter((n) => n.definition === "dycu").map((n) => ({ name: n.name, tracts: n.tracts })),
    city: (await ctx.db.query("tractNeighborhoods").collect()).map((r) => ({ geoid: r.geoid, city: r.city })),
  }),
});

type Names = { defs: DycuDef[]; city: Map<string, CityShare[]> };
async function loadNames(ctx: ActionCtx): Promise<Names> {
  const { defs, city } = await ctx.runQuery(internal.tracts.tractNames, {});
  return { defs, city: new Map(city.map((r) => [r.geoid, r.city])) };
}
```

Replace `toRow` (line 146–149):
```ts
// A tract with no stored match (outside the City, or a tract id not on the 2020 map) gets no City name: "—", never a guess.
export const toRow = (v: TractValue, year: string, names: Names): TractRow => {
  const tract = tractNumber(v.geoid);
  return { geoid: v.geoid, tract, city: names.city.get(v.geoid) ?? [], dycu: neighborhoodsFor(tract, yearNumber(year), names.defs), value: v.value, lo: v.lo, hi: v.hi, unreliable: isUnreliable(v) };
};
```

Line 228:
```ts
export type ChangeRow = { geoid: string; tract: string; city: CityShare[]; dycu: string[]; from: TractRow; to: TractRow; change: number; direction: "increase" | "decrease" };
```
Line 230:
```ts
export type Point = { geoid: string; tract: string; city: CityShare[]; dycu: string[]; a: [number, number | null, number | null]; b: [number, number | null, number | null]; unreliable: boolean; mark: "fits" | "close" | null };
```

- [ ] **Step 4: Change the three call sites**

Rank (around line 201): replace
```ts
    const defs = await ctx.runQuery(internal.tracts.dycuDefs, {});
    const nameYear = side.year ?? String(latestDefYear(defs));
```
with
```ts
    const names = await loadNames(ctx);
    const nameYear = side.year ?? String(latestDefYear(names.defs));
```
and in that function change every `toRow(v, nameYear, defs)` to `toRow(v, nameYear, names)`.

Change (around line 273): replace `const defs = await ctx.runQuery(internal.tracts.dycuDefs, {});` with `const names = await loadNames(ctx);`, then:
```ts
      const to = toRow(b, r2.year, names);
      changes.push({ geoid: a.geoid, tract: to.tract, city: to.city, dycu: to.dycu, from: toRow(a, r1.year, names), to, change: b.value - a.value, direction: d });
```

Relate (around line 339): replace
```ts
    const defs = await ctx.runQuery(internal.tracts.dycuDefs, {});
    const nameYear = ra.year ?? rb.year ?? String(latestDefYear(defs));
```
with
```ts
    const names = await loadNames(ctx);
    const nameYear = ra.year ?? rb.year ?? String(latestDefYear(names.defs));
```
then change `toRow(p.a, nameYear, defs)` / `toRow(p.b, nameYear, defs)` to use `names`. In `points`, replace `neighborhood: row.neighborhood` with `city: row.city, dycu: row.dycu`.

Run: `git grep -n "dycuDefs\|neighborhoodFor\b\|\.neighborhood\b" -- convex`
Expected: no hits outside `convex/_generated` (`getNumber` uses `args.neighborhood`, a different field; leave it).

- [ ] **Step 5: Regenerate bindings and run the tests**

Run: `npx convex codegen && npx vitest run convex/tracts.test.ts convex/property.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add convex/tracts.ts convex/tracts.test.ts convex/_generated
git commit -m "feat: tract rows carry the City's neighborhoods and every DYCU area

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Cards show both columns

**Files:**
- Create: `ui/lib/placeNames.ts`
- Test: `tests/ui/placeNames.test.ts`
- Modify: `ui/lib/tractSummary.ts:102` (`AREA_NOTE`)
- Modify: `ui/components/TractCards.tsx` (rank 127–136, unreliable 171, change 196–199, relate 264 and 322)
- Modify: `ui/components/TractScatter.tsx:53`
- Modify: `ui/components/ask.module.css` (after `.tractTable th`, line 148)
- Modify: test fixtures that build tract rows (`tests/ui/askTools.test.ts:9`, `tests/ui/ask.test.ts:41`, and any reported by tsc)

**Interfaces:**
- Consumes: `TractRow`, `ChangeRow`, `Point` with `city`/`dycu` (Task 4); `CityShare` (Task 1).
- Produces: `cityWord(c: CityShare): string`, `cityList(city: CityShare[]): string`, `dycuText(dycu?: string[]): string`, `placeLabel(city?: CityShare[], dycu?: string[]): string`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/ui/placeNames.test.ts
import { describe, expect, it } from "vitest";
import { cityList, cityWord, dycuText, placeLabel } from "@/ui/lib/placeNames";
import { AREA_NOTE } from "@/ui/lib/tractSummary";

const hillside = [{ name: "Hillside", share: 51 }, { name: "Halyard Park", share: 27 }, { name: "Triangle North", share: 13 }];

describe("place names", () => {
  it("says mostly at half the tract or more, partly below", () => {
    expect(cityWord({ name: "Hillside", share: 50 })).toBe("mostly Hillside");
    expect(cityWord({ name: "Northridge", share: 49 })).toBe("partly Northridge");
  });
  it("lists every neighborhood with its share", () => {
    expect(cityList(hillside)).toBe("Hillside 51% · Halyard Park 27% · Triangle North 13%");
  });
  it("joins DYCU areas, or a dash", () => {
    expect(dycuText(["Harambee", "Hillside", "Lindsay Heights"])).toBe("Harambee, Hillside, Lindsay Heights");
    expect(dycuText([])).toBe("—");
    expect(dycuText(undefined)).toBe("—"); // a card cached before tracts carried dycu
  });
  it("labels a scatter dot with either part, or neither", () => {
    expect(placeLabel(hillside, ["Harambee", "Hillside", "Lindsay Heights"])).toBe(" (mostly Hillside; DYCU: Harambee, Hillside, Lindsay Heights)");
    expect(placeLabel([], ["Harambee"])).toBe(" (DYCU: Harambee)");
    expect(placeLabel([{ name: "Northridge", share: 42 }], [])).toBe(" (partly Northridge)");
    expect(placeLabel(undefined, undefined)).toBe("");
  });
  it("the footer says what each column means", () => {
    expect(AREA_NOTE).toBe("Neighborhood: the City's official neighborhoods covering at least 10% of the tract, biggest first. DYCU area: the areas DYCU's reports group the tract into.");
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/ui/placeNames.test.ts`
Expected: FAIL, "Failed to resolve import @/ui/lib/placeNames".

- [ ] **Step 3: Write the helpers and the footer text**

```ts
// ui/lib/placeNames.ts
import type { CityShare } from "@/convex/lib/tractPlaces";

// How a tract's place is said: "mostly" only when one City neighborhood covers at least half the tract.
const MOSTLY = 50;
export const cityWord = (c: CityShare) => `${c.share >= MOSTLY ? "mostly" : "partly"} ${c.name}`;
export const cityList = (city: CityShare[]) => city.map((c) => `${c.name} ${c.share}%`).join(" · ");
// ponytail: `undefined` is a card cached before tracts carried these lists (kept a day); it shows "—".
export const dycuText = (dycu?: string[]) => (dycu?.length ? dycu.join(", ") : "—");

export function placeLabel(city: CityShare[] = [], dycu: string[] = []): string {
  const parts = [city.length ? cityWord(city[0]) : "", dycu.length ? `DYCU: ${dycu.join(", ")}` : ""].filter(Boolean);
  return parts.length ? ` (${parts.join("; ")})` : "";
}
```

In `ui/lib/tractSummary.ts`, replace the `AREA_NOTE` line with:
```ts
export const AREA_NOTE = "Neighborhood: the City's official neighborhoods covering at least 10% of the tract, biggest first. DYCU area: the areas DYCU's reports group the tract into.";
```

Run: `npx vitest run tests/ui/placeNames.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 4: Render the two columns**

In `ui/components/TractCards.tsx`:

Add imports:
```ts
import type { CityShare } from "@/convex/lib/tractPlaces";
import { cityList, dycuText } from "@/ui/lib/placeNames";
```

Before `const TIES_INLINE = 5;`, add:
```tsx
// The City neighborhood covering most of the tract; the rest, with shares, behind "+N" (a native disclosure: click,
// Enter or Space opens it). A card cached before tracts carried a City list shows "—".
function Places({ city }: { city?: CityShare[] }) {
  if (!city?.length) return <>{"—"}</>;
  if (city.length === 1) return <>{city[0].name}</>;
  return (
    <details className={styles.places} data-places>
      <summary>{city[0].name} <span className={styles.placesMore}>+{city.length - 1}</span></summary>
      {cityList(city)}
    </details>
  );
}
```

Rank card:
- `tieRow`: replace `<td>{t.neighborhood ?? "—"} ({exact ? …})</td>` with `<td><Places city={t.city} /></td><td>{dycuText(t.dycu)} ({exact ? `same figure as #${r.top.length}` : `tied with #${r.top.length} within the margin of error`})</td>`.
- `const head = ["#", "Tract", "DYCU area", h.column];` → `const head = ["#", "Tract", "Neighborhood", "DYCU area", h.column];`
- top rows: replace `<td>{t.neighborhood ?? "—"}</td>` with `<td><Places city={t.city} /></td><td>{dycuText(t.dycu)}</td>`.
- Unreliable row (line 171): replace `<td>{t.neighborhood ?? "—"} (too uncertain: margin of error too wide)</td>` with `<td><Places city={t.city} /></td><td>{dycuText(t.dycu)} (too uncertain: margin of error too wide)</td>`. Then find that table's `head` (search upward from line 171 for `"DYCU area"`) and insert `"Neighborhood"` before `"DYCU area"`.

Change card: `head={["Tract", "DYCU area", r.from, r.to, "Change"]}` → `head={["Tract", "Neighborhood", "DYCU area", r.from, r.to, "Change"]}`, and `<td>{c.neighborhood ?? "—"}</td>` → `<td><Places city={c.city} /></td><td>{dycuText(c.dycu)}</td>`.

Relate card: `head={["Tract", "DYCU area", a.column, b.column, ""]}` → `head={["Tract", "Neighborhood", "DYCU area", a.column, b.column, ""]}`, and `<td>{p.a.neighborhood ?? "—"}</td>` → `<td><Places city={p.a.city} /></td><td>{dycuText(p.a.dycu)}</td>`.

Run: `git grep -n "neighborhood" -- ui/components/TractCards.tsx`
Expected: only `NEIGHBORHOODS_HELP` and "How neighborhoods work" remain.

In `ui/components/TractScatter.tsx`, add `import { placeLabel } from "@/ui/lib/placeNames";` and change `describe`:
```ts
  const describe = (p: Point) =>
    `Tract ${p.tract}${placeLabel(p.city, p.dycu)}: ${a.column} ${spell(p.a, pa)}, ${b.column} ${spell(p.b, pb)}`;
```

In `ui/components/ask.module.css`, after the `.tractTable th` rule, add:
```css
/* "+N" on a tract's City neighborhood: the rest, with shares, open under the name. */
.places summary { cursor: pointer; }
.placesMore { font-family: var(--font-caps); font-weight: 700; }
```

- [ ] **Step 5: Update fixtures and check everything compiles**

Run: `npx tsc --noEmit -p .`
For each error about `neighborhood` on a tract row or point, change the fixture: `neighborhood: "X"` → `city: [], dycu: ["X"]`, `neighborhood: null` → `city: [], dycu: []`. Known: `tests/ui/askTools.test.ts:9`. `tests/ui/ask.test.ts:41` builds a JSON string (no type error): change `{ tract: "1860", neighborhood: "Harambee" }` to `{ tract: "1860", dycu: ["Harambee"] }` only if that test's assertion fails in Step 6.
Expected after edits: tsc prints nothing.

- [ ] **Step 6: Run the UI tests**

Run: `npx vitest run tests/ui`
Expected: PASS. If `tests/ui/tractScatter.test.ts` pins a label string containing "DYCU area:", update it to the new `placeLabel` wording.

- [ ] **Step 7: Commit**

```bash
git add ui/lib/placeNames.ts tests/ui/placeNames.test.ts ui/lib/tractSummary.ts ui/components/TractCards.tsx ui/components/TractScatter.tsx ui/components/ask.module.css tests/ui
git commit -m "feat: tract tables name the City's neighborhoods (+N with shares) and every DYCU area

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Words: Ask's rule, How it works, browser tests, records

**Files:**
- Modify: `lib/ask/prompt.ts:26`
- Test: `tests/ui/ask.test.ts` (near line 248)
- Modify: `ui/components/HowItWorks.tsx` (the "On the tract cards" paragraph, around line 119)
- Modify: `e2e/ask.spec.ts` (lines 235–237), `e2e/how.spec.ts` (test at line 18)
- Create: `docs/decisions/031-tract-neighborhood-names.md`
- Modify: `DESIGN.md`

- [ ] **Step 1: Write the failing prompt test**

In `tests/ui/ask.test.ts`, next to `expect(ASK_PROMPT).toMatch(/report areas/i);`, add:
```ts
    // Tract rows carry the City's neighborhoods (city) and DYCU's areas (dycu); "mostly" only at half or more.
    expect(ASK_PROMPT).toContain('"mostly X" when its share is 50 or more, "partly X" otherwise');
    expect(ASK_PROMPT).toMatch(/never a City neighborhood/);
```

Run: `npx vitest run tests/ui/ask.test.ts`
Expected: FAIL on the "mostly X" line.

- [ ] **Step 2: Rewrite the prompt rule**

In `lib/ask/prompt.ts`, replace line 26 (`- Tract names on the cards (like "United Community") are …`) with:
```ts
- Each tract row carries city (the City's official neighborhoods covering at least 10% of the tract, biggest first, each with its share in percent) and dycu (Data You Can Use's report areas that include the tract: groups of tracts DYCU chose with its partners, like "United Community"). Name a tract's place by its first city neighborhood: "mostly X" when its share is 50 or more, "partly X" otherwise. Call dycu names DYCU's areas ("DYCU's United Community area"), never a City neighborhood. An empty city list means the tract is outside the City; don't name a place for it.
```

Run: `npx vitest run tests/ui/ask.test.ts tests/ui/askPrompt.test.ts`
Expected: PASS.

- [ ] **Step 3: Explain it on How it works**

In `ui/components/HowItWorks.tsx`, replace the paragraph
```tsx
            <p>
              <strong>On the tract cards,</strong> each tract shows its number and, when it&apos;s in one of DYCU&apos;s report areas, that
              area&apos;s name. Other tracts show &ldquo;&mdash;&rdquo;; the site never guesses a name.
            </p>
```
with
```tsx
            <p>
              <strong>On the tract cards,</strong> each tract shows two names. <em>Neighborhood</em> is the City&apos;s: every official
              neighborhood covering at least 10% of the tract, biggest first (tap &ldquo;+2&rdquo; to see the rest with their shares). Each
              week the site lays a fine grid of points over every tract and counts which City neighborhood each point falls in.{" "}
              <em>DYCU area</em> lists every DYCU report area that includes the tract; some tracts are in two or three. A tract outside
              the City, or in no DYCU area, shows &ldquo;&mdash;&rdquo;; the site never guesses a name.
            </p>
```

- [ ] **Step 4: Update the browser tests**

In `e2e/ask.spec.ts`, replace lines 235–237:
```ts
    // Tract names are DYCU's report areas, said so on the card ("United Community" is DYCU's, not a City neighborhood).
    await expect(card.locator("thead").first()).toContainText("DYCU area"); // the top-10 table (ties and too-uncertain tables follow)
    await expect(card).toContainText("not the City's official neighborhoods");
```
with
```ts
    // Two names per tract: the City's neighborhoods (biggest first, "+N" for the rest) and every DYCU area.
    const head = card.locator("thead").first(); // the top-10 table (ties and too-uncertain tables follow)
    await expect(head).toContainText("Neighborhood");
    await expect(head).toContainText("DYCU area");
    await expect(card).toContainText("the City's official neighborhoods covering at least 10% of the tract");
    // The highest-poverty tracts are in the City; most overlap several neighborhoods, so "+N" opens the shares.
    const more = card.locator("details[data-places]").first();
    await expect(more).toBeVisible();
    await more.locator("summary").focus();
    await page.keyboard.press("Enter");
    await expect(more).toHaveAttribute("open", "");
    await expect(more).toContainText(/\d+%/);
    // The extra column scrolls inside the card; the page itself never scrolls sideways.
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
```

In `e2e/how.spec.ts`, inside the test at line 18, after `await expect(section).toContainText("27 report areas");`, add:
```ts
  await expect(section).toContainText("at least 10% of the tract");
```

- [ ] **Step 5: Write the records**

Create `docs/decisions/031-tract-neighborhood-names.md`:
```markdown
# 031: City neighborhood names per tract, matched weekly by counting points

**Decision:** Each tract row names the City's official neighborhoods covering it (at least 10% of its area, biggest first) and every DYCU area that includes it. The match is recomputed in the weekly data refresh by counting grid points, with no new library.

**Why this came up:** Tract rows named only one DYCU report area, like "United Community", which isn't a City neighborhood, so readers couldn't place a tract. Eighteen of the 114 tracts DYCU names are in more than one area, and the card showed only the first. If we got this wrong, a card would put a tract in the wrong neighborhood, and a reporter could print it.

**Options:**
1. **Count points weekly.** Lay a grid of points over each tract and count which City neighborhood each lands in. About 40 lines on top of the existing shape helpers, accurate to about ±2%. Costs a few seconds of the weekly build.
2. **Exact overlap with a geometry library.** Exact percentages. Costs a new dependency and handling for the occasional malformed City shape, and the precision doesn't change which name comes first.
3. **Compute once and commit a file.** Simplest at run time. Goes stale without anyone noticing if the City redraws a boundary, and it's a second copy of shapes the build already refreshes.

**What we chose and why:** Option 1 (Tarik, on Claude's recommendation, 2026-10-11). It reuses the weekly refresh and the City shapes it already keeps. A throwaway test on real shapes put tract 1860 at Hillside 51%, Halyard Park 27%, Triangle North 13%. We also chose to drop neighborhoods under 10%: the City's and the Census Bureau's lines don't match exactly, and slivers would list neighborhoods a tract barely touches.

**What we gave up:** Shares are estimates (±2%), not surveyed areas. Tracts outside the City get no City name. Tract ids that aren't on the 2020 census map (a 2019 grocery file, a 2015–16 school file) show "—". Asking Ask "poverty in Bay View's tracts" still doesn't work; that's a later project.

**How we'll know if this was right:** After the first production build, every City tract in the top-10 poverty ranking shows a City neighborhood, the build notes show no "Tract neighborhoods unavailable" line, and nobody reports a tract named for a neighborhood it isn't in.

**What actually happened:**
```

In `DESIGN.md`, find the section that describes the tract cards' area names (`git grep -n "DYCU area" DESIGN.md`) and add after it:
```markdown
### Tract names
Every tract row has two name columns. **Neighborhood**: the City's official neighborhoods covering at least 10% of the tract, biggest first; the first shows, and "+N" (a native disclosure) opens the rest with their shares. **DYCU area**: every DYCU report area that includes the tract, comma-separated. "—" for none; never a guess. Words elsewhere (scatter labels, Ask) say "mostly X" only when X covers at least half the tract, otherwise "partly X". Matched weekly (decision 031).
```
If `DESIGN.md` has no "DYCU area" passage, add the section at the end of the Ask cards part (search `Follow-up buttons (Ask)` and add it after that section).

- [ ] **Step 6: Run everything**

Run: `npx tsc --noEmit -p . && npx vitest run --maxWorkers=4 && npm run build`
Expected: no type errors; all tests pass; the build compiles.

- [ ] **Step 7: Commit**

```bash
git add lib/ask/prompt.ts tests/ui/ask.test.ts ui/components/HowItWorks.tsx e2e/ask.spec.ts e2e/how.spec.ts docs/decisions/031-tract-neighborhood-names.md DESIGN.md
git commit -m "docs: Ask's mostly/partly rule, How it works on City names per tract, decision 031

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Fill the development database and check real names

This task changes a shared system. **Stop and ask Tarik before Step 1, and again before Step 2.**

- [ ] **Step 1: Push the branch's functions and schema to dev (needs Tarik's OK)**

Run: `npx convex dev --once`
Expected: "Convex functions ready", with the new `tractNeighborhoods` table and its `by_geoid` index added.

- [ ] **Step 2: Run the neighborhoods refresh on dev (needs Tarik's OK)**

Run: `npx convex run build:refreshNeighborhoods`
Expected: a notes array with no "Tract neighborhoods unavailable" line. (This runs only the neighborhoods step, not the whole weekly build. It replaces dev's City shapes and DYCU lists with fresh copies, the same thing the weekly build does.)

- [ ] **Step 3: Check the real match**

Run:
```bash
npx convex data tractNeighborhoods --limit 1000 --format jsonLines > /tmp/tn.jsonl; wc -l < /tmp/tn.jsonl; grep 55079186000 /tmp/tn.jsonl
```
Expected:
- about 210 rows (the 2026-10-11 throwaway test found 237 overlapping tracts, 27 of them slivers only);
- tract 55079186000 lists Hillside first, at about 51%.

Record both numbers in the ledger. A count far from 210 (under 180 or over 240) is a finding: stop and investigate before opening the PR.

- [ ] **Step 4: No commit**

This step only changes the dev database. The PR's browser tests read dev, so they now see real names.
