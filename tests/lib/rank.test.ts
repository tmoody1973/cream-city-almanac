import { describe, expect, it } from "vitest";
import { applyFilters, fuseRanks, keywordQuery, normalizeQuery, relevantRanks } from "../../convex/lib/rank";
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

describe("relevantRanks", () => {
  it("keeps a result only with a top-5 place in one list or a place in two", () => {
    const list = (keys: string[]) => keys.map((familyKey) => ({ familyKey }));
    const fused = fuseRanks([list(["a", "b", "c", "d", "e", "f", "g"]), list(["g", "x"])]);
    expect(relevantRanks(fused).map((r) => r.familyKey).sort()).toEqual(["a", "b", "c", "d", "e", "g", "x"]);
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

describe("keywordQuery", () => {
  it("keeps at most 16 terms of at most 32 characters, splitting on punctuation", () => {
    const words = Array.from({ length: 20 }, (_, i) => `w${i}`).join(" ");
    const terms = keywordQuery(`kids who can't afford food ${"x".repeat(40)} ${words}`).split(" ");
    expect(terms).toHaveLength(16);
    expect(terms.slice(0, 6)).toEqual(["kids", "who", "can", "t", "afford", "food"]);
    expect(terms[6]).toHaveLength(32);
  });
  it("returns an empty string for punctuation-only input", () => {
    expect(keywordQuery("?!...")).toBe("");
  });
});
