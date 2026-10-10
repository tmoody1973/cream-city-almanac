import { describe, expect, it } from "vitest";
import { changeText, isPercent, plainMeaning, rangeText, scatterLabel, valueText } from "../../ui/lib/tractFormat";

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
    expect(scatterLabel(203, a, b, { fits: 2, close: 3 })).toBe("Scatter of 203 tracts, pov_rate (E02) against per_insecure (F02); 2 clearly fit, 3 close.");
    expect(scatterLabel(203, a, b)).toBe("Scatter of 203 tracts, pov_rate (E02) against per_insecure (F02).");
  });
});
