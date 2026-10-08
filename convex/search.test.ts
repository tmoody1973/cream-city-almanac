/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { fakeEmbedding, installFakeFetch } from "../tests/helpers/fakeFetch";
import { fixtureFamilies } from "../tests/helpers/fixtures";
import { api, internal } from "./_generated/api";
import { toFamilyInput } from "./lib/families";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");

beforeEach(() => vi.stubEnv("AI_GATEWAY_API_KEY", "test-key"));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function seed(t: TestConvex<typeof schema>) {
  const buildId = await t.mutation(internal.buildStore.beginBuild, {});
  await t.mutation(internal.buildStore.swapCatalog, {
    buildId,
    families: fixtureFamilies().map((f) => toFamilyInput(f, null)),
    dictionaries: [],
  });
  const portrait = fixtureFamilies().find((f) => f.key === "document:neighborhood-portrait")!;
  const harambee = portrait.members.find((m) => m.place === "Harambee")!;
  await t.run(async (ctx) => {
    await ctx.db.insert("cards", {
      familyKey: "dataset:asthma-prevalence", inputHash: "h", explainer: "Asthma among adults.", explainerProvenance: "AI",
      hubSummary: "", glossary: [], caveats: [], storyAngles: [], basic: false, embedding: fakeEmbedding("asthma prevalence"),
    });
    await ctx.db.insert("docChunks", {
      hubId: harambee.hubId, modified: harambee.modified, section: "Housing",
      text: "Harambee homes were mostly built before 1950.", embedding: fakeEmbedding("harambee housing"),
    });
  });
  return { buildId, harambee };
}

describe("searchCatalog", () => {
  it("handles blank, whitespace and huge queries", async () => {
    const t = convexTest(schema, modules);
    rateLimiterTest.register(t);
    installFakeFetch();
    await seed(t);
    const blank = await t.action(api.search.searchCatalog, { query: "" });
    expect(blank.mode).toBe("rundown");
    expect(blank.results).toHaveLength(10);
    const sorted = [...blank.results].sort((a, b) => b.latestModified.localeCompare(a.latestModified));
    expect(blank.results).toEqual(sorted);
    expect((await t.action(api.search.searchCatalog, { query: " \n\t " })).mode).toBe("rundown");
    expect((await t.action(api.search.searchCatalog, { query: "a".repeat(5000) })).mode).toBe("search");
  });

  it("returns nothing when no dataset is close in meaning or words", async () => {
    const t = convexTest(schema, modules);
    rateLimiterTest.register(t);
    installFakeFetch();
    await seed(t);
    const res = await t.action(api.search.searchCatalog, { query: "zzqqxxjj" });
    expect(res.degraded).toBe(false);
    expect(res.results).toEqual([]);
  });

  it("falls back to keywords when embeddings fail", async () => {
    const t = convexTest(schema, modules);
    rateLimiterTest.register(t);
    installFakeFetch({ embeddingsStatus: 500 });
    await seed(t);
    const res = await t.action(api.search.searchCatalog, { query: "asthma" });
    expect(res.degraded).toBe(true);
    expect(res.results.map((r) => r.key)).toContain("dataset:asthma-prevalence");
  });

  it("ranks a family found by both keyword and meaning first", async () => {
    const t = convexTest(schema, modules);
    rateLimiterTest.register(t);
    installFakeFetch();
    await seed(t);
    const res = await t.action(api.search.searchCatalog, { query: "asthma" });
    expect(res.degraded).toBe(false);
    expect(res.results[0].key).toBe("dataset:asthma-prevalence");
    expect(res.results[0].code).toMatch(/^W\d{2}$/);
  });

  it("returns a report snippet for a meaning match inside a PDF", async () => {
    const t = convexTest(schema, modules);
    rateLimiterTest.register(t);
    installFakeFetch();
    const { harambee } = await seed(t);
    const res = await t.action(api.search.searchCatalog, { query: "harambee" });
    const hit = res.results.find((r) => r.key === "document:neighborhood-portrait")!;
    expect(hit.snippet).toEqual({ hubId: harambee.hubId, title: harambee.title, section: "Housing", text: "Harambee homes were mostly built before 1950." });
  });

  it("applies the place filter", async () => {
    const t = convexTest(schema, modules);
    rateLimiterTest.register(t);
    installFakeFetch({ embeddingsStatus: 500 });
    await seed(t);
    const res = await t.action(api.search.searchCatalog, { query: "milwaukee", place: "County" });
    expect(res.results.length).toBeGreaterThan(0);
    expect(res.results.every((r) => r.places.includes("County"))).toBe(true);
  });

  it("the 101st search in a burst falls back to keywords", async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    rateLimiterTest.register(t);
    const fake = installFakeFetch();
    await seed(t);
    for (let i = 0; i < 100; i++) {
      expect((await t.action(api.search.searchCatalog, { query: "asthma" })).degraded).toBe(false);
    }
    const last = await t.action(api.search.searchCatalog, { query: "asthma" });
    expect(last.degraded).toBe(true);
    expect(last.results.map((r) => r.key)).toContain("dataset:asthma-prevalence");
    expect(fake.count("/v1/embeddings")).toBe(100);
    vi.useRealTimers();
  }, 60_000);
});

describe("catalogStatus", () => {
  it("reports the last good build and whether the latest run failed", async () => {
    const t = convexTest(schema, modules);
    rateLimiterTest.register(t);
    const good = await t.mutation(internal.buildStore.beginBuild, {});
    await t.mutation(internal.buildStore.completeBuild, { buildId: good, orphanChunksDeleted: 0 });
    const bad = await t.mutation(internal.buildStore.beginBuild, {});
    await t.mutation(internal.buildStore.failBuild, { buildId: bad, reason: "Hub down" });
    const status = await t.query(api.search.catalogStatus, {});
    const goodRow = await t.run((ctx) => ctx.db.get(good));
    expect(status).toEqual({ asOf: goodRow!.finishedAt, lastRunFailed: true, running: false, counts: null, pdfReports: null });
  });

  it("does not report a build stuck for more than two hours as running", async () => {
    const t = convexTest(schema, modules);
    rateLimiterTest.register(t);
    await t.run((ctx) =>
      ctx.db.insert("builds", {
        status: "running", startedAt: Date.now() - 3 * 3600_000, finishedAt: null, pending: 1, done: 0, skipped: 0,
        failed: 0, costUsd: 0, firecrawlCalls: 0, notes: [], mismatch: null, orphanChunksDeleted: 0, report: null,
      }),
    );
    expect((await t.query(api.search.catalogStatus, {})).running).toBe(false);
  });
});
