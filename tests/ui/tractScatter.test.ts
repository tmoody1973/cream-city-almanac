import { describe, expect, it } from "vitest";
import { axisLabelRoom, scales } from "../../ui/lib/tractScatter";

describe("scatter scales", () => {
  it("maps the data's range (marked tracts' ranges included) into the plot box, y up", () => {
    const s = scales([{ a: [10, 8, 12], b: [5, 4, 6], mark: "fits" }, { a: [50, 45, 55], b: [25, 20, 30], mark: "close" }], 300, 200, 20);
    expect(s.x(8)).toBeCloseTo(20);
    expect(s.x(55)).toBeCloseTo(280);
    expect(s.y(4)).toBeCloseTo(180);
    expect(s.y(30)).toBeCloseTo(20);
  });
  it("reports the low and high ends it chose, for the axis labels", () => {
    const s = scales([{ a: [10, 8, 12], b: [5, 4, 6], mark: "fits" }, { a: [50, 45, 55], b: [25, 20, 30], mark: "close" }], 300, 200, 20);
    expect(s.domain).toEqual({ x: [8, 55], y: [4, 30] });
  });
  it("fits unmarked dots by their values only: their ranges aren't drawn, so they don't stretch the axes", () => {
    const s = scales([{ a: [2, -3, 7], b: [5, 1, 9] }, { a: [50, 45, 55], b: [25, 20, 30], mark: "fits" }], 300, 200, 20);
    expect(s.domain).toEqual({ x: [2, 55], y: [5, 30] });
  });
  it("doesn't divide by zero when every value is the same", () => {
    const s = scales([{ a: [5, null, null], b: [5, null, null] }], 300, 200, 20);
    expect(Number.isFinite(s.x(5))).toBe(true);
  });
  it("doesn't blow up with no points", () => {
    const s = scales([], 300, 200, 20);
    expect(Number.isFinite(s.x(0))).toBe(true);
    expect(Number.isFinite(s.y(0))).toBe(true);
  });
});

describe("scatter scales with unreliable points", () => {
  it("sizes the plot from reliable points only and clamps the rest into the box", () => {
    const pts = [
      { a: [10, null, null], b: [10, null, null], unreliable: false },
      { a: [20, null, null], b: [20, null, null], unreliable: false },
      { a: [500, null, null], b: [-300, null, null], unreliable: true },
    ] as Parameters<typeof scales>[0];
    const s = scales(pts, 300, 200, 20);
    expect(s.x(20)).toBeCloseTo(280);
    expect(s.x(500)).toBeCloseTo(280);
    expect(s.y(-300)).toBeCloseTo(180);
  });
});

describe("room for y-axis labels", () => {
  it("gives dollar labels more room than a percent, and never less than the percent's", () => {
    expect(axisLabelRoom(["$1,250,000"], 14)).toBeGreaterThan(axisLabelRoom(["100.0%"], 14));
    expect(axisLabelRoom(["5"], 14)).toBe(Math.round(14 * 3.4));
    expect(axisLabelRoom([], 14)).toBe(Math.round(14 * 3.4));
  });
});

describe("scatter scales in a neighborhood", () => {
  it("stretches each axis to include its citywide cutoff, so no tract sits under the wrong label", () => {
    const pts = [5, 10, 20].map((v) => ({ a: [v, v - 1, v + 1] as [number, number, number], b: [v, v - 1, v + 1] as [number, number, number] }));
    const s = scales(pts, 400, 400, 0, { a: 30, b: 2 });
    expect(s.domain.x).toEqual([5, 30]);
    expect(s.domain.y).toEqual([2, 20]);
    expect(s.x(20)).toBeLessThan(s.x(30));
  });
});
