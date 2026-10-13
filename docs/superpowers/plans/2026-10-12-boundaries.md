# Boundaries and Places Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An address, a neighborhood, a tract or an aldermanic district tells you which City of Milwaukee boundaries cover it: district and alder, ward and polling place, TIN/NRSA/NSP, TID/BID/Opportunity Zone.

**Architecture:**
- The weekly build copies eight City boundary layers into a `boundaries` table.
- It precomputes a `boundaryOverlaps` table: for each tract, City neighborhood, DYCU area and district, which boundaries cover it and what share. The share comes from the same grid-of-points sampling G uses.
- H's address lookup tests the point against the stored shapes.
- A new Ask tool, `boundariesFor`, reads the overlap table.
- The `/n` box shows a results panel instead of navigating.

**Tech Stack:** Convex (actions, internal queries and mutations, convex-test), Next.js 16 App Router, CopilotKit v2 `useRenderTool`, Zod, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-12-boundaries-design.md`

## Global Constraints

**Source and refresh:**
- Layers: `https://milwaukeemaps.milwaukee.gov/arcgis/rest/services/<path>/query?where=1%3D1&outFields=*&outSR=4326&f=geojson`, with the paths in spec §2.
- Each kind is replaced only when its layer was read, wasn't truncated, and gave at least one usable shape. Otherwise the note reads "<Label> boundaries unavailable, kept last week's: <reason>".

**Names** (spec §4): `District {DISTRICT}`, `Ward {WARD}`, `{TIN} TIN`, `NRSA {NRSA}`, `NSP {NSP}: {AGENCY}`, `TID {TID}: {NAME}`, `BID {BID}: {BIDNAME}`, `Opportunity Zone (2010 tract {TRACTTEXT})`. All text is trimmed, with whitespace runs (including `\r\n`) collapsed to one space.

**Overlaps:**
- A point counts for **every** boundary of a kind containing it.
- Shares are rounded percents; under 1% is dropped.
- A district's row doesn't list itself.

**Share wording:** `>= 99` → "all of it"; `< 5` → "a small part (under 5%)"; else "about {n}%".

**Copy, verbatim:**
- "From the City's polling place list as of {date}. Polling places can change before an election; confirm yours at myvote.wi.gov." (myvote.wi.gov links to `https://myvote.wi.gov`)
- "The City's boundary files haven't been loaded yet."
- "The City's boundaries (districts, wards, investment and development areas) don't cover this address."
- "Shares are estimated from a grid of points, about ±2%. From the City's boundary files as of {date}."
- Refusals: "I couldn't find that place. Did you mean: …?" · "The City's boundaries don't reach this tract." · "The City's boundary files haven't been loaded yet."

**Privacy:** nothing about a person or property is stored, and no address; lookups change no table.

**Project rules:**
- Every dev Convex push (`npx convex dev --once`) and every dev data run needs Tarik's explicit OK.
- Never stage `.superpowers/` or `clerk-creamcityalmanac.app.zone`.
- Commit trailer: `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

**Plan rulings on the spec's open details** (each recorded here, not decided in secret):
1. Overlap rows for `city` and `dycu` places are keyed by the stored neighborhood **name**, not `matchKey`, because G's `findArea` returns the name.
2. `covers` entries for `district` and `ward` carry their `details`, so `boundariesFor` needs no join, and the schema adds `details` (optional) to each cover. A district *place* reads its own alder from `boundaries`.
3. The address answer's `asOf` is the oldest `fetchedAt` across all stored boundary rows.
4. `boundariesFor` returns the asked `kinds`, so the card can say "None" for an asked kind with no cover.

## Review Focus

1. **A County tract outside the City** asked in `boundariesFor` says "outside-city", never a list of "None"s implying the City checked. (Test: Task 4.)
2. **A ward with an empty accessible entrance or parking text** omits that line, never prints "undefined" or a blank line. (Task 3's `boundariesAt` test pins the empty strings; the component's conditionals have no render test, so the reviewer checks them.)
3. **Every polling place shown** carries the as-of date and the myvote.wi.gov link, in both the Ask card and the `/n` panel. (Test: Task 3 unit and e2e.)
4. **Two overlapping TIDs** both appear for a place inside both. (Test: Task 1.)
5. **A week where one layer fails** still builds overlaps from that kind's kept rows, not an empty list. (Test: Task 2.)

---

### Task 1: Boundary layers and shares (pure)

**Files:**
- Create: `convex/lib/boundaries.ts`
- Test: `tests/lib/boundaries.test.ts`

**Interfaces:**
- Produces:
  - `BOUNDARY_KINDS: readonly ["district","ward","tin","nrsa","nsp","tid","bid","oz"]`, `type BoundaryKind`
  - `BOUNDARY_LAYERS: Record<BoundaryKind, { label: string; path: string }>`
  - `layerUrl(kind): string`
  - `type BoundaryRow = { name: string; details: Record<string, string>; geometry: string; bbox: Bbox }`
  - `parseBoundaryLayer(kind, geojson): { rows: BoundaryRow[]; skipped: string[] }`, which throws on no features, a truncated layer, or no usable shapes
  - `type BoundaryShape = { kind: BoundaryKind; name: string; details?: Record<string, string>; geometry: Geometry; bbox: Bbox }`
  - `type Cover = { kind: BoundaryKind; name: string; share: number; details?: Record<string, string> }`
  - `boundaryShares(place: Geometry, shapes: BoundaryShape[]): Cover[]`, which keeps `details` only for district and ward
  - `unionOf(gs: Geometry[]): Geometry`
  - `newestTracts(entries?: { years: number[]; tracts: string[] }[]): string[]`
  - `tractGeoid(asked: string): string | null`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/lib/boundaries.test.ts
import { describe, expect, it } from "vitest";
import { boundaryShares, layerUrl, newestTracts, parseBoundaryLayer, tractGeoid, unionOf, type BoundaryShape } from "../../convex/lib/boundaries";
import { inShape, type Geometry } from "../../convex/lib/geo";

const square = (x0: number, y0: number, x1: number, y1: number): Geometry => ({ type: "Polygon", coordinates: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]] });
const shape = (kind: BoundaryShape["kind"], name: string, g: Geometry, details?: Record<string, string>): BoundaryShape => {
  const ring = (g as { coordinates: number[][][] }).coordinates[0];
  const lons = ring.map((p) => p[0]); const lats = ring.map((p) => p[1]);
  return { kind, name, geometry: g, bbox: { minLon: Math.min(...lons), maxLon: Math.max(...lons), minLat: Math.min(...lats), maxLat: Math.max(...lats) }, ...(details ? { details } : {}) };
};
const fc = (features: unknown[], extra: object = {}) => ({ type: "FeatureCollection", features, ...extra });
const feature = (properties: object, g: Geometry | null = square(0, 0, 1, 1)) => ({ properties, geometry: g });

describe("parseBoundaryLayer", () => {
  it("names each kind the spec's way and keeps the ward's polling place, collapsing the City's line breaks", () => {
    expect(parseBoundaryLayer("district", fc([feature({ DISTRICT: 6, ALDERPERSON: "Jane Doe " })])).rows[0]).toMatchObject({ name: "District 6", details: { alder: "Jane Doe" } });
    expect(parseBoundaryLayer("ward", fc([feature({ WARD: "112", POLLING_PL: "North Division High School", ADDRESS: "1011 W Center St", MAIN_ENTR: "Use the main entrance\r\n", ACSBL_ENTR: "The accessible entrance is\r\non Center St", MAIN_PKNG: "Street parking", ACSBL_PKNG: " " })])).rows[0]).toMatchObject({
      name: "Ward 112",
      details: { pollingPlace: "North Division High School", pollingAddress: "1011 W Center St", mainEntrance: "Use the main entrance", accessibleEntrance: "The accessible entrance is on Center St", mainParking: "Street parking" },
    });
    expect(parseBoundaryLayer("tin", fc([feature({ TIN: "Harambee Proud", OPEN_DATE: 1710201600000 })])).rows[0]).toMatchObject({ name: "Harambee Proud TIN", details: { opened: "2024-03-12" } });
    expect(parseBoundaryLayer("nrsa", fc([feature({ NRSA: "1" })])).rows[0].name).toBe("NRSA 1");
    expect(parseBoundaryLayer("nsp", fc([feature({ NSP: 18, AGENCY: "Historic Grandville" })])).rows[0]).toMatchObject({ name: "NSP 18: Historic Grandville", details: { agency: "Historic Grandville" } });
    expect(parseBoundaryLayer("tid", fc([feature({ TID: 41, NAME: "Time Warner-Riverwalk" })])).rows[0].name).toBe("TID 41: Time Warner-Riverwalk");
    expect(parseBoundaryLayer("bid", fc([feature({ BID: 4, BIDNAME: "Greater Mitchell Street" })])).rows[0].name).toBe("BID 4: Greater Mitchell Street");
    expect(parseBoundaryLayer("oz", fc([feature({ TRACTTEXT: "12" })])).rows[0].name).toBe("Opportunity Zone (2010 tract 12)");
  });
  it("drops empty detail texts rather than storing blanks", () => {
    expect(parseBoundaryLayer("ward", fc([feature({ WARD: "1", POLLING_PL: "Firehouse", ADDRESS: "1 Main St", ACSBL_PKNG: " " })])).rows[0].details).not.toHaveProperty("accessibleParking");
  });
  it("skips a feature with no name or no shape and names it; refuses an empty, missing or truncated layer", () => {
    const r = parseBoundaryLayer("tid", fc([feature({ TID: 41, NAME: "Riverwalk" }), feature({ TID: 42, NAME: "" }), feature({ TID: 43, NAME: "No Shape" }, null)]));
    expect(r.rows.map((x) => x.name)).toEqual(["TID 41: Riverwalk"]);
    expect(r.skipped).toEqual(["(unnamed)", "TID 43: No Shape"]);
    expect(() => parseBoundaryLayer("tid", fc([]))).toThrow(/no usable shapes/);
    expect(() => parseBoundaryLayer("tid", {})).toThrow(/returned no features/);
    expect(() => parseBoundaryLayer("tid", fc([feature({ TID: 1, NAME: "A" })], { exceededTransferLimit: true }))).toThrow(/truncated/);
    expect(() => parseBoundaryLayer("tid", fc([feature({ TID: 1, NAME: "A" })], { properties: { exceededTransferLimit: true } }))).toThrow(/truncated/);
  });
  it("asks the City's map server for every column, as GeoJSON in longitude/latitude", () => {
    expect(layerUrl("ward")).toBe("https://milwaukeemaps.milwaukee.gov/arcgis/rest/services/election/election_wards/MapServer/1/query?where=1%3D1&outFields=*&outSR=4326&f=geojson");
  });
});

describe("boundaryShares", () => {
  const place = square(0, 0, 1, 1);
  it("measures the share of a place a boundary covers, about ±2%", () => {
    const [c] = boundaryShares(place, [shape("tin", "Left Half TIN", square(-1, -1, 0.5, 2))]);
    expect(c.name).toBe("Left Half TIN");
    expect(Math.abs(c.share - 50)).toBeLessThanOrEqual(2);
  });
  it("counts a point for every boundary containing it, so two overlapping TIDs both appear", () => {
    const covers = boundaryShares(place, [shape("tid", "TID 1: A", square(-1, -1, 2, 2)), shape("tid", "TID 2: B", square(-1, -1, 0.5, 2))]);
    expect(covers.map((c) => [c.name, c.share >= 99 || Math.abs(c.share - 50) <= 2])).toEqual([["TID 1: A", true], ["TID 2: B", true]]);
  });
  it("drops boundaries under 1% but keeps a 3% sliver", () => {
    const covers = boundaryShares(place, [shape("tid", "Sliver", square(-1, -1, 0.03, 2)), shape("bid", "Speck", square(-1, -1, 0.005, 2))]);
    expect(covers.map((c) => c.name)).toEqual(["Sliver"]);
    expect(covers[0].share).toBeGreaterThanOrEqual(1);
    expect(covers[0].share).toBeLessThan(5);
  });
  it("orders by kind (district, ward, … oz), then biggest share; carries details only for districts and wards", () => {
    const covers = boundaryShares(place, [
      shape("oz", "Opportunity Zone (2010 tract 12)", square(-1, -1, 2, 2)),
      shape("ward", "Ward 2", square(-1, -1, 0.3, 2), { pollingPlace: "School" }),
      shape("ward", "Ward 1", square(0.3, -1, 2, 2), { pollingPlace: "Library" }),
      shape("district", "District 6", square(-1, -1, 2, 2), { alder: "Jane Doe" }),
      shape("tin", "Harambee Proud TIN", square(-1, -1, 2, 2), { opened: "2024-03-12" }),
    ]);
    expect(covers.map((c) => c.name)).toEqual(["District 6", "Ward 1", "Ward 2", "Harambee Proud TIN", "Opportunity Zone (2010 tract 12)"]);
    expect(covers[0].details).toEqual({ alder: "Jane Doe" });
    expect(covers[1].details).toEqual({ pollingPlace: "Library" });
    expect(covers[3]).not.toHaveProperty("details");
  });
  it("gives nothing for a place no boundary touches", () => {
    expect(boundaryShares(place, [shape("tid", "Far", square(5, 5, 6, 6))])).toEqual([]);
  });
});

describe("helpers", () => {
  it("joins a DYCU area's tracts into one shape that contains a point in any of them", () => {
    const u = unionOf([square(0, 0, 1, 1), square(1, 0, 2, 1)]);
    expect(inShape({ lon: 0.5, lat: 0.5 }, u)).toBe(true);
    expect(inShape({ lon: 1.5, lat: 0.5 }, u)).toBe(true);
    expect(inShape({ lon: 2.5, lat: 0.5 }, u)).toBe(false);
  });
  it("takes an area's newest year's tracts", () => {
    expect(newestTracts([{ years: [2019, 2020], tracts: ["71", "72"] }, { years: [2024], tracts: ["71", "107"] }])).toEqual(["71", "107"]);
    expect(newestTracts(undefined)).toEqual([]);
  });
  it("turns a tract as people write it into its County GEOID", () => {
    expect(tractGeoid("88")).toBe("55079008800");
    expect(tractGeoid("tract 88.01")).toBe("55079008801");
    expect(tractGeoid("Census tract 1857")).toBe("55079185700");
    expect(tractGeoid("55079008800")).toBe("55079008800");
    expect(tractGeoid("Harambee")).toBeNull();
    expect(tractGeoid("88.001")).toBeNull();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/lib/boundaries.test.ts`
Expected: FAIL, "Failed to resolve import ../../convex/lib/boundaries".

- [ ] **Step 3: Write the implementation**

```ts
// convex/lib/boundaries.ts
import { bboxOf, inBbox, inShape, type Bbox, type Geometry } from "./geo";
import { insidePoints } from "./tractPlaces";

// The City of Milwaukee's boundary files (docs/superpowers/specs/2026-10-12-boundaries-design.md §2, §4). Pure: no I/O.
export const BOUNDARY_KINDS = ["district", "ward", "tin", "nrsa", "nsp", "tid", "bid", "oz"] as const;
export type BoundaryKind = (typeof BOUNDARY_KINDS)[number];
export type BoundaryRow = { name: string; details: Record<string, string>; geometry: string; bbox: Bbox };
export type BoundaryShape = { kind: BoundaryKind; name: string; details?: Record<string, string>; geometry: Geometry; bbox: Bbox };
export type Cover = { kind: BoundaryKind; name: string; share: number; details?: Record<string, string> };

const BASE = "https://milwaukeemaps.milwaukee.gov/arcgis/rest/services";
export const BOUNDARY_LAYERS: Record<BoundaryKind, { label: string; path: string }> = {
  district: { label: "Aldermanic district", path: "election/election_geography/MapServer/1" },
  ward: { label: "Voting ward", path: "election/election_wards/MapServer/1" },
  tin: { label: "Targeted Investment Neighborhood", path: "planning/special_districts/MapServer/13" },
  nrsa: { label: "Neighborhood Revitalization Strategy Area", path: "planning/special_districts/MapServer/21" },
  nsp: { label: "Neighborhood Strategic Planning area", path: "planning/special_districts/MapServer/22" },
  tid: { label: "Tax Incremental District", path: "planning/special_districts/MapServer/8" },
  bid: { label: "Business Improvement District", path: "planning/special_districts/MapServer/3" },
  oz: { label: "Opportunity Zone", path: "planning/special_districts/MapServer/9" },
};
export const layerUrl = (kind: BoundaryKind) => `${BASE}/${BOUNDARY_LAYERS[kind].path}/query?where=1%3D1&outFields=*&outSR=4326&f=geojson`;

const text = (x: unknown) => (x === null || x === undefined ? "" : String(x).replace(/\s+/g, " ").trim());
const kept = (d: Record<string, string>) => Object.fromEntries(Object.entries(d).filter(([, x]) => x !== ""));

// A feature's display name and details; null when it has no name.
function describe(kind: BoundaryKind, p: Record<string, unknown>): { name: string; details: Record<string, string> } | null {
  const t = (k: string) => text(p[k]);
  const both = (a: string, b: string) => (t(a) && t(b) ? `${t(a)}: ${t(b)}` : "");
  const named = (name: string, details: Record<string, string> = {}) => (name ? { name, details: kept(details) } : null);
  switch (kind) {
    case "district": return named(t("DISTRICT") && `District ${t("DISTRICT")}`, { alder: t("ALDERPERSON") });
    case "ward": return named(t("WARD") && `Ward ${t("WARD")}`, {
      pollingPlace: t("POLLING_PL"), pollingAddress: t("ADDRESS"), mainEntrance: t("MAIN_ENTR"),
      accessibleEntrance: t("ACSBL_ENTR"), mainParking: t("MAIN_PKNG"), accessibleParking: t("ACSBL_PKNG"),
    });
    case "tin": return named(t("TIN") && `${t("TIN")} TIN`, { opened: typeof p.OPEN_DATE === "number" ? new Date(p.OPEN_DATE).toISOString().slice(0, 10) : "" });
    case "nrsa": return named(t("NRSA") && `NRSA ${t("NRSA")}`);
    case "nsp": return named(both("NSP", "AGENCY") && `NSP ${both("NSP", "AGENCY")}`, { agency: t("AGENCY") });
    case "tid": return named(both("TID", "NAME") && `TID ${both("TID", "NAME")}`);
    case "bid": return named(both("BID", "BIDNAME") && `BID ${both("BID", "BIDNAME")}`);
    case "oz": return named(t("TRACTTEXT") && `Opportunity Zone (2010 tract ${t("TRACTTEXT")})`);
  }
}

type Feature = { properties?: Record<string, unknown> | null; geometry?: { type?: unknown; coordinates?: unknown } | null };

// One layer's shapes. A truncated layer is refused (a partial list would drop boundaries without saying so), and so is
// one with no usable shape: the caller keeps last week's rows.
export function parseBoundaryLayer(kind: BoundaryKind, geojson: unknown): { rows: BoundaryRow[]; skipped: string[] } {
  const fc = geojson as { features?: Feature[]; exceededTransferLimit?: boolean; properties?: { exceededTransferLimit?: boolean } } | null;
  if (fc?.exceededTransferLimit || fc?.properties?.exceededTransferLimit) throw new Error("the layer was truncated");
  if (!Array.isArray(fc?.features)) throw new Error("the layer returned no features");
  const rows: BoundaryRow[] = [];
  const skipped: string[] = [];
  for (const f of fc.features) {
    const d = describe(kind, f.properties ?? {});
    const g = f.geometry;
    if (!d || !g || (g.type !== "Polygon" && g.type !== "MultiPolygon") || !Array.isArray(g.coordinates)) {
      skipped.push(d?.name ?? "(unnamed)");
      continue;
    }
    const geometry = { type: g.type, coordinates: g.coordinates } as Geometry;
    const bbox = bboxOf(geometry);
    if (![bbox.minLat, bbox.maxLat, bbox.minLon, bbox.maxLon].every(Number.isFinite)) {
      skipped.push(d.name);
      continue;
    }
    rows.push({ name: d.name, details: d.details, geometry: JSON.stringify(geometry), bbox });
  }
  if (rows.length === 0) throw new Error("the layer had no usable shapes");
  return { rows, skipped };
}

const MIN_COVER = 1; // percent of the place; G's neighborhood match keeps 10, but a TID is often a small part of a tract
const touches = (a: Bbox, b: Bbox) => a.minLat <= b.maxLat && a.maxLat >= b.minLat && a.minLon <= b.maxLon && a.maxLon >= b.minLon;

// Which boundaries cover a place, and how much of it: G's grid of points (insidePoints, about ±2%), where a point
// counts for every boundary containing it (TIDs and BIDs can overlap one another).
export function boundaryShares(place: Geometry, shapes: BoundaryShape[]): Cover[] {
  const inside = insidePoints(place);
  if (!inside.length) return [];
  const box = bboxOf(place);
  const near = shapes.filter((s) => touches(s.bbox, box));
  const counts = new Map<BoundaryShape, number>();
  for (const p of inside) for (const s of near) if (inBbox(p, s.bbox) && inShape(p, s.geometry)) counts.set(s, (counts.get(s) ?? 0) + 1);
  return [...counts]
    .map(([s, c]) => ({ s, c, share: Math.round((100 * c) / inside.length) }))
    .filter((x) => x.share >= MIN_COVER)
    .sort((x, y) => BOUNDARY_KINDS.indexOf(x.s.kind) - BOUNDARY_KINDS.indexOf(y.s.kind) || y.c - x.c || x.s.name.localeCompare(y.s.name))
    .map(({ s, share }) => ({ kind: s.kind, name: s.name, share, ...((s.kind === "district" || s.kind === "ward") && s.details ? { details: s.details } : {}) }));
}

// A DYCU area as one shape: its tracts' polygons together (tracts don't overlap, so even-odd stays correct).
export const unionOf = (gs: Geometry[]): Geometry => ({ type: "MultiPolygon", coordinates: gs.flatMap((g) => (g.type === "Polygon" ? [g.coordinates] : g.coordinates)) });

// An area's tracts in its newest definition year.
export function newestTracts(entries?: { years: number[]; tracts: string[] }[]): string[] {
  const list = entries ?? [];
  const year = Math.max(-Infinity, ...list.flatMap((e) => e.years));
  return [...new Set(list.filter((e) => e.years.includes(year)).flatMap((e) => e.tracts))];
}

// "88", "tract 88.01", "Census tract 1857" or a County GEOID → the 11-digit GEOID; anything else → null.
export function tractGeoid(asked: string): string | null {
  const s = asked.trim().replace(/^(census\s+)?tract\s+/i, "");
  if (/^55079\d{6}$/.test(s)) return s;
  if (!/^\d{1,4}(\.\d{1,2})?$/.test(s)) return null;
  return `55079${String(Math.round(Number(s) * 100)).padStart(6, "0")}`;
}
```

- [ ] **Step 4: Run them to verify they pass**

Run: `npx vitest run tests/lib/boundaries.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 5: Commit**

```bash
git add convex/lib/boundaries.ts tests/lib/boundaries.test.ts
git commit -m "feat: read the City's boundary layers and measure how much of a place each covers

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: The weekly refresh (tables, build step, overlaps)

**Files:**
- Modify: `convex/validators.ts` (add `vBoundaryKind`), `convex/schema.ts` (two tables), `convex/buildStore.ts` (three functions), `convex/build.ts` (`tractOutlines`, `refreshBoundaries`, the build's call)
- Modify: `tests/helpers/fakeFetch.ts` (`cityLayers`, `cityLayerStatus`)
- Create: `tests/helpers/boundaryFixtures.ts` (shared with Tasks 3–4; a helper, so importing it never re-runs another file's tests)
- Test: `convex/boundaries.test.ts`

**Interfaces:**
- Consumes (Task 1): `BOUNDARY_KINDS`, `BOUNDARY_LAYERS`, `layerUrl`, `parseBoundaryLayer`, `boundaryShares`, `unionOf`, `newestTracts`, `type BoundaryShape`
- Produces:
  - tables `boundaries` (index `by_kind`) and `boundaryOverlaps` (index `by_place` `["placeType","place"]`, `covers: { kind, name, share, details? }[]`, `builtAt`)
  - `internal.build.refreshBoundaries` (returns `string[]` notes)
  - `vBoundaryKind` and `vPlaceType` in `convex/validators.ts`
  - fakeFetch options `cityLayers?: Record<string, unknown>` and `cityLayerStatus?: Record<string, number>`, both keyed by layer path, e.g. `"election/election_wards/MapServer/1"`
  - `tests/helpers/boundaryFixtures.ts`: `LAYERS`, `seedBoundaryData(t)` and `runRefresh(t, opts?)`, where `t` is a `convexTest` instance

- [ ] **Step 1: Teach the fake City server the boundary layers**

In `tests/helpers/fakeFetch.ts`, add to `FakeOptions` after `cityNeighborhoodsStatus?: number;`:

```ts
  cityLayers?: Record<string, unknown>; // the City's boundary layers (f=geojson), by layer path, e.g. "election/election_wards/MapServer/1"
  cityLayerStatus?: Record<string, number>;
```

and, directly after the `special_districts/MapServer/4/query` branch:

```ts
    if (url.startsWith("https://milwaukeemaps.milwaukee.gov/arcgis/rest/services/") && url.includes("/query?")) {
      const path = url.slice("https://milwaukeemaps.milwaukee.gov/arcgis/rest/services/".length).split("/query?")[0];
      return json(opts.cityLayerStatus?.[path] ?? 200, opts.cityLayers?.[path] ?? { type: "FeatureCollection", features: [] });
    }
```

- [ ] **Step 2: Write the shared fixtures and the failing database tests**

```ts
// tests/helpers/boundaryFixtures.ts
import type { convexTest } from "convex-test";
import { internal } from "../../convex/_generated/api";
import { installFakeFetch } from "./fakeFetch";

type T = ReturnType<typeof convexTest>;
const sq = (x0: number, y0: number, x1: number, y1: number) => ({ type: "Polygon", coordinates: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]] });
const fc = (features: unknown[]) => ({ type: "FeatureCollection", features });
// Tract 88 is the square (-87.95, 43.06)–(-87.93, 43.08), also the City's Harambee and DYCU's Harambee.
// District 6 and Ward 112 cover all of it; a TIN covers its western half; tract 1501 is far outside every boundary.
export const TRACT_88 = sq(-87.95, 43.06, -87.93, 43.08);
export const LAYERS: Record<string, unknown> = {
  "election/election_geography/MapServer/1": fc([{ properties: { DISTRICT: 6, ALDERPERSON: "Jane Doe" }, geometry: sq(-88, 43, -87.9, 43.1) }]),
  "election/election_wards/MapServer/1": fc([{ properties: { WARD: "112", POLLING_PL: "North Division High School", ADDRESS: "1011 W Center St", ACSBL_ENTR: "Main entrance on W Center St", ACSBL_PKNG: "Street parking" }, geometry: sq(-88, 43, -87.9, 43.1) }]),
  "planning/special_districts/MapServer/13": fc([{ properties: { TIN: "Harambee Proud" }, geometry: sq(-87.96, 43.05, -87.94, 43.09) }]),
  "planning/special_districts/MapServer/21": fc([{ properties: { NRSA: "1" }, geometry: sq(-88, 43, -87.9, 43.1) }]),
  "planning/special_districts/MapServer/22": fc([{ properties: { NSP: 7, AGENCY: "Harambee Great Neighborhood Initiative" }, geometry: sq(-88, 43, -87.9, 43.1) }]),
  "planning/special_districts/MapServer/8": fc([{ properties: { TID: 72, NAME: "Bronzeville" }, geometry: sq(-87.931, 43.06, -87.929, 43.08) }]),
  "planning/special_districts/MapServer/3": fc([{ properties: { BID: 4, BIDNAME: "Far Away" }, geometry: sq(-87.5, 42.5, -87.4, 42.6) }]),
  "planning/special_districts/MapServer/9": fc([{ properties: { TRACTTEXT: "88" }, geometry: TRACT_88 }]),
};
const E02_URL = "https://services.test/arcgis/rest/services/2024%20County%20Poverty/FeatureServer/0";
export const TRACT_SHAPES = fc([
  { properties: { GEOID: "55079008800" }, geometry: TRACT_88 },
  { properties: { GEOID: "55079150100" }, geometry: sq(-87.8, 43.3, -87.79, 43.31) },
]);

// The City's Harambee, DYCU's Harambee (tract 88) and E02's County map, which the overlap step needs.
export async function seedBoundaryData(t: T) {
  await t.run(async (ctx) => {
    await ctx.db.insert("neighborhoods", { definition: "city", name: "Harambee", matchKey: "harambee", geometry: JSON.stringify(TRACT_88), bbox: { minLat: 43.06, maxLat: 43.08, minLon: -87.95, maxLon: -87.93 } });
    await ctx.db.insert("neighborhoods", { definition: "dycu", name: "Harambee", matchKey: "harambee", tracts: [{ years: [2024], tracts: ["88"] }] });
    await ctx.db.insert("families", { key: "dataset:poverty", code: "E02", name: "Households Living in Poverty", kind: "dataset", topic: "Economy", keywords: [], places: [], years: [2024], latestModified: "2024-01-01", baseSearchText: "", searchText: "", dictionaryTab: null });
    await ctx.db.insert("members", { familyKey: "dataset:poverty", hubId: "p24", title: "Poverty 2024", kind: "dataset", landingPage: "", place: "County", years: [2024], yearLabel: "2024", featureServerUrl: E02_URL, modified: "m", downloads: {}, description: "", keywords: [] });
  });
}
export function runRefresh(t: T, opts: { cityLayerStatus?: Record<string, number>; tractShapesStatus?: number } = {}) {
  installFakeFetch({ cityLayers: LAYERS, tractShapes: TRACT_SHAPES, ...opts });
  return t.action(internal.build.refreshBoundaries, {});
}
```

```ts
// convex/boundaries.test.ts
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runRefresh, seedBoundaryData } from "../tests/helpers/boundaryFixtures";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

async function seed() {
  const t = convexTest(schema, modules);
  await seedBoundaryData(t);
  return t;
}
const overlap = (t: Awaited<ReturnType<typeof seed>>, placeType: string, place: string) =>
  t.run((ctx) => ctx.db.query("boundaryOverlaps").withIndex("by_place", (q) => q.eq("placeType", placeType as never).eq("place", place)).unique());

describe("refreshBoundaries", () => {
  it("stores all eight kinds of the City's boundaries", async () => {
    const t = await seed();
    expect(await runRefresh(t)).toEqual([]);
    const rows = await t.run((ctx) => ctx.db.query("boundaries").collect());
    expect(rows.map((r) => [r.kind, r.name]).sort()).toEqual([
      ["bid", "BID 4: Far Away"], ["district", "District 6"], ["nrsa", "NRSA 1"], ["nsp", "NSP 7: Harambee Great Neighborhood Initiative"],
      ["oz", "Opportunity Zone (2010 tract 88)"], ["tid", "TID 72: Bronzeville"], ["tin", "Harambee Proud TIN"], ["ward", "Ward 112"],
    ]);
    expect(rows.find((r) => r.kind === "ward")?.details).toMatchObject({ pollingPlace: "North Division High School" });
  });
  it("builds overlaps for a tract, a City neighborhood, a DYCU area and a district", async () => {
    const t = await seed();
    await runRefresh(t);
    const tract = await overlap(t, "tract", "55079008800");
    expect(tract?.covers.map((c) => c.name)).toEqual(["District 6", "Ward 112", "Harambee Proud TIN", "NRSA 1", "NSP 7: Harambee Great Neighborhood Initiative", "TID 72: Bronzeville", "Opportunity Zone (2010 tract 88)"]);
    expect(tract?.covers.find((c) => c.kind === "tin")?.share).toBeGreaterThanOrEqual(48);
    expect(tract?.covers.find((c) => c.kind === "tin")?.share).toBeLessThanOrEqual(52);
    expect(tract?.covers.find((c) => c.kind === "ward")?.details).toMatchObject({ pollingPlace: "North Division High School" });
    expect((await overlap(t, "city", "Harambee"))?.covers.map((c) => c.name)).toContain("Harambee Proud TIN");
    expect((await overlap(t, "dycu", "Harambee"))?.covers.map((c) => c.name)).toContain("Harambee Proud TIN");
    const district = await overlap(t, "district", "6");
    expect(district?.covers.map((c) => c.kind)).not.toContain("district"); // a district doesn't list itself
    expect(district?.covers.map((c) => c.name)).toContain("Ward 112");
    expect((await overlap(t, "tract", "55079150100"))?.covers).toEqual([]); // a County tract the City's boundaries don't reach
  });
  it("keeps last week's rows for a layer that fails, says so, and still builds overlaps from them", async () => {
    const t = await seed();
    await runRefresh(t);
    const notes = await runRefresh(t, { cityLayerStatus: { "planning/special_districts/MapServer/13": 503 } });
    expect(notes).toEqual([expect.stringMatching(/^Targeted Investment Neighborhood boundaries unavailable, kept last week's: /)]);
    expect((await t.run((ctx) => ctx.db.query("boundaries").withIndex("by_kind", (q) => q.eq("kind", "tin")).collect())).map((r) => r.name)).toEqual(["Harambee Proud TIN"]);
    expect((await overlap(t, "tract", "55079008800"))?.covers.map((c) => c.name)).toContain("Harambee Proud TIN");
  });
  it("keeps last week's overlaps when the tract outlines can't be read", async () => {
    const t = await seed();
    await runRefresh(t);
    const notes = await runRefresh(t, { tractShapesStatus: 503 });
    expect(notes).toEqual([expect.stringMatching(/^Boundary overlaps unavailable, kept last week's: /)]);
    expect(await overlap(t, "tract", "55079008800")).not.toBeNull();
  });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `npx vitest run convex/boundaries.test.ts`
Expected: FAIL, `internal.build.refreshBoundaries` is undefined (or the schema has no `boundaries` table).

- [ ] **Step 4: Add the validators and tables**

In `convex/validators.ts`, after `vBbox`:

```ts
export const vBoundaryKind = v.union(v.literal("district"), v.literal("ward"), v.literal("tin"), v.literal("nrsa"), v.literal("nsp"), v.literal("tid"), v.literal("bid"), v.literal("oz"));
export const vPlaceType = v.union(v.literal("tract"), v.literal("city"), v.literal("dycu"), v.literal("district"));
export const vCover = v.object({ kind: vBoundaryKind, name: v.string(), share: v.number(), details: v.optional(v.record(v.string(), v.string())) });
```

In `convex/schema.ts`, import `vBoundaryKind, vCover, vPlaceType` alongside `vBbox`, and add after `tractNeighborhoods`:

```ts
  // The City's boundary files (districts, wards, investment and development areas), replaced weekly per kind
  // (docs/superpowers/specs/2026-10-12-boundaries-design.md §4).
  boundaries: defineTable({
    kind: vBoundaryKind,
    name: v.string(),
    details: v.record(v.string(), v.string()),
    geometry: v.string(),
    bbox: vBbox,
    fetchedAt: v.number(),
  }).index("by_kind", ["kind"]),

  // For each tract, City neighborhood, DYCU area and district: the boundaries covering it, with their share (percent,
  // ≥1). City and DYCU places are keyed by their stored name, tracts by GEOID, districts by number.
  boundaryOverlaps: defineTable({
    placeType: vPlaceType,
    place: v.string(),
    covers: v.array(vCover),
    builtAt: v.number(),
  }).index("by_place", ["placeType", "place"]),
```

- [ ] **Step 5: Add the store functions**

In `convex/buildStore.ts`, import `vBoundaryKind, vCover, vPlaceType` from `./validators`, and `newestTracts` from `./lib/boundaries`; add after `replaceTractNeighborhoods`:

```ts
// One kind's boundaries are replaced together, only after its layer was read successfully.
export const replaceBoundaries = internalMutation({
  args: { kind: vBoundaryKind, fetchedAt: v.number(), rows: v.array(v.object({ name: v.string(), details: v.record(v.string(), v.string()), geometry: v.string(), bbox: vBbox })) },
  handler: async (ctx, { kind, fetchedAt, rows }) => {
    for (const r of await ctx.db.query("boundaries").withIndex("by_kind", (q) => q.eq("kind", kind)).collect()) await ctx.db.delete(r._id);
    for (const r of rows) await ctx.db.insert("boundaries", { kind, ...r, fetchedAt });
  },
});

// Every stored boundary, City neighborhood and DYCU area (its newest year's tracts): the overlap step's inputs.
export const overlapInputs = internalQuery({
  args: {},
  handler: async (ctx) => {
    const hoods = (definition: "city" | "dycu") => ctx.db.query("neighborhoods").withIndex("by_definition_matchKey", (q) => q.eq("definition", definition)).collect();
    return {
      boundaries: (await ctx.db.query("boundaries").collect()).map(({ kind, name, details, geometry, bbox }) => ({ kind, name, details, geometry, bbox })),
      city: (await hoods("city")).flatMap((h) => (h.geometry ? [{ name: h.name, geometry: h.geometry }] : [])),
      dycu: (await hoods("dycu")).map((d) => ({ name: d.name, tracts: newestTracts(d.tracts) })),
    };
  },
});

// The whole overlap table is replaced together, only after a run that read the tract outlines.
export const replaceBoundaryOverlaps = internalMutation({
  args: { rows: v.array(v.object({ placeType: vPlaceType, place: v.string(), covers: v.array(vCover), builtAt: v.number() })) },
  handler: async (ctx, { rows }) => {
    for (const r of await ctx.db.query("boundaryOverlaps").collect()) await ctx.db.delete(r._id);
    for (const r of rows) await ctx.db.insert("boundaryOverlaps", r);
  },
});
```

- [ ] **Step 6: Add the refresh to the build**

In `convex/build.ts`, add imports:

```ts
import { BOUNDARY_KINDS, BOUNDARY_LAYERS, boundaryShares, layerUrl, parseBoundaryLayer, unionOf, type BoundaryShape } from "./lib/boundaries";
import { tractNumber } from "./lib/tractData";
```

(If `tractNumber` is already imported from `./lib/tractData` in the existing `import {` block at line 8, add it there instead.)

Replace the body of `refreshTractNeighborhoods`'s outline fetch with a shared helper. Add above `refreshTractNeighborhoods`:

```ts
// Every County tract's outline, from E02's newest County map (the same outlines the count cards' tract maps use).
// ponytail: fetched twice a week (neighborhoods and boundaries); share one fetch if the build ever gets slow.
async function tractOutlines(ctx: ActionCtx) {
  const e02 = await ctx.runQuery(internal.tracts.familyForTracts, { code: "E02" });
  const url = newestCountyUrl(e02?.members ?? []);
  if (!url) throw new Error("E02 has no County tract map");
  return parseTractShapes(await (await fetchOk(allTractsUrl(url), "Tract outlines")).json());
}
```

and in `refreshTractNeighborhoods` replace these four lines:

```ts
    const e02 = await ctx.runQuery(internal.tracts.familyForTracts, { code: "E02" });
    const url = newestCountyUrl(e02?.members ?? []);
    if (!url) throw new Error("E02 has no County tract map");
    const tracts = parseTractShapes(await (await fetchOk(allTractsUrl(url), "Tract outlines")).json());
```

with:

```ts
    const tracts = await tractOutlines(ctx);
```

Then add after `refreshTractNeighborhoods`:

```ts
// The City's boundary files (docs/superpowers/specs/2026-10-12-boundaries-design.md §4). Each kind is replaced only when
// its layer was read; the overlap table is rebuilt from whatever is stored, only when the tract outlines were read.
export const refreshBoundaries = internalAction({
  args: {},
  handler: async (ctx): Promise<string[]> => {
    const notes: string[] = [];
    for (const kind of BOUNDARY_KINDS) {
      const label = BOUNDARY_LAYERS[kind].label;
      try {
        const { rows, skipped } = parseBoundaryLayer(kind, await (await fetchOk(layerUrl(kind), `${label} boundaries`)).json());
        await ctx.runMutation(internal.buildStore.replaceBoundaries, { kind, rows, fetchedAt: Date.now() });
        if (skipped.length) notes.push(`${label} boundaries skipped (no usable shape or name): ${skipped.join(", ")}`);
      } catch (e) {
        notes.push(`${label} boundaries unavailable, kept last week's: ${message(e)}`);
      }
    }
    return [...notes, ...(await refreshOverlaps(ctx))];
  },
});

async function refreshOverlaps(ctx: ActionCtx): Promise<string[]> {
  try {
    const inputs = await ctx.runQuery(internal.buildStore.overlapInputs, {});
    if (inputs.boundaries.length === 0) throw new Error("no boundaries are stored");
    const tracts = await tractOutlines(ctx);
    const shapes: BoundaryShape[] = inputs.boundaries.map((b) => ({ ...b, geometry: JSON.parse(b.geometry) as Geometry }));
    const byNumber = new Map(tracts.map((t) => [tractNumber(t.geoid), t.geometry]));
    const places = [
      ...tracts.map((t) => ({ placeType: "tract" as const, place: t.geoid, geometry: t.geometry })),
      ...inputs.city.map((h) => ({ placeType: "city" as const, place: h.name, geometry: JSON.parse(h.geometry) as Geometry })),
      ...inputs.dycu.flatMap((d) => {
        const gs = d.tracts.flatMap((n) => byNumber.get(n) ?? []);
        return gs.length ? [{ placeType: "dycu" as const, place: d.name, geometry: unionOf(gs) }] : [];
      }),
      ...shapes.filter((s) => s.kind === "district").map((s) => ({ placeType: "district" as const, place: s.name.replace(/^District /, ""), geometry: s.geometry })),
    ];
    const builtAt = Date.now();
    const rows = places.map((p) => ({
      placeType: p.placeType, place: p.place, builtAt,
      covers: boundaryShares(p.geometry, shapes).filter((c) => !(p.placeType === "district" && c.kind === "district" && c.name === `District ${p.place}`)),
    }));
    if (rows.length === 0) throw new Error("no place to measure");
    await ctx.runMutation(internal.buildStore.replaceBoundaryOverlaps, { rows });
    return [];
  } catch (e) {
    return [`Boundary overlaps unavailable, kept last week's: ${message(e)}`];
  }
}
```

In the build's main handler, after the `neighborhoodNotes` try/catch block, add:

```ts
    let boundaryNotes: string[];
    try {
      boundaryNotes = await ctx.runAction(internal.build.refreshBoundaries, {});
    } catch (e) {
      boundaryNotes = [`Boundaries refresh failed: ${message(e)}`];
    }
```

and change the `completeBuild` call's `notes: [...neighborhoodNotes, ...cityNotes]` to `notes: [...neighborhoodNotes, ...boundaryNotes, ...cityNotes]`.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx convex codegen && npx vitest run convex/boundaries.test.ts convex/neighborhoods.test.ts`
Expected: PASS: 4 boundaries tests, and the neighborhood tests unchanged.

- [ ] **Step 8: Run the whole suite and the type check**

Run: `npx tsc --noEmit && npx vitest run --no-file-parallelism > .superpowers/sdd/2026-10-12-boundaries/suite-t2.log 2>&1; tail -5 .superpowers/sdd/2026-10-12-boundaries/suite-t2.log`
Expected: tsc clean; all tests pass. A whole-build test now hits the fake City layers; it only checks notes with `toContain`.

- [ ] **Step 9: Commit**

```bash
git add convex/validators.ts convex/schema.ts convex/buildStore.ts convex/build.ts tests/helpers/fakeFetch.ts tests/helpers/boundaryFixtures.ts convex/boundaries.test.ts convex/_generated
git commit -m "feat: copy the City's boundary files weekly and measure their overlap with each place

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 10: Load the boundaries on dev (needs Tarik's OK)**

With Tarik's explicit OK for a dev push and a dev data run:

Run: `npx convex dev --once && npx convex run build:refreshBoundaries`
Expected: `[]` or only "skipped" notes. Then check the real answer for the e2e address:

Run: `npx convex data boundaries --limit 1 | head -3 && npx convex data boundaryOverlaps --limit 1 | head -3`
Expected: rows exist in both tables. Record in the ledger the district and ward that contain 2400 W Center St, checked through Task 3's lookup once it exists. The e2e tests use patterns, not those values.

---

### Task 3: The address answer and the `/n` panel

**Files:**
- Modify: `convex/lib/boundaries.ts` (add `boundariesAt`, `type AddressBoundaries`)
- Modify: `convex/places.ts` (`placeAt` and `locate` return `boundaries`)
- Modify: `ui/lib/placeText.ts` (texts, `asOfDate`, `pollingNote`, the follow-up)
- Create: `ui/components/PlaceBoundaries.tsx`
- Modify: `ui/components/PlaceCard.tsx`, `ui/components/FindPlaceBox.tsx`
- Test: `tests/lib/boundaries.test.ts` (append), `convex/places.test.ts` (update and append), `tests/ui/placeText.test.ts` (append), `e2e/factsheet.spec.ts`, `e2e/ask.spec.ts`

**Interfaces:**
- Consumes (Tasks 1–2): the `boundaries` table and `BOUNDARY_KINDS`
- Produces:
  - `type WardDetails = { pollingPlace; pollingAddress; mainEntrance; accessibleEntrance; mainParking; accessibleParking }` (all strings)
  - `type AddressBoundaries = { asOf: number | null; district: { name: string; alder: string } | null; ward: ({ name: string } & WardDetails) | null; investment: string[]; development: string[] }`
  - `boundariesAt(p: Point, rows: { kind; name; details; geometry: string; bbox; fetchedAt }[]): AddressBoundaries`
  - `PlaceResult`'s `ok` member gains `boundaries: AddressBoundaries`
  - `asOfDate(ms: number): string` ("Oct 12, 2026")
  - `pollingNote(asOf: number): string`
  - `BOUNDARIES_NOT_LOADED`, `BOUNDARIES_NOT_COVERED`
  - `<PlaceBoundaries r meta? />`

- [ ] **Step 1: Write the failing pure tests**

Append to `tests/lib/boundaries.test.ts` (add `boundariesAt` to its import):

```ts
describe("boundariesAt", () => {
  const row = (kind: string, name: string, g: Geometry, details: Record<string, string> = {}, fetchedAt = 2000) => {
    const ring = (g as { coordinates: number[][][] }).coordinates[0];
    const lons = ring.map((p) => p[0]); const lats = ring.map((p) => p[1]);
    return { kind: kind as never, name, details, geometry: JSON.stringify(g), bbox: { minLon: Math.min(...lons), maxLon: Math.max(...lons), minLat: Math.min(...lats), maxLat: Math.max(...lats) }, fetchedAt };
  };
  const rows = [
    row("district", "District 6", square(0, 0, 1, 1), { alder: "Jane Doe" }, 1000),
    row("ward", "Ward 112", square(0, 0, 1, 1), { pollingPlace: "North Division High School", pollingAddress: "1011 W Center St", accessibleEntrance: "Main entrance" }),
    row("tin", "Harambee Proud TIN", square(0, 0, 0.5, 1)),
    row("tid", "TID 1: A", square(0, 0, 1, 1)), row("tid", "TID 2: B", square(0, 0, 1, 1)),
    row("oz", "Opportunity Zone (2010 tract 88)", square(5, 5, 6, 6)),
  ];
  it("finds the district, the ward with its polling place, and every investment and development area containing the point", () => {
    expect(boundariesAt({ lon: 0.25, lat: 0.5 }, rows)).toEqual({
      asOf: 1000,
      district: { name: "District 6", alder: "Jane Doe" },
      ward: { name: "Ward 112", pollingPlace: "North Division High School", pollingAddress: "1011 W Center St", mainEntrance: "", accessibleEntrance: "Main entrance", mainParking: "", accessibleParking: "" },
      investment: ["Harambee Proud TIN"],
      development: ["TID 1: A", "TID 2: B"],
    });
  });
  it("gives no boundaries, and no date, before the City's files were loaded", () => {
    expect(boundariesAt({ lon: 0.25, lat: 0.5 }, [])).toEqual({ asOf: null, district: null, ward: null, investment: [], development: [] });
  });
});
```

Append to `tests/ui/placeText.test.ts` (extend its import with `asOfDate, BOUNDARIES_NOT_COVERED, BOUNDARIES_NOT_LOADED, pollingNote`):

```ts
describe("boundary wording", () => {
  it("dates the polling place list and sends people to the state to confirm", () => {
    const oct12 = Date.UTC(2026, 9, 12, 15);
    expect(asOfDate(oct12)).toBe("Oct 12, 2026");
    expect(pollingNote(oct12)).toBe("From the City's polling place list as of Oct 12, 2026. Polling places can change before an election; confirm yours at myvote.wi.gov.");
  });
  it("says plainly when the files aren't loaded or don't cover the address", () => {
    expect(BOUNDARIES_NOT_LOADED).toBe("The City's boundary files haven't been loaded yet.");
    expect(BOUNDARIES_NOT_COVERED).toBe("The City's boundaries (districts, wards, investment and development areas) don't cover this address.");
  });
  it("offers the district's wards as a follow-up", () => {
    const b = { asOf: 1, district: { name: "District 6", alder: "Jane Doe" }, ward: null, investment: [], development: [] };
    expect(placeFollowUps({ ...ok, boundaries: b }).map((f) => f.question)).toContain("Which wards are in District 6, and where do they vote?");
  });
});
```

(The existing `ok` fixture in that file gains `boundaries: { asOf: null, district: null, ward: null, investment: [], development: [] }`, so the type checks.)

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/lib/boundaries.test.ts tests/ui/placeText.test.ts`
Expected: FAIL, `boundariesAt` and `asOfDate` are not exported.

- [ ] **Step 3: Implement `boundariesAt` and the texts**

Append to `convex/lib/boundaries.ts` (add `type Point` to the `./geo` import):

```ts
export type WardDetails = { pollingPlace: string; pollingAddress: string; mainEntrance: string; accessibleEntrance: string; mainParking: string; accessibleParking: string };
export type AddressBoundaries = { asOf: number | null; district: { name: string; alder: string } | null; ward: ({ name: string } & WardDetails) | null; investment: string[]; development: string[] };
type StoredBoundary = { kind: BoundaryKind; name: string; details: Record<string, string>; geometry: string; bbox: Bbox; fetchedAt: number };

const INVESTMENT: BoundaryKind[] = ["tin", "nrsa", "nsp"];
const DEVELOPMENT: BoundaryKind[] = ["tid", "bid", "oz"];
const WARD_KEYS: (keyof WardDetails)[] = ["pollingPlace", "pollingAddress", "mainEntrance", "accessibleEntrance", "mainParking", "accessibleParking"];

// The stored boundaries containing a point. On a shared ward or district edge, inShape's half-open rule puts the point
// in one shape; the first match is kept. asOf is the oldest file the answer rests on ("None" answers included).
export function boundariesAt(p: Point, rows: StoredBoundary[]): AddressBoundaries {
  if (rows.length === 0) return { asOf: null, district: null, ward: null, investment: [], development: [] };
  const hits = rows.filter((r) => inBbox(p, r.bbox) && inShape(p, JSON.parse(r.geometry) as Geometry));
  const d = hits.find((h) => h.kind === "district");
  const w = hits.find((h) => h.kind === "ward");
  const names = (kinds: BoundaryKind[]) => hits.filter((h) => kinds.includes(h.kind)).map((h) => h.name);
  return {
    asOf: Math.min(...rows.map((r) => r.fetchedAt)),
    district: d ? { name: d.name, alder: d.details.alder ?? "" } : null,
    ward: w ? { name: w.name, ...(Object.fromEntries(WARD_KEYS.map((k) => [k, w.details[k] ?? ""])) as WardDetails) } : null,
    investment: names(INVESTMENT),
    development: names(DEVELOPMENT),
  };
}
```

In `ui/lib/placeText.ts`, add:

```ts
export const BOUNDARIES_NOT_LOADED = "The City's boundary files haven't been loaded yet.";
export const BOUNDARIES_NOT_COVERED = "The City's boundaries (districts, wards, investment and development areas) don't cover this address.";
export const asOfDate = (ms: number) => new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Chicago" });
export const POLLING_CONFIRM = "Polling places can change before an election; confirm yours at";
export const pollingNote = (asOf: number) => `From the City's polling place list as of ${asOfDate(asOf)}. ${POLLING_CONFIRM} myvote.wi.gov.`;
```

and in `placeFollowUps`, before `return out;`:

```ts
  if (r.inCity && r.boundaries.district) out.push({ label: "ITS WARDS", question: `Which wards are in ${r.boundaries.district.name}, and where do they vote?` });
```

- [ ] **Step 4: Run the pure tests to verify they pass**

Run: `npx vitest run tests/lib/boundaries.test.ts tests/ui/placeText.test.ts`
Expected: FAIL only on the type of `ok.boundaries` until Step 6 lands. If Vitest doesn't type-check, PASS. Continue either way; Step 7 runs tsc.

- [ ] **Step 5: Write the failing database test**

In `convex/places.test.ts`:
- **The first test's expected object:** add `boundaries: { asOf: null, district: null, ward: null, investment: [], development: [] }` (the seed stores no boundaries).
- **Append** the following, which uses Task 2's helper fixtures:

```ts
import { runRefresh, seedBoundaryData } from "../tests/helpers/boundaryFixtures";

// A fresh backend with the boundary fixtures (tract 88 = the City's and DYCU's Harambee), refreshed when asked.
async function seedBoundaries() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  await seedBoundaryData(t);
  return t;
}

describe("address boundaries", () => {
  it("gives the district and alder, the ward and its polling place, and the investment and development areas", async () => {
    const t = await seedBoundaries();
    await runRefresh(t);
    installFakeFetch({ geocoder: reply(43.07, -87.945, "55079008800") });
    const r = await t.withIdentity(reader).action(api.places.findPlace, { address: "2400 W Center St" });
    expect(r).toMatchObject({ status: "ok", inCity: true, boundaries: {
      district: { name: "District 6", alder: "Jane Doe" },
      ward: { name: "Ward 112", pollingPlace: "North Division High School", accessibleEntrance: "Main entrance on W Center St", mainParking: "" },
      investment: ["Harambee Proud TIN", "NRSA 1", "NSP 7: Harambee Great Neighborhood Initiative"],
      development: ["Opportunity Zone (2010 tract 88)"],
    } });
    expect(r.status === "ok" && r.boundaries.asOf).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 6: Return the boundaries from the lookup**

In `convex/places.ts`:
- import `boundariesAt, type AddressBoundaries` from `./lib/boundaries`;
- change the `ok` member of `PlaceResult` to end with `dycu: { name: string; slug: string | null }[]; boundaries: AddressBoundaries }`;
- in `placeAt`, before `return`:

```ts
    // ponytail: reads every stored boundary (≈550 rows, 1.75 MB) per lookup; a bbox table would cut it if lookups get busy.
    const boundaries = boundariesAt(p, await ctx.db.query("boundaries").collect());
    return { neighborhood: hood?.name ?? null, dycu, boundaries };
```

- in `locate`'s final return, add `boundaries: at.boundaries`.

- [ ] **Step 7: Run the tests and the type check**

Run: `npx tsc --noEmit && npx vitest run convex/places.test.ts tests/lib/boundaries.test.ts tests/ui/placeText.test.ts`
Expected: PASS. If tsc flags `PlaceAnswer` stubs (`tests/ui/ask.test.ts`, `tests/ui/askTools.test.ts`), they return refusals and need no change.

- [ ] **Step 8: Write the shared block**

```tsx
// ui/components/PlaceBoundaries.tsx
"use client";

import type { PlaceResult } from "@/convex/places";
import { BOUNDARIES_NOT_COVERED, BOUNDARIES_NOT_LOADED, asOfDate, POLLING_CONFIRM } from "@/ui/lib/placeText";

const list = (names: string[]) => (names.length ? names.join(", ") : "None");

// The City's boundaries at an address: district and alder, ward and polling place, investment and development areas.
// Shared by Ask's place card and the /n panel so the two can't drift apart.
export function PlaceBoundaries({ r, meta }: { r: Extract<PlaceResult, { status: "ok" }>; meta?: string }) {
  const b = r.boundaries;
  if (!r.inCity) return <p data-boundaries className={meta}>{BOUNDARIES_NOT_COVERED}</p>;
  if (b.asOf === null) return <p data-boundaries className={meta}>{BOUNDARIES_NOT_LOADED}</p>;
  return (
    <div data-boundaries>
      <ul>
        {b.district && <li>Aldermanic {b.district.name}{b.district.alder && <> · Alder: {b.district.alder}</>}</li>}
        {b.ward && (
          <li>
            {b.ward.name} · Votes at {b.ward.pollingPlace}{b.ward.pollingAddress && <>, {b.ward.pollingAddress}</>}
            {b.ward.accessibleEntrance && <><br />{b.ward.accessibleEntrance}</>}
            {b.ward.accessibleParking && <><br />{b.ward.accessibleParking}</>}
          </li>
        )}
        <li>Investment areas: {list(b.investment)}</li>
        <li>Development districts: {list(b.development)}</li>
      </ul>
      {b.ward && (
        <p className={meta} data-polling-note>
          From the City&apos;s polling place list as of {asOfDate(b.asOf)}. {POLLING_CONFIRM} <a href="https://myvote.wi.gov">myvote.wi.gov</a>.
        </p>
      )}
    </div>
  );
}
```

In `ui/components/PlaceCard.tsx`, import `PlaceBoundaries` and render `<PlaceBoundaries r={r} meta={styles.tractMeta} />` directly before the privacy `<p>`.

- [ ] **Step 9: Make the `/n` box show the panel**

Replace `ui/components/FindPlaceBox.tsx` with:

```tsx
"use client";

import { useAction } from "convex/react";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import type { PlaceResult } from "@/convex/places";
import { PlaceBoundaries } from "./PlaceBoundaries";
import { notInCityText, PLACE_PRIVACY, placeRefusal, sheetFor } from "@/ui/lib/placeText";
import styles from "./factSheet.module.css";

// Where an address is: its fact sheet link (or which City neighborhood it is in), then its City boundaries.
function Panel({ r }: { r: Extract<PlaceResult, { status: "ok" }> }) {
  const slug = sheetFor(r);
  const area = r.dycu.find((d) => d.slug === slug)?.name;
  return (
    <>
      <p><strong>{r.matched}</strong> <span className={styles.muted}>(as the U.S. Census Bureau matched it)</span></p>
      {slug && area
        ? <p><Link href={`/n/${slug}`}>Open {area}&apos;s fact sheet →</Link></p>
        : r.neighborhood
          ? <p>That address is in the City&apos;s {r.neighborhood} neighborhood, which Data You Can Use doesn&apos;t profile. <Link href="/ask">Ask about its census tracts →</Link> (try &ldquo;What&apos;s the poverty rate in {r.neighborhood}&apos;s tracts?&rdquo;)</p>
          : <p>{notInCityText(r.tract.number)}</p>}
      <PlaceBoundaries r={r} meta={styles.muted} />
    </>
  );
}

// "Find your neighborhood": an address → a panel with its fact sheet and City boundaries. Nothing is stored.
export function FindPlaceBox() {
  const find = useAction(api.places.placeForBox);
  const [address, setAddress] = useState("");
  const [message, setMessage] = useState<React.ReactNode>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const r = await find({ address });
      setMessage(r.status === "ok" ? <Panel r={r} /> : placeRefusal(r.status));
    } catch {
      setMessage(placeRefusal("unavailable"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className={styles.find} onSubmit={submit}>
      <h3 className={styles.findLabel}>Find your neighborhood</h3>
      <label htmlFor="find-address" className={styles.muted}>Your address</label>
      <div className={styles.findRow}>
        <input id="find-address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="2400 W Center St" maxLength={200} autoComplete="street-address" />
        <button type="submit" className={styles.print} disabled={busy}>Find</button>
      </div>
      {/* Always on the page, so screen readers announce the answer when it fills in. A div: the panel holds lists. */}
      <div data-place-message role="status">{message}</div>
      <p className={styles.muted}>{PLACE_PRIVACY}</p>
    </form>
  );
}
```

- [ ] **Step 10: Update the browser tests**

In `e2e/factsheet.spec.ts`, replace the test "the fact sheet list finds your neighborhood from an address" with:

```ts
test("the fact sheet list shows an address's fact sheet, district, ward and polling place", async ({ page }) => {
  await page.goto("/n");
  await expect(page.getByRole("link", { name: "Harambee" })).toBeVisible();
  await page.getByLabel("Your address").fill("2400 W Center St");
  await page.getByRole("button", { name: "Find" }).click();
  const panel = page.locator("[data-place-message]");
  await expect(panel.getByRole("link", { name: "Open Amani's fact sheet →" })).toHaveAttribute("href", "/n/amani", { timeout: 20_000 }); // City's Amani (dev check)
  await expect(panel).toContainText(/Aldermanic District \d+ · Alder: /);
  await expect(panel).toContainText(/Ward \d+ · Votes at /);
  await expect(panel.locator("[data-polling-note]")).toContainText(/as of [A-Z][a-z]{2} \d{1,2}, \d{4}/);
  await expect(panel.getByRole("link", { name: "myvote.wi.gov" })).toHaveAttribute("href", "https://myvote.wi.gov");
  await expect(panel).toContainText("Investment areas:");
  await expect(panel).toContainText("Development districts:");
});
```

In the "outside DYCU's areas" test, change the regex to `/neighborhood, which Data You Can Use doesn't profile/`, so it no longer passes on the outside-County refusal.

In `e2e/ask.spec.ts`'s "an address question draws where it is…" test, add after the last expect:

```ts
    await expect(card.locator("[data-boundaries]")).toBeVisible();
```

(The scripted Ask test runs against the dev backend; with the boundaries loaded in Task 2 Step 10 it shows the district lines, and without them "haven't been loaded yet". Both are a visible `[data-boundaries]`.)

- [ ] **Step 11: Build and run the browser tests**

Run:
1. `npx next build > .superpowers/sdd/2026-10-12-boundaries/build-t3.log 2>&1; echo $?`, then serve with `npx next start -p 3100` (in the background).
2. `BASE_URL=http://localhost:3100 npx playwright test e2e/factsheet.spec.ts`
3. `(set -a; . ./.env.local; set +a; BASE_URL=http://localhost:3100 npx playwright test e2e/ask.spec.ts -g "address question")`

Expected: build 0; all fact sheet tests pass on desktop and iPhone 13; the Ask address test passes on both. This needs Task 2 Step 10's dev data. If Tarik hasn't OK'd it yet, the panel test's district lines fail: stop and ask.

- [ ] **Step 12: Run the whole suite and commit**

Run: `npx tsc --noEmit && npx vitest run --no-file-parallelism > .superpowers/sdd/2026-10-12-boundaries/suite-t3.log 2>&1; tail -5 .superpowers/sdd/2026-10-12-boundaries/suite-t3.log`
Expected: all pass.

```bash
git add convex/lib/boundaries.ts convex/places.ts convex/places.test.ts tests/lib/boundaries.test.ts ui/lib/placeText.ts tests/ui/placeText.test.ts ui/components/PlaceBoundaries.tsx ui/components/PlaceCard.tsx ui/components/FindPlaceBox.tsx e2e/factsheet.spec.ts e2e/ask.spec.ts
git commit -m "feat: an address shows its district, alder, ward, polling place and City areas, in Ask and on /n

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: `boundariesFor` in Ask

**Files:**
- Modify: `convex/places.ts` (`overlapFor`, `boundariesFor`, `type BoundariesResult`)
- Create: `ui/lib/boundaryText.ts`, `ui/components/BoundariesCard.tsx`
- Modify: `lib/ask/tools.ts`, `lib/ask/backend.ts`, `lib/ask/prompt.ts`, `lib/ask/model.ts`, `ui/components/AskCards.tsx`, `scripts/ask-questions.ts`, `scripts/ask-report-card.ts`, `tests/ui/ask.test.ts`, `tests/ui/askTools.test.ts`
- Test: `convex/places.test.ts` (append), `tests/ui/boundaryText.test.ts`, `tests/ui/askTools.test.ts` (append), `e2e/ask.spec.ts` (append)

**Interfaces:**
- Consumes:
  - Task 1: `tractGeoid`, `BOUNDARY_KINDS`, `type Cover`;
  - Task 2: the `boundaryOverlaps` table, `vBoundaryKind`, `vPlaceType`;
  - G: `internal.tracts.findArea({ asked, map }) → { kind: "one"; area: { name; map } } | { kind: "none"; nearest: string[] }`.
- Produces:
  - `api.places.boundariesFor({ neighborhood?, map?, tract?, district?, kinds? }) → BoundariesResult`
  - `type BoundariesResult = { status: "ok"; place: { type: "tract"|"city"|"dycu"|"district"; name: string; details?: Record<string,string> }; kinds: BoundaryKind[]; asOf: number; covers: Cover[] } | { status: "unknown-place"; suggestions: string[] } | { status: "outside-city" } | { status: "not-loaded" }`
  - `boundaryParams` (Zod)
  - `AskBackend.boundaries`
  - `shareText`, `BOUNDARY_GROUPS`, `boundariesRefusal`, `boundariesFootnote`

- [ ] **Step 1: Write the failing database tests**

Append to `convex/places.test.ts` (it reuses `seedBoundaries` and `runRefresh` from Task 3's block):

```ts
describe("boundariesFor", () => {
  const ask = async (args: Record<string, unknown>) => {
    const t = await seedBoundaries();
    await runRefresh(t);
    return t.withIdentity(reader).action(api.places.boundariesFor, args as never);
  };
  it("lists the boundaries covering a City neighborhood, with shares", async () => {
    const r = await ask({ neighborhood: "Harambee", kinds: ["tin", "tid"] });
    expect(r).toMatchObject({ status: "ok", place: { type: "city", name: "Harambee" }, kinds: ["tin", "tid"] });
    expect(r.status === "ok" && r.covers.map((c) => c.kind)).toEqual(["tin", "tid"]);
    expect(r.status === "ok" && r.asOf).toBeGreaterThan(0);
  });
  it("answers for DYCU's area, a tract and a district, with the district's alder and its wards' polling places", async () => {
    expect(await ask({ neighborhood: "Harambee", map: "dycu", kinds: ["tin"] })).toMatchObject({ status: "ok", place: { type: "dycu", name: "Harambee" } });
    expect(await ask({ tract: "88", kinds: ["oz"] })).toMatchObject({ status: "ok", place: { type: "tract", name: "Census tract 88" }, covers: [{ kind: "oz", name: "Opportunity Zone (2010 tract 88)" }] });
    const d = await ask({ district: 6, kinds: ["ward"] });
    expect(d).toMatchObject({ status: "ok", place: { type: "district", name: "District 6", details: { alder: "Jane Doe" } } });
    expect(d.status === "ok" && d.covers[0].details).toMatchObject({ pollingPlace: "North Division High School" });
  });
  it("refuses an unknown place with suggestions, a tract outside the City's boundaries, and an empty table", async () => {
    expect(await ask({ neighborhood: "Harambe" })).toMatchObject({ status: "ok" }); // a close spelling still matches, as in G
    expect((await ask({ neighborhood: "Atlantis" })).status).toBe("unknown-place");
    expect(await ask({ tract: "1501" })).toEqual({ status: "outside-city" });
    expect(await ask({ tract: "9999" })).toEqual({ status: "unknown-place", suggestions: [] });
    expect(await ask({})).toEqual({ status: "unknown-place", suggestions: [] });
    expect(await ask({ tract: "88", district: 6 })).toEqual({ status: "unknown-place", suggestions: [] });
    const t = await seedBoundaries(); // nothing refreshed
    expect(await t.withIdentity(reader).action(api.places.boundariesFor, { district: 6 })).toEqual({ status: "not-loaded" });
  });
  it("needs sign-in and changes no table", async () => {
    const t = await seedBoundaries();
    await runRefresh(t);
    await expect(t.action(api.places.boundariesFor, { district: 6 })).rejects.toThrow(/Sign in/);
    const counts = () => t.run(async (ctx) => Object.fromEntries(await Promise.all(Object.keys(schema.tables).map(async (n) => [n, (await ctx.db.query(n as never).collect()).length]))));
    const before = await counts();
    await t.withIdentity(reader).action(api.places.boundariesFor, { neighborhood: "Harambee" });
    expect(await counts()).toEqual(before);
  });
});
```

(If "Harambe" doesn't resolve with G's `matchName`, drop that line: the spec only promises G's matching, whatever it accepts.)

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run convex/places.test.ts -t boundariesFor`
Expected: FAIL, `api.places.boundariesFor` is undefined.

- [ ] **Step 3: Implement the query and action**

Append to `convex/places.ts` (add imports: `BOUNDARY_KINDS, tractGeoid, type BoundaryKind, type Cover` from `./lib/boundaries`; `vBoundaryKind, vPlaceType` from `./validators`; `type FoundArea` from `./tracts`):

```ts
// Which City boundaries cover a place (spec 2026-10-12-boundaries-design §6). Reads the weekly overlap table; no outside calls.
export type PlaceType = "tract" | "city" | "dycu" | "district";
export type BoundariesResult =
  | { status: "ok"; place: { type: PlaceType; name: string; details?: Record<string, string> }; kinds: BoundaryKind[]; asOf: number; covers: Cover[] }
  | { status: "unknown-place"; suggestions: string[] }
  | { status: "outside-city" }
  | { status: "not-loaded" };

export const overlapFor = internalQuery({
  args: { placeType: vPlaceType, place: v.string() },
  handler: async (ctx, { placeType, place }) => {
    if (!(await ctx.db.query("boundaryOverlaps").first())) return { kind: "not-loaded" as const };
    const row = await ctx.db.query("boundaryOverlaps").withIndex("by_place", (q) => q.eq("placeType", placeType).eq("place", place)).unique();
    if (!row) return { kind: "missing" as const };
    const own = placeType === "district"
      ? (await ctx.db.query("boundaries").withIndex("by_kind", (q) => q.eq("kind", "district")).collect()).find((b) => b.name === `District ${place}`)?.details
      : undefined;
    return { kind: "row" as const, covers: row.covers, builtAt: row.builtAt, own };
  },
});

const unknown = (suggestions: string[] = []): BoundariesResult => ({ status: "unknown-place", suggestions });

export const boundariesFor = action({
  args: { neighborhood: v.optional(v.string()), map: v.optional(v.union(v.literal("city"), v.literal("dycu"))), tract: v.optional(v.string()), district: v.optional(v.number()), kinds: v.optional(v.array(vBoundaryKind)) },
  handler: async (ctx, a): Promise<BoundariesResult> => {
    if (!(await ctx.auth.getUserIdentity())) throw new Error("Sign in to ask");
    const given = [a.neighborhood?.trim(), a.tract?.trim(), a.district].filter((x) => x !== undefined && x !== "");
    if (given.length !== 1) return unknown();
    let target: { placeType: PlaceType; place: string; name: string };
    if (a.tract) {
      const geoid = tractGeoid(a.tract);
      if (!geoid) return unknown();
      target = { placeType: "tract", place: geoid, name: `Census tract ${tractNumber(geoid)}` };
    } else if (a.district !== undefined) {
      if (!Number.isInteger(a.district) || a.district < 1 || a.district > 15) return unknown();
      target = { placeType: "district", place: String(a.district), name: `District ${a.district}` };
    } else {
      const f: FoundArea = await ctx.runQuery(internal.tracts.findArea, { asked: a.neighborhood!.trim().slice(0, 80), map: a.map ?? "city" });
      if (f.kind !== "one") return unknown(f.nearest);
      target = { placeType: f.area.map, place: f.area.name, name: f.area.name };
    }
    const r = await ctx.runQuery(internal.places.overlapFor, { placeType: target.placeType, place: target.place });
    if (r.kind === "not-loaded") return { status: "not-loaded" };
    if (r.kind === "missing") return unknown();
    if (target.placeType === "tract" && r.covers.length === 0) return { status: "outside-city" };
    const kinds = a.kinds?.length ? BOUNDARY_KINDS.filter((k) => a.kinds!.includes(k)) : [...BOUNDARY_KINDS];
    return {
      status: "ok",
      place: { type: target.placeType, name: target.name, ...(r.own ? { details: r.own } : {}) },
      kinds,
      asOf: r.builtAt,
      covers: r.covers.filter((c) => kinds.includes(c.kind)),
    };
  },
});
```

- [ ] **Step 4: Run them to verify they pass**

Run: `npx convex codegen && npx vitest run convex/places.test.ts`
Expected: PASS, every places test.

- [ ] **Step 5: Write the failing card-text and tool tests**

```ts
// tests/ui/boundaryText.test.ts
import { describe, expect, it } from "vitest";
import { boundariesFootnote, boundariesRefusal, placeHeading, shareText } from "../../ui/lib/boundaryText";

describe("boundary card wording", () => {
  it("says shares as estimates", () => {
    expect([100, 99, 37, 5, 4, 1].map(shareText)).toEqual(["all of it", "all of it", "about 37%", "about 5%", "a small part (under 5%)", "a small part (under 5%)"]);
  });
  it("names which map a neighborhood is, and dates the files", () => {
    expect(placeHeading({ type: "city", name: "Harambee" })).toBe("Harambee (City of Milwaukee boundary)");
    expect(placeHeading({ type: "dycu", name: "Harambee" })).toBe("Harambee (DYCU's area)");
    expect(placeHeading({ type: "district", name: "District 6" })).toBe("District 6");
    expect(boundariesFootnote(Date.UTC(2026, 9, 12, 15))).toBe("Shares are estimated from a grid of points, about ±2%. From the City's boundary files as of Oct 12, 2026.");
  });
  it("refuses plainly", () => {
    expect(boundariesRefusal({ status: "unknown-place", suggestions: ["Harambee", "Halyard Park"] })).toBe("I couldn't find that place. Did you mean: Harambee, Halyard Park?");
    expect(boundariesRefusal({ status: "unknown-place", suggestions: [] })).toBe("I couldn't find that place. Name one neighborhood, census tract or aldermanic district (1–15).");
    expect(boundariesRefusal({ status: "outside-city" })).toBe("The City's boundaries don't reach this tract.");
    expect(boundariesRefusal({ status: "not-loaded" })).toBe("The City's boundary files haven't been loaded yet.");
  });
});
```

Append to `tests/ui/askTools.test.ts` (and add `boundaries: async () => ({ status: "not-loaded" }) as never,` to its `backend` stub):

```ts
describe("boundaries", () => {
  it("offers boundariesFor for one place, and the prompt sends boundary questions to it", () => {
    const tool = askTools(backend({})).find((t) => t.name === "boundariesFor")!;
    const shape = (tool.parameters as { shape: Record<string, unknown> }).shape;
    expect(Object.keys(shape)).toEqual(expect.arrayContaining(["neighborhood", "map", "tract", "district", "kinds"]));
    expect(tool.description).toContain("polling place");
    expect(ASK_PROMPT).toContain("boundariesFor");
  });
});
```

- [ ] **Step 6: Run them to verify they fail**

Run: `npx vitest run tests/ui/boundaryText.test.ts tests/ui/askTools.test.ts`
Expected: FAIL, `../../ui/lib/boundaryText` can't be resolved, and there is no `boundariesFor` tool.

- [ ] **Step 7: Implement the texts, the tool, the backend and the prompt rule**

```ts
// ui/lib/boundaryText.ts
import type { BoundariesResult, PlaceType } from "@/convex/places";
import type { BoundaryKind } from "@/convex/lib/boundaries";
import { asOfDate, BOUNDARIES_NOT_LOADED } from "./placeText";

export const BOUNDARY_GROUPS: Record<BoundaryKind, string> = {
  district: "Aldermanic districts", ward: "Voting wards",
  tin: "Targeted Investment Neighborhoods (TINs)", nrsa: "Neighborhood Revitalization Strategy Areas (NRSAs)", nsp: "Neighborhood Strategic Planning areas (NSPs)",
  tid: "Tax Incremental Districts (TIDs)", bid: "Business Improvement Districts (BIDs)", oz: "Opportunity Zones",
};
export const shareText = (share: number) => (share >= 99 ? "all of it" : share < 5 ? "a small part (under 5%)" : `about ${share}%`);
export const placeHeading = (p: { type: PlaceType; name: string }) =>
  p.type === "city" ? `${p.name} (City of Milwaukee boundary)` : p.type === "dycu" ? `${p.name} (DYCU's area)` : p.name;
export const boundariesFootnote = (asOf: number) => `Shares are estimated from a grid of points, about ±2%. From the City's boundary files as of ${asOfDate(asOf)}.`;
export function boundariesRefusal(r: Exclude<BoundariesResult, { status: "ok" }>): string {
  if (r.status === "outside-city") return "The City's boundaries don't reach this tract.";
  if (r.status === "not-loaded") return BOUNDARIES_NOT_LOADED;
  return r.suggestions.length
    ? `I couldn't find that place. Did you mean: ${r.suggestions.join(", ")}?`
    : "I couldn't find that place. Name one neighborhood, census tract or aldermanic district (1–15).";
}
```

In `lib/ask/tools.ts`:
- import `BOUNDARY_KINDS` from `../../convex/lib/boundaries`;
- add the type `export type BoundariesAnswer = FunctionReturnType<typeof api.places.boundariesFor>;`;
- add `"boundariesFor"` to `AskToolName`;
- add `boundaries(a: z.infer<typeof boundaryParams>): Promise<BoundariesAnswer>;` to `AskBackend`;
- after `rankParams` (it reuses `area`):

```ts
export const boundaryParams = z.object({
  ...area,
  tract: z.string().max(20).optional().describe('A census tract as the person wrote it, e.g. "88" or "88.01"'),
  district: z.number().int().min(1).max(15).optional().describe("An aldermanic district number, 1–15"),
  kinds: z.array(z.enum(BOUNDARY_KINDS)).optional().describe("Only these boundary kinds; leave out for all of them"),
});
```

and, after the `findPlace` tool:

```ts
    {
      name: "boundariesFor",
      description: "Which City of Milwaukee boundaries cover one place, and about how much of it: aldermanic district (with the alder), voting ward (with its polling place), Targeted Investment Neighborhood (tin), Neighborhood Revitalization Strategy Area (nrsa), Neighborhood Strategic Planning area (nsp), Tax Incremental District (tid), Business Improvement District (bid), Opportunity Zone (oz). Give exactly one place: neighborhood (map dycu only for DYCU's area), tract, or district. kinds limits the list. For an address, use findPlace instead. Shares are estimates: never restate one as exact. If it returns unknown-place, offer its suggestions; outside-city, say the City's boundaries don't reach that tract; not-loaded, say the boundary files aren't loaded yet. Polling places can change before an election: always point to myvote.wi.gov to confirm.",
      parameters: boundaryParams,
      execute: (a: z.infer<typeof boundaryParams>) => b.boundaries(a),
    },
```

In `lib/ask/backend.ts`, after `place:`:

```ts
    boundaries: (a) => fetchAction(api.places.boundariesFor, a, { token }),
```

In `lib/ask/prompt.ts`, after the `findPlace` rule line:

```
- "Which TIN / NRSA / NSP / TID / BID / Opportunity Zone / ward / aldermanic district is <place> in or overlaps <place>", "which wards are in District N", and "who is the alder for District N" call boundariesFor with that one place. An address goes to findPlace.
```

Add `boundaries: async () => ({ status: "not-loaded" }) as never,` to the backend stub in `tests/ui/ask.test.ts`, and `boundaries: async (a) => run("places:boundariesFor", a, true),` to `scripts/ask-report-card.ts`.

- [ ] **Step 8: Run them to verify they pass**

Run: `npx tsc --noEmit && npx vitest run tests/ui/boundaryText.test.ts tests/ui/askTools.test.ts tests/ui/ask.test.ts`
Expected: PASS.

- [ ] **Step 9: The card and its renderer**

```tsx
// ui/components/BoundariesCard.tsx
"use client";

import type { BoundariesResult } from "@/convex/places";
import { boundariesFootnote, BOUNDARY_GROUPS, placeHeading, shareText } from "@/ui/lib/boundaryText";
import { POLLING_CONFIRM } from "@/ui/lib/placeText";
import styles from "./ask.module.css";

// Which City boundaries cover a place: one group per asked kind, wards as a table with their polling places.
export function BoundariesCard({ r }: { r: Extract<BoundariesResult, { status: "ok" }> }) {
  const wards = r.covers.filter((c) => c.kind === "ward");
  return (
    <div className={`${styles.reference} ${styles.tractCard}`} data-card="boundaries">
      <p className={styles.tractVerdict}>{placeHeading(r.place)}</p>
      {r.place.details?.alder && <p>Alder: {r.place.details.alder}</p>}
      {r.kinds.map((k) => {
        const cs = r.covers.filter((c) => c.kind === k);
        return (
          <div key={k} data-kind={k}>
            <p className={styles.tractMeta}>{BOUNDARY_GROUPS[k]}</p>
            {cs.length === 0 ? <p>None</p> : k === "ward" ? (
              <table>
                <thead><tr><th>Ward</th><th>Share</th><th>Polling place</th><th>Accessible entrance</th></tr></thead>
                <tbody>{cs.map((c) => (
                  <tr key={c.name}><td>{c.name}</td><td>{shareText(c.share)}</td><td>{[c.details?.pollingPlace, c.details?.pollingAddress].filter(Boolean).join(", ")}</td><td>{c.details?.accessibleEntrance ?? ""}</td></tr>
                ))}</tbody>
              </table>
            ) : (
              <ul>{cs.map((c) => <li key={c.name}>{c.name}: {shareText(c.share)}{c.kind === "district" && c.details?.alder && <> · Alder: {c.details.alder}</>}</li>)}</ul>
            )}
          </div>
        );
      })}
      <p className={styles.tractMeta}>{boundariesFootnote(r.asOf)}</p>
      {wards.length > 0 && <p className={styles.tractMeta}>{POLLING_CONFIRM} <a href="https://myvote.wi.gov">myvote.wi.gov</a>.</p>}
    </div>
  );
}
```

In `ui/components/AskCards.tsx`:
- add `boundaryParams` and `type BoundariesAnswer` to the `@/lib/ask/tools` import;
- import `BoundariesCard` and `boundariesRefusal`;
- after the `findPlace` renderer:

```tsx
  useRenderTool({ name: "boundariesFor", parameters: boundaryParams, render: (props) => {
    if (props.status !== "complete") return <Busy />;
    const r = parse<BoundariesAnswer>(props.result);
    if (!r) return <Failed />;
    if (r.status !== "ok") return <p className={styles.failed} data-card="boundaries-refusal">{boundariesRefusal(r)}</p>;
    return <BoundariesCard r={r} />;
  } }, []);
```

- [ ] **Step 10: The scripted model, graded questions and a browser test**

In `lib/ask/model.ts`'s step-one chain, directly before `: question.includes("center st")`:

```ts
                : question.includes("tins overlap")
                ? call("boundariesFor", { neighborhood: "Harambee", kinds: ["tin"] })
```

Append to the keyword comment above `fakeAskModel`: `"tins overlap" → boundariesFor Harambee (TINs);`.

In `scripts/ask-questions.ts`, after the findPlace entry:

```ts
  { q: "Which TINs overlap Harambee?", tool: "boundariesFor", expect: { status: "ok" }, final: true },
  { q: "Which wards are in District 6, and where do they vote?", tool: "boundariesFor", expect: { status: "ok" }, final: true },
```

Append to `e2e/ask.spec.ts`, inside the same `describe` as the address test:

```ts
  test("a boundary question draws the boundaries card with estimated shares", async ({ page }) => {
    await ask(page, "Which TINs overlap Harambee?");
    const card = page.locator("[data-card=boundaries]:visible, [data-card=boundaries-refusal]:visible");
    await expect(card).toBeVisible({ timeout: 40_000 });
    await expect(page.locator("[data-card=boundaries]:visible")).toContainText("Targeted Investment Neighborhoods (TINs)");
    await expect(page.locator("[data-card=boundaries]:visible")).toContainText("Shares are estimated from a grid of points");
  });
```

- [ ] **Step 11: Run unit, build and browser tests**

Run:
1. `npx tsc --noEmit && npx vitest run --no-file-parallelism > .superpowers/sdd/2026-10-12-boundaries/suite-t4.log 2>&1; tail -5 .superpowers/sdd/2026-10-12-boundaries/suite-t4.log`
2. `npx next build > .superpowers/sdd/2026-10-12-boundaries/build-t4.log 2>&1; echo $?`, then restart `npx next start -p 3100`.
3. `(set -a; . ./.env.local; set +a; BASE_URL=http://localhost:3100 npx playwright test e2e/ask.spec.ts -g "boundary question|address question")`

Expected: all pass; build 0; both Ask tests pass on desktop and iPhone 13. They need the dev push of this task's Convex code (Tarik's OK) and Task 2's dev data.

- [ ] **Step 12: The graded real-AI questions (needs Tarik's OK, costs about $0.10)**

Run: `(set -a; . ./.env.local; set +a; npx tsx scripts/ask-report-card.ts --only 18,19)`. If the script has no `--only`, run it as H did for one question and read its flags first.
Expected: both questions reach `boundariesFor` with `status: "ok"`.

- [ ] **Step 13: Commit**

```bash
git add convex/places.ts convex/places.test.ts ui/lib/boundaryText.ts tests/ui/boundaryText.test.ts ui/components/BoundariesCard.tsx ui/components/AskCards.tsx lib/ask/tools.ts lib/ask/backend.ts lib/ask/prompt.ts lib/ask/model.ts scripts/ask-questions.ts scripts/ask-report-card.ts tests/ui/ask.test.ts tests/ui/askTools.test.ts e2e/ask.spec.ts convex/_generated
git commit -m "feat: Ask answers which City boundaries cover a neighborhood, tract or district

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Docs

**Files:**
- Create: `docs/decisions/038-boundaries.md`
- Modify: `ui/components/HowItWorks.tsx`, `DESIGN.md`, `docs/research/2026-10-12-questions-by-audience.md`
- Test: `e2e/how.spec.ts` (append)

- [ ] **Step 1: Write the failing browser test**

Append to `e2e/how.spec.ts`:

```ts
test("it says where boundaries come from and that shares are estimates", async ({ page }) => {
  await page.goto("/how-it-works");
  await expect(page.getByText(/aldermanic districts, voting wards and polling places/)).toBeVisible();
  await expect(page.getByText(/copied from the City of Milwaukee's map server once a week/)).toBeVisible();
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `BASE_URL=http://localhost:3100 npx playwright test e2e/how.spec.ts -g "boundaries come from" --project=desktop`
Expected: FAIL, the element is not found.

- [ ] **Step 3: Write the docs**

**`ui/components/HowItWorks.tsx`:** directly after the paragraph containing `Census Bureau's geocoder` (H's address paragraph), add:

```tsx
            <p>
              The City&apos;s boundaries (aldermanic districts, voting wards and polling places, Targeted Investment Neighborhoods,
              NRSAs and NSPs, Tax Incremental Districts, Business Improvement Districts and Opportunity Zones) are copied from the
              City of Milwaukee&apos;s map server once a week. How much of a neighborhood or tract a boundary covers is estimated from a
              grid of points, so shares are about ±2%. Polling places can change before an election; confirm yours at{" "}
              <a href="https://myvote.wi.gov">myvote.wi.gov</a>.
            </p>
```

**`DESIGN.md`:** after the `### Address lookup` section, add:

```markdown
### Boundaries

- `PlaceBoundaries` (ui/components/PlaceBoundaries.tsx) is one block used by Ask's place card and the `/n` panel. It shows: district and alder; ward with its polling place, accessible entrance and parking; investment areas; development districts. "None" when a group is empty.
- A polling place always carries "as of {date}" and the myvote.wi.gov link.
- The `/n` box shows a panel in its status area instead of navigating; the fact sheet link sits at the top of the panel.
- The boundaries card (`data-card="boundaries"`) has one group per asked kind, wards as a table, shares as "about N%", "all of it" or "a small part (under 5%)", and the grid-estimate footnote.
```

**`docs/research/2026-10-12-questions-by-audience.md`:** change the Status cells of these four rows:

| Row | New status |
|---|---|
| "Which Targeted Investment Neighborhoods or NRSAs cover our area?" | `**Now** (Ask lists the TINs, NRSAs and NSPs covering a neighborhood, tract or address, with shares)` |
| "Is my area in an Opportunity Zone, TID or BID?" | `**Now** (by address, neighborhood, tract or district)` |
| "Where is my polling place, and is it accessible?" | `**Now** (an address gives its ward and polling place, with the accessible entrance; confirm at myvote.wi.gov)` |
| "Who is my alder?" | `**Now** (by address or district)` |

**`docs/decisions/038-boundaries.md`:**

```markdown
# 038: The City's boundaries are copied weekly, and overlaps are estimated from a grid

**Decision:** The Almanac copies eight of the City of Milwaukee's boundary layers once a week: aldermanic districts, voting wards with their polling places, Targeted Investment Neighborhoods (TINs), Neighborhood Revitalization Strategy Areas (NRSAs), Neighborhood Strategic Planning areas (NSPs), Tax Incremental Districts (TIDs), Business Improvement Districts (BIDs) and Opportunity Zones. An address shows which of them it is in. Ask can say which ones cover a neighborhood, census tract or district, and about how much of it.

**Why this came up:** "Who is my alder?", "Where do I vote?" and "Which TINs cover our area?" were marked Partly or Not in Ask. The boundary files existed, but nothing connected them to an address or a place. Getting it wrong has a real cost: a wrong polling place sends someone to the wrong building on election day.

**Options:**
- **A weekly copy (chosen).** The build stores all eight layers (1.75 MB, 547 shapes) and precomputes, for every tract, neighborhood, DYCU area and district, which boundaries cover it. The cost: answers can be up to a week behind the City.
- **Ask the City live.** Eight map requests per address, and live intersect queries for place questions. Always current, but every lookup fails when the City's server does, and the City's service gives no "how much of it" share.
- **Mixed.** Live for addresses, a copy for place questions. Freshest addresses, but two paths to keep in agreement.

**What we chose and why (Tarik, 2026-10-12):**
- **A weekly copy.** It reuses the neighborhood refresh's rule that a failed layer keeps last week's copy.
- **The same overlap estimate as the tract-neighborhood match:** a grid of points, about ±2%.
- **A cut-off of 1%, not 10%.** A TID is often a small part of a tract, and hiding it would answer "is this tract in a TID?" wrongly.
- **Every polling place line is dated and links to myvote.wi.gov,** the state's official lookup.

**What we gave up:**
- **Boundaries can be a week old.** Polling places are the piece most likely to change close to an election.
- **Shares are estimates,** so the cards say "about 37%" rather than an exact figure.
- **The reverse question** ("which neighborhoods does TID 41 cover?") isn't answered yet.

**How we'll know if this was right:**
- The address panel's district and ward match the City's own "My Milwaukee" lookup for a sample of addresses.
- No polling place appears without its date and the myvote.wi.gov link.
- The weekly build notes show which layers, if any, failed.

**What actually happened:**
```

- [ ] **Step 4: Rebuild and run it to verify it passes**

Run: `npx next build > .superpowers/sdd/2026-10-12-boundaries/build-t5.log 2>&1; echo $?`, restart `npx next start -p 3100`, then `BASE_URL=http://localhost:3100 npx playwright test e2e/how.spec.ts e2e/factsheet.spec.ts`
Expected: build 0; all pass, desktop and iPhone 13.

- [ ] **Step 5: Commit**

```bash
git add docs/decisions/038-boundaries.md ui/components/HowItWorks.tsx DESIGN.md docs/research/2026-10-12-questions-by-audience.md e2e/how.spec.ts
git commit -m "docs: decision 038, How it works and the questions list for City boundaries

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```
