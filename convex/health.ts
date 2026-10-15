import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, query } from "./_generated/server";
import { CITY_GEO, COUNTY_GEO, HC_API, HC_HEADERS, parseDataPage, modalPeriods, parseTopicsPage, pickFigures, placeUrl, type HealthFigure, type HealthLayer, type HealthTopic, type RawRow } from "./lib/healthCompass";
import { answer, type HealthArgs, type HealthResult } from "./lib/healthAnswer";
import { fetchWithTimeout } from "./lib/http";
import { COUNTY_ZIPS } from "./lib/zips";
import { vHealthFigure, vHealthLayer, vHealthTopic } from "./validators";

// Health Compass Milwaukee, stored weekly (spec 2026-10-15-zip-health §3.1). One request per place, a second apart.
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const HC_TIMEOUT_MS = 30_000;
// Well inside an action's 10 minutes, so a slow Health Compass ends in a noted failure, never a killed run.
const DEADLINE_MS = 5 * 60_000;
const RETRY_WAITS_MS = [2_000, 5_000];
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// A busy (429) or failing (5xx) answer is tried again after a pause; anything else fails at once.
async function getJson(url: string, waits: number[]): Promise<unknown> {
  for (let i = 0; ; i++) {
    const res = await fetchWithTimeout(url, { headers: HC_HEADERS }, HC_TIMEOUT_MS);
    if (res.ok) return res.json();
    if (i >= waits.length || !(res.status === 429 || res.status >= 500)) throw new Error(`Health Compass request failed: ${res.status}`);
    await sleep(waits[i]);
  }
}

export const replaceHealth = internalMutation({
  args: { topics: v.array(vHealthTopic), places: v.array(v.object({ layer: vHealthLayer, geo: v.string(), figures: v.array(vHealthFigure) })), at: v.number() },
  handler: async (ctx, { topics, places, at }) => {
    for (const r of await ctx.db.query("healthTopics").collect()) await ctx.db.delete(r._id);
    for (const r of await ctx.db.query("healthPlaces").collect()) await ctx.db.delete(r._id);
    for (const t of topics) await ctx.db.insert("healthTopics", t);
    for (const p of places) await ctx.db.insert("healthPlaces", p);
    const old = await ctx.db.query("healthRefresh").first();
    const row = { status: "read" as const, at, places: places.length };
    if (old) await ctx.db.replace(old._id, row);
    else await ctx.db.insert("healthRefresh", row);
  },
});

// A failed run keeps the stored copy and its date; only the status and the reason change.
export const markHealthFailed = internalMutation({
  args: { note: v.string() },
  handler: async (ctx, { note }) => {
    const old = await ctx.db.query("healthRefresh").first();
    const places = (await ctx.db.query("healthPlaces").collect()).length;
    if (old) await ctx.db.replace(old._id, { status: "failed", note, at: old.at, places });
    else await ctx.db.insert("healthRefresh", { status: "failed", note, at: 0, places });
  },
});

// Weekly (build.finish) or alone: `npx convex run health:refreshHealth`. Notes, never throws.
export const refreshHealth = internalAction({
  args: { paceMs: v.optional(v.number()), deadlineMs: v.optional(v.number()) },
  handler: async (ctx, { paceMs = 1_000, deadlineMs = DEADLINE_MS }): Promise<string[]> => {
    const waits = paceMs === 0 ? [0, 0] : RETRY_WAITS_MS;
    const stopAt = Date.now() + deadlineMs;
    const inTime = () => { if (Date.now() >= stopAt) throw new Error("Health Compass took too long; stopped at the deadline"); };
    try {
      const topics: HealthTopic[] = [];
      let url: string | null = `${HC_API}/topics/?limit=500`;
      for (let page = 0; url && page < 20; page++) {
        const p = parseTopicsPage(await getJson(url, waits));
        topics.push(...p.topics);
        url = p.next;
      }
      if (!topics.length) throw new Error("Health Compass listed no topics"); // before 39 paced place requests
      const targets: { layer: HealthLayer; geo: string }[] = [
        ...Object.keys(COUNTY_ZIPS).map((geo) => ({ layer: "zip" as const, geo })),
        { layer: "county", geo: COUNTY_GEO },
        { layer: "place", geo: CITY_GEO },
      ];
      const raw: { layer: HealthLayer; geo: string; rows: RawRow[] }[] = [];
      for (const t of targets) {
        inTime();
        raw.push({ ...t, rows: parseDataPage(await getJson(placeUrl(t.layer, t.geo), waits)) });
        await sleep(paceMs);
      }
      // ZIPs first; the county and city then take each topic's most common ZIP period when they have it.
      const zipFigures = raw.filter((p) => p.layer === "zip").map((p) => ({ layer: p.layer, geo: p.geo, figures: pickFigures(p.rows) }));
      const prefer = modalPeriods(zipFigures.flatMap((p) => p.figures));
      const places: { layer: HealthLayer; geo: string; figures: HealthFigure[] }[] = [
        ...zipFigures,
        ...raw.filter((p) => p.layer !== "zip").map((p) => ({ layer: p.layer, geo: p.geo, figures: pickFigures(p.rows, prefer) })),
      ];
      const onZips = new Set(places.filter((p) => p.layer === "zip").flatMap((p) => p.figures.map((f) => f.topic)));
      const kept = topics.filter((t) => onZips.has(t.key));
      if (!kept.length) throw new Error("no topic had a ZIP figure");
      const keys = new Set(kept.map((t) => t.key));
      await ctx.runMutation(internal.health.replaceHealth, { topics: kept, places: places.map((p) => ({ ...p, figures: p.figures.filter((f) => keys.has(f.topic)) })), at: Date.now() });
      return [];
    } catch (e) {
      await ctx.runMutation(internal.health.markHealthFailed, { note: message(e) });
      return [`Health Compass refresh failed, kept last week's: ${message(e)}`];
    }
  },
});

const vMode = v.union(v.literal("one"), v.literal("rank"), v.literal("together"), v.literal("mismatch"));
const vSide = v.union(v.literal("high"), v.literal("low"));

// Ask's zipHealth: the stored copy, answered by code. Public: area figures only, no outside request.
export const zipHealth = query({
  args: { mode: vMode, measure: v.string(), zip: v.optional(v.string()), direction: v.optional(vSide), side: v.optional(vSide), other: v.optional(v.string()), otherSide: v.optional(vSide) },
  handler: async (ctx, a): Promise<HealthResult> => {
    const strip = <T extends { _id: unknown; _creationTime: unknown }>({ _id, _creationTime, ...rest }: T) => rest;
    const topics = (await ctx.db.query("healthTopics").collect()).map(strip);
    const places = (await ctx.db.query("healthPlaces").collect()).map(strip);
    const hoods = Object.fromEntries((await ctx.db.query("zipNeighborhoods").collect()).map((r) => [r.zip, r.city.map((c) => c.name)]));
    const refresh = await ctx.db.query("healthRefresh").first();
    return answer(a as HealthArgs, { topics, places, hoods, asOf: refresh && refresh.at > 0 ? refresh.at : null });
  },
});
