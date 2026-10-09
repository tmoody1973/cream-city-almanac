/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cityCatalog } from "../tests/helpers/cityFixtures";
import { installFakeFetch } from "../tests/helpers/fakeFetch";
import { fixtureFamilies, hubCatalog } from "../tests/helpers/fixtures";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("AI_GATEWAY_API_KEY", "test-key");
  vi.stubEnv("FIRECRAWL_API_KEY", "fc-test");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

// Advance the clock a minute at a time, like real time: vi.runAllTimers would jump straight to the
// 2-hour watchdog while items are still mid-flight, which cannot happen in production.
const drain = (t: TestConvex<typeof schema>) => t.finishAllScheduledFunctions(() => vi.advanceTimersByTime(60_000), 500);

async function run(t: TestConvex<typeof schema>) {
  const buildId = await t.action(internal.build.start, {});
  await drain(t);
  return (await t.run((ctx) => ctx.db.get(buildId)))!;
}

const count = (t: TestConvex<typeof schema>, table: "families" | "cards" | "docChunks" | "sources") =>
  t.run(async (ctx) => (await ctx.db.query(table).collect()).length);

describe("weekly build", () => {
  it(
    "builds the whole catalog from the Hub, the sheet, Firecrawl and the AI",
    async () => {
      const t = convexTest(schema, modules);
      installFakeFetch();
      const build = await run(t);
      expect(build.status).toBe("completed");
      expect(build.pending).toBe(49 + 180 + 99);
      expect(build.hubCounts).toEqual({ rawData: 93, reports: 282, visualizations: 7 });
      expect(build.pdfReports).toBe(180);
      expect(await count(t, "families")).toBe(49);
      expect(await count(t, "cards")).toBe(49);
      expect(await count(t, "docChunks")).toBe(360 + 99 * 16);
      expect(await count(t, "sources")).toBe(5);
      expect(build.mismatch!.unlinkedTabs).toEqual(["Milwaukee County Food Insecurit", "Milwaukee County Racial Demogra"]);
      expect(build.report).toContain("Milwaukee County Racial Demogra");
    },
    120_000,
  );

  it(
    "skips everything on an unchanged second run",
    async () => {
      const t = convexTest(schema, modules);
      installFakeFetch();
      await run(t);
      const fake = installFakeFetch();
      const second = await run(t);
      expect(second.status).toBe("completed");
      expect(second.skipped).toBe(229 + 99);
      expect(fake.countSchema("dataset_card")).toBe(0);
      expect(fake.count("api.firecrawl.dev")).toBe(0);
    },
    120_000,
  );

  it(
    "removes report text for items that left the Hub",
    async () => {
      const t = convexTest(schema, modules);
      installFakeFetch();
      await run(t);
      const goneId = fixtureFamilies().find((f) => f.key === "document:neighborhood-portrait")!.members[0].hubId;
      const feed = hubCatalog as { dataset: { identifier: string }[] };
      installFakeFetch({ hubFeed: { dataset: feed.dataset.filter((d) => !d.identifier.includes(goneId)) } });
      const second = await run(t);
      expect(second.orphanChunksDeleted).toBe(2);
      const left = await t.run((ctx) => ctx.db.query("docChunks").withIndex("by_hubId", (q) => q.eq("hubId", goneId)).collect());
      expect(left).toEqual([]);
    },
    120_000,
  );

  it(
    "fails a build that never finishes once the two-hour watchdog fires",
    async () => {
      const t = convexTest(schema, modules);
      installFakeFetch();
      const buildId = await t.action(internal.build.start, {});
      await t.run(async (ctx) => {
        const b = await ctx.db.get(buildId);
        await ctx.db.patch(buildId, { pending: b!.pending + 1 });
      });
      await drain(t);
      // Items are done; now let the clock run out to the 2-hour watchdog.
      await t.finishAllScheduledFunctions(vi.runAllTimers);
      const build = (await t.run((ctx) => ctx.db.get(buildId)))!;
      expect(build.status).toBe("failed");
      expect(build.report).toContain("did not finish within 2 hours");
    },
    120_000,
  );

  it("adds the City's families to the catalog with City codes", async () => {
    const t = convexTest(schema, modules);
    installFakeFetch({ cityCatalog: cityCatalog(), cityFields: [{ id: "Incident_Date", type: "text" }] });
    const build = await run(t);
    expect(build.status).toBe("completed");
    const city = await t.run((ctx) => ctx.db.query("families").collect()).then((fs) => fs.filter((f) => f.source === "city"));
    expect(city.map((f) => [f.key, f.code[0]]).sort()).toEqual([["city:election-2016-11-08", "B"], ["city:nibrs-crime-data", "P"]]);
  }, 120_000);

  it("keeps last week's City families when the City is down", async () => {
    const t = convexTest(schema, modules);
    installFakeFetch({ cityCatalog: cityCatalog() });
    await run(t);
    vi.unstubAllGlobals();
    installFakeFetch({ cityStatus: 500 });
    const build = await run(t);
    expect(build.status).toBe("completed");
    expect((await t.run((ctx) => ctx.db.query("families").collect())).filter((f) => f.source === "city")).toHaveLength(2);
    expect(build.notes.join(" ")).toContain("City catalog unavailable");
  }, 120_000);

  it("fails cleanly and keeps the catalog when the Hub feed is down", async () => {
    const t = convexTest(schema, modules);
    installFakeFetch({ hubStatus: 500 });
    const build = await run(t);
    expect(build.status).toBe("failed");
    expect(build.report).toContain("Hub feed request failed: 500");
    expect(await count(t, "families")).toBe(0);
  });
});
