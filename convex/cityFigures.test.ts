/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { installFakeFetch } from "../tests/helpers/fakeFetch";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");
afterEach(() => { vi.unstubAllGlobals(); delete process.env.CENSUS_API_KEY; });

async function seed() {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    await ctx.db.insert("families", { key: "document:neighborhood-portrait-spreadsheet", code: "N03", name: "Neighborhood Portrait Spreadsheet", kind: "document", topic: "Neighborhoods", keywords: [], places: [], years: [2023, 2024], latestModified: "2026-01-22", baseSearchText: "", searchText: "", dictionaryTab: null });
    for (const y of [2023, 2024]) await ctx.db.insert("members", { familyKey: "document:neighborhood-portrait-spreadsheet", hubId: `h${y}`, title: `${y} Harambee Neighborhood Portrait Spreadsheet`, yearLabel: String(y), place: "Harambee", years: [y], kind: "document", landingPage: "", featureServerUrl: null, modified: "2026-01-22", downloads: {}, description: "", keywords: [] });
  });
  return t;
}
const reply = (url: string) => {
  const codes = [...new URL(url).searchParams.get("get")!.split(",")];
  return [codes, codes.map((c) => (c.endsWith("M") ? "10" : "100"))];
};

describe("refreshCityFigures", () => {
  it("stores every period a portrait uses, by variable", async () => {
    const t = await seed();
    process.env.CENSUS_API_KEY = "k";
    const fake = installFakeFetch({ census: reply });
    expect(await t.action(internal.cityFigures.refreshCityFigures, {})).toEqual([]);
    expect(fake.count("api.census.gov/data/2024/")).toBe(3);
    expect(await t.query(internal.cityFigures.cityValues, { period: 2023 })).toMatchObject({ B17001_001: { estimate: 100, moe: 10 } });
  });
  it("keeps last week's figures and notes the failure when the Census fails", async () => {
    const t = await seed();
    process.env.CENSUS_API_KEY = "k";
    installFakeFetch({ census: reply });
    await t.action(internal.cityFigures.refreshCityFigures, {});
    installFakeFetch({ census: reply, censusStatus: 500 });
    const notes = await t.action(internal.cityFigures.refreshCityFigures, {});
    expect(notes[0]).toMatch(/City figures for 2023 unavailable, kept last week's/);
    expect(await t.query(internal.cityFigures.cityValues, { period: 2024 })).not.toBeNull();
  });
  it("says so without a key, and fetches nothing", async () => {
    const t = await seed();
    const fake = installFakeFetch({ census: reply });
    expect((await t.action(internal.cityFigures.refreshCityFigures, {}))[0]).toMatch(/CENSUS_API_KEY is not set/);
    expect(fake.count("api.census.gov")).toBe(0);
  });
  it("never stores the Census key in a note, and stops at the first network failure", async () => {
    const t = await seed();
    process.env.CENSUS_API_KEY = "SECRET123";
    const fetch = vi.fn(async (url: string) => { throw new Error(`Request timed out after 30000ms: ${url}`); });
    vi.stubGlobal("fetch", fetch);
    const notes = await t.action(internal.cityFigures.refreshCityFigures, {});
    expect(notes.join(" ")).not.toContain("SECRET123");
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatch(/Census unreachable; city figures not refreshed/);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
