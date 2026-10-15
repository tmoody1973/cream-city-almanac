import { describe, expect, it } from "vitest";
import { ASK_QUESTIONS } from "../../scripts/ask-questions";
import { START_ASK } from "../../ui/lib/startAsk";

describe("Start here: what you can ask", () => {
  it("lists seven graded questions, no repeats", () => {
    expect(START_ASK.map((r) => r.label)).toEqual(["CITY RECORDS", "HOW LONG", "HISTORY", "NEIGHBORHOODS & ADDRESSES", "ZIP CODES", "CENSUS TRACTS", "CITY EMPLOYEES"]);
    const graded = new Set(ASK_QUESTIONS.map((q) => q.q));
    for (const r of START_ASK) expect(graded.has(r.question)).toBe(true);
    expect(new Set(START_ASK.map((r) => r.question)).size).toBe(7);
  });
});
