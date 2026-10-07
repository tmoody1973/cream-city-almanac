import { describe, expect, it } from "vitest";
import { matchSources, sourceProfileSchema } from "../../convex/lib/sources";

const profiles = [
  { name: "CDC PLACES", summary: "s", limits: "l" },
  { name: "American Community Survey", summary: "s", limits: "l" },
  { name: "HMDA", summary: "s", limits: "l" },
];

describe("matchSources", () => {
  it("matches sources named in the text", () => {
    expect(matchSources(profiles, "Data Source: CDC Places").map((p) => p.name)).toEqual(["CDC PLACES"]);
    expect(matchSources(profiles, "ACS 5-year estimates and HMDA filings").map((p) => p.name)).toEqual([
      "American Community Survey",
      "HMDA",
    ]);
  });
  it("does not match 'acs' inside other words", () => {
    expect(matchSources(profiles, "racial and ethnic diversity")).toEqual([]);
  });
});

describe("sourceProfileSchema", () => {
  it("requires non-empty summary and limits", () => {
    expect(sourceProfileSchema.safeParse({ summary: "", limits: "x" }).success).toBe(false);
    expect(sourceProfileSchema.safeParse({ summary: "Federal survey.", limits: "Has margins of error." }).success).toBe(true);
  });
});
