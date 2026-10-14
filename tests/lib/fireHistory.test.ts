import { describe, expect, it } from "vitest";
import { summarize, type StoredRow } from "../../convex/lib/fireHistory";

const span = (median: number) => ({ median, p90: median * 2, n: 100 });
const row = (year: number, group: "all" | "ems" | "other", over: Partial<StoredRow> = {}): StoredRow => ({
  year, group, calls: group === "all" ? 120 : group === "ems" ? 100 : 20, dispatch: span(1.5), arrive: span(5.9), unreadable: 1, backwards: 2,
  source: year >= 2024 ? "mfd" : "incident", partial: year === 2024 ? "from Feb 20" : year === 2026 ? "so far" : null, toMinute: [2015, 2016, 2017, 2019, 2020].includes(year), ...over,
});
const YEARS = [2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026];
const rows = YEARS.flatMap((y) => [row(y, "all"), row(y, "ems"), row(y, "other")]);
const types = YEARS.filter((y) => y <= 2023).flatMap((year) => [{ year, type: year === 2015 ? "ems" : "EMS", calls: 100 }, { year, type: "Auto Fire", calls: 5 }]);

describe("fireHistory summary (L3)", () => {
  it("refuses before the first refresh", () => {
    expect(summarize([], [], { measure: "calls" })).toEqual({ status: "refused", reason: "Fire Department history hasn't been built yet." });
  });
  it("gives calls per year 2015 to now, with the system-change, gap and so-far notes", () => {
    const r = summarize(rows, types, { measure: "calls" });
    if (r.status !== "ok") throw new Error(r.status);
    expect(r.title).toBe("Milwaukee Fire Department · calls · 2015–2026");
    expect(r.rows).toHaveLength(12);
    expect(r.rows[0]).toEqual({ year: 2015, calls: 120, median: null, p90: null, n: null, partial: null });
    expect(r.rows.find((x) => x.year === 2024)!.partial).toBe("from Feb 20");
    expect(r.notes).toEqual([
      "From 2024 the City publishes calls from a new system (MFD Calls for Service); years before and after are close but not identical.",
      "Jan 1 – Feb 19, 2024 isn't in either file, so 2024 is short.",
      "2026 so far.",
    ]);
    expect(r.types).toEqual(["EMS", "Auto Fire"]);
  });
  it("gives a time measure for EMS with the minute note and the unmeasured count", () => {
    const r = summarize(rows, types, { measure: "arrive", group: "ems", from: 2015, to: 2018 });
    if (r.status !== "ok") throw new Error(r.status);
    expect(r.title).toBe("Milwaukee Fire Department · time to arrive · EMS · 2015–2018");
    expect(r.rows[0]).toEqual({ year: 2015, calls: 100, median: 5.9, p90: 11.8, n: 100, partial: null });
    expect(r.notes).toEqual(["2015–2017, 2019 and 2020 record times to the minute, so their medians are whole minutes.", "12 records had unreadable times or times that run backwards and weren't measured."]);
  });
  it("matches a call type in any case and cuts the range at 2023 (review focus 2, 5)", () => {
    const r = summarize(rows, types, { measure: "calls", type: " auto fire ", group: "ems" });
    if (r.status !== "ok") throw new Error(r.status);
    expect(r.type).toBe("Auto Fire");
    expect(r.group).toBe("all");
    expect(r.title).toBe("Milwaukee Fire Department · Auto Fire calls · 2015–2023");
    expect(r.rows.map((x) => x.calls)).toEqual(Array(9).fill(5));
    expect(r.notes).toContain("Call types end in 2023; the new system has only broad types.");
    const ems = summarize(rows, types, { measure: "calls", type: "EMS", from: 2015, to: 2016 });
    if (ems.status !== "ok") throw new Error(ems.status);
    expect(ems.rows.map((x) => x.calls)).toEqual([100, 100]);
  });
  it("offers the top types for an unknown type, and refuses a time measure by type (review focus 5)", () => {
    expect(summarize(rows, types, { measure: "calls", type: "Dragon" })).toEqual({ status: "choose", asked: "Dragon", choices: ["EMS", "Auto Fire"] });
    expect(summarize(rows, types, { measure: "dispatch", type: "Auto Fire" })).toEqual({ status: "refused", reason: "Response times are by EMS versus other calls, not by call type." });
  });
  it("clamps a range that runs past the data, and refuses one entirely outside it (review focus 3)", () => {
    const r = summarize(rows, types, { measure: "calls", from: 2010, to: 2016 });
    if (r.status !== "ok") throw new Error(r.status);
    expect(r.rows.map((x) => x.year)).toEqual([2015, 2016]);
    expect(summarize(rows, types, { measure: "calls", from: 2030 })).toEqual({ status: "refused", reason: "No Fire Department years in that range; the data runs 2015–2026." });
  });
  it("says which years in the range have no stored figures (review focus 1)", () => {
    const r = summarize(rows.filter((x) => x.year !== 2018), types, { measure: "calls", from: 2015, to: 2020 });
    if (r.status !== "ok") throw new Error(r.status);
    expect(r.rows.map((x) => x.year)).toEqual([2015, 2016, 2017, 2019, 2020]);
    expect(r.notes).toContain("No figures are stored for 2018.");
  });
  it("names expected years missing at the edges of the range, from 2015–2023 and every year the refresh tried (review #1)", () => {
    const r = summarize(rows.filter((x) => x.year !== 2015 && x.year < 2024), types, { measure: "calls" }, [2024, 2025, 2026]);
    if (r.status !== "ok") throw new Error(r.status);
    expect(r.rows[0].year).toBe(2016);
    expect(r.notes).toContain("No figures are stored for 2015, 2024, 2025, 2026.");
  });
  it("shows no count, not 0, for years a call type didn't exist (review #2)", () => {
    const r = summarize(rows, types.filter((x) => !(x.type === "Auto Fire" && x.year < 2017)), { measure: "calls", type: "Auto Fire" });
    if (r.status !== "ok") throw new Error(r.status);
    expect(r.rows.slice(0, 3).map((x) => x.calls)).toEqual([null, null, 5]);
    expect(r.notes).toContain("Auto Fire isn't a call type in 2015, 2016.");
  });
});
