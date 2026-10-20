import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery, query, type ActionCtx, type QueryCtx } from "./_generated/server";
import { datastoreSql, datastoreSqlPage, resourceModified } from "./lib/ckan";
import { geocodeBatch } from "./lib/censusBatch";
import { inBbox, inShape, type Bbox, type Geometry } from "./lib/geo";
import { tractGeoid } from "./lib/factSheet";
import { matchName, nameKey } from "./lib/neighborhoodNames";
import { addDays, cleanAddress, daysToClose, medianOf, mergeHist, parseBatchReply, resolveTypes, toBatchCsv, yearOf, type Hist } from "./lib/requests311";
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
    const runId = `${file}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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

// ── The weekly refresh ──────────────────────────────────────────────────────────────────────────────────────────────
// refresh311 → startFile → countChunk → countChunk … → finishRun (or failRun) → the next file's startFile. One file and
// one Census request at a time. Scheduled arguments are offsets and IDs only, never rows or addresses.

export const FILES = { current: "bf2b508a-5bfa-49da-8846-d87ffeee020a", historical: "abdfe983-e856-40cd-bee2-85e78454344a" } as const;
export const CHUNK = 5000;
const MIN_MATCH = 0.8;
const COLUMNS = ["CREATIONDATE", "CLOSEDDATETIME", "OBJECTDESC", "TITLE"] as const;
const SHAPES_PAGE = 20;
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export const runsNow = internalQuery({ args: {}, handler: (ctx) => liveRuns(ctx) });
export const runModified = internalQuery({ args: { runId: v.string() }, handler: async (ctx, { runId }) => (await runOf(ctx, runId))?.modified ?? null });

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
    const { historical } = await ctx.runQuery(internal.requests311.runsNow, {});
    const histModified = await resourceModified(FILES.historical);
    const queue: File[] = ["current", ...(historical && historical.modified === histModified ? [] : (["historical"] as const))];
    await ctx.scheduler.runAfter(0, internal.requests311.startFile, { file: queue[0], queue: queue.slice(1) });
    return [`311: counting ${queue.join(" and ")} in the background`];
  },
});

export const startFile = internalAction({
  args: { file: vRequests311File, queue: v.array(vRequests311File) },
  handler: async (ctx, { file, queue }) => {
    const modified = await resourceModified(FILES[file]);
    const runId = await ctx.runMutation(internal.requests311.startRun, { file, modified });
    try {
      const [{ n }] = await datastoreSql<{ n: string }>(`SELECT COUNT(*) AS n FROM "${FILES[file]}"`);
      const total = Number(n);
      if (!Number.isFinite(total) || total <= 0) throw new Error("City 311 file has no rows");
      await ctx.scheduler.runAfter(0, internal.requests311.countChunk, { runId, file, offset: 0, total, queue });
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

export const countChunk = internalAction({
  args: { runId: v.string(), file: vRequests311File, offset: v.number(), total: v.number(), queue: v.array(vRequests311File) },
  handler: async (ctx, { runId, file, offset, total, queue }) => {
    try {
      const { records, truncated } = await datastoreSqlPage<Record<string, string | null>>(
        `SELECT "_id",${COLUMNS.map((c) => `"${c}"`).join(",")} FROM "${FILES[file]}" ORDER BY "_id" LIMIT ${CHUNK} OFFSET ${offset}`);
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
      for (let i = 0; i < Math.max(all.length, 1); i += 1000) {
        const first = i === 0;
        await ctx.runMutation(internal.requests311.addTallies, { runId, tallies: all.slice(i, i + 1000), matched: first ? matched : 0, noMatch: first ? noMatch : 0, noAddress: first ? noAddress : 0 });
      }

      if (offset + CHUNK < total) {
        await ctx.scheduler.runAfter(0, internal.requests311.countChunk, { runId, file, offset: offset + CHUNK, total, queue });
        return;
      }
      const changed = (await resourceModified(FILES[file])) !== (await ctx.runQuery(internal.requests311.runModified, { runId }));
      await endFile(ctx, runId, queue, changed ? "City file changed during the count" : null);
    } catch (e) {
      await endFile(ctx, runId, queue, message(e));
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
async function dycuNoteFor(ctx: QueryCtx, name: string, dycu: Doc<"neighborhoods">[]): Promise<string | null> {
  const geoids = (await ctx.db.query("tractNeighborhoods").collect()).filter((r) => (r.pieces ?? []).some((p) => p.name === name)).map((r) => r.geoid);
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
    const years = cityAll.filter(owned).map((r) => r.year);
    const newest = Math.max(...years);
    const from = a.from ?? a.to ?? newest, to = a.to ?? a.from ?? newest;

    const known = [...new Set(cityAll.map((r) => r.type))].sort();
    const typed = resolveTypes(a.type, known);
    if ("choices" in typed) return { status: "no-type" as const, asked: a.type ?? "", choices: typed.choices };
    const keep = (r: Row) => owned(r) && r.year >= from && r.year <= to && typed.types.includes(r.type);

    const asked = a.place?.trim() ?? "";
    const city = await ctx.db.query("neighborhoods").withIndex("by_definition_matchKey", (q) => q.eq("definition", "city")).collect();
    const dycu = await ctx.db.query("neighborhoods").withIndex("by_definition_matchKey", (q) => q.eq("definition", "dycu")).collect();
    let place: { name: string; kind: "city" | "hood" | "dycu"; tracts: string[]; dycuNote: string | null };
    let rows: Row[];
    if (!asked) {
      place = { name: "Milwaukee", kind: "city", tracts: [], dycuNote: null };
      rows = cityAll;
    } else {
      const m = matchName(asked, city);
      if (m.kind === "one") {
        place = { name: m.row.name, kind: "hood", tracts: [], dycuNote: await dycuNoteFor(ctx, m.row.name, dycu) };
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
      status: "ok" as const, place, types: typed.types, from, to, total: fig(mine), city: fig(cityAll.filter(keep)),
      rows: a.groupBy === "type" ? by((r) => r.type) : a.groupBy === "year" ? by((r) => String(r.year)) : [],
      unplaced, counted: Math.max(...live.map((r) => r.finished ?? r.started)), caveat: CAVEAT,
    };
  },
});
