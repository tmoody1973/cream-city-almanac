/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { strToU8, zipSync } from "fflate";
import { afterEach, describe, expect, it, vi } from "vitest";
import { installFakeFetch } from "../tests/helpers/fakeFetch";
import { api, internal } from "./_generated/api";
import { ELECTIONS } from "./lib/turnout";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");
afterEach(() => vi.unstubAllGlobals());

const link = (rid: string, file: string) => `https://data.milwaukee.gov/dataset/p/resource/${rid}/download/${file}`;
const T19 = "f7b08341-df0c-4c30-898c-b4e13a48714b";
const XL21 = link("5438f374-0000-0000-0000-000000000000", "spring-2021.xlsx");
const CSV20 = link("00b02d77-0000-0000-0000-000000000000", "canvassed.csv");

// A minimal workbook with one "General Turnout" sheet (the reader parses xl/workbook.xml and the sheet XML).
function workbook(rows: string[][]): Uint8Array {
  const cell = (v: string, c: number, r: number) => `<c r="${String.fromCharCode(65 + c)}${r}" t="inlineStr"><is><t>${v}</t></is></c>`;
  const sheet = `<worksheet><sheetData>${rows.map((row, i) => `<row r="${i + 1}">${row.map((v, c) => cell(v, c, i + 1)).join("")}</row>`).join("")}</sheetData></worksheet>`;
  return zipSync({
    "xl/workbook.xml": strToU8(`<workbook><sheets><sheet name="General Turnout" sheetId="1" r:id="rId1"/></sheets></workbook>`),
    "xl/_rels/workbook.xml.rels": strToU8(`<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>`),
    "xl/worksheets/sheet1.xml": strToU8(sheet),
  });
}

async function seed(t: TestConvex<typeof schema>, modified = "2022-09-30T00:00:00") {
  const add = async (key: string, members: { title: string; files: { name: string; format: string; url: string }[] }[]) => t.run(async (ctx) => {
    await ctx.db.insert("families", { key, code: "X", name: key, kind: "dataset", topic: "Elections", keywords: [], places: ["City"], years: [], latestModified: modified, baseSearchText: "", searchText: "", dictionaryTab: null, source: "city", live: true });
    for (const m of members) await ctx.db.insert("members", { familyKey: key, hubId: `${key}:${m.title}`, title: m.title, yearLabel: "", featureServerUrl: "", kind: "dataset", landingPage: "", place: "City", years: [], modified, downloads: {}, description: "", keywords: [], files: m.files });
  });
  await add("city:2019-spring-election-results", [{ title: "2019 Spring Election Results", files: [{ name: "Voter Turnout by Ward", format: "CSV", url: link(T19, "t.csv") }] }]);
  await add("city:2021-spring-election", [{ title: "2021 Spring Election", files: [{ name: "Spring 2021 Election Results Data (1).xlsx", format: "XLSX", url: XL21 }] }]);
  await add("city:2020-general-election", [{ title: "2020 General Election", files: [{ name: "City of Mlwaukee Canvassed Election Results.csv", format: "CSV", url: CSV20 }] }]);
}
const FAKE = (opts: { sheetTotal?: string } = {}) => ({
  cityFieldsFor: (rid: string) => (rid === T19 ? ["Ward", "Registered Voters Total", "Ballots Cast Total", "Ballots Cast Blank", "Voter Turnout Percent"].map((id) => ({ id, type: "text" })) : undefined),
  citySql: () => [{ ward: "1", reg: "1435", bal: "257" }, { ward: "2", reg: "100", bal: "10" }],
  cityDownloads: {
    [XL21]: workbook([["Municipalitiy", "Ward No.", "Registered Voters- Total", "Ballots Cast- Total"], ["City of Milwaukee", "Ward 1", "1583", "139"], ["Total", "", opts.sheetTotal ?? "1583", "139"]]),
    [CSV20]: strToU8('01 = REGISTERED VOTERS - TOTAL,,,,,,"1,502",,,,\n02 = BALLOTS CAST - TOTAL,,,,,,"1,185",,,,\n1,City of Milwaukee Ward,1,1502,1185,0,78.89,,,,\n'),
  },
});
const turnoutOf = (t: TestConvex<typeof schema>, election: string) => t.run((ctx) => ctx.db.query("turnout").withIndex("by_election", (q) => q.eq("election", election)).collect());

describe("refreshTurnout (K4)", () => {
  it("reads a table, a workbook sheet and the printed report; missing families are named", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    installFakeFetch(FAKE());
    const notes = await t.action(internal.elections.refreshTurnout, {});
    expect(notes).toHaveLength(ELECTIONS.length - 3); // the other nine families aren't seeded
    expect(notes[0]).toMatch(/: no turnout file in the catalog$/);
    expect((await turnoutOf(t, "2019-04")).map(({ ward, registered, ballots }) => [ward, registered, ballots])).toEqual([[1, 1435, 257], [2, 100, 10]]);
    expect((await turnoutOf(t, "2021-04")).map((r) => r.registered)).toEqual([1583]);
    expect((await turnoutOf(t, "2020-11")).map((r) => r.ballots)).toEqual([1185]);
    const e = await t.run((ctx) => ctx.db.query("elections").withIndex("by_election", (q) => q.eq("election", "2019-04")).first());
    expect(e).toMatchObject({ status: "read", wards: 2, of: 327, partial: true });
  });
  it("skips an election already read from the same catalog version", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    installFakeFetch(FAKE());
    await t.action(internal.elections.refreshTurnout, {});
    const f = installFakeFetch(FAKE());
    await t.action(internal.elections.refreshTurnout, {});
    expect(f.calls).toHaveLength(0);
  });
  it("fails an election whose wards don't add up to its total, storing nothing (review focus 4)", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    installFakeFetch(FAKE({ sheetTotal: "9999" }));
    const notes = await t.action(internal.elections.refreshTurnout, {});
    expect(notes).toContain("Turnout April 2021 spring election: wards add up to 1583 registered and 139 ballots; the file's total says 9999 and 139; kept any earlier rows");
    expect(await turnoutOf(t, "2021-04")).toHaveLength(0);
  });
});

describe("countTurnout (K4)", () => {
  it("answers from the stored rows", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    installFakeFetch(FAKE());
    await t.action(internal.elections.refreshTurnout, {});
    const r = await t.query(api.elections.countTurnout, { from: 2019, to: 2019 });
    expect(r).toMatchObject({ status: "ok", rows: [{ label: "April 2019 spring election (wards 1–2 of 327 only)", registered: 1535, ballots: 267, turnout: 17.4 }] });
  });
});
