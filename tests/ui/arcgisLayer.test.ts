import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchLayer, labelFields, layerQueryUrl } from "../../ui/lib/arcgisLayer";

afterEach(() => vi.unstubAllGlobals());
const L = "https://milwaukeemaps.milwaukee.gov/arcgis/rest/services/planning/zoning/MapServer/0";
const view: [[number, number], [number, number]] = [[-87.95, 43.03], [-87.9, 43.07]];

describe("City map layers in the browser", () => {
  it("asks only for the visible area, in latitude/longitude, as GeoJSON", () => {
    const u = new URL(layerQueryUrl(L, view));
    expect(u.pathname.endsWith("/MapServer/0/query")).toBe(true);
    expect(Object.fromEntries(u.searchParams)).toMatchObject({ geometry: "-87.95,43.03,-87.9,43.07", geometryType: "esriGeometryEnvelope", inSR: "4326", outSR: "4326", spatialRel: "esriSpatialRelIntersects", outFields: "*", f: "geojson" });
  });
  it("asks for one more than the 2,000 it will draw, so layers that allow more still say zoom in", async () => {
    expect(new URL(layerQueryUrl(L, view)).searchParams.get("resultRecordCount")).toBe("2001");
    const features = Array.from({ length: 2001 }, () => ({ type: "Feature", geometry: null, properties: {} }));
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ type: "FeatureCollection", features }))));
    expect(await fetchLayer(L, view)).toEqual({ status: "too-many" });
  });
  it("labels a shape with up to six real fields", () => {
    expect(labelFields({ OBJECTID: 1, Shape_Area: 9, ZONING: "RT4", NAME: "x", A: 1, B: 2, C: 3, D: 4, E: 5 })).toEqual([["ZONING", "RT4"], ["NAME", "x"], ["A", "1"], ["B", "2"], ["C", "3"], ["D", "4"]]);
  });
  it("says zoom in when the City cut the answer, and down when it fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ type: "FeatureCollection", features: [], exceededTransferLimit: true }))));
    expect(await fetchLayer(L, view)).toEqual({ status: "too-many" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { code: 400 } }))));
    expect(await fetchLayer(L, view)).toEqual({ status: "down" });
  });
});
