/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { beforeEach, describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import { nameKey } from "./lib/neighborhoodNames";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");
const N03 = "document:neighborhood-portrait-spreadsheet";
const member = (hubId: string, place: string, y: number, extra: Record<string, unknown> = {}) => ({ familyKey: N03, hubId, title: `${y} ${place} Neighborhood Portrait Spreadsheet`, yearLabel: String(y), place, years: [y], kind: "document" as const, landingPage: `https://dycu.test/${hubId}`, featureServerUrl: null, modified: "2026-01-22", downloads: {}, description: "", keywords: [], ...extra });
const table = (hubId: string, slug: string, groups: string[], rows: [string, ...(string | null)[]][]) => ({
  hubId, modified: "2026-01-22", slug, topic: slug, tab: slug, order: 0, tableIds: [], tableIdText: "", vintage: null, groups, issues: [],
  rows: rows.map(([label, ...vals]) => ({ label, heading: false, values: vals.map((x) => (x === null ? null : { estimate: x.split("±")[0], moe: x.split("±")[1] ?? null })) })),
});
const harambeeRows = (hubId: string) => [
  table(hubId, "poverty-status-by-age", [""], [["Total", "18894±1000"], ["Income in the past 12 months below poverty level", "6520±600"]]),
  table(hubId, "vehicles-per-household", [""], [["Total:", "8000±177"], ["No vehicle available", "2586±250"]]),
  table(hubId, "rent-paid", [""], [["Occupied units paying rent (excluding units where GRAPI cannot be computed)", "5549±300"], ["30.0 to 34.9 percent", "483±100"], ["35.0 percent or more", "2737±250"]]),
  table(hubId, "sex-and-age", ["Total", "Male", "Female"], [["Total", "0±0", "9087±861", "9963±985"]]),
];

let t: ReturnType<typeof convexTest>;
beforeEach(async () => {
  t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    await ctx.db.insert("families", { key: N03, code: "N03", name: "Neighborhood Portrait Spreadsheet", kind: "document", topic: "Neighborhoods", keywords: [], places: [], years: [2023, 2024], latestModified: "2026-01-22", baseSearchText: "", searchText: "", dictionaryTab: null });
    await ctx.db.insert("members", member("h23", "Harambee", 2023));
    await ctx.db.insert("members", member("h24", "Harambee", 2024));
    // DYCU spells this area two ways across years (2021 vs 2022–2024); it is one area.
    await ctx.db.insert("members", member("s21", "Silver City, Burnham Park, and Layton Park", 2021));
    await ctx.db.insert("members", member("s24", "Silver City, Layton Park, and Burnham Park", 2024));
    for (const r of [...harambeeRows("h23"), ...harambeeRows("h24"), ...harambeeRows("s21"), ...harambeeRows("s24")]) await ctx.db.insert("portraitTables", r);
    await ctx.db.insert("cityFigures", { period: 2024, fetchedAt: 1, values: { B17001_001: { estimate: 552601, moe: 503 }, B17001_002: { estimate: 125891, moe: 4212 } } });
    await ctx.db.insert("neighborhoods", { definition: "dycu", name: "Harambee", matchKey: "harambee", tracts: [{ years: [2024], tracts: ["1860"] }] });
    await ctx.db.insert("families", { key: "e02", code: "E02", name: "Households Living in Poverty", kind: "dataset", topic: "Economy", keywords: [], places: ["County"], years: [2023], latestModified: "2024-01-01", baseSearchText: "", searchText: "", dictionaryTab: null });
    await ctx.db.insert("members", { familyKey: "e02", hubId: "e1", title: "Poverty 2023", yearLabel: "2023", place: "County", years: [2023], kind: "dataset", landingPage: "", featureServerUrl: "https://services.arcgis.com/x/Poverty/FeatureServer/0", modified: "2024-01-01", downloads: {}, description: "", keywords: [] });
    // Two City neighborhoods built from two tracts, one small one, one with a DYCU name, one with a slash.
    for (const name of ["Bay View", "Tiny Park", "Harambee", "The Valley/Pigsville"]) await ctx.db.insert("neighborhoods", { definition: "city", name, matchKey: nameKey(name) });
    await ctx.db.insert("tractNeighborhoods", { geoid: "55079000100", city: [], pieces: [{ name: "Bay View", share: 60 }, { name: "Tiny Park", share: 1 }, { name: "The Valley/Pigsville", share: 39 }] });
    await ctx.db.insert("tractNeighborhoods", { geoid: "55079000200", city: [], pieces: [{ name: "Bay View", share: 25 }] });
    await ctx.db.insert("tractPopulations", { geoid: "55079000100", population: 2000, period: 2024 });
    await ctx.db.insert("tractPopulations", { geoid: "55079000200", population: 1000, period: 2024 });
  });
});

describe("the fact sheet's data", () => {
  it("assembles the newest year with the city beside each headline, a map and the source", async () => {
    const r = await t.query(api.factSheet.sheet, { slug: "harambee" });
    expect(r).toMatchObject({ status: "ok", name: "Harambee", year: 2024, years: [2024, 2023], period: "2020–2024", map: { geoids: ["55079186000"] } });
    if (r.status !== "ok") return;
    expect(r.headlines.find((h) => h.id === "poverty")).toMatchObject({ verdict: "higher" });
    expect(r.tables.length).toBeGreaterThan(0);
  });
  it("never shows another period's city figure", async () => {
    const r = await t.query(api.factSheet.sheet, { slug: "harambee", year: 2023 });
    if (r.status !== "ok") throw new Error("expected ok");
    expect(r.headlines.every((h) => h.city === null)).toBe(true);
    expect(r.cityFetchedAt).toBeNull();
  });
  it("round-trips a long name and lists the areas for an unknown slug", async () => {
    expect(await t.query(api.factSheet.sheet, { slug: "silver-city-burnham-park-and-layton-park" })).toMatchObject({ status: "ok", name: "Silver City, Layton Park, and Burnham Park", slug: "silver-city-layton-park-and-burnham-park", years: [2024, 2021] });
    expect(await t.query(api.factSheet.sheet, { slug: "silver-city-layton-park-and-burnham-park" })).toMatchObject({ status: "ok", years: [2024, 2021] });
    const index = await t.query(api.factSheet.sheet, { slug: "nowhere" });
    if (index.status === "not-found") expect(index.areas).toHaveLength(2);
    expect(await t.query(api.factSheet.sheet, { slug: "nowhere" })).toMatchObject({ status: "not-found", areas: expect.arrayContaining([{ slug: "harambee", name: "Harambee" }]) });
  });
  it("names the fact sheet a search mentions, by any of its spellings, and nothing otherwise", async () => {
    expect(await t.query(api.factSheet.areaInSearch, { q: "harambee crime" })).toEqual({ slug: "harambee", name: "Harambee" });
    expect(await t.query(api.factSheet.areaInSearch, { q: "Silver City, Burnham Park, and Layton Park" })).toEqual({ slug: "silver-city-layton-park-and-burnham-park", name: "Silver City, Layton Park, and Burnham Park" });
    expect(await t.query(api.factSheet.areaInSearch, { q: "robbery" })).toBeNull();
  });
  it("finds a sheet by a typed name for Ask, and offers the nearest names on a miss", async () => {
    expect(await t.query(api.factSheet.findSheet, { neighborhood: "harambee" })).toMatchObject({ status: "ok", slug: "harambee", headlines: [{ id: "poverty" }, { id: "rent-burden" }, { id: "no-car" }] });
    expect(await t.query(api.factSheet.findSheet, { neighborhood: "Harambe" })).toMatchObject({ status: "no-neighborhood", nearest: expect.arrayContaining(["Harambee"]) });
  });
  it("finds an area Ask names by part of its name", async () => {
    expect(await t.query(api.factSheet.findSheet, { neighborhood: "Silver City" })).toMatchObject({ status: "ok", slug: "silver-city-layton-park-and-burnham-park" });
  });
});

const tractValues = (part: number, of: number) => ({ B17001_002: { estimate: part, moe: 60 }, B17001_001: { estimate: of, moe: 100 } });
async function withTractFigures(period = 2024) {
  await t.run(async (ctx) => {
    await ctx.db.insert("tractFigures", { geoid: "55079000100", period, values: tractValues(400, 2000), fetchedAt: 1 });
    await ctx.db.insert("tractFigures", { geoid: "55079000200", period, values: tractValues(300, 1000), fetchedAt: 1 });
  });
}

describe("fact sheets built from census tracts", () => {
  it("opens a City neighborhood DYCU doesn't profile, built from its tracts, with the City column of the same period", async () => {
    await withTractFigures();
    const r = await t.query(api.factSheet.sheet, { slug: "bay-view" });
    expect(r).toMatchObject({ status: "ok", kind: "census", name: "Bay View", year: 2024, period: "2020–2024", years: [], tables: [], source: null, built: { tracts: 2 } });
    if (r.status !== "ok") return;
    expect(r.headlines.find((h) => h.id === "poverty")!.hood!.count.estimate).toBeCloseTo(315, 6);
    expect(r.headlines.find((h) => h.id === "poverty")!.city).not.toBeNull();
  });
  it("keeps DYCU's sheet when a City name matches a DYCU area, and round-trips a slash", async () => {
    await withTractFigures();
    expect(await t.query(api.factSheet.sheet, { slug: "harambee" })).toMatchObject({ status: "ok", name: "Harambee" });
    expect((await t.query(api.factSheet.sheet, { slug: "harambee" }) as { kind?: string }).kind).toBeUndefined();
    expect(await t.query(api.factSheet.sheet, { slug: "the-valley-pigsville" })).toMatchObject({ status: "small", name: "The Valley/Pigsville" });
  });
  it("gives a small neighborhood a page without figures, listing its tracts", async () => {
    expect(await t.query(api.factSheet.sheet, { slug: "tiny-park" })).toEqual(expect.objectContaining({ status: "small", name: "Tiny Park", people: 20, tracts: [{ number: "1", share: 1 }] }));
  });
  it("opens with every figure missing before the first tract fetch, instead of the index, and says they aren't loaded", async () => {
    const r = await t.query(api.factSheet.sheet, { slug: "bay-view" });
    expect(r).toMatchObject({ status: "ok", kind: "census", loaded: false });
    await withTractFigures();
    expect(await t.query(api.factSheet.sheet, { slug: "bay-view" })).toMatchObject({ loaded: true });
    if (r.status === "ok") expect(r.headlines.filter((h) => !h.isCount).every((h) => h.hood === null)).toBe(true);
  });
  it("never pairs tract figures with a newer period's City column", async () => {
    await withTractFigures(2023);
    const r = await t.query(api.factSheet.sheet, { slug: "bay-view" });
    expect(r).toMatchObject({ status: "ok", year: 2023 });
    if (r.status === "ok") expect(r.headlines.every((h) => h.city === null)).toBe(true); // only 2024 City figures are seeded
  });
  it("lists every City neighborhood DYCU doesn't cover on the index", async () => {
    const index = await t.query(api.factSheet.sheet, { slug: "" });
    expect(index).toMatchObject({ status: "not-found", cityAreas: [{ slug: "bay-view", name: "Bay View" }, { slug: "the-valley-pigsville", name: "The Valley/Pigsville" }, { slug: "tiny-park", name: "Tiny Park" }] });
  });
  it("leads a search with a City neighborhood's sheet, DYCU's first on a shared name", async () => {
    expect(await t.query(api.factSheet.areaInSearch, { q: "bay view crime" })).toEqual({ slug: "bay-view", name: "Bay View" });
    expect(await t.query(api.factSheet.areaInSearch, { q: "harambee crime" })).toEqual({ slug: "harambee", name: "Harambee" });
  });
  it("adds up every City neighborhood for the real-data check", async () => {
    await withTractFigures();
    // Bay View 1,200 + 250 = 1,450 (a sheet); Tiny Park 20 and The Valley/Pigsville 780 are small. The City's Harambee
    // touches no tract here, so it has no residents and isn't counted.
    expect(await t.query(internal.factSheet.checkCitySheets, {})).toMatchObject({ neighborhoods: 3, sheets: 1, small: 2, people: 2250 });
  });
  it("sends a City neighborhood that's part of a DYCU area's name to DYCU's sheet everywhere (review: Important 2)", async () => {
    await t.run(async (ctx) => {
      await ctx.db.insert("neighborhoods", { definition: "city", name: "Layton Park", matchKey: nameKey("Layton Park") });
      await ctx.db.insert("tractNeighborhoods", { geoid: "55079000300", city: [], pieces: [{ name: "Layton Park", share: 90 }] });
      await ctx.db.insert("tractPopulations", { geoid: "55079000300", population: 4000, period: 2024 });
    });
    expect(await t.query(api.factSheet.sheet, { slug: "layton-park" })).toMatchObject({ status: "ok", name: "Silver City, Layton Park, and Burnham Park" });
    expect((await t.query(api.factSheet.sheet, { slug: "layton-park" }) as { kind?: string }).kind).toBeUndefined();
    const index = await t.query(api.factSheet.sheet, { slug: "" });
    if (index.status === "not-found") expect(index.cityAreas.map((a) => a.slug)).not.toContain("layton-park");
    expect(await t.query(api.factSheet.areaInSearch, { q: "layton park crime" })).toEqual({ slug: "silver-city-layton-park-and-burnham-park", name: "Silver City, Layton Park, and Burnham Park" });
  });
});
