# Neighborhood Translator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ask counts City of Milwaukee records by neighborhood (the City's 190 official boundaries), and the almanac stores DYCU's 28 neighborhoods as census-tract lists, with every card naming the definition it used.

**Architecture:** The Monday build stores City boundaries (GeoJSON from the City's ArcGIS layer) and DYCU tract lists (parsed from report passages already in `docChunks`) in a new `neighborhoods` table. City profiles learn each dataset's latitude/longitude columns. `countRecords` gains a `neighborhood` argument: the server asks the City for matching records inside the neighborhood's bounding rectangle (guarded numeric casts), keeps the points inside the exact boundary (ray casting), and returns counts only.

**Tech Stack:** Convex (queries, mutations, actions, convex-test), TypeScript, Vitest, Playwright, Next.js App Router, CopilotKit tools (zod), the City's CKAN `datastore_search_sql` and ArcGIS REST.

**Spec:** `docs/superpowers/specs/2026-10-10-neighborhood-translator-design.md`

## Global Constraints

- Read `convex/_generated/ai/guidelines.md` before writing Convex code (project CLAUDE.md).
- Counts only: coordinates are fetched by the server action, tested and discarded; never returned, stored, logged, or given to the model.
- City SQL constructs allowed: those already in `convex/lib/citySql.ts` plus `~` (regex), `CASE WHEN … THEN … END`, `"col"::float`, numeric `BETWEEN`. Every new SQL shape is added to `scripts/city-sql-smoke.ts` and run live (free, read-only).
- Numeric guard pattern, exactly: `^-?[0-9]+(\.[0-9]+)?$`. Casts always sit inside `CASE WHEN "col" ~ '<pattern>' THEN "col"::float END`.
- City row cap: `POINTS_CAP = 32000`. Hitting it returns `too-broad`, never a partial number.
- Milwaukee rough box for profile detection: lat 42.8–43.3, lon −88.1 to −87.8; a dataset qualifies when at least 90% of a sample of up to 50 non-null rows is inside.
- City neighborhoods layer: `https://milwaukeemaps.milwaukee.gov/arcgis/rest/services/planning/special_districts/MapServer/4/query?where=1%3D1&outFields=NEIGHBORHD&outSR=4326&f=geojson`, field `NEIGHBORHD`.
- Never a number for a name that matched nothing; never move a number between definitions.
- Card lines: `In <Name> (City of Milwaukee boundary)`; `<N> matching records citywide have no location and aren't included.` (only when N > 0); `<Name> as DYCU defines it: census tracts <list>`.
- No new npm dependency. No production deploy by Claude (Tarik runs `npx convex deploy -y` and `npx convex run build:start --prod`).
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- Test runs under load: `npx vitest run --maxWorkers=2`; e2e against a dev server on port 3200 (`npx next dev -p 3200`), `set -a; . ./.env.local; set +a; BASE_URL=http://localhost:3200 npx playwright test …`.

## Review Focus

1. A neighborhood name typed with "neighborhood", "St." or an apostrophe ("Walker's Point neighborhood") should match, not return "no such neighborhood" — pinned in Task 2.
2. A point exactly on the line between two adjacent neighborhoods should count in exactly one of them, never both or neither — pinned in Task 1.
3. A grouped neighborhood count by month with more than 24 months should keep the newest months and label the rest "Earlier", like the citywide card — pinned in Task 6.
4. A neighborhood count for a period entirely outside the data's coverage should say "outside the data's range" without querying the City, exactly as today — pinned in Task 7.
5. A City layer outage on Monday should keep last week's boundaries and note it, not empty the table (which would turn every neighborhood question into "no such neighborhood") — pinned in Task 4.

---

## File Structure

| File | Responsibility |
|---|---|
| `convex/lib/geo.ts` (new) | Geometry types, `bboxOf`, `inBbox`, `inShape` (ray casting). Pure. |
| `convex/lib/neighborhoodNames.ts` (new) | `nameKey`, `titleCase`, `editDistance`, `matchName`. Pure. |
| `convex/lib/neighborhoodSources.ts` (new) | `parseCityNeighborhoods` (GeoJSON → rows), `parseDefinitions` + `buildDycuNeighborhoods` (report text → tract lists). Pure. |
| `convex/lib/cityPoints.ts` (new) | `POINTS_CAP`, `tallyPoints`, `rankGroups`. Pure. |
| `convex/schema.ts`, `convex/validators.ts` | `neighborhoods` table; `latColumn`/`lonColumn` on profiles. |
| `convex/buildStore.ts` | `replaceNeighborhoods`, `neighborhoodReports`, `definitionSentences`, `spreadsheetPlaces`; `completeBuild` accepts extra notes. |
| `convex/build.ts` | `refreshNeighborhoods` called from `finish`; profiling samples points. |
| `convex/lib/cityProfile.ts` | Detect lat/lon columns; sample SQL; Milwaukee check. |
| `convex/lib/citySql.ts` | `buildCount(..., area?)` adds the guarded rectangle `points` query. |
| `convex/city.ts` | `findNeighborhood` query; `countRecords` `neighborhood` path and new statuses. |
| `convex/ask.ts` | `getNumber` returns `definition`. |
| `lib/ask/tools.ts`, `lib/ask/prompt.ts` | Tool parameter + description; Ask's rules. |
| `ui/components/AskCards.tsx` | Count card area/no-location lines; new status messages; number card definition line. |
| `tests/helpers/fakeFetch.ts` | Fake ArcGIS neighborhoods response. |
| `scripts/city-sql-smoke.ts`, `scripts/ask-questions.ts` | Live SQL shapes; 3 report-card questions. |
| `docs/decisions/024-neighborhood-translator.md`, `DESIGN.md`, `docs/LEARNING-LOG.md` | Decision, card lines, suggested learning entries. |

---

### Task 1: Point-in-shape geometry

**Files:**
- Create: `convex/lib/geo.ts`
- Test: `tests/lib/geo.test.ts`

**Interfaces:**
- Produces: `type Point = { lat: number; lon: number }`; `type Bbox = { minLat: number; maxLat: number; minLon: number; maxLon: number }`; `type Geometry = { type: "Polygon"; coordinates: number[][][] } | { type: "MultiPolygon"; coordinates: number[][][][] }` (GeoJSON order: `[lon, lat]`); `bboxOf(g: Geometry): Bbox`; `inBbox(p: Point, b: Bbox): boolean`; `inShape(p: Point, g: Geometry): boolean`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/geo.test.ts
import { describe, expect, it } from "vitest";
import { bboxOf, inBbox, inShape, type Geometry } from "../../convex/lib/geo";

// A 1×1 square from (lon 0, lat 0) to (lon 1, lat 1), with a hole from 0.4 to 0.6.
const square = (x0: number, y0: number, x1: number, y1: number) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
const withHole: Geometry = { type: "Polygon", coordinates: [square(0, 0, 1, 1), square(0.4, 0.4, 0.6, 0.6)] };
const twoParts: Geometry = { type: "MultiPolygon", coordinates: [[square(0, 0, 1, 1)], [square(5, 5, 6, 6)]] };

describe("geo", () => {
  it("finds the rectangle around every part", () => {
    expect(bboxOf(twoParts)).toEqual({ minLat: 0, maxLat: 6, minLon: 0, maxLon: 6 });
    expect(inBbox({ lat: 3, lon: 3 }, bboxOf(twoParts))).toBe(true);
    expect(inBbox({ lat: 7, lon: 3 }, bboxOf(twoParts))).toBe(false);
  });
  it("tells inside from outside, and a hole is outside", () => {
    expect(inShape({ lat: 0.2, lon: 0.2 }, withHole)).toBe(true);
    expect(inShape({ lat: 0.5, lon: 0.5 }, withHole)).toBe(false);
    expect(inShape({ lat: 1.5, lon: 0.5 }, withHole)).toBe(false);
  });
  it("finds a point in the second part of a multi-part shape", () => {
    expect(inShape({ lat: 5.5, lon: 5.5 }, twoParts)).toBe(true);
    expect(inShape({ lat: 3, lon: 3 }, twoParts)).toBe(false);
  });
  it("puts a point on the line between two neighbors in exactly one of them", () => {
    const left: Geometry = { type: "Polygon", coordinates: [square(0, 0, 1, 1)] };
    const right: Geometry = { type: "Polygon", coordinates: [square(1, 0, 2, 1)] };
    const onLine = { lat: 0.5, lon: 1 };
    expect([inShape(onLine, left), inShape(onLine, right)].filter(Boolean)).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/geo.test.ts`
Expected: FAIL — cannot find module `../../convex/lib/geo`.

- [ ] **Step 3: Write minimal implementation**

```ts
// convex/lib/geo.ts
// Neighborhood shapes in GeoJSON order ([lon, lat]) and the two tests a count needs: is a point in the rectangle
// around a shape (cheap, done by the City's SQL), and is it inside the shape itself (exact, done here).
export type Point = { lat: number; lon: number };
export type Bbox = { minLat: number; maxLat: number; minLon: number; maxLon: number };
export type Geometry = { type: "Polygon"; coordinates: number[][][] } | { type: "MultiPolygon"; coordinates: number[][][][] };

const parts = (g: Geometry): number[][][][] => (g.type === "Polygon" ? [g.coordinates] : g.coordinates);

export function bboxOf(g: Geometry): Bbox {
  const b = { minLat: Infinity, maxLat: -Infinity, minLon: Infinity, maxLon: -Infinity };
  for (const poly of parts(g)) for (const ring of poly) for (const [lon, lat] of ring) {
    b.minLat = Math.min(b.minLat, lat); b.maxLat = Math.max(b.maxLat, lat);
    b.minLon = Math.min(b.minLon, lon); b.maxLon = Math.max(b.maxLon, lon);
  }
  return b;
}

export const inBbox = (p: Point, b: Bbox) => p.lat >= b.minLat && p.lat <= b.maxLat && p.lon >= b.minLon && p.lon <= b.maxLon;

// Even-odd ray casting across every ring of every part: crossing a hole's ring flips the answer back to outside.
// The half-open comparison (yi > lat) !== (yj > lat) puts a point on a shared edge in exactly one neighbor.
export function inShape(p: Point, g: Geometry): boolean {
  let inside = false;
  for (const poly of parts(g)) for (const ring of poly) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > p.lat !== yj > p.lat && p.lon < ((xj - xi) * (p.lat - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/geo.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add convex/lib/geo.ts tests/lib/geo.test.ts
git commit -m "feat: point-in-shape geometry for neighborhood counts

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Matching a neighborhood name

**Files:**
- Create: `convex/lib/neighborhoodNames.ts`
- Test: `tests/lib/neighborhoodNames.test.ts`

**Interfaces:**
- Produces: `nameKey(s: string): string`; `titleCase(s: string): string`; `editDistance(a: string, b: string): number`; `type NameMatch<T> = { kind: "one"; row: T } | { kind: "choose"; names: string[] } | { kind: "none"; nearest: string[] }`; `matchName<T extends { name: string; matchKey: string }>(asked: string, rows: T[]): NameMatch<T>`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/neighborhoodNames.test.ts
import { describe, expect, it } from "vitest";
import { matchName, nameKey, titleCase } from "../../convex/lib/neighborhoodNames";

const rows = ["HARAMBEE", "BAY VIEW", "SOUTH BAY VIEW", "WALKER'S POINT", "ST. JOSEPH", "RIVERWEST"].map((n) => ({ name: titleCase(n), matchKey: nameKey(n) }));

describe("neighborhood names", () => {
  it("normalizes case, 'St.', apostrophes, '&' and a trailing 'neighborhood'", () => {
    expect(nameKey("Walker's Point neighborhood")).toBe("walkers point");
    expect(nameKey("St. Joseph")).toBe(nameKey("Saint Joseph"));
    expect(nameKey("Arts & Crafts")).toBe("arts and crafts");
    expect(titleCase("WALKER'S POINT")).toBe("Walker's Point");
  });
  it("matches one name exactly", () => {
    expect(matchName("harambee", rows)).toMatchObject({ kind: "one", row: { name: "Harambee" } });
    expect(matchName("Walkers Point neighborhood", rows)).toMatchObject({ kind: "one", row: { name: "Walker's Point" } });
    expect(matchName("Saint Joseph", rows)).toMatchObject({ kind: "one", row: { name: "St. Joseph" } });
  });
  it("asks which one when the name is close to several, or misspelled", () => {
    expect(matchName("Bay", rows)).toEqual({ kind: "choose", names: ["Bay View", "South Bay View"] });
    expect(matchName("Harambe", rows)).toEqual({ kind: "choose", names: ["Harambee"] });
  });
  it("never matches a made-up name, and offers the nearest three", () => {
    const r = matchName("Gotham Heights", rows);
    expect(r.kind).toBe("none");
    if (r.kind === "none") expect(r.nearest).toHaveLength(3);
    expect(matchName("   ", rows).kind).toBe("none");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/neighborhoodNames.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write minimal implementation**

```ts
// convex/lib/neighborhoodNames.ts
// How a typed neighborhood name finds its row: one exact match is used; close ones ask which; nothing is never a count.
export function nameKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/&/g, " and ")
    .replace(/\bst\b\.?/g, "saint")
    .replace(/\bneighbou?rhoods?\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export const titleCase = (s: string) => s.toLowerCase().replace(/(^|[\s-])([a-z])/g, (_, sep: string, c: string) => sep + c.toUpperCase());

export function editDistance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

export type NameMatch<T> = { kind: "one"; row: T } | { kind: "choose"; names: string[] } | { kind: "none"; nearest: string[] };

export function matchName<T extends { name: string; matchKey: string }>(asked: string, rows: T[]): NameMatch<T> {
  const key = nameKey(asked);
  const nearest = () => [...rows].sort((a, b) => editDistance(a.matchKey, key) - editDistance(b.matchKey, key)).slice(0, 3).map((r) => r.name);
  if (!key) return { kind: "none", nearest: nearest() };
  const exact = rows.find((r) => r.matchKey === key);
  if (exact) return { kind: "one", row: exact };
  const close = rows.filter((r) => r.matchKey.includes(key) || key.includes(r.matchKey) || editDistance(r.matchKey, key) <= 2);
  if (close.length) return { kind: "choose", names: close.slice(0, 5).map((r) => r.name) };
  return { kind: "none", nearest: nearest() };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/neighborhoodNames.test.ts`
Expected: PASS (4 tests). If `titleCase("ST. JOSEPH")` yields "St. Joseph" the exact-match test passes; it does, because "." is not a word separator in the regex and `nameKey` maps both spellings to "saint joseph".

- [ ] **Step 5: Commit**

```bash
git add convex/lib/neighborhoodNames.ts tests/lib/neighborhoodNames.test.ts
git commit -m "feat: neighborhood name matching (exact, choose, none)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Reading boundaries and DYCU definitions

**Files:**
- Create: `convex/lib/neighborhoodSources.ts`
- Test: `tests/lib/neighborhoodSources.test.ts`

**Interfaces:**
- Consumes: `bboxOf`, `Geometry`, `Bbox` (Task 1); `nameKey`, `titleCase` (Task 2); `placeKey` from `convex/lib/portrait.ts`.
- Produces:
  - `type CityNeighborhood = { name: string; matchKey: string; geometry: string; bbox: Bbox }` (geometry is `JSON.stringify(Geometry)`).
  - `parseCityNeighborhoods(geojson: unknown): { rows: CityNeighborhood[]; skipped: string[] }`
  - `parseDefinitions(text: string): { name: string; tracts: string[] }[]`
  - `type DycuNeighborhood = { name: string; matchKey: string; tracts: { years: number[]; tracts: string[] }[] }` (matchKey is `placeKey(name)`, the key `getNumber` already uses).
  - `buildDycuNeighborhoods(found: { name: string; year: number | null; tracts: string[] }[], places: string[]): { rows: DycuNeighborhood[]; notes: string[] }`

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/neighborhoodSources.test.ts
import { describe, expect, it } from "vitest";
import { buildDycuNeighborhoods, parseCityNeighborhoods, parseDefinitions } from "../../convex/lib/neighborhoodSources";

const ring = [[-87.92, 43.06], [-87.9, 43.06], [-87.9, 43.08], [-87.92, 43.08], [-87.92, 43.06]];

describe("City boundaries", () => {
  it("keeps each named shape with its rectangle, and skips one it can't read", () => {
    const { rows, skipped } = parseCityNeighborhoods({
      type: "FeatureCollection",
      features: [
        { properties: { NEIGHBORHD: "HARAMBEE" }, geometry: { type: "Polygon", coordinates: [ring] } },
        { properties: { NEIGHBORHD: "BROKEN" }, geometry: null },
        { properties: {}, geometry: { type: "Polygon", coordinates: [ring] } },
      ],
    });
    expect(rows).toEqual([{ name: "Harambee", matchKey: "harambee", geometry: JSON.stringify({ type: "Polygon", coordinates: [ring] }), bbox: { minLat: 43.06, maxLat: 43.08, minLon: -87.92, maxLon: -87.9 } }]);
    expect(skipped).toEqual(["BROKEN", "(unnamed)"]);
  });
  it("throws on something that isn't a feature collection, so last week's boundaries stay", () => {
    expect(() => parseCityNeighborhoods({ error: { code: 400 } })).toThrow();
  });
});

describe("DYCU definitions", () => {
  it("reads tract lists across line breaks, including combined names", () => {
    const text = "Census tracts 71, 72, 79, 80 and 107 were used to define the Riverwest\nneighborhood for the purposes of this report. " +
      "Census tracts 1101, 1102 and 1103 were used to define the Burnham Park, Layton Park and Silver City neighborhood for the purposes of this report.";
    expect(parseDefinitions(text)).toEqual([
      { name: "Riverwest", tracts: ["71", "72", "79", "80", "107"] },
      { name: "Burnham Park, Layton Park and Silver City", tracts: ["1101", "1102", "1103"] },
    ]);
  });
  it("keeps one entry per changed list, and reports names that don't match the spreadsheet places", () => {
    const found = [
      { name: "Riverwest", year: 2022, tracts: ["71", "72"] },
      { name: "Riverwest", year: 2023, tracts: ["71", "72"] },
      { name: "Silver City, Layton Park and Burnham Park", year: 2021, tracts: ["1101"] },
      { name: "Burnham Park, Layton Park and Silver City", year: 2023, tracts: ["1101", "1102"] },
      { name: "Atlantis", year: 2023, tracts: ["1"] },
    ];
    const { rows, notes } = buildDycuNeighborhoods(found, ["Riverwest", "Burnham Park, Layton Park and Silver City", "Harambee"]);
    expect(rows).toEqual([
      { name: "Burnham Park, Layton Park and Silver City", matchKey: "burnham-park-layton-park-silver-city", tracts: [{ years: [2021], tracts: ["1101"] }, { years: [2023], tracts: ["1101", "1102"] }] },
      { name: "Riverwest", matchKey: "riverwest", tracts: [{ years: [2022, 2023], tracts: ["71", "72"] }] },
    ]);
    expect(notes).toEqual([
      "DYCU definition for \"Atlantis\" matches no neighborhood spreadsheet; not stored",
      "No DYCU tract definition found for Harambee",
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/neighborhoodSources.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write minimal implementation**

```ts
// convex/lib/neighborhoodSources.ts
import { bboxOf, type Bbox, type Geometry } from "./geo";
import { nameKey, titleCase } from "./neighborhoodNames";
import { placeKey } from "./portrait";

export type CityNeighborhood = { name: string; matchKey: string; geometry: string; bbox: Bbox };
export type DycuNeighborhood = { name: string; matchKey: string; tracts: { years: number[]; tracts: string[] }[] };

type Feature = { properties?: { NEIGHBORHD?: unknown } | null; geometry?: { type?: unknown; coordinates?: unknown } | null };

// The City's 190 official neighborhoods. A feature without a name or a polygon is skipped and named in the notes.
export function parseCityNeighborhoods(geojson: unknown): { rows: CityNeighborhood[]; skipped: string[] } {
  const features = (geojson as { features?: Feature[] } | null)?.features;
  if (!Array.isArray(features)) throw new Error("City neighborhoods layer returned no features");
  const rows: CityNeighborhood[] = [];
  const skipped: string[] = [];
  for (const f of features) {
    const raw = typeof f.properties?.NEIGHBORHD === "string" ? f.properties.NEIGHBORHD.trim() : "";
    const g = f.geometry;
    if (!raw || !g || (g.type !== "Polygon" && g.type !== "MultiPolygon") || !Array.isArray(g.coordinates)) {
      skipped.push(raw || "(unnamed)");
      continue;
    }
    const geometry = { type: g.type, coordinates: g.coordinates } as Geometry;
    rows.push({ name: titleCase(raw), matchKey: nameKey(raw), geometry: JSON.stringify(geometry), bbox: bboxOf(geometry) });
  }
  return { rows, skipped };
}

// DYCU's reports say "Census tracts 71, 72, 79, 80 and 107 were used to define the Riverwest neighborhood …".
const DEFINITION = /Census tracts? ((?:\d+(?:, and |, | and ))*\d+) (?:were|was) used to define the (.+?) neighborhoods?\b/g;

export function parseDefinitions(text: string): { name: string; tracts: string[] }[] {
  const flat = text.replace(/\s+/g, " ");
  return [...flat.matchAll(DEFINITION)].map((m) => ({
    name: m[2].trim(),
    tracts: (m[1].match(/\d+/g) ?? []).sort((a, b) => Number(a) - Number(b)),
  }));
}

// One row per spreadsheet neighborhood (the 28 places DYCU publishes tables for); a new tracts entry only when the
// list changed. Names that match no place, and places with no definition, go in the build notes.
export function buildDycuNeighborhoods(
  found: { name: string; year: number | null; tracts: string[] }[],
  places: string[],
): { rows: DycuNeighborhood[]; notes: string[] } {
  const byKey = new Map(places.map((p) => [placeKey(p), p]));
  const lists = new Map<string, Map<string, Set<number>>>();
  const notes: string[] = [];
  const unmatched = new Set<string>();
  for (const f of found) {
    const key = placeKey(f.name);
    if (!byKey.has(key)) { unmatched.add(f.name); continue; }
    const versions = lists.get(key) ?? new Map<string, Set<number>>();
    const years = versions.get(f.tracts.join(",")) ?? new Set<number>();
    if (f.year !== null) years.add(f.year);
    versions.set(f.tracts.join(","), years);
    lists.set(key, versions);
  }
  for (const name of unmatched) notes.push(`DYCU definition for "${name}" matches no neighborhood spreadsheet; not stored`);
  const rows: DycuNeighborhood[] = [];
  for (const [key, place] of [...byKey.entries()].sort((a, b) => a[1].localeCompare(b[1]))) {
    const versions = lists.get(key);
    if (!versions) { notes.push(`No DYCU tract definition found for ${place}`); continue; }
    const tracts = [...versions.entries()]
      .map(([list, years]) => ({ years: [...years].sort((a, b) => a - b), tracts: list.split(",") }))
      .sort((a, b) => (a.years[0] ?? 0) - (b.years[0] ?? 0));
    rows.push({ name: place, matchKey: key, tracts });
  }
  return { rows, notes };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/neighborhoodSources.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add convex/lib/neighborhoodSources.ts tests/lib/neighborhoodSources.test.ts
git commit -m "feat: read City neighborhood boundaries and DYCU tract definitions

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Store neighborhoods in the Monday build

**Files:**
- Modify: `convex/schema.ts` (new table), `convex/buildStore.ts` (mutations/queries; `completeBuild`), `convex/build.ts` (`finish`), `tests/helpers/fakeFetch.ts`
- Test: `convex/neighborhoods.test.ts` (new)

**Interfaces:**
- Consumes: `parseCityNeighborhoods`, `parseDefinitions`, `buildDycuNeighborhoods`, `CityNeighborhood`, `DycuNeighborhood` (Task 3); `isPdfFamily`, `isSpreadsheetFamily` (`convex/lib/families.ts`); `fetchWithTimeout` (`convex/lib/http.ts`).
- Produces:
  - Table `neighborhoods`: `{ definition: "city" | "dycu"; name: string; matchKey: string; geometry?: string; bbox?: Bbox; tracts?: { years: number[]; tracts: string[] }[] }`, index `by_definition_matchKey` on `["definition", "matchKey"]`.
  - `internal.buildStore.replaceNeighborhoods({ definition, rows })` (internalMutation).
  - `internal.buildStore.neighborhoodSources({})` → `{ reports: { hubId: string; year: number | null }[]; places: string[] }` (internalQuery).
  - `internal.buildStore.definitionSentences({ hubId })` → `string[]` (internalQuery).
  - `completeBuild` args gain `notes: v.optional(v.array(v.string()))`.
  - `NEIGHBORHOODS_URL` exported from `convex/build.ts`.

- [ ] **Step 1: Add the fake ArcGIS response to the test helper**

In `tests/helpers/fakeFetch.ts`, add to `FakeOptions`:

```ts
  cityNeighborhoods?: unknown;
  cityNeighborhoodsStatus?: number;
```

and, as the first branch inside `fetchMock` (before the `package_search` branch):

```ts
    if (url.includes("special_districts/MapServer/4/query"))
      return json(opts.cityNeighborhoodsStatus ?? 200, opts.cityNeighborhoods ?? { type: "FeatureCollection", features: [] });
```

- [ ] **Step 2: Write the failing test**

```ts
// convex/neighborhoods.test.ts
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { installFakeFetch } from "../tests/helpers/fakeFetch";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");
afterEach(() => vi.unstubAllGlobals());

const ring = [[-87.92, 43.06], [-87.9, 43.06], [-87.9, 43.08], [-87.92, 43.08], [-87.92, 43.06]];
const layer = { type: "FeatureCollection", features: [{ properties: { NEIGHBORHD: "HARAMBEE" }, geometry: { type: "Polygon", coordinates: [ring] } }] };

async function seed() {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    const buildId = await ctx.db.insert("builds", { status: "running", startedAt: 0, finishedAt: null, pending: 0, done: 0, failed: 0, skipped: 0, costUsd: 0, firecrawlCalls: 0, notes: [], orphanChunksDeleted: 0, pdfReports: 0, report: "" } as never);
    // One neighborhood report with a definition, one spreadsheet place.
    await ctx.db.insert("families", { key: "document:neighborhood-portrait", code: "N02", name: "Neighborhood Portrait", kind: "document", topic: "Neighborhoods", keywords: [], places: ["Riverwest"], years: [2023], latestModified: "2023-01-01", baseSearchText: "", searchText: "", dictionaryTab: null } as never);
    await ctx.db.insert("members", { familyKey: "document:neighborhood-portrait", hubId: "r1", kind: "document", title: "Riverwest Neighborhood Portrait 2023", landingPage: "", place: "Riverwest", years: [2023], yearLabel: "2023", modified: "m", featureServerUrl: null, downloads: {}, description: "", keywords: [] });
    await ctx.db.insert("docChunks", { hubId: "r1", modified: "m", section: "Intro", text: "Census tracts 71, 72, 79, 80 and 107 were used to define the Riverwest\nneighborhood for the purposes of this report.", embedding: new Array(1536).fill(0) });
    await ctx.db.insert("families", { key: "document:neighborhood-portrait-spreadsheet", code: "N03", name: "Neighborhood Portrait Spreadsheet", kind: "document", topic: "Neighborhoods", keywords: [], places: ["Riverwest"], years: [2023], latestModified: "2023-01-01", baseSearchText: "", searchText: "", dictionaryTab: null } as never);
    await ctx.db.insert("members", { familyKey: "document:neighborhood-portrait-spreadsheet", hubId: "s1", kind: "document", title: "Riverwest", landingPage: "", place: "Riverwest", years: [2023], yearLabel: "2023", modified: "m", featureServerUrl: null, downloads: {}, description: "", keywords: [] });
    return buildId;
  });
  return t;
}

const rowsOf = (t: Awaited<ReturnType<typeof seed>>, definition: "city" | "dycu") =>
  t.run((ctx) => ctx.db.query("neighborhoods").withIndex("by_definition_matchKey", (q) => q.eq("definition", definition)).collect());

describe("refreshNeighborhoods", () => {
  it("stores City boundaries and DYCU tract lists", async () => {
    const t = await seed();
    installFakeFetch({ cityNeighborhoods: layer });
    const notes = await t.action(internal.build.refreshNeighborhoods, {});
    expect((await rowsOf(t, "city")).map((r) => [r.name, r.bbox])).toEqual([["Harambee", { minLat: 43.06, maxLat: 43.08, minLon: -87.92, maxLon: -87.9 }]]);
    expect((await rowsOf(t, "dycu")).map((r) => [r.name, r.tracts])).toEqual([["Riverwest", [{ years: [2023], tracts: ["71", "72", "79", "80", "107"] }]]]);
    expect(notes).toEqual([]);
  });
  it("keeps last week's City boundaries when the layer is down, and says so", async () => {
    const t = await seed();
    installFakeFetch({ cityNeighborhoods: layer });
    await t.action(internal.build.refreshNeighborhoods, {});
    installFakeFetch({ cityNeighborhoodsStatus: 503 });
    const notes = await t.action(internal.build.refreshNeighborhoods, {});
    expect((await rowsOf(t, "city")).map((r) => r.name)).toEqual(["Harambee"]);
    expect(notes[0]).toMatch(/^City neighborhoods unavailable, kept last week's/);
  });
});
```

Before running, open `convex/schema.ts` and copy the real `builds` and `families` field lists into the `seed()` inserts (replace the `as never` objects with exact fields, so the test fails only for the missing function). Keep `as never` only if the schema has fields the test doesn't care about and convex-test accepts them.

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run convex/neighborhoods.test.ts`
Expected: FAIL — `internal.build.refreshNeighborhoods` is undefined / table `neighborhoods` not in schema.

- [ ] **Step 4: Add the table**

In `convex/schema.ts`, import `vBbox` from validators and add to the schema object:

```ts
  // Neighborhoods by definition: the City's official boundaries (shape + rectangle), DYCU's tract lists.
  neighborhoods: defineTable({
    definition: v.union(v.literal("city"), v.literal("dycu")),
    name: v.string(),
    matchKey: v.string(),
    geometry: v.optional(v.string()),
    bbox: v.optional(vBbox),
    tracts: v.optional(v.array(v.object({ years: v.array(v.number()), tracts: v.array(v.string()) }))),
  }).index("by_definition_matchKey", ["definition", "matchKey"]),
```

In `convex/validators.ts`:

```ts
export const vBbox = v.object({ minLat: v.number(), maxLat: v.number(), minLon: v.number(), maxLon: v.number() });
```

- [ ] **Step 5: Add the store functions**

In `convex/buildStore.ts` (imports: `isPdfFamily`, `isSpreadsheetFamily` from `./lib/families`, `vBbox` from `./validators`):

```ts
const vNeighborhoodRow = v.object({
  name: v.string(), matchKey: v.string(), geometry: v.optional(v.string()), bbox: v.optional(vBbox),
  tracts: v.optional(v.array(v.object({ years: v.array(v.number()), tracts: v.array(v.string()) }))),
});

// One definition's rows are replaced together, only after that definition was read successfully.
export const replaceNeighborhoods = internalMutation({
  args: { definition: v.union(v.literal("city"), v.literal("dycu")), rows: v.array(vNeighborhoodRow) },
  handler: async (ctx, { definition, rows }) => {
    const old = await ctx.db.query("neighborhoods").withIndex("by_definition_matchKey", (q) => q.eq("definition", definition)).collect();
    for (const r of old) await ctx.db.delete(r._id);
    for (const r of rows) await ctx.db.insert("neighborhoods", { definition, ...r });
  },
});

// The neighborhood reports (PDF families' members with a place) and the 28 spreadsheet places to check names against.
export const neighborhoodSources = internalQuery({
  args: {},
  handler: async (ctx) => {
    const families = await ctx.db.query("families").collect();
    const membersOf = (key: string) => ctx.db.query("members").withIndex("by_family", (q) => q.eq("familyKey", key)).collect();
    const reports: { hubId: string; year: number | null }[] = [];
    const places = new Set<string>();
    for (const f of families) {
      if (isPdfFamily(f)) for (const m of await membersOf(f.key)) if (m.place) reports.push({ hubId: m.hubId, year: m.years[0] ?? null });
      if (isSpreadsheetFamily(f)) for (const m of await membersOf(f.key)) places.add(m.place ?? m.title);
    }
    return { reports, places: [...places] };
  },
});

// Only the passages of one report that state a definition (whitespace-normalized), never the embeddings.
export const definitionSentences = internalQuery({
  args: { hubId: v.string() },
  handler: async (ctx, { hubId }) =>
    (await ctx.db.query("docChunks").withIndex("by_hubId", (q) => q.eq("hubId", hubId)).collect())
      .map((c) => c.text.replace(/\s+/g, " "))
      .filter((t) => /used to define the/.test(t)),
});
```

Change `completeBuild` to accept and append notes:

```ts
export const completeBuild = internalMutation({
  args: { buildId: v.id("builds"), orphanChunksDeleted: v.number(), notes: v.optional(v.array(v.string())) },
  handler: async (ctx, { buildId, orphanChunksDeleted, notes }) => {
    const b = await ctx.db.get(buildId);
    if (!b || b.status !== "running") return;
    const final = { ...b, notes: [...b.notes, ...(notes ?? [])], status: "completed" as const, finishedAt: Date.now(), orphanChunksDeleted };
    await ctx.db.patch(buildId, {
      status: final.status,
      finishedAt: final.finishedAt,
      orphanChunksDeleted,
      notes: final.notes,
      report: renderReport(final),
    });
  },
});
```

(Check `b.notes` is the field name in the `builds` schema; it is what `setPending` writes.)

- [ ] **Step 6: Add the build step**

In `convex/build.ts` (imports: `parseCityNeighborhoods`, `parseDefinitions`, `buildDycuNeighborhoods` from `./lib/neighborhoodSources`):

```ts
export const NEIGHBORHOODS_URL =
  "https://milwaukeemaps.milwaukee.gov/arcgis/rest/services/planning/special_districts/MapServer/4/query?where=1%3D1&outFields=NEIGHBORHD&outSR=4326&f=geojson";

// The City's boundaries and DYCU's tract lists. Each definition is replaced only when it was read; a City outage
// keeps last week's boundaries. Runs at the end of the build, after this week's reports were indexed.
export const refreshNeighborhoods = internalAction({
  args: {},
  handler: async (ctx): Promise<string[]> => {
    const notes: string[] = [];
    try {
      const { rows, skipped } = parseCityNeighborhoods(await (await fetchOk(NEIGHBORHOODS_URL, "City neighborhoods")).json());
      if (rows.length === 0) throw new Error("no neighborhoods in the layer");
      await ctx.runMutation(internal.buildStore.replaceNeighborhoods, { definition: "city", rows });
      if (skipped.length) notes.push(`City neighborhoods skipped (no usable shape): ${skipped.join(", ")}`);
    } catch (e) {
      notes.push(`City neighborhoods unavailable, kept last week's: ${message(e)}`);
    }
    const { reports, places } = await ctx.runQuery(internal.buildStore.neighborhoodSources, {});
    const found: { name: string; year: number | null; tracts: string[] }[] = [];
    for (const r of reports) {
      for (const text of await ctx.runQuery(internal.buildStore.definitionSentences, { hubId: r.hubId })) {
        for (const d of parseDefinitions(text)) found.push({ ...d, year: r.year });
      }
    }
    const dycu = buildDycuNeighborhoods(found, places);
    if (dycu.rows.length) await ctx.runMutation(internal.buildStore.replaceNeighborhoods, { definition: "dycu", rows: dycu.rows });
    return [...notes, ...dycu.notes];
  },
});
```

In `finish`, before `completeBuild`:

```ts
    const neighborhoodNotes: string[] = await ctx.runAction(internal.build.refreshNeighborhoods, {});
    await ctx.runMutation(internal.buildStore.completeBuild, { buildId, orphanChunksDeleted: deleted, notes: neighborhoodNotes });
```

- [ ] **Step 7: Run the tests**

Run: `npx vitest run convex/neighborhoods.test.ts convex/build.test.ts convex/buildStore.test.ts --maxWorkers=2`
Expected: PASS. If a `finish`/`completeBuild` test in `build.test.ts` asserts exact build notes, update it to include notes from an empty neighborhoods layer: with the default fake (`features: []`) the build adds `City neighborhoods unavailable, kept last week's: no neighborhoods in the layer` — make the existing tests pass `cityNeighborhoods: layer`-style fixtures or assert with `toContain` instead of exact equality.

- [ ] **Step 8: Typecheck and commit**

Run: `npx tsc --noEmit -p .` — Expected: no output.

```bash
git add convex/schema.ts convex/validators.ts convex/buildStore.ts convex/build.ts convex/neighborhoods.test.ts tests/helpers/fakeFetch.ts convex/build.test.ts
git commit -m "feat: the Monday build stores City neighborhood boundaries and DYCU tract lists

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 9: Check the real data on dev (free)**

```bash
npx convex dev --once
npx convex run build:refreshNeighborhoods
npx convex data neighborhoods --limit 300 --format jsonLines | python3 -c "import sys,json,collections; c=collections.Counter(json.loads(l)['definition'] for l in sys.stdin if l.strip()); print(c)"
```

Expected: `Counter({'city': 190, 'dycu': 28})` and the printed notes list empty. If DYCU is below 28, print the notes, read the unmatched names, and widen `DEFINITION` in Task 3's file with a new test case for that exact sentence before changing the regex. Record the final count in the commit message of any fix.

---

### Task 5: Profiles learn latitude/longitude columns

**Files:**
- Modify: `convex/lib/cityProfile.ts`, `convex/validators.ts` (`vCityProfile`), `convex/build.ts` (`profileCity`)
- Test: `tests/lib/cityProfile.test.ts` (existing file; add cases)

**Interfaces:**
- Produces: `ProfilePlan` gains `latColumn: string | null; lonColumn: string | null`; `profileSql(...)` returns `points: string | null`; `assembleProfile(..., now, points?: { lat: unknown; lon: unknown }[])`; `CityProfile` gains `latColumn?: string | null; lonColumn?: string | null`; constant `MILWAUKEE_BOX`.

- [ ] **Step 1: Write the failing test** (append to `tests/lib/cityProfile.test.ts`; match its existing imports)

```ts
describe("point columns", () => {
  const f = (...ids: string[]) => ids.map((id) => ({ id, type: "text" }));
  it("finds latitude and longitude columns by name", () => {
    expect(planProfile(f("Case_Number", "Address_Latitude", "Address_Longitude"))).toMatchObject({ latColumn: "Address_Latitude", lonColumn: "Address_Longitude" });
    expect(planProfile(f("latitude", "longitude"))).toMatchObject({ latColumn: "latitude", lonColumn: "longitude" });
    expect(planProfile(f("X", "Y"))).toMatchObject({ latColumn: null, lonColumn: null });
    expect(planProfile(f("Latitude"))).toMatchObject({ latColumn: null, lonColumn: null });
  });
  it("samples non-null pairs", () => {
    expect(profileSql("87843297-a6fa-46d4-ba5d-cb342fb2d3bb", planProfile(f("lat", "lon"))).points).toBe(
      `SELECT "lat" AS lat, "lon" AS lon FROM "87843297-a6fa-46d4-ba5d-cb342fb2d3bb" WHERE "lat" IS NOT NULL AND "lon" IS NOT NULL LIMIT 50`,
    );
  });
  it("keeps the columns only when at least 90% of the sample is in Milwaukee", () => {
    const plan = planProfile(f("lat", "lon"));
    const at = (lat: string, lon: string) => ({ lat, lon });
    const good = Array.from({ length: 10 }, () => at("43.05", "-87.95"));
    const base = ["fam", "87843297-a6fa-46d4-ba5d-cb342fb2d3bb", f("lat", "lon"), plan, { n: 10 }, undefined, [], 0] as const;
    expect(assembleProfile(...base, good)).toMatchObject({ latColumn: "lat", lonColumn: "lon" });
    expect(assembleProfile(...base, [...good.slice(0, 8), at("0", "0"), at("bad", "x")])).toMatchObject({ latColumn: null, lonColumn: null });
    expect(assembleProfile(...base, [])).toMatchObject({ latColumn: null, lonColumn: null });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/cityProfile.test.ts`
Expected: FAIL — `latColumn` undefined / `points` undefined.

- [ ] **Step 3: Implement**

In `convex/lib/cityProfile.ts`:

```ts
const LAT = /^(lat|latitude|.+_latitude)$/i;
const LON = /^(lon|long|longitude|.+_longitude)$/i;
// Milwaukee with a margin. A dataset counts by neighborhood only when its points are really here.
export const MILWAUKEE_BOX = { minLat: 42.8, maxLat: 43.3, minLon: -88.1, maxLon: -87.8 };
const IN_MILWAUKEE_SHARE = 0.9;
```

`ProfilePlan` adds `latColumn: string | null; lonColumn: string | null`. In `planProfile`, before `return`:

```ts
  const latColumn = names.find((n) => LAT.test(n)) ?? null;
  const lonColumn = names.find((n) => LON.test(n)) ?? null;
  const both = latColumn && lonColumn;
```

and return `latColumn: both ? latColumn : null, lonColumn: both ? lonColumn : null` alongside the existing fields.

In `profileSql`, add:

```ts
    points: plan.latColumn && plan.lonColumn
      ? `SELECT ${quoteId(plan.latColumn)} AS lat, ${quoteId(plan.lonColumn)} AS lon FROM ${t} WHERE ${quoteId(plan.latColumn)} IS NOT NULL AND ${quoteId(plan.lonColumn)} IS NOT NULL LIMIT 50`
      : null,
```

`CityProfile` adds `latColumn?: string | null; lonColumn?: string | null;`. `assembleProfile` takes a last parameter `points: { lat: unknown; lon: unknown }[] = []` and computes:

```ts
  const inside = points.filter((p) => {
    const lat = Number(p.lat), lon = Number(p.lon);
    return Number.isFinite(lat) && Number.isFinite(lon) && lat >= MILWAUKEE_BOX.minLat && lat <= MILWAUKEE_BOX.maxLat && lon >= MILWAUKEE_BOX.minLon && lon <= MILWAUKEE_BOX.maxLon;
  }).length;
  const located = plan.latColumn && plan.lonColumn && points.length > 0 && inside / points.length >= IN_MILWAUKEE_SHARE;
```

and returns `latColumn: located ? plan.latColumn : null, lonColumn: located ? plan.lonColumn : null` in the object.

In `convex/validators.ts` `vCityProfile`, add:

```ts
  latColumn: v.optional(v.union(v.string(), v.null())),
  lonColumn: v.optional(v.union(v.string(), v.null())),
```

In `convex/build.ts` `profileCity`, after the `tops` loop:

```ts
    const points = q.points ? await datastoreSql<{ lat: unknown; lon: unknown }>(q.points) : [];
    const profile = { ...assembleProfile(familyKey, rid, fields, plan, count, range, tops, Date.now(), points), resourceName };
```

(replacing the existing `const profile = …` line).

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/lib/cityProfile.test.ts convex/build.test.ts --maxWorkers=2`
Expected: PASS. Existing `planProfile` tests that compare the whole plan with `toEqual` need `latColumn: null, lonColumn: null` added.

- [ ] **Step 5: Typecheck and commit**

Run: `npx tsc --noEmit -p .`

```bash
git add convex/lib/cityProfile.ts convex/validators.ts convex/build.ts tests/lib/cityProfile.test.ts
git commit -m "feat: City profiles record latitude/longitude columns that land in Milwaukee

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: The rectangle query and counting points

**Files:**
- Modify: `convex/lib/citySql.ts`, `scripts/city-sql-smoke.ts`
- Create: `convex/lib/cityPoints.ts`
- Test: `tests/lib/citySql.test.ts` (existing; add), `tests/lib/cityPoints.test.ts` (new)

**Interfaces:**
- Consumes: `Bbox`, `Geometry`, `inShape` (Task 1); `CityProfile.latColumn/lonColumn` (Task 5).
- Produces:
  - `buildCount(p, a, today, area?: Bbox): Built` — `Built` ok variant gains `points: { sql: string; missingSql: string } | null`; new refusal `{ ok: false; status: "no-locations" }`.
  - `NUMERIC = "^-?[0-9]+(\\.[0-9]+)?$"` (exported).
  - `POINTS_CAP = 32000`; `tallyPoints(rows: { lat: unknown; lon: unknown; g?: unknown }[], shape: Geometry, multi: boolean): { count: number; groups: Map<string, number> }`; `rankGroups(groups: Map<string, number>, byDate: boolean, overlap: boolean, max: number): { top: [string, number][]; other: number; capped: boolean }`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/lib/citySql.test.ts` (reuse its existing profile fixture `P` if present; otherwise build one with `latColumn: "Address_Latitude", lonColumn: "Address_Longitude"` added):

```ts
describe("neighborhood rectangle", () => {
  const area = { minLat: 43.06, maxLat: 43.08, minLon: -87.92, maxLon: -87.9 };
  const located = { ...P, latColumn: "Address_Latitude", lonColumn: "Address_Longitude" };
  const guard = (c: string) => `(CASE WHEN "${c}" ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN "${c}"::float END)`;
  it("adds a guarded rectangle and selects only coordinates and the group", () => {
    const b = buildCount(located, { from: "2026-01-01", groupBy: "month" }, "2026-10-10", area);
    if (!b.ok) throw new Error(JSON.stringify(b));
    expect(b.points!.sql).toContain(`${guard("Address_Latitude")} BETWEEN 43.06 AND 43.08 AND ${guard("Address_Longitude")} BETWEEN -87.92 AND -87.9`);
    expect(b.points!.sql).toMatch(/^SELECT \(CASE WHEN .* AS lat, \(CASE WHEN .* AS lon, left\("Incident_Date", 7\) AS g FROM /);
    expect(b.points!.sql).toMatch(/ LIMIT 32000$/);
    expect(b.points!.missingSql).toContain(`("Address_Latitude" IS NULL OR "Address_Longitude" IS NULL OR NOT ("Address_Latitude" ~ '^-?[0-9]+(\\.[0-9]+)?$' AND "Address_Longitude" ~ '^-?[0-9]+(\\.[0-9]+)?$'))`);
    expect(b.points!.sql).not.toContain("Case_Number");
  });
  it("has no points query without an area, and refuses an area for a dataset without locations", () => {
    const b = buildCount(located, {}, "2026-10-10");
    expect(b.ok && b.points).toBeNull();
    expect(buildCount(P, {}, "2026-10-10", area)).toEqual({ ok: false, status: "no-locations" });
  });
  it("refuses a rectangle that isn't four finite numbers", () => {
    expect(() => buildCount(located, {}, "2026-10-10", { ...area, minLat: Number.NaN })).toThrow();
  });
});
```

```ts
// tests/lib/cityPoints.test.ts
import { describe, expect, it } from "vitest";
import { rankGroups, tallyPoints } from "../../convex/lib/cityPoints";
import type { Geometry } from "../../convex/lib/geo";

const box: Geometry = { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] };

describe("tallyPoints", () => {
  it("counts only points inside the shape, and splits ';' groups when multi", () => {
    const rows = [
      { lat: 0.5, lon: 0.5, g: "13A;120" },
      { lat: "0.2", lon: "0.2", g: "120" },
      { lat: 2, lon: 2, g: "120" },
      { lat: null, lon: null, g: "120" },
    ];
    const r = tallyPoints(rows, box, true);
    expect(r.count).toBe(2);
    expect([...r.groups]).toEqual([["13A", 1], ["120", 2]]);
    expect([...tallyPoints(rows, box, false).groups]).toEqual([["13A;120", 1], ["120", 1]]);
  });
});

describe("rankGroups", () => {
  it("keeps the newest date groups oldest-first and labels the rest as a remainder", () => {
    const months = new Map(Array.from({ length: 26 }, (_, i) => [`20${24 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`, 1] as [string, number]));
    const r = rankGroups(months, true, false, 24);
    expect(r.top[0][0]).toBe("2024-03");
    expect(r.top.at(-1)![0]).toBe("2026-02");
    expect(r).toMatchObject({ other: 2, capped: true });
  });
  it("orders column groups by count and never sums a remainder for overlapping groups", () => {
    const g = new Map([["a", 1], ["b", 5], ["c", 3]]);
    expect(rankGroups(g, false, false, 2)).toEqual({ top: [["b", 5], ["c", 3]], other: 1, capped: true });
    expect(rankGroups(g, false, true, 2)).toEqual({ top: [["b", 5], ["c", 3]], other: 0, capped: false });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/lib/citySql.test.ts tests/lib/cityPoints.test.ts`
Expected: FAIL — `points` undefined; `cityPoints` module missing.

- [ ] **Step 3: Implement `cityPoints.ts`**

```ts
// convex/lib/cityPoints.ts
import { inShape, type Geometry } from "./geo";

// The City returns at most this many rows per query; a full page means the answer would be partial.
export const POINTS_CAP = 32000;

// Counts the records whose point is inside the shape, by group. Coordinates are only read here, never kept.
export function tallyPoints(rows: { lat: unknown; lon: unknown; g?: unknown }[], shape: Geometry, multi: boolean) {
  let count = 0;
  const groups = new Map<string, number>();
  for (const r of rows) {
    const lat = r.lat === null || r.lat === undefined ? NaN : Number(r.lat);
    const lon = r.lon === null || r.lon === undefined ? NaN : Number(r.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !inShape({ lat, lon }, shape)) continue;
    count++;
    if (r.g === undefined) continue;
    const raw = String(r.g ?? "");
    for (const g of multi ? raw.split(";").map((s) => s.trim()).filter(Boolean) : [raw]) groups.set(g, (groups.get(g) ?? 0) + 1);
  }
  return { count, groups };
}

// Same shape as the citywide card: date groups keep the newest (shown oldest first) with an "Earlier" remainder;
// column groups keep the biggest with an "Other" remainder, except when groups overlap (can't be summed).
export function rankGroups(groups: Map<string, number>, byDate: boolean, overlap: boolean, max: number) {
  const all = [...groups.entries()];
  const sorted = byDate ? all.sort((a, b) => b[0].localeCompare(a[0])) : all.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const kept = sorted.slice(0, max);
  const capped = sorted.length > max && !overlap;
  const other = capped ? sorted.slice(max).reduce((s, [, n]) => s + n, 0) : 0;
  return { top: byDate ? kept.reverse() : kept, other, capped };
}
```

- [ ] **Step 4: Implement the rectangle in `citySql.ts`**

Update the header comment: replace "no :: casts" with "`::float` only inside a numeric CASE guard". Add:

```ts
import type { Bbox } from "./geo";
import { POINTS_CAP } from "./cityPoints";
export const NUMERIC = "^-?[0-9]+(\\.[0-9]+)?$";
const num = (c: string) => `(CASE WHEN ${quoteId(c)} ~ ${lit(NUMERIC)} THEN ${quoteId(c)}::float END)`;
const coord = (n: number) => { if (!Number.isFinite(n)) throw new Error("Neighborhood rectangle is not numeric"); return String(n); };
```

Extend `Built`'s ok variant with `points: { sql: string; missingSql: string } | null` and add `| { ok: false; status: "no-locations" }`. Change the signature to `buildCount(p: CityProfile, a: CountArgs, today: string, area?: Bbox): Built`. Immediately after the `bad-dates` check:

```ts
  if (area && !(p.latColumn && p.lonColumn)) return { ok: false, status: "no-locations" };
```

At the end, before `return { ok: true, … }`:

```ts
  let points: { sql: string; missingSql: string } | null = null;
  if (area && p.latColumn && p.lonColumn) {
    const [lat, lon] = [p.latColumn, p.lonColumn];
    const box = `${num(lat)} BETWEEN ${coord(area.minLat)} AND ${coord(area.maxLat)} AND ${num(lon)} BETWEEN ${coord(area.minLon)} AND ${coord(area.maxLon)}`;
    const g = groupLabel === "month" || groupLabel === "year" ? `, left(${quoteId(p.dateColumn!)}, ${groupLabel === "month" ? 7 : 4}) AS g` : groupLabel ? `, ${quoteId(groupLabel)} AS g` : "";
    const filtered = where.length ? `${where.join(" AND ")} AND ` : "";
    const unplaced = `(${quoteId(lat)} IS NULL OR ${quoteId(lon)} IS NULL OR NOT (${quoteId(lat)} ~ ${lit(NUMERIC)} AND ${quoteId(lon)} ~ ${lit(NUMERIC)}))`;
    points = {
      sql: `SELECT ${num(lat)} AS lat, ${num(lon)} AS lon${g} FROM ${table} WHERE ${filtered}${box} LIMIT ${POINTS_CAP}`,
      missingSql: `SELECT COUNT(*) AS n FROM ${table} WHERE ${filtered}${unplaced}`,
    };
  }
```

and add `points` to the returned ok object. (`groupLabel` for a column group is `cat.column`, so `quoteId(groupLabel)` is the profiled column.)

- [ ] **Step 5: Run tests**

Run: `npx vitest run tests/lib/citySql.test.ts tests/lib/cityPoints.test.ts`
Expected: PASS.

- [ ] **Step 6: Add the live shapes to the smoke script and run it (free, read-only)**

In `scripts/city-sql-smoke.ts`, after the robbery check, add (with `P` extended by `latColumn: "Address_Latitude", lonColumn: "Address_Longitude"`):

```ts
// Neighborhood counts: the guarded rectangle with an offense and a date, and the no-location count.
const located = { ...P, latColumn: "Address_Latitude", lonColumn: "Address_Longitude" };
const area = { minLat: 43.05, maxLat: 43.08, minLon: -87.93, maxLon: -87.9 };
for (const args of [{ from: "2026-01-01", filters: [{ column: "Offense_All", values: ["robbery"] }] }, { from: "2026-01-01", groupBy: "month" }, { from: "2026-01-01", groupBy: "Offense_All" }]) {
  const b = buildCount(located, args, today, area);
  if (!b.ok || !b.points) throw new Error(JSON.stringify(b));
  const rows = await datastoreSql<Record<string, unknown>>(b.points.sql);
  const [missing] = await datastoreSql<{ n: string }>(b.points.missingSql);
  console.log("OK", rows.length, "points ·", missing.n, "unplaced ·", b.points.sql.slice(0, 90));
}
```

Run: `npx tsx scripts/city-sql-smoke.ts`
Expected: every line starts with `OK`; the rectangle robbery line prints a few dozen points (57 on 2026-10-10). Any HTTP 403 means the City refused a construct: stop and report it, don't work around it.

- [ ] **Step 7: Commit**

```bash
git add convex/lib/citySql.ts convex/lib/cityPoints.ts scripts/city-sql-smoke.ts tests/lib/citySql.test.ts tests/lib/cityPoints.test.ts
git commit -m "feat: guarded rectangle query and point tallies for neighborhood counts

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: `countRecords` counts by neighborhood

**Files:**
- Modify: `convex/city.ts`
- Test: `convex/city.test.ts` (add a describe block)

**Interfaces:**
- Consumes: `matchName`, `NameMatch` (Task 2); `buildCount(..., area)`, `Built.points` (Task 6); `tallyPoints`, `rankGroups`, `POINTS_CAP` (Task 6); `Geometry`, `Bbox` (Task 1); table `neighborhoods` (Task 4).
- Produces:
  - `internal.city.findNeighborhood({ asked })` → `{ kind: "one"; name: string; geometry: string; bbox: Bbox } | { kind: "choose"; names: string[] } | { kind: "none"; nearest: string[] } | { kind: "empty" }`.
  - `countRecords` args gain `neighborhood: v.optional(v.string())`.
  - `CountResult` ok variant gains `area: string | null; noLocation: number`; new variants `{ status: "no-neighborhood"; code; name; asked: string; nearest: string[] }`, `{ status: "no-locations"; code; name }`, `{ status: "too-broad"; code; name; area: string }`. A close-but-unclear name returns the existing `choose` variant with `column: "neighborhood"`.

- [ ] **Step 1: Write the failing tests** (add to `convex/city.test.ts`; extend `seed()` so its NIBRS profile has `latColumn: "Address_Latitude", lonColumn: "Address_Longitude"`, and insert one City neighborhood)

```ts
const ring = [[-87.92, 43.06], [-87.9, 43.06], [-87.9, 43.08], [-87.92, 43.08], [-87.92, 43.06]];
async function withHarambee(t: Awaited<ReturnType<typeof seed>>) {
  await t.run((ctx) => ctx.db.insert("neighborhoods", { definition: "city", name: "Harambee", matchKey: "harambee", geometry: JSON.stringify({ type: "Polygon", coordinates: [ring] }), bbox: { minLat: 43.06, maxLat: 43.08, minLon: -87.92, maxLon: -87.9 } }));
}

describe("countRecords by neighborhood", () => {
  it("counts only points inside the boundary, groups them, and says which boundary", async () => {
    const t = await seed();
    await withHarambee(t);
    installFakeFetch({
      citySql: (sql) => sql.includes(" AS lat")
        ? [{ lat: 43.07, lon: -87.91, g: "2026-09" }, { lat: 43.07, lon: -87.91, g: "2026-10" }, { lat: 43.079, lon: -87.919, g: "2026-10" }, { lat: 43.5, lon: -87.91, g: "2026-10" }]
        : sql.includes("IS NULL OR") ? [{ n: "3" }] : [{ n: "999" }],
    });
    const r = await t.withIdentity(reader).action(api.city.countRecords, { code: "P01", neighborhood: "harambee neighborhood", groupBy: "month" });
    expect(r).toMatchObject({ status: "ok", count: 3, area: "Harambee (City of Milwaukee boundary)", noLocation: 3, groups: [{ label: "Sep 2026", count: 1 }, { label: "Oct 2026", count: 2 }], futureExcluded: 0 });
  });
  it("never counts a name that matches nothing, and asks which for an unclear one", async () => {
    const t = await seed();
    await withHarambee(t);
    const fake = installFakeFetch({ citySql: () => [{ n: "5" }] });
    expect(await t.withIdentity(reader).action(api.city.countRecords, { code: "P01", neighborhood: "Gotham Heights" })).toMatchObject({ status: "no-neighborhood", asked: "Gotham Heights", nearest: ["Harambee"] });
    expect(await t.withIdentity(reader).action(api.city.countRecords, { code: "P01", neighborhood: "Harambe" })).toMatchObject({ status: "choose", column: "neighborhood", choices: ["Harambee"] });
    expect(fake.calls.filter((c) => c.url.includes("datastore_search_sql"))).toHaveLength(0);
  });
  it("refuses a dataset without locations, a too-broad question, and an empty boundary table", async () => {
    const t = await seed();
    await withHarambee(t);
    await t.run(async (ctx) => {
      const p = (await ctx.db.query("cityProfiles").first())!;
      await ctx.db.patch(p._id, { latColumn: null, lonColumn: null });
    });
    expect(await t.withIdentity(reader).action(api.city.countRecords, { code: "P01", neighborhood: "Harambee" })).toMatchObject({ status: "no-locations" });

    const t2 = await seed();
    await withHarambee(t2);
    installFakeFetch({ citySql: (sql) => (sql.includes(" AS lat") ? Array.from({ length: 32000 }, () => ({ lat: 43.07, lon: -87.91 })) : [{ n: "0" }]) });
    expect(await t2.withIdentity(reader).action(api.city.countRecords, { code: "P01", neighborhood: "Harambee" })).toMatchObject({ status: "too-broad", area: "Harambee (City of Milwaukee boundary)" });

    const t3 = await seed();
    expect(await t3.withIdentity(reader).action(api.city.countRecords, { code: "P01", neighborhood: "Harambee" })).toMatchObject({ status: "unavailable" });
  });
  it("answers a period outside the data's coverage without asking the City", async () => {
    const t = await seed();
    await withHarambee(t);
    const fake = installFakeFetch({ cityStatus: 500 });
    expect(await t.withIdentity(reader).action(api.city.countRecords, { code: "P01", neighborhood: "Harambee", from: "2010-01-01", to: "2010-12-31" })).toMatchObject({ status: "outside-coverage" });
    expect(fake.calls.filter((c) => c.url.includes("datastore_search_sql"))).toHaveLength(0);
  });
});
```

Also update the existing "counts live, groups oldest to newest…" test's `toMatchObject` to include `area: null, noLocation: 0`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run convex/city.test.ts`
Expected: FAIL — `neighborhood` is not a valid argument / `findNeighborhood` undefined.

- [ ] **Step 3: Implement**

In `convex/city.ts` add imports: `matchName` from `./lib/neighborhoodNames`; `rankGroups`, `tallyPoints`, `POINTS_CAP` from `./lib/cityPoints`; `type Bbox`, `type Geometry` from `./lib/geo`.

```ts
type Found =
  | { kind: "one"; name: string; geometry: string; bbox: Bbox }
  | { kind: "choose"; names: string[] }
  | { kind: "none"; nearest: string[] }
  | { kind: "empty" };

// The City's official boundary for a typed name: one match, a short choice, or none (never a guess).
export const findNeighborhood = internalQuery({
  args: { asked: v.string() },
  handler: async (ctx, { asked }): Promise<Found> => {
    const rows = await ctx.db.query("neighborhoods").withIndex("by_definition_matchKey", (q) => q.eq("definition", "city")).collect();
    if (rows.length === 0) return { kind: "empty" };
    const m = matchName(asked, rows);
    if (m.kind !== "one") return m;
    return { kind: "one", name: m.row.name, geometry: m.row.geometry!, bbox: m.row.bbox! };
  },
});
```

Extend `CountResult`: ok variant `area: string | null; noLocation: number;` and add the three new variants listed under Interfaces.

In `countRecords`: add `neighborhood: v.optional(v.string())` to `args`; destructure `{ code, neighborhood, ...args }`. After the `not-live` check:

```ts
    let found: Extract<Found, { kind: "one" }> | null = null;
    if (neighborhood?.trim()) {
      const f: Found = await ctx.runQuery(internal.city.findNeighborhood, { asked: neighborhood });
      if (f.kind === "empty") return { status: "unavailable" as const, code: data.code, name };
      if (f.kind === "choose") return { status: "choose" as const, code: data.code, name, column: "neighborhood", asked: neighborhood, choices: f.names };
      if (f.kind === "none") return { status: "no-neighborhood" as const, code: data.code, name, asked: neighborhood, nearest: f.nearest };
      found = f;
    }
    const built = buildCount(profile, args, chicagoDay(Date.now()), found?.bbox);
```

(replacing the existing `const built = …` line). In the `!built.ok` branch, `no-locations` flows through the existing refusal spread. Inside the `try`, before the citywide path:

```ts
      if (found && built.points) {
        const area = `${found.name} (City of Milwaukee boundary)`;
        const rows = await datastoreSql<{ lat: unknown; lon: unknown; g?: unknown }>(built.points.sql);
        if (rows.length >= POINTS_CAP) return { status: "too-broad" as const, code: data.code, name, area };
        const [missing] = await datastoreSql<{ n: string }>(built.points.missingSql);
        const byDate = built.groupLabel === "month" || built.groupLabel === "year";
        const tally = tallyPoints(rows, JSON.parse(found.geometry) as Geometry, built.overlap);
        const ranked = rankGroups(tally.groups, byDate, built.overlap, MAX_GROUPS);
        return {
          status: "ok" as const, code: data.code, name, count: tally.count,
          groups: built.groupLabel ? ranked.top.map(([g, n]) => ({ label: groupName(built.groupLabel, g), count: n })) : [],
          other: ranked.other, otherLabel: ranked.capped ? (byDate ? "Earlier" : "Other") : null, overlap: built.overlap,
          period: built.period, filters: built.filterLabels, futureExcluded: 0,
          caveat: data.caveat, dateColumn: built.dateColumn, coverage: built.coverage, resourceName: profile.resourceName ?? null, namesPeople: profile.namesPeople,
          area, noLocation: cityCount(missing),
        };
      }
```

and add `area: null, noLocation: 0` to the existing citywide `return`. (`futureExcluded: 0` because the City's future-dated count is citywide; the date window already excludes those records.)

- [ ] **Step 4: Run tests**

Run: `npx vitest run convex/city.test.ts --maxWorkers=2`
Expected: PASS.

- [ ] **Step 5: Typecheck and commit**

Run: `npx tsc --noEmit -p .` — fixes the CountCard/AskCards type narrowing if any switch is exhaustive (Task 8 renders the new statuses; if tsc fails only in `ui/components/AskCards.tsx`, add a temporary `default: return <Failed />` there and note it for Task 8).

```bash
git add convex/city.ts convex/city.test.ts
git commit -m "feat: countRecords counts City records inside a neighborhood's official boundary

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Ask uses it, and the cards say which definition

**Files:**
- Modify: `lib/ask/tools.ts`, `lib/ask/prompt.ts`, `ui/components/AskCards.tsx`, `convex/ask.ts` (`getNumber`)
- Test: `convex/ask.test.ts` (existing; add `definition` case), `e2e/ask.spec.ts` (add one test), `scripts/ask-questions.ts` (3 questions)

**Interfaces:**
- Consumes: `CountResult` new fields/statuses (Task 7); `neighborhoods` `dycu` rows (Task 4).
- Produces: `getNumber` ok result gains `definition: string | null` (e.g. `"census tracts 71, 72, 79, 80 and 107"`).

- [ ] **Step 1: Write the failing `getNumber` test** (in `convex/ask.test.ts`, inside the suite that already seeds N03 and calls `api.ask.getNumber`; reuse its seed)

```ts
  it("names DYCU's tract definition for the neighborhood and year", async () => {
    const t = await seedN03(); // the existing helper in this file that seeds Harambee's N03 table
    await t.run((ctx) => ctx.db.insert("neighborhoods", { definition: "dycu", name: "Harambee", matchKey: "harambee", tracts: [{ years: [2021, 2022, 2023, 2024], tracts: ["63", "67", "68", "69", "1860"] }] }));
    const r = await t.query(api.ask.getNumber, { neighborhood: "Harambee", topic: "Poverty Status by Age", row: "Under 5 years" });
    expect(r).toMatchObject({ status: "ok", definition: "census tracts 63, 67, 68, 69 and 1860" });
  });
```

(Use the helper name this file actually has; if the seed's Harambee year isn't in `years`, use that year.)

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run convex/ask.test.ts -t "tract definition"`
Expected: FAIL — `definition` undefined.

- [ ] **Step 3: Implement `definition` in `getNumber`**

In `convex/ask.ts`, add above `getNumber`:

```ts
const listWords = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

// "census tracts 71, 72 and 107": DYCU's definition for that report year (or its latest), or null if none is stored.
async function dycuDefinition(ctx: QueryCtx, place: string, year: number | null): Promise<string | null> {
  const row = await ctx.db.query("neighborhoods").withIndex("by_definition_matchKey", (q) => q.eq("definition", "dycu").eq("matchKey", place)).first();
  const versions = row?.tracts ?? [];
  const v = versions.find((x) => year !== null && x.years.includes(year)) ?? versions.at(-1);
  return v ? `census tract${v.tracts.length > 1 ? "s" : ""} ${listWords(v.tracts)}` : null;
}
```

(import `QueryCtx` from `./_generated/server` if not already), and in the ok return add `definition: await dycuDefinition(ctx, placeKey(label(m)), m.years[0] ?? null),`.

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run convex/ask.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire the tool and the rules**

In `lib/ask/tools.ts`, in the `countRecords` tool: append to `description`: `" With neighborhood, counts only records located inside that City of Milwaukee neighborhood's official boundary; if it returns choices, pick one and call again; if no-neighborhood, tell the person and offer the nearest names."` and add the parameter:

```ts
        neighborhood: z.string().max(80).optional().describe("A City of Milwaukee neighborhood name, e.g. Harambee"),
```

In `lib/ask/prompt.ts`, after the `countRecords` rule, add:

```
- For City records in a neighborhood ("robberies in Harambee"), call countRecords with neighborhood: it counts inside the City's official boundary and the card names it. DYCU's own neighborhood numbers (poverty, rent, health) come from getNumber, which uses DYCU's census-tract definition. Never move a number from one definition to the other.
- If countRecords says no-locations, the dataset doesn't record where things happened: say it can't be counted by neighborhood. If it says too-broad, suggest a shorter period. If it says no-neighborhood, say there's no City neighborhood by that name and offer the names it returned.
```

- [ ] **Step 6: Render the lines and the new statuses**

In `ui/components/AskCards.tsx` `CountCard`, after the coverage line:

```tsx
      {r.area && <p className={styles.source} data-area>In {r.area}</p>}
      {r.noLocation > 0 && <p className={styles.source} data-no-location>{r.noLocation.toLocaleString("en-US")} matching records citywide have no location and aren&apos;t included.</p>}
```

In the `countRecords` render, with the other status lines:

```tsx
    if (r.status === "no-neighborhood") return <p className={styles.failed} data-card="count-no-neighborhood">No City neighborhood is called &ldquo;{r.asked}&rdquo;.{r.nearest.length ? ` Nearest: ${r.nearest.join(", ")}.` : ""}</p>;
    if (r.status === "no-locations") return <p className={styles.failed}>{r.name} doesn&apos;t record locations, so it can&apos;t be counted by neighborhood. <OpenLink code={r.code} onOpen={onOpen} /></p>;
    if (r.status === "too-broad") return <p className={styles.failed}>Too many {r.name} records in {r.area} to count at once; try a shorter period.</p>;
```

(remove any temporary `default` added in Task 7). In `NumberCard`, after the phone `figcaption` and in the laptop reference paragraph, add:

```tsx
{r.definition && <span className={styles.source} data-definition> {r.neighborhood} as DYCU defines it: {r.definition}</span>}
```

(laptop: inside the `<p data-card="number">` after the provenance tag; phone: as a `<p className={styles.source} data-definition>` right after the `figcaption`). Add `definition: string | null` to `NumberResult` (line ~17).

- [ ] **Step 7: Typecheck and run unit tests**

Run: `npx tsc --noEmit -p . && npx vitest run --maxWorkers=2`
Expected: no tsc output; all tests pass.

- [ ] **Step 8: Add the browser test and the report-card questions**

In `e2e/ask.spec.ts`, inside the signed-in describe (after "a City count arrives as a card…"):

```ts
  test("a neighborhood count names the City boundary it used", async ({ page }) => {
    test.skip(!(await page.request.get("https://data.milwaukee.gov/api/3/action/status_show").then((r) => r.ok()).catch(() => false)), "City API unreachable");
    await ask(page, "How many robberies in Harambee this year?");
    const card = page.locator("[data-card=count]").first();
    await expect(card).toBeVisible({ timeout: 40_000 });
    await expect(card.locator("[data-area]")).toHaveText("In Harambee (City of Milwaukee boundary)");
    await expect(card.locator("[data-count]")).toHaveText(/^\d{1,3}(,\d{3})*$/);
  });
```

In `scripts/ask-questions.ts`, in the City block:

```ts
  { q: "How many robberies were there in Harambee this year?", tool: "countRecords", expect: { neighborhood: "Harambee" } },
  { q: "How many fire calls were there in Riverwest each month this year?", tool: "countRecords", expect: { neighborhood: "Riverwest" } },
  { q: "How many burglaries were there in Gotham Heights this year?", tool: "countRecords", expect: {} },
```

(Check how `expect` keys are compared in the report-card grader; if it matches tool arguments by key, `neighborhood` works as written; if not, use `{}`.)

- [ ] **Step 9: Commit**

```bash
git add lib/ask/tools.ts lib/ask/prompt.ts ui/components/AskCards.tsx convex/ask.ts convex/ask.test.ts e2e/ask.spec.ts scripts/ask-questions.ts
git commit -m "feat: Ask counts City records by neighborhood; cards name the boundary or DYCU's tracts

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Dev run, docs, and verification

**Files:**
- Create: `docs/decisions/024-neighborhood-translator.md`
- Modify: `DESIGN.md` (City count card section), `docs/LEARNING-LOG.md`

- [ ] **Step 1: Rebuild dev and check the data (free; the build's AI spend is ≈ $0 because no explainer inputs change)**

```bash
npx convex dev --once
npx convex run build:start
# poll until completed:
npx convex data builds --limit 1 --order desc --format jsonLines | python3 -c "import sys,json; d=json.loads(sys.stdin.read(),strict=False); print(d['status'], d.get('failed'), d.get('costUsd'), d.get('notes'))"
npx convex data neighborhoods --limit 300 --format jsonLines | python3 -c "import sys,json,collections; print(collections.Counter(json.loads(l)['definition'] for l in sys.stdin if l.strip()))"
npx convex data cityProfiles --limit 500 --format jsonLines | python3 -c "import sys,json; [print(r['familyKey'], r.get('latColumn'), r.get('lonColumn')) for r in map(json.loads, filter(str.strip, sys.stdin)) if r.get('latColumn')]"
```

Expected: build `completed`, 0 failed, cost under $0.05; `Counter({'city': 190, 'dycu': 28})`; profiles with lat/lon: nibrs-crime-data, mfd-calls-for-service-detail, fire-incident-detail, libraries (and not citypropertymailinglist).

- [ ] **Step 2: Browser tests on dev**

```bash
set -a; . ./.env.local; set +a
BASE_URL=http://localhost:3200 npx playwright test e2e/ask.spec.ts e2e/city.spec.ts --workers=2 --reporter=line
```

Expected: all pass (failures: rerun alone twice; a load flake passes alone).

- [ ] **Step 3: Report card (≈ $0.10; approved in the spec)**

Find the indexes of the 3 new questions in `scripts/ask-questions.ts` (0-based order of `ASK_QUESTIONS`), then:

```bash
npm run ask:card -- --only=<i1>,<i2>,<i3> --cap=1 --verbose
```

Expected: 3/3. The Gotham Heights reply must contain no figure and its tool result must be `no-neighborhood`.

- [ ] **Step 4: Write decision 024 (plain English; Tarik's global rule)**

```markdown
# 024: Count City records by neighborhood, naming the boundary

**Decision:** Ask counts City of Milwaukee records (crime, fire and EMS calls) inside a neighborhood using the City's official boundary, and every answer says which definition of the neighborhood it used.

**Why this came up:** Reporters ask about neighborhoods ("robberies in Harambee this year"), but City records carry map coordinates, not neighborhood names. DYCU defines its 28 neighborhoods as lists of census tracts (the small areas the Census Bureau counts people in), and the City draws its own 190 boundaries; the two "Harambee"s don't cover exactly the same ground. A wrong or silent choice would give a reporter a number for a different area than they think.

**Options:**
- *Match the data (chosen):* City records use the City's boundary; DYCU numbers use DYCU's tracts. Cost: two answers about "Harambee" can cover slightly different ground, so each card must say which.
- *Always DYCU's tracts:* matches DYCU's reports everywhere. Cost: only 28 neighborhoods can be asked about, and crime points would be tested against tract shapes we'd have to add.
- *Always the City's boundary:* covers all 190 names. Cost: DYCU-based numbers would be re-weighted and stop matching DYCU's own reports.

**How it counts:** the City's database returns the matching records inside the neighborhood's surrounding rectangle (just their coordinates), and the server keeps those inside the exact boundary. Only the count leaves the server. Records with no location are counted separately and said so.

**What we chose and why:** Match the data — Tarik's call, 2026-10-10 — because a reporter citing a number needs it to mean what its source means.

**What we gave up:** One name, two areas. A question so broad that the rectangle holds more than 32,000 records (the City's per-query limit) gets "try a shorter period" instead of a number.

**How we'll know if this was right:** the report card's neighborhood questions pass; no reader reports a neighborhood count that contradicts the City's own figures for that boundary.

**What actually happened:**
```

- [ ] **Step 5: DESIGN.md and the learning log**

In `DESIGN.md`, in the "City count card (Ask)" bullet, append: `A neighborhood count adds two small graphite lines under the coverage line: "In Harambee (City of Milwaukee boundary)" and, when any, "N matching records citywide have no location and aren't included." A DYCU neighborhood number adds "Harambee as DYCU defines it: census tracts …".`

In `docs/LEARNING-LOG.md`, add a dated "Suggested entries (for Tarik to write in his own words)" item for 2026-10-10 with three prompts: expected the City's SQL to refuse casts (it refused some functions before) → `::float` works inside a numeric guard; expected a crime map to be the first neighborhood feature → a count by boundary came first because it's citable; expected all 28 DYCU definitions in one sentence form → three combined names needed a wider pattern (fill in the actual outcome from Task 4 Step 9).

- [ ] **Step 6: Full verification**

```bash
npx vitest run --maxWorkers=2
npx tsc --noEmit -p .
npm run build
```

Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add docs/decisions/024-neighborhood-translator.md DESIGN.md docs/LEARNING-LOG.md
git commit -m "docs: decision 024, card lines in DESIGN.md, suggested learning entries

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 8: Hand off production (Tarik runs these)**

Tell Tarik, in order: `! npx convex deploy -y` (adds the `neighborhoods` table and optional profile fields; additive), then `! npx convex run build:start --prod` (fills boundaries, re-profiles; ≈ $0). After both: check prod counts with the Step 1 commands plus `--prod`, push the branch, open the PR (body: what it does, the City SQL lesson, verification numbers, backend-first note, deferred items), and wait for CI and Tarik's "merge".
