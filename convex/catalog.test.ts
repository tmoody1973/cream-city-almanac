/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { describe, expect, it } from "vitest";
import { fixtureFamilies } from "../tests/helpers/fixtures";
import { api, internal } from "./_generated/api";
import { toFamilyInput } from "./lib/families";
import { placeKey } from "./lib/portrait";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");

async function seed(t: TestConvex<typeof schema>) {
  const buildId = await t.mutation(internal.buildStore.beginBuild, {});
  await t.mutation(internal.buildStore.swapCatalog, { buildId, families: fixtureFamilies().map((f) => toFamilyInput(f, null)), dictionaries: [] });
  return buildId;
}
const codeOf = (t: TestConvex<typeof schema>, key: string) =>
  t.run(async (ctx) => (await ctx.db.query("families").withIndex("by_key", (q) => q.eq("key", key)).first())!.code);

describe("catalog queries", () => {
  it("rundown returns the ten most recently updated families, newest first", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const rows = await t.query(api.catalog.rundown, {});
    expect(rows).toHaveLength(10);
    expect(rows.map((r) => r.latestModified)).toEqual([...rows.map((r) => r.latestModified)].sort().reverse());
  });

  it("familySheet accepts lowercase and returns null for unknown codes", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const code = await codeOf(t, "dataset:households-living-in-poverty");
    const sheet = await t.query(api.catalog.familySheet, { code: code.toLowerCase() });
    expect(sheet!.family.name).toBe("Households Living in Poverty");
    expect(sheet!.members).toHaveLength(5);
    expect(sheet!.members.map((m) => m.modified)).toEqual([...sheet!.members.map((m) => m.modified)].sort().reverse());
    expect(sheet!.grid.places).toEqual(["City", "County"]);
    expect(sheet!.card).toBeNull();
    expect(sheet!.fileLabel).toBeNull();
    expect(await t.query(api.catalog.familySheet, { code: "Z99" })).toBeNull();
  });

  it("familySheet gives report families a file link", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const sheet = await t.query(api.catalog.familySheet, { code: await codeOf(t, "document:neighborhood-portrait") });
    expect(sheet!.fileLabel).toBe("PDF");
    expect(sheet!.members[0].fileUrl).toMatch(/^https:\/\/www\.arcgis\.com\/sharing\/rest\/content\/items\/\w+\/data$/);
  });

  it("familyPreview links the newest CSV and falls back to the Hub description", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const preview = await t.query(api.catalog.familyPreview, { key: "dataset:daily-air-quality" });
    expect(preview!.csvUrl).toMatch(/\/csv/);
    expect(preview!.explainerProvenance).toBe("HUB");
    expect(preview!.grid.years).toEqual([2023, 2024, 2025]);
    expect(await t.query(api.catalog.familyPreview, { key: "dataset:nope" })).toBeNull();
  });

  it("catalogStatus reports the Hub-collection counts from the last good build", async () => {
    const t = convexTest(schema, modules);
    const buildId = await seed(t);
    await t.mutation(internal.buildStore.setPending, {
      buildId, pending: 229, hubCounts: { rawData: 93, reports: 282, visualizations: 7 }, pdfReports: 180, notes: [],
      mismatch: { unlinkedTabs: [], suspectLinks: [], unmatchedHomeTitles: [], typoFixes: [] },
    });
    await t.mutation(internal.buildStore.completeBuild, { buildId, orphanChunksDeleted: 0 });
    expect(await t.query(api.search.catalogStatus, {})).toMatchObject({
      counts: { rawData: 93, reports: 282, visualizations: 7 },
      pdfReports: 180,
      lastRunFailed: false,
    });
  });
});

describe("neighborhood spreadsheets", () => {
  it("groups files into neighborhoods whatever their name order, newest first", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const code = await codeOf(t, "document:neighborhood-portrait-spreadsheet");
    const sheet = (await t.query(api.catalog.familySheet, { code }))!;
    const silver = sheet.portraits!.neighborhoods.find((n) => n.key === "burnham-park-layton-park-silver-city")!;
    expect(silver.files.map((f) => f.year)).toEqual([2024, 2023, 2022, 2021]);
    expect(sheet.portraits!.neighborhoods.length).toBeGreaterThan(20);
    const other = (await t.query(api.catalog.familySheet, { code: await codeOf(t, "dataset:food-insecurity-prevalence") }))!;
    expect(other.portraits).toBeNull();
  });

  it("orders a neighborhood's files by year and opens the newest year that has tables", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const code = await codeOf(t, "document:neighborhood-portrait-spreadsheet");
    const members = fixtureFamilies().find((f) => f.key === "document:neighborhood-portrait-spreadsheet")!.members;
    const silver = (year: number) => members.find((m) => placeKey(m.place ?? m.title) === "burnham-park-layton-park-silver-city" && m.years[0] === year)!;
    await t.run(async (ctx) => {
      // DYCU re-uploads the 2021 file (now the most recently modified, not yet read); only the 2024 file has tables.
      const m = (await ctx.db.query("members").withIndex("by_hubId", (q) => q.eq("hubId", silver(2021).hubId)).first())!;
      await ctx.db.patch(m._id, { modified: "2099-01-01T00:00:00.000Z" });
      await ctx.db.insert("portraitTables", {
        hubId: silver(2024).hubId, modified: "m", slug: "race-and-ethnicity", topic: "Race and Ethnicity", tab: "Race and Ethnicity",
        order: 0, tableIds: [], tableIdText: "", vintage: null, groups: [""], rows: [], issues: [],
      });
    });
    const sheet = (await t.query(api.catalog.familySheet, { code }))!;
    expect(sheet.portraits!.neighborhoods.find((n) => n.key === "burnham-park-layton-park-silver-city")!.files.map((f) => f.year)).toEqual([2024, 2023, 2022, 2021]);
    expect(sheet.portraits!.initial!.hubId).toBe(silver(2024).hubId);
  });

  it("returns a file's tables in tab order", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    await t.run(async (ctx) => {
      for (const [order, slug] of [[1, "sex-and-age"], [0, "race-and-ethnicity"]] as const) {
        await ctx.db.insert("portraitTables", {
          hubId: "h1", modified: "m", slug, topic: slug, tab: slug, order, tableIds: [], tableIdText: "", vintage: null, groups: [""], rows: [], issues: [],
        });
      }
    });
    expect((await t.query(api.catalog.portraitTables, { hubId: "h1" })).map((x) => x.slug)).toEqual(["race-and-ethnicity", "sex-and-age"]);
  });
});
