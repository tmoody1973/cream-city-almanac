import { describe, expect, it } from "vitest";
import { applyFilters, fuseRanks, normalizeQuery } from "../../convex/lib/rank";
import type { ResultRow } from "../../convex/lib/types";

describe("normalizeQuery", () => {
  it("collapses whitespace and caps length", () => {
    expect(normalizeQuery("  kids \n who\tcan't  ")).toBe("kids who can't");
    expect(normalizeQuery("a".repeat(5000))).toHaveLength(300);
  });
});

describe("fuseRanks", () => {
  it("ranks families found by several lists above single-list hits", () => {
    const ranked = fuseRanks([
      [{ familyKey: "a" }, { familyKey: "b" }],
      [{ familyKey: "b" }, { familyKey: "c" }],
    ]);
    expect(ranked.map((r) => r.familyKey)).toEqual(["b", "a", "c"]);
  });
  it("counts a family once per list and keeps its first snippet", () => {
    const snippet = { hubId: "h", title: "T", section: "S", text: "x" };
    const ranked = fuseRanks([[{ familyKey: "a", snippet }, { familyKey: "a" }]]);
    expect(ranked).toEqual([{ familyKey: "a", score: 1 / 61, snippet }]);
  });
  it("breaks ties alphabetically", () => {
    expect(fuseRanks([[{ familyKey: "z" }], [{ familyKey: "m" }]]).map((r) => r.familyKey)).toEqual(["m", "z"]);
  });
});

describe("applyFilters", () => {
  const row = (key: string, places: string[], years: number[], topic = "Health"): ResultRow => ({
    key, code: "W01", name: key, kind: "dataset", topic, places, years, latestModified: "", snippet: null,
  });
  const rows = [row("a", ["City"], [2022]), row("b", ["County"], [2023], "Housing")];
  it("filters by place (case-insensitive), year and topic", () => {
    expect(applyFilters(rows, { place: "county" }).map((r) => r.key)).toEqual(["b"]);
    expect(applyFilters(rows, { year: 2022 }).map((r) => r.key)).toEqual(["a"]);
    expect(applyFilters(rows, { topic: "Housing" }).map((r) => r.key)).toEqual(["b"]);
    expect(applyFilters(rows, {})).toHaveLength(2);
  });
});
