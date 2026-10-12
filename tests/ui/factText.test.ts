import { describe, expect, it } from "vitest";
import { CENSUS_SOURCE, countLine, factSheetExport, margin, NOTE_APPROX, pct, verdictText } from "../../ui/lib/factText";

describe("fact sheet words", () => {
  it("writes rates, margins, counts and verdicts plainly", () => {
    expect(pct({ estimate: 0.34509, moe: 0.0211 })).toBe("34.5%");
    expect(margin({ estimate: 0.34509, moe: 0.0211 })).toBe("± 2.1 points");
    expect(margin({ estimate: 0.3, moe: null })).toBe("");
    expect(countLine({ rate: null, count: { estimate: 6520, moe: 600 }, of: { estimate: 18894, moe: 1000 } })).toBe("6,520 of 18,894");
    expect(verdictText("higher")).toBe("clearly higher than the city");
    expect(verdictText("same")).toBe("about the same as the city (within the margin of error)");
    expect(verdictText("unknown")).toBe("");
    expect(NOTE_APPROX).toBe("The neighborhood is part of the city, so this comparison is approximate.");
    expect(CENSUS_SOURCE).toBe("U.S. Census Bureau, American Community Survey 5-year estimates, City of Milwaukee");
  });
  it("exports every headline with unrounded values, margins and both sources", () => {
    const s = { status: "ok", slug: "harambee", name: "Harambee", year: 2024, years: [2024], period: "2020–2024", tables: [], map: null, cityFetchedAt: 1, source: { title: "2024 Harambee Neighborhood Portrait Spreadsheet", landingPage: "https://dycu.test/p" },
      headlines: [{ id: "poverty", label: "People in poverty", meaning: "m", isCount: false, verdict: "higher", hood: { rate: { estimate: 0.345, moe: 0.02 }, count: { estimate: 6520, moe: 600 }, of: { estimate: 18894, moe: 1000 } }, city: { rate: { estimate: 0.228, moe: 0.008 }, count: { estimate: 125891, moe: 4212 }, of: { estimate: 552601, moe: 503 } } }] } as never;
    const e = factSheetExport(s, { origin: "https://almanac.test", date: "October 12, 2026" });
    expect(e.csv.head).toEqual(["Figure", "Harambee", "Harambee margin", "City of Milwaukee", "City margin", "Compared with the city", "Harambee count", "Out of"]);
    expect(e.csv.rows[0]).toEqual(["People in poverty", 0.345, 0.02, 0.228, 0.008, "clearly higher than the city", 6520, 18894]);
    expect(e.notes.join(" ")).toContain(CENSUS_SOURCE);
    expect(e.notes.join(" ")).toContain("https://dycu.test/p");
  });
});
