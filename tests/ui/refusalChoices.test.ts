import { describe, expect, it } from "vitest";
import { changeChoices, countChoices, numberChoices, rankChoices, relateChoices } from "../../ui/lib/refusalChoices";

const rankArgs = { code: "E02", column: "nope", place: "County", year: "2023", direction: "high" as const };
const columns = [
  { column: "households", meaning: "Estimate - total number of households", range: true },
  { column: "pov_rate", meaning: "Estimate - Percentage of households with income below the poverty line Calculation: (poverty / households) x 100", range: true },
  { column: "share", meaning: "", range: false },
];

describe("tract tool choices", () => {
  it("choose-column: the server's columns, those with margins first, plain meaning cut with the column name", () => {
    const c = rankChoices(rankArgs, { status: "choose-column", columns: [columns[2], ...columns.slice(0, 2)] });
    expect(c.map((x) => x.label)).toEqual(["total number of households (households)", "Percentage of households with income below the poverty line (pov_rate)", "share"]);
    expect(c[1].question).toBe("Rank census tracts by Percentage of households with income below the poverty line, highest first, Milwaukee County 2023 (E02 pov_rate).");
  });
  it("cuts a long meaning at 60 characters", () => {
    const long = { column: "x", meaning: "A".repeat(80), range: true };
    expect(rankChoices(rankArgs, { status: "choose-column", columns: [long] })[0].label).toBe(`${"A".repeat(59)}… (x)`);
  });
  it("choose-year: the offered places and years", () => {
    const c = rankChoices({ ...rankArgs, column: "pov_rate" }, { status: "choose-year", available: [{ place: "City", year: "2022" }, { place: "County", year: "2024" }] });
    expect(c.map((x) => x.label)).toEqual(["City 2022", "County 2024"]);
    expect(c[1].question).toContain("Milwaukee County 2024 (E02 pov_rate)");
  });
  it("change: a wrong second year swaps 'to', otherwise 'from', same place only", () => {
    const args = { code: "E02", column: "pov_rate", place: "County", from: "2021", to: "2030" };
    const c = changeChoices(args, { status: "choose-year", year: "2030", available: [{ place: "County", year: "2024" }, { place: "City", year: "2023" }] });
    expect(c).toEqual([{ label: "2024", question: "Where did pov_rate change most in Milwaukee County from 2021 to 2024? (E02 pov_rate)" }]);
  });
  it("relate: swaps only the refused side's column; years offered are the shared ones only", () => {
    const args = { a: { code: "E02", column: "pov_rate" }, b: { code: "F02", column: "nope" }, place: "County", year: "2023", mode: "relate" as const };
    const c = relateChoices(args, { status: "choose-column", dataset: "b", columns: [{ column: "per_insecure", meaning: "Estimate - percentage of adults food insecure", range: true }] });
    expect(c[0].question).toBe("Does E02 pov_rate go together with percentage of adults food insecure (F02 per_insecure) across Milwaukee County census tracts in 2023?");
    expect(relateChoices(args, { status: "choose-year", available: { a: [], b: [] }, shared: [] })).toEqual([]);
    expect(relateChoices(args, { status: "choose-year", available: { a: [], b: [] }, shared: [{ place: "County", year: "2023" }] })[0].label).toBe("County 2023");
    // Property x DYCU: the DYCU side's own years are the choice (the property side has none to share).
    expect(relateChoices(args, { status: "choose-year", dataset: "b", available: [{ place: "County", year: "2024" }] })[0]).toEqual({ label: "County 2024", question: expect.stringContaining("Milwaukee County census tracts in 2024") });
  });
  it("never more than eight, and nothing for an empty list", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ column: `c${i}`, meaning: "", range: true }));
    expect(rankChoices(rankArgs, { status: "choose-column", columns: many })).toHaveLength(8);
    expect(rankChoices(rankArgs, { status: "choose-column", columns: [] })).toEqual([]);
  });
});

describe("City count choices", () => {
  const args = { code: "P01", from: "2026-01-01", filters: [{ column: "Offense_All", values: ["theft"] }] };
  it("choose: swaps the asked filter's value (or the neighborhood)", () => {
    const c = countChoices(args, { status: "choose", name: "NIBRS Crime Data", column: "Offense_All", choices: ["Shoplifting", "Theft From Building"] });
    expect(c.map((x) => x.label)).toEqual(["Shoplifting", "Theft From Building"]);
    expect(c[0].question).toBe("Count P01 NIBRS Crime Data where Offense_All is Shoplifting, from 2026-01-01.");
    expect(countChoices({ code: "P01" }, { status: "choose", name: "NIBRS Crime Data", column: "neighborhood", choices: ["Harambee"] })[0].question).toBe("Count P01 NIBRS Crime Data in Harambee.");
  });
  it("bad-column: swaps the group or the filter's column", () => {
    expect(countChoices({ code: "P01", groupBy: "District" }, { status: "bad-column", name: "NIBRS Crime Data", column: "District", columns: ["Police_District"] })[0].question).toBe("Count P01 NIBRS Crime Data, by Police_District.");
  });
  it("no-neighborhood: the nearest names", () => {
    expect(countChoices({ code: "P01", neighborhood: "Harambe" }, { status: "no-neighborhood", name: "NIBRS Crime Data", nearest: ["Harambee"] })[0].question).toBe("Count P01 NIBRS Crime Data in Harambee.");
  });
});

describe("N03 table choices", () => {
  const args = { neighborhood: "Harambe", topic: "Poverty Status by Age", row: "Under 5 years", year: 2024 };
  it("neighborhoods, topics and rows each swap one part", () => {
    expect(numberChoices(args, { status: "no-neighborhood", neighborhoods: ["Harambee"] })[0].question).toBe('Poverty Status by Age: "Under 5 years" in Harambee (2024).');
    expect(numberChoices(args, { status: "no-topic", topics: ["Poverty Status"] })[0].question).toBe('Poverty Status: "Under 5 years" in Harambe (2024).');
    expect(numberChoices({ ...args, year: undefined }, { status: "choose-row", rows: ["5 to 17 years"] })[0].question).toBe('Poverty Status by Age: "5 to 17 years" in Harambe.');
  });
});
