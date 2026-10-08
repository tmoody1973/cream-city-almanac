/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installFakeFetch } from "../tests/helpers/fakeFetch";
import { fixtureFamilies } from "../tests/helpers/fixtures";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { toFamilyInput } from "./lib/families";
import schema from "./schema";
import { DEFAULT_SETTINGS } from "./settings";

const modules = import.meta.glob("./**/*.*s");
const SPREADSHEETS = "document:neighborhood-portrait-spreadsheet";

beforeEach(() => vi.stubEnv("AI_GATEWAY_API_KEY", "test-key"));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function seed(t: TestConvex<typeof schema>) {
  await t.run((ctx) => ctx.db.insert("settings", { ...DEFAULT_SETTINGS }));
  const buildId = await t.mutation(internal.buildStore.beginBuild, {});
  await t.mutation(internal.buildStore.swapCatalog, { buildId, families: fixtureFamilies().map((f) => toFamilyInput(f, null)), dictionaries: [] });
  await t.mutation(internal.buildStore.setPending, {
    buildId,
    pending: 10,
    hubCounts: { rawData: 93, reports: 282, visualizations: 7 },
    pdfReports: 180,
    notes: [],
    mismatch: { unlinkedTabs: [], suspectLinks: [], unmatchedHomeTitles: [], typoFixes: [] },
  });
  const hubId = fixtureFamilies().find((f) => f.key === SPREADSHEETS)!.members[0].hubId;
  return { buildId, hubId };
}

const tablesOf = (t: TestConvex<typeof schema>, hubId: string) =>
  t.run((ctx) => ctx.db.query("portraitTables").withIndex("by_hubId", (q) => q.eq("hubId", hubId)).collect());
const chunksOf = (t: TestConvex<typeof schema>, hubId: string) =>
  t.run((ctx) => ctx.db.query("docChunks").withIndex("by_hubId", (q) => q.eq("hubId", hubId)).collect());
const buildOf = (t: TestConvex<typeof schema>, id: Id<"builds">) => t.run((ctx) => ctx.db.get(id));

describe("processPortrait", () => {
  it("stores one table and one search passage per tab", async () => {
    const t = convexTest(schema, modules);
    installFakeFetch();
    const { buildId, hubId } = await seed(t);
    await t.action(internal.build.processPortrait, { buildId, hubId });
    const tables = await tablesOf(t, hubId);
    expect(tables).toHaveLength(16);
    expect(tables.find((x) => x.slug === "race-and-ethnicity")!.tableIds).toEqual(["B03002"]);
    const chunks = await chunksOf(t, hubId);
    expect(chunks).toHaveLength(16);
    expect(chunks.map((c) => c.section)).toContain("Race and Ethnicity");
  });

  it("skips a file that hasn't changed", async () => {
    const t = convexTest(schema, modules);
    const fake = installFakeFetch();
    const { buildId, hubId } = await seed(t);
    await t.action(internal.build.processPortrait, { buildId, hubId });
    const before = fake.count("/content/items/");
    await t.action(internal.build.processPortrait, { buildId, hubId });
    expect(fake.count("/content/items/")).toBe(before);
  });

  it("keeps last week's tables when a file fails, and names it in the build", async () => {
    const t = convexTest(schema, modules);
    installFakeFetch();
    const { buildId, hubId } = await seed(t);
    await t.action(internal.build.processPortrait, { buildId, hubId });
    await t.run(async (ctx) => {
      const m = (await ctx.db.query("members").withIndex("by_hubId", (q) => q.eq("hubId", hubId)).first())!;
      await ctx.db.patch(m._id, { modified: "2099-01-01T00:00:00.000Z" });
    });
    installFakeFetch({ portraitStatus: 500 });
    await t.action(internal.build.processPortrait, { buildId, hubId });
    expect(await tablesOf(t, hubId)).toHaveLength(16);
    expect((await buildOf(t, buildId))!.notes.join(" ")).toContain(`spreadsheet ${hubId}`);
  });
});
