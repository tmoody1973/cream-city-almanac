/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { describe, expect, it } from "vitest";
import { fixtureFamilies } from "../tests/helpers/fixtures";
import { api, internal } from "./_generated/api";
import { toFamilyInput } from "./lib/families";
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

  it("catalogStatus reports family and report counts from the last good build", async () => {
    const t = convexTest(schema, modules);
    const buildId = await seed(t);
    await t.mutation(internal.buildStore.setPending, {
      buildId, pending: 226, familyCount: 46, reportCount: 180, notes: [],
      mismatch: { unlinkedTabs: [], suspectLinks: [], unmatchedHomeTitles: [], typoFixes: [] },
    });
    await t.mutation(internal.buildStore.completeBuild, { buildId, orphanChunksDeleted: 0 });
    expect(await t.query(api.search.catalogStatus, {})).toMatchObject({ families: 46, reports: 180, lastRunFailed: false });
  });
});
