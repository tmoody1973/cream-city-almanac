import { describe, expect, it } from "vitest";
import type { CityProfile } from "../../convex/lib/cityProfile";
import { buildCount } from "../../convex/lib/citySql";

const RID = "87843297-a6fa-46d4-ba5d-cb342fb2d3bb";
const P: CityProfile = {
  familyKey: "city:nibrs-crime-data", resourceId: RID, columns: [], dateColumn: "Incident_Date", districtColumns: ["Police_District"],
  categories: [
    { column: "Police_District", values: [{ value: "6", count: 500 }, { value: "7", count: 400 }] },
    { column: "Offense_All", values: [{ value: "240", count: 13619 }, { value: "120", count: 3115 }, { value: "23H", count: 3759 }, { value: "13A", count: 9 }], multi: true },
    { column: "Weapon_Used_All", values: [{ value: "FIREARM", count: 9778 }, { value: "PERSONAL WEAPON", count: 15418 }], multi: true },
    { column: "TITLE", values: [{ value: "Children's Services", count: 3 }] },
  ],
  rowCount: 110461, minDate: "2024-01-01", maxDate: "2026-10-08", namesPeople: false, signature: "", updatedAt: 0,
};
const TODAY = "2026-10-09";

describe("count query builder", () => {
  it("defaults to the last 12 months and counts within them", () => {
    const b = buildCount(P, {}, TODAY);
    if (!b.ok) throw new Error("expected ok");
    expect(b.totalSql).toBe(`SELECT COUNT(*) AS n FROM "${RID}" WHERE "Incident_Date" >= '2025-10-09' AND "Incident_Date" < '2026-10-10'`);
    expect(b.period).toBe("Oct 9, 2025 – Oct 9, 2026 (last 12 months)");
    expect(b.futureSql).toContain(`"Incident_Date" > '2026-10-10'`);
  });
  it("filters by district and by offense words", () => {
    const b = buildCount(P, { from: "2026-01-01", filters: [{ column: "police_district", values: ["6"] }, { column: "Offense_All", values: ["robbery"] }] }, TODAY);
    if (!b.ok) throw new Error("expected ok");
    expect(b.totalSql).toContain(`AND "Police_District" IN ('6') AND (';' || "Offense_All" || ';' LIKE '%;120;%')`);
    expect(b.filterLabels).toEqual(["Police district 6", "Robbery"]);
  });
  it("keeps the same non-date filters on the future query", () => {
    const b = buildCount(P, { filters: [{ column: "Police_District", values: ["6"] }] }, TODAY);
    if (!b.ok) throw new Error("expected ok");
    expect(b.futureSql).toBe(`SELECT COUNT(*) AS n FROM "${RID}" WHERE "Incident_Date" > '2026-10-10' AND "Police_District" IN ('6')`);
  });
  it("counts an incident whose offenses include the code, not only single-offense incidents (C1)", () => {
    const b = buildCount(P, { filters: [{ column: "Offense_All", values: ["120", "13A"] }] }, TODAY);
    if (!b.ok) throw new Error("expected ok");
    expect(b.totalSql).toContain(`AND (';' || "Offense_All" || ';' LIKE '%;120;%' OR ';' || "Offense_All" || ';' LIKE '%;13A;%')`);
    expect(b.totalSql).not.toContain(" IN (");
  });
  it("lets only code-shaped values into a LIKE pattern; others ask to choose (C1)", () => {
    expect(buildCount(P, { filters: [{ column: "Weapon_Used_All", values: ["firearm"] }] }, TODAY)).toMatchObject({ ok: false, status: "choose", column: "Weapon_Used_All", asked: "firearm", choices: [] });
    const evil = { ...P, categories: [{ column: "Offense_All", values: [{ value: "1%", count: 1 }, { value: "120", count: 1 }], multi: true }] };
    expect(buildCount(evil, { filters: [{ column: "Offense_All", values: ["1%"] }] }, TODAY)).toMatchObject({ ok: false, status: "choose", choices: ["Robbery"] });
  });
  it("offers choices for a value it doesn't know", () => {
    expect(buildCount(P, { filters: [{ column: "Police_District", values: ["99"] }] }, TODAY)).toMatchObject({ ok: false, status: "choose", column: "Police_District", choices: ["6", "7"] });
  });
  it("never silently widens: an empty values list asks to choose", () => {
    expect(buildCount(P, { filters: [{ column: "Police_District", values: [] }] }, TODAY)).toMatchObject({ ok: false, status: "choose", column: "Police_District", asked: "", choices: ["6", "7"] });
  });
  it("never silently widens: a whitespace-only value asks to choose", () => {
    expect(buildCount(P, { filters: [{ column: "Offense_All", values: ["  "] }] }, TODAY)).toMatchObject({ ok: false, status: "choose", column: "Offense_All" });
    const b = buildCount(P, { filters: [{ column: "Police_District", values: ["6", " "] }] }, TODAY);
    expect(b).toMatchObject({ ok: false, status: "choose", column: "Police_District" });
  });
  it("refuses a column that isn't on the menu", () => {
    expect(buildCount(P, { filters: [{ column: "Case_Number", values: ["x"] }] }, TODAY)).toMatchObject({ ok: false, status: "bad-column" });
  });
  it("escapes quotes in a profiled value", () => {
    const b = buildCount(P, { filters: [{ column: "TITLE", values: ["children's services"] }] }, TODAY);
    if (!b.ok) throw new Error("expected ok");
    expect(b.totalSql).toContain(`"TITLE" IN ('Children''s Services')`);
  });
  it("clamps a future to-date to today", () => {
    const b = buildCount(P, { from: "2026-01-01", to: "2027-06-01" }, TODAY);
    if (!b.ok) throw new Error("expected ok");
    expect(b.totalSql).toContain(`< '2026-10-10'`);
  });
  it("groups by month, year or a column, capped", () => {
    const m = buildCount(P, { groupBy: "month" }, TODAY);
    const y = buildCount(P, { groupBy: "year" }, TODAY);
    const c = buildCount(P, { groupBy: "Offense_All" }, TODAY);
    if (!m.ok || !y.ok || !c.ok) throw new Error("expected ok");
    expect(m.groupSql).toContain(`SELECT left("Incident_Date", 7) AS g, COUNT(*) AS n`);
    expect(m.groupSql).toContain("GROUP BY g ORDER BY g DESC LIMIT 24");
    expect(m.groupLabel).toBe("month");
    expect(y.groupSql).toContain(`SELECT left("Incident_Date", 4) AS g, COUNT(*) AS n`);
    expect(c.groupSql).toContain(`SELECT unnest(string_to_array("Offense_All", ';')) AS g, COUNT(*) AS n`);
    expect(c.groupSql).toContain("GROUP BY g ORDER BY n DESC LIMIT 24");
    const d = buildCount(P, { groupBy: "Police_District" }, TODAY);
    if (!d.ok) throw new Error("expected ok");
    expect(d.groupSql).toContain(`SELECT "Police_District" AS g, COUNT(*) AS n`);
    expect([m.overlap, c.overlap, d.overlap]).toEqual([false, true, false]);
  });
  it("counts a dataset without a date column as all records", () => {
    const b = buildCount({ ...P, dateColumn: null }, {}, TODAY);
    if (!b.ok) throw new Error("expected ok");
    expect(b.totalSql).toBe(`SELECT COUNT(*) AS n FROM "${RID}"`);
    expect(b.period).toBe("all records");
    expect(b.futureSql).toBeNull();
  });
  it("refuses a resource id that isn't a CKAN id", () => {
    expect(() => buildCount({ ...P, resourceId: 'x"; DROP' }, {}, TODAY)).toThrow();
  });
  it("defaults from to a year before a given to-date", () => {
    const b = buildCount(P, { to: "2020-01-01" }, TODAY);
    if (!b.ok) throw new Error("expected ok");
    expect(b.totalSql).toContain(`"Incident_Date" >= '2019-01-01' AND "Incident_Date" < '2020-01-02'`);
    expect(b.period).toBe("Jan 1, 2019 – Jan 1, 2020");
    expect(b.futureSql).toBeNull();
  });
  it("refuses a from-date after the to-date", () => {
    expect(buildCount(P, { from: "2026-09-01", to: "2026-01-01" }, TODAY)).toMatchObject({ ok: false, status: "bad-dates", from: "2026-09-01", to: "2026-01-01" });
  });
  it("refuses a future from-date (to is clamped to today)", () => {
    expect(buildCount(P, { from: "2027-01-01" }, TODAY)).toMatchObject({ ok: false, status: "bad-dates", from: "2027-01-01", to: "2026-10-09" });
  });
  it("treats impossible calendar dates as absent and never throws", () => {
    for (const bad of ["2025-13-45", "2025-02-30", "2026-13-01"]) {
      const b = buildCount(P, { from: bad, to: bad }, TODAY);
      if (!b.ok) throw new Error("expected ok");
      expect(b.period).toBe("Oct 9, 2025 – Oct 9, 2026 (last 12 months)");
    }
  });
  it("never emits NULLIF or :: casts (the City refuses them)", () => {
    const shapes = [
      {}, { groupBy: "month" }, { groupBy: "year" }, { groupBy: "Offense_All" },
      { from: "2026-01-01", to: "2026-03-01", filters: [{ column: "Police_District", values: ["6"] }, { column: "Offense_All", values: ["robbery"] }], groupBy: "month" },
    ];
    for (const a of shapes) {
      const b = buildCount(P, a, TODAY);
      if (!b.ok) throw new Error("expected ok");
      for (const sql of [b.totalSql, b.groupSql, b.futureSql]) {
        if (sql) { expect(sql).not.toContain("NULLIF"); expect(sql).not.toContain("::"); }
      }
    }
  });
});
