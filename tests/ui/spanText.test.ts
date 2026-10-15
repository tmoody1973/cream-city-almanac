import { describe, expect, it } from "vitest";
import { spanExport } from "../../ui/lib/cardExport";
import { spanChoices } from "../../ui/lib/refusalChoices";
import { spanFollowUps } from "../../ui/lib/nextQuestions";
import { ageText, durationText, spanCells, spanColumns, spanNotes, spanRows, spanSummary, spanTitle } from "../../ui/lib/spanText";

const pair = { kind: "between" as const, id: "complaint-close", name: "time to close", things: "complaints", toWhat: "to close", unit: "days" as const, missing: "{n} complaints aren't closed yet and aren't counted, so slow cases are under-counted.", caveat: "Dates are typed by hand in more than one format; a few can't be read.", from: "DateReported", to: "Date Closed" };
const r = {
  status: "ok" as const, code: "P24", name: "Citizen Complaints", pair, namesPeople: false, asOf: null, groupBy: "Department", overlap: false, period: "all records", filters: [], coverage: null, columns: ["Department", "Status"],
  groups: [
    { label: "Milwaukee Police Department", cases: 2437, median: 92, p90: 478.4, open: 105 },
    { label: "Milwaukee Fire Department", cases: 64, median: 22, p90: 86.7, open: 0 },
    { label: "Unknown", cases: 3, median: 0, p90: 14.4, open: 0 },
  ],
  other: 0, all: { label: "All", cases: 2731, median: 64, p90: 400, open: 105, unreadable: 12, backwards: 17 },
};
const ctx = { origin: "https://almanac.test", date: "October 12, 2026" };

describe("durations", () => {
  it("writes days and minutes the way a reporter would", () => {
    expect(durationText(92, "days")).toBe("92 days");
    expect(durationText(1478.4, "days")).toBe("4.1 years");
    expect(durationText(0.5, "days")).toBe("0.5 days");
    expect(durationText(1, "days")).toBe("1 day");
    expect(durationText(4.6037, "minutes")).toBe("4.6 minutes");
    expect(durationText(72.2, "minutes")).toBe("1 h 12 min");
    expect(durationText(null, "days")).toBe("too few to say");
  });
});

describe("the span card's words", () => {
  it("titles the card and says what was found, slowest and fastest among groups with enough cases", () => {
    expect(spanTitle(r)).toBe("Citizen Complaints · time to close · by Department");
    expect(spanSummary(r)).toBe("Overall, half of the complaints measured took 64 days or less to close. Slowest: Milwaukee Police Department (92 days); fastest: Milwaukee Fire Department (22 days).");
    expect(spanSummary({ ...r, groupBy: null, groups: [] })).toBe("Half of the complaints measured took 64 days or less to close; 9 in 10 took 1.1 years or less.");
  });
  it("notes open cases, unreadable and wrong-order dates, the caveat, and what too few means", () => {
    const { warning, notes } = spanNotes(r);
    expect(warning).toBeNull();
    expect(notes).toEqual([
      "105 complaints aren't closed yet and aren't counted, so slow cases are under-counted.",
      "12 dates couldn't be read and were left out.",
      "17 had the later date before the earlier one and were left out.",
      "Dates are typed by hand in more than one format; a few can't be read.",
      "Period: all records.",
      "“Too few to say” means fewer than 10 measured cases.",
    ]);
  });
  it("warns in bold when more than 1 in 5 dates couldn't be read, and says recent years look faster", () => {
    expect(spanNotes({ ...r, all: { ...r.all, unreadable: 900 } }).warning).toBe("More than 1 in 5 dates here couldn't be read, so treat these times with caution.");
    const byYear = { ...r, groupBy: "year", groups: [{ label: "2025", cases: 311, median: 52, p90: 167, open: 79 }, { label: "2024", cases: 524, median: 87, p90: 372.7, open: 21 }] };
    expect(spanNotes(byYear).notes).toContain("Recent years look faster than they are: their slowest cases aren't closed yet.");
  });
});

describe("span export", () => {
  it("has a row per group plus All, with unrounded times in the unit's heading", () => {
    const e = spanExport(r, ctx);
    expect(e.csv.head).toEqual(["Department", "Cases", "Median (days)", "9 in 10 within (days)", "Still open"]);
    expect(e.csv.rows[0]).toEqual(["Milwaukee Police Department", 2437, 92, 478.4, 105]);
    expect(e.csv.rows.at(-1)).toEqual(["All", 2731, 64, 400, 105]);
    expect(e.text.rows[2]).toEqual(["Unknown", "3", "too few to say", "too few to say", "0"]);
    expect(e.notes).toContain("Source: City of Milwaukee, P24 Citizen Complaints: https://almanac.test/d/P24");
    expect(e.filename).toBe("almanac_P24_complaint-close_Department");
  });
});

describe("span follow-ups and choices", () => {
  it("offers by year and another column, never the split already shown", () => {
    const f = spanFollowUps({ code: "P24", groupBy: "Department" }, r);
    expect(f.map((x) => x.label)).toEqual(["BY YEAR", "BY STATUS"]);
    expect(f[0].question).toBe("How long did complaints take to close in Citizen Complaints (P24), by year? (pair complaint-close)");
  });
  it("keeps the card's filters and period, and skips a column the card is already filtered to", () => {
    const f = spanFollowUps({ code: "P24", groupBy: "Department", from: "2024-01-01", filters: [{ column: "Status", values: ["Closed"] }] }, r);
    expect(f.map((x) => x.label)).toEqual(["BY YEAR"]);
    expect(f[0].question).toBe("How long did complaints take to close in Citizen Complaints (P24) where Status is Closed, from 2024-01-01, by year? (pair complaint-close)");
  });
  it("turns a choose-pair refusal into one button per pair", () => {
    const c = spanChoices({ code: "P04" }, { status: "choose-pair", code: "P04", name: "Fire Incident Detail", pairs: [{ id: "fire-arrive", name: "time to arrive", from: "Date_Received", to: "Date_Arrived" }] });
    expect(c).toEqual([{ label: "time to arrive", question: "How long is the time to arrive in Fire Incident Detail (P04)? (pair fire-arrive)" }]);
  });
});

describe("review fixes", () => {
  it("says too few were measured instead of writing a broken sentence", () => {
    const tiny = { ...r, groupBy: null, groups: [], all: { ...r.all, cases: 4, median: 3, p90: 5 } };
    expect(spanSummary(tiny)).toBe("Too few complaints were measured to say how long they took to close (4 measured).");
    expect(spanSummary({ ...tiny, all: { ...tiny.all, cases: 0, median: null, p90: null } })).toBe("Too few complaints were measured to say how long they took to close (0 measured).");
  });
  it("warns in bold when more lack an end date than were measured", () => {
    const most = { ...r, pair: { ...pair, things: "requests" }, all: { ...r.all, cases: 10599, open: 17175, unreadable: 0, backwards: 0 } };
    expect(spanNotes(most).warning).toBe("17,175 requests have no end date, more than the 10,599 measured, so these times describe only the requests that have one.");
    expect(spanNotes(r).warning).toBeNull();
  });
  it("keeps a real group named Other apart from the cut-off rest", () => {
    const withOther = { ...r, groups: [{ label: "Other", cases: 40, median: 12, p90: 30, open: 1 }], other: 25 };
    const rows = spanRows(withOther);
    expect(rows.map((x) => [x.label, x.rest])).toEqual([["Other", false], ["All other groups", true]]);
    const e = spanExport(withOther, ctx);
    expect(e.text.rows[0]).toEqual(["Other", "40", "12 days", "30 days", "1"]);
    expect(e.csv.rows[1]).toEqual(["All other groups", 25, null, null, null]);
  });
});

describe("ages (L2)", () => {
  const age = {
    status: "ok" as const, code: "B12", name: "Vacant Buildings", namesPeople: false, groupBy: null, overlap: false, period: "all records", filters: [], coverage: null, columns: ["AldermanicDistrict"], asOf: "2026-10-14",
    pair: { kind: "age" as const, id: "vacant-age", from: "DATEOPENED", asOf: "today" as const, name: "time vacant so far", things: "buildings", toWhat: "on the vacant list", unit: "days" as const, caveat: "The City adds a building when it registers it as vacant and removes it when it is no longer vacant.", asOfNote: "As of {date}: buildings still on the City's vacant-building list. The date is when the City registered the building as vacant, not when it emptied. Buildings taken off the list aren't counted." },
    groups: [], other: 0, all: { label: "All", cases: 1750, median: 420, p90: 1300, open: 0, unreadable: 0, backwards: 1 },
  };
  it("prints a year or more as years, and less in days", () => {
    expect(ageText(420)).toBe("1.2 years");
    expect(ageText(1300)).toBe("3.6 years");
    expect(ageText(200)).toBe("200 days");
    expect(ageText(null)).toBe("too few to say");
  });
  it("says how long the open cases have been open, with the longest tenth", () => {
    expect(spanTitle(age)).toBe("Vacant Buildings · time vacant so far");
    expect(spanSummary(age)).toBe("Half of the buildings have been on the vacant list 1.2 years or more; 1 in 10 for 3.6 years or more.");
  });
  it("names the longest and shortest groups when split", () => {
    const g = (label: string, median: number) => ({ label, cases: 50, median, p90: median * 2, open: 0 });
    expect(spanSummary({ ...age, groupBy: "AldermanicDistrict", groups: [g("6", 1240), g("14", 290)] })).toBe("Overall, half of the buildings have been on the vacant list 1.2 years or more. Longest: 6 (3.4 years); shortest: 14 (290 days).");
  });
  it("leads the notes with the dated as-of note and counts records after it", () => {
    const { warning, notes } = spanNotes(age);
    expect(warning).toBeNull();
    expect(notes[0]).toBe("As of October 14, 2026: buildings still on the City's vacant-building list. The date is when the City registered the building as vacant, not when it emptied. Buildings taken off the list aren't counted.");
    expect(notes).toContain("1 records dated after the as-of date were left out.");
    expect(notes.join(" ")).not.toMatch(/later date before the earlier one|still open|aren't closed/);
  });
  it("has no still-open column", () => {
    expect(spanColumns(age)).toEqual(["Cases", "Median", "Longest 1 in 10"]);
    expect(spanCells(age, { ...age.all, rest: false })).toEqual(["1,750", "1.2 years", "3.6 years"]);
  });
it("asks an age question after an age card (L2)", () => {
    const r = { status: "ok", code: "B12", name: "Vacant Buildings", groupBy: null, columns: ["AldermanicDistrict"], pair: { kind: "age", id: "vacant-age", things: "buildings", toWhat: "on the vacant list" } } as never;
    expect(spanFollowUps({ code: "B12" } as never, r)[0].question).toBe("How long have buildings been on the vacant list in Vacant Buildings (B12), by year? (pair vacant-age)");
  });
});

describe("pick-one buttons keep the measure that was asked (L2 review fix)", () => {
  const where = { code: "P24", name: "Citizen Complaints" };
  it("names the asked entry after a bad column or a value choice", () => {
    const bad = spanChoices({ code: "P24", pair: "complaint-open-age" }, { status: "bad-column", ...where, columns: ["Department"] });
    expect(bad[0].question).toBe("How long does it take in Citizen Complaints (P24), by Department? (pair complaint-open-age)");
    const pick = spanChoices({ code: "P24", pair: "complaint-open-age" }, { status: "choose", ...where, column: "Department", choices: ["Milwaukee Police Department"] });
    expect(pick[0].question).toBe("How long does it take in Citizen Complaints (P24), only Department Milwaukee Police Department? (pair complaint-open-age)");
  });
  it("keeps the split and period when asking which measure", () => {
    const c = spanChoices({ code: "P24", groupBy: "Department", from: "2024-01-01" }, { status: "choose-pair", ...where, pairs: [{ id: "complaint-close", name: "time to close" }, { id: "complaint-open-age", name: "time open so far" }] });
    expect(c.map((x) => x.question)).toEqual([
      "How long is the time to close in Citizen Complaints (P24), by Department, from 2024-01-01? (pair complaint-close)",
      "How long is the time open so far in Citizen Complaints (P24), by Department, from 2024-01-01? (pair complaint-open-age)",
    ]);
  });
});

describe("long times and the verb (L4)", () => {
  it("shows 365 days or more as years everywhere, shorter as days (review focus 4)", () => {
    expect(durationText(364, "days")).toBe("364 days");
    expect(durationText(365, "days")).toBe("1.0 years");
    expect(durationText(3065, "days")).toBe("8.4 years");
  });
  it("words a between pair with its verb, including the too-few sentence (review focus 3)", () => {
    const left = { ...r, groupBy: null, groups: [], pair: { ...r.pair, things: "employees who left", toWhat: "before leaving", verb: "had worked" }, all: { ...r.all, median: 1241, p90: 4400 } };
    expect(spanSummary(left as never)).toBe("Half of the employees who left measured had worked 3.4 years or less before leaving; 9 in 10 had worked 12.1 years or less.");
    expect(spanSummary({ ...left, all: { ...left.all, cases: 4 } } as never)).toBe("Too few employees who left were measured to say how long they had worked before leaving (4 measured).");
  });
  it("says too few, never a number, when a people-file's All row is withheld (review focus 1)", () => {
    expect(spanSummary({ ...r, groupBy: null, groups: [], all: { ...r.all, cases: 6, median: null, p90: null } } as never)).toMatch(/^Too few complaints were measured/);
  });
});

describe("tenure cards (L4 review)", () => {
  const left = { ...r, code: "C01", name: "City Employee Salary Data", columns: ["Department", "Job Title"], pair: { ...pair, id: "tenure-left", things: "employees who left", toWhat: "before leaving", verb: "had worked", openExpected: true, missing: "{n} employees are still with the City and aren't counted here." }, all: { ...r.all, cases: 991, open: 8066 } };
  it("doesn't warn that current employees 'have no end date' on a time-before-leaving card", () => {
    const n = spanNotes(left as never);
    expect(n.warning).toBeNull();
    expect(n.notes).toContain("8,066 employees are still with the City and aren't counted here.");
  });
  it("words a follow-up with the pair's verb and names the pair, and offers no year split on a people file", () => {
    const f = spanFollowUps({ code: "C01", groupBy: "Department" }, { ...left, namesPeople: true } as never);
    expect(f.map((x) => x.label)).toEqual(["BY JOB TITLE"]);
    expect(f[0].question).toBe("How long had employees who left worked before leaving in City Employee Salary Data (C01), by Job Title? (pair tenure-left)");
  });
});
