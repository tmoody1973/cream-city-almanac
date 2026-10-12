import { describe, expect, it } from "vitest";
import { measureExport } from "../../ui/lib/cardExport";
import { measureFollowUps } from "../../ui/lib/nextQuestions";
import { measureChoices } from "../../ui/lib/refusalChoices";
import { measureNotes, measureSummary, measureTitle, money } from "../../ui/lib/measureText";

const base = {
  status: "measured" as const, code: "H19", name: "Delinquent Real Estate Tax Accounts", groupBy: "Ald Dist", period: "all records", filters: [], averageAsked: false, splits: ["Ald Dist", "Levy Year"],
  measure: { id: "tax-owed", name: "back tax owed", unit: "dollars" as const, caveat: "ZIP in this file is the owner's mailing ZIP, not the property's; aldermanic district is where the property is.", column: "Total Tax Principal", things: "accounts", summable: true, skipZero: false, namesPeople: true, date: null },
  groups: [
    { label: "15", n: 3407, total: 10230710.4, median: 2228.9, average: 3002.9, hidden: false },
    { label: "6", n: 3123, total: 9908916.4, median: 2295.4, average: 3172.9, hidden: false },
    { label: "99", n: 3, total: null, median: null, average: null, hidden: true },
  ],
  other: null, all: { n: 17500, total: 52000000, median: 2400, average: 3100, unreadable: 0, zeros: 0 },
};
const ctx = { origin: "https://almanac.test", date: "October 12, 2026" };

describe("money", () => {
  it("writes dollars and hourly rates the way a reporter would", () => {
    expect(money(10230710.4, "dollars", "table")).toBe("$10,230,710");
    expect(money(10230710.4, "dollars", "sentence")).toBe("$10.2 million");
    expect(money(4434889421, "dollars", "sentence")).toBe("$4.4 billion");
    expect(money(80.71, "dollars", "table")).toBe("$80.71");
    expect(money(41.418125, "dollars per hour", "table")).toBe("$41.42");
    expect(money(41.418125, "dollars per hour", "sentence")).toBe("$41.42 an hour");
    expect(money(null, "dollars", "table")).toBe("—");
  });
});

describe("the measure card's words", () => {
  it("titles the card and states the total and median, naming no hidden group", () => {
    expect(measureTitle(base)).toBe("Delinquent Real Estate Tax Accounts · back tax owed · by Ald Dist");
    expect(measureSummary(base)).toBe("17,500 accounts total $52.0 million; the median is $2,400. The largest total is 15 ($10.2 million); the highest median is 6 ($2,295).");
  });
  it("never states a total for a rate", () => {
    const rate = { ...base, groupBy: null, groups: [], measure: { ...base.measure, id: "hourly-rate", name: "hourly pay rate", unit: "dollars per hour" as const, things: "employees", summable: false }, all: { ...base.all, n: 8000, total: 330000, median: 34.5 } };
    expect(measureSummary(rate)).toBe("Across 8,000 employees, the median is $34.50 an hour.");
  });
  it("notes the caveat, hidden groups and a far-off average when asked", () => {
    expect(measureNotes(base)).toEqual([base.measure.caveat, "Some groups have fewer than 5 records, so their figures are hidden to protect individuals.", "Period: all records."]);
    const skewed = { ...base, averageAsked: true, all: { ...base.all, median: 2000, average: 3100, zeros: 4, unreadable: 2 }, measure: { ...base.measure, skipZero: true } };
    expect(measureNotes(skewed)).toEqual([
      base.measure.caveat,
      "2 records had no readable amount and were left out.",
      "4 records with $0 were left out.",
      "Some groups have fewer than 5 records, so their figures are hidden to protect individuals.",
      "A few large values pull the average away from the typical one; the median is the better guide.",
      "Period: all records.",
    ]);
  });
});

describe("measure export, follow-ups and choices", () => {
  it("exports unrounded figures, hidden groups as empty cells, and no Total column for a rate", () => {
    const e = measureExport(base, ctx);
    expect(e.csv.head).toEqual(["Ald Dist", "Records", "Total (dollars)", "Median (dollars)"]);
    expect(e.csv.rows[0]).toEqual(["15", 3407, 10230710.4, 2228.9]);
    expect(e.csv.rows[2]).toEqual(["99 (fewer than 5 records)", 3, null, null]);
    expect(e.csv.rows.at(-1)).toEqual(["All", 17500, 52000000, 2400]);
    expect(e.notes).toContain("Source: City of Milwaukee, H19 Delinquent Real Estate Tax Accounts: https://almanac.test/d/H19");
    const rate = measureExport({ ...base, measure: { ...base.measure, summable: false, unit: "dollars per hour" as const } }, ctx);
    expect(rate.csv.head).toEqual(["Ald Dist", "Records", "Median (dollars per hour)"]);
  });
  it("offers another split and the average, and turns choose-measure into buttons", () => {
    expect(measureFollowUps(base).map((f) => f.label)).toEqual(["BY LEVY YEAR", "SHOW THE AVERAGE"]);
    expect(measureFollowUps(base)[0].question).toBe("How much back tax owed in Delinquent Real Estate Tax Accounts (H19), by Levy Year?");
    expect(measureChoices({ status: "choose-measure", code: "X36", name: "City Employee Salary Data", measures: [{ id: "gross-pay", name: "gross pay" }] })).toEqual([{ label: "gross pay", question: "How much gross pay in City Employee Salary Data (X36)? (measure gross-pay)" }]);
  });
});
