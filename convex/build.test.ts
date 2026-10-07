/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "./settings";
import { installFakeFetch } from "../tests/helpers/fakeFetch";
import { fixtureFamilies } from "../tests/helpers/fixtures";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
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
