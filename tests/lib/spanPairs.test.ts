import { describe, expect, it } from "vitest";
import { pairEnd, pairsFor, SPAN_PAIRS } from "../../convex/lib/spanPairs";

const COMPLAINTS = "city:citizen-complaints-against-police-and-fire-departments-the-department-of-emergency-communication";

describe("approved time-span pairs", () => {
  it("are well-formed, with unique ids and a real unit", () => {
    expect(SPAN_PAIRS).toHaveLength(11);
    expect(new Set(SPAN_PAIRS.map((p) => p.id)).size).toBe(SPAN_PAIRS.length);
    for (const p of SPAN_PAIRS) {
      expect(p.familyKey).toMatch(/^city:[a-z0-9-]+$/);
      expect(["days", "minutes"]).toContain(p.unit);
      for (const s of [p.file, p.name, p.things, p.toWhat, p.caveat]) expect(s.length).toBeGreaterThan(2);
      if (p.kind === "between") {
        expect(p.from).not.toBe(p.to);
        expect(p.missing).toContain("{n}");
      } else {
        expect(p.unit).toBe("days");
        expect(p.asOfNote).toContain("{date}");
      }
    }
  });
  it("finds a file's pairs by its family key", () => {
    expect(pairsFor("city:fire-incident-detail").map((p) => p.id)).toEqual(["fire-dispatch", "fire-arrive", "fire-clear"]);
    expect(pairsFor(COMPLAINTS).map((p) => p.id)).toEqual(["complaint-close", "complaint-open-age"]); // L2
    expect(pairsFor("city:mfd-calls-for-service-detail").map((p) => p.id)).toEqual(["mfd-arrive", "mfd-dispatch", "mfd-close"]); // L1
    expect(pairsFor("city:nibrs-crime-data")).toEqual([]);
  });
  it("has the two age entries the spec names (L2)", () => {
    expect(pairsFor("city:vacant-buildings")).toEqual([expect.objectContaining({ kind: "age", id: "vacant-age", from: "DATEOPENED", asOf: "today", name: "time vacant so far", things: "buildings", toWhat: "on the vacant list" })]);
    const open = SPAN_PAIRS.find((p) => p.id === "complaint-open-age");
    expect(open).toMatchObject({ kind: "age", from: "DateReported", openWhen: "Date Closed", asOf: "file", name: "time open so far", things: "open complaints", toWhat: "open" });
    expect(pairEnd(open!)).toBe("as of the file's last update");
    expect(pairEnd(SPAN_PAIRS.find((p) => p.id === "vacant-age")!)).toBe("as of today");
    expect(pairEnd(SPAN_PAIRS[0])).toBe("Date Closed");
  });
});
