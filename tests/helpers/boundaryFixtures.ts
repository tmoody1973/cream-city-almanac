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
