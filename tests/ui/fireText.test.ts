import { describe, expect, it } from "vitest";
import { fireCells, fireChoices, fireExport, fireFollowUps, fireHead, yearLabel, type FireOk } from "../../ui/lib/fireText";

const base: FireOk = {
  status: "ok", title: "Milwaukee Fire Department · time to arrive · 2023–2024", measure: "arrive", group: "all", type: null,
  rows: [{ year: 2023, calls: 121073, median: 5.93, p90: 9.1, n: 118000, partial: null }, { year: 2024, calls: 119483, median: 6.1, p90: 9.4, n: 117000, partial: "from Feb 20" }],
  notes: ["Jan 1 – Feb 19, 2024 isn't in either file, so 2024 is short."], source: "City of Milwaukee: Fire Incident Detail (2015–2023) and MFD Calls for Service Detail (2024 on).", types: ["EMS", "Alarm Sounding"],
};
const ctx = { origin: "https://x", date: "October 14, 2026" };

describe("Fire history card words (L3)", () => {
  it("labels partial years (review focus 4)", () => {
    expect(yearLabel(base.rows[1])).toBe("2024 (from Feb 20)");
    expect(yearLabel(base.rows[0])).toBe("2023");
  });
  it("shows times as minutes and calls as counts", () => {
    expect(fireHead(base)).toEqual(["Year", "Calls measured", "Median", "9 in 10"]);
    expect(fireCells(base, base.rows[0])).toEqual(["2023", "118,000", "5.9 minutes", "9.1 minutes"]);
    const calls = { ...base, measure: "calls" as const };
    expect(fireHead(calls)).toEqual(["Year", "Calls"]);
    expect(fireCells(calls, base.rows[1])).toEqual(["2024 (from Feb 20)", "119,483"]);
  });
  it("exports raw values with the partial-year column, the notes and the source", () => {
    const e = fireExport(base, ctx);
    expect(e.csv.head).toEqual(["Year", "Partial year", "Calls", "Calls measured", "Median (minutes)", "9 in 10 (minutes)"]);
    expect(e.csv.rows[1]).toEqual([2024, "from Feb 20", 119483, 117000, 6.1, 9.4]);
    expect(e.notes).toEqual([...base.notes, base.source, "Exported from Cream City Almanac on October 14, 2026."]);
    expect(e.filename).toBe("almanac_fire_arrive_all");
  });
  it("offers EMS only and the other time; calls offer a call type", () => {
    expect(fireFollowUps(base).map((f) => f.label)).toEqual(["EMS ONLY", "TIME TO DISPATCH"]);
    expect(fireFollowUps({ ...base, group: "ems" })[0].label).toBe("ALL CALLS");
    const calls = fireFollowUps({ ...base, measure: "calls" });
    expect(calls.map((f) => f.label)).toEqual(["BY CALL TYPE", "TIME TO ARRIVE"]);
    expect(calls[0].question).toBe("How many Alarm Sounding calls did the Fire Department get each year, 2015 to 2023?");
  });
  it("turns choose into pick-one buttons", () => {
    expect(fireChoices({ status: "choose", asked: "Dragon", choices: ["EMS", "Auto Fire"] })[1]).toEqual({ label: "AUTO FIRE", question: "How many Auto Fire calls did the Fire Department get each year, 2015 to 2023?" });
  });
});
