import { describe, expect, it } from "vitest";
import { areaLine, cityRankText, noTractsText, onlyIn, shareText, tooFewText, withArea } from "../../ui/lib/tractArea";
import { changeSummary, rankSummary, relateSummary } from "../../ui/lib/tractSummary";
import { rankChoices, relateChoices } from "../../ui/lib/refusalChoices";

const bay = { name: "Bay View", map: "city" as const, tracts: 11, partly: 6 };
const h = { code: "E02", name: "Households Living in Poverty", column: "pov_rate", meaning: "Share of households below the poverty line.", kind: "rate" as const, place: "County", year: "2023", n: 11, leftOut: 0, confidence: "90% confidence (Census)" };

describe("the card's neighborhood words", () => {
  it("names the map, the tract count and the partly-inside count", () => {
    expect(areaLine(bay)).toBe("Bay View (City of Milwaukee boundary) · 11 tracts, 6 partly inside");
    expect(areaLine({ name: "Harambee", map: "dycu", tracts: 1, partly: 0 })).toBe("Harambee (DYCU's area) · 1 tract");
  });
  it("writes the share, the citywide rank and the refusals in plain words", () => {
    expect(shareText(61, "Bay View")).toBe("61% of this tract is in Bay View");
    expect(cityRankText({ position: 12, of: 210 }, "high")).toBe("12th highest of 210");
    expect(cityRankText({ position: 1, of: 210 }, "low")).toBe("1st lowest of 210");
    expect(cityRankText({ position: 23, of: 210 }, "high")).toBe("23rd highest of 210");
    expect(noTractsText({ name: "Buchel Park", map: "city" })).toBe("Buchel Park covers less than 10% of every census tract it touches, so no tract can stand for it. Try a larger neighborhood nearby, or count City records inside its boundary.");
    expect(noTractsText({ name: "Harambee", map: "dycu", years: [2021, 2022] })).toBe("DYCU's Harambee area has no tracts in this dataset's year; DYCU defines it for 2021, 2022.");
    expect(tooFewText({ name: "Harambee", n: 9, needed: 20 })).toBe("Too few tracts in Harambee to tell whether these go together (it takes 20; Harambee has 9).");
  });
  it("keeps the neighborhood on follow-up questions", () => {
    expect(onlyIn({ name: "Harambee", map: "dycu" })).toBe("Only the tracts in DYCU's Harambee area.");
    expect(withArea([{ label: "SHOW THE LOWEST", question: "Rank census tracts by x." }], bay)).toEqual([{ label: "SHOW THE LOWEST", question: "Rank census tracts by x. Only the tracts in Bay View." }]);
    expect(withArea([{ label: "A", question: "Q?" }], undefined)).toEqual([{ label: "A", question: "Q?" }]);
  });
});

describe("sentences for a neighborhood", () => {
  it("says the list is every tract in the neighborhood, not the highest citywide", () => {
    expect(rankSummary({ header: h, direction: "high", top: 11, tieCount: 0, unreliableCount: 0, area: bay })).toMatch(/^These are the 11 census tracts in Bay View, from highest to lowest/);
  });
  it("places a change and a mismatch in the neighborhood", () => {
    expect(changeSummary({ header: h, from: "2022", to: "2023", increases: 1, decreases: 0, none: 2, area: bay })).toContain("in Bay View");
    expect(relateSummary({ mode: "mismatch", a: h, b: { ...h, code: "F02", column: "per_insecure" }, aSide: "high", bSide: "low", cutA: 30, cutB: 10, fitsCount: 1, closeCount: 0, n: 210, area: bay } as never)).toContain("census tracts in Bay View");
  });
});

describe("buttons keep the neighborhood", () => {
  const args = { code: "E02", column: "pov_rate", place: "County", year: "2023", direction: "high" as const, neighborhood: "Bay Vew" };
  it("offers each nearest name with the rest of the question", () => {
    const b = rankChoices(args, { status: "no-neighborhood", asked: "Bay Vew", nearest: ["Bay View"] } as never);
    expect(b).toEqual([{ label: "Bay View", question: expect.stringMatching(/Only the tracts in Bay View\.$/) }]);
  });
  it("offers the citywide question when a neighborhood is too small to relate", () => {
    const r = relateChoices({ a: { code: "E02", column: "pov_rate" }, b: { code: "F02", column: "per_insecure" }, place: "City", year: "2022", mode: "relate", neighborhood: "Harambee" } as never, { status: "too-few-tracts", name: "Harambee", n: 9, needed: 20 } as never);
    expect(r).toHaveLength(1);
    expect(r[0].label).toBe("ASK CITYWIDE");
    expect(r[0].question).not.toContain("Harambee");
  });
});
