import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery, query } from "./_generated/server";
import { datastoreFields, datastoreSql } from "./lib/ckan";
import { fetchWithTimeout } from "./lib/http";
import { checked, ELECTIONS, readReport, readSheet, readTableRows, sourceFile, tableSql, turnoutColumns, type Election, type Read } from "./lib/turnout";
import { summarize, type TurnoutResult } from "./lib/turnoutMath";
import { readWorkbook } from "./lib/xlsx";

// Milwaukee's per-ward turnout, 2016–2022, as stored public totals (spec 2026-10-13-turnout-design §4–5).
const DOWNLOAD_TIMEOUT_MS = 30_000;
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const vType = v.union(v.literal("spring"), v.literal("primary"), v.literal("general"));

export const electionSources = internalQuery({
  args: {},
  handler: async (ctx) => {
    const out: { key: string; modified: string; members: { title: string; files: { name: string; format: string; url: string }[] }[] }[] = [];
    for (const e of ELECTIONS) {
      const ms = await ctx.db.query("members").withIndex("by_family", (q) => q.eq("familyKey", e.familyKey)).collect();
      out.push({ key: e.key, modified: ms.map((m) => m.modified).sort().at(-1) ?? "", members: ms.map((m) => ({ title: m.title, files: (m.files ?? []).map(({ name, format, url }) => ({ name, format, url })) })) });
    }
    return out;
  },
});

export const electionStatus = internalQuery({
  args: {},
  handler: async (ctx) => (await ctx.db.query("elections").collect()).map(({ election, modified, status }) => ({ election, modified, status })),
});

const meta = (e: Election) => ({ election: e.key, label: e.label, type: e.type, map: e.map, of: e.wards });
export const replaceElection = internalMutation({
  args: { election: v.string(), modified: v.string(), wards: v.array(v.object({ ward: v.number(), registered: v.number(), ballots: v.number() })), partial: v.boolean() },
  handler: async (ctx, { election, modified, wards, partial }) => {
    const e = ELECTIONS.find((x) => x.key === election)!;
    for (const old of await ctx.db.query("turnout").withIndex("by_election", (q) => q.eq("election", election)).collect()) await ctx.db.delete(old._id);
    for (const w of wards) await ctx.db.insert("turnout", { election, ...w });
    const row = { ...meta(e), wards: wards.length, partial, modified, status: "read" as const };
    const old = await ctx.db.query("elections").withIndex("by_election", (q) => q.eq("election", election)).first();
    if (old) await ctx.db.replace(old._id, row); else await ctx.db.insert("elections", row);
  },
});

// A failed election keeps its earlier rows and counts; its status says failed, so the next run retries it.
export const markElectionFailed = internalMutation({
  args: { election: v.string(), modified: v.string(), note: v.string() },
  handler: async (ctx, { election, modified, note }) => {
    const e = ELECTIONS.find((x) => x.key === election)!;
    const old = await ctx.db.query("elections").withIndex("by_election", (q) => q.eq("election", election)).first();
    const row = { ...meta(e), wards: old?.wards ?? 0, partial: old?.partial ?? false, modified, status: "failed" as const, note };
    if (old) await ctx.db.replace(old._id, row); else await ctx.db.insert("elections", row);
  },
});

async function download(url: string): Promise<Response> {
  if (!url.startsWith("https://data.milwaukee.gov/")) throw new Error("not a City link");
  const res = await fetchWithTimeout(url, {}, DOWNLOAD_TIMEOUT_MS);
  if (!res.ok) throw new Error(`download failed: ${res.status}`);
  return res;
}

async function readElection(e: Election, src: { url: string; resourceId: string | null }): Promise<Read> {
  if (e.reader === "table") {
    if (!src.resourceId) return { ok: false, why: "the file's link has no id" };
    const c = turnoutColumns((await datastoreFields(src.resourceId)).map((f) => f.id));
    if (!c.ok) return { ok: false, why: `no ${c.missing} column` };
    return readTableRows(await datastoreSql<{ ward: unknown; reg: unknown; bal: unknown }>(tableSql(src.resourceId, c)));
  }
  const res = await download(src.url);
  if (e.reader === "report") return readReport(await res.text());
  const sheet = readWorkbook(new Uint8Array(await res.arrayBuffer())).find((s) => s.name.trim().toLowerCase() === "general turnout");
  return sheet ? readSheet(sheet.rows) : { ok: false, why: "no General Turnout sheet" };
}

// Weekly (build.finish) or alone: `npx convex run elections:refreshTurnout`. Notes, never throws. An election is read
// once and skipped while its catalog entry is unchanged; a failure keeps earlier rows and is retried next time.
export const refreshTurnout = internalAction({
  args: {},
  handler: async (ctx): Promise<string[]> => {
    const notes: string[] = [];
    const done = new Map((await ctx.runQuery(internal.elections.electionStatus, {})).map((s) => [s.election, s]));
    for (const s of await ctx.runQuery(internal.elections.electionSources, {})) {
      const e = ELECTIONS.find((x) => x.key === s.key)!;
      const prev = done.get(e.key);
      if (prev?.status === "read" && prev.modified === s.modified) continue;
      const src = sourceFile(e, s.members);
      if (!src) { notes.push(`Turnout ${e.label}: no turnout file in the catalog`); continue; }
      try {
        const c = checked(e, await readElection(e, src));
        if (!c.ok) throw new Error(c.why);
        await ctx.runMutation(internal.elections.replaceElection, { election: e.key, modified: s.modified, wards: c.wards, partial: c.partial });
      } catch (err) {
        notes.push(`Turnout ${e.label}: ${message(err)}; kept any earlier rows`);
        await ctx.runMutation(internal.elections.markElectionFailed, { election: e.key, modified: s.modified, note: message(err) });
      }
    }
    return notes;
  },
});

// Ask's countTurnout: the stored rows, by code. Public: city vote totals, no City request.
export const countTurnout = query({
  args: {
    type: v.optional(v.union(vType, v.literal("all"))), from: v.optional(v.number()), to: v.optional(v.number()), ward: v.optional(v.number()),
    groupBy: v.optional(v.union(v.literal("election"), v.literal("ward"))), order: v.optional(v.union(v.literal("lowest"), v.literal("highest"))),
  },
  handler: async (ctx, args): Promise<TurnoutResult> => {
    const rows = (await ctx.db.query("turnout").collect()).map(({ election, ward, registered, ballots }) => ({ election, ward, registered, ballots }));
    const elections = (await ctx.db.query("elections").collect()).map(({ election, label, type, map, wards, of, partial, status }) => ({ election, label, type, map, wards, of, partial, status }));
    return summarize(rows, elections, args);
  },
});
