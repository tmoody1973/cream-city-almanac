import { describe, expect, it } from "vitest";
import { shareOf, sumOf, versus } from "../../convex/lib/factMath";

describe("Census margin math", () => {
  it("adds estimates and combines margins as the square root of the summed squares", () => {
    expect(sumOf([{ estimate: 10, moe: 3 }, { estimate: 20, moe: 4 }])).toEqual({ estimate: 30, moe: 5 });
    expect(sumOf([{ estimate: 10, moe: 3 }, { estimate: 20, moe: null }])).toEqual({ estimate: 30, moe: null });
  });
  it("gives a proportion's margin by the Census formula, and the ratio form when that goes negative", () => {
    const p = shareOf({ estimate: 40, moe: 6 }, { estimate: 100, moe: 8 })!;
    expect(p.estimate).toBe(0.4);
    expect(p.moe).toBeCloseTo(Math.sqrt(36 - 0.16 * 64) / 100, 10);
    const r = shareOf({ estimate: 90, moe: 2 }, { estimate: 100, moe: 10 })!;
    expect(r.moe).toBeCloseTo(Math.sqrt(4 + 0.81 * 100) / 100, 10);
  });
  it("gives no rate when the 'out of' figure is zero or missing", () => {
    expect(shareOf({ estimate: 5, moe: 1 }, { estimate: 0, moe: 0 })).toBeNull();
    expect(shareOf({ estimate: 5, moe: 1 }, { estimate: Number.NaN, moe: 0 })).toBeNull();
  });
  it("calls a difference only when it is larger than both margins combined", () => {
    expect(versus({ estimate: 0.35, moe: 0.03 }, { estimate: 0.228, moe: 0.008 })).toBe("higher");
    expect(versus({ estimate: 0.1, moe: 0.03 }, { estimate: 0.228, moe: 0.008 })).toBe("lower");
    expect(versus({ estimate: 0.24, moe: 0.03 }, { estimate: 0.228, moe: 0.008 })).toBe("same");
    expect(versus({ estimate: 0.5, moe: null }, { estimate: 0.228, moe: 0.008 })).toBe("unknown");
  });
});
