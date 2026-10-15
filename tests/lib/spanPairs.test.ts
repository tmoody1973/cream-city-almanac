import { describe, expect, it } from "vitest";
import { pairEnd, pairsFor, SPAN_PAIRS } from "../../convex/lib/spanPairs";

const COMPLAINTS = "city:citizen-complaints-against-police-and-fire-departments-the-department-of-emergency-communication";

describe("approved time-span pairs", () => {
  it("are well-formed, with unique ids and a real unit", () => {
    expect(SPAN_PAIRS).toHaveLength(13);
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

describe("City employee tenure (L4)", () => {
  it("lists tenure so far and time worked before leaving on the employee pay file", () => {
    const ps = pairsFor("city:city-employee-salary-data");
    expect(ps.map((p) => [p.id, p.kind, p.from, p.kind === "between" ? p.to : p.openWhen])).toEqual([
      ["tenure-current", "age", "Start Date", "Termination Date"],
      ["tenure-left", "between", "Start Date", "Termination Date"],
    ]);
    const current = ps[0];
    if (current.kind !== "age") throw new Error("age");
    expect(current.asOf).toBe("file");
    expect(current.asOfNote).toBe("As of {date}, when the City last updated this file: employees on its 2025 payroll with no termination date.");
    const left = ps[1];
    if (left.kind !== "between") throw new Error("between");
    expect(left).toMatchObject({ verb: "had worked", toWhat: "before leaving", things: "employees who left", missing: "{n} employees are still with the City and aren't counted here." });
    expect(left.caveat).toBe("Start Date is as the City records it; it may be when someone began their current job rather than their first day with the City.");
  });
});
