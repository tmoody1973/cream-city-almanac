import { describe, expect, it } from "vitest";
import { summarize, type StoredElection } from "../../convex/lib/turnoutMath";

const el = (election: string, label: string, type: StoredElection["type"], extra: Partial<StoredElection> = {}): StoredElection =>
  ({ election, label, type, map: "2012", wards: 3, of: 327, partial: false, status: "read", ...extra });
const ELS = [
  el("2016-11", "November 2016 general election", "general", { partial: true, wards: 2 }),
  el("2018-04", "April 2018 spring election", "spring"),
  el("2020-11", "November 2020 general election", "general"),
  el("2022-08", "August 2022 partisan primary", "primary", { map: "2022", of: 354 }),
];
const W = (election: string, ward: number, registered: number, ballots: number) => ({ election, ward, registered, ballots });
const ROWS = [
  W("2016-11", 1, 1000, 700), W("2016-11", 2, 500, 300),
  W("2018-04", 1, 1000, 200), W("2018-04", 2, 500, 50), W("2018-04", 3, 20, 1),
  W("2020-11", 1, 1100, 900), W("2020-11", 2, 600, 400), W("2020-11", 3, 30, 29),
  W("2022-08", 1, 1200, 240), W("2022-08", 340, 0, 0), W("2022-08", 12, 800, 80),
];
const ok = (r: ReturnType<typeof summarize>) => { if (r.status !== "ok") throw new Error(JSON.stringify(r)); return r; };
const REG = "Registered voters is the City's count on election day.";
const MIX = "Turnout differs by type of election: November general elections draw far more voters than spring or primary ones, so compare like with like.";
const REDRAW = "Ward lines were redrawn in 2022, so a ward number before and after names a different area.";

describe("summarize (K4)", () => {
  it("gives citywide turnout per election, oldest first, with the partial label and the notes", () => {
    const r = ok(summarize(ROWS, ELS, {}));
    expect(r.rows.map((x) => [x.label, x.registered, x.ballots, x.turnout])).toEqual([
      ["November 2016 general election (wards 1–2 of 327 only)", 1500, 1000, 66.7],
      ["April 2018 spring election", 1520, 251, 16.5],
      ["November 2020 general election", 1730, 1329, 76.8],
      ["August 2022 partisan primary", 2000, 320, 16],
    ]);
    expect(r.notes).toEqual([REG, MIX, "The City's November 2016 general election file lists only 2 of the city's 327 wards, so its citywide figure undercounts."]);
    expect(r.source).toBe("From the City of Milwaukee's election results files (2016–2022), read by the Almanac.");
  });
  it("narrows by type and years; one type has no mixed-types note", () => {
    const r = ok(summarize(ROWS, ELS, { type: "general", from: 2018 }));
    expect(r.rows.map((x) => x.label)).toEqual(["November 2020 general election"]);
    expect(r.notes).toEqual([REG]);
    expect(r.title).toBe("Milwaukee voter turnout · 1 general election · November 2020 general election");
  });
  it("follows one ward across elections, with the redraw note across 2022 (review focus 3)", () => {
    const r = ok(summarize(ROWS, ELS, { ward: 1 }));
    expect(r.rows.map((x) => x.label)).toEqual(["November 2016 general election", "April 2018 spring election", "November 2020 general election", "August 2022 partisan primary"]);
    expect(r.notes).toContain(REDRAW);
    expect(r.title).toBe("Milwaukee voter turnout · 4 elections · 2016–2022 · ward 1"); // the count comes from code, never the AI (graded run)
    expect(summarize(ROWS, ELS, { ward: 340, to: 2021 })).toEqual({ status: "refused", reason: "Ward 340 isn't on the ward map of the elections asked (2016–2021: wards 1–327)." });
  });
  it("ranks one election's lowest wards, leaving out tiny wards and showing no turnout for 0 registered (review focus 2, 5)", () => {
    const r = ok(summarize(ROWS, ELS, { from: 2020, to: 2020, groupBy: "ward", order: "lowest" }));
    expect(r.rows.map((x) => [x.label, x.turnout])).toEqual([["Ward 2", 66.7], ["Ward 1", 81.8]]);
    expect(r.notes).toContain("Wards with fewer than 50 registered voters are left out of the ranking.");
    const z = ok(summarize(ROWS, ELS, { from: 2022, to: 2022, ward: 340 }));
    expect(z.rows[0]).toMatchObject({ registered: 0, ballots: 0, turnout: null });
  });
  it("refuses ward groups across elections, order without wards, bad years, and no data", () => {
    expect(summarize(ROWS, ELS, { groupBy: "ward" })).toEqual({ status: "refused", reason: "Ward lists are for one election at a time: pick one election, or ask for one ward across elections." });
    expect(summarize(ROWS, ELS, { order: "lowest" })).toEqual({ status: "refused", reason: "Lowest or highest wards need groupBy ward and one election." });
    expect(summarize(ROWS, ELS, { from: 2010, to: 2012 })).toEqual({ status: "refused", reason: "Turnout is available for elections from 2016 to 2022." });
    expect(summarize(ROWS, ELS, { from: 2020, to: 2016 })).toEqual({ status: "refused", reason: "Turnout is available for elections from 2016 to 2022." });
    expect(summarize([], [], {})).toEqual({ status: "refused", reason: "Turnout hasn't been built yet." });
  });
  it("names an election in range that couldn't be read", () => {
    const r = ok(summarize(ROWS, [...ELS, el("2019-04", "April 2019 spring election", "spring", { status: "failed" })], {}));
    expect(r.notes).toContain("The City's file for April 2019 spring election couldn't be read.");
  });
});

describe("summarize: review fixes (K4)", () => {
  it("still answers an election whose later re-read failed, from its earlier rows (review I-1)", () => {
    const els = ELS.map((e) => (e.election === "2020-11" ? { ...e, status: "failed" as const } : e));
    const r = ok(summarize(ROWS, els, { type: "general" }));
    expect(r.rows.map((x) => x.label)).toContain("November 2020 general election");
    expect(r.notes.some((n) => n.includes("couldn't be read"))).toBe(false);
  });
  it("labels a ward ranking from a partial file (review I-2)", () => {
    const r = ok(summarize(ROWS, ELS, { from: 2016, to: 2016, groupBy: "ward", order: "lowest" }));
    expect(r.notes).toContain("The City's November 2016 general election file lists only 2 of the city's 327 wards, so the other wards aren't ranked.");
  });
  it("says when a partial file doesn't list the asked ward (review I-3)", () => {
    const r = ok(summarize(ROWS, ELS, { ward: 3 }));
    expect(r.rows.map((x) => x.label)).toEqual(["April 2018 spring election", "November 2020 general election"]);
    expect(r.notes).toContain("The City's November 2016 general election file doesn't list ward 3.");
  });
  it("refuses a ward list and one ward together (review M-1)", () => {
    expect(summarize(ROWS, ELS, { from: 2020, to: 2020, groupBy: "ward", ward: 1 })).toEqual({ status: "refused", reason: "Ask for one ward across elections, or one election's ward list, not both." });
  });
});
