import { v } from "convex/values";
import { internal } from "./_generated/api";
import { httpAction, internalMutation, query } from "./_generated/server";
import { buildCopy, healthTargets } from "./lib/healthCompass";
import { answer, type HealthArgs, type HealthResult } from "./lib/healthAnswer";
import { vHealthFigure, vHealthLayer, vHealthTopic } from "./validators";

// Health Compass Milwaukee, stored weekly (spec 2026-10-15-zip-health §3.1; decision 050). Cloudflare in front of
// Health Compass refuses Convex's servers, so the download runs on a server it accepts (scripts/health-compass-push.py
// on Hetzner) and posts Health Compass's own answers here; this side parses, picks and stores them.
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

// Only the script, holding HEALTH_PUSH_SECRET (32+ characters), gets in. Compared in constant time, so the answer takes
// the same time however much of a guess is right.
function authorized(req: Request): boolean {
  const secret = process.env.HEALTH_PUSH_SECRET ?? "";
  const want = `Bearer ${secret}`;
  const got = req.headers.get("authorization") ?? "";
  if (secret.length < 32 || got.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= got.charCodeAt(i) ^ want.charCodeAt(i);
  return diff === 0;
}

// GET /health-compass/targets: the places to fetch, so the script keeps no copy of the ZIP list.
export const targets = httpAction(async (_ctx, req) => (authorized(req) ? json({ places: healthTargets() }) : new Response("unauthorized", { status: 401 })));

// POST /health-compass: { topics, places } stores a new week; { error } records the script's failure. Either way a
// failure keeps last week's copy and its date, and the status says why.
export const upload = httpAction(async (ctx, req) => {
  if (!authorized(req)) return new Response("unauthorized", { status: 401 });
  let body: { error?: unknown; topics?: unknown; places?: unknown };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  if (typeof body.error === "string") {
    await ctx.runMutation(internal.health.markHealthFailed, { note: `Health Compass download failed: ${body.error.slice(0, 300)}` });
    return json({ ok: false, stored: false });
  }
  try {
    const copy = buildCopy(body.topics, body.places);
    await ctx.runMutation(internal.health.replaceHealth, { ...copy, at: Date.now() });
    return json({ ok: true, places: copy.places.length, topics: copy.topics.length });
  } catch (e) {
    await ctx.runMutation(internal.health.markHealthFailed, { note: message(e) });
    return json({ ok: false, error: message(e) }, 400);
  }
});

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
export const markHealthFailed = internalMutation({
  args: { note: v.string() },
  handler: async (ctx, { note }) => {
    const old = await ctx.db.query("healthRefresh").first();
    const places = (await ctx.db.query("healthPlaces").collect()).length;
    if (old) await ctx.db.replace(old._id, { status: "failed", note, at: old.at, places });
    else await ctx.db.insert("healthRefresh", { status: "failed", note, at: 0, places });
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
