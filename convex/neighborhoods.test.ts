/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { installFakeFetch } from "../tests/helpers/fakeFetch";
import { api, internal } from "./_generated/api";
import * as sources from "./lib/neighborhoodSources";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const ring = [[-87.92, 43.06], [-87.9, 43.06], [-87.9, 43.08], [-87.92, 43.08], [-87.92, 43.06]];
const layer = { type: "FeatureCollection", features: [{ properties: { NEIGHBORHD: "HARAMBEE" }, geometry: { type: "Polygon", coordinates: [ring] } }] };
// Two tracts: one on Harambee's square (100% Harambee), one far outside the City (not stored).
const tractLayer = { type: "FeatureCollection", features: [
  { properties: { GEOID: "55079186000" }, geometry: { type: "Polygon", coordinates: [ring] } },
  { properties: { GEOID: "55079060100" }, geometry: { type: "Polygon", coordinates: [[[-88.0, 42.9], [-87.99, 42.9], [-87.99, 42.91], [-88.0, 42.91], [-88.0, 42.9]]] } },
] };
const E02_URL = "https://services.test/arcgis/rest/services/2024%20County%20Poverty/FeatureServer/0";

const family = (key: string, code: string, name: string) => ({
  key, code, name, kind: "document" as const, topic: "Neighborhoods", keywords: [], places: ["Riverwest"], years: [2023],
  latestModified: "2023-01-01", baseSearchText: "", searchText: "", dictionaryTab: null,
});
const member = (familyKey: string, hubId: string, title: string) => ({
  familyKey, hubId, kind: "document" as const, title, landingPage: "", place: "Riverwest", years: [2023], yearLabel: "2023",
  modified: "m", featureServerUrl: null, downloads: {}, description: "", keywords: [],
});

async function seed() {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    // One neighborhood report with a definition, one spreadsheet place.
    await ctx.db.insert("families", family("document:neighborhood-portrait", "N02", "Neighborhood Portrait"));
    await ctx.db.insert("members", member("document:neighborhood-portrait", "r1", "Riverwest Neighborhood Portrait 2023"));
    await ctx.db.insert("docChunks", { hubId: "r1", modified: "m", section: "Intro", text: "Census tracts 71, 72, 79, 80 and 107 were used to define the Riverwest\nneighborhood for the purposes of this report.", embedding: new Array(1536).fill(0) });
    await ctx.db.insert("families", family("document:neighborhood-portrait-spreadsheet", "N03", "Neighborhood Portrait Spreadsheet"));
    await ctx.db.insert("members", member("document:neighborhood-portrait-spreadsheet", "s1", "Riverwest"));
    await ctx.db.insert("families", { ...family("dataset:poverty", "E02", "Households Living in Poverty"), kind: "dataset" as const, topic: "Economy" });
    await ctx.db.insert("members", { ...member("dataset:poverty", "p24", "Poverty 2024"), kind: "dataset" as const, place: "County", years: [2024], yearLabel: "2024", featureServerUrl: E02_URL });
  });
  return t;
}

const rowsOf = (t: Awaited<ReturnType<typeof seed>>, definition: "city" | "dycu") =>
  t.run((ctx) => ctx.db.query("neighborhoods").withIndex("by_definition_matchKey", (q) => q.eq("definition", definition)).collect());

describe("refreshNeighborhoods", () => {
  it("stores City boundaries and DYCU tract lists", async () => {
    const t = await seed();
    installFakeFetch({ cityNeighborhoods: layer, tractShapes: tractLayer });
    const notes = await t.action(internal.build.refreshNeighborhoods, {});
    expect((await rowsOf(t, "city")).map((r) => [r.name, r.bbox])).toEqual([["Harambee", { minLat: 43.06, maxLat: 43.08, minLon: -87.92, maxLon: -87.9 }]]);
    expect((await rowsOf(t, "dycu")).map((r) => [r.name, r.tracts])).toEqual([["Riverwest", [{ years: [2023], tracts: ["71", "72", "79", "80", "107"] }]]]);
    expect(notes).toEqual([]);
  });
  it("keeps last week's City boundaries when the layer is down, and says so", async () => {
    const t = await seed();
    installFakeFetch({ cityNeighborhoods: layer });
    await t.action(internal.build.refreshNeighborhoods, {});
    installFakeFetch({ cityNeighborhoodsStatus: 503 });
    const notes = await t.action(internal.build.refreshNeighborhoods, {});
    expect((await rowsOf(t, "city")).map((r) => r.name)).toEqual(["Harambee"]);
    expect(notes[0]).toMatch(/^City neighborhoods unavailable, kept last week's/);
  });

  const tractRows = (t: Awaited<ReturnType<typeof seed>>) =>
    t.run(async (ctx) => (await ctx.db.query("tractNeighborhoods").collect()).map((r) => [r.geoid, r.city]));

  it("stores each tract's City neighborhoods, leaving out tracts outside the City", async () => {
    const t = await seed();
    installFakeFetch({ cityNeighborhoods: layer, tractShapes: tractLayer });
    expect(await t.action(internal.build.refreshNeighborhoods, {})).toEqual([]);
    expect(await tractRows(t)).toEqual([["55079186000", [{ name: "Harambee", share: 100 }]]]);
  });
  it("keeps last week's match when the tract outlines are down, and says so", async () => {
    const t = await seed();
    installFakeFetch({ cityNeighborhoods: layer, tractShapes: tractLayer });
    await t.action(internal.build.refreshNeighborhoods, {});
    installFakeFetch({ cityNeighborhoods: layer, tractShapesStatus: 503 });
    const notes = await t.action(internal.build.refreshNeighborhoods, {});
    expect(await tractRows(t)).toEqual([["55079186000", [{ name: "Harambee", share: 100 }]]]);
    expect(notes).toEqual([expect.stringMatching(/^Tract neighborhoods unavailable, kept last week's: /)]);
  });
  it("never rebuilds the match without this week's City shapes", async () => {
    const t = await seed();
    installFakeFetch({ cityNeighborhoods: layer, tractShapes: tractLayer });
    await t.action(internal.build.refreshNeighborhoods, {});
    installFakeFetch({ cityNeighborhoodsStatus: 503, tractShapes: { type: "FeatureCollection", features: [] } });
    const notes = await t.action(internal.build.refreshNeighborhoods, {});
    expect(await tractRows(t)).toHaveLength(1);
    expect(notes[1]).toMatch(/^Tract neighborhoods unavailable, kept last week's: the City's neighborhoods weren't read/);
  });
  it("keeps last week's match when no tract matches at all", async () => {
    const t = await seed();
    installFakeFetch({ cityNeighborhoods: layer, tractShapes: tractLayer });
    await t.action(internal.build.refreshNeighborhoods, {});
    installFakeFetch({ cityNeighborhoods: layer, tractShapes: { type: "FeatureCollection", features: [tractLayer.features[1]] } });
    const notes = await t.action(internal.build.refreshNeighborhoods, {});
    expect(await tractRows(t)).toHaveLength(1);
    expect(notes).toEqual([expect.stringMatching(/no tract matched a City neighborhood/)]);
  });
});

describe("finish", () => {
  it("completes the build and notes the failure when the neighborhoods refresh throws", async () => {
    const t = await seed();
    const buildId = await t.run((ctx) =>
      ctx.db.insert("builds", {
        status: "running", startedAt: 0, finishedAt: null, pending: 0, done: 0, skipped: 0, failed: 0, costUsd: 0,
        firecrawlCalls: 0, notes: ["earlier note"], mismatch: null, orphanChunksDeleted: 0, report: null,
      }),
    );
    installFakeFetch({ cityNeighborhoods: layer });
    vi.spyOn(sources, "buildDycuNeighborhoods").mockImplementation(() => {
      throw new Error("boom");
    });
    await t.action(internal.build.finish, { buildId });
    const b = await t.run((ctx) => ctx.db.get(buildId));
    expect(b?.status).toBe("completed");
    expect(b?.notes).toContain("earlier note");
    expect(b?.notes.some((n) => n.startsWith("Neighborhoods refresh failed:") && n.includes("boom"))).toBe(true);
  });
});

describe("dycuAreas (How it works: which tracts make up each DYCU area)", () => {
  it("lists DYCU's areas by name with their newest tracts in number order, and never the City's boundaries", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("neighborhoods", { definition: "dycu", name: "United Community", matchKey: "united community", tracts: [{ years: [2021, 2022, 2023, 2024], tracts: ["68", "42", "47", "1860"] }] });
      await ctx.db.insert("neighborhoods", { definition: "dycu", name: "Amani", matchKey: "amani", tracts: [{ years: [2019, 2020], tracts: ["1"] }, { years: [2021, 2022], tracts: ["2", "10"] }] });
      await ctx.db.insert("neighborhoods", { definition: "city", name: "Harambee", matchKey: "harambee", geometry: "{}", bbox: { minLat: 43, maxLat: 43.1, minLon: -88, maxLon: -87.9 } });
    });
    expect(await t.query(api.catalog.dycuAreas, {})).toEqual([
      { name: "Amani", tracts: ["2", "10"], years: [2021, 2022] },
      { name: "United Community", tracts: ["42", "47", "68", "1860"], years: [2021, 2022, 2023, 2024] },
    ]);
  });
});
