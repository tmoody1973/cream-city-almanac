import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalMutation, internalQuery, query } from "./_generated/server";
import { runCount, type CountResult } from "./city";
import { chicagoDay } from "./lib/ask";
import { hashInputs } from "./lib/hash";
import { nameKey } from "./lib/neighborhoodNames";
import { rateLimiter } from "./limits";

const TTL_MS = 10 * 60_000;
const vFilter = v.object({ column: v.string(), values: v.array(v.string()) });

// The sheet's map: anyone can use it. Identical requests (same day) come from the cache; new ones spend the
// site-wide City budget. Same logic, refusals and privacy as Ask's count — cells only, never coordinates.
export const mapCells = action({
  args: { code: v.string(), from: v.optional(v.string()), to: v.optional(v.string()), filters: v.optional(v.array(vFilter)), neighborhood: v.optional(v.string()) },
  handler: async (ctx, args): Promise<CountResult> => {
    const input = {
      code: args.code.trim().toUpperCase(),
      from: args.from || undefined,
      to: args.to || undefined,
      filters: (args.filters ?? []).map((f) => ({ column: f.column, values: [...f.values].sort() })).sort((a, b) => a.column.localeCompare(b.column)),
      neighborhood: args.neighborhood?.trim() ? nameKey(args.neighborhood) : undefined,
    };
    const key = await hashInputs({ ...input, day: chicagoDay(Date.now()) });
    const hit: string | null = await ctx.runQuery(internal.map.cached, { key, now: Date.now() });
    if (hit) return JSON.parse(hit) as CountResult;
    if (!(await rateLimiter.limit(ctx, "mapCity")).ok) return { status: "busy" as const };
    const result = await runCount(ctx, { ...input, neighborhood: args.neighborhood });
    if (result.status !== "unavailable" && result.status !== "busy") {
      await ctx.runMutation(internal.map.remember, { key, result: JSON.stringify(result), expiresAt: Date.now() + TTL_MS });
    }
    return result;
  },
});

export const cached = internalQuery({
  args: { key: v.string(), now: v.number() },
  handler: async (ctx, { key, now }) => {
    const row = await ctx.db.query("mapCache").withIndex("by_key", (q) => q.eq("key", key)).first();
    return row && row.expiresAt > now ? row.result : null;
  },
});

// Stores one answer and drops a few expired ones, so the table never grows past a day's worth of distinct maps.
export const remember = internalMutation({
  args: { key: v.string(), result: v.string(), expiresAt: v.number() },
  handler: async (ctx, row) => {
    const old = await ctx.db.query("mapCache").withIndex("by_key", (q) => q.eq("key", row.key)).first();
    if (old) await ctx.db.replace(old._id, row);
    else await ctx.db.insert("mapCache", row);
    for (const stale of await ctx.db.query("mapCache").withIndex("by_expires", (q) => q.lt("expiresAt", Date.now())).take(20)) await ctx.db.delete(stale._id);
  },
});

export const cityShape = query({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const row = await ctx.db.query("neighborhoods").withIndex("by_definition_matchKey", (q) => q.eq("definition", "city").eq("matchKey", nameKey(name))).first();
    return row?.geometry && row.bbox ? { name: row.name, geometry: row.geometry, bbox: row.bbox } : null;
  },
});

export const cityNeighborhoodNames = query({
  args: {},
  handler: async (ctx) =>
    (await ctx.db.query("neighborhoods").withIndex("by_definition_matchKey", (q) => q.eq("definition", "city")).collect()).map((r) => r.name).sort(),
});
