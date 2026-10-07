import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { query, type QueryCtx } from "./_generated/server";
import { pdfUrl } from "./lib/arcgis";
import { isPdfFamily } from "./lib/families";
import { placeYearGrid } from "./lib/grid";
import { matchSources } from "./lib/sources";
import { rundownRows, toRow } from "./search";

const MAX_CODE_CHARS = 8;
const newestFirst = (a: Doc<"members">, b: Doc<"members">) => b.modified.localeCompare(a.modified);

async function familyMembers(ctx: QueryCtx, key: string) {
  return (await ctx.db.query("members").withIndex("by_family", (q) => q.eq("familyKey", key)).collect()).sort(newestFirst);
}

async function familyCard(ctx: QueryCtx, key: string) {
  return ctx.db.query("cards").withIndex("by_family", (q) => q.eq("familyKey", key)).first();
}

export const rundown = query({ args: {}, handler: (ctx) => rundownRows(ctx) });

export const familySheet = query({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const normalized = code.trim().toUpperCase().slice(0, MAX_CODE_CHARS);
    const family = await ctx.db.query("families").withIndex("by_code", (q) => q.eq("code", normalized)).first();
    if (!family) return null;
    const members = await familyMembers(ctx, family.key);
    const card = await familyCard(ctx, family.key);
    const dictionary = family.dictionaryTab
      ? await ctx.db.query("dictionaries").withIndex("by_tab", (q) => q.eq("tab", family.dictionaryTab!)).first()
      : null;
    const profiles = (await ctx.db.query("sources").collect()).map(({ name, url, summary, limits }) => ({ name, url, summary, limits }));
    return {
      family: toRow(family),
      // Reports have no Hub download links; their file is served from the item's /data URL.
      fileLabel: family.kind !== "document" ? null : isPdfFamily(family) ? "PDF" : "Spreadsheet",
      grid: placeYearGrid(members),
      members: members.map((m) => ({
        hubId: m.hubId,
        title: m.title,
        place: m.place,
        years: m.years,
        yearLabel: m.yearLabel,
        modified: m.modified,
        landingPage: m.landingPage,
        featureServerUrl: m.featureServerUrl,
        downloads: m.downloads,
        fileUrl: m.kind === "document" ? pdfUrl(m.hubId) : null,
      })),
      card: card
        ? {
            explainer: card.explainer,
            explainerProvenance: card.explainerProvenance,
            hubSummary: card.hubSummary,
            glossary: card.glossary,
            caveats: card.caveats,
            storyAngles: card.storyAngles,
            basic: card.basic,
          }
        : null,
      sources: matchSources(profiles, [dictionary?.dataSource ?? "", ...members.map((m) => m.description)].join(" ")),
    };
  },
});

export const familyPreview = query({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    const family = await ctx.db.query("families").withIndex("by_key", (q) => q.eq("key", key)).first();
    if (!family) return null;
    const members = await familyMembers(ctx, key);
    const card = await familyCard(ctx, key);
    return {
      code: family.code,
      explainer: card?.explainer ?? members[0]?.description ?? family.name,
      explainerProvenance: card ? card.explainerProvenance : ("HUB" as const),
      grid: placeYearGrid(members),
      csvUrl: members.find((m) => m.downloads.CSV)?.downloads.CSV ?? null,
    };
  },
});
