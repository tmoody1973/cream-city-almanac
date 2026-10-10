import { describe, expect, it } from "vitest";
import { asOfLabel, firstSentence, placeSummary, shortDate, shortExplainer, subline, todayLabel, versionLabel, yearShort, yearSpan } from "../../ui/lib/format";

describe("format", () => {
  it("formats dates the way the comp does", () => {
    expect(shortDate("2026-07-28T15:18:39.612Z")).toBe("Jul 28");
    expect(shortDate("not a date")).toBe("");
    expect(asOfLabel(Date.UTC(2026, 9, 7, 18))).toBe("Oct 7");
    expect(todayLabel(new Date(2026, 9, 7, 12))).toBe("Wed Oct 7, 2026");
  });
  it("collapses years into spans", () => {
    expect(yearSpan([2023, 2024, 2025])).toBe("2023–2025");
    expect(yearSpan([2010, 2020])).toBe("2010, 2020");
    expect(yearSpan([2016, 2015, 2024, 2025])).toBe("2015–2016, 2024–2025");
    expect(yearSpan([])).toBe("");
    expect(yearShort([2022, 2023, 2024])).toBe("22 · 23 · 24");
    expect(yearShort([])).toBe("—");
    expect(yearShort([2021, 2022, 2023, 2024])).toBe("21–24");
    expect(yearShort([2010, 2020, 2021, 2022, 2023])).toBe("10 · 20–23");
  });
  it("summarizes places and builds the row subline", () => {
    expect(placeSummary("app", [])).toBe("web app");
    expect(placeSummary("page", [])).toBe("Hub page");
    expect(placeSummary("document", Array.from({ length: 29 }, (_, i) => `n${i}`))).toBe("29 neighborhoods");
    expect(placeSummary("dataset", ["City", "County"])).toBe("City · County");
    expect(subline({ kind: "dataset", places: ["City"], years: [2023, 2024, 2025] })).toBe("City · 2023–2025");
    expect(subline({ kind: "app", places: [], years: [] })).toBe("web app");
  });
  it("takes the first sentence of an explainer", () => {
    expect(firstSentence("Share of adults with asthma. Uses CDC PLACES.")).toBe("Share of adults with asthma.");
    expect(firstSentence("No period here")).toBe("No period here");
    // Live D02 / H09 explainers: "U.S." is not a sentence end.
    expect(firstSentence("This dataset uses the American Community Survey (a U.S. Census Bureau survey) to estimate disability. More.")).toBe(
      "This dataset uses the American Community Survey (a U.S. Census Bureau survey) to estimate disability.",
    );
    expect(firstSentence("How many homes are empty, using estimates from the U.S. Census Bureau. Second sentence.")).toBe(
      "How many homes are empty, using estimates from the U.S. Census Bureau.",
    );
    expect(firstSentence("Rates vs. counts, e.g. per tract. Next.")).toBe("Rates vs. counts, e.g. per tract.");
  });
  it("cuts an explainer to one complete line: no lead-in, cut at a clause, never mid-sentence", () => {
    const f02 =
      "This dataset measures food insecurity prevalence, meaning the share of adults who report that the food they bought did not last and they had no money to get more. It uses CDC PLACES.";
    expect(shortExplainer(f02)).toBe(
      "Food insecurity prevalence, meaning the share of adults who report that the food they bought did not last and they had no money to get more.",
    );
    const w01 =
      "This dataset estimates the share of adults (people 18 and older) who currently report having asthma, using the CDC PLACES project (a Centers for Disease Control and Prevention program that produces local health estimates) built on the Behavioral Risk Factor Surveillance System (a national health survey).";
    expect(shortExplainer(w01)).toBe("The share of adults (people 18 and older) who currently report having asthma.");
    // Live E04: no top-level comma, so drop the parenthetical definitions instead of cutting mid-word.
    const e04 =
      "This dataset measures the median sales price (the middle price when all sales are lined up from lowest to highest) of residential properties sold within each census tract (a neighborhood-sized area the Census Bureau uses) in the City of Milwaukee for 2023 and 2024. More.";
    expect(shortExplainer(e04)).toBe(
      "The median sales price of residential properties sold within each census tract in the City of Milwaukee for 2023 and 2024.",
    );
    expect(shortExplainer(e04)).not.toContain("…");
    expect(shortExplainer("Estimated share of people who lack reliable access to enough food, by census tract.")).toBe(
      "Estimated share of people who lack reliable access to enough food, by census tract.",
    );
  });
});

describe("versionLabel", () => {
  const m = (title: string, place: string | null = "City", years: number[] = [], yearLabel: string | null = null) => ({ title, place, years, yearLabel });
  it("names a City version by the City's own word, or its title", () => {
    expect(versionLabel(m("NIBRS Crime Data (Current)"), true)).toBe("Current");
    expect(versionLabel(m("NIBRS Crime Data (Historical) "), true)).toBe("Historical");
    expect(versionLabel(m("2016 Nov 8, County Clerk"), true)).toBe("2016 Nov 8, County Clerk");
  });
  it("keeps place and years for DYCU versions", () => {
    expect(versionLabel(m("Harambee 2023", "Harambee", [2023]), false)).toBe("Harambee · 2023");
    expect(versionLabel(m("Air Quality", null, []), false)).toBe("Air Quality");
  });
});
