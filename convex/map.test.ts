/// <reference types="vite/client" />
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { installFakeFetch } from "../tests/helpers/fakeFetch";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
const reader = { subject: "u1", issuer: "test", tokenIdentifier: "test|u1" };
const ring = [[-87.92, 43.06], [-87.9, 43.06], [-87.9, 43.08], [-87.92, 43.08], [-87.92, 43.06]];

async function seed() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  await t.run(async (ctx) => {
    await ctx.db.insert("families", { key: "city:nibrs-crime-data", code: "P01", name: "NIBRS Crime Data", kind: "dataset", topic: "Public Safety", keywords: [], places: ["City"], years: [], latestModified: "2023-01-05", baseSearchText: "", searchText: "", dictionaryTab: null, source: "city", live: true });
    await ctx.db.insert("cityProfiles", { familyKey: "city:nibrs-crime-data", resourceId: "87843297-a6fa-46d4-ba5d-cb342fb2d3bb", columns: [], dateColumn: "Incident_Date", districtColumns: [], categories: [{ column: "Offense_All", values: [{ value: "120", count: 5 }], multi: true }], rowCount: 10, minDate: "2024-01-01", maxDate: "2026-10-08", namesPeople: false, signature: "s", updatedAt: 0, latColumn: "Address_Latitude", lonColumn: "Address_Longitude" });
    await ctx.db.insert("neighborhoods", { definition: "city", name: "Harambee", matchKey: "harambee", geometry: JSON.stringify({ type: "Polygon", coordinates: [ring] }), bbox: { minLat: 43.06, maxLat: 43.08, minLon: -87.92, maxLon: -87.9 } });
  });
  return t;
}

describe("mapCells", () => {
  it("works signed out and answers a repeat from the cache without asking the City", async () => {
    const t = await seed();
    const fake = installFakeFetch({ citySql: (sql) => (sql.includes("GROUP BY i, j") ? [{ i: 1, j: 2, n: "6" }] : [{ n: "6" }]) });
    const a = await t.action(api.map.mapCells, { code: "P01" });
    expect(a).toMatchObject({ status: "ok", count: 6, map: { summary: { total: 6 } } });
    const before = fake.calls.length;
    const b = await t.action(api.map.mapCells, { code: "p01" });
    expect(b).toEqual(a);
    expect(fake.calls.length).toBe(before);
  });
  it("asks the City again after 10 minutes", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const t = await seed();
    const fake = installFakeFetch({ citySql: () => [{ n: "1" }] });
    await t.action(api.map.mapCells, { code: "P01" });
    const before = fake.calls.length;
    vi.advanceTimersByTime(10 * 60_000 + 1);
    await t.action(api.map.mapCells, { code: "P01" });
    expect(fake.calls.length).toBeGreaterThan(before);
  });
  it("says busy when the site-wide limit is spent, but still serves cached answers", async () => {
    const t = await seed();
    installFakeFetch({ citySql: (sql) => (sql.includes("GROUP BY i, j") ? [{ i: 1, j: 2, n: "1" }] : [{ n: "1" }]) });
    const cached = await t.action(api.map.mapCells, { code: "P01" });
    let busy: unknown = null;
    for (let k = 0; k < 40 && !busy; k++) {
      const r = await t.action(api.map.mapCells, { code: "P01", from: `2025-01-${String((k % 28) + 1).padStart(2, "0")}` });
      if (r.status === "busy") busy = r;
    }
    expect(busy).toEqual({ status: "busy" });
    expect(await t.action(api.map.mapCells, { code: "P01" })).toEqual(cached);
  });
  it("serves Ask's count map from the cache countRecords leaves, without asking the City (C1)", async () => {
    const t = await seed();
    const fake = installFakeFetch({ citySql: (sql) => (sql.includes("GROUP BY i, j") ? [{ i: 1, j: 2, n: "6" }] : sql.includes("left(") ? [{ g: "2026-09", n: "6" }] : [{ n: "6" }]) });
    const args = { code: "p01", from: "2025-01-01", filters: [{ column: "Offense_All", values: ["120"] }] };
    const counted = await t.withIdentity(reader).action(api.city.countRecords, { ...args, groupBy: "month" });
    expect(counted).toMatchObject({ status: "ok", count: 6 });
    const before = fake.calls.length;
    const r = await t.action(api.map.mapCells, args);
    expect(fake.calls.length).toBe(before);
    expect(r).toMatchObject({ status: "ok", count: 6, map: { cells: [{ i: 1, j: 2, band: 2, n: 6 }] } });
  });
  it("spends the site-wide budget only on real City queries: refusals are free (I1)", async () => {
    const t = await seed();
    const fake = installFakeFetch({ citySql: () => [{ n: "1" }] });
    for (let k = 0; k < 30; k++) expect(await t.action(api.map.mapCells, { code: "P01", neighborhood: `Gotham ${k}` })).toMatchObject({ status: "no-neighborhood" });
    expect(fake.calls.length).toBe(0);
    expect(await t.action(api.map.mapCells, { code: "P01" })).toMatchObject({ status: "ok" });
  });
  it("refuses oversize input without asking the City (I1)", async () => {
    const t = await seed();
    const fake = installFakeFetch({ citySql: () => [{ n: "1" }] });
    expect(await t.action(api.map.mapCells, { code: "P01", neighborhood: "x".repeat(81) })).toEqual({ status: "bad-input" });
    expect(await t.action(api.map.mapCells, { code: "P01", filters: [{ column: "Offense_All", values: Array.from({ length: 11 }, (_, k) => String(k)) }] })).toEqual({ status: "bad-input" });
    expect(await t.action(api.map.mapCells, { code: "P01", from: "2025-01-01T00:00" })).toEqual({ status: "bad-input" });
    expect(fake.calls.length).toBe(0);
  });
  it("returns a City neighborhood's shape and the list of names", async () => {
    const t = await seed();
    expect(await t.query(api.map.cityShape, { name: "harambee" })).toMatchObject({ name: "Harambee", bbox: { minLat: 43.06 } });
    expect(await t.query(api.map.cityShape, { name: "Gotham" })).toBeNull();
    expect(await t.query(api.map.cityNeighborhoodNames, {})).toEqual(["Harambee"]);
  });
});
