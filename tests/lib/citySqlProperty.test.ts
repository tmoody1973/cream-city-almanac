import { describe, expect, it } from "vitest";
import { MPROP_RID, withOverrides, type CityProfile } from "../../convex/lib/cityProfile";
import { buildCount } from "../../convex/lib/citySql";

const stored: CityProfile = {
  familyKey: "city:master-property-file-mprop", resourceId: MPROP_RID, columns: [], dateColumn: "CONVEY_DATE", districtColumns: [],
  categories: [
    { column: "YR_ASSMT", values: [{ value: "2026", count: 159555 }, { value: "2025", count: 394 }] },
    { column: "STREET", values: [{ value: "15TH", count: 1926 }] },
    { column: "SDIR", values: [{ value: "N", count: 74208 }] },
  ],
  rowCount: 159949, minDate: "1900-01-01", maxDate: "2026-09-30", namesPeople: true, signature: "s", updatedAt: 0,
};
const P = withOverrides(stored);
const today = "2026-10-11";

describe("counting the property file", () => {
  it("counts the current assessment, not the last 12 months of sales, when no dates are asked", () => {
    const b = buildCount(P, {}, today);
    if (!b.ok) throw new Error(JSON.stringify(b));
    expect(b.totalSql).toContain(`"YR_ASSMT" = '2026'`);
    expect(b.totalSql).not.toContain("CONVEY_DATE");
    expect(b.period).toBe("2026 assessment");
    expect(b.futureSql).toBeNull();
  });
  it("filters by last sale date only when dates are asked, and says so", () => {
    const b = buildCount(P, { from: "2025-01-01", to: "2025-12-31" }, today);
    if (!b.ok) throw new Error(JSON.stringify(b));
    expect(b.totalSql).toContain(`"CONVEY_DATE" >= '2025-01-01'`);
    expect(b.period).toMatch(/^last sold Jan 1, 2025 – Dec 31, 2025/);
  });
  it("counts over and under a number, with a plain label, the base count and per-tract shares", () => {
    const b = buildCount(P, { filters: [{ column: "c_a_total", over: 200000 }] }, today);
    if (!b.ok) throw new Error(JSON.stringify(b));
    expect(b.totalSql).toMatch(/"C_A_TOTAL"::float END\) > 200000/);
    expect(b.filterLabels).toEqual(["assessed over $200,000"]);
    expect(b.ofSql).toMatch(/"C_A_TOTAL"::float END\) > 0/);
    expect(b.ofSql).not.toContain("> 200000");
    expect(b.tractSql).toContain(`GROUP BY "GEO_TRACT"`);
    expect(b.tractSql).toContain("> 200000 THEN 1");
    const u = buildCount(P, { filters: [{ column: "BLDG_AREA", under: 1500 }] }, today);
    if (!u.ok) throw new Error(JSON.stringify(u));
    expect(u.filterLabels).toEqual(["building area under 1,500 sq ft"]);
  });
  it("an over/under count skips the City's 0 = none placeholders, so it stays a subset of the base", () => {
    const u = buildCount(P, { filters: [{ column: "C_A_TOTAL", under: 100000 }] }, today);
    if (!u.ok) throw new Error(JSON.stringify(u));
    expect(u.totalSql).toMatch(/"C_A_TOTAL"::float END\) < 100000/);
    expect(u.totalSql).toMatch(/"C_A_TOTAL"::float END\) > 0/);
    expect(u.tractSql).toMatch(/> 0 AND .*< 100000 THEN 1/); // the tract hits carry the guard too
    const y = buildCount(P, { filters: [{ column: "YR_BUILT", under: 1900 }] }, today);
    if (!y.ok) throw new Error(JSON.stringify(y));
    expect(y.totalSql).toMatch(/"YR_BUILT"::float END\) >= 1800/);
    expect(y.totalSql).toMatch(/"C_A_TOTAL"::float END\) > 0/); // the base guard rides along
    const o = buildCount(P, { filters: [{ column: "C_A_TOTAL", over: 200000 }] }, today);
    if (!o.ok) throw new Error(JSON.stringify(o));
    expect(o.totalSql).toMatch(/"C_A_TOTAL"::float END\) > 200000/);
  });
  it("words year built as after/before, not over/under", () => {
    const a = buildCount(P, { filters: [{ column: "YR_BUILT", over: 1950 }] }, today);
    const b = buildCount(P, { filters: [{ column: "YR_BUILT", under: 1950 }] }, today);
    if (!a.ok || !b.ok) throw new Error("not ok");
    expect(a.filterLabels).toEqual(["built after 1950"]);
    expect(b.filterLabels).toEqual(["built before 1950"]);
  });
  it("groups by aldermanic district with plain labels", () => {
    const b = buildCount(P, { groupBy: "geo_alder" }, today);
    if (!b.ok) throw new Error(JSON.stringify(b));
    expect(b.groupSql).toContain(`"GEO_ALDER" AS g`);
    expect(b.groupLabel).toBe("GEO_ALDER");
  });
  it("never filters or groups on a street, an owner, or a column that isn't a number", () => {
    for (const args of [
      { filters: [{ column: "STREET", values: ["15TH"] }] },
      { groupBy: "SDIR" },
      { filters: [{ column: "OWNER_NAME_1", values: ["X"] }] },
      { filters: [{ column: "OWNER_ZIP", over: 1 }] },
      { filters: [{ column: "TAXKEY", over: 1 }] },
    ]) {
      const b = buildCount(P, args, today);
      expect(b).toMatchObject({ ok: false, status: "bad-column" });
      // The refusal echoes the asked column; what it offers must never include one.
      expect(JSON.stringify((b as { columns: string[] }).columns)).not.toMatch(/OWNER|TAXKEY|STREET|SDIR/);
    }
  });
  it("leaves other City files exactly as they were", () => {
    const crime = { ...stored, resourceId: "87843297-a6fa-46d4-ba5d-cb342fb2d3bb", dateColumn: "Incident_Date" };
    expect(withOverrides(crime)).toBe(crime);
  });
});
