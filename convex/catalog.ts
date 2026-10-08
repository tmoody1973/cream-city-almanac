import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { query, type QueryCtx } from "./_generated/server";
import { pdfUrl } from "./lib/arcgis";
import { isPdfFamily, isSpreadsheetFamily } from "./lib/families";
import { placeYearGrid } from "./lib/grid";
import { matchSources } from "./lib/sources";
import { rundownRows, toRow } from "./search";
import { placeKey } from "./lib/portrait";

const MAX_CODE_CHARS = 8;
const newestFirst = (a: Doc<"members">, b: Doc<"members">) => b.modified.localeCompare(a.modified);

async function familyMembers(ctx: QueryCtx, key: string) {
  return (await ctx.db.query("members").withIndex("by_family", (q) => q.eq("familyKey", key)).collect()).sort(newestFirst);
}

async function familyCard(ctx: QueryCtx, key: string) {
  return ctx.db.query("cards").withIndex("by_family", (q) => q.eq("familyKey", key)).first();
}

export const rundown = query({ args: {}, handler: (ctx) => rundownRows(ctx) });

type MemberDoc = Doc<"members">;

const tableView = ({ _id, _creationTime, hubId, modified, ...rest }: Doc<"portraitTables">) => rest;

async function tablesFor(ctx: QueryCtx, hubId: string) {
  return (await ctx.db.query("portraitTables").withIndex("by_hubId", (q) => q.eq("hubId", hubId)).collect())
    .sort((a, b) => a.order - b.order)
    .map(tableView);
}

const newestYearFirst = (a: MemberDoc, b: MemberDoc) => (b.years[0] ?? 0) - (a.years[0] ?? 0) || newestFirst(a, b);

// Neighborhoods for the spreadsheet pickers, each file list newest year first (a re-uploaded old file stays in place).
async function portraitIndex(ctx: QueryCtx, unordered: MemberDoc[]) {
  const members = [...unordered].sort(newestYearFirst);
  const byKey = new Map<string, { key: string; label: string; files: { hubId: string; year: number | null }[] }>();
  for (const m of members) {
    const place = m.place ?? m.title;
    const key = placeKey(place);
    const entry = byKey.get(key) ?? { key, label: place, files: [] };
    entry.files.push({ hubId: m.hubId, year: m.years[0] ?? null });
    byKey.set(key, entry);
  }
  const neighborhoods = [...byKey.values()].sort((a, b) => a.label.localeCompare(b.label));
  // Open on the newest year that has been read, so a new or failing file never becomes everyone's first view.
  for (const m of members) {
    const tables = await tablesFor(ctx, m.hubId);
    if (tables.length) return { neighborhoods, initial: { hubId: m.hubId, tables } };
  }
  return { neighborhoods, initial: members[0] ? { hubId: members[0].hubId, tables: [] } : null };
}

const START_HERE = {
  asthma: "dataset:asthma-prevalence",
  housing: "dataset:housing-built-before-1950",
  air: "dataset:daily-air-quality",
  spreadsheets: "document:neighborhood-portrait-spreadsheet",
  place: "harambee",
  topic: "poverty-status-by-age",
} as const;

async function familyWithCard(ctx: QueryCtx, key: string) {
  const family = await ctx.db.query("families").withIndex("by_key", (q) => q.eq("key", key)).first();
  return family ? { family, card: await familyCard(ctx, key), members: await familyMembers(ctx, key) } : null;
}

// The newest neighborhood file that has the topic's table (a new or failing file never becomes the example).
async function neighborhoodTable(ctx: QueryCtx, place: string, topic: string) {
  const files = (await familyMembers(ctx, START_HERE.spreadsheets)).filter((m) => placeKey(m.place ?? m.title) === place).sort(newestYearFirst);
  for (const m of files) {
    const table = (await tablesFor(ctx, m.hubId)).find((t) => t.slug === topic);
    if (table) return { place: m.place ?? m.title, year: m.years[0] ?? null, table };
  }
  return null;
}

// Everything the Start here page shows, read live; a missing piece comes back null, never invented.
export const startHere = query({
  args: {},
  handler: async (ctx) => {
    const [asthma, housing, air] = await Promise.all([START_HERE.asthma, START_HERE.housing, START_HERE.air].map((k) => familyWithCard(ctx, k)));
    const pages = (await ctx.db.query("families").collect()).filter((f) => f.kind === "page").sort((a, b) => a.code.localeCompare(b.code));
    const guides = await Promise.all(
      pages.map(async (f) => ({ code: f.code, name: f.name, url: (await familyMembers(ctx, f.key))[0]?.landingPage ?? null })),
    );
    return {
      reporter: {
        asthma: asthma && { code: asthma.family.code, name: asthma.family.name, caveat: asthma.card?.caveats[0] ?? null },
        housing: housing && { code: housing.family.code, name: housing.family.name, angles: housing.card?.storyAngles.slice(0, 2) ?? [] },
      },
      nonprofit: await neighborhoodTable(ctx, START_HERE.place, START_HERE.topic),
      resident: air && {
        code: air.family.code,
        name: air.family.name,
        members: air.members.map((m) => ({ place: m.place, yearLabel: m.yearLabel, featureServerUrl: m.featureServerUrl })),
        fields: air.card?.glossary.map((g) => g.field) ?? [],
        caveat: air.card?.caveats[0] ?? null,
      },
      guides,
    };
  },
});

export const portraitTables = query({
  args: { hubId: v.string() },
  handler: (ctx, { hubId }) => tablesFor(ctx, hubId),
});

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
      portraits: isSpreadsheetFamily(family) ? await portraitIndex(ctx, members) : null,
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
      kind: family.kind,
      // DYCU's guide pages explain the Hub; their preview links out instead of describing data.
      guideUrl: family.kind === "page" ? (members[0]?.landingPage ?? null) : null,
    };
  },
});
