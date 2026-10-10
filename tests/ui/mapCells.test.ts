import { describe, expect, it } from "vitest";
import type { MapData } from "../../convex/lib/cityMap";
import { cellsToGeoJSON, summarySentence } from "../../ui/lib/mapCells";

const d: MapData = { size: { dLat: 0.0036, dLon: 0.0049 }, cells: [{ i: 10, j: -20, band: 1 }, { i: 11, j: -20, band: 2, n: 7 }], summary: { total: 10, areas: 2, fivePlus: 1, busiest: 7 }, area: "Harambee" };

describe("map cells for the browser", () => {
  it("turns cells into squares with a band and a label, no exact count under 5", () => {
    const g = cellsToGeoJSON(d);
    expect(g.features).toHaveLength(2);
    expect(g.features[0].properties).toEqual({ band: 1, label: "1–4" });
    expect(g.features[1].properties).toEqual({ band: 2, label: "7" });
    expect(g.features[0].geometry).toEqual({ type: "Polygon", coordinates: [[[-0.098, 0.036], [-0.0931, 0.036], [-0.0931, 0.0396], [-0.098, 0.0396], [-0.098, 0.036]]] });
  });
  it("writes the summary, and says when the map holds fewer records than the count", () => {
    expect(summarySentence(d, 10)).toBe("10 records in 2 quarter-mile areas; 1 had 5 or more (busiest: 7).");
    expect(summarySentence(d, 13)).toBe("10 records in 2 quarter-mile areas; 1 had 5 or more (busiest: 7). 3 without a location aren't on the map.");
  });
  it("leaves out the busiest clause when no area reached 5, so no small count is revealed", () => {
    const none: MapData = { ...d, cells: [{ i: 10, j: -20, band: 1 }], summary: { total: 3, areas: 1, fivePlus: 0, busiest: 0 } };
    expect(summarySentence(none, 3)).toBe("3 records in 1 quarter-mile areas; none had 5 or more.");
  });
});
