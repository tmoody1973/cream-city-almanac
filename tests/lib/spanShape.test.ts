import { describe, expect, it } from "vitest";
import { shapeSpan } from "../../convex/lib/spanShape";

const row = (label: string | null, cases: number | string, median: unknown, extra: Record<string, unknown> = {}) => ({ k: label?.toUpperCase() ?? null, label, cases, median, p90: median, open: "0", unreadable: "0", backwards: "0", ...extra });

describe("shaping a span answer", () => {
  it("reads numbers from the City's text and keeps a missing median as null", () => {
    const s = shapeSpan([row("Milwaukee Police Department", "2437", "92.0", { open: "105" }), row("Empty", 0, null)], row(null, "2731", "64.0", { open: "105", unreadable: "12", backwards: "17" }), false, false);
    expect(s.groups[0]).toEqual({ label: "Milwaukee Police Department", cases: 2437, median: 92, p90: 92, open: 105 });
    expect(s.groups[1].median).toBeNull();
    expect(s.all).toEqual({ label: "All", cases: 2731, median: 64, p90: 64, open: 105, unreadable: 12, backwards: 17 });
  });
  it("shows records with no value as '(blank)', but drops a by-year group with no year and no cases", () => {
    expect(shapeSpan([row(null, "5", "3")], row(null, "5", "3"), false, false).groups.map((g) => g.label)).toEqual(["(blank)"]);
    expect(shapeSpan([row(null, "0", null), row("2025", "311", "52")], row(null, "311", "52"), false, true).groups.map((g) => g.label)).toEqual(["2025"]);
  });
  it("sums the rest as Other only when the list was cut off and groups don't overlap", () => {
    const full = Array.from({ length: 24 }, (_, i) => row(`G${i}`, "10", "1"));
    expect(shapeSpan(full, row(null, "300", "1"), false, false).other).toBe(60);
    expect(shapeSpan(full, row(null, "300", "1"), true, false).other).toBe(0);
    expect(shapeSpan(full.slice(0, 3), row(null, "300", "1"), false, false).other).toBe(0);
  });
});
