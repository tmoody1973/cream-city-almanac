import { describe, expect, it } from "vitest";
import { passesTop3, QUESTIONS } from "../../convex/lib/evalQuestions";
import { fixtureFamilies } from "../helpers/fixtures";

describe("search report card questions", () => {
  it("has about 25 questions", () => {
    expect(QUESTIONS.length).toBeGreaterThanOrEqual(25);
  });
  it("only expects family keys that exist in the catalog", () => {
    const keys = new Set(fixtureFamilies().map((f) => f.key));
    const unknown = QUESTIONS.flatMap((q) => q.expect).filter((k) => !keys.has(k));
    expect(unknown).toEqual([]);
  });
});

describe("passesTop3", () => {
  it("passes when any expected family is in the top three", () => {
    expect(passesTop3(["b"], ["a", "b", "c", "d"])).toBe(true);
    expect(passesTop3(["d"], ["a", "b", "c", "d"])).toBe(false);
  });
});
