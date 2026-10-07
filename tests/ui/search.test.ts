import { describe, expect, it } from "vitest";
import { searchNotice } from "../../ui/lib/search";

describe("searchNotice explains each state", () => {
  it("covers failure, no results, degraded, and normal", () => {
    expect(searchNotice("error", null)).toBe("Search failed. Check your connection and try again.");
    expect(searchNotice("idle", { degraded: false, results: [] })).toBe(
      "No datasets matched. Try fewer words, or email hub@datayoucanuse.org to ask DYCU.",
    );
    expect(searchNotice("idle", { degraded: true, results: [1] })).toBe("Showing keyword matches only right now.");
    expect(searchNotice("idle", { degraded: false, results: [1] })).toBeNull();
    expect(searchNotice("loading", null)).toBeNull();
  });
});
