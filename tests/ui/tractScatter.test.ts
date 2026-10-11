import { describe, expect, it } from "vitest";
import { scales } from "../../ui/lib/tractScatter";

describe("scatter scales", () => {
  it("maps the data's range (ranges included) into the plot box, y up", () => {
    const s = scales([{ a: [10, 8, 12], b: [5, 4, 6] }, { a: [50, 45, 55], b: [25, 20, 30] }], 300, 200, 20);
    expect(s.x(8)).toBeCloseTo(20);
    expect(s.x(55)).toBeCloseTo(280);
    expect(s.y(4)).toBeCloseTo(180);
    expect(s.y(30)).toBeCloseTo(20);
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
