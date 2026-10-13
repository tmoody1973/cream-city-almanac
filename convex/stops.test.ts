/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { strToU8, zipSync } from "fflate";
import { afterEach, describe, expect, it, vi } from "vitest";
import { installFakeFetch } from "../tests/helpers/fakeFetch";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");
afterEach(() => vi.unstubAllGlobals());

const link = (pkg: string, rid: string, file: string) => `https://data.milwaukee.gov/dataset/${pkg}/resource/${rid}/download/${file}`;
const T21 = "11111111-1111-1111-1111-111111111111", F21 = "22222222-2222-2222-2222-222222222222", N21 = "33333333-3333-3333-3333-333333333333";
const ZIP23 = link("p23", "55555555-5555-5555-5555-555555555555", "final-mpd-sc-datasets-2023-q4.zip");
const PKG21 = [
  { name: "Tracs_Individual_REMCOL.csv", format: "CSV", url: link("p21", T21, "t.csv") },
  { name: "Inform_FieldInterviewPerson_REDACTED_REMCOL.csv", format: "CSV", url: link("p21", F21, "f.csv") },
  { name: "Inform_NoActionEncounterPerson_REDACTED.csv", format: "CSV", url: link("p21", N21, "n.csv") },
  { name: "2021 Q4 - Tracs lookup files - CSV.zip", format: "ZIP", url: link("p21", "44444444-4444-4444-4444-444444444444", "l.zip") },
];
const PKG23 = [{ name: "MPD SC Datasets 2023 Q4.zip", format: "ZIP", url: ZIP23 }];

async function seed(t: TestConvex<typeof schema>, modified21 = "2025-02-14T20:49:36", modified23 = "2024-09-11T16:39:29") {
  await t.run(async (ctx) => {
    for (const [key, code, title, modified, files] of [
      ["city:2021-4th-quarter-mpd-stop-and-search-data", "X17", "2021 4th Quarter - MPD Stop and Search Data", modified21, PKG21],
      ["city:2023-4th-quarter-mpd-stop-and-search-data", "X27", "2023 4th Quarter - MPD Stop and Search Data", modified23, PKG23],
    ] as const) {
      await ctx.db.insert("families", { key, code, name: title, kind: "dataset", topic: "Public Safety", keywords: [], places: ["City"], years: [], latestModified: modified, baseSearchText: "", searchText: "", dictionaryTab: null, source: "city", live: false });
      await ctx.db.insert("members", { familyKey: key, hubId: key, title, yearLabel: "", featureServerUrl: "", kind: "dataset", landingPage: "", place: "City", years: [], modified, downloads: {}, description: "", keywords: [], files: [...files] });
    }
  });
}

const FIELDS: Record<string, { id: string; type: string }[]> = {
  [T21]: ["CollKey", "Race", "sex", "entityType"].map((id) => ({ id, type: "text" })),
  [F21]: ["Id", "age_code", "sex_Code", "race_Description", "ethnicity_Description", "Pat_Down_Description", "Search_Performed_Description", "Search_Results_Description", "stop_Justification"].map((id) => ({ id, type: "text" })),
  [N21]: ["Id", "NAE_Id", "sex_Code", "race_Description", "ethnicity_Description"].map((id) => ({ id, type: "text" })),
};
const SQL = (sql: string) =>
  sql.includes(T21) ? [{ race: "B", sex: "M", n: "10" }, { race: "H", sex: "F", n: "3" }]
    : sql.includes(F21) ? [{ race: "BLACK/AFRICAN AMERICAN", eth: "NOT HISPANIC/LATINO", sex: "M", frisked: "Yes", searched: "Yes", found: "FIREARM", n: "4" }]
    : [{ race: "WHITE", eth: "HISPANIC/LATINO", sex: "F", n: "1" }];
const zip23 = () => zipSync({
  "FINAL - MPD SC Datasets 2023 Q4/Tracs_Individual_REMCOL.csv": strToU8("CollKey,Race,sex,entityType\nc1,B,M,I\nc2,W,F,I\n"),
  "FINAL - MPD SC Datasets 2023 Q4/Inform_FieldInterviewPerson_REMCOL_REDACTED.csv": strToU8("Column1,Column2,Column3,Column4,Column5,Column6,Column7\nId,sex_Code,race_Description,ethnicity_Description,Pat_Down_Description,Search_Performed_Description,Search_Results_Description\nx,M,WHITE,NOT HISPANIC/LATINO,No,No,NONE\n"),
  "FINAL - MPD SC Datasets 2023 Q4/Inform_NoActionEncounterPerson_REDACTED.csv": strToU8('Id,NAE_Id,sex_Code,race_Description,ethnicity_Description,stop_Justification\ny,z,M,BLACK/AFRICAN AMERICAN,UNKNOWN,"Narrative, with a comma"\n'),
});
const countsOf = (t: TestConvex<typeof schema>, period: string) => t.run((ctx) => ctx.db.query("stopCounts").withIndex("by_period", (q) => q.eq("period", period)).collect());

describe("refreshStops (K3)", () => {
  it("counts a queryable quarter with grouped SQL and a ZIP quarter from its CSVs, storing counts only", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    installFakeFetch({ cityFieldsFor: (rid) => FIELDS[rid], citySql: SQL, cityDownloads: { [ZIP23]: zip23() } });
    expect(await t.action(internal.stops.refreshStops, {})).toEqual([]);
    const q4 = await countsOf(t, "2021-Q4");
    expect(q4.map(({ kind, race, sex, n }) => [kind, race, sex, n])).toEqual(expect.arrayContaining([["traffic", "Black", "Male", 10], ["traffic", "Hispanic", "Female", 3], ["field-interview", "Black", "Male", 4], ["no-action", "Hispanic", "Female", 1]]));
    const z = await countsOf(t, "2023-Q4");
    expect(z.map(({ kind, race, n }) => [kind, race, n])).toEqual(expect.arrayContaining([["traffic", "Black", 1], ["traffic", "White", 1], ["field-interview", "White", 1], ["no-action", "Black", 1]]));
    // Only counts are stored: no narrative, IDs or keys from MPD's rows (record ids left out of the check).
    expect(JSON.stringify([...q4, ...z].map(({ kind, race, sex, frisked, searched, found, n }) => ({ kind, race, sex, frisked, searched, found, n })))).not.toMatch(/Narrative|CollKey|"c1"|"x"|"y"/);
  });
  it("skips a quarter already counted from the same catalog version (no City request)", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    installFakeFetch({ cityFieldsFor: (rid) => FIELDS[rid], citySql: SQL, cityDownloads: { [ZIP23]: zip23() } });
    await t.action(internal.stops.refreshStops, {});
    const f = installFakeFetch({ cityFieldsFor: (rid) => FIELDS[rid], citySql: SQL, cityDownloads: { [ZIP23]: zip23() } });
    expect(await t.action(internal.stops.refreshStops, {})).toEqual([]);
    expect(f.calls).toHaveLength(0);
  });
  it("marks a refused quarter failed, keeps its earlier counts, and retries it next time (review focus 1)", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    installFakeFetch({ cityFieldsFor: (rid) => FIELDS[rid], citySql: SQL, cityDownloads: { [ZIP23]: zip23() } });
    await t.action(internal.stops.refreshStops, {});
    await t.run(async (ctx) => { for (const m of await ctx.db.query("members").collect()) await ctx.db.patch(m._id, { modified: "2026-01-01T00:00:00" }); });
    installFakeFetch({ cityFieldsFor: (rid) => FIELDS[rid], citySql: SQL, cityDownloads: { [ZIP23]: 403 } });
    const notes = await t.action(internal.stops.refreshStops, {});
    expect(notes).toEqual(["Stops 2023-Q4: ZIP download failed: 403; kept any earlier counts"]);
    expect((await countsOf(t, "2023-Q4")).length).toBeGreaterThan(0);
    const f = installFakeFetch({ cityFieldsFor: (rid) => FIELDS[rid], citySql: SQL, cityDownloads: { [ZIP23]: zip23() } });
    expect(await t.action(internal.stops.refreshStops, {})).toEqual([]);
    expect(f.count("/download/")).toBe(1); // the failed quarter was retried; the counted one wasn't
  });
  it("fails a quarter whose table lacks a column, naming it (review focus 2)", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    installFakeFetch({ cityFieldsFor: (rid) => (rid === F21 ? FIELDS[F21].filter((f) => f.id !== "Pat_Down_Description") : FIELDS[rid]), citySql: SQL, cityDownloads: { [ZIP23]: zip23() } });
    expect(await t.action(internal.stops.refreshStops, {})).toEqual(["Stops 2021-Q4: field-interview table has no patdowndescription column; kept any earlier counts"]);
    expect(await countsOf(t, "2021-Q4")).toHaveLength(0);
  });
});

describe("countStops (K3)", () => {
  it("answers from the stored counts", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    installFakeFetch({ cityFieldsFor: (rid) => FIELDS[rid], citySql: SQL, cityDownloads: { [ZIP23]: zip23() } });
    await t.action(internal.stops.refreshStops, {});
    const r = await t.query(api.stops.countStops, { kind: "traffic", groupBy: "year" });
    expect(r).toMatchObject({ status: "ok", total: 15, period: "2021 Q4 – 2023 Q4", groups: [{ label: "2021", n: 13 }, { label: "2023", n: 2 }] });
  });
});
