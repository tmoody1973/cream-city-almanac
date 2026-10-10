/// <reference types="vite/client" />
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { installFakeFetch } from "../tests/helpers/fakeFetch";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");
const RID = "87843297-a6fa-46d4-ba5d-cb342fb2d3bb";
const reader = { subject: "u1", issuer: "test", tokenIdentifier: "test|u1" };
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

async function seed(withProfile = true) {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  await t.run(async (ctx) => {
    await ctx.db.insert("families", { key: "city:nibrs-crime-data", code: "P01", name: "NIBRS Crime Data", kind: "dataset", topic: "Public Safety", keywords: [], places: ["City"], years: [], latestModified: "2023-01-05", baseSearchText: "", searchText: "", dictionaryTab: null, source: "city", live: true });
    await ctx.db.insert("cards", { familyKey: "city:nibrs-crime-data", inputHash: "h", explainer: "x", explainerProvenance: "AI", hubSummary: "", glossary: [], caveats: ["These are reported incidents, not all crime."], storyAngles: [], basic: false, embedding: new Array(1536).fill(0) });
    if (withProfile) await ctx.db.insert("cityProfiles", { familyKey: "city:nibrs-crime-data", resourceId: RID, columns: [], dateColumn: "Incident_Date", latColumn: "Address_Latitude", lonColumn: "Address_Longitude", districtColumns: ["Police_District"], categories: [{ column: "Police_District", values: [{ value: "6", count: 5 }] }, { column: "Offense_All", values: [{ value: "120", count: 5 }, { value: "13A", count: 3 }], multi: true }], rowCount: 10, minDate: "2024-01-01", maxDate: "2026-10-08", namesPeople: false, resourceName: "2025", signature: "s", updatedAt: 0 });
  });
  return t;
}

describe("countRecords", () => {
  it("counts live, groups oldest to newest, and reports future-dated records left out", async () => {
    const t = await seed();
    installFakeFetch({ citySql: (sql) => sql.includes("left(") ? [{ g: "2026-10", n: "26" }, { g: "2026-09", n: "230" }] : sql.includes("> '") ? [{ n: "1" }] : [{ n: "256" }] });
    const r = await t.withIdentity(reader).action(api.city.countRecords, { code: "p01", filters: [{ column: "Police_District", values: ["6"] }, { column: "Offense_All", values: ["robbery"] }], groupBy: "month" });
    expect(r).toMatchObject({ status: "ok", code: "P01", count: 256, groups: [{ label: "Sep 2026", count: 230 }, { label: "Oct 2026", count: 26 }], other: 0, futureExcluded: 1, filters: ["Police district 6", "Robbery"], caveat: "These are reported incidents, not all crime.", area: null, noLocation: 0, map: expect.anything() });
  });
  it("labels the dropped remainder 'Earlier' for date groups and 'Other' for column groups when capped", async () => {
    const t = await seed();
    const months = Array.from({ length: 24 }, (_, i) => ({ g: `2026-${String(12 - (i % 12)).padStart(2, "0")}`, n: "1" }));
    installFakeFetch({ citySql: (sql) => sql.includes("left(") ? months : sql.includes("> '") ? [{ n: "0" }] : [{ n: "40" }] });
    expect(await t.withIdentity(reader).action(api.city.countRecords, { code: "P01", groupBy: "month" })).toMatchObject({ status: "ok", count: 40, other: 16, otherLabel: "Earlier" });
    const cols = Array.from({ length: 24 }, () => ({ g: "6", n: "1" }));
    installFakeFetch({ citySql: (sql) => sql.includes("AS g") ? cols : sql.includes("> '") ? [{ n: "0" }] : [{ n: "40" }] });
    expect(await t.withIdentity(reader).action(api.city.countRecords, { code: "P01", groupBy: "Police_District" })).toMatchObject({ status: "ok", other: 16, otherLabel: "Other" });
  });
  it("counts a multi-offense incident under each of its offenses, and never sums an 'Other' for overlapping groups (C1)", async () => {
    const t = await seed();
    // One incident, "13A;120": a robbery filter matches it, and grouping by offense lists both of its codes.
    installFakeFetch({ citySql: (sql) => (sql.includes("unnest(") ? Array.from({ length: 24 }, (_, i) => ({ g: i === 0 ? "13A" : i === 1 ? "120" : `9${i}`, n: "1" })) : sql.includes("> '") ? [{ n: "0" }] : sql.includes("LIKE '%;120;%'") ? [{ n: "1" }] : [{ n: "0" }]) });
    const robbery = await t.withIdentity(reader).action(api.city.countRecords, { code: "P01", filters: [{ column: "Offense_All", values: ["robbery"] }] });
    expect(robbery).toMatchObject({ status: "ok", count: 1 });
    const grouped = await t.withIdentity(reader).action(api.city.countRecords, { code: "P01", filters: [{ column: "Offense_All", values: ["robbery"] }], groupBy: "Offense_All" });
    expect(grouped).toMatchObject({ status: "ok", count: 1, other: 0, otherLabel: null, overlap: true });
    if (grouped.status !== "ok") throw new Error("expected ok");
    expect(grouped.groups.slice(0, 2)).toEqual([{ label: "Aggravated Assault", count: 1 }, { label: "Robbery", count: 1 }]);
  });
  it("shows what the count covers: the date column, the data's range and the file (C2, I2)", async () => {
    const t = await seed();
    installFakeFetch({ citySql: () => [{ n: "7" }] });
    const r = await t.withIdentity(reader).action(api.city.countRecords, { code: "P01" });
    expect(r).toMatchObject({ status: "ok", count: 7, dateColumn: "Incident_Date", resourceName: "2025", coverage: expect.stringMatching(/^Jan 1, 2024 – /) });
  });
  it("says a period outside the data's coverage is outside it, without asking the City (C2)", async () => {
    const t = await seed();
    const fake = installFakeFetch({ cityStatus: 500 });
    const r = await t.withIdentity(reader).action(api.city.countRecords, { code: "P01", from: "2019-01-01", to: "2019-12-31" });
    expect(r).toEqual({ status: "outside-coverage", code: "P01", name: "NIBRS Crime Data", coverage: expect.stringMatching(/^Jan 1, 2024 – /) });
    expect(fake.count("datastore_search_sql")).toBe(0);
  });
  it("offers choices instead of guessing", async () => {
    const t = await seed();
    installFakeFetch();
    expect(await t.withIdentity(reader).action(api.city.countRecords, { code: "P01", filters: [{ column: "Police_District", values: ["99"] }] })).toMatchObject({ status: "choose", choices: ["6"] });
  });
  it("names the columns when asked about one that isn't there", async () => {
    const t = await seed();
    installFakeFetch();
    expect(await t.withIdentity(reader).action(api.city.countRecords, { code: "P01", filters: [{ column: "Nope", values: ["x"] }] })).toMatchObject({ status: "bad-column", column: "Nope", columns: ["Police_District", "Offense_All"] });
  });
  it("refuses impossible date ranges without calling the City", async () => {
    const t = await seed();
    installFakeFetch({ cityStatus: 500 });
    expect(await t.withIdentity(reader).action(api.city.countRecords, { code: "P01", from: "2026-12-01", to: "2026-01-01" })).toMatchObject({ status: "bad-dates", code: "P01", name: "NIBRS Crime Data", from: "2026-12-01", to: "2026-01-01" });
  });
  it("says an unknown code is not found", async () => {
    const t = await seed();
    expect(await t.withIdentity(reader).action(api.city.countRecords, { code: "zzz" })).toEqual({ status: "not-found", code: "ZZZ" });
  });
  it("says a dataset without a live profile can't be counted", async () => {
    const t = await seed(false);
    expect(await t.withIdentity(reader).action(api.city.countRecords, { code: "P01" })).toMatchObject({ status: "not-live", name: "NIBRS Crime Data" });
  });
  it("returns unavailable, never a number, when the City fails", async () => {
    const t = await seed();
    installFakeFetch({ cityStatus: 500 });
    expect(await t.withIdentity(reader).action(api.city.countRecords, { code: "P01" })).toMatchObject({ status: "unavailable" });
  });
  it("returns unavailable, never 0, when the City's answer has no usable count (m5)", async () => {
    const t = await seed();
    for (const total of [[], [{ n: "" }], [{ n: "abc" }], [{}]]) {
      installFakeFetch({ citySql: (sql) => (sql.includes("> '") ? [{ n: "0" }] : total) });
      expect(await t.withIdentity(reader).action(api.city.countRecords, { code: "P01" }), JSON.stringify(total)).toMatchObject({ status: "unavailable" });
    }
    installFakeFetch({ citySql: (sql) => (sql.includes("AS g") ? [{ g: "6", n: null }] : [{ n: "3" }]) });
    expect(await t.withIdentity(reader).action(api.city.countRecords, { code: "P01", groupBy: "Police_District" })).toMatchObject({ status: "unavailable" });
  });
  it("tells the model when a dataset names people (m1)", async () => {
    const t = await seed();
    installFakeFetch({ citySql: () => [{ n: "2" }] });
    expect(await t.withIdentity(reader).action(api.city.countRecords, { code: "P01" })).toMatchObject({ status: "ok", namesPeople: false });
  });
  it("won't count election results, whose rows are wards (r2)", async () => {
    const t = await seed();
    await t.run(async (ctx) => {
      await ctx.db.insert("families", { key: "city:election-2024-11-05", code: "B01", name: "Election results, Nov 5, 2024", kind: "dataset", topic: "Elections", keywords: [], places: ["City"], years: [2024], latestModified: "2024-11-06", baseSearchText: "", searchText: "", dictionaryTab: null, source: "city", live: false });
      await ctx.db.insert("cityProfiles", { familyKey: "city:election-2024-11-05", resourceId: RID, columns: [], dateColumn: null, districtColumns: ["Ward"], categories: [], rowCount: 327, minDate: null, maxDate: null, namesPeople: false, signature: "s", updatedAt: 0 });
    });
    installFakeFetch({ cityStatus: 500 });
    expect(await t.withIdentity(reader).action(api.city.countRecords, { code: "B01" })).toEqual({ status: "not-live", code: "B01", name: "Election results, Nov 5, 2024", note: "Election results list wards and vote totals, not records to count." });
  });
  it("says a DYCU code isn't City data instead of not-found (r3)", async () => {
    const t = await seed();
    await t.run((ctx) => ctx.db.insert("families", { key: "dataset:asthma", code: "W01", name: "Asthma Prevalence", kind: "dataset", topic: "Health", keywords: [], places: ["City"], years: [2023], latestModified: "2024-01-01", baseSearchText: "", searchText: "", dictionaryTab: null }));
    expect(await t.withIdentity(reader).action(api.city.countRecords, { code: "w01" })).toEqual({ status: "not-city", code: "W01", name: "Asthma Prevalence" });
  });
  it("goes busy after the account's burst allowance", async () => {
    const t = await seed(false);
    const call = () => t.withIdentity(reader).action(api.city.countRecords, { code: "P01" });
    for (let i = 0; i < 20; i++) expect(await call()).toMatchObject({ status: "not-live" });
    expect(await call()).toEqual({ status: "busy" });
  });
  it("requires sign-in", async () => {
    const t = await seed();
    await expect(t.action(api.city.countRecords, { code: "P01" })).rejects.toThrow(/sign in/i);
  });
});

const ring = [[-87.92, 43.06], [-87.9, 43.06], [-87.9, 43.08], [-87.92, 43.08], [-87.92, 43.06]];
async function withHarambee(t: Awaited<ReturnType<typeof seed>>) {
  await t.run((ctx) => ctx.db.insert("neighborhoods", { definition: "city", name: "Harambee", matchKey: "harambee", geometry: JSON.stringify({ type: "Polygon", coordinates: [ring] }), bbox: { minLat: 43.06, maxLat: 43.08, minLon: -87.92, maxLon: -87.9 } }));
}

describe("countRecords by neighborhood", () => {
  it("counts only points inside the boundary, groups them, and says which boundary", async () => {
    const t = await seed();
    await withHarambee(t);
    installFakeFetch({
      citySql: (sql) => sql.includes(" AS lat")
        ? [{ lat: 43.07, lon: -87.91, g: "2026-09" }, { lat: 43.07, lon: -87.91, g: "2026-10" }, { lat: 43.079, lon: -87.919, g: "2026-10" }, { lat: 43.5, lon: -87.91, g: "2026-10" }]
        : sql.includes("IS NULL OR") ? [{ n: "3" }] : [{ n: "999" }],
    });
    const r = await t.withIdentity(reader).action(api.city.countRecords, { code: "P01", neighborhood: "harambee neighborhood", groupBy: "month" });
    expect(r).toMatchObject({ status: "ok", count: 3, area: "Harambee (City of Milwaukee boundary)", map: expect.anything(), noLocation: 3, groups: [{ label: "Sep 2026", count: 1 }, { label: "Oct 2026", count: 2 }], futureExcluded: 0 });
  });
  it("returns the neighborhood's cells from the same points as the count", async () => {
    const t = await seed();
    await withHarambee(t);
    installFakeFetch({ citySql: (sql) => sql.includes(" AS lat") ? [{ lat: 43.07, lon: -87.91 }, { lat: 43.07, lon: -87.91 }, { lat: 43.5, lon: -87.91 }] : [{ n: "0" }] });
    const r = await t.withIdentity(reader).action(api.city.countRecords, { code: "P01", neighborhood: "Harambee" });
    if (r.status !== "ok") throw new Error(r.status);
    expect(r.count).toBe(2);
    expect(r.map!.summary).toEqual({ total: 2, areas: 1, fivePlus: 0, busiest: 0 });
    expect(r.map!.cells).toEqual([{ i: Math.floor(43.07 / 0.0036), j: Math.floor(-87.91 / 0.0049), band: 1 }]);
    expect(r.map!.area).toBe("Harambee");
  });
  it("maps a citywide count with the grid query; records without a location make the map total smaller, never larger", async () => {
    const t = await seed();
    const fake = installFakeFetch({ citySql: (sql) => sql.includes("GROUP BY i, j") ? [{ i: 11962, j: -17952, n: "110" }, { i: 11957, j: -17950, n: "3" }] : sql.includes("> '") ? [{ n: "0" }] : [{ n: "120" }] });
    const r = await t.withIdentity(reader).action(api.city.countRecords, { code: "P01" });
    if (r.status !== "ok") throw new Error(r.status);
    expect(r.count).toBe(120);
    expect(r.map!.summary).toEqual({ total: 113, areas: 2, fivePlus: 1, busiest: 110 });
    expect(r.map!.summary.total).toBeLessThanOrEqual(r.count);
    expect(fake.calls.some((c) => c.url.includes("GROUP+BY+i") || decodeURIComponent(c.url).includes("GROUP BY i, j"))).toBe(true);
  });
  it("skips grid rows without a usable cell or count", async () => {
    const t = await seed();
    installFakeFetch({ citySql: (sql) => sql.includes("GROUP BY i, j") ? [{ i: 11962, j: -17952, n: "6" }, { n: "1" }] : sql.includes("> '") ? [{ n: "0" }] : [{ n: "6" }] });
    const r = await t.withIdentity(reader).action(api.city.countRecords, { code: "P01" });
    if (r.status !== "ok") throw new Error(r.status);
    expect(r.map!.cells).toHaveLength(1);
    expect(r.map!.summary.total).toBe(6);
  });
  it("draws no map when the City cuts the citywide grid answer off", async () => {
    const t = await seed();
    installFakeFetch({ citySql: (sql) => sql.includes("GROUP BY i, j") ? Array.from({ length: 32000 }, (_, k) => ({ i: k, j: 0, n: "1" })) : sql.includes("> '") ? [{ n: "0" }] : [{ n: "120" }] });
    const r = await t.withIdentity(reader).action(api.city.countRecords, { code: "P01" });
    expect(r).toMatchObject({ status: "ok", count: 120, map: null });
  });
  it("has no map for a dataset without location columns", async () => {
    const t = await seed();
    await t.run(async (ctx) => { const p = (await ctx.db.query("cityProfiles").first())!; await ctx.db.patch(p._id, { latColumn: null, lonColumn: null }); });
    installFakeFetch({ citySql: () => [{ n: "7" }] });
    const r = await t.withIdentity(reader).action(api.city.countRecords, { code: "P01" });
    expect(r).toMatchObject({ status: "ok", map: null });
  });
  it("never counts a name that matches nothing, and asks which for an unclear one", async () => {
    const t = await seed();
    await withHarambee(t);
    const fake = installFakeFetch({ citySql: () => [{ n: "5" }] });
    expect(await t.withIdentity(reader).action(api.city.countRecords, { code: "P01", neighborhood: "Gotham Heights" })).toMatchObject({ status: "no-neighborhood", asked: "Gotham Heights", nearest: ["Harambee"] });
    expect(await t.withIdentity(reader).action(api.city.countRecords, { code: "P01", neighborhood: "Harambe" })).toMatchObject({ status: "choose", column: "neighborhood", choices: ["Harambee"] });
    expect(fake.calls.filter((c) => c.url.includes("datastore_search_sql"))).toHaveLength(0);
  });
  it("refuses a dataset without locations, a too-broad question, and an empty boundary table", async () => {
    const t = await seed();
    await withHarambee(t);
    await t.run(async (ctx) => {
      const p = (await ctx.db.query("cityProfiles").first())!;
      await ctx.db.patch(p._id, { latColumn: null, lonColumn: null });
    });
    expect(await t.withIdentity(reader).action(api.city.countRecords, { code: "P01", neighborhood: "Harambee" })).toMatchObject({ status: "no-locations" });

    const t2 = await seed();
    await withHarambee(t2);
    installFakeFetch({ citySql: (sql) => (sql.includes(" AS lat") ? Array.from({ length: 32000 }, () => ({ lat: 43.07, lon: -87.91 })) : [{ n: "0" }]) });
    expect(await t2.withIdentity(reader).action(api.city.countRecords, { code: "P01", neighborhood: "Harambee" })).toMatchObject({ status: "too-broad", area: "Harambee (City of Milwaukee boundary)" });

    const t3 = await seed();
    expect(await t3.withIdentity(reader).action(api.city.countRecords, { code: "P01", neighborhood: "Harambee" })).toMatchObject({ status: "unavailable" });
  });
  it("says too-broad when the City itself reports a truncated page, even under the row cap", async () => {
    const t = await seed();
    await withHarambee(t);
    installFakeFetch({ citySql: (sql) => (sql.includes(" AS lat") ? [{ lat: 43.07, lon: -87.91 }] : [{ n: "0" }]), citySqlTruncated: (sql) => sql.includes(" AS lat") });
    expect(await t.withIdentity(reader).action(api.city.countRecords, { code: "P01", neighborhood: "Harambee" })).toMatchObject({ status: "too-broad", area: "Harambee (City of Milwaukee boundary)" });
  });
  it("answers unavailable, never a citywide count, when the boundary has no rectangle", async () => {
    const t = await seed();
    await t.run((ctx) => ctx.db.insert("neighborhoods", { definition: "city", name: "Harambee", matchKey: "harambee", geometry: JSON.stringify({ type: "Polygon", coordinates: [ring] }) }));
    const fake = installFakeFetch({ citySql: () => [{ n: "999" }] });
    expect(await t.withIdentity(reader).action(api.city.countRecords, { code: "P01", neighborhood: "Harambee" })).toMatchObject({ status: "unavailable" });
    expect(fake.calls.filter((c) => c.url.includes("datastore_search_sql"))).toHaveLength(0);
  });
  it("answers a period outside the data's coverage without asking the City", async () => {
    const t = await seed();
    await withHarambee(t);
    const fake = installFakeFetch({ cityStatus: 500 });
    expect(await t.withIdentity(reader).action(api.city.countRecords, { code: "P01", neighborhood: "Harambee", from: "2010-01-01", to: "2010-12-31" })).toMatchObject({ status: "outside-coverage" });
    expect(fake.calls.filter((c) => c.url.includes("datastore_search_sql"))).toHaveLength(0);
  });
});
