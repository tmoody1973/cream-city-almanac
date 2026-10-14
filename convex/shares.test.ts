/// <reference types="vite/client" />
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { installFakeFetch } from "../tests/helpers/fakeFetch";
import { reader, seedNibrs } from "../tests/helpers/citySeed";
import { api, internal } from "./_generated/api";
import { logLine } from "./shares";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");
afterEach(() => vi.unstubAllGlobals());

async function setup() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  return t;
}
// One built election with two wards, enough for countTurnout to answer.
async function seedTurnout(t: Awaited<ReturnType<typeof setup>>) {
  await t.run(async (ctx) => {
    await ctx.db.insert("elections", { election: "2020-11", label: "November 2020 general election", type: "general", map: "2012", wards: 2, of: 327, partial: false, modified: "m", status: "read" });
    await ctx.db.insert("turnout", { election: "2020-11", ward: 1, registered: 1502, ballots: 1185 });
    await ctx.db.insert("turnout", { election: "2020-11", ward: 2, registered: 100, ballots: 60 });
  });
}
const rows = (t: Awaited<ReturnType<typeof setup>>) => t.run((ctx) => ctx.db.query("shares").collect());

describe("shares:create", () => {
  it("refuses when signed out", async () => {
    const t = await setup();
    expect(await t.action(api.shares.create, { tool: "countTurnout", args: {} })).toEqual({ ok: false, reason: "signed-out" });
  });
  it("refuses tools that can't be shared, storing nothing", async () => {
    const t = await setup();
    for (const tool of ["findPlace", "boundariesFor", "searchCatalog", "nope"]) {
      expect(await t.withIdentity(reader).action(api.shares.create, { tool, args: { address: "1 Main St" } })).toEqual({ ok: false, reason: "not-shareable" });
    }
    expect(await rows(t)).toEqual([]);
  });
  it("fails without storing when the arguments don't fit the tool", async () => {
    const t = await setup();
    await seedTurnout(t);
    expect(await t.withIdentity(reader).action(api.shares.create, { tool: "countTurnout", args: { from: "twenty" } })).toEqual({ ok: false, reason: "failed" });
    expect(await rows(t)).toEqual([]);
  });
  it("never logs the arguments, which can hold a typed question (review fix)", async () => {
    const t = await setup();
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await t.withIdentity(reader).action(api.shares.create, { tool: "readReport", args: { question: "SECRET-QUESTION-TEXT", stray: 1 } })).toEqual({ ok: false, reason: "failed" });
    expect(logged).toHaveBeenCalled();
    expect(JSON.stringify(logged.mock.calls)).not.toContain("SECRET-QUESTION-TEXT");
  });
  it("fails without storing when the tool refuses at share time", async () => {
    const t = await setup(); // no turnout rows: "Turnout hasn't been built yet."
    expect(await t.withIdentity(reader).action(api.shares.create, { tool: "countTurnout", args: {} })).toEqual({ ok: false, reason: "failed" });
    expect(await rows(t)).toEqual([]);
  });
  it("re-runs the tool, stores the card's snapshot and nothing of the question", async () => {
    const t = await setup();
    await seedTurnout(t);
    const r = await t.withIdentity(reader).action(api.shares.create, { tool: "countTurnout", args: { type: "general" } });
    expect(r).toMatchObject({ ok: true, id: expect.stringMatching(/^[0-9A-Za-z]{10}$/) });
    const [row] = await rows(t);
    expect(Object.keys(row).sort()).toEqual(["_creationTime", "_id", "by", "card", "createdAt", "kind", "shareId"]);
    expect(row).toMatchObject({ kind: "countTurnout", by: "test|u1" });
    const got = await t.query(api.shares.get, { id: (r as { id: string }).id });
    expect(got).not.toHaveProperty("by");
    expect(got?.kind).toBe("countTurnout");
    expect("card" in got!.shared && got!.shared.card.title).toMatch(/^Milwaukee voter turnout/);
    expect("card" in got!.shared && got!.shared.card.notes).toContain(`Exported from Cream City Almanac on ${new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "America/Chicago" }).format(Date.now())}.`);
  });
  it("re-runs a signed-in-only City count as the sharer", async () => {
    const t = await setup();
    await t.run((ctx) => seedNibrs(ctx));
    installFakeFetch({ citySql: (sql) => (sql.includes("> '") ? [{ n: "0" }] : [{ n: "256" }]) });
    // countRecords throws "Sign in to ask" without an identity, so a stored row proves the sharer's identity reached it.
    expect(await t.withIdentity(reader).action(api.shares.create, { tool: "countRecords", args: { code: "P01" } })).toMatchObject({ ok: true });
    const [row] = await rows(t);
    expect(JSON.parse(row.card).card.csv.rows[0]).toEqual(["Total", 256]);
  });
  it("stops at 30 shares a day per account", async () => {
    const t = await setup();
    await seedTurnout(t);
    for (let i = 0; i < 30; i++) expect(await t.withIdentity(reader).action(api.shares.create, { tool: "countTurnout", args: {} })).toMatchObject({ ok: true });
    expect(await t.withIdentity(reader).action(api.shares.create, { tool: "countTurnout", args: {} })).toEqual({ ok: false, reason: "limit" });
  });
});

describe("what a failed share logs", () => {
  it("keeps only the error's first line: Convex puts the argument values on later lines", () => {
    const e = new Error('ArgumentValidationError: Object contains extra field `stray` that is not in the validator.\n\nObject: {question: "SECRET-QUESTION-TEXT", stray: 1}\nValidator: v.object({question: v.string()})');
    expect(logLine(e)).toBe("ArgumentValidationError: Object contains extra field `stray` that is not in the validator.");
    expect(logLine("plain")).toBe("plain");
  });
});

describe("shares:get and shares:remove", () => {
  it("returns null for an unknown id, and nothing after removal", async () => {
    const t = await setup();
    await seedTurnout(t);
    expect(await t.query(api.shares.get, { id: "doesnotexi" })).toBeNull();
    const r = (await t.withIdentity(reader).action(api.shares.create, { tool: "countTurnout", args: {} })) as { id: string };
    expect(await t.mutation(internal.shares.remove, { id: r.id })).toBe(true);
    expect(await t.query(api.shares.get, { id: r.id })).toBeNull();
    expect(await t.mutation(internal.shares.remove, { id: r.id })).toBe(false);
  });
  it("won't overwrite an existing id", async () => {
    const t = await setup();
    expect(await t.mutation(internal.shares.store, { shareId: "AAAAAAAAAA", kind: "countTurnout", card: "{}", by: "x" })).toBe(true);
    expect(await t.mutation(internal.shares.store, { shareId: "AAAAAAAAAA", kind: "countTurnout", card: "{}", by: "y" })).toBe(false);
  });
});
