/// <reference types="vite/client" />
import { afterEach, describe, expect, it, vi } from "vitest";
import { installFakeFetch } from "../tests/helpers/fakeFetch";
import { api } from "./_generated/api";
import { MPROP_RID } from "./lib/cityProfile";
import { EXACT } from "./lib/propertyMeasures";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");

const reader = { subject: "u1", issuer: "test", tokenIdentifier: "test|u1" };
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

const POV_FIELDS = [
  { name: "GEOID", type: "esriFieldTypeString" },
  { name: "pov_rate", type: "esriFieldTypeDouble" },
  { name: "pov_rate_moe", type: "esriFieldTypeDouble" },
];
// The same 25 tracts as tracts.test.ts's povertyRows (100000..102300, and 186000 = Harambee), as the City writes them.
const TRACTS = [...Array.from({ length: 24 }, (_, i) => String(100000 + i * 100)), "186000"];
const povertyRows = () => ({ features: TRACTS.map((t, i) => ({ attributes: { GEOID: `55079${t}`, pov_rate: t === "186000" ? 58 : 10 + i, pov_rate_moe: 1 } })) });
// Home values rise with the tract number; Harambee's are the lowest. A thin tract and a "no tract" row ride along.
const measureRows = () => [
  ...TRACTS.map((t, i) => ({ t, v: t === "186000" ? 60000 : 150000 + i * 10000, n: "120" })),
  { t: "999900", v: "500000", n: "12" },
  { t: "000000", v: "80000", n: "900" },
];

// Self-contained (importing tracts.test.ts would run its tests again): E02 City 2022, Harambee's DYCU definition, H28.
async function seed() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  await t.run(async (ctx) => {
    await ctx.db.insert("families", { key: "e02", code: "E02", name: "Households Living in Poverty", kind: "dataset", topic: "Economy", keywords: [], places: ["City"], years: [2022], latestModified: "2024-01-01", baseSearchText: "", searchText: "", dictionaryTab: null });
    await ctx.db.insert("members", { familyKey: "e02", hubId: "h1", title: "Poverty 2022", yearLabel: "2022", featureServerUrl: "https://services.arcgis.com/x/arcgis/rest/services/Poverty_2022/FeatureServer/0", kind: "dataset", landingPage: "", place: "City", years: [2022], modified: "2024-01-01", downloads: {}, description: "", keywords: [] });
    await ctx.db.insert("cards", { familyKey: "e02", inputHash: "h", explainer: "x", explainerProvenance: "AI", hubSummary: "", glossary: [{ field: "pov_rate", meaning: "Share of households below the poverty line.", provenance: "DYCU" }], caveats: ["Survey estimates pool five years."], storyAngles: [], basic: false, embedding: new Array(1536).fill(0) });
    await ctx.db.insert("neighborhoods", { definition: "dycu", name: "Harambee", matchKey: "harambee", tracts: [{ years: [2021, 2022, 2023, 2024], tracts: ["1860"] }] });
    await ctx.db.insert("families", { key: "city:master-property-file-mprop", code: "H28", name: "Master Property File (MPROP)", kind: "dataset", topic: "Housing", keywords: [], places: ["City"], years: [], latestModified: "2026-10-01", baseSearchText: "", searchText: "", dictionaryTab: null, source: "city", live: true });
    await ctx.db.insert("cards", { familyKey: "city:master-property-file-mprop", inputHash: "h", explainer: "x", explainerProvenance: "AI", hubSummary: "", glossary: [], caveats: ["Values are the City's assessments."], storyAngles: [], basic: false, embedding: new Array(1536).fill(0) });
    await ctx.db.insert("cityProfiles", { familyKey: "city:master-property-file-mprop", resourceId: MPROP_RID, columns: [], dateColumn: "CONVEY_DATE", districtColumns: [], categories: [{ column: "YR_ASSMT", values: [{ value: "2026", count: 159555 }, { value: "2025", count: 394 }] }, { column: "STREET", values: [{ value: "15TH", count: 1926 }] }], rowCount: 159949, minDate: "1900-01-01", maxDate: "2026-09-30", namesPeople: true, signature: "s", updatedAt: 0 });
  });
  return t;
}

const FORBIDDEN = /OWNER_|OWNER MAIL|TAXKEY|HOUSE_NR|"STREET"|15TH/;

describe("property measures in the tract tools", () => {
  it("ranks tracts on typical home value as exact City figures, named by DYCU's newest definitions", async () => {
    const t = await seed();
    installFakeFetch({ columns: POV_FIELDS, tractRows: povertyRows, citySql: () => measureRows() });
    const r = await t.withIdentity(reader).action(api.tracts.rankTracts, { code: "h28", column: "median_value", place: "County", year: "2023", direction: "low" });
    expect(r).toMatchObject({ status: "ok", tool: "rank", header: { code: "H28", column: "median_value", confidence: EXACT, place: "City", year: "2026 assessment", n: 25, leftOut: 2 } });
    if (r.status !== "ok") return;
    expect(r.top[0]).toMatchObject({ tract: "1860", neighborhood: "Harambee", value: 60000, lo: 60000, hi: 60000, unreliable: false });
    expect(r.unreliableCount).toBe(0);
    expect(JSON.stringify(r)).not.toMatch(FORBIDDEN);
  });
  it("offers only the measures when the column isn't one, including an owner or street column", async () => {
    const t = await seed();
    installFakeFetch({ citySql: () => { throw new Error("must not query the City"); } });
    for (const column of ["OWNER_NAME_1", "STREET", "C_A_TOTAL"]) {
      const r = await t.withIdentity(reader).action(api.tracts.rankTracts, { code: "H28", column, place: "City", year: "2023", direction: "high" });
      expect(r).toMatchObject({ status: "choose-column" });
      if (r.status !== "choose-column") return;
      expect(r.columns.map((c) => c.column)).toEqual(["median_value", "share_over", "share_under", "owner_share", "median_year_built"]);
      expect(JSON.stringify(r)).not.toMatch(FORBIDDEN);
    }
  });
  it("asks for a cutoff instead of guessing one", async () => {
    const t = await seed();
    installFakeFetch({ citySql: () => { throw new Error("must not query the City"); } });
    for (const cutoff of [undefined, 5, 200000.5]) {
      const r = await t.withIdentity(reader).action(api.tracts.rankTracts, { code: "H28", column: "share_over", place: "City", year: "2023", direction: "high", ...(cutoff === undefined ? {} : { cutoff }) });
      expect(r).toMatchObject({ status: "choose-column", reason: expect.stringContaining("cutoff") });
    }
  });
  it("lines home values up with a DYCU tract dataset, County asked: City tracts pair and the rest are named for what they are", async () => {
    const t = await seed();
    // County poverty adds a tract outside the City (no property figure).
    const county = () => ({ features: [...povertyRows().features, { attributes: { GEOID: "55079150100", pov_rate: 5, pov_rate_moe: 1 } }] });
    installFakeFetch({ columns: POV_FIELDS, tractRows: county, citySql: () => measureRows() });
    await t.run(async (ctx) => {
      const member = { kind: "dataset" as const, landingPage: "", place: "County", years: [2022], modified: "2024-01-01", downloads: {}, description: "", keywords: [] };
      await ctx.db.insert("members", { familyKey: "e02", hubId: "h9", title: "Poverty County 2022", yearLabel: "2022", featureServerUrl: "https://services.arcgis.com/x/arcgis/rest/services/PovCounty/FeatureServer/0", ...member });
    });
    const r = await t.withIdentity(reader).action(api.tracts.relateTracts, { a: { code: "H28", column: "median_value" }, b: { code: "E02", column: "pov_rate" }, place: "County", year: "2022", mode: "relate" });
    expect(r).toMatchObject({ status: "ok", a: { confidence: EXACT, year: "2026 assessment", n: 25 }, b: { confidence: "90% confidence (Census)", year: "2022", leftOut: 1, leftOutWhy: "no property figure: outside the City or fewer than 30 homes" } });
    expect(JSON.stringify(r)).not.toMatch(FORBIDDEN);
  });
  it("refuses change over time on a property measure, with the reason", async () => {
    const t = await seed();
    installFakeFetch({ citySql: () => { throw new Error("must not query the City"); } });
    const r = await t.withIdentity(reader).action(api.tracts.compareYears, { code: "H28", column: "median_value", place: "City", from: "2025", to: "2026" });
    expect(r).toMatchObject({ status: "choose-year", reason: expect.stringContaining("only the current assessment") });
  });
  it("asks the City once a day per measure, and says unavailable when the City fails", async () => {
    const t = await seed();
    let calls = 0;
    installFakeFetch({ columns: POV_FIELDS, tractRows: povertyRows, citySql: () => { calls++; return measureRows(); } });
    const args = { code: "H28", column: "median_value", place: "City" as const, year: "2023", direction: "high" as const };
    await t.withIdentity(reader).action(api.tracts.rankTracts, args);
    await t.withIdentity(reader).action(api.tracts.rankTracts, args);
    expect(calls).toBe(1);
    installFakeFetch({ citySql: () => { throw new Error("City down"); } });
    expect(await t.withIdentity(reader).action(api.tracts.rankTracts, { ...args, column: "owner_share" })).toEqual({ status: "unavailable" });
  });
  it("doesn't remember an empty answer from the City: it says unavailable and asks again next time", async () => {
    const t = await seed();
    let calls = 0;
    installFakeFetch({ columns: POV_FIELDS, tractRows: povertyRows, citySql: () => { calls++; return []; } });
    const args = { code: "H28", column: "median_value", place: "City" as const, year: "2023", direction: "high" as const };
    expect(await t.withIdentity(reader).action(api.tracts.rankTracts, args)).toEqual({ status: "unavailable" });
    expect(await t.withIdentity(reader).action(api.tracts.rankTracts, args)).toEqual({ status: "unavailable" });
    expect(calls).toBe(2);
  });
});
