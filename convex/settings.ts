import { v } from "convex/values";
import { internalMutation, internalQuery, type QueryCtx } from "./_generated/server";

export const DEFAULT_SETTINGS = {
  buildCapUsd: 5,
  maxFirecrawlCallsPerRun: 250,
  firecrawlSpacingMs: 7000, // Firecrawl Free allows 10 scrapes/min; 7s keeps us near 8.5/min
  sourceRefreshDays: 30,
  cardModel: "anthropic/claude-sonnet-5.5",
  embedModel: "openai/text-embedding-3-small",
  cardInputUsdPerToken: 0.000002,
  cardOutputUsdPerToken: 0.00001,
  embedUsdPerToken: 0.00000002,
};

export type Settings = typeof DEFAULT_SETTINGS;

export async function readSettings(ctx: QueryCtx): Promise<Settings> {
  const row = await ctx.db.query("settings").first();
  if (!row) return DEFAULT_SETTINGS;
  const { _id, _creationTime, ...settings } = row;
  return settings;
}

export const get = internalQuery({ args: {}, handler: (ctx) => readSettings(ctx) });

export const ensureDefaults = internalMutation({
  args: {},
  handler: async (ctx) => {
    const row = await ctx.db.query("settings").first();
    if (!row) await ctx.db.insert("settings", DEFAULT_SETTINGS);
  },
});

// Change settings without a redeploy: npx convex run settings:update '{"firecrawlSpacingMs":7000}'
export const update = internalMutation({
  args: {
    buildCapUsd: v.optional(v.number()),
    maxFirecrawlCallsPerRun: v.optional(v.number()),
    firecrawlSpacingMs: v.optional(v.number()),
    sourceRefreshDays: v.optional(v.number()),
    cardModel: v.optional(v.string()),
    embedModel: v.optional(v.string()),
    cardInputUsdPerToken: v.optional(v.number()),
    cardOutputUsdPerToken: v.optional(v.number()),
    embedUsdPerToken: v.optional(v.number()),
  },
  handler: async (ctx, changes) => {
    const defined = Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== undefined));
    const row = await ctx.db.query("settings").first();
    if (row) await ctx.db.patch(row._id, defined);
    else await ctx.db.insert("settings", { ...DEFAULT_SETTINGS, ...defined });
  },
});
