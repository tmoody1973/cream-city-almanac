/// <reference types="vite/client" />
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { installFakeFetch } from "../tests/helpers/fakeFetch";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");
const reader = { subject: "u1", issuer: "test", tokenIdentifier: "test|u1" };
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const N03 = "document:neighborhood-portrait-spreadsheet";
// A square City neighborhood around 2400 W Center St; DYCU's Harambee is tract 88.
async function seed() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  await t.run(async (ctx) => {
    await ctx.db.insert("neighborhoods", { definition: "city", name: "Harambee", matchKey: "harambee", geometry: JSON.stringify({ type: "Polygon", coordinates: [[[-87.95, 43.06], [-87.93, 43.06], [-87.93, 43.08], [-87.95, 43.08], [-87.95, 43.06]]] }), bbox: { minLat: 43.06, maxLat: 43.08, minLon: -87.95, maxLon: -87.93 } });
    await ctx.db.insert("neighborhoods", { definition: "dycu", name: "Harambee", matchKey: "harambee", tracts: [{ years: [2024], tracts: ["88"] }] });
    await ctx.db.insert("families", { key: N03, code: "N03", name: "Neighborhood Portrait Spreadsheet", kind: "document", topic: "Neighborhoods", keywords: [], places: [], years: [2024], latestModified: "2026-01-22", baseSearchText: "", searchText: "", dictionaryTab: null });
    await ctx.db.insert("members", { familyKey: N03, hubId: "h24", title: "2024 Harambee Neighborhood Portrait Spreadsheet", yearLabel: "2024", place: "Harambee", years: [2024], kind: "document", landingPage: "", featureServerUrl: null, modified: "2026-01-22", downloads: {}, description: "", keywords: [] });
  });
  return t;
}
const reply = (lat: number, lon: number, geoid: string) => () => ({ result: { addressMatches: [{ matchedAddress: "2400 W CENTER ST, MILWAUKEE, WI, 53206", coordinates: { x: lon, y: lat }, geographies: { "Census Tracts": [{ GEOID: geoid }] } }] } });

describe("findPlace", () => {
  it("finds the tract, the City neighborhood and DYCU's area with its fact sheet", async () => {
    const t = await seed();
    installFakeFetch({ geocoder: reply(43.0679, -87.9425, "55079008800") });
    expect(await t.withIdentity(reader).action(api.places.findPlace, { address: "2400 W Center St" })).toEqual({
      status: "ok", matched: "2400 W CENTER ST, MILWAUKEE, WI, 53206", tract: { geoid: "55079008800", number: "88" },
      neighborhood: "Harambee", inCity: true, dycu: [{ name: "Harambee", slug: "harambee" }],
    });
  });
  it("gives the tract only for a County address outside the City, and refuses one outside the County", async () => {
    const t = await seed();
    installFakeFetch({ geocoder: reply(43.2, -87.95, "55079150100") });
    expect(await t.withIdentity(reader).action(api.places.findPlace, { address: "Somewhere, Brown Deer, WI" })).toMatchObject({ status: "ok", neighborhood: null, inCity: false, tract: { number: "1501" } });
    installFakeFetch({ geocoder: reply(43.0, -88.2, "55133200100") });
    expect(await t.withIdentity(reader).action(api.places.findPlace, { address: "1 Main St, Waukesha, WI" })).toEqual({ status: "outside-county" });
  });
  it("says no match, unavailable and bad address plainly, and never logs the address", async () => {
    const t = await seed();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    installFakeFetch({ geocoder: () => ({ result: { addressMatches: [] } }) });
    expect(await t.withIdentity(reader).action(api.places.findPlace, { address: "123 Nowhere Blvd" })).toEqual({ status: "no-match" });
    installFakeFetch({ geocoder: () => ({}), geocoderStatus: 500 });
    expect(await t.withIdentity(reader).action(api.places.findPlace, { address: "77 Secret Ln" })).toEqual({ status: "unavailable" });
    vi.stubGlobal("fetch", vi.fn(async (url: string) => { throw new Error(`Request timed out: ${url}`); }));
    expect(await t.withIdentity(reader).action(api.places.findPlace, { address: "77 Secret Ln" })).toEqual({ status: "unavailable" });
    expect(await t.withIdentity(reader).action(api.places.findPlace, { address: "  a " })).toEqual({ status: "bad-address" });
    expect(log.mock.calls.flat().join(" ")).not.toMatch(/Secret/);
  });
  it("needs sign-in in Ask, but the public box doesn't, and the box has a site-wide limit", async () => {
    const t = await seed();
    installFakeFetch({ geocoder: reply(43.0679, -87.9425, "55079008800") });
    await expect(t.action(api.places.findPlace, { address: "2400 W Center St" })).rejects.toThrow(/Sign in/);
    expect(await t.action(api.places.placeForBox, { address: "2400 W Center St" })).toMatchObject({ status: "ok" });
    const last = [];
    for (let i = 0; i < 21; i++) last.push((await t.action(api.places.placeForBox, { address: "2400 W Center St" })).status);
    expect(last).toContain("busy");
  });
  it("changes no table", async () => {
    const t = await seed();
    installFakeFetch({ geocoder: reply(43.0679, -87.9425, "55079008800") });
    const counts = () => t.run(async (ctx) => Object.fromEntries(await Promise.all(Object.keys(schema.tables).map(async (n) => [n, (await ctx.db.query(n as never).collect()).length]))));
    const before = await counts();
    await t.withIdentity(reader).action(api.places.findPlace, { address: "2400 W Center St" });
    await t.action(api.places.placeForBox, { address: "2400 W Center St" });
    expect(await counts()).toEqual(before);
  });
});
