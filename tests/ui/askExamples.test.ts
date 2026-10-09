import { describe, expect, it } from "vitest";
import { ASK_EXAMPLES, ASK_ROLES, examplesFor } from "../../lib/ask/examples";
import { ASK_QUESTIONS } from "../../scripts/ask-questions";

describe("Ask guide examples", () => {
  it("has three roles with three or four examples each", () => {
    expect(ASK_ROLES.map((r) => r.id)).toEqual(["journalist", "nonprofit", "citizen"]);
    for (const r of ASK_ROLES) {
      expect(examplesFor(r.id).length).toBeGreaterThanOrEqual(3);
      expect(examplesFor(r.id).length).toBeLessThanOrEqual(4);
    }
  });
  it("puts every example on the report card, once", () => {
    const card = ASK_QUESTIONS.map((q) => q.q);
    for (const e of ASK_EXAMPLES) expect(card.filter((q) => q === e.question)).toHaveLength(1);
  });
  it("keeps every example under Ask's 500-character limit", () => {
    for (const e of ASK_EXAMPLES) expect(e.question.length).toBeLessThanOrEqual(500);
  });
});
