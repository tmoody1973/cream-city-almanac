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
    const b = buildCount({ ...P, minDate: "2010-01-01" }, { to: "2020-01-01" }, TODAY);
    if (!b.ok) throw new Error("expected ok");
    expect(b.totalSql).toContain(`"Incident_Date" >= '2019-01-01' AND "Incident_Date" < '2020-01-02'`);
    expect(b.period).toBe("Jan 1, 2019 – Jan 1, 2020");
    expect(b.futureSql).toBeNull();
  });
  it("names the column it dates by and the data's coverage (C2, I2)", () => {
    const b = buildCount(P, {}, TODAY);
    if (!b.ok) throw new Error("expected ok");
    expect(b).toMatchObject({ dateColumn: "Incident_Date", coverage: "Jan 1, 2024 – Oct 9, 2026" });
    const none = buildCount({ ...P, dateColumn: null }, {}, TODAY);
    expect(none).toMatchObject({ ok: true, dateColumn: null, coverage: null });
  });
  it("says a period entirely outside the data's coverage is outside it, with no query (C2)", () => {
    expect(buildCount(P, { from: "2019-01-01", to: "2020-01-01" }, TODAY)).toEqual({ ok: false, status: "outside-coverage", coverage: "Jan 1, 2024 – Oct 9, 2026" });
    // A static dataset that ended in 2021: its coverage stops at its last record, not today.
    const ended = { ...P, minDate: "2019-01-01", maxDate: "2021-12-31", updatedAt: Date.parse("2026-10-05T12:00:00Z") };
    expect(buildCount(ended, { from: "2023-01-01" }, TODAY)).toEqual({ ok: false, status: "outside-coverage", coverage: "Jan 1, 2019 – Dec 31, 2021" });
  });
  it("clamps a period that overlaps the coverage, and says so (C2)", () => {
    const b = buildCount(P, { from: "2023-06-01", to: "2024-03-31" }, TODAY);
    if (!b.ok) throw new Error("expected ok");
    expect(b.totalSql).toContain(`"Incident_Date" >= '2024-01-01' AND "Incident_Date" < '2024-04-01'`);
    expect(b.period).toBe("Jan 1, 2024 – Mar 31, 2024 (clamped to the data's range)");
    const ended = { ...P, minDate: "2019-01-01", maxDate: "2021-12-31", updatedAt: Date.parse("2026-10-05T12:00:00Z") };
    const late = buildCount(ended, { from: "2021-06-01" }, TODAY);
    if (!late.ok) throw new Error("expected ok");
    expect(late.totalSql).toContain(`"Incident_Date" >= '2021-06-01' AND "Incident_Date" < '2022-01-01'`);
    expect(late.period).toBe("Jun 1, 2021 – Dec 31, 2021 (clamped to the data's range)");
    expect(late.futureSql).toBeNull();
    const latest = buildCount(ended, {}, TODAY);
    if (!latest.ok) throw new Error("expected ok");
    expect(latest.period).toBe("Dec 31, 2020 – Dec 31, 2021 (the data's latest 12 months)");
  });
  it("refuses a from-date after the to-date", () => {
    expect(buildCount(P, { from: "2026-09-01", to: "2026-01-01" }, TODAY)).toMatchObject({ ok: false, status: "bad-dates", from: "2026-09-01", to: "2026-01-01" });
  });
  it("refuses a future from-date (to is clamped to today)", () => {
    expect(buildCount(P, { from: "2027-01-01" }, TODAY)).toMatchObject({ ok: false, status: "bad-dates", from: "2027-01-01", to: "2026-10-09" });
  });
  it("refuses a malformed or impossible date instead of swapping in the default window (m3)", () => {
    for (const bad of ["2025-13-45", "2025-02-30", "2026-13-01", "10/01/2026", "last week"]) {
      expect(buildCount(P, { from: bad }, TODAY), bad).toMatchObject({ ok: false, status: "bad-dates", from: bad });
      expect(buildCount(P, { to: bad }, TODAY), bad).toMatchObject({ ok: false, status: "bad-dates", to: bad });
    }
    const absent = buildCount(P, { from: undefined, to: "" }, TODAY);
    if (!absent.ok) throw new Error("expected ok");
    expect(absent.period).toBe("Oct 9, 2025 – Oct 9, 2026 (last 12 months)");
  });
  it("refuses month or year groups on a dataset without a date column (m2)", () => {
    for (const groupBy of ["month", "year"]) {
      expect(buildCount({ ...P, dateColumn: null }, { groupBy }, TODAY)).toMatchObject({ ok: false, status: "bad-column", column: groupBy, columns: ["Police_District", "Offense_All", "Weapon_Used_All", "TITLE"] });
    }
  });
  it("asks which offense when the words match more than five codes (m4)", () => {
    const wide = { ...P, categories: [{ column: "Offense_All", values: ["23D", "23E", "23F", "23G", "240", "26F", "120"].map((value) => ({ value, count: 1 })), multi: true }] };
    const b = buildCount(wide, { filters: [{ column: "Offense_All", values: ["theft"] }] }, TODAY);
    expect(b).toMatchObject({ ok: false, status: "choose", column: "Offense_All", asked: "theft" });
    if (b.ok || b.status !== "choose") throw new Error("expected choose");
    expect([...b.choices].sort()).toEqual(["Theft From Building", "Theft From Coin-Operated Machine or Device", "Theft From Motor Vehicle", "Theft of Motor Vehicle Parts or Accessories", "Motor Vehicle Theft", "Identity Theft"].sort());
    expect(buildCount(wide, { filters: [{ column: "Offense_All", values: ["motor vehicle"] }] }, TODAY)).toMatchObject({ ok: true });
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

describe("neighborhood rectangle", () => {
  const area = { minLat: 43.06, maxLat: 43.08, minLon: -87.92, maxLon: -87.9 };
  const located = { ...P, latColumn: "Address_Latitude", lonColumn: "Address_Longitude" };
  const guard = (c: string) => `(CASE WHEN "${c}" ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN "${c}"::float END)`;
  it("adds a guarded rectangle and selects only coordinates and the group", () => {
    const b = buildCount(located, { from: "2026-01-01", groupBy: "month" }, "2026-10-10", area);
    if (!b.ok) throw new Error(JSON.stringify(b));
    expect(b.points!.sql).toContain(`${guard("Address_Latitude")} BETWEEN 43.06 AND 43.08 AND ${guard("Address_Longitude")} BETWEEN -87.92 AND -87.9`);
    expect(b.points!.sql).toMatch(/^SELECT \(CASE WHEN .* AS lat, \(CASE WHEN .* AS lon, left\("Incident_Date", 7\) AS g FROM /);
    expect(b.points!.sql).toMatch(/ LIMIT 32000$/);
    expect(b.points!.missingSql).toContain(`("Address_Latitude" IS NULL OR "Address_Longitude" IS NULL OR NOT ("Address_Latitude" ~ '^-?[0-9]+(\\.[0-9]+)?$' AND "Address_Longitude" ~ '^-?[0-9]+(\\.[0-9]+)?$'))`);
    expect(b.points!.sql).not.toContain("Case_Number");
  });
  it("has no points query without an area, and refuses an area for a dataset without locations", () => {
    const b = buildCount(located, {}, "2026-10-10");
    expect(b.ok && b.points).toBeNull();
    expect(buildCount(P, {}, "2026-10-10", area)).toEqual({ ok: false, status: "no-locations" });
  });
  it("refuses a rectangle that isn't four finite numbers", () => {
    expect(() => buildCount(located, {}, "2026-10-10", { ...area, minLat: Number.NaN })).toThrow();
  });
});
