import { describe, expect, it } from "vitest";
import { checkZip, COUNTY_ZIPS } from "../../convex/lib/zips";
import { RACE, RACE_CODES, zipRows } from "../../convex/lib/zipFigures";

const est = (estimate: number, moe: number | null = 10) => ({ estimate, moe });

describe("COUNTY_ZIPS", () => {
  it("lists the 37 ZIP areas touching Milwaukee County, with land shares in the City", () => {
    expect(Object.keys(COUNTY_ZIPS)).toHaveLength(37);
    for (const a of Object.values(COUNTY_ZIPS)) {
      expect(a.cityShare).toBeGreaterThanOrEqual(0);
      expect(a.cityShare).toBeLessThanOrEqual(1);
    }
    expect(COUNTY_ZIPS["53228"]).toEqual({ cityShare: 0.1, mainPlace: "Greenfield" });
    expect(COUNTY_ZIPS["53202"]).toEqual({ cityShare: 1, mainPlace: "Milwaukee" });
    expect(COUNTY_ZIPS["53201"]).toBeUndefined(); // a PO-box ZIP: no Census area
  });
});

describe("checkZip", () => {
  it("keeps the first 5 digits of a ZIP or ZIP+4, trimmed", () => {
    expect(checkZip(" 53228 ")).toBe("53228");
    expect(checkZip("53228-1234")).toBe("53228");
  });
  it("refuses anything else", () => {
    for (const bad of ["5322", "abcde", "532281", "", "53 228"]) expect(checkZip(bad)).toBeNull();
  });
});

describe("zipRows", () => {
  const values = {
    B03002_001: est(1000), B03002_003: est(600), B03002_004: est(100), B03002_005: est(5), B03002_006: est(50),
    B03002_007: est(5), B03002_008: est(10), B03002_009: est(30), B03002_012: est(200),
    B17001_001: est(1000), B17001_002: est(150),
  };
  it("computes population and race shares, with Other summing three codes", () => {
    const r = zipRows(values, undefined);
    expect(r.population).toEqual(est(1000));
    expect(r.race.map((x) => x.id)).toEqual(RACE.map((x) => x.id));
    const other = r.race.find((x) => x.id === "other")!;
    expect(other.zip!.count.estimate).toBe(20);
    expect(other.zip!.count.moe).toBeCloseTo(Math.sqrt(300));
    expect(r.race.find((x) => x.id === "white")!.zip!.rate!.estimate).toBeCloseTo(0.6);
  });
  it("uses the fact sheets' formulas for the 8 measures, and compares with Milwaukee", () => {
    const city = { B17001_001: est(500000, 100), B17001_002: est(120000, 100) };
    const pov = zipRows(values, city).facts.find((x) => x.id === "poverty")!;
    expect(pov.zip!.rate!.estimate).toBeCloseTo(0.15);
    expect(pov.city!.rate!.estimate).toBeCloseTo(0.24);
    expect(pov.verdict).toBe("lower");
    expect(zipRows(values, city).facts).toHaveLength(8);
  });
  it("leaves a row empty, never NaN, when codes are missing or the population is 0 (review focus 1)", () => {
    const r = zipRows({ B03002_001: est(0, 0) }, undefined);
    expect(r.race.every((x) => x.zip === null || x.zip.rate === null)).toBe(true);
    expect(r.facts.every((x) => x.zip === null)).toBe(true);
    expect(r.race.every((x) => x.verdict === "unknown")).toBe(true);
  });
  it("needs every race code in the city request set", () => {
    expect(RACE_CODES).toEqual(expect.arrayContaining(["B03002_001", "B03002_005", "B03002_007", "B03002_008", "B03002_012"]));
  });
});
