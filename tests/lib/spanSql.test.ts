import { describe, expect, it } from "vitest";
import type { CityProfile } from "../../convex/lib/cityProfile";
import { SPAN_PAIRS } from "../../convex/lib/spanPairs";
import { buildSpan, readDate, SPAN_QUERY_TIMEOUT_MS } from "../../convex/lib/spanSql";

const RID = "5cb9ea51-c23f-4171-ad2d-9e9b1bfde280";
const complaints = SPAN_PAIRS.find((p) => p.id === "complaint-close")!;
const arrive = SPAN_PAIRS.find((p) => p.id === "fire-arrive")!;
const P: CityProfile = {
  familyKey: complaints.familyKey, resourceId: RID, columns: [], dateColumn: null, districtColumns: [],
  categories: [
    { column: "Department", values: [{ value: "Milwaukee Police Department", count: 2569 }, { value: "Milwaukee Fire Department", count: 64 }] },
    { column: "Category1", values: [{ value: "Department Services", count: 369 }], multi: true },
  ],
  rowCount: 2919, minDate: null, maxDate: null, namesPeople: false, signature: "", updatedAt: 0,
};
const FIRE: CityProfile = { ...P, familyKey: arrive.familyKey, dateColumn: "Date_Received", minDate: "2021-01-01", maxDate: "2021-12-31", updatedAt: Date.parse("2026-10-01"), categories: [{ column: "ZIP_Code", values: [{ value: "53206", count: 900 }] }] };
const TODAY = "2026-10-12";
const ok = (b: ReturnType<typeof buildSpan>) => { if (!b.ok) throw new Error(`refused: ${b.status}`); return b; };

describe("the City's time limit", () => {
  // A whole-file median on the Fire Department's 350,000 calls took 9.5–10.5s on the City's server (2026-10-14).
  it("gives span queries well past the 10s default", () => {
    expect(SPAN_QUERY_TIMEOUT_MS).toBeGreaterThanOrEqual(25_000);
  });
});

describe("reading dates", () => {
  it("reads ISO and month/day/year text, with the year floor inside the pattern", () => {
    const d = readDate("DateReported");
    expect(d).toContain(`"DateReported" ~ '^(19|20)[0-9]{2}-`);
    expect(d).toContain(`"DateReported"::timestamp`);
    expect(d).toContain(`to_timestamp("DateReported", 'MM/DD/YYYY')::timestamp`);
  });
});

describe("the span query", () => {
  it("measures every record when nothing is asked: cases, median, 9-in-10, open, unreadable, wrong order", () => {
    const b = ok(buildSpan(P, complaints, {}, TODAY));
    expect(b.groupSql).toBeNull();
    expect(b.allSql).toContain("percentile_cont(0.5) WITHIN GROUP (ORDER BY CASE WHEN t >= f THEN date_part('epoch', t - f) / 86400 END) AS median");
    expect(b.allSql).toContain("percentile_cont(0.9)");
    expect(b.allSql).toContain("SUM(CASE WHEN hf AND NOT ht THEN 1 ELSE 0 END) AS open");
    expect(b.allSql).toContain("SUM(CASE WHEN (hf AND f IS NULL) OR (ht AND t IS NULL) THEN 1 ELSE 0 END) AS unreadable");
    expect(b.allSql).toContain("SUM(CASE WHEN t < f THEN 1 ELSE 0 END) AS backwards");
    expect(b.allSql).toContain(`FROM "${RID}"`);
    expect(b.period).toBe("all records");
    expect(b.coverage).toBeNull();
  });
  it("measures minutes for a minutes pair", () => {
    expect(ok(buildSpan(FIRE, arrive, {}, TODAY)).allSql).toContain("/ 60 END");
  });
  it("measures the Fire Department's dispatch and on-scene times from their own columns (L1)", () => {
    const pair = (id: string) => SPAN_PAIRS.find((p) => p.id === id)!;
    const MFD: CityProfile = { ...P, familyKey: "city:mfd-calls-for-service-detail", dateColumn: "IncidentStarted", categories: [] };
    const dispatch = ok(buildSpan(MFD, pair("mfd-dispatch"), {}, TODAY)).allSql;
    expect(dispatch).toContain('"IncidentStarted"');
    expect(dispatch).toContain('"FirstUnitDispatched"');
    expect(dispatch).toContain("/ 60 END");
    // On scene starts at arrival: a call no unit reached has no start, so it is neither measured nor counted as open.
    const scene = ok(buildSpan(MFD, pair("mfd-close"), {}, TODAY)).allSql;
    expect(scene).toContain('"FirstUnitArrived"');
    expect(scene).toContain('"IncidentClosed"');
    expect(scene).not.toContain('"IncidentStarted"');
  });
  it("measures an age to the day after the as-of date, and counts later dates as after it (L2)", () => {
    const vacant = SPAN_PAIRS.find((p) => p.id === "vacant-age")!;
    const V: CityProfile = { ...P, familyKey: vacant.familyKey, dateColumn: "DATEOPENED", categories: [{ column: "AldermanicDistrict", values: [{ value: "15", count: 90 }] }] };
    const b = ok(buildSpan(V, vacant, { groupBy: "AldermanicDistrict" }, TODAY, "2026-10-14"));
    expect(b.allSql).toContain("'2026-10-15'::timestamp - f"); // age to the end of the as-of day
    expect(b.allSql).toContain("CASE WHEN f >= '2026-10-15'::timestamp THEN 1 ELSE 0 END) AS backwards");
    expect(b.allSql).toContain("0 AS open");
    expect(b.allSql).not.toContain("Date Closed");
    expect(b.groupSql).toContain('"AldermanicDistrict"');
  });
  it("keeps only rows with no close date for an age entry with openWhen (L2)", () => {
    const open = SPAN_PAIRS.find((p) => p.id === "complaint-open-age")!;
    const b = ok(buildSpan(P, open, {}, TODAY, "2026-02-25"));
    expect(b.allSql).toContain(`NOT ("Date Closed" IS NOT NULL AND "Date Closed" <> '' AND upper("Date Closed") <> 'NULL')`);
    expect(b.allSql).toContain("'2026-02-26'::timestamp - f");
  });
  it("leaves a between pair's query exactly as before when an as-of date is passed", () => {
    expect(ok(buildSpan(P, complaints, {}, TODAY, "2026-02-25")).allSql).toBe(ok(buildSpan(P, complaints, {}, TODAY)).allSql);
  });
  it("groups by a column, merging labels that differ only in capitals and punctuation", () => {
    const b = ok(buildSpan(P, complaints, { groupBy: "department" }, TODAY));
    expect(b.groupSql).toContain(`"Department" AS g`);
    expect(b.groupSql).toContain("upper(regexp_replace(g, '[^A-Za-z0-9]+', '', 'g')) AS k, min(g) AS label");
    expect(b.groupSql).toContain("GROUP BY k ORDER BY cases DESC LIMIT 24");
    expect(b.groupLabel).toBe("Department");
    expect(b.overlap).toBe(false);
    expect(b.allSql).not.toContain(" AS g");
  });
  it("splits a ;-separated column into overlapping groups, but never in the All row", () => {
    const b = ok(buildSpan(P, complaints, { groupBy: "Category1" }, TODAY));
    expect(b.groupSql).toContain(`unnest(string_to_array("Category1", ';')) AS g`);
    expect(b.overlap).toBe(true);
    expect(b.allSql).not.toContain("unnest");
  });
  it("groups by the year of the parsed 'from' date, newest first", () => {
    const b = ok(buildSpan(P, complaints, { groupBy: "year" }, TODAY));
    expect(b.groupSql).toContain("to_char(f, 'YYYY') AS k, min(to_char(f, 'YYYY')) AS label");
    expect(b.groupSql).toContain("ORDER BY k DESC");
    expect(b.groupLabel).toBe("year");
  });
  it("filters a period on the parsed 'from' date, even when the profile has no date column", () => {
    const b = ok(buildSpan(P, complaints, { from: "2023-01-01", to: "2024-12-31" }, TODAY));
    expect(b.allSql).toContain(") s WHERE f >= '2023-01-01' AND f < '2025-01-01'");
    expect(b.period).toBe("Jan 1, 2023 – Dec 31, 2024");
    expect(ok(buildSpan(P, complaints, { from: "2023-01-01" }, TODAY)).period).toBe("since Jan 1, 2023");
  });
  it("filters by profiled values inside the inner query", () => {
    const b = ok(buildSpan(P, complaints, { filters: [{ column: "Department", values: ["milwaukee fire department"] }] }, TODAY));
    expect(b.allSql).toContain(`FROM "${RID}" WHERE "Department" IN ('Milwaukee Fire Department')) s`);
    expect(b.filterLabels).toEqual(["Milwaukee Fire Department"]);
  });
  it("offers the file's columns for a split, and refuses bad ones", () => {
    expect(ok(buildSpan(P, complaints, {}, TODAY)).columns).toEqual(["Department"]);
    expect(buildSpan(P, complaints, { groupBy: "Nope" }, TODAY)).toMatchObject({ ok: false, status: "bad-column", columns: ["year", "Department", "Category1"] });
    expect(buildSpan(P, complaints, { from: "2025-02-30" }, TODAY)).toMatchObject({ ok: false, status: "bad-dates" });
    expect(buildSpan(P, complaints, { from: "2025-05-01", to: "2025-01-01" }, TODAY)).toMatchObject({ ok: false, status: "bad-dates" });
  });
  it("refuses a period outside the file's data when the profile's date column is the 'from' date", () => {
    expect(buildSpan(FIRE, arrive, { from: "2024-01-01" }, TODAY)).toMatchObject({ ok: false, status: "outside-coverage", coverage: "Jan 1, 2021 – Dec 31, 2021" });
    expect(ok(buildSpan(FIRE, arrive, {}, TODAY)).coverage).toBe("Jan 1, 2021 – Dec 31, 2021");
  });
  it("never writes what the City's server or its firewall refuses", () => {
    const all = [buildSpan(P, complaints, { groupBy: "year", from: "2023-01-01" }, TODAY), buildSpan(P, complaints, { groupBy: "Category1" }, TODAY), buildSpan(FIRE, arrive, { groupBy: "ZIP_Code" }, TODAY)]
      .map((b) => { const x = ok(b); return `${x.groupSql} ${x.allSql}`; }).join(" ");
    for (const banned of ["FILTER", "trim(", "extract(", "= 1", "= 0", ">= '19", "left("]) expect(all).not.toContain(banned);
  });
});

describe("archives (K1)", () => {
  it("never reads an archive", () => {
    const b = buildSpan({ ...FIRE, archive: { resourceId: "11111111-2222-3333-4444-555555555555", before: "2021-06-01" } }, arrive, {}, TODAY);
    expect(JSON.stringify(b)).not.toContain("11111111-2222-3333-4444-555555555555");
  });
});
