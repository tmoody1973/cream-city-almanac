import { describe, expect, it } from "vitest";
import { passageBlocks } from "../../ui/lib/askPassage";

describe("report passages as blocks", () => {
  it("turns bullet lines into a list and keeps plain lines as paragraphs", () => {
    expect(passageBlocks("Key points\n• 21% have one bedroom.\n• Over half built before 1939.")).toEqual([
      { kind: "p", text: "Key points" },
      { kind: "list", items: ["21% have one bedroom.", "Over half built before 1939."] },
    ]);
  });
  it("turns a markdown table into rows, dropping its separator line and empty edge cells", () => {
    const md = "Table 12: Gross Rent\n| | Harambee | City |\n| --- | --- | --- |\n| Less than $500 | 896 | 10,168 |";
    expect(passageBlocks(md)).toEqual([
      { kind: "p", text: "Table 12: Gross Rent" },
      { kind: "table", rows: [["", "Harambee", "City"], ["Less than $500", "896", "10,168"]] },
    ]);
  });
  it("turns a lone --- into a rule", () => {
    expect(passageBlocks("One.\n---\nTwo.")).toEqual([{ kind: "p", text: "One." }, { kind: "rule" }, { kind: "p", text: "Two." }]);
  });
  it("keeps one-row-per-line table passages as separate lines", () => {
    expect(passageBlocks("Rent Paid (DP04)\nLess than $500: 991 ± 195\n$500 to $999: 2,299 ± 359")).toEqual([
      { kind: "p", text: "Rent Paid (DP04)" },
      { kind: "p", text: "Less than $500: 991 ± 195" },
      { kind: "p", text: "$500 to $999: 2,299 ± 359" },
    ]);
  });
  it("strips markdown emphasis and skips blank lines", () => {
    expect(passageBlocks("**Housing**\n\n*Rent* is high.")).toEqual([{ kind: "p", text: "Housing" }, { kind: "p", text: "Rent is high." }]);
  });
  it("drops lone page numbers", () => {
    expect(passageBlocks("Population by Race\n2\nHousing\n12")).toEqual([{ kind: "p", text: "Population by Race" }, { kind: "p", text: "Housing" }]);
  });
});
