import { describe, expect, it } from "vitest";
import { forModel, shapeMeasure } from "../../convex/lib/measureShape";

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

  it("hides one more group when the hidden ones together are under 5, so two one-person groups can't be read as a pair", () => {
    const s = shapeMeasure([row("A", "40", "5000"), row("D", "20", "900"), row("B", "1", "100"), row("C", "1", "70")], row(null, "62", "6070"), people);
    expect(s.groups.map((g) => [g.label, g.hidden])).toEqual([["A", false], ["D", true], ["B", true], ["C", true]]);
  });
  it("counts a hidden 'All other groups' line as hidden, so it can't be recovered from the All row", () => {
    const full = Array.from({ length: 24 }, (_, i) => row(`G${i}`, String(10 + i), "100"));
    const s = shapeMeasure(full, row(null, String(full.reduce((t, r) => t + Number(r.n), 0) + 3), "2477"), people);
    expect(s.other).toMatchObject({ n: 3, hidden: true, total: null });
    expect(s.groups.filter((g) => g.hidden).map((g) => g.label)).toEqual(["G0"]);
  });
  it("hides the All row's figures when fewer than 5 records match in a file that names people", () => {
    const s = shapeMeasure([row("Mayor", "1", "150000")], row(null, "1", "150000"), people);
    expect(s.all).toMatchObject({ n: 1, total: null, median: null, average: null });
    expect(shapeMeasure(null, row(null, "3", "90"), { namesPeople: false, byYear: false }).all.total).toBe(90);
  });
});

describe("what the model is sent", () => {
  it("drops totals for a rate and averages nobody asked for, on every row", () => {
    const s = shapeMeasure([row("A", "40", "1000")], row(null, "40", "1000"), { namesPeople: false, byYear: false });
    const rate = forModel({ ...s, other: { n: 9, total: 50, hidden: false } }, { summable: false, average: false });
    expect([rate.groups[0].total, rate.groups[0].average, rate.all.total, rate.all.average, rate.other?.total]).toEqual([null, null, null, null, null]);
    expect(rate.all.median).toBe(1000);
    const asked = forModel(s, { summable: true, average: true });
    expect([asked.all.total, asked.all.average]).toEqual([1000, 1000]);
  });
});
