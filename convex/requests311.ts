import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { internalMutation, type QueryCtx } from "./_generated/server";
import { mergeHist } from "./lib/requests311";
import { vRequests311File, vRequests311Tally } from "./validators";

// City 311 requests counted by place (spec 2026-10-20-311-by-neighborhood, decision 057). Each refresh writes its own
// rows under a run ID; finishRun flips the file's live run in one mutation, so a reader never sees a half-counted year.
// Counts only: no address, point or comment is ever written here, and scheduled arguments carry offsets, not rows.

const DELETE_PAGE = 4000;
type File = Doc<"requests311Runs">["file"];

const runOf = (ctx: QueryCtx, runId: string) => ctx.db.query("requests311Runs").withIndex("by_runId", (q) => q.eq("runId", runId)).first();

export async function liveRuns(ctx: QueryCtx): Promise<Record<File, Doc<"requests311Runs"> | null>> {
  const one = async (file: File) => (await ctx.db.query("requests311Runs").withIndex("by_file", (q) => q.eq("file", file)).collect()).find((r) => r.status === "live") ?? null;
  return { current: await one("current"), historical: await one("historical") };
}

export const startRun = internalMutation({
  args: { file: vRequests311File, modified: v.union(v.string(), v.null()) },
  handler: async (ctx, { file, modified }) => {
    const runId = `${file}-${Date.now()}`;
    await ctx.db.insert("requests311Runs", { file, runId, status: "running", modified, started: Date.now(), finished: null, note: null, matched: 0, noMatch: 0, noAddress: 0 });
    return runId;
  },
});

// A chunk's tallies (callers send at most 1,000) added onto the run's rows, plus its geocoding totals.
export const addTallies = internalMutation({
  args: { runId: v.string(), tallies: v.array(vRequests311Tally), matched: v.number(), noMatch: v.number(), noAddress: v.number() },
  handler: async (ctx, { runId, tallies, matched, noMatch, noAddress }) => {
    const run = await runOf(ctx, runId);
    if (!run || run.status !== "running") throw new Error(`311 run ${runId} isn't running`);
    for (const t of tallies) {
      const old = await ctx.db.query("requests311").withIndex("by_run_key", (q) =>
        q.eq("runId", runId).eq("kind", t.kind).eq("place", t.place).eq("year", t.year).eq("type", t.type)).first();
      if (old) await ctx.db.patch(old._id, { requests: old.requests + t.requests, closed: old.closed + t.closed, days: mergeHist(old.days, t.days) });
      else await ctx.db.insert("requests311", { runId, ...t });
    }
    await ctx.db.patch(run._id, { matched: run.matched + matched, noMatch: run.noMatch + noMatch, noAddress: run.noAddress + noAddress });
  },
});

export const finishRun = internalMutation({
  args: { runId: v.string() },
  handler: async (ctx, { runId }) => {
    const run = await runOf(ctx, runId);
    if (!run || run.status !== "running") throw new Error(`311 run ${runId} isn't running`);
    const old = (await liveRuns(ctx))[run.file];
    if (old) {
      await ctx.db.patch(old._id, { status: "retired" });
      await ctx.scheduler.runAfter(0, internal.requests311.deleteRows, { runId: old.runId });
    }
    await ctx.db.patch(run._id, { status: "live", finished: Date.now() });
  },
});

// A failed run keeps the file's live run as it was; its own rows go.
export const failRun = internalMutation({
  args: { runId: v.string(), note: v.string() },
  handler: async (ctx, { runId, note }) => {
    const run = await runOf(ctx, runId);
    if (!run || run.status !== "running") return;
    await ctx.db.patch(run._id, { status: "failed", finished: Date.now(), note });
    await ctx.scheduler.runAfter(0, internal.requests311.deleteRows, { runId });
  },
});

export const deleteRows = internalMutation({
  args: { runId: v.string() },
  handler: async (ctx, { runId }) => {
    const page = await ctx.db.query("requests311").withIndex("by_run", (q) => q.eq("runId", runId)).take(DELETE_PAGE);
    for (const r of page) await ctx.db.delete(r._id);
    if (page.length === DELETE_PAGE) await ctx.scheduler.runAfter(0, internal.requests311.deleteRows, { runId });
  },
});
