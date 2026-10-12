import { describe, expect, it } from "vitest";
import { areaSlug, cityFigure, FACTS, headline, neighborhoodFigure, readRow, tractGeoid, type PortraitTable } from "../../convex/lib/factSheet";

const t = (slug: string, groups: string[], rows: [string, ...(string | null)[]][]): PortraitTable => ({
  slug, groups, rows: rows.map(([label, ...vals]) => ({ label, heading: false, values: vals.map((v) => (v === null ? null : { estimate: v.split("±")[0], moe: v.split("±")[1] ?? "0" })) })),
});
const harambee: PortraitTable[] = [
  t("poverty-status-by-age", [""], [["Total", "18894±1000"], ["Income in the past 12 months below poverty level", "6520±600"]]),
  t("household-income", [""], [["Total", "8000±177"], ["Less than $10,000", "1017±93"], ["$10,000 to $14,999", "867±102"], ["$15,000 to $19,999", "512±80"], ["$20,000 to $24,999", "638±99"]]),
  t("occupancy-and-tenure", [""], [["Total Housing Units:", "9457±300"], ["Vacant Housing Units", "1457±200"], ["Occupied Housing Units:", "8000±177"], ["Renter-Occupied Housing Units", "5745±300"]]),
  t("rent-paid", [""], [["Occupied units paying rent", "5660±300"], ["Occupied units paying rent (excluding units where GRAPI cannot be computed)", "5549±300"], ["30.0 to 34.9 percent", "483±100"], ["35.0 percent or more", "2737±250"]]),
  t("vehicles-per-household", [""], [["Total:", "8000±177"], ["No vehicle available", "2586±250"]]),
  t("educational-attainment", ["Total", "Male", "Female"], [["Bachelor's degree or higher", "65±30", "36±20", "29±15"], ["Population 25 years and over", "10991±500", "4814±300", "6177±300"], ["Less than 9th grade", "224±80", null, null], ["9th to 12th grade, no diploma", "1362±200", null, null], ["Bachelor's degree", "1408±200", null, null], ["Graduate or professional degree", "798±150", null, null]]),
  t("sex-and-age", ["Total", "Male", "Female"], [["Total", "0±0", "9087±861", "9963±985"]]),
];
const city = { B17001_001: { estimate: 552601, moe: 503 }, B17001_002: { estimate: 125891, moe: 4212 } };

describe("the headline list", () => {
  it("has 9 well-formed entries with unique ids", () => {
    expect(FACTS.map((f) => f.id)).toEqual(["population", "poverty", "low-income", "renters", "vacant", "rent-burden", "no-car", "degree", "no-diploma"]);
    for (const f of FACTS) expect(f.parts.length).toBeGreaterThan(0);
  });
});

describe("reading DYCU's portrait", () => {
  it("reads a row exactly by label, and adds groups when asked", () => {
    const sa = harambee.find((x) => x.slug === "sex-and-age")!;
    expect(readRow(sa, "Total", [1, 2])).toEqual({ estimate: 19050, moe: Math.sqrt(861 ** 2 + 985 ** 2) });
    expect(readRow(sa, "Totals", [0])).toBeNull();
  });
  it("turns rows into a rate with its margin, and a count for population", () => {
    const pov = neighborhoodFigure(FACTS.find((f) => f.id === "poverty")!, harambee)!;
    expect(pov.rate!.estimate).toBeCloseTo(6520 / 18894, 10);
    expect(neighborhoodFigure(FACTS.find((f) => f.id === "population")!, harambee)).toMatchObject({ rate: null, count: { estimate: 19050 } });
    expect(neighborhoodFigure(FACTS.find((f) => f.id === "degree")!, harambee)!.count.estimate).toBe(2206);
  });
  it("drops a figure whose rows aren't in the file, never a near miss", () => {
    const renamed = harambee.map((x) => (x.slug === "vehicles-per-household" ? t("vehicles-per-household", [""], [["Total", "8000±177"], ["No vehicles", "2586±250"]]) : x));
    expect(neighborhoodFigure(FACTS.find((f) => f.id === "no-car")!, renamed)).toBeNull();
  });
  it("sets the neighborhood beside the city with a verdict, and says unavailable when the city has none", () => {
    const h = headline(FACTS.find((f) => f.id === "poverty")!, harambee, city);
    expect(h.verdict).toBe("higher");
    expect(h.city!.rate!.estimate).toBeCloseTo(125891 / 552601, 10);
    expect(headline(FACTS.find((f) => f.id === "poverty")!, harambee, undefined)).toMatchObject({ city: null, verdict: "unknown" });
    expect(cityFigure(FACTS.find((f) => f.id === "no-car")!, city)).toBeNull();
  });
});

describe("names and tracts", () => {
  it("makes stable slugs and tract ids", () => {
    expect(areaSlug("Silver City, Burnham Park, and Layton Park")).toBe("silver-city-burnham-park-and-layton-park");
    expect(areaSlug("Walker's Point")).toBe("walkers-point");
    expect(tractGeoid("71")).toBe("55079007100");
    expect(tractGeoid("1865.02")).toBe("55079186502");
  });
});

describe("rows with no margin", () => {
  it("reads a row whose margin is empty as an estimate with no margin, never a crash", () => {
    const tbl: PortraitTable = { slug: "x", groups: [""], rows: [{ label: "Total", heading: false, values: [{ estimate: "100", moe: null }] }] };
    expect(readRow(tbl, "Total", [0])).toEqual({ estimate: 100, moe: null });
  });
});
