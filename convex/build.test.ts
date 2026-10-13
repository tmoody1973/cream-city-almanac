/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "./settings";
import { installFakeFetch } from "../tests/helpers/fakeFetch";
import { cityPackages, CRIME_CURRENT_RID, propertyPackages, YEAR_RIDS } from "../tests/helpers/cityFixtures";
import { MPROP_RID } from "./lib/cityProfile";
import { fixtureFamilies } from "../tests/helpers/fixtures";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { groupCityItems } from "./lib/cityFamilies";
import { parseCkan } from "./lib/ckan";
import { toFamilyInput } from "./lib/families";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");
const OBESITY = "dataset:obesity-prevalence";
const PORTRAIT = "document:neighborhood-portrait";

beforeEach(() => {
  vi.stubEnv("AI_GATEWAY_API_KEY", "test-key");
  vi.stubEnv("FIRECRAWL_API_KEY", "fc-test");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

async function seed(t: TestConvex<typeof schema>, settings: Partial<typeof DEFAULT_SETTINGS> = {}) {
  await t.run((ctx) => ctx.db.insert("settings", { ...DEFAULT_SETTINGS, ...settings }));
  const buildId = await t.mutation(internal.buildStore.beginBuild, {});
  const families = fixtureFamilies().map((f) => toFamilyInput(f, f.key === OBESITY ? "Milwaukee County Obesity Preval" : null));
  await t.mutation(internal.buildStore.swapCatalog, {
    buildId,
    families,
    dictionaries: [
      {
        tab: "Milwaukee County Obesity Preval",
        dataSource: "CDC Places",
        fields: [{ label: "GEOID", description: "Census Tract identifier", source: "", calculation: "" }],
      },
    ],
  });
  await t.mutation(internal.buildStore.setPending, {
    buildId,
    pending: 100,
    hubCounts: { rawData: 93, reports: 282, visualizations: 7 },
    pdfReports: 180,
    notes: [],
    mismatch: { unlinkedTabs: [], suspectLinks: [], unmatchedHomeTitles: [], typoFixes: [] },
  });
  return buildId;
}

const cardOf = (t: TestConvex<typeof schema>, key: string) =>
  t.run((ctx) => ctx.db.query("cards").withIndex("by_family", (q) => q.eq("familyKey", key)).first());
const buildOf = (t: TestConvex<typeof schema>, id: Id<"builds">) => t.run((ctx) => ctx.db.get(id));

describe("processFamily", () => {
  it("writes a card with DYCU-first glossary, an embedding and a cost", async () => {
    const t = convexTest(schema, modules);
    installFakeFetch();
    const buildId = await seed(t);
    await t.action(internal.build.processFamily, { buildId, familyKey: OBESITY });
    const card = await cardOf(t, OBESITY);
    expect(card!.glossary).toEqual([
      { field: "GEOID", meaning: "Census Tract identifier", provenance: "DYCU" },
      { field: "per_obesity", meaning: "Estimated percent of adults with obesity.", provenance: "AI" },
    ]);
    expect(card!.embedding).toHaveLength(1536);
    const build = await buildOf(t, buildId);
    expect(build!.done).toBe(1);
    expect(build!.costUsd).toBeGreaterThan(0);
    const family = await t.run((ctx) => ctx.db.query("families").withIndex("by_key", (q) => q.eq("key", OBESITY)).first());
    expect(family!.searchText).toContain("Census Tract identifier");
  });

  it("skips a family whose inputs have not changed", async () => {
    const t = convexTest(schema, modules);
    const fake = installFakeFetch();
    const buildId = await seed(t);
    await t.action(internal.build.processFamily, { buildId, familyKey: OBESITY });
    await t.action(internal.build.processFamily, { buildId, familyKey: OBESITY });
    expect(fake.countSchema("dataset_card")).toBe(1);
    expect((await buildOf(t, buildId))!.skipped).toBe(1);
  });

  it("writes a basic card when the budget is exhausted and no card exists", async () => {
    const t = convexTest(schema, modules);
    const fake = installFakeFetch();
    const buildId = await seed(t, { buildCapUsd: 0 });
    await t.action(internal.build.processFamily, { buildId, familyKey: OBESITY });
    const card = await cardOf(t, OBESITY);
    expect(card).toMatchObject({ basic: true, explainerProvenance: "HUB" });
    expect(fake.countSchema("dataset_card")).toBe(0);
  });

  it("keeps the last good card when the budget is exhausted", async () => {
    const t = convexTest(schema, modules);
    installFakeFetch();
    const buildId = await seed(t);
    await t.action(internal.build.processFamily, { buildId, familyKey: OBESITY });
    const before = await cardOf(t, OBESITY);
    await t.run(async (ctx) => {
      const s = await ctx.db.query("settings").first();
      await ctx.db.patch(s!._id, { buildCapUsd: 0 });
    });
    installFakeFetch({ columns: [{ name: "GEOID" }, { name: "per_obesity" }, { name: "new_column" }] });
    await t.action(internal.build.processFamily, { buildId, familyKey: OBESITY });
    const after = await cardOf(t, OBESITY);
    expect(after!._id).toBe(before!._id);
    const build = await buildOf(t, buildId);
    expect(build!.failed).toBe(1);
    expect(build!.notes.join(" ")).toContain("budget cap reached; kept last card");
  });

  it("writes a basic card when the AI output is invalid twice", async () => {
    const t = convexTest(schema, modules);
    const fake = installFakeFetch({ card: "not json" });
    const buildId = await seed(t);
    await t.action(internal.build.processFamily, { buildId, familyKey: OBESITY });
    expect(fake.countSchema("dataset_card")).toBe(2);
    expect((await cardOf(t, OBESITY))!.basic).toBe(true);
    expect((await buildOf(t, buildId))!.notes.join(" ")).toContain("AI failed twice");
  });
});

describe("processReport", () => {
  const portraitHubId = () => fixtureFamilies().find((f) => f.key === PORTRAIT)!.members[0].hubId;

  it("stores section chunks once and skips unchanged reports", async () => {
    const t = convexTest(schema, modules);
    const fake = installFakeFetch();
    const buildId = await seed(t);
    const hubId = portraitHubId();
    await t.action(internal.build.processReport, { buildId, hubId });
    await t.action(internal.build.processReport, { buildId, hubId });
    const chunks = await t.run((ctx) => ctx.db.query("docChunks").withIndex("by_hubId", (q) => q.eq("hubId", hubId)).collect());
    expect(chunks.map((c) => c.section)).toEqual(["Harambee Neighborhood Portrait", "Housing"]);
    expect(fake.count("api.firecrawl.dev")).toBe(1);
    expect((await buildOf(t, buildId))!.firecrawlCalls).toBe(1);
  });

  it("keeps old text when Firecrawl fails on a changed report", async () => {
    const t = convexTest(schema, modules);
    installFakeFetch();
    const buildId = await seed(t);
    const hubId = portraitHubId();
    await t.action(internal.build.processReport, { buildId, hubId });
    await t.run(async (ctx) => {
      const m = await ctx.db.query("members").withIndex("by_hubId", (q) => q.eq("hubId", hubId)).first();
      await ctx.db.patch(m!._id, { modified: "2099-01-01T00:00:00Z" });
    });
    installFakeFetch({ firecrawlStatus: 500 });
    await t.action(internal.build.processReport, { buildId, hubId });
    const chunks = await t.run((ctx) => ctx.db.query("docChunks").withIndex("by_hubId", (q) => q.eq("hubId", hubId)).collect());
    expect(chunks).toHaveLength(2);
    expect((await buildOf(t, buildId))!.failed).toBe(1);
  });
});

describe("finish", () => {
  it("completes the build when every item reports and removes orphaned chunks", async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    installFakeFetch();
    const buildId = await seed(t);
    await t.run(async (ctx) => {
      await ctx.db.patch(buildId, { pending: 1 });
      await ctx.db.insert("docChunks", { hubId: "gone", modified: "x", section: "s", text: "t", embedding: new Array(1536).fill(0.1) });
    });
    await t.action(internal.build.processFamily, { buildId, familyKey: OBESITY });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const build = await buildOf(t, buildId);
    expect(build!.status).toBe("completed");
    expect(build!.orphanChunksDeleted).toBe(1);
    expect(build!.report).toContain("Cost: $");
  });
});

const CRIME = "city:nibrs-crime-data";

async function seedCity(t: TestConvex<typeof schema>, packages = cityPackages()) {
  await t.run((ctx) => ctx.db.insert("settings", { ...DEFAULT_SETTINGS }));
  const buildId = await t.mutation(internal.buildStore.beginBuild, {});
  const families = groupCityItems(parseCkan(packages as never), new Date("2026-10-09T12:00:00Z")).map((f) => toFamilyInput(f, null));
  await t.mutation(internal.buildStore.swapCatalog, { buildId, families, dictionaries: [] });
  await t.mutation(internal.buildStore.setPending, {
    buildId,
    pending: families.length,
    hubCounts: { rawData: 0, reports: 0, visualizations: 0 },
    pdfReports: 0,
    notes: [],
    mismatch: { unlinkedTabs: [], suspectLinks: [], unmatchedHomeTitles: [], typoFixes: [] },
  });
  return buildId;
}

const crimeSql = (sql: string) =>
  sql.startsWith("SELECT COUNT(*)") ? [{ n: "110461" }]
    : sql.includes("MIN(") ? [{ lo: "2024-01-01T00:00:00", hi: "2026-10-08T00:00:00" }]
    : sql.includes("unnest(") ? [{ v: "13A", n: "9" }, { v: "120", n: "4" }]
    : sql.includes('"Offense_All" AS v') ? [{ v: "240", n: "13619" }, { v: "13A;120", n: "4" }]
    : [{ v: "6", n: "500" }];
const crimeFake = () =>
  installFakeFetch({
    cityFields: [{ id: "Incident_Date", type: "text" }, { id: "Police_District", type: "text" }, { id: "Offense_All", type: "text" }],
    citySql: crimeSql,
  });
const crimeFamily = (t: TestConvex<typeof schema>) =>
  t.run((ctx) => ctx.db.query("families").withIndex("by_key", (q) => q.eq("key", CRIME)).first());

describe("City profiles", () => {
  it("profiles a live City family without re-dating a first-ever profile", async () => {
    const t = convexTest(schema, modules);
    const buildId = await seedCity(t);
    const before = (await crimeFamily(t))!.latestModified;
    crimeFake();
    await t.action(internal.build.processFamily, { buildId, familyKey: CRIME });
    const p = await t.run((ctx) => ctx.db.query("cityProfiles").withIndex("by_family", (q) => q.eq("familyKey", CRIME)).first());
    expect(p).toMatchObject({ rowCount: 110461, dateColumn: "Incident_Date", districtColumns: ["Police_District"] });
    // "13A;120" is one incident with two offenses: the menu holds single codes, profiled through unnest (C1).
    expect(p!.categories.find((c) => c.column === "Offense_All")).toEqual({ column: "Offense_All", values: [{ value: "13A", count: 9 }, { value: "120", count: 4 }], multi: true });
    expect(p!.categories.find((c) => c.column === "Police_District")).not.toHaveProperty("multi");
    expect((await crimeFamily(t))!.latestModified).toBe(before);
  });

  it("profiles the (Current) resource even when Historical comes first and ties on modified", async () => {
    const t = convexTest(schema, modules);
    const buildId = await seedCity(t, [...cityPackages()].reverse());
    crimeFake();
    await t.action(internal.build.processFamily, { buildId, familyKey: CRIME });
    const p = await t.run((ctx) => ctx.db.query("cityProfiles").withIndex("by_family", (q) => q.eq("familyKey", CRIME)).first());
    expect(p!.resourceId).toBe(CRIME_CURRENT_RID);
  });

  it("counts the newest of several live files and names it on the profile (C2)", async () => {
    const t = convexTest(schema, modules);
    const [crime, ...rest] = cityPackages();
    const file = (id: string, name: string, last_modified: string) => ({ id, name, format: "CSV", url: `https://x/${name}.csv`, datastore_active: true, last_modified });
    const yearly = { ...crime, title: "NIBRS Crime Data", resources: [file("22222222-2222-2222-2222-222222222222", "2024", "2025-01-02T00:00:00"), file(CRIME_CURRENT_RID, "2025", "2026-01-02T00:00:00")] };
    const buildId = await seedCity(t, [yearly, ...rest.filter((p) => !/Historical/.test(p.title))]);
    crimeFake();
    await t.action(internal.build.processFamily, { buildId, familyKey: CRIME });
    const p = await t.run((ctx) => ctx.db.query("cityProfiles").withIndex("by_family", (q) => q.eq("familyKey", CRIME)).first());
    expect(p).toMatchObject({ resourceId: CRIME_CURRENT_RID, resourceName: "2025" });
  });

  const staleProfile = (familyKey: string) => ({
    familyKey, resourceId: CRIME_CURRENT_RID, columns: [], dateColumn: null, districtColumns: [], categories: [],
    rowCount: 5, minDate: null, maxDate: null, namesPeople: false, signature: "s", updatedAt: 1,
  });
  const profileOf = (t: TestConvex<typeof schema>, key: string) =>
    t.run((ctx) => ctx.db.query("cityProfiles").withIndex("by_family", (q) => q.eq("familyKey", key)).first());

  it("drops the profile of a City family that no longer has a live resource, so it can't be counted (I4)", async () => {
    const t = convexTest(schema, modules);
    const buildId = await seedCity(t);
    await t.run((ctx) => ctx.db.insert("cityProfiles", staleProfile("city:election-2016-11-08")));
    crimeFake();
    await t.action(internal.build.processFamily, { buildId, familyKey: "city:election-2016-11-08" });
    expect(await profileOf(t, "city:election-2016-11-08")).toBeNull();
  });

  it("drops the profile when the City won't describe the resource's columns (I4)", async () => {
    const t = convexTest(schema, modules);
    const buildId = await seedCity(t);
    await t.run((ctx) => ctx.db.insert("cityProfiles", staleProfile(CRIME)));
    installFakeFetch({ cityStatus: 500 });
    await t.action(internal.build.processFamily, { buildId, familyKey: CRIME });
    expect(await profileOf(t, CRIME)).toBeNull();
    expect((await buildOf(t, buildId))!.failed).toBe(1);
  });

  it("never re-dates a City family, even when its columns changed since the last profile", async () => {
    const t = convexTest(schema, modules);
    const buildId = await seedCity(t);
    const before = (await crimeFamily(t))!.latestModified;
    await t.run((ctx) =>
      ctx.db.insert("cityProfiles", {
        familyKey: CRIME, resourceId: "old", columns: [], dateColumn: null, districtColumns: [], categories: [],
        rowCount: 1, minDate: null, maxDate: null, namesPeople: false, signature: "Old_Column", updatedAt: 1,
      }),
    );
    crimeFake();
    await t.action(internal.build.processFamily, { buildId, familyKey: CRIME });
    expect((await crimeFamily(t))!.latestModified).toBe(before);
  });

  it("still stores the profile when the point sample fails, with no point columns", async () => {
    const t = convexTest(schema, modules);
    const buildId = await seedCity(t);
    installFakeFetch({
      cityFields: [
        { id: "Incident_Date", type: "text" }, { id: "Police_District", type: "text" }, { id: "Offense_All", type: "text" },
        { id: "Address_Latitude", type: "numeric" }, { id: "Address_Longitude", type: "numeric" },
      ],
      citySql: (sql) => {
        if (sql.includes(" AS lat")) throw new Error("sample refused");
        return crimeSql(sql);
      },
    });
    await t.action(internal.build.processFamily, { buildId, familyKey: CRIME });
    expect(await profileOf(t, CRIME)).toMatchObject({ rowCount: 110461, dateColumn: "Incident_Date", latColumn: null, lonColumn: null });
  });
});

describe("crime history (K1)", () => {
  const HIST = "11111111-2222-3333-4444-555555555555";
  const FIELDS = [{ id: "Incident_Date", type: "text" }, { id: "Police_District", type: "text" }, { id: "Offense_All", type: "text" }];
  const profileOf = (t: TestConvex<typeof schema>) => t.run((ctx) => ctx.db.query("cityProfiles").withIndex("by_family", (q) => q.eq("familyKey", CRIME)).first());

  it("reads crime's Historical file with Current from 2005 when their columns match", async () => {
    const t = convexTest(schema, modules);
    await seedCity(t);
    crimeFake();
    expect(await t.action(internal.build.reprofileCity, { familyKey: CRIME })).toEqual([]);
    expect(await profileOf(t)).toMatchObject({ resourceId: CRIME_CURRENT_RID, minDate: "2005-01-01", archive: { resourceId: HIST, before: "2024-01-01" } });
  });
  it("counts Current alone, and says why, when the Historical file's columns differ", async () => {
    const t = convexTest(schema, modules);
    await seedCity(t);
    installFakeFetch({ cityFields: FIELDS, cityFieldsFor: (rid) => (rid === HIST ? [{ id: "Incident_Date", type: "text" }] : undefined), citySql: crimeSql });
    expect(await t.action(internal.build.reprofileCity, { familyKey: CRIME })).toEqual([`${CRIME}: Historical file's columns differ; counting the Current file only`]);
    const p = await profileOf(t);
    expect(p?.archive ?? null).toBeNull();
    expect(p?.minDate).toBe("2024-01-01");
  });
  it("re-profiles without asking the AI for a card", async () => {
    const t = convexTest(schema, modules);
    await seedCity(t);
    const f = crimeFake();
    await t.action(internal.build.reprofileCity, { familyKey: CRIME });
    expect(f.count("/v1/chat/completions")).toBe(0);
  });
  it("the weekly build stores the archive too, and a mismatch reaches the build's notes", async () => {
    const t = convexTest(schema, modules);
    const buildId = await seedCity(t);
    installFakeFetch({ cityFields: FIELDS, cityFieldsFor: (rid) => (rid === HIST ? [{ id: "Incident_Date", type: "text" }] : undefined), citySql: crimeSql });
    await t.action(internal.build.processFamily, { buildId, familyKey: CRIME });
    expect((await buildOf(t, buildId))!.notes.join(" ")).toContain("Historical file's columns differ");
  });

  it("keeps the seam at Jan 1, 2024 when Current holds a stray older date, and the build says so (review fix)", async () => {
    const t = convexTest(schema, modules);
    await seedCity(t);
    installFakeFetch({ cityFields: FIELDS, citySql: (sql) => (sql.includes("MIN(") ? [{ lo: "1924-05-01T00:00:00", hi: "2026-10-08T00:00:00" }] : crimeSql(sql)) });
    const notes = await t.action(internal.build.reprofileCity, { familyKey: CRIME });
    expect(await profileOf(t)).toMatchObject({ minDate: "2005-01-01", archive: { resourceId: HIST, before: "2024-01-01" } });
    expect(notes).toEqual([`${CRIME}: Current file has records dated before 2024-01-01; combined counts leave them out`]);
  });
  it("says so when the profile couldn't be rebuilt, instead of returning no notes (CodeRabbit, PR #37)", async () => {
    const t = convexTest(schema, modules);
    await seedCity(t);
    installFakeFetch({ cityFields: FIELDS, citySql: (sql) => { if (sql.includes("COUNT(*)")) throw new Error("refused"); return crimeSql(sql); } });
    const notes = await t.action(internal.build.reprofileCity, { familyKey: CRIME });
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatch(new RegExp(`^${CRIME}: profile not updated`));
  });
  it("doesn't join when a column's type differs, even with the same names (review fix)", async () => {
    const t = convexTest(schema, modules);
    await seedCity(t);
    const retyped = FIELDS.map((f) => (f.id === "Police_District" ? { ...f, type: "numeric" } : f));
    installFakeFetch({ cityFields: FIELDS, cityFieldsFor: (rid) => (rid === HIST ? retyped : undefined), citySql: crimeSql });
    expect(await t.action(internal.build.reprofileCity, { familyKey: CRIME })).toEqual([`${CRIME}: Historical file's columns differ; counting the Current file only`]);
    expect((await profileOf(t))?.archive ?? null).toBeNull();
  });
});

describe("property history (K2)", () => {
  const MPROP = "city:master-property-file-mprop";
  const CLASSIC = ["TAXKEY", "YR_ASSMT", "C_A_TOTAL", "GEO_ALDER", "GEO_TRACT", "OWN_OCPD", "C_A_CLASS", "CONVEY_DATE"].map((id) => ({ id, type: "text" }));
  const SHORT = ["Taxkey", "AssessValu", "DistrictNa", "IsOwnerOcc", "PrevNonExe"].map((id) => ({ id, type: "text" }));
  const LONG = ["Taxkey", "TotalAssessedValue", "DistrictName", "IsOwnerOccupied", "PrevNonExemptClass"].map((id) => ({ id, type: "text" }));
  const fieldsFor = (overrides: Partial<Record<string, { id: string; type: string }[] | "throw">> = {}) => (rid: string) => {
    const o = overrides[rid];
    if (o === "throw") throw new Error("403 Forbidden");
    if (o) return o;
    return rid === YEAR_RIDS[2022] ? SHORT : rid === YEAR_RIDS[2025] ? LONG : CLASSIC;
  };
  const propertySql = (sql: string) =>
    sql.startsWith("SELECT COUNT(*)") ? [{ n: "159950" }]
      : sql.includes("MIN(") ? [{ lo: "1900-01-01T00:00:00", hi: "2026-09-30T00:00:00" }]
      : sql.includes('"YR_ASSMT" AS v') ? [{ v: "2026", n: "159556" }, { v: "2025", n: "394" }]
      : [{ v: "1", n: "500" }];
  const profileOf = (t: TestConvex<typeof schema>) => t.run((ctx) => ctx.db.query("cityProfiles").withIndex("by_family", (q) => q.eq("familyKey", MPROP)).first());

  it("stores each year from 2005 with its layout, and today's file as its assessment year", async () => {
    const t = convexTest(schema, modules);
    await seedCity(t, [...cityPackages(), ...propertyPackages()]);
    installFakeFetch({ cityFields: CLASSIC, cityFieldsFor: fieldsFor(), citySql: propertySql });
    expect(await t.action(internal.build.reprofileCity, { familyKey: MPROP })).toEqual([]);
    expect((await profileOf(t))?.years).toEqual([
      { year: 2005, resourceId: YEAR_RIDS[2005], layout: "classic" },
      { year: 2022, resourceId: YEAR_RIDS[2022], layout: "short" },
      { year: 2025, resourceId: YEAR_RIDS[2025], layout: "long" },
      { year: 2026, resourceId: MPROP_RID, layout: "classic" },
    ]);
  });
  it("skips a year whose columns match no layout, and says so", async () => {
    const t = convexTest(schema, modules);
    await seedCity(t, [...cityPackages(), ...propertyPackages()]);
    installFakeFetch({ cityFields: CLASSIC, cityFieldsFor: fieldsFor({ [YEAR_RIDS[2022]]: [{ id: "Weird", type: "text" }] }), citySql: propertySql });
    expect(await t.action(internal.build.reprofileCity, { familyKey: MPROP })).toEqual([`${MPROP}: 2022 file's columns match no known layout; skipped`]);
    expect((await profileOf(t))?.years?.map((y) => y.year)).toEqual([2005, 2025, 2026]);
  });
  it("skips a year the City refuses to describe, and keeps the others (review focus 1)", async () => {
    const t = convexTest(schema, modules);
    await seedCity(t, [...cityPackages(), ...propertyPackages()]);
    installFakeFetch({ cityFields: CLASSIC, cityFieldsFor: fieldsFor({ [YEAR_RIDS[2025]]: "throw" }), citySql: propertySql });
    const notes = await t.action(internal.build.reprofileCity, { familyKey: MPROP });
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatch(new RegExp(`^${MPROP}: 2025 file unavailable; skipped`));
    expect((await profileOf(t))?.years?.map((y) => y.year)).toEqual([2005, 2022, 2026]);
  });
  it("stores no years, and says why, when the history package isn't in the catalog", async () => {
    const t = convexTest(schema, modules);
    await seedCity(t, [...cityPackages(), propertyPackages()[0]]);
    installFakeFetch({ cityFields: CLASSIC, citySql: propertySql });
    expect(await t.action(internal.build.reprofileCity, { familyKey: MPROP })).toEqual([`${MPROP}: no yearly property files found`]);
    expect((await profileOf(t))?.years ?? null).toBeNull();
  });
});
