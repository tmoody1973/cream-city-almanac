import { describe, expect, it } from "vitest";
import { codeLetter, nextCode, topicOf } from "../../convex/lib/codes";

describe("topicOf", () => {
  it("uses each member's first topic keyword and picks the most common", () => {
    expect(topicOf([{ keywords: ["2022", "Health", "Housing"] }, { keywords: ["Health"] }, { keywords: ["Housing"] }])).toBe(
      "Health",
    );
  });
  it("breaks ties by topic priority (Housing before Economic)", () => {
    expect(topicOf([{ keywords: ["Economic", "Housing"] }, { keywords: ["Housing"] }])).toBe("Housing");
  });
  it("returns Other when no member has a topic keyword", () => {
    expect(topicOf([{ keywords: ["2024", "Milwaukee"] }])).toBe("Other");
  });
});

describe("codeLetter", () => {
  it("maps documents to N, apps to A, topics to their letter, unknown to X", () => {
    expect(codeLetter("document", "Housing")).toBe("N");
    expect(codeLetter("app", "Health")).toBe("A");
    expect(codeLetter("dataset", "Food Access")).toBe("F");
    expect(codeLetter("dataset", "Health")).toBe("W");
    expect(codeLetter("dataset", "Other")).toBe("X");
  });
});

describe("nextCode", () => {
  it("starts at 01 and zero-pads to two digits", () => {
    expect(nextCode("H", [])).toEqual({ code: "H01", number: 1 });
  });
  it("continues after the highest number ever issued, including retired ones", () => {
    expect(nextCode("H", [1, 2, 7])).toEqual({ code: "H08", number: 8 });
  });
  it("grows past two digits", () => {
    expect(nextCode("N", [99])).toEqual({ code: "N100", number: 100 });
  });
});
