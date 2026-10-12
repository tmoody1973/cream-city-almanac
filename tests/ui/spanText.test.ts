import { describe, expect, it } from "vitest";
import { spanExport } from "../../ui/lib/cardExport";
import { spanChoices } from "../../ui/lib/refusalChoices";
import { spanFollowUps } from "../../ui/lib/nextQuestions";
import { durationText, spanNotes, spanRows, spanSummary, spanTitle } from "../../ui/lib/spanText";

const pair = { id: "complaint-close", name: "time to close", things: "complaints", toWhat: "to close", unit: "days" as const, missing: "{n} complaints aren't closed yet and aren't counted, so slow cases are under-counted.", caveat: "Dates are typed by hand in more than one format; a few can't be read.", from: "DateReported", to: "Date Closed" };
const r = {
  status: "ok" as const, code: "P24", name: "Citizen Complaints", pair, groupBy: "Department", overlap: false, period: "all records", filters: [], coverage: null, columns: ["Department", "Status"],
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
    expect(durationText(1478.4, "days")).toBe("1,478 days");
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
    expect(spanSummary({ ...r, groupBy: null, groups: [] })).toBe("Half of the complaints measured took 64 days or less to close; 9 in 10 took 400 days or less.");
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
    expect(f[0].question).toBe("How long did complaints take to close in Citizen Complaints (P24), by year?");
  });
  it("keeps the card's filters and period, and skips a column the card is already filtered to", () => {
    const f = spanFollowUps({ code: "P24", groupBy: "Department", from: "2024-01-01", filters: [{ column: "Status", values: ["Closed"] }] }, r);
    expect(f.map((x) => x.label)).toEqual(["BY YEAR"]);
    expect(f[0].question).toBe("How long did complaints take to close in Citizen Complaints (P24) where Status is Closed, from 2024-01-01, by year?");
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
