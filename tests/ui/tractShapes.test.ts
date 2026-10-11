import { describe, expect, it } from "vitest";
import { capTractIds, geojsonBounds, tractShapesUrl } from "../../ui/lib/tractShapes";

describe("tract shapes", () => {
  it("asks for just those tracts as GeoJSON in map coordinates", () => {
    expect(tractShapesUrl("https://x/FeatureServer/0", ["55079186000", "55079030300"])).toBe(
      "https://x/FeatureServer/0/query?where=" + encodeURIComponent("GEOID IN ('55079186000','55079030300')") + "&outFields=GEOID&outSR=4326&f=geojson",
    );
  });
  it("refuses anything that isn't an 11-digit tract id, and an empty list", () => {
    expect(tractShapesUrl("https://x/FeatureServer/0", ["55079186000", "1' OR '1'='1"])).toBeNull();
    expect(tractShapesUrl("https://x/FeatureServer/0", [])).toBeNull();
  });
});

describe("capTractIds", () => {
  const ids = (n: number, from = 0) => Array.from({ length: n }, (_, i) => String(55079000000 + from + i));
  it("keeps everything under the cap", () => {
    expect(capTractIds(ids(3), ids(2, 10), 50)).toEqual({ fits: ids(3), close: ids(2, 10), capped: false });
  });
  it("keeps the first ids in order, highlighted before close, and says it capped", () => {
    const r = capTractIds(ids(40), ids(30, 100), 50);
    expect(r.fits).toEqual(ids(40));
    expect(r.close).toEqual(ids(10, 100));
    expect(r.capped).toBe(true);
    expect(capTractIds([], ids(3), 50)).toEqual({ fits: [], close: ids(3), capped: false });
    expect(capTractIds(ids(80), [], 50)).toEqual({ fits: ids(50), close: [], capped: true });
  });
});

describe("geojsonBounds", () => {
  it("covers every polygon ring, multipolygons included", () => {
    const fc = {
      type: "FeatureCollection",
      features: [
        { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[[-88, 43], [-87.9, 43], [-87.9, 43.1], [-88, 43]]] } },
        { type: "Feature", properties: {}, geometry: { type: "MultiPolygon", coordinates: [[[[-87.8, 42.95], [-87.7, 42.95], [-87.7, 43.05], [-87.8, 42.95]]]] } },
      ],
    } as GeoJSON.FeatureCollection;
    expect(geojsonBounds(fc)).toEqual([[-88, 42.95], [-87.7, 43.1]]);
  });
  it("is null with nothing to bound", () => {
    expect(geojsonBounds({ type: "FeatureCollection", features: [] })).toBeNull();
  });
});
