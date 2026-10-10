/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { installFakeFetch } from "../tests/helpers/fakeFetch";
import { internal } from "./_generated/api";
import * as sources from "./lib/neighborhoodSources";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const ring = [[-87.92, 43.06], [-87.9, 43.06], [-87.9, 43.08], [-87.92, 43.08], [-87.92, 43.06]];
const layer = { type: "FeatureCollection", features: [{ properties: { NEIGHBORHD: "HARAMBEE" }, geometry: { type: "Polygon", coordinates: [ring] } }] };

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
  });
  return t;
}

const rowsOf = (t: Awaited<ReturnType<typeof seed>>, definition: "city" | "dycu") =>
  t.run((ctx) => ctx.db.query("neighborhoods").withIndex("by_definition_matchKey", (q) => q.eq("definition", definition)).collect());

describe("refreshNeighborhoods", () => {
  it("stores City boundaries and DYCU tract lists", async () => {
    const t = await seed();
    installFakeFetch({ cityNeighborhoods: layer });
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
