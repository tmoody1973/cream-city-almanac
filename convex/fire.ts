import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery, query, type MutationCtx } from "./_generated/server";
import { chicagoDay } from "./lib/ask";
import { datastoreSql } from "./lib/ckan";
import { summarize, type FireResult } from "./lib/fireHistory";
import { allSql, groupSql, INCIDENT_YEARS, MFD_FAMILY, mergeTypes, mfdQuery, mfdYears, parseStats, partialNote, typesSql, yearQuery, type YearQuery } from "./lib/fireYears";
import { SPAN_QUERY_TIMEOUT_MS } from "./lib/spanSql";
import { vFireGroup, vFireRow, vFireType } from "./validators";

// Fire Department calls and response times by year, as stored totals (spec 2026-10-14-fire-history §5).
type Raw = Record<string, unknown>;
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export const fireStatus = internalQuery({
  args: {},
  handler: async (ctx) => (await ctx.db.query("fireRefresh").collect()).map(({ year, status }) => ({ year, status })),
});

export const mfdResource = internalQuery({
  args: {},
  handler: async (ctx) => (await ctx.db.query("cityProfiles").withIndex("by_family", (q) => q.eq("familyKey", MFD_FAMILY)).first())?.resourceId ?? null,
});

async function setRefresh(ctx: MutationCtx, p: { year: number; status: "counted" | "failed"; note?: string; counted: number }) {
  const old = await ctx.db.query("fireRefresh").withIndex("by_year", (q) => q.eq("year", p.year)).first();
  if (old) await ctx.db.replace(old._id, p);
  else await ctx.db.insert("fireRefresh", p);
}

// A year's rows replaced in one transaction, so a reader never sees half a year.
export const replaceYear = internalMutation({
  args: { year: v.number(), rows: v.array(vFireRow), types: v.array(vFireType) },
  handler: async (ctx, { year, rows, types }) => {
    for (const old of await ctx.db.query("fireYears").withIndex("by_year", (q) => q.eq("year", year)).collect()) await ctx.db.delete(old._id);
    for (const old of await ctx.db.query("fireTypes").withIndex("by_year", (q) => q.eq("year", year)).collect()) await ctx.db.delete(old._id);
    for (const r of rows) await ctx.db.insert("fireYears", r);
    for (const x of types) await ctx.db.insert("fireTypes", { year, ...x });
    await setRefresh(ctx, { year, status: "counted", counted: Date.now() });
  },
});

// A failed year keeps its rows; its status says failed, so the next run retries it.
export const markFireFailed = internalMutation({
  args: { year: v.number(), note: v.string() },
  handler: async (ctx, { year, note }) => {
    const old = await ctx.db.query("fireRefresh").withIndex("by_year", (q) => q.eq("year", year)).first();
    await setRefresh(ctx, { year, status: "failed", note, counted: old?.counted ?? 0 });
  },
});

async function countYear(y: YearQuery, withTypes: boolean) {
  const [groups, all, types] = await Promise.all([
    datastoreSql<Raw>(groupSql(y), SPAN_QUERY_TIMEOUT_MS),
    datastoreSql<Raw>(allSql(y), SPAN_QUERY_TIMEOUT_MS),
    withTypes ? datastoreSql<Raw>(typesSql(y), SPAN_QUERY_TIMEOUT_MS) : Promise.resolve([] as Raw[]),
  ]);
  const stats = [...all, ...groups].map(parseStats);
  if (!stats.find((s) => s.group === "all")?.calls) throw new Error("no calls in the City's file");
  return { stats, types: mergeTypes(types) };
}

// Weekly (build.finish) or alone: `npx convex run fire:refreshFire` (`'{"force":true}'` re-reads 2015–2023). Notes,
// never throws. Years go one at a time, so the City's server sees at most three queries at once.
export const refreshFire = internalAction({
  args: { force: v.optional(v.boolean()) },
  handler: async (ctx, { force }): Promise<string[]> => {
    const notes: string[] = [];
    const done = new Map((await ctx.runQuery(internal.fire.fireStatus, {})).map((s) => [s.year, s.status]));
    const current = Number(chicagoDay(Date.now()).slice(0, 4));
    const jobs: { year: number; query: YearQuery; source: "incident" | "mfd"; toMinute: boolean; types: boolean }[] = INCIDENT_YEARS
      .filter((s) => force || done.get(s.year) !== "counted")
      .map((s) => ({ year: s.year, query: yearQuery(s), source: "incident", toMinute: s.toMinute, types: true }));
    const mfd = await ctx.runQuery(internal.fire.mfdResource, {});
    if (!mfd) notes.push("Fire: the MFD calls file isn't profiled; 2024 on not counted");
    else for (const year of mfdYears(current)) jobs.push({ year, query: mfdQuery(mfd, year), source: "mfd", toMinute: false, types: false });
    for (const j of jobs) {
      try {
        const { stats, types } = await countYear(j.query, j.types);
        const rows = stats.map((s) => ({ ...s, year: j.year, source: j.source, partial: partialNote(j.year, current), toMinute: j.toMinute }));
        await ctx.runMutation(internal.fire.replaceYear, { year: j.year, rows, types });
      } catch (e) {
        notes.push(`Fire ${j.year}: ${message(e)}; kept any earlier figures`);
        await ctx.runMutation(internal.fire.markFireFailed, { year: j.year, note: message(e) });
      }
    }
    return notes;
  },
});

// Ask's fireHistory: the stored years, filtered and labeled by code. Public: yearly totals, no City request.
export const fireHistory = query({
  args: { measure: v.union(v.literal("calls"), v.literal("dispatch"), v.literal("arrive")), group: v.optional(vFireGroup), type: v.optional(v.string()), from: v.optional(v.number()), to: v.optional(v.number()) },
  handler: async (ctx, a): Promise<FireResult> => {
    const rows = (await ctx.db.query("fireYears").collect()).map(({ _id, _creationTime, ...r }) => r);
    const types = (await ctx.db.query("fireTypes").collect()).map(({ _id, _creationTime, ...t }) => t);
    return summarize(rows, types, a);
  },
});
