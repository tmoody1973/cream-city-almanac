/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { internal } from "./_generated/api";
import { liveRuns } from "./requests311";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");
const make = () => convexTest(schema, modules);
let t: ReturnType<typeof make>;
beforeEach(() => { vi.useFakeTimers(); t = make(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

const pothole = (requests: number, days: Record<string, number> = {}) =>
  ({ kind: "hood" as const, place: "Arlington Heights", year: 2026, type: "Potholes", requests, closed: requests, days });
const rows = (runId: string) => t.run((ctx) => ctx.db.query("requests311").withIndex("by_run", (q) => q.eq("runId", runId)).collect());
const live = () => t.run((ctx) => liveRuns(ctx));

describe("311 count store", () => {
  it("upserts tallies across calls", async () => {
    const runId = await t.mutation(internal.requests311.startRun, { file: "current", modified: "m1" });
    await t.mutation(internal.requests311.addTallies, { runId, tallies: [pothole(2, { "1": 2 })], matched: 2, noMatch: 0, noAddress: 1 });
    await t.mutation(internal.requests311.addTallies, { runId, tallies: [pothole(3, { "1": 1, "4": 2 })], matched: 3, noMatch: 1, noAddress: 0 });
    const [r] = await rows(runId);
    expect(r).toMatchObject({ requests: 5, closed: 5, days: { "1": 3, "4": 2 } });
    const run = await t.run((ctx) => ctx.db.query("requests311Runs").withIndex("by_runId", (q) => q.eq("runId", runId)).first());
    expect(run).toMatchObject({ status: "running", matched: 5, noMatch: 1, noAddress: 1 });
  });

  it("readers see the old run until finish, then the old rows are deleted", async () => {
    const a = await t.mutation(internal.requests311.startRun, { file: "current", modified: "m1" });
    await t.mutation(internal.requests311.addTallies, { runId: a, tallies: [pothole(5)], matched: 5, noMatch: 0, noAddress: 0 });
    await t.mutation(internal.requests311.finishRun, { runId: a });
    vi.advanceTimersByTime(1000);
    const b = await t.mutation(internal.requests311.startRun, { file: "current", modified: "m2" });
    await t.mutation(internal.requests311.addTallies, { runId: b, tallies: [pothole(7)], matched: 7, noMatch: 0, noAddress: 0 });
    expect((await live()).current?.runId).toBe(a);
    await t.mutation(internal.requests311.finishRun, { runId: b });
    expect((await live()).current?.runId).toBe(b);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await rows(a)).toHaveLength(0);
    expect(await rows(b)).toHaveLength(1);
  });

  it("a failed run never goes live and its rows are deleted", async () => {
    const a = await t.mutation(internal.requests311.startRun, { file: "historical", modified: "m1" });
    await t.mutation(internal.requests311.addTallies, { runId: a, tallies: [pothole(5)], matched: 5, noMatch: 0, noAddress: 0 });
    await t.mutation(internal.requests311.failRun, { runId: a, note: "Census geocoder failed: 500" });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await live()).historical).toBeNull();
    expect(await rows(a)).toHaveLength(0);
    const run = await t.run((ctx) => ctx.db.query("requests311Runs").withIndex("by_runId", (q) => q.eq("runId", a)).first());
    expect(run).toMatchObject({ status: "failed", note: "Census geocoder failed: 500" });
  });
});

// A fake City datastore and Census geocoder, by URL. Rows are the 311 file's columns; `modified` is a queue per file.
type FakeRow = { _id: number; CREATIONDATE: string | null; CLOSEDDATETIME: string | null; OBJECTDESC: string | null; TITLE?: string | null };
const CUR = "bf2b508a-5bfa-49da-8846-d87ffeee020a", HIST = "abdfe983-e856-40cd-bee2-85e78454344a";
const IN_A = { lat: 43.05, lon: -87.95 }, OUTSIDE = { lat: 43.3, lon: -87.5 };
function fake(o: { rows: Record<string, FakeRow[]>; modified: Record<string, string[]>; places: Record<string, { lat: number; lon: number } | null>; censusStatus?: number }) {
  const geocodes: string[] = [];
  const ok = (result: unknown) => new Response(JSON.stringify({ success: true, result }), { status: 200 });
  vi.stubGlobal("fetch", async (u: string | URL, init?: RequestInit) => {
    const url = String(u);
    if (url.includes("geocoder")) {
      if (o.censusStatus) return new Response("down", { status: o.censusStatus });
      const csv = await ((init!.body as FormData).get("addressFile") as Blob).text();
      geocodes.push(csv);
      const reply = csv.trim().split("\n").map((line) => {
        const [key, street] = line.replace(/^"|"$/g, "").split('","');
        const p = o.places[street];
        return p ? `"${key}","${street}","Match","Exact","${street}","${p.lon},${p.lat}","1","L","55","079","000100","1000"` : `"${key}","${street}","No_Match"`;
      }).join("\n");
      return new Response(reply, { status: 200 });
    }
    const params = new URL(url).searchParams;
    if (url.includes("resource_show")) { const q = o.modified[params.get("id")!]; return ok({ last_modified: q.length > 1 ? q.shift() : q[0] }); }
    const sql = params.get("sql")!;
    const res = /FROM "([^"]+)"/.exec(sql)![1];
    const all = o.rows[res] ?? [];
    if (/COUNT\(\*\)/.test(sql)) return ok({ records: [{ n: String(all.length) }] });
    const [, limit, offset] = /LIMIT (\d+) OFFSET (\d+)/.exec(sql)!;
    return ok({ records: all.slice(+offset, +offset + +limit) });
  });
  return geocodes;
}
const square = (minLon: number, minLat: number, maxLon: number, maxLat: number) => ({
  geometry: JSON.stringify({ type: "Polygon", coordinates: [[[minLon, minLat], [maxLon, minLat], [maxLon, maxLat], [minLon, maxLat], [minLon, minLat]]] }),
  bbox: { minLat, maxLat, minLon, maxLon },
});
const seedHoods = () => t.run(async (ctx) => {
  await ctx.db.insert("neighborhoods", { definition: "city", name: "Hood A", matchKey: "hood a", ...square(-88, 43, -87.9, 43.1) });
  await ctx.db.insert("neighborhoods", { definition: "city", name: "Hood B", matchKey: "hood b", ...square(-87.9, 43, -87.8, 43.1) });
});
const row = (id: number, address: string | null, closed: string | null = null): FakeRow =>
  ({ _id: id, CREATIONDATE: "2026-03-01 00:00:00", CLOSEDDATETIME: closed, OBJECTDESC: address, TITLE: "Potholes" });
const at = (n: number) => `${n} E A ST, MILWAUKEE, WI, 53202-1111`;
const PLACES = { [`100 E A ST`]: IN_A, [`101 E A ST`]: IN_A, [`102 E A ST`]: IN_A, [`103 E A ST`]: IN_A, [`500 E A ST`]: OUTSIDE, [`9 E A ST`]: null };
const FILE7 = [row(1, at(100), "2026-03-03 00:00:00"), row(2, at(101)), row(3, at(102)), row(4, at(103)), row(5, at(500)), row(6, null), row(7, at(9))];
const count = async (kind: string, place: string) => {
  const { current } = await live();
  const rs = await t.run((ctx) => ctx.db.query("requests311").withIndex("by_run_kind_place", (q) => q.eq("runId", current!.runId).eq("kind", kind as "city").eq("place", place)).collect());
  return rs.reduce((s, r) => s + r.requests, 0);
};
const runs = () => t.run((ctx) => ctx.db.query("requests311Runs").collect());

describe("311 refresh", () => {
  it("counts a small file end to end, storing no address", async () => {
    await seedHoods();
    fake({ rows: { [CUR]: FILE7, [HIST]: [] }, modified: { [CUR]: ["m1"], [HIST]: ["h1"] }, places: PLACES });
    await t.action(internal.requests311.refresh311, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await count("city", "city")).toBe(7);
    expect(await count("hood", "Hood A")).toBe(4);
    expect(await count("unplaced", "outside")).toBe(1);
    expect(await count("unplaced", "noAddress")).toBe(1);
    expect(await count("unplaced", "noMatch")).toBe(1);
    expect(await count("tract", "55079000100")).toBe(5);
    expect((await live()).current).toMatchObject({ status: "live", matched: 5, noMatch: 1, noAddress: 1 });
    const stored = JSON.stringify(await t.run((ctx) => ctx.db.query("requests311").collect()));
    expect(stored).not.toMatch(/E A ST/);
  });

  it("skips the historical file when the City hasn't changed it", async () => {
    await seedHoods();
    const h = await t.mutation(internal.requests311.startRun, { file: "historical", modified: "h1" });
    await t.mutation(internal.requests311.finishRun, { runId: h });
    fake({ rows: { [CUR]: FILE7, [HIST]: FILE7 }, modified: { [CUR]: ["m1"], [HIST]: ["h1"] }, places: PLACES });
    await t.action(internal.requests311.refresh311, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await runs()).filter((r) => r.file === "historical").map((r) => r.runId)).toEqual([h]);
  });

  it("fails, keeping old counts, when the City file changes mid-run", async () => {
    await seedHoods();
    const old = await t.mutation(internal.requests311.startRun, { file: "current", modified: "m0" });
    await t.mutation(internal.requests311.finishRun, { runId: old });
    fake({ rows: { [CUR]: FILE7, [HIST]: [] }, modified: { [CUR]: ["m1", "m2"], [HIST]: ["h1"] }, places: PLACES });
    await t.action(internal.requests311.refresh311, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await live()).current?.runId).toBe(old);
    expect((await runs()).find((r) => r.file === "current" && r.runId !== old)).toMatchObject({ status: "failed", note: "City file changed during the count" });
  });

  it("fails below an 80% match rate", async () => {
    await seedHoods();
    fake({ rows: { [CUR]: FILE7, [HIST]: [] }, modified: { [CUR]: ["m1"], [HIST]: ["h1"] }, places: { [`100 E A ST`]: IN_A } });
    await t.action(internal.requests311.refresh311, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await live()).current).toBeNull();
    expect((await runs()).find((r) => r.file === "current")?.note).toMatch(/match rate/i);
  });

  it("fails, keeping old counts, when the geocoder is down twice", async () => {
    await seedHoods();
    const old = await t.mutation(internal.requests311.startRun, { file: "current", modified: "m0" });
    await t.mutation(internal.requests311.finishRun, { runId: old });
    fake({ rows: { [CUR]: FILE7, [HIST]: [] }, modified: { [CUR]: ["m1"], [HIST]: ["h1"] }, places: PLACES, censusStatus: 500 });
    await t.action(internal.requests311.refresh311, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await live()).current?.runId).toBe(old);
    expect((await runs()).find((r) => r.runId !== old && r.file === "current")?.note).toMatch(/Census geocoder failed: 500/);
  });

  it("fails naming the column when the City drops one", async () => {
    await seedHoods();
    const noTitle = FILE7.map(({ TITLE: _t, ...r }) => r);
    fake({ rows: { [CUR]: noTitle, [HIST]: [] }, modified: { [CUR]: ["m1"], [HIST]: ["h1"] }, places: PLACES });
    await t.action(internal.requests311.refresh311, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await runs()).find((r) => r.file === "current")?.note).toMatch(/TITLE/);
    expect(await t.run((ctx) => ctx.db.query("requests311").collect())).toEqual([]);
  });
});
