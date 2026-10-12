import { describe, expect, it } from "vitest";
import { pairsFor, SPAN_PAIRS } from "../../convex/lib/spanPairs";

describe("approved time-span pairs", () => {
  it("are well-formed, with unique ids, a real unit and a {n} in the missing note", () => {
    expect(SPAN_PAIRS).toHaveLength(7);
    expect(new Set(SPAN_PAIRS.map((p) => p.id)).size).toBe(SPAN_PAIRS.length);
    for (const p of SPAN_PAIRS) {
      expect(p.familyKey).toMatch(/^city:[a-z0-9-]+$/);
      expect(["days", "minutes"]).toContain(p.unit);
      expect(p.from).not.toBe(p.to);
      expect(p.missing).toContain("{n}");
      for (const s of [p.file, p.name, p.things, p.toWhat, p.caveat]) expect(s.length).toBeGreaterThan(2);
    }
  });
  it("finds a file's pairs by its family key", () => {
    expect(pairsFor("city:fire-incident-detail").map((p) => p.id)).toEqual(["fire-dispatch", "fire-arrive", "fire-clear"]);
    expect(pairsFor("city:citizen-complaints-against-police-and-fire-departments-the-department-of-emergency-communication").map((p) => p.from)).toEqual(["DateReported"]);
    expect(pairsFor("city:nibrs-crime-data")).toEqual([]);
  });
});
