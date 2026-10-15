/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HC_ROWS, HC_TOPICS_PAGE } from "../tests/fixtures/healthCompass";
import { installFakeFetch } from "../tests/helpers/fakeFetch";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");
afterEach(() => vi.unstubAllGlobals());

// Health Compass, faked from the real fixture: topics, and each place's rows.
const hc = (url: string) => {
  if (url.includes("/topics/")) return HC_TOPICS_PAGE;
  if (url.includes("/geographies/")) return { count: 2, next: null, previous: null, results: [{ layer: "zip", geoid: "53208", population: 29644 }, { layer: "zip", geoid: "53295", population: 114 }, { layer: "county", geoid: "55079", population: 939489 }] };
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
    const geo = (g: string) => t.run((ctx) => ctx.db.query("healthPlaces").withIndex("by_geo", (q) => q.eq("geo", g)).first());
    expect((await geo("53295"))!.population).toBe(114);
    expect((await geo("55079"))!.population).toBeNull();
  });
  it("picks the county's figure from the ZIPs' own period when it has one (review I1)", async () => {
    installFakeFetch({ healthCompass: (url) => {
      const r = hc(url) as { results?: unknown[] };
      return url.includes("geography=55079") ? { ...r, results: [...(r.results ?? []), { g: "55079", l: "county", a: "POV", p: "", d: "2021-2025", v: 99, se: 1 }] } : r;
    } });
    const t = convexTest(schema, modules);
    await t.action(internal.health.refreshHealth, { paceMs: 0 });
    const county = await t.run((ctx) => ctx.db.query("healthPlaces").withIndex("by_geo", (q) => q.eq("geo", "55079")).first());
    expect(county!.figures.find((f) => f.topic === "POV")).toMatchObject({ period: "2020-2024" });
  });
  it("keeps last week's copy and says why when Health Compass fails or changes shape (review focus 1)", async () => {
    installFakeFetch({ healthCompass: hc });
    const t = convexTest(schema, modules);
    await t.action(internal.health.refreshHealth, { paceMs: 0 });
    installFakeFetch({ healthCompass: (url) => (url.includes("/topics/") || url.includes("/geographies/") ? hc(url) : { results: [{ g: "53208", v: "9.7" }] }) });
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
  it("gives up past its deadline, marks the run failed and keeps last week's copy (review I4)", async () => {
    installFakeFetch({ healthCompass: hc });
    const t = convexTest(schema, modules);
    await t.action(internal.health.refreshHealth, { paceMs: 0 });
    const notes = await t.action(internal.health.refreshHealth, { paceMs: 0, deadlineMs: 0 });
    expect(notes).toEqual(["Health Compass refresh failed, kept last week's: Health Compass took too long; stopped at the deadline"]);
    expect(await t.run((ctx) => ctx.db.query("healthPlaces").collect())).toHaveLength(39);
  });
  it("stores a place Health Compass refuses or doesn't know as no data, and notes it (53126 answers 403)", async () => {
    installFakeFetch({ healthCompass: hc, healthStatusFor: (geo) => (geo === "53126" ? 403 : geo === "53295" ? 404 : undefined) });
    const t = convexTest(schema, modules);
    const notes = await t.action(internal.health.refreshHealth, { paceMs: 0 });
    expect(notes).toEqual(["Health Compass has no figures for 53126, 53295"]);
    const all = await t.run((ctx) => ctx.db.query("healthPlaces").collect());
    expect(all).toHaveLength(39);
    expect(all.find((p) => p.geo === "53126")!.figures).toEqual([]);
    expect(await t.run((ctx) => ctx.db.query("healthRefresh").first())).toMatchObject({ status: "read" });
  });
  it("retries a busy answer, then fails the run without storing", async () => {
    installFakeFetch({ healthCompass: hc, healthStatus: 429 });
    const t = convexTest(schema, modules);
    const notes = await t.action(internal.health.refreshHealth, { paceMs: 0 });
    expect(notes[0]).toMatch(/Health Compass request failed: 429/);
    expect(await t.run((ctx) => ctx.db.query("healthPlaces").collect())).toHaveLength(0);
  });
});

describe("zipHealth", () => {
  it("answers from the stored copy, with no outside request", async () => {
    installFakeFetch({ healthCompass: hc });
    const t = convexTest(schema, modules);
    await t.action(internal.health.refreshHealth, { paceMs: 0 });
    const seen: string[] = [];
    vi.stubGlobal("fetch", async (u: string) => { seen.push(String(u)); return new Response("{}", { status: 500 }); });
    const r = await t.query(api.health.zipHealth, { mode: "one", measure: "Poverty rate", zip: "53208" });
    expect(r).toMatchObject({ status: "ok", mode: "one", zip: { zip: "53208" } });
    expect(seen).toEqual([]);
  });
  it("says the figures aren't loaded yet before the first refresh", async () => {
    const t = convexTest(schema, modules);
    expect(await t.query(api.health.zipHealth, { mode: "rank", measure: "Poverty rate" })).toEqual({ status: "unavailable" });
  });
});
