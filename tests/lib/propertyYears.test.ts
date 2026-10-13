import { describe, expect, it } from "vitest";
import { buildYearCount, buildYearMeasure, layoutOf, yearFiles, yearSource } from "../../convex/lib/propertyYears";
import { MPROP_RID, type CityProfile } from "../../convex/lib/cityProfile";
import { CITY_MEASURES } from "../../convex/lib/cityMeasures";
import { num } from "../../convex/lib/citySql";

const ids = (...names: string[]) => names.map((id) => ({ id }));
const link = (rid: string, file: string) => `https://data.milwaukee.gov/dataset/79e9d55a-c1ed-457c-ab63-cb8e36235ba8/resource/${rid}/download/${file}`;

describe("layoutOf (K2)", () => {
  it("recognizes each layout by its columns", () => {
    expect(layoutOf(ids("TAXKEY", "C_A_TOTAL", "GEO_ALDER", "OWN_OCPD", "C_A_CLASS"))).toBe("classic");
    expect(layoutOf(ids("Taxkey", "AssessValu", "DistrictNa", "IsOwnerOcc", "PrevNonExemptClass"))).toBe("short");
    expect(layoutOf(ids("Taxkey", "TotalAssessedValue", "DistrictName", "IsOwnerOccupied", "PrevNonExemptClass"))).toBe("long");
  });
  it("gives no layout when a carried column is missing or nothing matches", () => {
    expect(layoutOf(ids("C_A_TOTAL", "GEO_ALDER", "OWN_OCPD"))).toBeNull(); // no class column
    expect(layoutOf(ids("CATOTAL", "GEOALDER", "OWNOCPD", "CACLASS"))).toBeNull(); // the 1990s layout isn't read
  });
});

describe("yearFiles (K2)", () => {
  it("takes each 'MPROP <year>' file from 2005 on, with the id from its link, sorted by year", () => {
    expect(yearFiles([
      { name: "Parcel Tax - MPROP 2025", url: link("9e512b1d-2c64-448f-9e7a-5c2022d5948a", "parcel-tax-mprop-2025.csv") },
      { name: "MPROP 2021", url: link("d1b65182-fff9-4400-9476-0aff30a6e0ea", "mprop-2021.csv") },
      { name: "MPROP 1995", url: link("bd5f561d-d5e6-42f4-b4d9-87f287867e7c", "mprop-1995.csv") },
      { name: "MPROP Reference 2009-now", url: link("c88986d6-5624-4154-860a-13f901c90905", "ref.pdf") },
      { name: "MPROP 2010", url: "https://data.milwaukee.gov/x/no-id.csv" },
    ], 2005)).toEqual([
      { year: 2021, resourceId: "d1b65182-fff9-4400-9476-0aff30a6e0ea" },
      { year: 2025, resourceId: "9e512b1d-2c64-448f-9e7a-5c2022d5948a" },
    ]);
  });
});


const R05 = "6370d019-f21b-4957-aa86-d38f5e82e138", R21 = "d1b65182-fff9-4400-9476-0aff30a6e0ea", R22 = "a368cfd5-5504-4311-b394-df850da76367", R25 = "9e512b1d-2c64-448f-9e7a-5c2022d5948a";
const P: CityProfile = {
  familyKey: "city:master-property-file-mprop", resourceId: MPROP_RID, columns: [], dateColumn: "CONVEY_DATE", districtColumns: ["GEO_ALDER"],
  categories: [{ column: "YR_ASSMT", values: [{ value: "2026", count: 159556 }] }], rowCount: 159950, minDate: "1900-01-01", maxDate: "2026-09-30",
  namesPeople: true, signature: "s", updatedAt: 0, snapshot: true, currentColumn: "YR_ASSMT", baseColumn: "C_A_TOTAL", tractColumn: "GEO_TRACT",
  numberColumns: ["C_A_TOTAL", "C_A_LAND", "C_A_IMPRV", "BLDG_AREA", "NR_UNITS", "YR_BUILT"],
  years: [
    { year: 2005, resourceId: R05, layout: "classic" }, { year: 2021, resourceId: R21, layout: "classic" },
    { year: 2022, resourceId: R22, layout: "short" }, { year: 2025, resourceId: R25, layout: "long" },
    { year: 2026, resourceId: MPROP_RID, layout: "classic" },
  ],
};
const S22 = `(SELECT '2022' AS "yr", "AssessValu" AS "C_A_TOTAL", "DistrictNa" AS "GEO_ALDER", CASE WHEN "IsOwnerOcc" = '1' THEN 'O' ELSE '' END AS "OWN_OCPD", "PrevNonExemptClass" AS "C_A_CLASS" FROM "${R22}") AS t`;
const V = num("C_A_TOTAL");
const NOTE = "Years are the City's file years; in a few files the City's own assessment-year field reads a year later.";
const DISTRICT = "District lines are redrawn after each census, so a district number can cover a different area in different years.";
const ok = <T extends { ok: boolean }>(b: T) => { if (!b.ok) throw new Error(`expected ok, got ${JSON.stringify(b)}`); return b as Extract<T, { ok: true }>; };

describe("yearSource (K2)", () => {
  it("reads one year's file, renamed to the classic columns", () => {
    expect(yearSource(P, [P.years![2]])).toBe(S22);
  });
  it("reads several years as one table, each tagged, today's file kept to its assessment", () => {
    const s = yearSource(P, P.years!.slice(2));
    expect(s.split(" UNION ALL ")).toHaveLength(3);
    expect(s).toContain(`SELECT '2025' AS "yr", "TotalAssessedValue" AS "C_A_TOTAL", "DistrictName" AS "GEO_ALDER", CASE WHEN "IsOwnerOccupied" = '1' THEN 'O' ELSE '' END AS "OWN_OCPD", "PrevNonExemptClass" AS "C_A_CLASS" FROM "${R25}"`);
    expect(s).toContain(`SELECT '2026' AS "yr", "C_A_TOTAL" AS "C_A_TOTAL", "GEO_ALDER" AS "GEO_ALDER", CASE WHEN "OWN_OCPD" = 'O' THEN 'O' ELSE '' END AS "OWN_OCPD", "C_A_CLASS" AS "C_A_CLASS" FROM "${MPROP_RID}" WHERE "YR_ASSMT" = '2026'`);
  });
  it("refuses a file id that isn't one", () => {
    expect(() => yearSource(P, [{ year: 2022, resourceId: "x'; DROP", layout: "short" }])).toThrow("Not a CKAN resource id");
  });
});

describe("buildYearCount (K2)", () => {
  it("counts one year over a cutoff, out of all assessed, with the file named", () => {
    const b = ok(buildYearCount(P, { years: { from: 2022, to: 2022 }, filters: [{ column: "C_A_TOTAL", over: 200000 }] }));
    expect(b.totalSql).toBe(`SELECT COUNT(*) AS n FROM ${S22} WHERE ${V} > 0 AND ${V} > 200000`);
    expect(b.ofSql).toBe(`SELECT COUNT(*) AS n FROM ${S22} WHERE ${V} > 0`);
    expect(b).toMatchObject({ period: "2022 assessment", filterLabels: ["assessed over $200,000"], source: "From the City's 2022 property file.", note: NOTE, groupLabel: null, timeoutMs: 25_000, tractSql: null, gridSql: null, points: null });
    expect(b.latestYear).toBeUndefined();
  });
  it("groups a span by year, with the headline on the newest year", () => {
    const b = ok(buildYearCount(P, { years: { from: 2021, to: 2026 }, filters: [{ column: "OWN_OCPD", values: ["O"] }] }));
    expect(b.groupLabel).toBe("year");
    expect(b.groupSql).toMatch(/^SELECT "yr" AS g, COUNT\(\*\) AS n FROM \(.+\) AS t WHERE "OWN_OCPD" IN \('O'\) GROUP BY g ORDER BY g DESC LIMIT 24$/);
    expect(b.totalSql).toMatch(/WHERE "OWN_OCPD" IN \('O'\) AND "yr" = '2026'$/);
    expect(b).toMatchObject({ period: "2021 – 2026 assessments", filterLabels: ["owner-occupied"], latestYear: "2026", source: "From the City's yearly property files (2021–2025) and its current file (2026)." });
  });
  it("filters homes by class, and a district across years with the district note", () => {
    const b = ok(buildYearCount(P, { years: { from: 2005, to: 2026 }, filters: [{ column: "C_A_CLASS", values: ["1", "5"] }, { column: "GEO_ALDER", values: ["6"] }] }));
    expect(b.groupSql).toContain(`WHERE "C_A_CLASS" IN ('1', '5') AND "GEO_ALDER" IN ('6')`);
    expect(b.filterLabels).toEqual(["residential", "condominiums", "Aldermanic district 6"]);
    expect(b.note!.startsWith(NOTE)).toBe(true); // the fixture lacks 2006–2020, so the missing-years sentence sits between
    expect(b.note!.endsWith(DISTRICT)).toBe(true);
  });
  it("groups one year by district, and refuses district groups across years", () => {
    expect(ok(buildYearCount(P, { years: { from: 2025, to: 2025 }, groupBy: "GEO_ALDER" })).groupSql).toMatch(/^SELECT "GEO_ALDER" AS g, COUNT\(\*\) AS n FROM .+ GROUP BY g ORDER BY n DESC LIMIT 24$/);
    expect(buildYearCount(P, { years: { from: 2005, to: 2025 }, groupBy: "GEO_ALDER" })).toEqual({ ok: false, status: "bad-column", column: "GEO_ALDER", columns: ["year"] });
  });
  it("names a year missing inside the span (review focus 2)", () => {
    expect(ok(buildYearCount(P, { years: { from: 2005, to: 2021 } })).note).toBe(`${NOTE} The City has no usable file for 2006, 2007, 2008, 2009, 2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020.`);
  });
  it("refuses other columns, values and amounts with the supported list", () => {
    const columns = ["C_A_TOTAL", "GEO_ALDER", "OWN_OCPD", "C_A_CLASS"];
    expect(buildYearCount(P, { years: { from: 2025, to: 2025 }, filters: [{ column: "BLDG_AREA", over: 1000 }] })).toEqual({ ok: false, status: "bad-column", column: "BLDG_AREA", columns });
    expect(buildYearCount(P, { years: { from: 2025, to: 2025 }, filters: [{ column: "LAND_USE", values: ["8810"] }] })).toEqual({ ok: false, status: "bad-column", column: "LAND_USE", columns });
    expect(buildYearCount(P, { years: { from: 2025, to: 2025 }, filters: [{ column: "C_A_CLASS", values: ["7"] }] })).toEqual({ ok: false, status: "choose", column: "C_A_CLASS", asked: "7", choices: ["1", "5"] });
    expect(buildYearCount(P, { years: { from: 2025, to: 2025 }, groupBy: "LAND_USE" })).toEqual({ ok: false, status: "bad-column", column: "LAND_USE", columns: ["year", "GEO_ALDER"] });
  });
  it("refuses bad years, dates with years, and years on a file without them (review focus 3)", () => {
    const bad = (years: { from: number; to: number }, reason?: string) => ({ ok: false, status: "bad-dates", from: String(years.from), to: String(years.to), ...(reason ? { reason } : {}) });
    expect(buildYearCount(P, { years: { from: 2005.5, to: 2010 } })).toEqual(bad({ from: 2005.5, to: 2010 }));
    expect(buildYearCount(P, { years: { from: 2020, to: 2010 } })).toEqual(bad({ from: 2020, to: 2010 }));
    expect(buildYearCount(P, { years: { from: 2010, to: 2020 }, from: "2015-01-01" })).toEqual(bad({ from: 2010, to: 2020 }, "Use years for assessment years; from and to are sale dates."));
    expect(buildYearCount({ ...P, years: null }, { years: { from: 2010, to: 2020 } })).toEqual(bad({ from: 2010, to: 2020 }, "Years apply to the City's property file only."));
  });
  it("clamps a span past today's file, and refuses one wholly outside (review focus 4)", () => {
    expect(ok(buildYearCount(P, { years: { from: 2025, to: 2030 } })).period).toBe("2025 – 2026 assessments (clamped to the files' range)");
    expect(buildYearCount(P, { years: { from: 1990, to: 1999 } })).toEqual({ ok: false, status: "outside-coverage", coverage: "2005 – 2026 assessments", note: "Earlier yearly files use different column layouts, and some years are missing or incomplete." });
  });
});

describe("buildYearMeasure (K2)", () => {
  const m = CITY_MEASURES.find((x) => x.id === "assessed-value")!;
  it("gives the typical home value by year, with the summary row on the newest year", () => {
    const b = ok(buildYearMeasure(P, m, { years: { from: 2005, to: 2026 }, filters: [{ column: "C_A_CLASS", values: ["1", "5"] }] }));
    expect(b.groupLabel).toBe("year");
    expect(b.groupSql).toMatch(/^SELECT y AS g, .+percentile_cont\(0\.5\).+ FROM \(SELECT CASE WHEN .+ AS v, "yr" AS y, "GEO_ALDER" AS d FROM \(.+\) AS t WHERE "C_A_CLASS" IN \('1', '5'\)\) s GROUP BY g ORDER BY g DESC LIMIT 24$/);
    expect(b.allSql).toMatch(/\) s WHERE y = '2026'$/);
    expect(b).toMatchObject({ period: "2005 – 2026 assessments", filterLabels: ["residential", "condominiums"], latestYear: "2026", timeoutMs: 25_000 });
  });
  it("refuses a measure other than assessed value", () => {
    expect(buildYearMeasure(P, CITY_MEASURES.find((x) => x.id === "sale-price")!, { years: { from: 2020, to: 2021 } })).toMatchObject({ ok: false, status: "bad-dates", reason: "Years apply to the City's property file only." });
  });
});
