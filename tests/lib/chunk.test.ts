import { describe, expect, it } from "vitest";
import { chunkMarkdown } from "../../convex/lib/chunk";

describe("chunkMarkdown", () => {
  it("tracks the nearest heading as the section", () => {
    const md = "# Harambee\n\nIntro paragraph that is long enough to keep.\n\n## Housing\n\nMost homes were built before 1950 in this area.";
    expect(chunkMarkdown(md)).toEqual([
      { section: "Harambee", text: "Intro paragraph that is long enough to keep." },
      { section: "Housing", text: "Most homes were built before 1950 in this area." },
    ]);
  });
  it("packs paragraphs up to the size limit and splits oversized ones", () => {
    const para = "word ".repeat(100).trim();
    const chunks = chunkMarkdown(`${para}\n\n${para}\n\n${"y".repeat(3500)}`, 1500);
    expect(chunks.every((c) => c.text.length <= 1500)).toBe(true);
    expect(chunks[0].section).toBe("Report");
    expect(chunks.length).toBe(4);
  });
  it("drops fragments shorter than the minimum", () => {
    expect(chunkMarkdown("# Title\n\nok\n\n---")).toEqual([]);
  });
});
