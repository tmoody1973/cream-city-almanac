import { describe, expect, it } from "vitest";
import { shapeSpan } from "../../convex/lib/spanShape";

const row = (label: string | null, cases: number | string, median: unknown, extra: Record<string, unknown> = {}) => ({ k: label?.toUpperCase() ?? null, label, cases, median, p90: median, open: "0", unreadable: "0", backwards: "0", ...extra });

describe("shaping a span answer", () => {
  it("reads numbers from the City's text and keeps a missing median as null", () => {
    const s = shapeSpan([row("Milwaukee Police Department", "2437", "92.0", { open: "105" }), row("Empty", "3", null)], row(null, "2731", "64.0", { open: "105", unreadable: "12", backwards: "17" }), false, false);
    expect(s.groups[0]).toEqual({ label: "Milwaukee Police Department", cases: 2437, median: 92, p90: 92, open: 105 });
    expect(s.groups[1].median).toBeNull();
    expect(s.all).toEqual({ label: "All", cases: 2731, median: 64, p90: 64, open: 105, unreadable: 12, backwards: 17 });
  });
  it("shows records with no value as '(blank)', but drops a by-year group with no year and no cases", () => {
    expect(shapeSpan([row(null, "5", "3")], row(null, "5", "3"), false, false).groups.map((g) => g.label)).toEqual(["(blank)"]);
    expect(shapeSpan([row(null, "0", null), row("2025", "311", "52")], row(null, "311", "52"), false, true).groups.map((g) => g.label)).toEqual(["2025"]);
  });
  it("keeps a group whose cases are all still open, and drops one with nothing at all and the no-year group", () => {
    const s = shapeSpan([row("ERROR", "0", null, { open: "2" }), row("Empty", "0", null), row("Milwaukee Fire Department", "64", "22")], row(null, "64", "22", { open: "2" }), false, false);
    expect(s.groups.map((g) => g.label)).toEqual(["ERROR", "Milwaukee Fire Department"]);
    expect(shapeSpan([row(null, "0", null, { open: "4" }), row("2025", "311", "52")], row(null, "311", "52"), false, true).groups.map((g) => g.label)).toEqual(["2025"]);
  });
  it("sums the rest as Other only when the list was cut off and groups don't overlap", () => {
    const full = Array.from({ length: 24 }, (_, i) => row(`G${i}`, "10", "1"));
    expect(shapeSpan(full, row(null, "300", "1"), false, false).other).toBe(60);
    expect(shapeSpan(full, row(null, "300", "1"), true, false).other).toBe(0);
    expect(shapeSpan(full.slice(0, 3), row(null, "300", "1"), false, false).other).toBe(0);
  });
});

describe("files that name people (L4)", () => {
  it("drops groups under 10 and their times entirely, and hides a small rest, only when the file names people", () => {
    const groups = [row("Small Dept", "9", "1200"), row("Big Dept", "10", "3000"), row("Mid Dept", "12", "2000")];
    const people = shapeSpan(groups, row(null, "31", "2500"), false, false, true);
    expect(people.groups.map((g) => g.label)).toEqual(["Big Dept", "Mid Dept"]);
    expect(people.other).toBe(0); // the 9 left over would be one small group's count, so it isn't shown
    const two = shapeSpan([row("A", "5", "1"), row("B", "6", "1"), row("Big", "20", "1")], row(null, "31", "1"), false, false, true);
    expect(two.groups.map((g) => g.label)).toEqual(["Big"]);
    expect(two.other).toBe(11);
    expect(shapeSpan(groups, row(null, "9", "1500"), false, false, true).all).toMatchObject({ cases: 9, median: null, p90: null });
    expect(shapeSpan(groups, row(null, "10", "1500"), false, false, true).all.median).toBe(1500);
    const plain = shapeSpan(groups, row(null, "31", "2500"), false, false);
    expect(plain.groups.map((g) => [g.label, g.median])).toEqual([["Small Dept", 1200], ["Big Dept", 3000], ["Mid Dept", 2000]]);
  });
});
