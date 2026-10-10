/// <reference types="vite/client" />
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { installFakeFetch } from "../tests/helpers/fakeFetch";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");
const reader = { subject: "u1", issuer: "test", tokenIdentifier: "test|u1" };
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

const URL_2022 = "https://services.arcgis.com/x/arcgis/rest/services/Poverty_2022/FeatureServer/0";
const POV_FIELDS = [
  { name: "OBJECTID", type: "esriFieldTypeOID" },
  { name: "GEOID", type: "esriFieldTypeString" },
  { name: "NAME", type: "esriFieldTypeString" },
  { name: "households", type: "esriFieldTypeInteger" },
  { name: "pov_rate", type: "esriFieldTypeDouble" },
  { name: "pov_rate_moe", type: "esriFieldTypeDouble" },
];
// 25 tracts, 1000..1024 (tract 10.00 and up); tract 1860 is Harambee's and the poorest.
export const povertyRows = () => ({
  features: [
    ...Array.from({ length: 24 }, (_, i) => ({ attributes: { GEOID: `55079${String(100000 + i * 100).slice(-6)}`, pov_rate: 10 + i, pov_rate_moe: 1 } })),
    { attributes: { GEOID: "55079186000", pov_rate: 58, pov_rate_moe: 4 } },
  ],
});

export async function seedTracts() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  await t.run(async (ctx) => {
    await ctx.db.insert("families", { key: "e02", code: "E02", name: "Households Living in Poverty", kind: "dataset", topic: "Economy", keywords: [], places: ["City"], years: [2022], latestModified: "2024-01-01", baseSearchText: "", searchText: "", dictionaryTab: null });
    const member = { kind: "dataset" as const, landingPage: "", place: "City", years: [2022], modified: "2024-01-01", downloads: {}, description: "", keywords: [] };
    await ctx.db.insert("members", { familyKey: "e02", hubId: "h1", title: "Poverty 2022", yearLabel: "2022", featureServerUrl: URL_2022, ...member });
    await ctx.db.insert("members", { familyKey: "e02", hubId: "h2", title: "Poverty 2022 (no service)", yearLabel: "2023", featureServerUrl: null, ...member });
    await ctx.db.insert("cards", { familyKey: "e02", inputHash: "h", explainer: "x", explainerProvenance: "AI", hubSummary: "", glossary: [{ field: "pov_rate", meaning: "Share of households below the poverty line.", provenance: "DYCU" }, { field: "households", meaning: "Number of households.", provenance: "DYCU" }], caveats: ["Survey estimates pool five years."], storyAngles: [], basic: false, embedding: new Array(1536).fill(0) });
    await ctx.db.insert("neighborhoods", { definition: "dycu", name: "Harambee", matchKey: "harambee", tracts: [{ years: [2021, 2022, 2023, 2024], tracts: ["1860"] }] });
  });
  return t;
}

describe("rankTracts", () => {
  it("ranks tracts with ranges and names, stores the full answer, and serves it by key", async () => {
    const t = await seedTracts();
    installFakeFetch({ columns: POV_FIELDS, tractRows: povertyRows });
    const r = await t.withIdentity(reader).action(api.tracts.rankTracts, { code: "e02", column: "POV_RATE", place: "City", year: "2022", direction: "high" });
    expect(r).toMatchObject({ status: "ok", tool: "rank", header: { code: "E02", column: "pov_rate", kind: "rate", place: "City", year: "2022", n: 25, leftOut: 0, confidence: "90% confidence (Census)" } });
    if (r.status !== "ok") return;
    expect(r.top[0]).toMatchObject({ tract: "1860", neighborhood: "Harambee", value: 58, lo: 54, hi: 62, unreliable: false });
    expect(r.top).toHaveLength(10);
    expect(await t.query(api.tracts.tractDetail, { key: r.key, now: Date.now() })).toMatchObject({ status: "ok", tool: "rank" });
  });
  it("offers the numeric columns when the column isn't one", async () => {
    const t = await seedTracts();
    installFakeFetch({ columns: POV_FIELDS, tractRows: povertyRows });
    const r = await t.withIdentity(reader).action(api.tracts.rankTracts, { code: "E02", column: "NAME", place: "City", year: "2022", direction: "high" });
    expect(r).toMatchObject({ status: "choose-column", columns: expect.arrayContaining([{ column: "pov_rate", meaning: "Share of households below the poverty line." }]) });
    expect(JSON.stringify(r)).not.toContain("pov_rate_moe");
  });
  it("lists the place/years that exist when asked for one that doesn't (a year with no map service doesn't count)", async () => {
    const t = await seedTracts();
    installFakeFetch({ columns: POV_FIELDS, tractRows: povertyRows });
    expect(await t.withIdentity(reader).action(api.tracts.rankTracts, { code: "E02", column: "pov_rate", place: "City", year: "2023", direction: "high" })).toEqual({ status: "choose-year", available: [{ place: "City", year: "2022" }] });
  });
  it("refuses unknown codes, non-tract datasets and a down server, and needs sign-in", async () => {
    const t = await seedTracts();
    installFakeFetch({ columns: POV_FIELDS.filter((f) => f.name !== "GEOID"), tractRows: povertyRows });
    expect(await t.withIdentity(reader).action(api.tracts.rankTracts, { code: "Z99", column: "pov_rate", place: "City", year: "2022", direction: "high" })).toEqual({ status: "not-found" });
    expect(await t.withIdentity(reader).action(api.tracts.rankTracts, { code: "E02", column: "pov_rate", place: "City", year: "2022", direction: "high" })).toEqual({ status: "not-tract" });
    installFakeFetch({ columns: POV_FIELDS, tractRows: povertyRows, tractStatus: 500 });
    expect(await t.withIdentity(reader).action(api.tracts.rankTracts, { code: "E02", column: "pov_rate", place: "City", year: "2022", direction: "high" })).toEqual({ status: "unavailable" });
    await expect(t.action(api.tracts.rankTracts, { code: "E02", column: "pov_rate", place: "City", year: "2022", direction: "high" })).rejects.toThrow(/Sign in/);
  });
  it("answers an expired or unknown key with expired", async () => {
    const t = await seedTracts();
    expect(await t.query(api.tracts.tractDetail, { key: "tracts:nope", now: Date.now() })).toEqual({ status: "expired" });
  });

  it("gives the full totals: the model's lists are cut to 10, the card's are not", async () => {
    const t = await seedTracts();
    const geoid = (i: number) => `55079${String(100000 + i * 100).slice(-6)}`;
    const rows = () => ({
      features: [
        ...Array.from({ length: 25 }, (_, i) => ({ attributes: { GEOID: geoid(i), pov_rate: 50, pov_rate_moe: 1 } })), // all tied
        ...Array.from({ length: 12 }, (_, i) => ({ attributes: { GEOID: geoid(30 + i), pov_rate: 2, pov_rate_moe: 5 } })), // all unreliable
      ],
    });
    installFakeFetch({ columns: POV_FIELDS, tractRows: rows });
    const r = await t.withIdentity(reader).action(api.tracts.rankTracts, { code: "E02", column: "pov_rate", place: "City", year: "2022", direction: "high" });
    if (r.status !== "ok") throw new Error("expected ok");
    expect(r.top).toHaveLength(10);
    expect(r.ties).toHaveLength(10);
    expect(r.tieCount).toBe(15);
    expect(r.unreliable).toHaveLength(10);
    expect(r.unreliableCount).toBe(12);
    const stored = await t.query(api.tracts.tractDetail, { key: r.key, now: Date.now() });
    expect(stored).toMatchObject({ status: "ok", tieCount: 15, unreliableCount: 12 });
    if (stored.status !== "ok") return;
    expect(stored.ties).toHaveLength(15);
    expect(stored.unreliable).toHaveLength(12);
  });
  it("reads DYCU's rows once for the same dataset, however the question is turned", async () => {
    const t = await seedTracts();
    let fetched = 0;
    installFakeFetch({ columns: POV_FIELDS, tractRows: () => { fetched++; return povertyRows(); } });
    const ask = (direction: "high" | "low") => t.withIdentity(reader).action(api.tracts.rankTracts, { code: "E02", column: "pov_rate", place: "City", year: "2022", direction });
    expect(await ask("high")).toMatchObject({ status: "ok" });
    expect(await ask("low")).toMatchObject({ status: "ok", direction: "low" });
    expect(fetched).toBe(1);
  });
  it("matches years across dash styles", async () => {
    const t = await seedTracts();
    installFakeFetch({ columns: POV_FIELDS, tractRows: povertyRows });
    await t.run(async (ctx) => {
      const m = await ctx.db.query("members").withIndex("by_hubId", (q) => q.eq("hubId", "h1")).first();
      if (m) await ctx.db.patch(m._id, { yearLabel: "2018\u20132022" });
    });
    expect(await t.withIdentity(reader).action(api.tracts.rankTracts, { code: "E02", column: "pov_rate", place: "City", year: "2018-2022", direction: "high" })).toMatchObject({ status: "ok" });
  });
  it("spends the person's allowance only when DYCU is about to be asked", async () => {
    const t = await seedTracts();
    installFakeFetch({ columns: POV_FIELDS, tractRows: povertyRows });
    const as = t.withIdentity(reader);
    const go = (year: string) => as.action(api.tracts.rankTracts, { code: "E02", column: "pov_rate", place: "City", year, direction: "high" });
    for (let i = 0; i < 25; i++) expect(await go("2023")).toMatchObject({ status: "choose-year" });
    expect(await as.action(api.tracts.rankTracts, { code: "Z99", column: "pov_rate", place: "City", year: "2022", direction: "high" })).toEqual({ status: "not-found" });
    for (let i = 0; i < 20; i++) expect(await go("2022")).toMatchObject({ status: "ok" });
    expect(await go("2022")).toEqual({ status: "busy" });
  });
  it("treats a City family as not a tract dataset", async () => {
    const t = await seedTracts();
    await t.run((ctx) => ctx.db.insert("families", { key: "c01", code: "C01", name: "City thing", kind: "dataset", topic: "x", keywords: [], places: [], years: [], latestModified: "2024-01-01", baseSearchText: "", searchText: "", dictionaryTab: null, source: "city" }));
    installFakeFetch({ columns: POV_FIELDS, tractRows: povertyRows });
    expect(await t.withIdentity(reader).action(api.tracts.rankTracts, { code: "C01", column: "pov_rate", place: "City", year: "2022", direction: "high" })).toEqual({ status: "not-found" });
  });
  it("leaves the Low/High_Confidence columns out of the choices", async () => {
    const t = await seedTracts();
    installFakeFetch({ columns: [...POV_FIELDS, { name: "Low_Confidence", type: "esriFieldTypeDouble" }, { name: "High_Confidence", type: "esriFieldTypeDouble" }], tractRows: povertyRows });
    const r = await t.withIdentity(reader).action(api.tracts.rankTracts, { code: "E02", column: "NAME", place: "City", year: "2022", direction: "high" });
    expect(JSON.stringify(r)).not.toContain("_Confidence");
  });
});
