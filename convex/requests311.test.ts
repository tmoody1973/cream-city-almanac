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
