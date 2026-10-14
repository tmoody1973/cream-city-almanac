import { describe, expect, it } from "vitest";
import { allSql, groupSql, INCIDENT_YEARS, mergeTypes, mfdQuery, mfdYears, parseStats, partialNote, readAt, typesSql, yearQuery } from "../../convex/lib/fireYears";

describe("fire sources (L3)", () => {
  it("lists 2015–2023, with the 2020 column rename and the three date shapes", () => {
    expect(INCIDENT_YEARS.map((s) => s.year)).toEqual([2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023]);
    expect(INCIDENT_YEARS.find((s) => s.year === 2019)!.cols.received).toBe("Date Received");
    expect(INCIDENT_YEARS.find((s) => s.year === 2020)!.cols.received).toBe("Date_Received");
    expect(INCIDENT_YEARS.filter((s) => s.toMinute).map((s) => s.year)).toEqual([2015, 2016, 2017, 2019, 2020]);
    expect(INCIDENT_YEARS.find((s) => s.year === 2020)!.shape).toBe("mdy2-ampm");
  });
  it("reads each date shape by its pattern, never casting text that doesn't match", () => {
    expect(readAt("Date Received", "mdy4-minute")).toMatch(/^CASE WHEN "Date Received" ~ '.*' THEN to_timestamp\("Date Received", 'MM\/DD\/YYYY HH24:MI'\)::timestamp END$/);
    expect(readAt("Date_Received", "mdy2-ampm")).toContain("to_timestamp(\"Date_Received\", 'MM/DD/YY HH12:MI AM')");
    expect(readAt("Date_Received", "iso")).toContain("\"Date_Received\"::timestamp");
    // the patterns themselves: what each shape's regex accepts
    const rx = (shape: Parameters<typeof readAt>[1]) => new RegExp(readAt("x", shape).match(/~ '([^']+)'/)![1]);
    expect(rx("mdy4-minute").test("1/1/2015 8:07")).toBe(true);
    expect(rx("mdy4-minute").test("13/1/2015 8:07")).toBe(false);
    expect(rx("mdy2-ampm").test("01/01/20 12:08 AM")).toBe(true);
    expect(rx("mdy2-ampm").test("NULL")).toBe(false);
    expect(rx("iso").test("2021-01-01 00:00:33.533")).toBe(true);
  });
  it("groups a year into EMS and other, with medians in minutes, on the City's server", () => {
    const y = yearQuery(INCIDENT_YEARS[0]);
    const g = groupSql(y);
    expect(g).toContain('FROM "97509bea-dfa4-435e-aa75-5499adf7bbe0"');
    expect(g).toContain("CASE WHEN upper(\"Final Call for Service Type\") = 'EMS' THEN 'ems' ELSE 'other' END AS g");
    expect(g).toContain("percentile_cont(0.5) WITHIN GROUP (ORDER BY CASE WHEN d >= r THEN date_part('epoch', d - r) / 60 END) AS dmed");
    expect(g).toMatch(/GROUP BY g$/);
    expect(allSql(y)).toMatch(/^SELECT 'all' AS g, /);
    expect(allSql(y)).not.toContain("GROUP BY");
    expect(typesSql(y)).toBe('SELECT "Final Call for Service Type" AS t, COUNT(*) AS n FROM "97509bea-dfa4-435e-aa75-5499adf7bbe0" GROUP BY "Final Call for Service Type"');
  });
  it("reads one MFD year with LIKE and drops its Test calls", () => {
    const y = mfdQuery("cdf51c45-5fe3-415e-a08c-14ed134dcb64", 2025);
    expect(groupSql(y)).toContain(`WHERE "IncidentStarted" LIKE '2025-%' AND ("IncidentType" IS NULL OR "IncidentType" <> 'Test')`);
    expect(groupSql(y)).toContain('"IncidentStarted"::timestamp');
    expect(() => mfdQuery("not-a-resource", 2025)).toThrow();
  });
  it("parses the City's text numbers; a group with nothing measured has no span", () => {
    expect(parseStats({ g: "ems", calls: "100", dmed: "1.5", dp90: "3", dn: "98", amed: "5.9", ap90: "9", an: "95", unreadable: "1", backwards: "2" }))
      .toEqual({ group: "ems", calls: 100, dispatch: { median: 1.5, p90: 3, n: 98 }, arrive: { median: 5.9, p90: 9, n: 95 }, unreadable: 1, backwards: 2 });
    expect(parseStats({ g: "all", calls: "3", dmed: null, dp90: null, dn: "0", amed: null, ap90: null, an: "0", unreadable: "3", backwards: "0" }).dispatch).toBeNull();
  });
  it("merges type spellings, keeping the spelling with the most calls", () => {
    expect(mergeTypes([{ t: "EMS", n: "90" }, { t: "ems ", n: "10" }, { t: "Auto Fire", n: "5" }, { t: null, n: "3" }, { t: "", n: "1" }]))
      .toEqual([{ type: "EMS", calls: 100 }, { type: "Auto Fire", calls: 5 }]);
  });
  it("names MFD years and partial years (review focus 4)", () => {
    expect(mfdYears(2026)).toEqual([2024, 2025, 2026]);
    expect(partialNote(2024, 2026)).toBe("from Feb 20");
    expect(partialNote(2026, 2026)).toBe("so far");
    expect(partialNote(2025, 2026)).toBeNull();
  });
});
