/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installFakeFetch } from "../tests/helpers/fakeFetch";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");
const MFD = "cdf51c45-5fe3-415e-a08c-14ed134dcb64";
const Y2018 = "18d887be-4254-4386-b9b4-f1a8c016db38";
beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-14T17:00:00Z")); });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

const stat = (g: string, calls: number) => ({ g, calls: String(calls), dmed: "1.5", dp90: "3", dn: String(calls - 2), amed: "5.9", ap90: "9", an: String(calls - 5), unreadable: "1", backwards: "2" });
// The City, faked: answers each of a year's three queries; `fail` makes the City refuse matching SQL.
function city(seen: string[], fail: (sql: string) => boolean = () => false) {
  return (sql: string) => {
    seen.push(sql);
    if (fail(sql)) throw new Error("refused");
    if (sql.includes(" AS t, ")) return [{ t: "EMS", n: "90" }, { t: "ems", n: "10" }, { t: "Auto Fire", n: "5" }];
    if (sql.includes("GROUP BY g")) return [stat("ems", 100), stat("other", 20)];
    return [stat("all", 120)];
  };
}
async function seed(withMfd = true) {
  const t = convexTest(schema, modules);
  if (withMfd) await t.run(async (ctx) => {
    await ctx.db.insert("cityProfiles", { familyKey: "city:mfd-calls-for-service-detail", resourceId: MFD, columns: [], dateColumn: null, districtColumns: [], categories: [], rowCount: 350530, minDate: null, maxDate: null, namesPeople: false, signature: "s", updatedAt: 0 });
  });
  return t;
}
const yearsIn = (t: Awaited<ReturnType<typeof seed>>) => t.run(async (ctx) => ({ rows: await ctx.db.query("fireYears").collect(), types: await ctx.db.query("fireTypes").collect(), status: await ctx.db.query("fireRefresh").collect() }));

describe("refreshFire (L3)", () => {
  it("stores 2015–2023 and the MFD years 2024–2026: three groups a year, types for the incident years", async () => {
    const t = await seed();
    const seen: string[] = [];
    installFakeFetch({ citySql: city(seen) });
    expect(await t.action(internal.fire.refreshFire, {})).toEqual([]);
    const { rows, types, status } = await yearsIn(t);
    expect([...new Set(rows.map((r) => r.year))].sort()).toEqual([2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026]);
    expect(rows.filter((r) => r.year === 2015).map((r) => r.group).sort()).toEqual(["all", "ems", "other"]);
    expect(rows.find((r) => r.year === 2015 && r.group === "all")).toMatchObject({ calls: 120, dispatch: { median: 1.5, p90: 3, n: 118 }, source: "incident", toMinute: true, partial: null });
    expect(rows.find((r) => r.year === 2024 && r.group === "all")).toMatchObject({ source: "mfd", partial: "from Feb 20", toMinute: false });
    expect(rows.find((r) => r.year === 2026 && r.group === "all")!.partial).toBe("so far");
    expect(types.filter((x) => x.year === 2015).map((x) => [x.type, x.calls])).toEqual([["EMS", 100], ["Auto Fire", 5]]);
    expect(types.some((x) => x.year >= 2024)).toBe(false);
    expect(status.every((s) => s.status === "counted")).toBe(true);
    expect(seen.some((s) => s.includes(`LIKE '2025-%'`))).toBe(true);
  });
  it("skips counted 2015–2023 years on the next run but re-reads the MFD years; force re-reads all", async () => {
    const t = await seed();
    installFakeFetch({ citySql: city([]) });
    await t.action(internal.fire.refreshFire, {});
    const again: string[] = [];
    installFakeFetch({ citySql: city(again) });
    await t.action(internal.fire.refreshFire, {});
    expect(again.some((s) => s.includes(Y2018))).toBe(false);
    expect(again.filter((s) => s.includes(MFD))).toHaveLength(6); // 3 MFD years × (group + all)
    const forced: string[] = [];
    installFakeFetch({ citySql: city(forced) });
    await t.action(internal.fire.refreshFire, { force: true });
    expect(forced.some((s) => s.includes(Y2018))).toBe(true);
  });
  it("keeps a failed year's last good figures and records the failure", async () => {
    const t = await seed();
    installFakeFetch({ citySql: city([]) });
    await t.action(internal.fire.refreshFire, {});
    installFakeFetch({ citySql: city([], (sql) => sql.includes(Y2018)) });
    const notes = await t.action(internal.fire.refreshFire, { force: true });
    expect(notes).toEqual([expect.stringMatching(/^Fire 2018: .*; kept any earlier figures$/)]);
    const { rows, status } = await yearsIn(t);
    expect(rows.filter((r) => r.year === 2018)).toHaveLength(3);
    expect(status.find((s) => s.year === 2018)!.status).toBe("failed");
  });
  it("notes when the MFD file isn't profiled, and still counts 2015–2023", async () => {
    const t = await seed(false);
    installFakeFetch({ citySql: city([]) });
    expect(await t.action(internal.fire.refreshFire, {})).toEqual(["Fire: the MFD calls file isn't profiled; 2024 on not counted"]);
    expect((await yearsIn(t)).rows.some((r) => r.year === 2023)).toBe(true);
  });
  it("treats a year with no calls as failed, not as zero", async () => {
    const t = await seed(false);
    installFakeFetch({ citySql: (sql: string) => (sql.includes(" AS t, ") ? [] : sql.includes("GROUP BY g") ? [] : [stat("all", 0)]) });
    const notes = await t.action(internal.fire.refreshFire, {});
    expect(notes.filter((n) => /no calls/.test(n))).toHaveLength(9);
    expect((await yearsIn(t)).rows).toHaveLength(0);
  });
});
