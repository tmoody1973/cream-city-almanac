import { describe, expect, it } from "vitest";
import { askHref, laptopAskHref, MAX_PROMPT, readPrompt, withoutPrompt } from "../../ui/lib/askPrompt";

describe("Ask prompt in the address", () => {
  it("round-trips punctuation and non-ASCII", () => {
    const q = `Rent & "burden" in Lincoln Park #2 — ¿qué?`;
    expect(readPrompt(new URL(askHref(q), "https://x").search)).toBe(q);
  });
  it("trims, caps at 500, ignores empty", () => {
    expect(readPrompt("?prompt=%20%20hi%20")).toBe("hi");
    expect(readPrompt(`?prompt=${"a".repeat(600)}`)).toHaveLength(MAX_PROMPT);
    expect(readPrompt("?prompt=%20%20")).toBe("");
    expect(readPrompt("")).toBe("");
  });
  it("strips only the prompt from an address", () => {
    expect(withoutPrompt("https://x/?ask=1&prompt=hi&open=N03")).toBe("/?ask=1&open=N03");
    expect(withoutPrompt("https://x/ask?prompt=hi")).toBe("/ask");
  });
  it("carries the prompt through the laptop redirect", () => {
    expect(laptopAskHref("?prompt=a%26b")).toBe("/?ask=1&prompt=a%26b");
    expect(laptopAskHref("")).toBe("/?ask=1");
  });
});
