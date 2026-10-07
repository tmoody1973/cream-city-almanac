import { describe, expect, it } from "vitest";
import { asOfLabel, firstSentence, placeSummary, shortDate, subline, todayLabel, yearShort, yearSpan } from "../../ui/lib/format";

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
  });
  it("summarizes places and builds the row subline", () => {
    expect(placeSummary("app", [])).toBe("web app");
    expect(placeSummary("document", Array.from({ length: 29 }, (_, i) => `n${i}`))).toBe("29 neighborhoods");
    expect(placeSummary("dataset", ["City", "County"])).toBe("City · County");
    expect(subline({ kind: "dataset", places: ["City"], years: [2023, 2024, 2025] })).toBe("City · 2023–2025");
    expect(subline({ kind: "app", places: [], years: [] })).toBe("web app");
  });
  it("takes the first sentence of an explainer", () => {
    expect(firstSentence("Share of adults with asthma. Uses CDC PLACES.")).toBe("Share of adults with asthma.");
    expect(firstSentence("No period here")).toBe("No period here");
  });
});
