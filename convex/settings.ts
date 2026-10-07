import { internalMutation, internalQuery, type QueryCtx } from "./_generated/server";

export const DEFAULT_SETTINGS = {
  buildCapUsd: 5,
  maxFirecrawlCallsPerRun: 250,
  firecrawlSpacingMs: 3000,
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
