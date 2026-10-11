import { describe, expect, it } from "vitest";
import { changeText, isPercent, mismatchVerdict, noMargin, plainMeaning, rangeText, scatterLabel, tooFew, unitOf, valueText } from "../../ui/lib/tractFormat";

describe("tract card words", () => {
  it("cuts DYCU's meaning at ' Calculation:' and leaves the rest whole", () => {
    expect(plainMeaning("Estimate - Percentage of households below the poverty line Calculation: (poverty / households) x 100")).toBe("Estimate - Percentage of households below the poverty line");
    expect(plainMeaning("Median rent")).toBe("Median rent");
    expect(plainMeaning("")).toBe("");
  });
  it("calls a column a percent only when its meaning says percent or percentage", () => {
    expect(isPercent("Estimate - Percentage of households")).toBe(true);
    expect(isPercent("PERCENT of adults")).toBe(true);
    expect(isPercent("Cases per 1,000 people")).toBe(false);
    expect(isPercent("")).toBe(false);
  });
  it("puts % on values and the end of ranges only for percent columns", () => {
    expect(valueText(73.5, true)).toBe("73.5%");
    expect(valueText(58, true)).toBe("58.0%");
    expect(valueText(58, false)).toBe("58");
    expect(valueText(1234.4, false)).toBe("1,234");
    expect(valueText(-0.6, false)).toBe("−0.6");
    expect(rangeText({ value: 73.5, lo: 64.2, hi: 82.8 }, true)).toEqual({ value: "73.5%", span: "(64.2–82.8%)" });
    expect(rangeText({ value: 12, lo: 9, hi: 16 }, false)).toEqual({ value: "12", span: "(9–16)" });
    expect(rangeText({ value: 5, lo: null, hi: null }, false)).toEqual({ value: "5", span: null });
  });
  it("says points for a change on a percent column", () => {
    expect(changeText(15, "increase", true)).toBe("+15.0 points (clear increase)");
    expect(changeText(-10.04, "decrease", true)).toBe("−10.0 points (clear decrease)");
    expect(changeText(-9.3, "decrease", false)).toBe("−9.3 (clear decrease)");
  });
  it("labels the scatter with both columns and the counts", () => {
    const a = { code: "E02", column: "pov_rate" }, b = { code: "F02", column: "per_insecure" };
    expect(scatterLabel(203, a, b, { fits: 2, close: 3 })).toBe("Scatter of 203 census tracts, pov_rate (E02) across, per_insecure (F02) up; 2 clear matches, 3 possible matches.");
    expect(scatterLabel(203, a, b)).toBe("Scatter of 203 census tracts, pov_rate (E02) across, per_insecure (F02) up.");
  });
  it("names the columns that have no margin of error, and nothing when every column has one", () => {
    const pov = { column: "Per_Poverty", confidence: null }, food = { column: "per_insecure", confidence: "95% confidence (CDC)" };
    expect(noMargin([pov, food])).toBe("Per_Poverty has no margin of error");
    expect(noMargin([pov, { column: "Per_Pov", confidence: null }])).toBe("Per_Poverty and Per_Pov have no margin of error");
    expect(noMargin([food])).toBeNull();
  });
  it("words the mismatch verdict: the limit first when a column has no margin, never a clearly-fits claim", () => {
    expect(mismatchVerdict({ fitsCount: 0, closeCount: 40, n: 200, gated: false, bare: "Per_Poverty has no margin of error" }))
      .toBe("Can't tell which tracts are clear matches: Per_Poverty has no margin of error.");
    expect(mismatchVerdict({ fitsCount: 0, closeCount: 1, n: 200, gated: false, bare: null })).toBe("No clear match; 1 possible match.");
    expect(mismatchVerdict({ fitsCount: 0, closeCount: 0, n: 200, gated: false, bare: null })).toBe("No clear match.");
    expect(mismatchVerdict({ fitsCount: 1, closeCount: 3, n: 200, gated: false, bare: null })).toBe("1 clear match; 3 possible matches.");
    expect(mismatchVerdict({ fitsCount: 2, closeCount: 1, n: 200, gated: false, bare: null })).toBe("2 clear matches; 1 possible match.");
    expect(mismatchVerdict({ fitsCount: 0, closeCount: 0, n: 12, gated: true, bare: null })).toBe("Too few tracts to say (fewer than 20 matched).");
  });
  it("says fewer than 20 matched only when that is the reason", () => {
    expect(tooFew(12)).toBe("Too few tracts to say (fewer than 20 matched).");
    expect(tooFew(200)).toBe("Too few tracts to say.");
  });
});

describe("units from the column's meaning", () => {
  it("knows percents, dollars and years, and prints each plainly", () => {
    expect(unitOf("Percentage of homes (houses and condos) assessed over $200,000")).toBe("percent");
    expect(unitOf("Median assessed value of homes (houses and condos)")).toBe("dollars");
    expect(unitOf("Median year built of houses")).toBe("year");
    expect(unitOf("Number of households")).toBe("plain");
    expect(valueText(245600, "dollars")).toBe("$245,600");
    expect(valueText(1925, "year")).toBe("1925");
    expect(valueText(1925.5, "year")).toBe("1926");
    expect(valueText(63.157, "percent")).toBe("63.2%");
  });
  it("shows no range for an exact value", () => {
    expect(rangeText({ value: 245600, lo: 245600, hi: 245600 }, "dollars")).toEqual({ value: "$245,600", span: null });
    expect(rangeText({ value: 12, lo: 9, hi: 16 }, "dollars")).toEqual({ value: "$12", span: "($9–$16)" });
  });
});
