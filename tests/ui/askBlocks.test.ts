import { describe, expect, it } from "vitest";
import { proseBlocks, replyProblems } from "../../ui/lib/askProse";

describe("proseBlocks", () => {
  it("keeps a one-paragraph reply as one paragraph, joining single line breaks", () => {
    expect(proseBlocks("Harambee's table is open.\nYour row is marked.")).toEqual([{ kind: "p", text: "Harambee's table is open. Your row is marked." }]);
  });
  it("starts a new paragraph at a blank line", () => {
    expect(proseBlocks("First.\n\nSecond.")).toEqual([{ kind: "p", text: "First." }, { kind: "p", text: "Second." }]);
  });
  it("turns '- ' lines into one list, and text after it into a new paragraph", () => {
    expect(proseBlocks("Story angles:\n- Who pays most\n- Where it changed\n- What's next\nAsk for more.")).toEqual([
      { kind: "p", text: "Story angles:" },
      { kind: "list", items: ["Who pays most", "Where it changed", "What's next"] },
      { kind: "p", text: "Ask for more." },
    ]);
  });
  it("reads '* ', '• ' and numbered lines as list items too", () => {
    expect(proseBlocks("* one\n• two\n3. three")).toEqual([{ kind: "list", items: ["one", "two", "three"] }]);
  });
  it("strips bold marks and heading marks the model slips in", () => {
    expect(proseBlocks("## Food insecurity\nThe **F02** sheet is open.")).toEqual([{ kind: "p", text: "Food insecurity The F02 sheet is open." }]);
  });
  it("returns nothing for blank text", () => {
    expect(proseBlocks("  \n\n ")).toEqual([]);
  });
});

describe("replyProblems", () => {
  it("accepts up to three sentences and up to three angles", () => {
    expect(replyProblems("The F02 sheet is open. It covers 2022 and 2023.\n- Who is hungriest\n- What changed\n- Where help is")).toEqual([]);
  });
  it("flags a fourth sentence, a fourth angle, a heading and a numbered list", () => {
    expect(replyProblems("One. Two. Three. Four.")).toEqual(["4 sentences"]);
    expect(replyProblems("Open.\n- a\n- b\n- c\n- d")).toEqual(["4 angles"]);
    expect(replyProblems("## Food\nOpen.")).toEqual(["heading"]);
    expect(replyProblems("Open.\n1. a\n2. b")).toEqual(["numbered list"]);
  });
});
