/// <reference types="vite/client" />
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { installFakeFetch } from "../tests/helpers/fakeFetch";
import { runRefresh, seedBoundaryData } from "../tests/helpers/boundaryFixtures";
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
      boundaries: { asOf: null, district: null, ward: null, investment: [], development: [] },
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

describe("review fixes", () => {
  it("says the service didn't respond when a match has no tract, rather than calling it outside the County", async () => {
    const t = await seed();
    installFakeFetch({ geocoder: () => ({ result: { addressMatches: [{ matchedAddress: "X", coordinates: { x: -87.94, y: 43.07 }, geographies: {} }] } }) });
    expect(await t.withIdentity(reader).action(api.places.findPlace, { address: "2400 W Center St" })).toEqual({ status: "unavailable" });
  });
  it("checks the address before spending the site-wide allowance", async () => {
    const t = await seed();
    installFakeFetch({ geocoder: reply(43.0679, -87.9425, "55079008800") });
    for (let i = 0; i < 25; i++) await t.action(api.places.placeForBox, { address: " " });
    expect(await t.action(api.places.placeForBox, { address: "2400 W Center St" })).toMatchObject({ status: "ok" });
  });
});


// A fresh backend with the boundary fixtures (tract 88 = the City's and DYCU's Harambee), refreshed when asked.
async function seedBoundaries() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  await seedBoundaryData(t);
  return t;
}

describe("address boundaries", () => {
  it("gives the district and alder, the ward and its polling place, and the investment and development areas", async () => {
    const t = await seedBoundaries();
    await runRefresh(t);
    installFakeFetch({ geocoder: reply(43.07, -87.945, "55079008800") });
    const r = await t.withIdentity(reader).action(api.places.findPlace, { address: "2400 W Center St" });
    expect(r).toMatchObject({ status: "ok", inCity: true, boundaries: {
      district: { name: "District 6", alder: "Jane Doe" },
      ward: { name: "Ward 112", pollingPlace: "North Division High School", accessibleEntrance: "Main entrance on W Center St", mainParking: "" },
      investment: ["Harambee Proud TIN", "NRSA 1", "NSP 7: Harambee Great Neighborhood Initiative"],
      development: ["Opportunity Zone (2010 tract 88)"],
    } });
    expect(r.status === "ok" && r.boundaries.asOf).toBeGreaterThan(0);
  });
});

describe("boundariesFor", () => {
  const ask = async (args: Record<string, unknown>) => {
    const t = await seedBoundaries();
    await runRefresh(t);
    return t.withIdentity(reader).action(api.places.boundariesFor, args as never);
  };
  it("lists the boundaries covering a City neighborhood, with shares", async () => {
    const r = await ask({ neighborhood: "Harambee", kinds: ["tin", "tid"] });
    expect(r).toMatchObject({ status: "ok", place: { type: "city", name: "Harambee" }, kinds: ["tin", "tid"] });
    expect(r.status === "ok" && r.covers.map((c) => c.kind)).toEqual(["tin", "tid"]);
    expect(r.status === "ok" && r.asOf).toBeGreaterThan(0);
  });
  it("answers for DYCU's area, a tract and a district, with the district's alder and its wards' polling places", async () => {
    expect(await ask({ neighborhood: "Harambee", map: "dycu", kinds: ["tin"] })).toMatchObject({ status: "ok", place: { type: "dycu", name: "Harambee" } });
    expect(await ask({ tract: "88", kinds: ["oz"] })).toMatchObject({ status: "ok", place: { type: "tract", name: "Census tract 88" }, covers: [{ kind: "oz", name: "Opportunity Zone (2010 tract 88)" }] });
    const d = await ask({ district: 6, kinds: ["ward"] });
    expect(d).toMatchObject({ status: "ok", place: { type: "district", name: "District 6", details: { alder: "Jane Doe" } } });
    expect(d.status === "ok" && d.covers[0].details).toMatchObject({ pollingPlace: "North Division High School" });
  });
  it("refuses an unknown place with suggestions, a tract outside the City's boundaries, and an empty table", async () => {
    expect((await ask({ neighborhood: "Atlantis" })).status).toBe("unknown-place");
    expect(await ask({ tract: "1501" })).toEqual({ status: "outside-city" });
    expect(await ask({ tract: "9999" })).toEqual({ status: "unknown-place", suggestions: [] });
    expect(await ask({})).toEqual({ status: "unknown-place", suggestions: [] });
    expect(await ask({ tract: "88", district: 6 })).toEqual({ status: "unknown-place", suggestions: [] });
    const t = await seedBoundaries(); // nothing refreshed
    expect(await t.withIdentity(reader).action(api.places.boundariesFor, { district: 6 })).toEqual({ status: "not-loaded" });
  });
  it("needs sign-in and changes no table", async () => {
    const t = await seedBoundaries();
    await runRefresh(t);
    await expect(t.action(api.places.boundariesFor, { district: 6 })).rejects.toThrow(/Sign in/);
    const counts = () => t.run(async (ctx) => Object.fromEntries(await Promise.all(Object.keys(schema.tables).map(async (n) => [n, (await ctx.db.query(n as never).collect()).length]))));
    const before = await counts();
    await t.withIdentity(reader).action(api.places.boundariesFor, { neighborhood: "Harambee" });
    expect(await counts()).toEqual(before);
  });
});
