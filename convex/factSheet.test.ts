/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { beforeEach, describe, expect, it } from "vitest";
import { api } from "./_generated/api";
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
    await ctx.db.insert("members", member("s24", "Silver City, Burnham Park, and Layton Park", 2024));
    for (const r of [...harambeeRows("h23"), ...harambeeRows("h24"), ...harambeeRows("s24")]) await ctx.db.insert("portraitTables", r);
    await ctx.db.insert("cityFigures", { period: 2024, fetchedAt: 1, values: { B17001_001: { estimate: 552601, moe: 503 }, B17001_002: { estimate: 125891, moe: 4212 } } });
    await ctx.db.insert("neighborhoods", { definition: "dycu", name: "Harambee", matchKey: "harambee", tracts: [{ years: [2024], tracts: ["1860"] }] });
    await ctx.db.insert("families", { key: "e02", code: "E02", name: "Households Living in Poverty", kind: "dataset", topic: "Economy", keywords: [], places: ["County"], years: [2023], latestModified: "2024-01-01", baseSearchText: "", searchText: "", dictionaryTab: null });
    await ctx.db.insert("members", { familyKey: "e02", hubId: "e1", title: "Poverty 2023", yearLabel: "2023", place: "County", years: [2023], kind: "dataset", landingPage: "", featureServerUrl: "https://services.arcgis.com/x/Poverty/FeatureServer/0", modified: "2024-01-01", downloads: {}, description: "", keywords: [] });
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
    expect(await t.query(api.factSheet.sheet, { slug: "silver-city-burnham-park-and-layton-park" })).toMatchObject({ status: "ok", name: "Silver City, Burnham Park, and Layton Park" });
    expect(await t.query(api.factSheet.sheet, { slug: "nowhere" })).toMatchObject({ status: "not-found", areas: expect.arrayContaining([{ slug: "harambee", name: "Harambee" }]) });
  });
  it("finds a sheet by a typed name for Ask, and offers the nearest names on a miss", async () => {
    expect(await t.query(api.factSheet.findSheet, { neighborhood: "harambee" })).toMatchObject({ status: "ok", slug: "harambee", headlines: [{ id: "poverty" }, { id: "rent-burden" }, { id: "no-car" }] });
    expect(await t.query(api.factSheet.findSheet, { neighborhood: "Harambe" })).toMatchObject({ status: "no-neighborhood", nearest: expect.arrayContaining(["Harambee"]) });
  });
});
