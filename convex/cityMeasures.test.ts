/// <reference types="vite/client" />
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { installFakeFetch } from "../tests/helpers/fakeFetch";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");
const reader = { subject: "u1", issuer: "test", tokenIdentifier: "test|u1" };
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
const fam = (key: string, code: string, name: string, topic = "City Services") => ({ key, code, name, kind: "dataset" as const, topic, keywords: [], places: ["City"], years: [], latestModified: "2025-10-01", baseSearchText: "", searchText: "", dictionaryTab: null, source: "city" as const, live: true });
const prof = (familyKey: string, resourceId: string, categories: { column: string; values: { value: string; count: number }[] }[], namesPeople: boolean) => ({ familyKey, resourceId, columns: [], dateColumn: null, districtColumns: [], categories, rowCount: 100, minDate: null, maxDate: null, namesPeople, signature: "s", updatedAt: 0 });

async function seed() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  await t.run(async (ctx) => {
    await ctx.db.insert("families", fam("city:city-employee-salary-data", "X36", "City Employee Salary Data"));
    await ctx.db.insert("cityProfiles", prof("city:city-employee-salary-data", "562e3c33-d7c0-4fa2-b7da-6aa31026ae53", [{ column: "Department", values: [{ value: "POLICE DEPARTMENT", count: 2569 }] }], true));
    await ctx.db.insert("families", fam("city:nibrs-crime-data", "P08", "NIBRS Crime Data", "Public Safety"));
    await ctx.db.insert("cityProfiles", prof("city:nibrs-crime-data", "87843297-a6fa-46d4-ba5d-cb342fb2d3bb", [], false));
    await ctx.db.insert("families", fam("city:2020-spring-election-results", "B05", "2020 Spring Election Results", "Elections"));
    await ctx.db.insert("cityProfiles", prof("city:2020-spring-election-results", "3e78f0b1-c195-483d-99ac-22158369c72f", [], false));
  });
  return t;
}
const all = [{ n: "8000", total: "600000000", median: "70000", average: "75000", unreadable: "0", zeros: "48" }];

describe("countRecords with a measure", () => {
  it("returns totals and medians by department, hiding small groups in a file that names people", async () => {
    const t = await seed();
    installFakeFetch({ citySql: (sql) => sql.includes("GROUP BY g") ? [{ g: "POLICE DEPARTMENT", n: "2082", total: "199778163.7", median: "99671.1", average: "95954.9", unreadable: "0", zeros: "0" }, { g: "ASSESSOR", n: "40", total: "3000000", median: "70000", average: "75000", unreadable: "0", zeros: "0" }, { g: "TINY", n: "2", total: "150000", median: "75000", average: "75000", unreadable: "0", zeros: "0" }] : all });
    const r = await t.withIdentity(reader).action(api.city.countRecords, { code: "x36", measure: { id: "gross-pay" }, groupBy: "Department" });
    expect(r).toMatchObject({ status: "measured", code: "X36", groupBy: "Department", averageAsked: false, measure: { id: "gross-pay", unit: "dollars", summable: true }, all: { n: 8000, zeros: 48 } });
    if (r.status !== "measured") throw new Error("expected measured");
    expect(r.groups.map((g) => [g.label, g.hidden])).toEqual([["POLICE DEPARTMENT", false], ["ASSESSOR", true], ["TINY", true]]);
  });
  it("names the files that have measures when this one has none, without asking the City", async () => {
    const t = await seed();
    const fake = installFakeFetch({ citySql: () => all });
    const r = await t.withIdentity(reader).action(api.city.countRecords, { code: "P08", measure: { id: "gross-pay" } });
    expect(r).toMatchObject({ status: "no-measure", code: "P08" });
    if (r.status !== "no-measure") throw new Error("expected no-measure");
    expect(r.files).toContain("City employee pay");
    expect(fake.calls.length).toBe(0);
  });
  it("offers the file's measures for a wrong id, and refuses a neighborhood", async () => {
    const t = await seed();
    installFakeFetch({ citySql: () => all });
    expect(await t.withIdentity(reader).action(api.city.countRecords, { code: "X36", measure: { id: "tax-owed" } })).toMatchObject({ status: "choose-measure", measures: [{ id: "gross-pay" }, { id: "hourly-rate" }] });
    expect(await t.withIdentity(reader).action(api.city.countRecords, { code: "X36", measure: { id: "gross-pay" }, neighborhood: "Harambee" })).toMatchObject({ status: "no-locations" });
  });
  it("still refuses election files", async () => {
    const t = await seed();
    installFakeFetch({ citySql: () => all });
    expect(await t.withIdentity(reader).action(api.city.countRecords, { code: "B05", measure: { id: "gross-pay" } })).toMatchObject({ status: "not-live", note: expect.stringContaining("Election results") });
  });
  it("says the City's file is empty when its profile has no rows, without asking the City", async () => {
    const t = await seed();
    await t.run(async (ctx) => {
      const p = await ctx.db.query("cityProfiles").filter((q) => q.eq(q.field("familyKey"), "city:city-employee-salary-data")).first();
      await ctx.db.patch(p!._id, { rowCount: 0 });
    });
    const fake = installFakeFetch({ citySql: () => all });
    expect(await t.withIdentity(reader).action(api.city.countRecords, { code: "X36", measure: { id: "gross-pay" } })).toMatchObject({ status: "not-live", note: "The City's current file for this dataset is empty, so there's nothing to count right now." });
    expect(fake.calls.length).toBe(0);
  });
  it("refuses an over/under amount filter plainly, without asking the City", async () => {
    const t = await seed();
    const fake = installFakeFetch({ citySql: () => all });
    expect(await t.withIdentity(reader).action(api.city.countRecords, { code: "X36", measure: { id: "gross-pay" }, filters: [{ column: "Total Gross", over: 100000 }] }))
      .toMatchObject({ status: "no-number-filter", code: "X36", column: "Total Gross" });
    expect(fake.calls.length).toBe(0);
  });
  it("says unavailable when the City fails, and too-broad when it times out", async () => {
    const t = await seed();
    installFakeFetch({ cityStatus: 403 });
    expect(await t.withIdentity(reader).action(api.city.countRecords, { code: "X36", measure: { id: "gross-pay" } })).toMatchObject({ status: "unavailable" });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("Timed out after 10s: https://data.milwaukee.gov/…"); }));
    expect(await t.withIdentity(reader).action(api.city.countRecords, { code: "X36", measure: { id: "gross-pay" } })).toMatchObject({ status: "too-broad" });
  });
});

describe("checkMeasures", () => {
  it("measures every approved entry that has a profile, and says which have none", async () => {
    const t = await seed();
    installFakeFetch({ citySql: () => all });
    const out = await t.action(internal.city.checkMeasures, {});
    expect(out).toHaveLength(6);
    expect(out.find((x) => x.id === "gross-pay")).toMatchObject({ ok: true, all: { n: 8000 } });
    expect(out.find((x) => x.id === "tax-owed")).toMatchObject({ ok: false, error: "no profile" });
  });
});
