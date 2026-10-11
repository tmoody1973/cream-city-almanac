import { describe, expect, it } from "vitest";
import { axisTitle, changeSummary, placeName, rankSummary, relateSummary, subject } from "../../ui/lib/tractSummary";

const pov = { code: "E02", name: "Households Living in Poverty", column: "pov_rate", meaning: "Estimate - Percentage of households with income below the poverty line Calculation: (poverty / households) x 100", place: "County", year: "2023", confidence: "90% confidence (Census)" };
const food = { code: "F02", name: "Food Insecurity Prevalence", column: "per_insecure", meaning: "Estimate - percentage of population 18 years or older who report that the food that they bought always/usually didn't last and they didn't have money to get more", place: "County", year: "2023", confidence: "95% confidence (CDC)" };

describe("plain names for columns", () => {
  it("uses DYCU's own meaning, without 'Estimate -' or the formula, when it reads as a short phrase", () => {
    expect(subject(pov)).toBe("percentage of households with income below the poverty line");
    expect(subject({ ...pov, meaning: "Median rent" })).toBe("median rent");
  });
  it("keeps capitals that belong to the word (an acronym or a code)", () => {
    expect(subject({ ...pov, meaning: "PM2.5 annual average" })).toBe("PM2.5 annual average");
  });
  it("falls back to the dataset's name and column when the meaning is long or missing", () => {
    expect(subject(food)).toBe("Food Insecurity Prevalence (per_insecure)");
    expect(subject({ ...pov, meaning: "" })).toBe("Households Living in Poverty (pov_rate)");
  });
  it("titles a plot axis in words, with the code and column to find it by", () => {
    expect(axisTitle(pov)).toBe("Percentage of households with income below the poverty line (E02 pov_rate)");
    expect(axisTitle(food)).toBe("Food Insecurity Prevalence (F02 per_insecure)");
  });
  it("names the place in full", () => {
    expect(placeName("County")).toBe("Milwaukee County");
    expect(placeName("City")).toBe("the City of Milwaukee");
    expect(placeName("Elsewhere")).toBe("Elsewhere");
  });
});

describe("the relationship card's sentence", () => {
  const base = { mode: "relate" as const, a: pov, b: food, n: 300, direction: "higher" as const, fitsCount: 0, closeCount: 0 };
  it("says which way the two go, how strongly, and that it isn't cause", () => {
    expect(relateSummary({ ...base, strength: "strong" })).toBe(
      "Across 300 census tracts in Milwaukee County (2023 data), where the percentage of households with income below the poverty line is higher, the Food Insecurity Prevalence (per_insecure) tends to be higher too. The pattern is strong. That doesn't mean one causes the other.",
    );
    expect(relateSummary({ ...base, strength: "weak", direction: "lower" })).toContain("tends to be lower. The pattern is weak.");
  });
  it("says little relationship without a direction", () => {
    expect(relateSummary({ ...base, strength: "little" })).toBe(
      "Across 300 census tracts in Milwaukee County (2023 data), the percentage of households with income below the poverty line and the Food Insecurity Prevalence (per_insecure) show little relationship: knowing one tells you almost nothing about the other.",
    );
  });
  it("says there are too few tracts instead of a pattern", () => {
    expect(relateSummary({ ...base, strength: "too-few", n: 12 })).toBe("There aren't enough census tracts with figures for both to say whether they go together.");
  });
});

describe("the mismatch card's sentence", () => {
  const base = { mode: "mismatch" as const, a: pov, b: food, n: 280, strength: "strong" as const, direction: "higher" as const, aSide: "high" as const, bSide: "low" as const, cutA: 20, cutB: 10 };
  const looked = "We looked for census tracts in Milwaukee County (2023 data) in the top third for the percentage of households with income below the poverty line and the bottom third for the Food Insecurity Prevalence (per_insecure).";
  it("says none is a clear match and how many are possible", () => {
    expect(relateSummary({ ...base, fitsCount: 0, closeCount: 2 })).toBe(`${looked} Once the survey's margin of error is counted, none is a clear match; 2 are possible matches.`);
    expect(relateSummary({ ...base, fitsCount: 0, closeCount: 1 })).toContain("none is a clear match; 1 is a possible match.");
    expect(relateSummary({ ...base, fitsCount: 0, closeCount: 0 })).toContain("none is a clear match.");
  });
  it("counts the clear matches and the possible ones", () => {
    expect(relateSummary({ ...base, fitsCount: 3, closeCount: 1 })).toBe(`${looked} 3 are clear matches, even at the edges of the margin of error, and 1 more is a possible match.`);
    expect(relateSummary({ ...base, fitsCount: 1, closeCount: 0 })).toContain("1 is a clear match, even at the edges of the margin of error.");
  });
  it("says why no tract can be a clear match when a column has no margin of error", () => {
    expect(relateSummary({ ...base, a: { ...pov, column: "Per_Poverty", confidence: null }, fitsCount: 0, closeCount: 4 })).toMatch(/Per_Poverty has no margin of error, so no tract can be called a clear match\.$/);
  });
  it("says there are too few tracts when no cutoffs could be drawn", () => {
    expect(relateSummary({ ...base, cutA: undefined, cutB: undefined, fitsCount: 0, closeCount: 0 })).toBe("There aren't enough census tracts with reliable figures for both to look for matches.");
  });
});

describe("the ranking card's sentence", () => {
  const r = { header: pov, direction: "high" as const, top: 10, tieCount: 64, unreliableCount: 57 };
  it("names the list, the ties and the tracts left out", () => {
    expect(rankSummary(r)).toBe(
      "These are the 10 census tracts in Milwaukee County with the highest percentage of households with income below the poverty line (2023 data). 64 more are within the margin of error of #10, so read the top as a group, not an exact order. 57 tracts are left out because their estimates are too uncertain.",
    );
  });
  it("uses singulars and drops lines with nothing to say", () => {
    expect(rankSummary({ ...r, direction: "low", top: 1, tieCount: 1, unreliableCount: 1 })).toBe(
      "This is the census tract in Milwaukee County with the lowest percentage of households with income below the poverty line (2023 data). 1 more is within the margin of error of #1, so read the top as a group, not an exact order. 1 tract is left out because its estimate is too uncertain.",
    );
    expect(rankSummary({ ...r, tieCount: 0, unreliableCount: 0 })).toBe("These are the 10 census tracts in Milwaukee County with the highest percentage of households with income below the poverty line (2023 data).");
  });
  it("warns that close ranks may be ties when the column has no margin of error", () => {
    expect(rankSummary({ ...r, header: { ...pov, confidence: null }, tieCount: 0, unreliableCount: 0 })).toMatch(/There's no margin of error for this column, so tracts close in rank may really be tied\.$/);
  });
});

describe("the change card's sentence", () => {
  const r = { header: { ...pov, place: "County" }, from: "2022", to: "2024", increases: 3, decreases: 1, none: 294 };
  it("says where it clearly rose and fell, and that the rest is within the noise", () => {
    expect(changeSummary(r)).toBe(
      "From 2022 to 2024 in Milwaukee County, the percentage of households with income below the poverty line clearly rose in 3 census tracts and clearly fell in 1. In the other 294, the change is smaller than the survey's margin of error.",
    );
    expect(changeSummary({ ...r, decreases: 0 })).toContain("clearly rose in 3 census tracts. In the other 294");
    expect(changeSummary({ ...r, increases: 0, decreases: 2 })).toContain("clearly fell in 2 census tracts. In the other 294");
  });
  it("says no tract changed clearly", () => {
    expect(changeSummary({ ...r, increases: 0, decreases: 0, none: 298 })).toBe(
      "From 2022 to 2024 in Milwaukee County, the percentage of households with income below the poverty line didn't change by more than the survey's margin of error in any of the 298 census tracts compared.",
    );
  });
  it("says it can't tell when the column has no margin of error", () => {
    expect(changeSummary({ ...r, header: { ...pov, column: "Per_Poverty", confidence: null } })).toBe(
      "Can't tell which census tracts changed clearly from 2022 to 2024, because Per_Poverty has no margin of error.",
    );
  });
});
