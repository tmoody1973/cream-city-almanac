import { describe, expect, it } from "vitest";
import { periodLabel, summarize, type StoredRow } from "../../convex/lib/stopMath";

const t = (period: string, race: string, n: number, sex = "Male"): StoredRow => ({ period, year: Number(period.slice(0, 4)), kind: "traffic", race, sex, frisked: null, searched: null, found: null, n });
const fi = (period: string, race: string, frisked: "yes" | "no", searched: "yes" | "no", found: string, n: number): StoredRow =>
  ({ period, year: Number(period.slice(0, 4)), kind: "field-interview", race, sex: "Male", frisked, searched, found, n });
const ROWS: StoredRow[] = [
  t("2019-Q1Q2", "Black", 100), t("2019-Q3", "Black", 60), t("2019-Q3", "White", 40), t("2024-Q4", "Black", 50), t("2024-Q4", "Hispanic", 30, "Female"),
  fi("2021-Q4", "Black", "yes", "yes", "Firearm", 12), fi("2021-Q4", "Black", "no", "yes", "None", 8), fi("2021-Q4", "Black", "no", "no", "None", 20),
  fi("2021-Q4", "White", "yes", "yes", "None", 3),
];
const DONE = ["2019-Q1Q2", "2019-Q3", "2021-Q4", "2024-Q4"].map((period) => ({ period, status: "counted" }));
const ok = (r: ReturnType<typeof summarize>) => { if (r.status !== "ok") throw new Error(JSON.stringify(r)); return r; };

describe("periodLabel (K3)", () => {
  it("writes the half-year and quarters for people", () => {
    expect(periodLabel("2019-Q1Q2")).toBe("2019 Q1–Q2");
    expect(periodLabel("2021-Q4")).toBe("2021 Q4");
  });
});

describe("summarize (K3)", () => {
  it("adds a year's quarters, the 2019 half-year included, oldest year first", () => {
    const r = ok(summarize(ROWS, DONE, { kind: "traffic", groupBy: "year" }));
    expect(r.groups.map((g) => [g.label, g.n])).toEqual([["2019", 200], ["2024", 80]]);
    expect(r).toMatchObject({ total: 280, period: "2019 Q1–Q2 – 2024 Q4", source: "From MPD's quarterly stop-and-search data (2019 Q1–Q2 to 2024 Q4), counted by the Almanac from the City's files." });
  });
  it("gives each group its share, largest first, and the three notes", () => {
    const r = ok(summarize(ROWS, DONE, { kind: "traffic", groupBy: "race" }));
    expect(r.groups).toEqual([{ label: "Black", n: 210, share: 75 }, { label: "White", n: 40, share: 14.3 }, { label: "Hispanic", n: 30, share: 10.7 }]);
    expect(r.notes).toEqual([
      "People per stop as MPD recorded them: a person stopped twice counts twice.",
      "Race and ethnicity are one group here: Hispanic when either MPD field says so.",
      "These are counts, not rates per resident.",
    ]);
    expect(r.rates).toBe(false);
  });
  it("gives field-interview rates per race, and too few to say under 10 people (review focus 5)", () => {
    const r = ok(summarize(ROWS, DONE, { kind: "field-interview", groupBy: "race" }));
    expect(r.rates).toBe(true);
    expect(r.groups[0]).toEqual({ label: "Black", n: 40, share: 93, frisked: 30, searched: 50, found: 60 });
    expect(r.groups[1]).toEqual({ label: "White", n: 3, share: 7, frisked: null, searched: null, found: null });
  });
  it("narrows by quarter or year, and filters in any case (review focus 3)", () => {
    expect(ok(summarize(ROWS, DONE, { kind: "traffic", from: "2019-Q3", to: "2019" })).total).toBe(100);
    expect(ok(summarize(ROWS, DONE, { kind: "traffic", from: "2019-Q2", to: "2019-Q2" })).total).toBe(100); // the half-year holds Q2
    const r = ok(summarize(ROWS, DONE, { kind: "traffic", filters: { race: ["black"], sex: ["MALE"] } }));
    expect(r).toMatchObject({ total: 210, filters: ["Black", "Male"] });
    expect(summarize(ROWS, DONE, { filters: { race: ["Purple"] } })).toEqual({ status: "choose", column: "race", asked: "Purple", choices: ["Black", "Hispanic", "White"] });
  });
  it("refuses frisk, search and found outside field interviews, bad periods, and no data yet", () => {
    expect(summarize(ROWS, DONE, { kind: "traffic", filters: { frisked: "yes" } })).toEqual({ status: "refused", reason: "Frisk, search and found are recorded for field interviews only." });
    expect(summarize(ROWS, DONE, { groupBy: "found" })).toMatchObject({ status: "refused" });
    const range = 'Periods are years ("2021") or quarters ("2021-Q3"); the data covers 2019 Q1–Q2 to 2024 Q4.';
    for (const a of [{ from: "21" }, { from: "2024", to: "2019" }, { from: "2030" }]) expect(summarize(ROWS, DONE, a)).toEqual({ status: "refused", reason: range });
    expect(summarize([], [], {})).toEqual({ status: "refused", reason: "Stop counts haven't been built yet." });
  });
  it("names a period in range that couldn't be read (review focus 4)", () => {
    const r = ok(summarize(ROWS, [...DONE, { period: "2023-Q2", status: "failed" }], { kind: "traffic" }));
    expect(r.notes).toContain("The City's file for 2023 Q2 couldn't be read.");
  });
});
