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
