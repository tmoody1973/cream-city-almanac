import { describe, expect, it } from "vitest";
import { requests311Export, requests311FollowUps, type Requests311Ok } from "../../ui/lib/requests311Text";

const r: Requests311Ok = {
  status: "ok", place: { name: "Arlington Heights", kind: "hood", tracts: [], dycuNote: null }, types: ["Potholes", "Pothole in Alley"],
  from: 2026, to: 2026, total: { requests: 5, closed: 5, medianDays: 8 }, city: { requests: 55, closed: 45, medianDays: 2 }, rows: [],
  unplaced: { noAddress: 6, noMatch: 1, outside: 2 }, missing: [], counted: Date.UTC(2026, 9, 20), caveat: "311 dates have no time of day, so a request closed the same day counts as 0 days.",
};
const ctx = { origin: "https://www.creamcityalmanac.app", date: "Oct 20, 2026" };

describe("311 card text", () => {
  it("exports the place next to the city", () => {
    const e = requests311Export(r, ctx);
    expect(e.text.head).toEqual(["", "Arlington Heights", "City"]);
    expect(e.text.rows.map((x) => x[0])).toEqual(["Requests", "Closed", "Median days to close"]);
    expect(e.csv.rows[0]).toEqual(["Requests", 5, 55]);
    expect(e.notes.join(" ")).toMatch(/9 requests couldn't be placed/);
    expect(e.notes).toContain(r.caveat);
  });
  it("titles an answer whose types are part of a group with the group's word (review: Critical 1)", () => {
    const e = requests311Export({ ...r, types: ["Potholes", "Pothole"] }, ctx);
    expect(e.title).toBe("Pothole requests in Arlington Heights, 2026");
  });
  it("says which years in the range the City's files don't hold", () => {
    expect(requests311Export({ ...r, from: 2025, to: 2026, missing: [2025] }, ctx).notes.join(" ")).toMatch(/No 311 counts for 2025/);
  });
  it("offers by year and the other two type groups", () => {
    const f = requests311FollowUps(r);
    expect(f.map((x) => x.label)).toEqual(["BY YEAR", "STREETLIGHTS", "DUMPING"]);
    expect(f[1].question).toMatch(/streetlight requests in Arlington Heights/i);
  });
});
