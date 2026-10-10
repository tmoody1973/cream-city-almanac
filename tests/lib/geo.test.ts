// tests/lib/geo.test.ts
import { describe, expect, it } from "vitest";
import { bboxOf, inBbox, inShape, type Geometry } from "../../convex/lib/geo";

// A 1×1 square from (lon 0, lat 0) to (lon 1, lat 1), with a hole from 0.4 to 0.6.
const square = (x0: number, y0: number, x1: number, y1: number) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
const withHole: Geometry = { type: "Polygon", coordinates: [square(0, 0, 1, 1), square(0.4, 0.4, 0.6, 0.6)] };
const twoParts: Geometry = { type: "MultiPolygon", coordinates: [[square(0, 0, 1, 1)], [square(5, 5, 6, 6)]] };

describe("geo", () => {
  it("finds the rectangle around every part", () => {
    expect(bboxOf(twoParts)).toEqual({ minLat: 0, maxLat: 6, minLon: 0, maxLon: 6 });
    expect(inBbox({ lat: 3, lon: 3 }, bboxOf(twoParts))).toBe(true);
    expect(inBbox({ lat: 7, lon: 3 }, bboxOf(twoParts))).toBe(false);
  });
  it("tells inside from outside, and a hole is outside", () => {
    expect(inShape({ lat: 0.2, lon: 0.2 }, withHole)).toBe(true);
    expect(inShape({ lat: 0.5, lon: 0.5 }, withHole)).toBe(false);
    expect(inShape({ lat: 1.5, lon: 0.5 }, withHole)).toBe(false);
  });
  it("finds a point in the second part of a multi-part shape", () => {
    expect(inShape({ lat: 5.5, lon: 5.5 }, twoParts)).toBe(true);
    expect(inShape({ lat: 3, lon: 3 }, twoParts)).toBe(false);
  });
  it("handles slanted edges, not just axis-aligned squares", () => {
    const triangle: Geometry = { type: "Polygon", coordinates: [[[0, 0], [2, 0], [0, 2], [0, 0]]] };
    expect(inShape({ lat: 0.5, lon: 0.5 }, triangle)).toBe(true);
    expect(inShape({ lat: 1.5, lon: 1.5 }, triangle)).toBe(false);
  });
  it("puts a point on the line between two neighbors in exactly one of them", () => {
    const left: Geometry = { type: "Polygon", coordinates: [square(0, 0, 1, 1)] };
    const right: Geometry = { type: "Polygon", coordinates: [square(1, 0, 2, 1)] };
    const onLine = { lat: 0.5, lon: 1 };
    expect([inShape(onLine, left), inShape(onLine, right)].filter(Boolean)).toHaveLength(1);
  });
});
