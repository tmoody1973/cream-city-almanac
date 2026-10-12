/// <reference types="vite/client" />
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { installFakeFetch } from "../tests/helpers/fakeFetch";
import { api } from "./_generated/api";
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
  it("needs sign-in", async () => {
    const t = await seed();
    await expect(t.action(api.spans.timeSpan, { code: "P24" })).rejects.toThrow(/Sign in/);
  });
  it("measures a pair by department, with the pair's words and the All row", async () => {
    const t = await seed();
    installFakeFetch({ citySql: (sql) => sql.includes("GROUP BY k") ? [{ k: "MILWAUKEEPOLICEDEPARTMENT", label: "Milwaukee Police Department", cases: "2437", median: "92", p90: "478.4", open: "105", unreadable: "12", backwards: "15" }] : all });
    const r = await t.withIdentity(reader).action(api.spans.timeSpan, { code: "p24", groupBy: "Department" });
    expect(r).toMatchObject({
      status: "ok", code: "P24", name: "Citizen Complaints", groupBy: "Department", period: "all records",
      pair: { id: "complaint-close", name: "time to close", unit: "days" },
      groups: [{ label: "Milwaukee Police Department", cases: 2437, median: 92 }],
      all: { cases: 2731, median: 64, open: 105, unreadable: 12, backwards: 17 },
    });
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
    expect(await t.withIdentity(reader).action(api.spans.timeSpan, { code: "P24", pair: "nope" })).toMatchObject({ status: "choose-pair", pairs: [{ id: "complaint-close" }] });
  });
  it("says unavailable when the City fails, and too-broad when it times out", async () => {
    const t = await seed();
    installFakeFetch({ cityStatus: 403 });
    expect(await t.withIdentity(reader).action(api.spans.timeSpan, { code: "P24" })).toMatchObject({ status: "unavailable", code: "P24" });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("Timed out after 10s: https://data.milwaukee.gov/…"); }));
    expect(await t.withIdentity(reader).action(api.spans.timeSpan, { code: "P24" })).toMatchObject({ status: "too-broad", code: "P24" });
  });
});
