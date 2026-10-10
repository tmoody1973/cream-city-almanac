// tests/lib/cityMap.test.ts
import { describe, expect, it } from "vitest";
import { band, CELL, cellOf, toMapData } from "../../convex/lib/cityMap";

describe("city map cells", () => {
  it("indexes a point into a quarter-mile cell", () => {
    expect(CELL).toEqual({ dLat: 0.0036, dLon: 0.0049 });
    expect(cellOf(43.07, -87.91)).toBe(`${Math.floor(43.07 / 0.0036)},${Math.floor(-87.91 / 0.0049)}`);
  });
  it("bands counts 1–4, 5–19, 20+", () => {
    expect([1, 4, 5, 19, 20, 71].map(band)).toEqual([1, 1, 2, 2, 3, 3]);
  });
  it("withholds exact counts under 5 and summarizes", () => {
    const d = toMapData(new Map([["1,2", 3], ["1,3", 7], ["2,2", 25]]), "Harambee");
    expect(d.cells).toStrictEqual([{ i: 1, j: 2, band: 1 }, { i: 1, j: 3, band: 2, n: 7 }, { i: 2, j: 2, band: 3, n: 25 }]);
    expect(d.summary).toEqual({ total: 35, areas: 3, fivePlus: 2, busiest: 25 });
    expect(d.area).toBe("Harambee");
    expect(JSON.stringify(d)).not.toMatch(/43\.|87\./);
  });
  it("reports busiest only from areas of 5 or more, so no small exact count leaks", () => {
    const d = toMapData(new Map([["1,2", 3], ["1,3", 4]]), null);
    expect(d.summary).toEqual({ total: 7, areas: 2, fivePlus: 0, busiest: 0 });
    expect(d.cells.every((c) => !("n" in c))).toBe(true);
  });
});
