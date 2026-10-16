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
  it("returns the newest stored period with its values, or null when none is stored", async () => {
    const t = await seed();
    expect(await t.query(internal.cityFigures.latestCityFigures, {})).toBeNull();
    process.env.CENSUS_API_KEY = "k";
    installFakeFetch({ census: reply });
    await t.action(internal.cityFigures.refreshCityFigures, {});
    expect(await t.query(internal.cityFigures.latestCityFigures, {})).toMatchObject({ period: 2024, values: { B03002_001: { estimate: 100, moe: 10 } } });
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

// A tract reply: every requested code, for n tracts numbered 000100, 000200, …
const tractReply = (n: number) => (url: string) => {
  const codes = new URL(url).searchParams.get("get")!.split(",");
  const head = [...codes, "state", "county", "tract"];
  return [head, ...Array.from({ length: n }, (_, i) => [...codes.map((c) => (c.endsWith("M") ? "10" : "100")), "55", "079", String((i + 1) * 100).padStart(6, "0")])];
};
const isTract = (url: string) => url.includes("for=tract");

describe("refreshTractFigures", () => {
  it("stores every tract's values for the newest City period, one row per tract", async () => {
    const t = await seed();
    process.env.CENSUS_API_KEY = "k";
    installFakeFetch({ census: reply });
    await t.action(internal.cityFigures.refreshCityFigures, {});
    const fake = installFakeFetch({ census: (url) => (isTract(url) ? tractReply(300)(url) : reply(url)) });
    expect(await t.action(internal.cityFigures.refreshTractFigures, {})).toEqual([]);
    expect(fake.count("for=tract")).toBe(3);
    const rows = await t.run((ctx) => ctx.db.query("tractFigures").collect());
    expect(rows).toHaveLength(300);
    expect(rows[0]).toMatchObject({ period: 2024, values: { B17001_002: { estimate: 100, moe: 10 }, DP04_0136: { estimate: 100, moe: 10 } } });
  });
  it("refuses a partial reply and keeps last week's rows", async () => {
    const t = await seed();
    process.env.CENSUS_API_KEY = "k";
    installFakeFetch({ census: reply });
    await t.action(internal.cityFigures.refreshCityFigures, {});
    installFakeFetch({ census: (url) => (isTract(url) ? tractReply(300)(url) : reply(url)) });
    await t.action(internal.cityFigures.refreshTractFigures, {});
    installFakeFetch({ census: (url) => (isTract(url) ? tractReply(12)(url) : reply(url)) });
    expect((await t.action(internal.cityFigures.refreshTractFigures, {}))[0]).toMatch(/Tract figures unavailable, kept last week's: only 12 tracts/);
    expect(await t.run((ctx) => ctx.db.query("tractFigures").collect())).toHaveLength(300);
  });
  it("says so without a key or without City figures, and never puts the key in a note", async () => {
    const t = await seed();
    expect((await t.action(internal.cityFigures.refreshTractFigures, {}))[0]).toMatch(/CENSUS_API_KEY is not set/);
    process.env.CENSUS_API_KEY = "SECRET123";
    expect((await t.action(internal.cityFigures.refreshTractFigures, {}))[0]).toMatch(/No City figures stored yet/);
    installFakeFetch({ census: reply });
    await t.action(internal.cityFigures.refreshCityFigures, {});
    vi.stubGlobal("fetch", vi.fn(async (url: string) => { throw new Error(`Request timed out after 30000ms: ${url}`); }));
    const notes = await t.action(internal.cityFigures.refreshTractFigures, {});
    expect(notes.join(" ")).not.toContain("SECRET123");
  });
  it("refuses the week when any one table's reply is short, even if the others are full (review: Important 3)", async () => {
    const t = await seed();
    process.env.CENSUS_API_KEY = "k";
    installFakeFetch({ census: reply });
    await t.action(internal.cityFigures.refreshCityFigures, {});
    installFakeFetch({ census: (url) => (isTract(url) ? tractReply(300)(url) : reply(url)) });
    await t.action(internal.cityFigures.refreshTractFigures, {});
    installFakeFetch({ census: (url) => (isTract(url) ? tractReply(url.includes("/acs5/profile") ? 12 : 300)(url) : reply(url)) });
    expect((await t.action(internal.cityFigures.refreshTractFigures, {}))[0]).toMatch(/Tract figures unavailable, kept last week's: only 12 tracts/);
    const rows = await t.run((ctx) => ctx.db.query("tractFigures").collect());
    expect(rows).toHaveLength(300);
    expect(rows.every((r) => r.values.DP04_0136)).toBe(true);
  });
});
