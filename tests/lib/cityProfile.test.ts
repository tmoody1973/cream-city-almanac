import { describe, expect, it } from "vitest";
import { assembleProfile, planProfile, profileSql } from "../../convex/lib/cityProfile";

const FIELDS = [
  { id: "Case_Number", type: "text" }, { id: "Incident_Date", type: "text" }, { id: "Police_District", type: "text" },
  { id: "Offense_All", type: "text" }, { id: "Location_All", type: "text" }, { id: "Address_Latitude", type: "numeric" },
];
describe("City column profiles", () => {
  const plan = planProfile(FIELDS);
  it("finds the date, district and category columns", () => {
    expect(plan).toMatchObject({ dateColumn: "Incident_Date", districtColumns: ["Police_District"], categoryColumns: ["Offense_All"], namesPeople: false });
  });
  it("flags datasets that name people", () => {
    expect(planProfile([{ id: "OWNER_NAME_1", type: "text" }, { id: "TAXKEY", type: "text" }]).namesPeople).toBe(true);
  });
  it("writes count, range and top-value queries with NULLIF date casts", () => {
    const q = profileSql("87843297-a6fa-46d4-ba5d-cb342fb2d3bb", plan);
    expect(q.count).toBe('SELECT COUNT(*) AS n FROM "87843297-a6fa-46d4-ba5d-cb342fb2d3bb"');
    expect(q.range).toContain(`MIN(NULLIF("Incident_Date",'')::timestamp)`);
    expect(q.tops.map((t) => t.column)).toEqual(["Police_District", "Offense_All"]);
    expect(q.tops[1].sql).toBe('SELECT "Offense_All" AS v, COUNT(*) AS n FROM "87843297-a6fa-46d4-ba5d-cb342fb2d3bb" GROUP BY "Offense_All" ORDER BY n DESC LIMIT 200');
  });
  it("assembles a profile, dropping empty values", () => {
    const p = assembleProfile("city:x", "rid", FIELDS, plan, { n: 3 }, { lo: "2024-01-01T00:00:00", hi: "2026-10-08T00:00:00" }, [
      { column: "Police_District", rows: [{ v: "6", n: 2 }, { v: "", n: 1 }] }, { column: "Offense_All", rows: [{ v: "240", n: 3 }] },
    ], 1000);
    expect(p).toMatchObject({ rowCount: 3, minDate: "2024-01-01", maxDate: "2026-10-08", categories: [{ column: "Police_District", values: [{ value: "6", count: 2 }] }, { column: "Offense_All", values: [{ value: "240", count: 3 }] }] });
    expect(p.signature).toBe("Address_Latitude,Case_Number,Incident_Date,Location_All,Offense_All,Police_District");
  });
});
