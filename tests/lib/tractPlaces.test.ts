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
    const donut: Geometry = { type: "Polygon", coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]], [[2.5, 2.5], [7.5, 2.5], [7.5, 7.5], [2.5, 7.5], [2.5, 2.5]]] };
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
