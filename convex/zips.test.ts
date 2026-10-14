/// <reference types="vite/client" />
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { installFakeFetch } from "../tests/helpers/fakeFetch";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");
const reader = { subject: "u1", issuer: "test", tokenIdentifier: "test|u1" };
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); delete process.env.CENSUS_API_KEY; });

// Every requested code: estimate 100 (the totals, *_001, 1000), margin 10.
const reply = (url: string) => {
  const codes = new URL(url).searchParams.get("get")!.split(",");
  return [[...codes, "zip code tabulation area"], [...codes.map((c) => (c.endsWith("M") ? "10" : /_001E$/.test(c) ? "1000" : "100")), "53228"]];
};
async function seed(city: Record<string, { estimate: number; moe: number | null }> = { B17001_001: { estimate: 500000, moe: 100 }, B17001_002: { estimate: 120000, moe: 100 } }) {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  await t.run(async (ctx) => { await ctx.db.insert("cityFigures", { period: 2024, values: city, fetchedAt: 0 }); });
  process.env.CENSUS_API_KEY = "SECRET123";
  return t;
}
const ask = (t: Awaited<ReturnType<typeof seed>>, zip: string) => t.withIdentity(reader).action(api.zips.zipProfile, { zip });

describe("zipProfile (Z1)", () => {
  it("needs sign-in", async () => {
    const t = await seed();
    await expect(t.action(api.zips.zipProfile, { zip: "53228" })).rejects.toThrow(/Sign in/);
  });
  it("answers a county ZIP+4 with its place, survey years, race and the 8 measures beside Milwaukee (review focus 2)", async () => {
    const t = await seed();
    const fake = installFakeFetch({ census: reply });
    const r = await ask(t, " 53228-1234 ");
    expect(r).toMatchObject({ status: "ok", zip: "53228", period: "2020–2024", cityShare: 0.1, mainPlace: "Greenfield", population: { estimate: 1000, moe: 10 } });
    expect(fake.count("zip%20code%20tabulation%20area:53228")).toBe(3);
    if (r.status !== "ok") throw new Error("not ok");
    expect(r.facts).toHaveLength(8);
    expect(r.facts.find((x) => x.id === "poverty")).toMatchObject({ verdict: "lower" });
  });
  it("shows no Milwaukee race figures before the city refresh stores them (review focus 4)", async () => {
    const t = await seed();
    installFakeFetch({ census: reply });
    const r = await ask(t, "53228");
    if (r.status !== "ok") throw new Error("not ok");
    expect(r.race.every((x) => x.city === null && x.verdict === "unknown")).toBe(true);
  });
  it("refuses a malformed ZIP and a ZIP outside the county without calling the Census", async () => {
    const t = await seed();
    const fake = installFakeFetch({ census: reply });
    expect(await ask(t, "5322")).toEqual({ status: "bad-zip", zip: "5322" });
    expect(await ask(t, "53201")).toEqual({ status: "outside", zip: "53201" });
    expect(await ask(t, "60601")).toEqual({ status: "outside", zip: "60601" });
    expect(fake.count("api.census.gov")).toBe(0);
  });
  it("is unavailable when the Census fails, and never logs the key", async () => {
    const t = await seed();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    installFakeFetch({ census: reply, censusStatus: 500 });
    expect(await ask(t, "53228")).toEqual({ status: "unavailable", zip: "53228" });
    expect(log).toHaveBeenCalled();
    expect(log.mock.calls.flat().join(" ")).not.toContain("SECRET123");
  });
  it("is unavailable when the Census answers with a web page instead of a table (review focus 3)", async () => {
    const t = await seed();
    vi.spyOn(console, "error").mockImplementation(() => {});
    installFakeFetch({ census: () => "<html>Missing Key</html>" });
    expect(await ask(t, "53228")).toEqual({ status: "unavailable", zip: "53228" });
  });
  it("is unavailable with no key or no stored city figures", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const t = await seed();
    delete process.env.CENSUS_API_KEY;
    installFakeFetch({ census: reply });
    expect(await ask(t, "53228")).toEqual({ status: "unavailable", zip: "53228" });
    const empty = convexTest(schema, modules);
    rateLimiterTest.register(empty);
    process.env.CENSUS_API_KEY = "k";
    expect(await empty.withIdentity(reader).action(api.zips.zipProfile, { zip: "53228" })).toEqual({ status: "unavailable", zip: "53228" });
  });
  it("is busy when the City-count allowance is spent", async () => {
    const t = await seed();
    installFakeFetch({ census: reply });
    for (let i = 0; i < 20; i++) await ask(t, "53228");
    expect(await ask(t, "53228")).toEqual({ status: "busy" });
  });
});
