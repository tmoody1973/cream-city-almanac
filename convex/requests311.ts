import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery, query, type ActionCtx, type MutationCtx, type QueryCtx } from "./_generated/server";
import { datastoreSql, datastoreSqlPage } from "./lib/ckan";
import { geocodeBatch } from "./lib/censusBatch";
import { inBbox, inShape, type Bbox, type Geometry } from "./lib/geo";
import { tractGeoid } from "./lib/factSheet";
import { matchName, nameKey } from "./lib/neighborhoodNames";
import { addDays, cleanAddress, daysToClose, medianOf, mergeHist, parseBatchReply, resolveTypes, toBatchCsv, yearOf, yearRange, type Hist } from "./lib/requests311";
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
  args: { file: vRequests311File, fingerprint: v.union(v.string(), v.null()), queue: v.optional(v.array(vRequests311File)) },
  handler: async (ctx, { file, fingerprint, queue }) => {
    const runId = `${file}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await ctx.db.insert("requests311Runs", {
      file, runId, status: "running", fingerprint, hoods: [], started: Date.now(), finished: null, note: null,
      matched: 0, noMatch: 0, noAddress: 0, next: 0, attempt: 0, queue: queue ?? [],
    });
    return runId;
  },
});

const atStep = (run: Doc<"requests311Runs"> | null, step: number): run is Doc<"requests311Runs"> =>
  run !== null && run.status === "running" && (run.next ?? 0) === step;

// A step's tallies (callers send at most 1,000) added onto the run's rows. Each row keeps its figures from before this
// step, so rollbackStep can undo a step that was stopped between batches.
export const addTallies = internalMutation({
  args: { runId: v.string(), step: v.number(), tallies: v.array(vRequests311Tally) },
  handler: async (ctx, { runId, step, tallies }) => {
    const run = await runOf(ctx, runId);
    if (!atStep(run, step)) throw new Error(`311 run ${runId} isn't counting step ${step}`);
    for (const t of tallies) {
      const old = await ctx.db.query("requests311").withIndex("by_run_key", (q) =>
        q.eq("runId", runId).eq("kind", t.kind).eq("place", t.place).eq("year", t.year).eq("type", t.type)).first();
      if (!old) { await ctx.db.insert("requests311", { runId, ...t, step }); continue; }
      const before = old.step === step ? old.before : { requests: old.requests, closed: old.closed, days: old.days };
      await ctx.db.patch(old._id, { requests: old.requests + t.requests, closed: old.closed + t.closed, days: mergeHist(old.days, t.days), step, before });
    }
    const hoods = [...new Set([...run.hoods, ...tallies.filter((t) => t.kind === "hood").map((t) => t.place)])].sort();
    await ctx.db.patch(run._id, { hoods });
  },
});

// Puts back up to 1,000 rows a stopped step had added to; returns how many, so the caller repeats until 0.
export const rollbackStep = internalMutation({
  args: { runId: v.string(), step: v.number() },
  handler: async (ctx, { runId, step }) => {
    const page = await ctx.db.query("requests311").withIndex("by_run_step", (q) => q.eq("runId", runId).eq("step", step)).take(1000);
    for (const r of page) {
      if (r.before) await ctx.db.patch(r._id, { ...r.before, step: undefined, before: undefined });
      else await ctx.db.delete(r._id);
    }
    return page.length;
  },
});

export const setTotal = internalMutation({
  args: { runId: v.string(), total: v.number(), fingerprint: v.optional(v.string()) },
  handler: async (ctx, { runId, total, fingerprint }) => {
    const run = await runOf(ctx, runId);
    if (run) await ctx.db.patch(run._id, { total, ...(fingerprint === undefined ? {} : { fingerprint }) });
  },
});

// A step starts: null if the run has ended or moved past it (a stale copy). Otherwise it counts a try and sets a
// watchdog: Convex stops an action at 10 minutes, so a step not ended 15 minutes on has stopped.
const WATCH_MS = 15 * 60_000;
const MAX_ATTEMPTS = 3;
export const beginStep = internalMutation({
  args: { runId: v.string(), step: v.number() },
  handler: async (ctx, { runId, step }) => {
    const run = await runOf(ctx, runId);
    if (!atStep(run, step)) return null;
    const attempt = (run.attempt ?? 0) + 1;
    await ctx.db.patch(run._id, { attempt });
    await ctx.scheduler.runAfter(WATCH_MS, internal.requests311.watchStep, { runId, step, attempt });
    return { file: run.file, queue: run.queue ?? [] };
  },
});

// A step's geocoding totals and its move to the next step, in one transaction, so they count once. It also schedules
// what comes next, so no gap is left between a finished step and the next one.
export const endStep = internalMutation({
  args: { runId: v.string(), step: v.number(), matched: v.number(), noMatch: v.number(), noAddress: v.number() },
  handler: async (ctx, { runId, step, matched, noMatch, noAddress }) => {
    const run = await runOf(ctx, runId);
    if (!atStep(run, step)) return;
    const next = step + CHUNK;
    await ctx.db.patch(run._id, { matched: run.matched + matched, noMatch: run.noMatch + noMatch, noAddress: run.noAddress + noAddress, next, attempt: 0 });
    if (run.total === undefined) return;
    if (next < run.total) await ctx.scheduler.runAfter(0, internal.requests311.countChunk, { runId, step: next });
    else await ctx.scheduler.runAfter(0, internal.requests311.finishFile, { runId });
  },
});

// The watchdog: if the step hasn't ended, it reruns it (which rolls back what it half-saved), up to 3 tries.
export const watchStep = internalMutation({
  args: { runId: v.string(), step: v.number(), attempt: v.number() },
  handler: async (ctx, { runId, step, attempt }) => {
    const run = await runOf(ctx, runId);
    if (!atStep(run, step) || run.attempt !== attempt) return;
    if (attempt < MAX_ATTEMPTS) { await ctx.scheduler.runAfter(0, internal.requests311.countChunk, { runId, step }); return; }
    await failIn(ctx, run, `A counting step stopped ${MAX_ATTEMPTS} times`);
    const queue = run.queue ?? [];
    if (queue.length) await ctx.scheduler.runAfter(0, internal.requests311.startFile, { file: queue[0], queue: queue.slice(1) });
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
async function failIn(ctx: MutationCtx, run: Doc<"requests311Runs">, note: string) {
  await ctx.db.patch(run._id, { status: "failed", finished: Date.now(), note });
  await ctx.scheduler.runAfter(0, internal.requests311.deleteRows, { runId: run.runId });
}
export const failRun = internalMutation({
  args: { runId: v.string(), note: v.string() },
  handler: async (ctx, { runId, note }) => {
    const run = await runOf(ctx, runId);
    if (run && run.status === "running") await failIn(ctx, run, note);
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

// ── The weekly refresh ──────────────────────────────────────────────────────────────────────────────────────────────
// refresh311 → startFile → countChunk (step 0) → endStep → countChunk (step 5000) … → finishFile → finishRun (or failRun)
// → the next file's startFile. One file and one Census request at a time. Scheduled arguments are offsets and IDs only,
// never rows or addresses. A step Convex stops partway is rerun by watchStep, after rolling back what it saved.

export const FILES = { current: "bf2b508a-5bfa-49da-8846-d87ffeee020a", historical: "abdfe983-e856-40cd-bee2-85e78454344a" } as const;
export const CHUNK = 5000;
const MIN_MATCH = 0.8;
const COLUMNS = ["CREATIONDATE", "CLOSEDDATETIME", "OBJECTDESC", "TITLE"] as const;
const SHAPES_PAGE = 20;
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

const STALE_MS = 3 * 3_600_000; // a first run takes about 70 minutes plus any reruns; one running past 3 hours has stopped
export const allRuns = internalQuery({ args: {}, handler: (ctx) => ctx.db.query("requests311Runs").collect() });
export const runInfo = internalQuery({ args: { runId: v.string() }, handler: (ctx, { runId }) => runOf(ctx, runId) });

// The file's contents in one line; a re-upload of the same rows keeps it, a new or closed request changes it.
async function fingerprintOf(file: File): Promise<{ fingerprint: string; total: number }> {
  const [r] = await datastoreSql<{ n: string; c: string | null; x: string | null }>(
    `SELECT COUNT(*) AS n, MAX("CREATIONDATE") AS c, MAX("CLOSEDDATETIME") AS x FROM "${FILES[file]}"`);
  return { fingerprint: `${r.n}|${r.c}|${r.x}`, total: Number(r.n) };
}

// The City neighborhoods' outlines, 20 at a time: all 190 in one read pass Convex's 16 MB limit (factSheet.ts).
export const hoodShapes = internalQuery({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, { cursor }) => {
    const r = await ctx.db.query("neighborhoods").withIndex("by_definition_matchKey", (q) => q.eq("definition", "city")).paginate({ cursor, numItems: SHAPES_PAGE });
    return { page: r.page.filter((n) => n.geometry && n.bbox).map((n) => ({ name: n.name, bbox: n.bbox!, geometry: n.geometry! })), cursor: r.continueCursor, done: r.isDone };
  },
});

export const refresh311 = internalAction({
  args: {},
  handler: async (ctx): Promise<string[]> => {
    const runs = await ctx.runQuery(internal.requests311.allRuns, {});
    const notes: string[] = [];
    const queue: File[] = [];
    for (const file of ["current", "historical"] as const) {
      const mine = runs.filter((r) => r.file === file);
      const last = mine.filter((r) => r.finished !== null && r.status !== "running").sort((a, b) => b.finished! - a.finished!)[0];
      if (last) notes.push(`311 ${file}: last run ${last.status === "retired" ? "replaced" : last.status}${last.note ? `: ${last.note}` : ""}`);
      // Scheduled actions run at most once: a chunk that timed out never reached its catch, so its run is ended here.
      for (const r of mine.filter((x) => x.status === "running" && Date.now() - x.started >= STALE_MS)) await ctx.runMutation(internal.requests311.failRun, { runId: r.runId, note: "Stopped without finishing" });
      if (mine.some((x) => x.status === "running" && Date.now() - x.started < STALE_MS)) { notes.push(`311 ${file}: still counting`); continue; }
      if (file === "historical") {
        const live = mine.find((r) => r.status === "live");
        if (live && live.fingerprint === (await fingerprintOf(file)).fingerprint) continue;
      }
      queue.push(file);
    }
    if (queue.length) {
      await ctx.scheduler.runAfter(0, internal.requests311.startFile, { file: queue[0], queue: queue.slice(1) });
      notes.push(`311: counting ${queue.join(" and ")} in the background`);
    }
    return notes;
  },
});

export const startFile = internalAction({
  args: { file: vRequests311File, queue: v.array(vRequests311File) },
  handler: async (ctx, { file, queue }) => {
    const runId = await ctx.runMutation(internal.requests311.startRun, { file, fingerprint: null, queue });
    try {
      const { fingerprint, total } = await fingerprintOf(file);
      if (!Number.isFinite(total) || total <= 0) throw new Error("City 311 file has no rows");
      await ctx.runMutation(internal.requests311.setTotal, { runId, total, fingerprint });
      await ctx.scheduler.runAfter(0, internal.requests311.countChunk, { runId, step: 0 });
    } catch (e) {
      await endFile(ctx, runId, queue, message(e));
    }
  },
});

async function endFile(ctx: ActionCtx, runId: string, queue: File[], failed: string | null) {
  if (failed) await ctx.runMutation(internal.requests311.failRun, { runId, note: failed });
  else await ctx.runMutation(internal.requests311.finishRun, { runId });
  if (queue.length) await ctx.scheduler.runAfter(0, internal.requests311.startFile, { file: queue[0], queue: queue.slice(1) });
}

type Shape = { name: string; bbox: Bbox; geometry: Geometry };
async function loadShapes(ctx: ActionCtx): Promise<Shape[]> {
  const out: Shape[] = [];
  for (let cursor: string | null = null, done = false; !done;) {
    const r: { page: { name: string; bbox: Bbox; geometry: string }[]; cursor: string; done: boolean } = await ctx.runQuery(internal.requests311.hoodShapes, { cursor });
    out.push(...r.page.map((s) => ({ ...s, geometry: JSON.parse(s.geometry) as Geometry })));
    cursor = r.cursor; done = r.done;
  }
  return out;
}

type Tally = { kind: "city" | "hood" | "tract" | "unplaced"; place: string; year: number; type: string; requests: number; closed: number; days: Hist };
function tallyInto(m: Map<string, Tally>, kind: Tally["kind"], place: string, year: number, type: string, closed: boolean, days: number | null) {
  const key = `${kind}|${place}|${year}|${type}`;
  const t = m.get(key) ?? { kind, place, year, type, requests: 0, closed: 0, days: {} };
  m.set(key, { ...t, requests: t.requests + 1, closed: t.closed + (closed ? 1 : 0), days: days === null ? t.days : addDays(t.days, days) });
}

// One step: rows step to step + 5,000. Safe to run again for the same step; only the run's current step does anything.
export const countChunk = internalAction({
  args: { runId: v.string(), step: v.number() },
  handler: async (ctx, { runId, step }) => {
    const run: { file: File; queue: File[] } | null = await ctx.runMutation(internal.requests311.beginStep, { runId, step });
    if (!run) return;
    try {
      while ((await ctx.runMutation(internal.requests311.rollbackStep, { runId, step })) > 0);
      const { records, truncated } = await datastoreSqlPage<Record<string, string | null>>(
        `SELECT "_id",${COLUMNS.map((c) => `"${c}"`).join(",")} FROM "${FILES[run.file]}" ORDER BY "_id" LIMIT ${CHUNK} OFFSET ${step}`);
      if (truncated) throw new Error("City cut the 311 page short");
      const missing = COLUMNS.filter((c) => records.length && !(c in records[0]));
      if (missing.length) throw new Error(`City 311 file is missing column ${missing.join(", ")}`);

      // Addresses live only in this function's memory: deduped, geocoded under row-free keys, then dropped.
      const cleaned = records.map((r) => cleanAddress(r.OBJECTDESC));
      const distinct = [...new Set(cleaned.filter((a) => a !== null).map((a) => `${a!.street}|${a!.city}|${a!.state}|${a!.zip}`))];
      const keyOf = new Map(distinct.map((d, i) => [d, `k${i}`]));
      const placed = distinct.length
        ? parseBatchReply(await geocodeBatch(toBatchCsv(distinct.map((d) => { const [street, city, state, zip] = d.split("|"); return { key: keyOf.get(d)!, street, city, state, zip }; }))))
        : new Map();
      const usable = cleaned.filter((a) => a !== null).length;
      const hits = cleaned.filter((a) => a && placed.get(keyOf.get(`${a.street}|${a.city}|${a.state}|${a.zip}`)!)).length;
      if (usable && hits / usable < MIN_MATCH) throw new Error(`311 match rate ${Math.round((100 * hits) / usable)}% is below 80%; the address format may have changed`);

      const shapes = await loadShapes(ctx);
      const tallies = new Map<string, Tally>();
      let matched = 0, noMatch = 0, noAddress = 0;
      records.forEach((r, i) => {
        const year = yearOf(r.CREATIONDATE);
        if (year === null) return;
        const type = r.TITLE?.trim() || "(no type)";
        const { closed, days } = daysToClose(r.CREATIONDATE, r.CLOSEDDATETIME);
        tallyInto(tallies, "city", "city", year, type, closed, days);
        const a = cleaned[i];
        const p = a ? placed.get(keyOf.get(`${a.street}|${a.city}|${a.state}|${a.zip}`)!) : undefined;
        if (!a) { noAddress++; tallyInto(tallies, "unplaced", "noAddress", year, type, closed, days); return; }
        if (!p) { noMatch++; tallyInto(tallies, "unplaced", "noMatch", year, type, closed, days); return; }
        matched++;
        tallyInto(tallies, "tract", p.geoid, year, type, closed, days);
        const hood = shapes.find((s) => inBbox(p, s.bbox) && inShape(p, s.geometry));
        tallyInto(tallies, hood ? "hood" : "unplaced", hood ? hood.name : "outside", year, type, closed, days);
      });
      const all = [...tallies.values()];
      for (let i = 0; i < all.length; i += 1000) await ctx.runMutation(internal.requests311.addTallies, { runId, step, tallies: all.slice(i, i + 1000) });
      await ctx.runMutation(internal.requests311.endStep, { runId, step, matched, noMatch, noAddress });
    } catch (e) {
      await endFile(ctx, runId, run.queue, message(e));
    }
  },
});

// After the last step: the file must be the one the count started on.
export const finishFile = internalAction({
  args: { runId: v.string() },
  handler: async (ctx, { runId }) => {
    const run: Doc<"requests311Runs"> | null = await ctx.runQuery(internal.requests311.runInfo, { runId });
    if (!run || run.status !== "running") return;
    try {
      const changed = (await fingerprintOf(run.file)).fingerprint !== run.fingerprint;
      await endFile(ctx, runId, run.queue ?? [], changed ? "City file changed during the count" : null);
    } catch (e) {
      await endFile(ctx, runId, run.queue ?? [], message(e));
    }
  },
});

// ── Ask's count311 ──────────────────────────────────────────────────────────────────────────────────────────────────

export const CAVEAT = "311 dates have no time of day, so a request closed the same day counts as 0 days.";
type Fig = { requests: number; closed: number; medianDays: number | null };
type Row = Doc<"requests311">;
const newestTracts = (d: Doc<"neighborhoods">) => [...(d.tracts ?? [])].sort((x, y) => Math.max(0, ...y.years) - Math.max(0, ...x.years))[0]?.tracts ?? [];

function fig(rows: Row[]): Fig {
  const days = rows.reduce<Hist>((h, r) => mergeHist(h, r.days), {});
  return { requests: rows.reduce((s, r) => s + r.requests, 0), closed: rows.reduce((s, r) => s + r.closed, 0), medianDays: medianOf(days) };
}

// DYCU areas whose newest tracts hold every tract the City neighborhood touches, or that share its name.
function dycuNoteFor(pieces: Doc<"tractNeighborhoods">[], name: string, dycu: Doc<"neighborhoods">[]): string | null {
  const geoids = pieces.filter((r) => (r.pieces ?? []).some((p) => p.name === name)).map((r) => r.geoid);
  const holding = geoids.length ? dycu.filter((d) => { const held = new Set(newestTracts(d).map(tractGeoid)); return geoids.every((g) => held.has(g)); }) : [];
  if (holding.length) return `All its census tracts are in Data You Can Use's ${holding.map((d) => d.name).join(" and ")} area, a larger area; ask for it by name for its count.`;
  const same = dycu.find((d) => d.name.toLowerCase() === name.toLowerCase());
  return same ? `Data You Can Use's ${same.name} area is built from census tracts, so its counts differ from the City neighborhood's.` : null;
}

export const count311 = query({
  args: { place: v.optional(v.string()), type: v.optional(v.string()), from: v.optional(v.number()), to: v.optional(v.number()), groupBy: v.optional(v.union(v.literal("type"), v.literal("year"))) },
  handler: async (ctx, a) => {
    const runs = await liveRuns(ctx);
    const live = [runs.historical, runs.current].filter((r) => r !== null);
    if (!live.length) return { status: "empty" as const };
    const read = (kind: Row["kind"], place: string) =>
      Promise.all(live.map((r) => ctx.db.query("requests311").withIndex("by_run_kind_place", (q) => q.eq("runId", r.runId).eq("kind", kind).eq("place", place)).collect())).then((x) => x.flat());

    // A year belongs to one file: the historical file's years, and only newer ones from the current file.
    const cityAll = await read("city", "city");
    const histMax = Math.max(-Infinity, ...cityAll.filter((r) => r.runId === runs.historical?.runId).map((r) => r.year));
    const owned = (r: Row) => r.runId === runs.historical?.runId || r.year > histMax;
    const range = yearRange(a, [...new Set(cityAll.filter(owned).map((r) => r.year))]);
    if ("outside" in range) return { status: "no-years" as const, first: range.first, last: range.last };
    const { from, to, missing } = range;

    const known = [...new Set(cityAll.map((r) => r.type))].sort();
    const typed = resolveTypes(a.type, known);
    if ("choices" in typed) return { status: "no-type" as const, asked: a.type ?? "", choices: typed.choices };
    const keep = (r: Row) => owned(r) && r.year >= from && r.year <= to && typed.types.includes(r.type);

    const asked = a.place?.trim() ?? "";
    // City names without their outlines (all 190 shapes are megabytes): the neighborhoods the live runs counted, and
    // the ones with residents in a tract, so a neighborhood with no requests yet still answers 0, not "no such place".
    const pieces = await ctx.db.query("tractNeighborhoods").collect();
    const names = [...new Set([...live.flatMap((r) => r.hoods), ...pieces.flatMap((p) => (p.pieces ?? []).map((x) => x.name))])];
    const city = names.map((name) => ({ name, matchKey: nameKey(name) }));
    const dycu = await ctx.db.query("neighborhoods").withIndex("by_definition_matchKey", (q) => q.eq("definition", "dycu")).collect();
    let place: { name: string; kind: "city" | "hood" | "dycu"; tracts: string[]; dycuNote: string | null };
    let rows: Row[];
    if (!asked) {
      place = { name: "Milwaukee", kind: "city", tracts: [], dycuNote: null };
      rows = cityAll;
    } else {
      const m = matchName(asked, city);
      if (m.kind === "one") {
        place = { name: m.row.name, kind: "hood", tracts: [], dycuNote: dycuNoteFor(pieces, m.row.name, dycu) };
        rows = await read("hood", m.row.name);
      } else {
        const d = matchName(asked, dycu.map((x) => ({ ...x, matchKey: nameKey(x.name) })));
        if (d.kind === "one") {
          const tracts = newestTracts(d.row);
          place = { name: d.row.name, kind: "dycu", tracts, dycuNote: null };
          rows = (await Promise.all(tracts.map((tr) => read("tract", tractGeoid(tr))))).flat();
        } else if (m.kind === "choose") return { status: "choose" as const, asked, choices: m.names };
        else return { status: "no-place" as const, asked, nearest: m.kind === "none" ? m.nearest : [] };
      }
    }

    const mine = rows.filter(keep);
    const unplaced = Object.fromEntries(await Promise.all((["noAddress", "noMatch", "outside"] as const).map(async (k) => [k, (await read("unplaced", k)).filter(keep).reduce((s, r) => s + r.requests, 0)]))) as Record<"noAddress" | "noMatch" | "outside", number>;
    const by = (key: (r: Row) => string) => [...new Set(mine.map(key))].sort().map((label) => ({ label, fig: fig(mine.filter((r) => key(r) === label)) }));
    return {
      status: "ok" as const, place, types: typed.types, from, to, missing, total: fig(mine), city: fig(cityAll.filter(keep)),
      rows: a.groupBy === "type" ? by((r) => r.type) : a.groupBy === "year" ? by((r) => String(r.year)) : [],
      unplaced, counted: Math.max(...live.map((r) => r.finished ?? r.started)), caveat: CAVEAT,
    };
  },
});
