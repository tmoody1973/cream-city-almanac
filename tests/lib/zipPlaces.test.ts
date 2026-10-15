import { describe, expect, it } from "vitest";
import { cityShares } from "../../convex/lib/tractPlaces";
import { parseZipShapes, ZCTA_LAYER, zctaUrl } from "../../convex/lib/zipPlaces";

const square = (x0: number, y0: number, x1: number, y1: number) => ({ type: "Polygon" as const, coordinates: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]] });

describe("ZIP outlines", () => {
  it("asks TIGERweb for the ZIPs by GEOID, ignoring anything that isn't a ZIP", () => {
    expect(zctaUrl(["53208", "53228", "x' OR '1'='1"])).toBe(`${ZCTA_LAYER}/query?where=${encodeURIComponent("GEOID IN ('53208','53228')")}&outFields=GEOID&outSR=4326&f=geojson`);
  });
  it("reads ZIP outlines and refuses a truncated answer", () => {
    const fc = { type: "FeatureCollection", features: [{ properties: { GEOID: "53208" }, geometry: square(0, 0, 1, 1) }, { properties: { GEOID: "bad" }, geometry: square(0, 0, 1, 1) }] };
    expect(parseZipShapes(fc).map((z) => z.zip)).toEqual(["53208"]);
    expect(() => parseZipShapes({ ...fc, exceededTransferLimit: true })).toThrow(/truncated/);
    expect(() => parseZipShapes({})).toThrow(/no features/);
  });
  it("names the City neighborhoods covering a ZIP, biggest first", () => {
    const zip = square(0, 0, 2, 1);
    const hoods = [
      { name: "West", geometry: square(0, 0, 1.5, 1), bbox: { minLon: 0, minLat: 0, maxLon: 1.5, maxLat: 1 } },
      { name: "East", geometry: square(1.5, 0, 2, 1), bbox: { minLon: 1.5, minLat: 0, maxLon: 2, maxLat: 1 } },
    ];
    expect(cityShares(zip, hoods).map((s) => s.name)).toEqual(["West", "East"]);
  });
});
