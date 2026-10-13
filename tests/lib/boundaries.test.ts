// tests/lib/boundaries.test.ts
import { describe, expect, it } from "vitest";
import { boundariesAt, boundaryShares, layerUrl, newestTracts, parseBoundaryLayer, tractGeoid, unionOf, type BoundaryShape } from "../../convex/lib/boundaries";
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
