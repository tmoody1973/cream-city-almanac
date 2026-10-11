/// <reference types="vite/client" />
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { installFakeFetch } from "../tests/helpers/fakeFetch";
import { api } from "./_generated/api";
import { rateLimiter } from "./limits";
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
    const shapes = ["Shape__Area", "Shape__Length", "ALAND", "AWATER"].map((name) => ({ name, type: "esriFieldTypeDouble" }));
    installFakeFetch({ columns: [...POV_FIELDS, ...shapes], tractRows: povertyRows });
    const r = await t.withIdentity(reader).action(api.tracts.rankTracts, { code: "E02", column: "NAME", place: "City", year: "2022", direction: "high" });
    // Each column says whether it has a margin of error, so the model can prefer one that does.
    expect(r).toMatchObject({ status: "choose-column", columns: [{ column: "households", meaning: "Number of households.", range: false }, { column: "pov_rate", meaning: "Share of households below the poverty line.", range: true }] });
    expect(JSON.stringify(r)).not.toContain("pov_rate_moe");
    for (const junk of ["Shape__", "ALAND", "AWATER"]) expect(JSON.stringify(r)).not.toContain(junk);
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
  it("keeps a card's full answer for the day, long after the 10-minute rows cache", async () => {
    const t = await seedTracts();
    installFakeFetch({ columns: POV_FIELDS, tractRows: povertyRows });
    const r = await t.withIdentity(reader).action(api.tracts.rankTracts, { code: "E02", column: "pov_rate", place: "City", year: "2022", direction: "high" });
    if (r.status !== "ok") throw new Error("expected ok");
    expect(await t.query(api.tracts.tractDetail, { key: r.key, now: Date.now() + 11 * 60_000 })).toMatchObject({ status: "ok", tool: "rank" });
    expect(await t.query(api.tracts.tractDetail, { key: r.key, now: Date.now() + 25 * 3_600_000 })).toEqual({ status: "expired" });
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
    expect(r.ties).toHaveLength(3);
    expect(r.tieCount).toBe(15);
    expect(r.unreliable).toHaveLength(3);
    expect(r.unreliableCount).toBe(12);
    const stored = await t.query(api.tracts.tractDetail, { key: r.key, now: Date.now() });
    expect(stored).toMatchObject({ status: "ok", tieCount: 15, unreliableCount: 12 });
    if (stored.status !== "ok" || stored.tool !== "rank") throw new Error("expected a stored rank");
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
    expect(await t.withIdentity(reader).action(api.tracts.rankTracts, { code: "E02", column: "pov_rate", place: "City", year: "2018-2022", direction: "high" })).toMatchObject({ status: "ok", header: { year: "2018\u20132022" } });
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

const URL_F02 = "https://services.arcgis.com/x/arcgis/rest/services/FoodSecurity_MKE_2022/FeatureServer/0";
const F02_FIELDS = [
  { name: "GEOID", type: "esriFieldTypeString" },
  { name: "per_insecure", type: "esriFieldTypeDouble" },
  { name: "Low_Confidence_Limit", type: "esriFieldTypeDouble" },
  { name: "High_Confidence_Limit", type: "esriFieldTypeDouble" },
];

async function seedPair() {
  const t = await seedTracts();
  await t.run(async (ctx) => {
    await ctx.db.insert("families", { key: "f02", code: "F02", name: "Food Insecurity Prevalence", kind: "dataset", topic: "Health", keywords: [], places: ["City"], years: [2022], latestModified: "2024-01-01", baseSearchText: "", searchText: "", dictionaryTab: null });
    await ctx.db.insert("members", { familyKey: "f02", hubId: "f1", title: "Food 2022", yearLabel: "2022", featureServerUrl: URL_F02, kind: "dataset", landingPage: "", place: "City", years: [2022], modified: "2024-01-01", downloads: {}, description: "", keywords: [] });
    await ctx.db.insert("cards", { familyKey: "f02", inputHash: "h", explainer: "x", explainerProvenance: "AI", hubSummary: "", glossary: [{ field: "per_insecure", meaning: "Percent of adults food-insecure (model estimate).", provenance: "DYCU" }], caveats: ["Model-based estimates."], storyAngles: [], basic: false, embedding: new Array(1536).fill(0) });
  });
  return t;
}

// Food insecurity mirrors poverty, except Harambee's tract: high poverty, clearly low food insecurity. One F02 GEOID
// arrives as a number and one as a bare 6-digit tract; both must still match.
const foodRows = () => ({
  features: [
    ...Array.from({ length: 24 }, (_, i) => ({ attributes: { GEOID: i === 0 ? 55079100000 : i === 1 ? "100100" : `55079${String(100000 + i * 100).slice(-6)}`, per_insecure: 10 + i, Low_Confidence_Limit: 9.5 + i, High_Confidence_Limit: 10.5 + i } })),
    { attributes: { GEOID: "55079186000", per_insecure: 8, Low_Confidence_Limit: 7, High_Confidence_Limit: 9 } },
  ],
});
const routeRows = (url: string) => (url.includes("FoodSecurity") ? foodRows() : povertyRows());
const routeFields = (url: string) => (url.includes("FoodSecurity") ? F02_FIELDS : POV_FIELDS);
const relateArgs = { a: { code: "E02", column: "pov_rate" }, b: { code: "F02", column: "per_insecure" }, place: "City" as const, year: "2022" };

describe("relateTracts", () => {
  it("lines two datasets up by tract, words the relationship, and keeps points out of the model's answer", async () => {
    const t = await seedPair();
    installFakeFetch({ columnsFor: routeFields, tractRows: routeRows });
    const r = await t.withIdentity(reader).action(api.tracts.relateTracts, { ...relateArgs, mode: "relate" });
    expect(r).toMatchObject({ status: "ok", tool: "relate", n: 25, strength: "strong", direction: "higher", a: { confidence: "90% confidence (Census)" }, b: { confidence: "95% confidence (CDC)" } });
    expect(r).not.toHaveProperty("points");
    if (r.status !== "ok") return;
    const stored = await t.query(api.tracts.tractDetail, { key: r.key, now: Date.now() });
    expect(stored).toMatchObject({ status: "ok", tool: "relate" });
    expect((stored as { points: unknown[] }).points).toHaveLength(25);
  });
  it("finds the tract that clearly breaks the pattern and names it", async () => {
    const t = await seedPair();
    installFakeFetch({ columnsFor: routeFields, tractRows: routeRows });
    const r = await t.withIdentity(reader).action(api.tracts.relateTracts, { ...relateArgs, mode: "mismatch", aSide: "high", bSide: "low" });
    expect(r).toMatchObject({ status: "ok", mode: "mismatch", fits: [{ a: { tract: "1860", neighborhood: "Harambee" } }] });
  });
  it("names the place/years two datasets share when asked for one they don't", async () => {
    const t = await seedPair();
    installFakeFetch({ columnsFor: routeFields, tractRows: routeRows });
    expect(await t.withIdentity(reader).action(api.tracts.relateTracts, { ...relateArgs, place: "County", year: "2023", mode: "relate" }))
      .toMatchObject({ status: "choose-year", available: { a: [{ place: "City", year: "2022" }], b: [{ place: "City", year: "2022" }] }, shared: [{ place: "City", year: "2022" }] });
  });
  it("claims no finding for a column with no margin of error, and tells the model its confidence is null", async () => {
    const t = await seedPair();
    const bare = POV_FIELDS.filter((f) => f.name !== "pov_rate_moe");
    installFakeFetch({ columnsFor: (url) => (url.includes("FoodSecurity") ? F02_FIELDS : bare), tractRows: routeRows });
    const r = await t.withIdentity(reader).action(api.tracts.relateTracts, { ...relateArgs, mode: "mismatch", aSide: "high", bSide: "low" });
    expect(r).toMatchObject({ status: "ok", mode: "mismatch", a: { column: "pov_rate", confidence: null }, b: { confidence: "95% confidence (CDC)" }, fitsCount: 0, fits: [] });
  });
  it("says too-few, with nothing to list, when fewer than 20 reliable pairs line up", async () => {
    const t = await seedPair();
    installFakeFetch({ columnsFor: routeFields, tractRows: (url) => { const r = routeRows(url); return { features: r.features.slice(0, 12) }; } });
    const r = await t.withIdentity(reader).action(api.tracts.relateTracts, { ...relateArgs, mode: "mismatch", aSide: "high", bSide: "low" });
    expect(r).toMatchObject({ status: "ok", n: 12, strength: "too-few", fits: [], close: [] });
    expect(r).not.toHaveProperty("cutA");
  });
  it("spends the person's allowance once per call, however many datasets it reads", async () => {
    const t = await seedPair();
    installFakeFetch({ columnsFor: routeFields, tractRows: routeRows });
    const as = t.withIdentity(reader);
    // 19 single-dataset calls on distinct years of the same dataset would be needed to fill 19 buckets; spend them directly instead.
    for (let i = 0; i < 19; i++) await as.run(async (ctx) => { await rateLimiter.limit(ctx, "askTracts", { key: reader.tokenIdentifier }); });
    expect(await as.action(api.tracts.relateTracts, { ...relateArgs, mode: "relate" })).toMatchObject({ status: "ok" }); // 20th token, two datasets
    expect(await as.action(api.tracts.relateTracts, { ...relateArgs, mode: "mismatch" })).toEqual({ status: "busy" });
  });

  // 300 tracts, both datasets running 100..399 with wide ranges (A +/-50 Census margins, B +/-30 CDC limits), so the top
  // third (cutoff 299.33) holds 50 tracts that clearly fit (A's lower edge v-50 >= 299.33, so v >= 350) and 50 that only come close.
  const bigRows = (url: string) => ({
    features: Array.from({ length: 300 }, (_, i) => {
      const GEOID = `55079${100000 + i * 100}`;
      return { attributes: url.includes("FoodSecurity") ? { GEOID, per_insecure: 100 + i, Low_Confidence_Limit: 70 + i, High_Confidence_Limit: 130 + i } : { GEOID, pov_rate: 100 + i, pov_rate_moe: 50 } };
    }),
  });
  async function seedBig() {
    const t = await seedPair();
    await t.run(async (ctx) => { for (const c of await ctx.db.query("cards").collect()) await ctx.db.patch(c._id, { caveats: ["c".repeat(600)] }); });
    installFakeFetch({ columnsFor: routeFields, tractRows: bigRows });
    return t;
  }
  it("keeps every finding for the card, hands the model ten of each with the true totals, ordered by how clearly they clear", async () => {
    const t = await seedBig();
    const r = await t.withIdentity(reader).action(api.tracts.relateTracts, { ...relateArgs, mode: "mismatch", aSide: "high", bSide: "high" });
    if (r.status !== "ok") throw new Error("expected ok");
    expect(r).toMatchObject({ fitsCount: 50, closeCount: 50, n: 300, unreliableCount: 0 });
    expect(r.fits).toHaveLength(10);
    expect(r.close).toHaveLength(10);
    expect(r.fits[0].a.value).toBe(399); // clears by the most: min(399-50-299.33, 399-30-299.33)
    expect(r.fits.map((f) => f.a.value)).toEqual([399, 398, 397, 396, 395, 394, 393, 392, 391, 390]);
    expect(r.close[0].a.value).toBe(349); // closest ones are the ones furthest past the cutoffs
    const stored = await t.query(api.tracts.tractDetail, { key: r.key, now: Date.now() });
    if (stored.status !== "ok" || stored.tool !== "relate") throw new Error("expected a stored relate");
    expect(stored.fits).toHaveLength(50);
    expect(stored.close).toHaveLength(50);
    expect(stored.highlighted).toHaveLength(50);
    expect(stored.closeIds).toHaveLength(50);
    expect(stored.points).toHaveLength(300);
    expect(stored.a.caveats[0]).toHaveLength(600);
  });
  it("keeps the model's copy small: no caveats, urls, ids or points", async () => {
    const t = await seedBig();
    const r = await t.withIdentity(reader).action(api.tracts.relateTracts, { ...relateArgs, mode: "mismatch", aSide: "high", bSide: "high" });
    if (r.status !== "ok") throw new Error("expected ok");
    for (const h of [r.a, r.b]) { expect(h).not.toHaveProperty("caveats"); expect(h).not.toHaveProperty("url"); }
    for (const k of ["highlighted", "closeIds", "points"]) expect(r).not.toHaveProperty(k);
    expect(JSON.stringify(r).length).toBeLessThan(8000);
  });
  it("counts the pairs left out as unreliable, and marks them on the points", async () => {
    const t = await seedPair();
    // Tract 3 (poverty 13) with a margin of 20: CV 20/1.645/13 = 0.94, unreliable.
    installFakeFetch({ columnsFor: routeFields, tractRows: (url) => { const r = routeRows(url); return url.includes("FoodSecurity") ? r : { features: r.features.map((f, i) => (i === 3 ? { attributes: { ...f.attributes, pov_rate_moe: 20 } } : f)) }; } });
    const r = await t.withIdentity(reader).action(api.tracts.relateTracts, { ...relateArgs, mode: "relate" });
    if (r.status !== "ok") throw new Error("expected ok");
    expect(r).toMatchObject({ n: 24, unreliableCount: 1 });
    const stored = await t.query(api.tracts.tractDetail, { key: r.key, now: Date.now() });
    if (stored.status !== "ok" || stored.tool !== "relate") throw new Error("expected a stored relate");
    expect(stored.points.filter((p) => p.unreliable).map((p) => p.geoid)).toEqual(["55079100300"]);
  });
  it("names the dataset a refusal is about, and checks both datasets' cheap facts before asking DYCU anything", async () => {
    const t = await seedPair();
    const net = installFakeFetch({ columnsFor: routeFields, tractRows: routeRows });
    const as = t.withIdentity(reader);
    expect(await as.action(api.tracts.relateTracts, { ...relateArgs, a: { code: "Z99", column: "x" }, mode: "relate" })).toEqual({ status: "not-found", dataset: "a" });
    expect(await as.action(api.tracts.relateTracts, { ...relateArgs, b: { code: "Z99", column: "x" }, mode: "relate" })).toEqual({ status: "not-found", dataset: "b" });
    // A's code is wrong and B has no County data: both problems come back together, with nothing fetched.
    expect(await as.action(api.tracts.relateTracts, { ...relateArgs, a: { code: "Z99", column: "x" }, place: "County", mode: "relate" }))
      .toMatchObject({ status: "not-found", dataset: "a", also: [{ status: "choose-year", dataset: "b", available: [{ place: "City", year: "2022" }] }] });
    expect(net.calls).toHaveLength(0);
  });
  it("tags a refusal from the DYCU fetch with the dataset it came from", async () => {
    const t = await seedPair();
    installFakeFetch({ columnsFor: routeFields, tractRows: routeRows });
    const as = t.withIdentity(reader);
    expect(await as.action(api.tracts.relateTracts, { ...relateArgs, b: { code: "F02", column: "nope" }, mode: "relate" })).toMatchObject({ status: "choose-column", dataset: "b", columns: [{ column: "per_insecure" }] });
    expect(await as.action(api.tracts.relateTracts, { ...relateArgs, a: { code: "E02", column: "nope" }, mode: "relate" })).toMatchObject({ status: "choose-column", dataset: "a" });
  });
});

describe("compareYears", () => {
  async function seedTwoYears() {
    const t = await seedTracts();
    await t.run(async (ctx) => {
      const m = (await ctx.db.query("members").collect()).find((x) => x.yearLabel === "2023")!;
      await ctx.db.patch(m._id, { featureServerUrl: "https://services.arcgis.com/x/arcgis/rest/services/Poverty_MKE_2023/FeatureServer/0" });
    });
    return t;
  }
  const later = (change: (i: number) => { delta: number; moe?: number }) => () => ({
    features: povertyRows().features.map((f, i) => { const c = change(i); return { attributes: { ...f.attributes, pov_rate: (f.attributes.pov_rate as number) + c.delta, ...(c.moe === undefined ? {} : { pov_rate_moe: c.moe }) } }; }),
  });
  const run = (t: Awaited<ReturnType<typeof seedTwoYears>>, y2023: () => ReturnType<typeof povertyRows>) => {
    installFakeFetch({ columns: POV_FIELDS, tractRows: (url) => (url.includes("2023") ? y2023() : povertyRows()) });
    return t.withIdentity(reader).action(api.tracts.compareYears, { code: "E02", column: "pov_rate", place: "City", from: "2022", to: "2023" });
  };

  it("counts clear increases and decreases against both years' margins", async () => {
    const t = await seedTwoYears();
    // +10 and -5 clear sqrt(1^2 + 1^2) = 1.41; +0.5 does not. Tract 1 (11) only drops to 6: still reliable.
    const r = await run(t, later((i) => ({ delta: i === 0 ? 10 : i === 1 ? -5 : 0.5 })));
    expect(r).toMatchObject({ status: "ok", tool: "change", increases: 1, decreases: 1, none: 23, unreliableCount: 0, header: { year: "2022–2023", n: 25 }, note: expect.stringContaining("share four years of responses") });
    if (r.status !== "ok") return;
    expect(r.changes.map((c) => c.direction)).toEqual(["increase", "decrease"]);
    expect(r.changes[0]).toMatchObject({ change: 10, from: { value: 10 }, to: { value: 20 } });
  });
  it("never lists a change as clear when either year's estimate is unreliable, and counts those apart", async () => {
    const t = await seedTwoYears();
    // Tract 1: 11 -> 1 (-10) with a margin of 1 is a "clear" drop by the Census test, but 1 +/- 1 is unreliable (CV 61%).
    const r = await run(t, later((i) => ({ delta: i === 0 ? 10 : i === 1 ? -10 : 0.5 })));
    expect(r).toMatchObject({ status: "ok", increases: 1, decreases: 0, none: 23, unreliableCount: 1 });
    if (r.status !== "ok") return;
    expect(r.changes).toHaveLength(1);
    expect(r.changeCount).toBe(1);
  });
  it("stores every clear change and hands the model the biggest ten with the true total", async () => {
    const t = await seedTwoYears();
    const r = await run(t, later(() => ({ delta: 8 }))); // 8 clears every tract, even Harambee's wider margin: sqrt(4^2 + 4^2) = 5.66
    if (r.status !== "ok") throw new Error("expected ok");
    expect(r).toMatchObject({ increases: 25, changeCount: 25 });
    expect(r.changes).toHaveLength(10);
    expect(r).not.toHaveProperty("highlighted");
    expect(r.header).not.toHaveProperty("caveats");
    expect(r.header).not.toHaveProperty("url");
    const stored = await t.query(api.tracts.tractDetail, { key: r.key, now: Date.now() });
    if (stored.status !== "ok" || stored.tool !== "change") throw new Error("expected a stored change");
    expect(stored.changes).toHaveLength(25);
    expect(stored.highlighted).toHaveLength(25);
    expect(stored.header.caveats).toEqual(["Survey estimates pool five years."]);
  });
  it("counts tracts in only one year, and each year's dropped rows, as left out", async () => {
    const t = await seedTwoYears();
    // Harambee's tract is missing from 2023, and 2023 has a tract 2022 never had: 24 matched, one left out on each side.
    const r = await run(t, () => ({ features: [...povertyRows().features.slice(0, 24), { attributes: { GEOID: "55079150000", pov_rate: 30, pov_rate_moe: 1 } }] }));
    expect(r).toMatchObject({ status: "ok", header: { n: 24, leftOut: 2 } });
  });
  it("names the year a refusal is about, and refuses to compare a year with itself", async () => {
    const t = await seedTwoYears();
    installFakeFetch({ columns: POV_FIELDS, tractRows: povertyRows });
    const as = t.withIdentity(reader);
    expect(await as.action(api.tracts.compareYears, { code: "E02", column: "pov_rate", place: "City", from: "2022", to: "2031" })).toMatchObject({ status: "choose-year", year: "2031", available: [{ place: "City", year: "2022" }, { place: "City", year: "2023" }] });
    expect(await as.action(api.tracts.compareYears, { code: "E02", column: "pov_rate", place: "City", from: "2022", to: "2022" })).toMatchObject({ status: "choose-year", reason: "pick two different years" });
  });
});

describe("tractDetail", () => {
  it("never serves the cached DYCU rows", async () => {
    const t = await seedTracts();
    installFakeFetch({ columns: POV_FIELDS, tractRows: povertyRows });
    await t.withIdentity(reader).action(api.tracts.rankTracts, { code: "E02", column: "pov_rate", place: "City", year: "2022", direction: "high" });
    const rowsKey = await t.run(async (ctx) => (await ctx.db.query("mapCache").collect()).find((r) => r.key.startsWith("tractrows:"))?.key);
    expect(rowsKey).toBeDefined();
    expect(await t.query(api.tracts.tractDetail, { key: rowsKey!, now: Date.now() })).toEqual({ status: "expired" });
  });
});

describe("the rows cache is best-effort", () => {
  it("fetches again, and still answers, when a cached entry can't be read", async () => {
    const t = await seedTracts();
    let fetched = 0;
    installFakeFetch({ columns: POV_FIELDS, tractRows: () => { fetched++; return povertyRows(); } });
    const ask = () => t.withIdentity(reader).action(api.tracts.rankTracts, { code: "E02", column: "pov_rate", place: "City", year: "2022", direction: "high" });
    await ask();
    await t.run(async (ctx) => { for (const r of await ctx.db.query("mapCache").collect()) if (r.key.startsWith("tractrows:")) await ctx.db.patch(r._id, { result: "{not json" }); });
    expect(await ask()).toMatchObject({ status: "ok" });
    expect(fetched).toBe(2);
  });
});
