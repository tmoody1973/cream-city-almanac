// tests/lib/neighborhoodSources.test.ts
import { describe, expect, it } from "vitest";
import { buildDycuNeighborhoods, parseCityNeighborhoods, parseDefinitions } from "../../convex/lib/neighborhoodSources";

const ring = [[-87.92, 43.06], [-87.9, 43.06], [-87.9, 43.08], [-87.92, 43.08], [-87.92, 43.06]];

describe("City boundaries", () => {
  it("keeps each named shape with its rectangle, and skips one it can't read", () => {
    const { rows, skipped } = parseCityNeighborhoods({
      type: "FeatureCollection",
      features: [
        { properties: { NEIGHBORHD: "HARAMBEE" }, geometry: { type: "Polygon", coordinates: [ring] } },
        { properties: { NEIGHBORHD: "BROKEN" }, geometry: null },
        { properties: {}, geometry: { type: "Polygon", coordinates: [ring] } },
        { properties: { NEIGHBORHD: "EMPTY" }, geometry: { type: "Polygon", coordinates: [] } },
      ],
    });
    expect(rows).toEqual([{ name: "Harambee", matchKey: "harambee", geometry: JSON.stringify({ type: "Polygon", coordinates: [ring] }), bbox: { minLat: 43.06, maxLat: 43.08, minLon: -87.92, maxLon: -87.9 } }]);
    expect(skipped).toEqual(["BROKEN", "(unnamed)", "EMPTY"]);
  });
  it("throws on something that isn't a feature collection, so last week's boundaries stay", () => {
    expect(() => parseCityNeighborhoods({ error: { code: 400 } })).toThrow();
  });
});

describe("DYCU definitions", () => {
  it("reads tract lists across line breaks, including combined names", () => {
    const text = "Census tracts 71, 72, 79, 80 and 107 were used to define the Riverwest\nneighborhood for the purposes of this report. " +
      "Census tracts 1101, 1102 and 1103 were used to define the Burnham Park, Layton Park and Silver City neighborhood for the purposes of this report.";
    expect(parseDefinitions(text)).toEqual([
      { name: "Riverwest", tracts: ["71", "72", "79", "80", "107"] },
      { name: "Burnham Park, Layton Park and Silver City", tracts: ["1101", "1102", "1103"] },
    ]);
  });
  it("reads decimal tract numbers", () => {
    const text = "Census tracts 3.02, 3.03 and 5.02 were used to define the Little Menomonee River Parkway neighborhood for the purposes of this report.";
    expect(parseDefinitions(text)).toEqual([{ name: "Little Menomonee River Parkway", tracts: ["3.02", "3.03", "5.02"] }]);
  });
  it("ends the name at 'for the purposes' when the report doesn't say 'neighborhood'", () => {
    const text = "Census tracts 164, 167 and 168 were used to define the Historic Mitchell St. for the purposes of this report. These tracts were chosen in consultation with our partners.";
    expect(parseDefinitions(text)).toEqual([{ name: "Historic Mitchell St.", tracts: ["164", "167", "168"] }]);
  });
  it("treats renamed neighborhoods as the current name", () => {
    const found = [
      { name: "Westside", year: 2021, tracts: ["123", "124"] },
      { name: "Near West Side", year: 2023, tracts: ["123", "124"] },
    ];
    expect(buildDycuNeighborhoods(found, ["Near West Side"])).toEqual({
      rows: [{ name: "Near West Side", matchKey: "near-west-side", tracts: [{ years: [2021, 2023], tracts: ["123", "124"] }] }],
      notes: [],
    });
  });
  it("keeps one entry per changed list, and reports names that don't match the spreadsheet places", () => {
    const found = [
      { name: "Riverwest", year: 2022, tracts: ["71", "72"] },
      { name: "Riverwest", year: 2023, tracts: ["71", "72"] },
      { name: "Silver City, Layton Park and Burnham Park", year: 2021, tracts: ["1101"] },
      { name: "Burnham Park, Layton Park and Silver City", year: 2023, tracts: ["1101", "1102"] },
      { name: "Atlantis", year: 2023, tracts: ["1"] },
    ];
    const { rows, notes } = buildDycuNeighborhoods(found, ["Riverwest", "Burnham Park, Layton Park and Silver City", "Harambee"]);
    expect(rows).toEqual([
      { name: "Burnham Park, Layton Park and Silver City", matchKey: "burnham-park-layton-park-silver-city", tracts: [{ years: [2021], tracts: ["1101"] }, { years: [2023], tracts: ["1101", "1102"] }] },
      { name: "Riverwest", matchKey: "riverwest", tracts: [{ years: [2022, 2023], tracts: ["71", "72"] }] },
    ]);
    expect(notes).toEqual([
      "DYCU definition for \"Atlantis\" matches no neighborhood spreadsheet; not stored",
      "No DYCU tract definition found for Harambee",
    ]);
  });
});
