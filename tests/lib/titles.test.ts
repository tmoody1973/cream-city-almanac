import { describe, expect, it } from "vitest";
import { measureKey, parseTitle, parseYears } from "../../convex/lib/titles";

describe("parseTitle", () => {
  it("splits year, county and measure", () => {
    expect(parseTitle("2024 Milwaukee County Unemployment Rate")).toEqual({
      measure: "Unemployment Rate",
      measureKey: "unemployment-rate",
      place: "County",
      years: [2024],
      yearLabel: "2024",
    });
  });
  it("treats bare 'Milwaukee' as the city and fixes known typos", () => {
    const p = parseTitle("2024 Miwlaukee County Housing Tenure");
    expect(p.place).toBe("County");
    expect(parseTitle("2021 Milwaukee Individuals who have Visisted the Dentist in the Past Year").measure).toBe(
      "Individuals who have Visited the Dentist in the Past Year",
    );
    expect(parseTitle("2018 Milwaukee Access to Parks").place).toBe("City");
  });
  it("reads neighborhood documents as place + document type", () => {
    const p = parseTitle("2024 Silver City, Layton Park, and Burnham Park Neighborhood Portrait Spreadsheet");
    expect(p.place).toBe("Silver City, Layton Park, and Burnham Park");
    expect(p.measureKey).toBe("neighborhood-portrait-spreadsheet");
  });
  it("keeps titles with no year or place whole", () => {
    expect(parseTitle("MKE FreshAir Dashboard")).toMatchObject({ measure: "MKE FreshAir Dashboard", place: null, years: [] });
  });
});

describe("parseYears", () => {
  it("expands short spans and school years", () => {
    expect(parseYears("2023", "2025")).toEqual({ years: [2023, 2024, 2025], yearLabel: "2023–2025" });
    expect(parseYears("2015", "16")).toEqual({ years: [2015, 2016], yearLabel: "2015–16" });
  });
  it("keeps only the endpoints of long spans", () => {
    expect(parseYears("2010", "2020").years).toEqual([2010, 2020]);
  });
  it("does not crash on a backwards range", () => {
    expect(parseYears("2024", "2020").years).toEqual([2024]);
  });
});

describe("measureKey", () => {
  it("ignores case and applies aliases", () => {
    expect(measureKey("Households Living In Poverty")).toBe(measureKey("Households Living in Poverty"));
    expect(measureKey("School Proficiency Rates")).toBe("school-proficiency");
  });
});
