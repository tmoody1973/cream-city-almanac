import { v } from "convex/values";
import { strFromU8, unzipSync } from "fflate";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery, query, type MutationCtx } from "./_generated/server";
import { datastoreFields, datastoreSql } from "./lib/ckan";
import { fetchWithTimeout } from "./lib/http";
import { summarize, type StopsResult } from "./lib/stopMath";
import { columnsFor, countCsv, dataZip, firstRowSql, groupSql, headerRow, KINDS, kindOfTable, periodOf, stopTables, tally, type Raw, type StopKind, type StopRow } from "./lib/stops";
import { vStopKind, vStopRow } from "./validators";

// MPD's quarterly stop-and-search data as stored counts (spec 2026-10-13-stop-search-design §4–5).
const ZIP_TIMEOUT_MS = 30_000;
const STOP_FAMILY = /-mpd-stop-and-search-data$/;
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export const stopPackages = internalQuery({
  args: {},
  handler: async (ctx) => {
    const out: { familyKey: string; title: string; modified: string; files: { name: string; format: string; url: string }[] }[] = [];
    for (const f of (await ctx.db.query("families").collect()).filter((x) => STOP_FAMILY.test(x.key))) {
      const m = await ctx.db.query("members").withIndex("by_family", (q) => q.eq("familyKey", f.key)).first();
      if (m) out.push({ familyKey: f.key, title: m.title, modified: m.modified, files: (m.files ?? []).map(({ name, format, url }) => ({ name, format, url })) });
    }
    return out;
  },
});

export const stopStatus = internalQuery({
  args: {},
  handler: async (ctx) => (await ctx.db.query("stopPeriods").collect()).map(({ period, modified, status }) => ({ period, modified, status })),
});

async function setPeriod(ctx: MutationCtx, p: { period: string; familyKey: string; modified: string; status: "counted" | "failed"; note?: string; missing?: StopKind[] }) {
  const old = await ctx.db.query("stopPeriods").withIndex("by_period", (q) => q.eq("period", p.period)).first();
  if (old) await ctx.db.replace(old._id, p);
  else await ctx.db.insert("stopPeriods", p);
}

// A period's counts replaced in one transaction, so a reader never sees half a quarter.
export const replacePeriod = internalMutation({
  args: { period: v.string(), year: v.number(), familyKey: v.string(), modified: v.string(), rows: v.array(vStopRow), missing: v.array(vStopKind) },
  handler: async (ctx, { period, year, familyKey, modified, rows, missing }) => {
    for (const old of await ctx.db.query("stopCounts").withIndex("by_period", (q) => q.eq("period", period)).collect()) await ctx.db.delete(old._id);
    for (const r of rows) await ctx.db.insert("stopCounts", { ...r, period, year });
    await setPeriod(ctx, { period, familyKey, modified, status: "counted", ...(missing.length ? { missing } : {}) });
  },
});

// A failed package keeps whatever counts it had; its status says failed, so the next run retries it.
export const markFailed = internalMutation({
  args: { period: v.string(), familyKey: v.string(), modified: v.string(), note: v.string() },
  handler: async (ctx, p) => {
    // Keep what an earlier count recorded as missing (2024's traffic table), so its card note doesn't drop a quarter.
    const old = await ctx.db.query("stopPeriods").withIndex("by_period", (q) => q.eq("period", p.period)).first();
    await setPeriod(ctx, { ...p, status: "failed", ...(old?.missing?.length ? { missing: old.missing } : {}) });
  },
});

// The person tables' counts: grouped SQL when the City's database has them, else the package's data ZIP. A kind whose
// table the package lacks (2024's ZIPs have no traffic-stop table) is returned as missing; the others still count.
async function countPackage(files: { name: string; format: string; url: string }[]): Promise<{ rows: StopRow[]; missing: StopKind[] }> {
  const tables = stopTables(files);
  const out: StopRow[] = [];
  if (tables.length) {
    for (const t of tables) {
      const ids = (await datastoreFields(t.resourceId)).map((f) => f.id);
      // Placeholder columns (2021 Q1): the real names are in the first row, which is left out of the count.
      const placeholder = ids.filter((f) => f !== "_id").every((f) => /^Column\d+$/.test(f));
      const first = placeholder ? (await datastoreSql<Record<string, unknown>>(firstRowSql(t.resourceId)))[0] ?? {} : null;
      const map = first ? headerRow(ids, first) : null;
      const c = columnsFor(t.kind, map ? Object.keys(map) : ids);
      if (!c.ok) throw new Error(`${t.kind} table has no ${c.missing} column`);
      const cols = map ? Object.fromEntries(Object.entries(c.cols).map(([f, real]) => [f, map[real!]])) : c.cols;
      out.push(...tally(t.kind, await datastoreSql<Raw>(groupSql(t.kind, t.resourceId, cols, first ? Number(first._id) : undefined))));
    }
    return { rows: out, missing: KINDS.filter((k) => !tables.some((t) => t.kind === k)) };
  }
  const url = dataZip(files);
  if (!url) throw new Error("no person tables or data ZIP in the package");
  const res = await fetchWithTimeout(url, {}, ZIP_TIMEOUT_MS);
  if (!res.ok) throw new Error(`ZIP download failed: ${res.status}`);
  // CSV files only: the 2024 ZIPs also carry an Excel copy of every table.
  const base = (n: string) => n.split("/").pop() ?? "";
  const entries = unzipSync(new Uint8Array(await res.arrayBuffer()), { filter: (f) => /\.csv$/i.test(f.name) && kindOfTable(base(f.name)) !== null });
  const missing: StopKind[] = [];
  for (const kind of KINDS) {
    const name = Object.keys(entries).find((n) => kindOfTable(base(n)) === kind);
    if (!name) { missing.push(kind); continue; }
    const c = countCsv(kind, strFromU8(entries[name]));
    if (!c.ok) throw new Error(`${kind} table has no ${c.missing} column`);
    out.push(...c.rows);
  }
  if (missing.length === KINDS.length) throw new Error("no person tables in the City's ZIP");
  return { rows: out, missing };
}

// Weekly (build.finish) or alone: `npx convex run stops:refreshStops`. Notes, never throws. Published quarters don't
// change, so a package already counted from the same catalog version is skipped; a failed one is retried.
export const refreshStops = internalAction({
  args: {},
  handler: async (ctx): Promise<string[]> => {
    const notes: string[] = [];
    const done = new Map((await ctx.runQuery(internal.stops.stopStatus, {})).map((s) => [s.period, s]));
    for (const pkg of await ctx.runQuery(internal.stops.stopPackages, {})) {
      const p = periodOf(pkg.title);
      if (!p) { notes.push(`Stops: "${pkg.title}" isn't a quarter title; skipped`); continue; }
      const prev = done.get(p.period);
      if (prev?.status === "counted" && prev.modified === pkg.modified) continue;
      try {
        const { rows, missing } = await countPackage(pkg.files);
        await ctx.runMutation(internal.stops.replacePeriod, { period: p.period, year: p.year, familyKey: pkg.familyKey, modified: pkg.modified, rows, missing });
        if (missing.length) notes.push(`Stops ${p.period}: no ${missing.join(", ")} table in the City's file; counted the others`);
      } catch (e) {
        notes.push(`Stops ${p.period}: ${message(e)}; kept any earlier counts`);
        await ctx.runMutation(internal.stops.markFailed, { period: p.period, familyKey: pkg.familyKey, modified: pkg.modified, note: message(e) });
      }
    }
    return notes;
  },
});

const vYesNoAsk = v.union(v.literal("yes"), v.literal("no"));
// Ask's countStops: the stored counts, filtered and grouped by code. Public: counts of people, no City request.
export const countStops = query({
  args: {
    kind: v.optional(v.union(v.literal("traffic"), v.literal("field-interview"), v.literal("no-action"), v.literal("all"))),
    from: v.optional(v.string()), to: v.optional(v.string()),
    filters: v.optional(v.object({ race: v.optional(v.array(v.string())), sex: v.optional(v.array(v.string())), frisked: v.optional(vYesNoAsk), searched: v.optional(vYesNoAsk), found: v.optional(v.array(v.string())) })),
    groupBy: v.optional(v.union(v.literal("year"), v.literal("quarter"), v.literal("race"), v.literal("sex"), v.literal("kind"), v.literal("found"))),
  },
  handler: async (ctx, args): Promise<StopsResult> => {
    const rows = (await ctx.db.query("stopCounts").collect()).map(({ _id, _creationTime, ...r }) => r);
    const periods = (await ctx.db.query("stopPeriods").collect()).map(({ period, status, missing }) => ({ period, status, missing }));
    return summarize(rows, periods, args);
  },
});
