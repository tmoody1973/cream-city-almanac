import { describe, expect, it } from "vitest";
import { CITY_MEASURES, MEASURE_FILES, measuresFor } from "../../convex/lib/cityMeasures";

describe("approved City measures", () => {
  it("are well-formed, with unique ids and real units", () => {
    expect(CITY_MEASURES).toHaveLength(6);
    expect(new Set(CITY_MEASURES.map((m) => m.id)).size).toBe(6);
    for (const m of CITY_MEASURES) {
      expect(m.familyKey).toMatch(/^city:[a-z0-9-]+$/);
      expect(["dollars", "dollars per hour"]).toContain(m.unit);
      expect(m.splits.length).toBeGreaterThan(0);
      for (const s of [m.file, m.column, m.name, m.things, m.caveat]) expect(s.length).toBeGreaterThan(2);
    }
  });
  it("leaves out $0 assessed values, which the City writes for exempt property", () => {
    expect(CITY_MEASURES.find((m) => m.id === "assessed-value")!.skipZero).toBe(true);
  });
  it("never sums a rate", () => {
    expect(CITY_MEASURES.find((m) => m.id === "hourly-rate")!.summable).toBe(false);
    expect(CITY_MEASURES.filter((m) => m.unit === "dollars").every((m) => m.summable)).toBe(true);
  });
  it("finds a file's measures by family key and names the files that have any", () => {
    expect(measuresFor("city:city-employee-salary-data").map((m) => m.id)).toEqual(["gross-pay", "hourly-rate"]);
    expect(measuresFor("city:nibrs-crime-data")).toEqual([]);
    expect(MEASURE_FILES).toContain("delinquent real estate tax accounts");
    expect(new Set(MEASURE_FILES).size).toBe(MEASURE_FILES.length);
  });
});
