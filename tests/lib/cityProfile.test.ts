import { describe, expect, it } from "vitest";
import { assembleProfile, isMultiValued, planProfile, profileSql } from "../../convex/lib/cityProfile";

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
  it("flags name columns and never counts by them (I1)", () => {
    for (const id of ["LICENSEE", "Operator", "Call_Taker", "Dispatcher", "Changed By", "IncidentPersonID", "APPLICANT", "Agent", "CONTACT", "OFFICER", "OWNER"]) {
      const p = planProfile([{ id, type: "text" }, { id: "STATUS", type: "text" }]);
      expect(p.namesPeople, id).toBe(true);
      expect(p.categoryColumns, id).toEqual(["STATUS"]);
      expect(p.districtColumns, id).toEqual([]);
    }
  });
  it("keeps ID-like columns off the category menu (r1)", () => {
    const p = planProfile(["TAX_NBR", "PERMIT_NO", "PermitID", "OBJECTID", "ID_CODE", "parcel_id", "TYPE"].map((id) => ({ id, type: "text" })));
    expect(p.categoryColumns).toEqual(["TYPE"]);
  });
  it("never picks an expiry or edit date as the date column (I2)", () => {
    for (const id of ["EXP_DATE", "EXPIRE_DATE", "UPD_DATE", "DateEdited", "LAST_DATE", "Changed_Date", "Incident_Last_Edited"]) {
      expect(planProfile([{ id, type: "text" }]).dateColumn, id).toBeNull();
    }
    expect(planProfile([{ id: "EXP_DATE", type: "text" }, { id: "PERMIT_DATE", type: "text" }]).dateColumn).toBe("PERMIT_DATE");
  });
  it("writes count, range and top-value queries that read dates as ISO text", () => {
    const q = profileSql("87843297-a6fa-46d4-ba5d-cb342fb2d3bb", plan);
    expect(q.count).toBe('SELECT COUNT(*) AS n FROM "87843297-a6fa-46d4-ba5d-cb342fb2d3bb"');
    expect(q.range).toBe(`SELECT MIN("Incident_Date") AS lo, MAX("Incident_Date") AS hi FROM "87843297-a6fa-46d4-ba5d-cb342fb2d3bb" WHERE "Incident_Date" <> ''`);
    for (const sql of [q.count, q.range, ...q.tops.map((t) => t.sql)]) expect(sql).not.toMatch(/NULLIF|::/);
    expect(q.tops.map((t) => t.column)).toEqual(["Police_District", "Offense_All"]);
    expect(q.tops[1].sql).toBe('SELECT "Offense_All" AS v, COUNT(*) AS n FROM "87843297-a6fa-46d4-ba5d-cb342fb2d3bb" GROUP BY "Offense_All" ORDER BY n DESC LIMIT 200');
  });
  it("assembles a profile, dropping empty values", () => {
    const p = assembleProfile("city:x", "rid", FIELDS, plan, { n: 3 }, { lo: "2024-01-01T00:00:00", hi: "2026-10-08T00:00:00" }, [
      { column: "Police_District", rows: [{ v: "6", n: 2 }, { v: "", n: 1 }] }, { column: "Offense_All", rows: [{ v: "240", n: 3 }] },
    ], 1000);
    expect(p).toMatchObject({ rowCount: 3, minDate: "2024-01-01", maxDate: "2026-10-08", categories: [{ column: "Police_District", values: [{ value: "6", count: 2 }] }, { column: "Offense_All", values: [{ value: "240", count: 3 }] }] });
    expect(p.dateColumn).toBe("Incident_Date");
    expect(p.signature).toBe("Address_Latitude,Case_Number,Incident_Date,Location_All,Offense_All,Police_District");
  });
  it("has an unnest query to profile a ';'-separated column by single codes (C1)", () => {
    const q = profileSql("87843297-a6fa-46d4-ba5d-cb342fb2d3bb", plan);
    expect(q.tops[1].multiSql).toBe(`SELECT unnest(string_to_array("Offense_All", ';')) AS v, COUNT(*) AS n FROM "87843297-a6fa-46d4-ba5d-cb342fb2d3bb" GROUP BY v ORDER BY n DESC LIMIT 200`);
    expect(isMultiValued([{ v: "240", n: 1 }, { v: "13A;120", n: 1 }])).toBe(true);
    expect(isMultiValued([{ v: "240", n: 1 }, { v: null, n: 1 }])).toBe(false);
  });
  it("marks a multi-valued category in the assembled profile (C1)", () => {
    const p = assembleProfile("city:x", "rid", FIELDS, plan, { n: 3 }, undefined, [
      { column: "Police_District", rows: [{ v: "6", n: 2 }] }, { column: "Offense_All", rows: [{ v: "13A", n: 2 }, { v: "120", n: 1 }], multi: true },
    ], 1000);
    expect(p.categories[0]).not.toHaveProperty("multi");
    expect(p.categories[1]).toEqual({ column: "Offense_All", values: [{ value: "13A", count: 2 }, { value: "120", count: 1 }], multi: true });
  });
  it("drops the date column when the range is not ISO text", () => {
    const p = assembleProfile("city:x", "rid", FIELDS, plan, { n: 3 }, { lo: "10/08/2026", hi: "10/09/2026" }, [], 1000);
    expect(p).toMatchObject({ dateColumn: null, minDate: null, maxDate: null });
    const none = assembleProfile("city:x", "rid", FIELDS, plan, { n: 3 }, { lo: null, hi: null }, [], 1000);
    expect(none).toMatchObject({ dateColumn: null, minDate: null, maxDate: null });
  });
});

describe("point columns", () => {
  const f = (...ids: string[]) => ids.map((id) => ({ id, type: "text" }));
  it("finds latitude and longitude columns by name", () => {
    expect(planProfile(f("Case_Number", "Address_Latitude", "Address_Longitude"))).toMatchObject({ latColumn: "Address_Latitude", lonColumn: "Address_Longitude" });
    expect(planProfile(f("latitude", "longitude"))).toMatchObject({ latColumn: "latitude", lonColumn: "longitude" });
    expect(planProfile(f("X", "Y"))).toMatchObject({ latColumn: null, lonColumn: null });
    expect(planProfile(f("Latitude"))).toMatchObject({ latColumn: null, lonColumn: null });
  });
  it("samples non-null pairs", () => {
    expect(profileSql("87843297-a6fa-46d4-ba5d-cb342fb2d3bb", planProfile(f("lat", "lon"))).points).toBe(
      `SELECT "lat" AS lat, "lon" AS lon FROM "87843297-a6fa-46d4-ba5d-cb342fb2d3bb" WHERE "lat" IS NOT NULL AND "lon" IS NOT NULL AND "lat" <> '' AND "lon" <> '' LIMIT 50`,
    );
  });
  it("keeps the columns only when at least 90% of the sample is in Milwaukee", () => {
    const plan = planProfile(f("lat", "lon"));
    const at = (lat: string, lon: string) => ({ lat, lon });
    const good = Array.from({ length: 10 }, () => at("43.05", "-87.95"));
    type Plan = ReturnType<typeof planProfile>;
    const base: [string, string, { id: string; type: string }[], Plan, { n: number }, undefined, never[], number] =
      ["fam", "87843297-a6fa-46d4-ba5d-cb342fb2d3bb", f("lat", "lon"), plan, { n: 10 }, undefined, [], 0];
    expect(assembleProfile(...base, good)).toMatchObject({ latColumn: "lat", lonColumn: "lon" });
    expect(assembleProfile(...base, [...good.slice(0, 8), at("0", "0"), at("bad", "x")])).toMatchObject({ latColumn: null, lonColumn: null });
    expect(assembleProfile(...base, [])).toMatchObject({ latColumn: null, lonColumn: null });
  });
});
