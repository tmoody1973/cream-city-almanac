import { describe, expect, it } from "vitest";
import { shapeMeasure } from "../../convex/lib/measureShape";

const row = (g: string | null, n: number | string, total: unknown, extra: Record<string, unknown> = {}) => ({ g, n, total, median: total, average: total, unreadable: "0", zeros: "0", ...extra });
const people = { namesPeople: true, byYear: false };

describe("shaping a measure", () => {
  it("reads the City's text as numbers and keeps a missing figure null", () => {
    const s = shapeMeasure([row("POLICE DEPARTMENT", "2082", "199778163.7")], row(null, "2082", "199778163.7", { unreadable: "3", zeros: "2" }), { namesPeople: false, byYear: false });
    expect(s.groups[0]).toEqual({ label: "POLICE DEPARTMENT", n: 2082, total: 199778163.7, median: 199778163.7, average: 199778163.7, hidden: false });
    expect(s.all).toMatchObject({ n: 2082, unreadable: 3, zeros: 2 });
    expect(shapeMeasure(null, row(null, "0", null), people).all.total).toBeNull();
  });
  it("hides groups under 5 in files that name people, and the next-smallest when only one is hidden", () => {
    const s = shapeMeasure([row("A", "40", "100"), row("B", "12", "50"), row("C", "3", "9")], row(null, "55", "159"), people);
    expect(s.groups.map((g) => [g.label, g.hidden])).toEqual([["A", false], ["B", true], ["C", true]]);
    expect(s.groups[2]).toMatchObject({ total: null, median: null, average: null });
    expect(s.groups[0].total).toBe(100);
  });
  it("hides nothing when two groups are already small, and nothing at all in files without people", () => {
    const two = shapeMeasure([row("A", "40", "100"), row("B", "2", "5"), row("C", "3", "9")], row(null, "45", "114"), people);
    expect(two.groups.map((g) => g.hidden)).toEqual([false, true, true]);
    expect(shapeMeasure([row("A", "1", "5")], row(null, "1", "5"), { namesPeople: false, byYear: false }).groups[0].hidden).toBe(false);
  });
  it("shows a blank value as '(blank)' and drops a year group with no year and no records", () => {
    expect(shapeMeasure([row(null, "8", "40")], row(null, "8", "40"), { namesPeople: false, byYear: false }).groups[0].label).toBe("(blank)");
    expect(shapeMeasure([row(null, "0", null), row("2025", "5580", "1821970233")], row(null, "5580", "1821970233"), { namesPeople: false, byYear: true }).groups.map((g) => g.label)).toEqual(["2025"]);
  });
  it("sums the cut-off rest as one line, hidden under 5 in files that name people", () => {
    const full = Array.from({ length: 24 }, (_, i) => row(`G${i}`, "10", "100"));
    expect(shapeMeasure(full, row(null, "250", "2600"), { namesPeople: false, byYear: false }).other).toEqual({ n: 10, total: 200, hidden: false });
    expect(shapeMeasure(full, row(null, "243", "2450"), people).other).toEqual({ n: 3, total: null, hidden: true });
    expect(shapeMeasure(full.slice(0, 3), row(null, "300", "3000"), people).other).toBeNull();
  });
});
