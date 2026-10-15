/// <reference types="vite/client" />
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { installFakeFetch } from "../tests/helpers/fakeFetch";
import { api, internal } from "./_generated/api";
import { SPAN_PAIRS } from "./lib/spanPairs";
import { asOfDay } from "./spans";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");
const RID = "5cb9ea51-c23f-4171-ad2d-9e9b1bfde280";
const KEY = "city:citizen-complaints-against-police-and-fire-departments-the-department-of-emergency-communication";
const reader = { subject: "u1", issuer: "test", tokenIdentifier: "test|u1" };
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

async function seed() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  await t.run(async (ctx) => {
    await ctx.db.insert("families", { key: KEY, code: "P24", name: "Citizen Complaints", kind: "dataset", topic: "Public Safety", keywords: [], places: ["City"], years: [], latestModified: "2025-10-01", baseSearchText: "", searchText: "", dictionaryTab: null, source: "city", live: true });
    await ctx.db.insert("families", { key: "city:nibrs-crime-data", code: "P01", name: "NIBRS Crime Data", kind: "dataset", topic: "Public Safety", keywords: [], places: ["City"], years: [], latestModified: "2025-10-01", baseSearchText: "", searchText: "", dictionaryTab: null, source: "city", live: true });
    await ctx.db.insert("cityProfiles", { familyKey: KEY, resourceId: RID, columns: [], dateColumn: null, districtColumns: [], categories: [{ column: "Department", values: [{ value: "Milwaukee Police Department", count: 2569 }] }], rowCount: 2919, minDate: null, maxDate: null, namesPeople: false, signature: "s", updatedAt: 0 });
    await ctx.db.insert("cityProfiles", { familyKey: "city:nibrs-crime-data", resourceId: "87843297-a6fa-46d4-ba5d-cb342fb2d3bb", columns: [], dateColumn: "Incident_Date", districtColumns: [], categories: [], rowCount: 10, minDate: "2024-01-01", maxDate: "2026-10-08", namesPeople: false, signature: "s", updatedAt: 0 });
  });
  return t;
}
const all = [{ cases: "2731", median: "64", p90: "400", open: "105", unreadable: "12", backwards: "17" }];

describe("timeSpan", () => {
  it("says the City's file is empty when its profile has no rows", async () => {
    const t = await seed();
    await t.run(async (ctx) => {
      const p = await ctx.db.query("cityProfiles").withIndex("by_family", (q) => q.eq("familyKey", KEY)).first();
      await ctx.db.patch(p!._id, { rowCount: 0 });
    });
    installFakeFetch({ citySql: () => all });
    expect(await t.withIdentity(reader).action(api.spans.timeSpan, { code: "P24" })).toMatchObject({ status: "not-live", code: "P24", note: "The City's current file for this dataset is empty, so there's nothing to count right now." });
  });
  it("needs sign-in", async () => {
    const t = await seed();
    await expect(t.action(api.spans.timeSpan, { code: "P24" })).rejects.toThrow(/Sign in/);
  });
  it("measures a pair by department, with the pair's words and the All row", async () => {
    const t = await seed();
    installFakeFetch({ citySql: (sql) => sql.includes("GROUP BY k") ? [{ k: "MILWAUKEEPOLICEDEPARTMENT", label: "Milwaukee Police Department", cases: "2437", median: "92", p90: "478.4", open: "105", unreadable: "12", backwards: "15" }] : all });
    const r = await t.withIdentity(reader).action(api.spans.timeSpan, { code: "p24", pair: "complaint-close", groupBy: "Department" });
    expect(r).toMatchObject({
      status: "ok", code: "P24", name: "Citizen Complaints", groupBy: "Department", period: "all records",
      pair: { id: "complaint-close", name: "time to close", unit: "days" },
      groups: [{ label: "Milwaukee Police Department", cases: 2437, median: 92 }],
      all: { cases: 2731, median: 64, open: 105, unreadable: 12, backwards: 17 },
    });
  });
  it("on a file that names people: no year split or date range, no group under 10, and no answer under 10 (L4)", async () => {
    const t = await seed();
    await t.run(async (ctx) => {
      const p = await ctx.db.query("cityProfiles").withIndex("by_family", (q) => q.eq("familyKey", KEY)).first();
      await ctx.db.patch(p!._id, { namesPeople: true });
    });
    const fake = installFakeFetch({ citySql: (sql) => sql.includes("GROUP BY k") ? [{ k: "TINY", label: "Tiny", cases: "3", median: "800", p90: "900", open: "0", unreadable: "0", backwards: "0" }, { k: "BIG", label: "Big", cases: "2700", median: "60", p90: "300", open: "0", unreadable: "0", backwards: "0" }] : all });
    const ask = (a: Record<string, unknown>) => t.withIdentity(reader).action(api.spans.timeSpan, { code: "P24", pair: "complaint-close", ...a });
    const slice = { status: "private", code: "P24", name: "Citizen Complaints", reason: "This file names people, so Ask doesn't measure it by year or by a date range: that could single someone out." };
    expect(await ask({ groupBy: "year" })).toEqual(slice);
    expect(await ask({ from: "2024-01-01" })).toEqual(slice);
    expect(await ask({ to: "2024-12-31" })).toEqual(slice);
    expect(fake.count("datastore_search_sql")).toBe(0);
    const r = await ask({ groupBy: "Department" });
    expect(r).toMatchObject({ status: "ok", namesPeople: true, groups: [{ label: "Big", cases: 2700, median: 60 }], all: { cases: 2731, median: 64 } });
    installFakeFetch({ citySql: () => [{ ...all[0], cases: "6" }] });
    expect(await ask({ filters: [{ column: "Department", values: ["Milwaukee Police Department"] }] })).toEqual({ status: "private", code: "P24", name: "Citizen Complaints", reason: "Fewer than 10 people match, and this file names people, so Ask doesn't report on a group that small." });
  });
  it("says a file has no pair, and names the files that do", async () => {
    const t = await seed();
    const fake = installFakeFetch({ citySql: () => all });
    const r = await t.withIdentity(reader).action(api.spans.timeSpan, { code: "P01" });
    expect(r).toMatchObject({ status: "no-pair", code: "P01", name: "NIBRS Crime Data" });
    if (r.status !== "no-pair") throw new Error("expected no-pair");
    expect(r.files).toContain("311 call center requests");
    expect(fake.calls.length).toBe(0);
  });
  it("refuses an unknown pair id with the file's pairs", async () => {
    const t = await seed();
    installFakeFetch({ citySql: () => all });
    expect(await t.withIdentity(reader).action(api.spans.timeSpan, { code: "P24", pair: "nope" })).toMatchObject({ status: "choose-pair", pairs: [{ id: "complaint-close" }, { id: "complaint-open-age" }] });
  });
  it("says unavailable when the City fails, and too-broad when it times out", async () => {
    const t = await seed();
    installFakeFetch({ cityStatus: 403 });
    expect(await t.withIdentity(reader).action(api.spans.timeSpan, { code: "P24", pair: "complaint-close" })).toMatchObject({ status: "unavailable", code: "P24" });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("Timed out after 10s: https://data.milwaukee.gov/…"); }));
    expect(await t.withIdentity(reader).action(api.spans.timeSpan, { code: "P24", pair: "complaint-close" })).toMatchObject({ status: "too-broad", code: "P24" });
  });
});

describe("checkPairs", () => {
  it("measures every approved pair that has a profile, and says which have none", async () => {
    const t = await seed();
    installFakeFetch({ citySql: () => all });
    const out = await t.action(internal.spans.checkPairs, {});
    expect(out.find((x) => x.id === "complaint-close")).toMatchObject({ ok: true, all: { cases: 2731 } });
    expect(out.find((x) => x.id === "311-close")).toMatchObject({ ok: false, error: "no profile" });
    expect(out).toHaveLength(13); // one result per approved entry (L1, L2 and L4 added two each)
  });
});

describe("ages (L2)", () => {
  it("asks which measure on the complaints file, listing the closing time and the open age", async () => {
    const t = await seed();
    installFakeFetch({ citySql: () => all });
    expect(await t.withIdentity(reader).action(api.spans.timeSpan, { code: "P24" })).toMatchObject({ status: "choose-pair", pairs: [{ id: "complaint-close", to: "Date Closed" }, { id: "complaint-open-age", to: "as of the file's last update" }] });
  });
  it("measures open complaints to the Chicago day the City last changed the data file (review fix)", async () => {
    const t = await seed();
    let sql = "";
    // The file's own last_modified (UTC, no zone): 03:20 UTC on Feb 25 is the evening of Feb 24 in Milwaukee.
    installFakeFetch({ resourceModified: "2026-02-25T03:20:47.682186", citySql: (s) => { sql = s; return [{ cases: "98", median: "300", p90: "500", open: "0", unreadable: "0", backwards: "0" }]; } });
    const r = await t.withIdentity(reader).action(api.spans.timeSpan, { code: "P24", pair: "complaint-open-age" });
    expect(r).toMatchObject({ status: "ok", asOf: "2026-02-24", pair: { kind: "age", id: "complaint-open-age" }, all: { cases: 98, median: 300 } });
    expect(sql).toContain("'2026-02-25'::timestamp");
  });
  it("falls back to the newest member record when the City's file lookup fails, not the family's creation date", async () => {
    const t = await seed(); // the complaints family's latestModified is 2025-10-01 (live it is the 2019 creation date)
    await t.run(async (ctx) => {
      await ctx.db.insert("members", { familyKey: KEY, hubId: "m1", title: "Citizen Complaints", yearLabel: "", featureServerUrl: "", kind: "dataset", landingPage: "", place: "City", years: [], modified: "2026-03-13T21:07:03.024554", downloads: {}, description: "", keywords: [], files: [] });
    });
    installFakeFetch({ citySql: () => [{ cases: "98", median: "300", p90: "500", open: "0", unreadable: "0", backwards: "0" }] });
    expect(await t.withIdentity(reader).action(api.spans.timeSpan, { code: "P24", pair: "complaint-open-age" })).toMatchObject({ status: "ok", asOf: "2026-03-13" });
  });
  it("falls back to today when the file's date can't be read", () => {
    expect(asOfDay(SPAN_PAIRS.find((p) => p.id === "complaint-open-age")!, "unknown", Date.parse("2026-10-14T15:00:00Z"))).toBe("2026-10-14");
    expect(asOfDay(SPAN_PAIRS.find((p) => p.id === "vacant-age")!, "2020-01-01", Date.parse("2026-10-14T15:00:00Z"))).toBe("2026-10-14");
    expect(asOfDay(SPAN_PAIRS[0], "2020-01-01", Date.now())).toBeNull();
  });
});
