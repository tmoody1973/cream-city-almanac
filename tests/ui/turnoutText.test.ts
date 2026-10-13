import { describe, expect, it } from "vitest";
import { turnoutExport, turnoutFollowUps } from "../../ui/lib/turnoutText";

const r = {
  status: "ok" as const, title: "Milwaukee voter turnout · all elections · 2016–2022", groupBy: "election" as const,
  rows: [
    { label: "November 2016 general election (wards 1–250 of 327 only)", type: "general" as const, registered: 265664, ballots: 195901, turnout: 73.7, partial: true },
    { label: "April 2021 spring election", type: "spring" as const, registered: 325024, ballots: 48782, turnout: 15 },
  ],
  notes: ["Registered voters is the City's count on election day."],
  source: "From the City of Milwaukee's election results files (2016–2022), read by the Almanac.",
};
const ctx = { origin: "https://almanac.test", date: "October 13, 2026" };

describe("turnout card text (K4)", () => {
  it("exports rows, notes and source", () => {
    const e = turnoutExport(r, ctx);
    expect(e.title).toBe(r.title);
    expect(e.csv.head).toEqual(["Election", "Registered voters", "Ballots cast", "Turnout (%)"]);
    expect(e.csv.rows[1]).toEqual(["April 2021 spring election", 325024, 48782, 15]);
    expect(e.text.rows[0]).toEqual(["November 2016 general election (wards 1–250 of 327 only)", "265,664", "195,901", "73.7%"]);
    expect(e.notes).toEqual([...r.notes, r.source, "Exported from Cream City Almanac on October 13, 2026."]);
    expect(turnoutExport({ ...r, rows: [{ ...r.rows[1], turnout: null }] }, ctx).text.rows[0][3]).toBe("—");
  });
  it("offers like-with-like and the lowest wards of the newest election", () => {
    const f = turnoutFollowUps({}, r);
    expect(f.map((x) => x.label)).toEqual(["ONLY NOVEMBER ELECTIONS", "LOWEST-TURNOUT WARDS"]);
    expect(f[1].question).toBe("Which wards had the lowest turnout in the April 2021 spring election?");
  });
});
