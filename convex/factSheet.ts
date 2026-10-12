import { internalQuery } from "./_generated/server";
import { FACTS, neighborhoodFigure, type PortraitTable } from "./lib/factSheet";

// Every portrait × every headline: which entries don't resolve (spec §4: drop and note, never guess). Run on dev before relying on the list.
export const checkFacts = internalQuery({
  args: {},
  handler: async (ctx) => {
    const fam = await ctx.db.query("families").withIndex("by_key", (q) => q.eq("key", "document:neighborhood-portrait-spreadsheet")).first();
    if (!fam) return { portraits: 0, missing: ["no portrait family"] };
    const members = await ctx.db.query("members").withIndex("by_family", (q) => q.eq("familyKey", fam.key)).collect();
    const missing: string[] = [];
    let portraits = 0;
    for (const m of members) {
      const tables = (await ctx.db.query("portraitTables").withIndex("by_hubId", (q) => q.eq("hubId", m.hubId)).collect()) as unknown as PortraitTable[];
      if (!tables.length) continue;
      portraits++;
      for (const f of FACTS) if (!neighborhoodFigure(f, tables)) missing.push(`${m.title}: ${f.id}`);
    }
    return { portraits, missing };
  },
});
