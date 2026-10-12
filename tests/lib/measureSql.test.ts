import { describe, expect, it } from "vitest";
import type { CityProfile } from "../../convex/lib/cityProfile";
import { CITY_MEASURES } from "../../convex/lib/cityMeasures";
import { buildMeasure, moneyValue } from "../../convex/lib/measureSql";

const RID = "562e3c33-d7c0-4fa2-b7da-6aa31026ae53";
const by = (id: string) => CITY_MEASURES.find((m) => m.id === id)!;
const base = (over: Partial<CityProfile> = {}): CityProfile => ({
  familyKey: "city:city-employee-salary-data", resourceId: RID, columns: [], dateColumn: null, districtColumns: [],
  categories: [{ column: "Department", values: [{ value: "POLICE DEPARTMENT", count: 2569 }] }, { column: "Full/Part", values: [{ value: "Full Time", count: 8000 }, { value: "Part Time", count: 900 }] }],
  rowCount: 9057, minDate: null, maxDate: null, namesPeople: true, signature: "", updatedAt: 0, ...over,
});
const ok = (b: ReturnType<typeof buildMeasure>) => { if (!b.ok) throw new Error(`refused: ${b.status}`); return b; };
const TODAY = "2026-10-12";

describe("reading money", () => {
  it("strips $, commas and spaces, and casts only inside the number guard", () => {
    expect(moneyValue("Total Gross")).toBe(`CASE WHEN regexp_replace("Total Gross", '[$, ]', '', 'g') ~ '^-?[0-9]+([.][0-9]+)?$' THEN regexp_replace("Total Gross", '[$, ]', '', 'g')::float END`);
  });
});

describe("the measure query", () => {
  it("returns records, total, median, average, unreadable and zeros for the whole file", () => {
    const b = ok(buildMeasure(base(), by("gross-pay"), {}, TODAY));
    expect(b.groupSql).toBeNull();
    expect(b.allSql).toContain("SUM(CASE WHEN v IS NOT NULL AND v <> 0 THEN 1 ELSE 0 END) AS n");
    expect(b.allSql).toContain("SUM(CASE WHEN v IS NOT NULL AND v <> 0 THEN v END) AS total");
    expect(b.allSql).toContain("percentile_cont(0.5) WITHIN GROUP (ORDER BY CASE WHEN v IS NOT NULL AND v <> 0 THEN v END) AS median");
    expect(b.allSql).toContain("AVG(CASE WHEN v IS NOT NULL AND v <> 0 THEN v END) AS average");
    expect(b.allSql).toContain("SUM(CASE WHEN bad THEN 1 ELSE 0 END) AS unreadable");
    expect(b.allSql).toContain("SUM(CASE WHEN v = 0 THEN 1 ELSE 0 END) AS zeros");
    expect(b.allSql).toContain(`FROM "${RID}"`);
    expect(b.period).toBe("all records");
  });
  it("keeps zeros for a measure that doesn't skip them", () => {
    expect(ok(buildMeasure(base({ familyKey: "city:delinquent-real-estate-tax-accounts" }), by("tax-owed"), {}, TODAY)).allSql).toContain("SUM(CASE WHEN v IS NOT NULL THEN 1 ELSE 0 END) AS n");
  });
  it("groups by an allowed split, most records first, and filters by profiled values inside", () => {
    const b = ok(buildMeasure(base(), by("gross-pay"), { groupBy: "department", filters: [{ column: "Full/Part", values: ["full time"] }] }, TODAY));
    expect(b.groupSql).toContain(`"Department" AS g`);
    expect(b.groupSql).toContain("GROUP BY g ORDER BY n DESC LIMIT 24");
    expect(b.groupSql).toContain(`WHERE "Full/Part" IN ('Full Time')) s`);
    expect(b.groupLabel).toBe("Department");
    expect(b.filterLabels).toEqual(["Full Time"]);
  });
  it("refuses a split that isn't on the measure's list, offering the allowed ones", () => {
    expect(buildMeasure(base(), by("gross-pay"), { groupBy: "Name" }, TODAY)).toMatchObject({ ok: false, status: "bad-column", columns: ["Department", "Job Title", "Full/Part"] });
  });
  it("groups and filters by year through the date reader when the measure has a date column", () => {
    const sales = base({ familyKey: "city:property-sales-data", namesPeople: false, categories: [] });
    const b = ok(buildMeasure(sales, by("sale-price"), { groupBy: "year", from: "2025-01-01" }, TODAY));
    expect(b.groupSql).toContain(`to_char(d, 'YYYY') AS g`);
    expect(b.groupSql).toContain(`to_timestamp("Sale_date", 'MM/DD/YYYY')::timestamp END AS d`);
    expect(b.groupSql).toContain("ORDER BY g DESC");
    expect(b.allSql).toContain(") s WHERE d >= '2025-01-01'");
    expect(b.period).toBe("since Jan 1, 2025");
    expect(buildMeasure(sales, by("sale-price"), { groupBy: "Nope" }, TODAY)).toMatchObject({ ok: false, status: "bad-column", columns: ["District", "PropType", "year"] });
  });
  it("refuses a period when the measure has no date column", () => {
    expect(buildMeasure(base(), by("gross-pay"), { from: "2025-01-01" }, TODAY)).toMatchObject({ ok: false, status: "bad-dates" });
    expect(buildMeasure(base(), by("gross-pay"), { groupBy: "year" }, TODAY)).toMatchObject({ ok: false, status: "bad-column" });
  });
  it("keeps the property file to its current assessment, like counts", () => {
    const mprop = base({ familyKey: "city:master-property-file-mprop", namesPeople: false, snapshot: true, currentColumn: "YR_ASSMT", categories: [{ column: "YR_ASSMT", values: [{ value: "2026", count: 159949 }] }] });
    const b = ok(buildMeasure(mprop, by("assessed-value"), { groupBy: "GEO_ALDER" }, TODAY));
    expect(b.allSql).toContain(`WHERE "YR_ASSMT" = '2026'`);
    expect(b.period).toBe("2026 assessment");
  });
  it("never writes what the City's server or its firewall refuses", () => {
    const sales = base({ familyKey: "city:property-sales-data", namesPeople: false, categories: [] });
    const all = [buildMeasure(base(), by("gross-pay"), { groupBy: "Department" }, TODAY), buildMeasure(sales, by("sale-price"), { groupBy: "year", from: "2025-01-01" }, TODAY)]
      .map((b) => { const x = ok(b); return `${x.groupSql} ${x.allSql}`; }).join(" ");
    for (const banned of ["FILTER", "trim(", "extract(", "left(", "= 1 AND"]) expect(all).not.toContain(banned);
  });
});
