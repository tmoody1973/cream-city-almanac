import { describe, expect, it } from "vitest";
import { countCsv, dataZip, groupSql, kindOfTable, parseCsv, periodOf, stopTables, tally } from "../../convex/lib/stops";

describe("periodOf (K3)", () => {
  it("reads a quarter, the 2019 half-year, and nothing else", () => {
    expect(periodOf("2021 4th Quarter - MPD Stop and Search Data")).toEqual({ period: "2021-Q4", year: 2021 });
    expect(periodOf("2019 1st & 2nd Quarters - MPD Stop and Search Data")).toEqual({ period: "2019-Q1Q2", year: 2019 });
    expect(periodOf("Stop and Search Visualizations")).toBeNull();
  });
});

describe("kindOfTable (K3)", () => {
  it("knows every spelling seen live, and not the contact summary", () => {
    for (const n of ["Tracs Individual", "Tracs Individuals", "Tracs_Individual.csv", "Tracs_Individual_REMCOL.csv"]) expect(kindOfTable(n)).toBe("traffic");
    for (const n of ["Inform Field Interview Person Redacted", "Inform Field Interview Person - Redacted", "Inform_FieldInterviewPerson REDACTED TO POST 1.csv", "Inform_FieldInterviewPerson_REDACTED_REMCOL.csv", "Inform_FieldInterviewPerson_REMCOL_REDACTED.csv"]) expect(kindOfTable(n)).toBe("field-interview");
    for (const n of ["Inform No Action Encounter Person Redacted", "Inform_NoActionEncounterPerson.csv", "Inform_NoActionEncounterPerson_REDACTED.csv"]) expect(kindOfTable(n)).toBe("no-action");
    expect(kindOfTable("Tracs Contact Summary Individual")).toBeNull();
    expect(kindOfTable("Inform_FieldInterview_Joined.csv")).toBeNull();
  });
});

describe("tally (K3)", () => {
  it("maps MPD's values to the Almanac's groups and adds up what merges", () => {
    expect(tally("traffic", [{ race: "B", sex: "M", n: "10" }, { race: "H", sex: "F", n: 3 }, { race: "NULL", sex: "", n: "2" }, { race: "A", sex: "M", n: "1" }])).toEqual([
      { kind: "traffic", race: "Black", sex: "Male", frisked: null, searched: null, found: null, n: 10 },
      { kind: "traffic", race: "Hispanic", sex: "Female", frisked: null, searched: null, found: null, n: 3 },
      { kind: "traffic", race: "Unknown", sex: "Unknown", frisked: null, searched: null, found: null, n: 2 },
      { kind: "traffic", race: "Asian or Pacific Islander", sex: "Male", frisked: null, searched: null, found: null, n: 1 },
    ]);
    expect(tally("field-interview", [
      { race: "WHITE", eth: "HISPANIC/LATINO", sex: "M", frisked: "Yes", searched: "Yes", found: "WEAPON/NON-FIREARM", n: 1 },
      { race: "H", eth: "UNKNOWN", sex: "M", frisked: "Yes", searched: "Yes", found: "WEAPON/NON-FIREARM", n: 2 },
      { race: "NATIVE HAWAIIAN OR OTHER PACIFIC ISLANDER", eth: "NOT HISPANIC/LATINO", sex: "U", frisked: "NULL", searched: null, found: "NONE", n: 1 },
    ])).toEqual([
      { kind: "field-interview", race: "Hispanic", sex: "Male", frisked: "yes", searched: "yes", found: "Weapon/Non-Firearm", n: 3 },
      { kind: "field-interview", race: "Asian or Pacific Islander", sex: "Unknown", frisked: "unknown", searched: "unknown", found: "None", n: 1 },
    ]);
  });
});

describe("groupSql (K3)", () => {
  it("groups by the columns found, under fixed names, on a checked id", () => {
    expect(groupSql("traffic", "dcbc4a9d-5e48-4f24-bf71-e9a450065461", { race: "Race", sex: "sex" }))
      .toBe(`SELECT "Race" AS race, "sex" AS sex, COUNT(*) AS n FROM "dcbc4a9d-5e48-4f24-bf71-e9a450065461" GROUP BY 1, 2`);
    expect(() => groupSql("traffic", "x'; drop", { race: "Race", sex: "sex" })).toThrow("Not a CKAN resource id");
  });
});

describe("CSV (K3)", () => {
  it("reads quoted commas, doubled quotes and line breaks", () => {
    expect(parseCsv('a,b,c\r\n1,"two, ""quoted""\nline",3\n')).toEqual([["a", "b", "c"], ["1", 'two, "quoted"\nline', "3"]]);
  });
  it("counts a field-interview CSV, skipping the 2023 placeholder header and spaced column names", () => {
    const csv = [
      "Column1,Column2,Column3,Column4,Column5,Column6,Column7",
      "Id,race Description,ethnicity Description,sex Code,Pat Down Description,Search Performed Description,Search Results Description",
      'x1,BLACK/AFRICAN AMERICAN,NOT HISPANIC/LATINO,M,Yes,Yes,FIREARM',
      'x2,"BLACK/AFRICAN AMERICAN",NOT HISPANIC/LATINO,M,Yes,Yes,FIREARM',
    ].join("\n");
    expect(countCsv("field-interview", csv)).toEqual({ ok: true, rows: [{ kind: "field-interview", race: "Black", sex: "Male", frisked: "yes", searched: "yes", found: "Firearm", n: 2 }] });
  });
  it("names the missing column instead of counting nothing (review focus 2)", () => {
    expect(countCsv("field-interview", "Id,race_Description,sex_Code\nx,WHITE,F\n")).toEqual({ ok: false, missing: "patdowndescription" });
  });
});

describe("package files (K3)", () => {
  const link = (rid: string, f: string) => `https://data.milwaukee.gov/dataset/p/resource/${rid}/download/${f}`;
  it("finds the three person tables by name, and the data ZIP (not the lookup ZIP)", () => {
    const files = [
      { name: "Tracs_Individual_REMCOL.csv", format: "CSV", url: link("11111111-1111-1111-1111-111111111111", "t.csv") },
      { name: "Inform_FieldInterviewPerson_REDACTED_REMCOL.csv", format: "CSV", url: link("22222222-2222-2222-2222-222222222222", "f.csv") },
      { name: "Inform_NoActionEncounterPerson_REDACTED.csv", format: "CSV", url: link("33333333-3333-3333-3333-333333333333", "n.csv") },
      { name: "2021 Q4 - Tracs lookup files - CSV.zip", format: "ZIP", url: link("44444444-4444-4444-4444-444444444444", "l.zip") },
    ];
    expect(stopTables(files)).toEqual([
      { kind: "traffic", resourceId: "11111111-1111-1111-1111-111111111111" },
      { kind: "field-interview", resourceId: "22222222-2222-2222-2222-222222222222" },
      { kind: "no-action", resourceId: "33333333-3333-3333-3333-333333333333" },
    ]);
    expect(dataZip(files)).toBeNull(); // only a lookup ZIP
    expect(dataZip([{ name: "MPD SC Datasets 2023 Q4.zip", format: "ZIP", url: link("55555555-5555-5555-5555-555555555555", "d.zip") }])).toBe(link("55555555-5555-5555-5555-555555555555", "d.zip"));
    expect(dataZip([{ name: "MPD SC Datasets 2023 Q4.zip", format: "ZIP", url: "https://example.com/d.zip" }])).toBeNull();
  });
});
