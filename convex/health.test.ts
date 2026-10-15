/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HC_ROWS, HC_TOPICS_PAGE } from "../tests/fixtures/healthCompass";
import { installFakeFetch } from "../tests/helpers/fakeFetch";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");
afterEach(() => vi.unstubAllGlobals());

// Health Compass, faked from the real fixture: topics, and each place's rows.
const hc = (url: string) => {
  if (url.includes("/topics/")) return HC_TOPICS_PAGE;
  const geo = new URL(url).searchParams.get("geography");
  return { count: 0, next: null, previous: null, results: HC_ROWS.filter((r) => r.g === geo) };
};

describe("refreshHealth", () => {
  it("stores one row per place and only topics with a ZIP figure", async () => {
    installFakeFetch({ healthCompass: hc });
    const t = convexTest(schema, modules);
    expect(await t.action(internal.health.refreshHealth, { paceMs: 0 })).toEqual([]);
    const places = await t.run((ctx) => ctx.db.query("healthPlaces").collect());
    expect(places).toHaveLength(39);
    expect(places.find((p) => p.geo === "53208")!.figures.find((f) => f.topic === "MQ35")).toMatchObject({ period: "2024", se: expect.any(Number) });
    expect((await t.run((ctx) => ctx.db.query("healthTopics").collect())).map((x) => x.key).sort()).toEqual(["MQ35", "POV"]);
    expect(await t.run((ctx) => ctx.db.query("healthRefresh").first())).toMatchObject({ status: "read", places: 39 });
  });
  it("keeps last week's copy and says why when Health Compass fails or changes shape (review focus 1)", async () => {
    installFakeFetch({ healthCompass: hc });
    const t = convexTest(schema, modules);
    await t.action(internal.health.refreshHealth, { paceMs: 0 });
    installFakeFetch({ healthCompass: (url) => (url.includes("/topics/") ? HC_TOPICS_PAGE : { results: [{ g: "53208", v: "9.7" }] }) });
    const notes = await t.action(internal.health.refreshHealth, { paceMs: 0 });
    expect(notes[0]).toMatch(/Health Compass refresh failed, kept last week's: Health Compass figures changed shape/);
    expect(await t.run((ctx) => ctx.db.query("healthPlaces").collect())).toHaveLength(39);
    expect(await t.run((ctx) => ctx.db.query("healthRefresh").first())).toMatchObject({ status: "failed", places: 39 });
  });
  it("stops at once when Health Compass lists no topics", async () => {
    const seen: string[] = [];
    installFakeFetch({ healthCompass: (url) => { seen.push(url); return { results: [] }; } });
    const t = convexTest(schema, modules);
    expect(await t.action(internal.health.refreshHealth, {})).toEqual(["Health Compass refresh failed, kept last week's: Health Compass listed no topics"]);
    expect(seen).toHaveLength(1);
  });
  it("retries a busy answer, then fails the run without storing", async () => {
    installFakeFetch({ healthCompass: hc, healthStatus: 429 });
    const t = convexTest(schema, modules);
    const notes = await t.action(internal.health.refreshHealth, { paceMs: 0 });
    expect(notes[0]).toMatch(/Health Compass request failed: 429/);
    expect(await t.run((ctx) => ctx.db.query("healthPlaces").collect())).toHaveLength(0);
  });
});
