import { describe, expect, it } from "vitest";
import { parsePortrait, placeKey, portraitPassage, readPortraitSheet, tableIdsOf, topicFor } from "../../convex/lib/portrait";
import { portraitBytes } from "../helpers/fixtures";

const bySlug = (tables: ReturnType<typeof parsePortrait>, slug: string) => tables.find((t) => t.slug === slug)!;
const row = (t: ReturnType<typeof parsePortrait>[number], label: string) => t.rows.find((r) => r.label === label)!;

describe("the 2021 layout (Silver City, Burnham Park, and Layton Park)", () => {
  const tables = parsePortrait(portraitBytes(2021));
  it("reads 15 topics, with no commute tab and Bedroom mapped to Bedrooms", () => {
    expect(tables).toHaveLength(15);
    expect(tables.map((t) => t.slug)).not.toContain("commute-method-and-time");
    expect(bySlug(tables, "bedrooms-and-year").tab).toBe("Bedroom and Year");
  });
  it("reads labels, estimates and margins exactly as written", () => {
    const race = bySlug(tables, "race-and-ethnicity");
    expect(race.tableIds).toEqual(["B03002"]);
    expect(race.vintage).toBe("2021");
    expect(row(race, "Total Population").values[0]).toEqual({ estimate: "28133", moe: "1694.69348260976" });
  });
  it("finds the header by its Estimate column and keeps section rows as headings", () => {
    const rent = bySlug(tables, "rent-paid");
    expect(rent.rows[0]).toEqual({ label: "GROSS RENT", heading: true, values: [null] });
    expect(row(rent, "Less than $500").values[0]).toEqual({ estimate: "288", moe: "105.853672586264" });
  });
});

describe("the 2022+ layout (Walker's Point, 2023)", () => {
  const tables = parsePortrait(portraitBytes(2023));
  it("reads 16 topics", () => {
    expect(tables).toHaveLength(16);
  });
  it("drops the broken % column and says why", () => {
    const race = bySlug(tables, "race-and-ethnicity");
    expect(row(race, "Total:").values[0]).toEqual({ estimate: "7668", moe: "789.722103021056" });
    expect(race.issues).toContain("Percentages and precision columns have formula errors in DYCU's file, so they aren't shown.");
  });
  it("names header-prefixed groups and flags a group that is all zeros", () => {
    const age = bySlug(tables, "sex-and-age");
    expect(age.groups).toEqual(["Total", "Male", "Female"]);
    expect(row(age, "Total").values[1]).toEqual({ estimate: "4185", moe: "503.322957950459" });
    expect(age.issues).toContain("The Total columns are 0 for every row in DYCU's file; this may be missing data.");
  });
  it("names groups from the merged titles above the header", () => {
    expect(bySlug(tables, "employment-status-by-sex").groups).toEqual([
      "Total",
      "Labor Force Participation Rate",
      "Employment/Population Ratio",
      "Unemployment Rate (% of Labor)",
    ]);
    expect(bySlug(tables, "units-in-structure").groups).toEqual([
      "Occupied Housing Units",
      "Owner-Occupied Housing Units",
      "Renter-Occupied Housing Units",
    ]);
  });
});

describe("cells and names", () => {
  const sheet = (rows: string[][]) => ({ name: "Rent Paid", rows, links: [] });
  it("keeps text and error cells as written, and flags them", () => {
    const t = readPortraitSheet(
      sheet([
        ["TABLE ID:", "DP04"],
        [],
        ["Variable", "Estimate", "%", "MOE"],
        ["Median rent", "N/A", "", "#NUM!"],
        ["Units", "12", "", "4"],
      ]),
      0,
    );
    expect(t.rows[0].values[0]).toEqual({ estimate: "N/A", moe: "#NUM!" });
    expect(t.issues).toContain("Some estimates or margins have errors in DYCU's file; they're shown as written.");
  });
  it("matches a neighborhood whatever order its names are in", () => {
    expect(placeKey("Silver City, Burnham Park, and Layton Park")).toBe("burnham-park-layton-park-silver-city");
    expect(placeKey("Silver City, Layton Park, and Burnham Park")).toBe("burnham-park-layton-park-silver-city");
    expect(placeKey("Walker's Point")).toBe("walkers-point");
  });
  it("pulls every Census table ID out of a phrase", () => {
    expect(tableIdsOf("B08301 and B08303 (and S0801 if only one census tract)")).toEqual(["B08301", "B08303", "S0801"]);
    expect(tableIdsOf("B01001, (S1101 for avg size)")).toEqual(["B01001", "S1101"]);
    // Data profile tables have two digits (DP02 to DP05).
    expect(tableIdsOf("DP04")).toEqual(["DP04"]);
  });
  it("knows the topics, and marks a tab it hasn't seen", () => {
    expect(topicFor("Bedroom and Year")).toEqual({ slug: "bedrooms-and-year", topic: "Bedrooms and Year", known: true });
    expect(topicFor("Something New").known).toBe(false);
  });
  it("writes a search passage that leads with the place and topic", () => {
    const race = bySlug(parsePortrait(portraitBytes(2023)), "race-and-ethnicity");
    const text = portraitPassage("Walker's Point", 2023, race);
    expect(text.startsWith("Walker's Point 2023 · Race and Ethnicity (B03002)")).toBe(true);
    // The topic line and rounded numbers keep gibberish searches from matching digit-heavy passages (measured 2026-10-08).
    expect(text).toContain("How many residents identify with each race");
    expect(text).toContain("Total:: 7,668 ± 790");
  });
});
