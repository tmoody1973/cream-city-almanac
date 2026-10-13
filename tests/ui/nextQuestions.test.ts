import { describe, expect, it } from "vitest";
import { changeFollowUps, countFollowUps, datasetFollowUps, measureFollowUps, numberFollowUps, previewFollowUps, rankFollowUps, relateFollowUps } from "../../ui/lib/nextQuestions";
import { countChoices } from "../../ui/lib/refusalChoices";

const pov = { code: "E02", name: "Households Living in Poverty", column: "pov_rate", meaning: "Estimate - Percentage of households with income below the poverty line Calculation: x", place: "County", year: "2024", confidence: "90% confidence (Census)" };
const home = { code: "H28", name: "Master Property File (MPROP)", column: "median_value", meaning: "Median assessed value of homes (houses and condos)", place: "City", year: "2026 assessment", confidence: "exact (City records)" };
const food = { code: "F02", name: "Food Insecurity Prevalence", column: "per_insecure", meaning: "Estimate - percentage of adults food insecure", place: "County", year: "2023", confidence: "95% confidence (CDC)" };

// No figure of our own: every digit run in a question appears in what it was built from.
const digitsOk = (q: string, ...from: unknown[]) => (q.match(/\d+/g) ?? []).every((d) => JSON.stringify(from).includes(d));

describe("ranking", () => {
  it("offers the other end, where it changed, and what goes with it, naming code and column", () => {
    const f = rankFollowUps(pov, "high");
    expect(f.map((x) => x.label)).toEqual(["SHOW THE LOWEST", "WHERE DID IT CHANGE?", "WHAT GOES WITH IT?"]);
    expect(f[0].question).toBe("Rank census tracts by percentage of households with income below the poverty line, lowest first, Milwaukee County 2024 (E02 pov_rate).");
    expect(f[1].question).toBe("Where did percentage of households with income below the poverty line change most in Milwaukee County, from an earlier year to 2024? (E02 pov_rate)");
    for (const x of f) expect(digitsOk(x.question, pov)).toBe(true);
    expect(rankFollowUps(pov, "low")[0].label).toBe("SHOW THE HIGHEST");
  });
  it("writes an exact City figure's year as the year alone (the tool's year takes a short label)", () => {
    const f = rankFollowUps(home, "high");
    expect(f[0].question).toBe("Rank census tracts by median assessed value of homes (houses and condos), lowest first, the City of Milwaukee 2026 (H28 median_value).");
    for (const x of f) expect(x.question).not.toContain("assessment");
  });
  it("never offers change over time for exact City figures", () => {
    expect(rankFollowUps(home, "high").map((x) => x.label)).toEqual(["SHOW THE LOWEST", "WHAT GOES WITH IT?"]);
  });
});

describe("change", () => {
  it("ranks by the later year and asks what goes with it", () => {
    const f = changeFollowUps({ ...pov, year: "2022–2023" }, "2023");
    expect(f.map((x) => x.label)).toEqual(["RANK BY THIS", "WHAT GOES WITH IT?"]);
    expect(f[0].question).toContain("highest first, Milwaukee County 2023 (E02 pov_rate)");
  });
});

describe("relate and mismatch", () => {
  const base = { a: pov, b: food, place: "County", year: "2023", strength: "strong" as const };
  it("relate offers both mismatches", () => {
    const f = relateFollowUps({ ...base, mode: "relate" });
    expect(f.map((x) => x.label)).toEqual(["ONE HIGH, THE OTHER LOW", "THE OTHER WAY ROUND"]);
    expect(f[0].question).toContain("high percentage of households with income below the poverty line (E02 pov_rate) but low");
    expect(f[0].question).toContain("(F02 per_insecure)");
  });
  it("relate with too few tracts offers nothing", () => {
    expect(relateFollowUps({ ...base, mode: "relate", strength: "too-few" })).toEqual([]);
  });
  it("mismatch offers the relationship and the flipped sides", () => {
    const f = relateFollowUps({ ...base, mode: "mismatch", aSide: "high", bSide: "low" });
    expect(f.map((x) => x.label)).toEqual(["DO THEY GO TOGETHER?", "FLIP THE SIDES"]);
    expect(f[1].question).toContain("low percentage of households with income below the poverty line (E02 pov_rate) but high");
  });
});

describe("City counts", () => {
  const r = { code: "P01", name: "NIBRS Crime Data", filters: ["Robbery"], period: "Jan 1, 2026 – Oct 11, 2026", dateColumn: "Incident_Date", map: {}, of: undefined };
  it("by month, a year earlier with explicit dates, and in a neighborhood", () => {
    const f = countFollowUps({ code: "P01", from: "2026-01-01", to: "2026-10-11", filters: [{ column: "Offense_All", values: ["robbery"] }] }, r);
    expect(f.map((x) => x.label)).toEqual(["BY MONTH", "SAME PERIOD A YEAR EARLIER", "IN A NEIGHBORHOOD"]);
    expect(f[0].question).toBe("Count P01 NIBRS Crime Data (Robbery), Jan 1, 2026 – Oct 11, 2026, by month.");
    expect(f[1].question).toBe("Count P01 NIBRS Crime Data (Robbery), from 2025-01-01 to 2025-10-11.");
    expect(f[2].question).toBe("Count P01 NIBRS Crime Data (Robbery), Jan 1, 2026 – Oct 11, 2026, in ");
  });
  it("skips what doesn't apply: grouped already, no explicit dates, already in a neighborhood, no locations", () => {
    expect(countFollowUps({ code: "P01", groupBy: "month", neighborhood: "Harambee" }, r).map((x) => x.label)).toEqual([]);
    expect(countFollowUps({ code: "P01" }, { ...r, map: null, dateColumn: null })).toEqual([]);
  });
  it("moves Feb 29 to Feb 28 a year earlier", () => {
    expect(countFollowUps({ code: "P01", from: "2024-02-29", to: "2024-03-31" }, r)[1].question).toContain("from 2023-02-28 to 2023-03-31");
  });
  it("property counts offer typical home value by tract and by district, never by month", () => {
    const p = { code: "H28", name: "Master Property File (MPROP)", filters: ["assessed over $200,000"], period: "2026 assessment", dateColumn: "CONVEY_DATE", map: null, of: { count: 1, label: "x" } };
    const f = countFollowUps({ code: "H28", filters: [{ column: "C_A_TOTAL", over: 200000 }] }, p);
    expect(f.map((x) => x.label)).toEqual(["TYPICAL HOME VALUE BY TRACT", "BY DISTRICT"]);
    expect(f[1].question).toBe("Count H28 Master Property File (MPROP) (assessed over $200,000), 2026 assessment, by aldermanic district.");
    expect(countFollowUps({ code: "H28", groupBy: "GEO_ALDER" }, p).map((x) => x.label)).toEqual(["TYPICAL HOME VALUE BY TRACT"]);
  });
});

describe("tables, datasets, previews", () => {
  it("N03 row: another neighborhood, with the cursor at the end", () => {
    expect(numberFollowUps({ topic: "Poverty Status by Age", label: "Under 5 years" })).toEqual([{ label: "ANOTHER NEIGHBORHOOD", question: 'Poverty Status by Age: "Under 5 years" in ' }]);
  });
  it("dataset: story angles only when the sheet has some, and the caveats", () => {
    expect(datasetFollowUps({ code: "H05", name: "Housing Built Before 1950", storyAngles: ["x"] }).map((x) => x.label)).toEqual(["STORY ANGLES", "WHAT ARE THE CAVEATS?"]);
    expect(datasetFollowUps({ code: "H05", name: "Housing Built Before 1950" }).map((x) => x.label)).toEqual(["WHAT ARE THE CAVEATS?"]);
  });
  it("preview: rank tracts only for tract datasets", () => {
    expect(previewFollowUps({ code: "E02", name: "Households Living in Poverty", fields: ["OBJECTID", "geoid", "pov_rate"] })[0]).toEqual({ label: "RANK TRACTS ON THIS", question: "Which census tracts rank highest on E02 Households Living in Poverty?" });
    expect(previewFollowUps({ code: "V02", name: "Daily Air Quality", fields: ["date", "aqi"] }).map((x) => x.label)).toEqual(["WHAT ARE THE CAVEATS?"]);
  });
  it("never more than three", () => {
    for (const f of [rankFollowUps(pov, "high"), datasetFollowUps({ code: "X", name: "Y", storyAngles: ["a"] })]) expect(f.length).toBeLessThanOrEqual(3);
  });
});

describe("assessment years keep their span (K2 review fix)", () => {
  const years = { from: 2005, to: 2026 };
  const measured = { status: "measured", code: "H28", name: "Master Property File (MPROP)", groupBy: "year", period: "2005 – 2026 assessments", filters: ["residential", "condominiums"], averageAsked: false, splits: ["GEO_ALDER", "year"], latestYear: "2026",
    measure: { id: "assessed-value", name: "total assessed value", unit: "dollars", caveat: "", column: "C_A_TOTAL", things: "properties", summable: true, skipZero: true, namesPeople: false, date: null },
    groups: [], other: null, all: { n: 1, total: 1, median: 1, average: 1, unreadable: 0, zeros: 0 } } as never;
  it("a measure across years offers no district split and keeps the years in its questions", () => {
    const f = measureFollowUps({ code: "H28", groupBy: undefined, years, filters: [{ column: "C_A_CLASS", values: ["1", "5"] }] }, measured);
    expect(f.map((x) => x.label)).not.toContain("BY GEO ALDER");
    expect(f.every((x) => x.question.includes("assessment years 2005–2026"))).toBe(true);
  });
  it("a property count across years offers no district split; one year keeps its year", () => {
    const r = { code: "H28", name: "Master Property File (MPROP)", filters: ["assessed over $200,000"], period: "2005 – 2026 assessments", dateColumn: null, map: null, of: { count: 1, label: "with an assessed value" }, latestYear: "2026" };
    expect(countFollowUps({ code: "H28", years, filters: [{ column: "C_A_TOTAL", over: 200000 }] }, r).map((x) => x.label)).not.toContain("BY DISTRICT");
    const one = countFollowUps({ code: "H28", years: { from: 2015, to: 2015 }, filters: [{ column: "C_A_TOTAL", over: 200000 }] }, { ...r, period: "2015 assessment", latestYear: undefined });
    expect(one.find((x) => x.label === "BY DISTRICT")?.question).toContain("assessment year 2015");
  });
  it("a refusal's buttons keep the years", () => {
    const c = countChoices({ code: "H28", years, groupBy: "GEO_ALDER" }, { status: "bad-column", name: "Master Property File (MPROP)", column: "GEO_ALDER", columns: ["year"] });
    expect(c[0].question).toBe("Count H28 Master Property File (MPROP), assessment years 2005–2026, by year.");
  });
});
