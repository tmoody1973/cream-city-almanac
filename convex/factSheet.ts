import { v } from "convex/values";
import { internalQuery, query, type QueryCtx } from "./_generated/server";
import { tablesFor } from "./catalog";
import { areaSlug, FACTS, headline, neighborhoodFigure, tractGeoid, type PortraitTable } from "./lib/factSheet";
import { matchName, nameKey } from "./lib/neighborhoodNames";
import { placeKey } from "./lib/portrait";
import { newestCountyUrl } from "./lib/tractPlaces";

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

const N03 = "document:neighborhood-portrait-spreadsheet";
const CARD_FACTS = ["poverty", "rent-burden", "no-car"];

// DYCU's profiled areas: every portrait member with a place, newest year first per area.
async function areas(ctx: QueryCtx) {
  const members = await ctx.db.query("members").withIndex("by_family", (q) => q.eq("familyKey", N03)).collect();
  // One area per placeKey: DYCU spells some areas differently by year ("Silver City, Burnham Park, and Layton Park" in
  // 2021, "Silver City, Layton Park, and Burnham Park" after). The newest file's spelling names it; every spelling's slug opens it.
  const by = new Map<string, typeof members>();
  for (const m of members) if (m.place) by.set(placeKey(m.place), [...(by.get(placeKey(m.place)) ?? []), m]);
  return [...by.values()].map((ms) => {
    const sorted = ms.sort((a, b) => (b.years[0] ?? 0) - (a.years[0] ?? 0));
    const name = sorted[0].place as string;
    return { name, slug: areaSlug(name), slugs: [...new Set(sorted.map((m) => areaSlug(m.place as string)))], members: sorted };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

async function tractMap(ctx: QueryCtx, name: string, year: number) {
  const def = await ctx.db.query("neighborhoods").withIndex("by_definition_matchKey", (q) => q.eq("definition", "dycu").eq("matchKey", placeKey(name))).first();
  const tracts = (def?.tracts ?? []).filter((e) => e.years.includes(year)).flatMap((e) => e.tracts);
  const e02 = await ctx.db.query("families").withIndex("by_code", (q) => q.eq("code", "E02")).first();
  const ms = e02 ? await ctx.db.query("members").withIndex("by_family", (q) => q.eq("familyKey", e02.key)).collect() : [];
  const url = newestCountyUrl(ms.filter((m) => m.featureServerUrl && m.place).map((m) => ({ place: m.place as string, year: m.yearLabel ?? String(m.years[0] ?? ""), url: m.featureServerUrl as string })));
  return url && tracts.length ? { url, geoids: tracts.map(tractGeoid) } : null;
}

async function assemble(ctx: QueryCtx, area: Awaited<ReturnType<typeof areas>>[number], year?: number) {
  const withTables = [];
  for (const m of area.members) if ((await tablesFor(ctx, m.hubId)).length) withTables.push(m);
  const pick = withTables.find((m) => m.years[0] === year) ?? withTables[0];
  if (!pick) return null;
  const y = pick.years[0];
  const tables = (await tablesFor(ctx, pick.hubId)) as unknown as PortraitTable[];
  const city = await ctx.db.query("cityFigures").withIndex("by_period", (q) => q.eq("period", y)).first();
  return {
    status: "ok" as const, slug: area.slug, name: area.name, year: y, years: withTables.map((m) => m.years[0]), period: `${y - 4}–${y}`,
    headlines: FACTS.map((f) => headline(f, tables, city?.values)), tables,
    source: { title: pick.title, landingPage: pick.landingPage }, map: await tractMap(ctx, area.name, y), cityFetchedAt: city?.fetchedAt ?? null,
  };
}

export const sheet = query({
  args: { slug: v.string(), year: v.optional(v.number()) },
  handler: async (ctx, { slug, year }) => {
    const all = await areas(ctx);
    const asked = slug.trim().toLowerCase();
    const area = all.find((a) => a.slugs.includes(asked));
    const got = area ? await assemble(ctx, area, year) : null;
    return got ?? { status: "not-found" as const, areas: all.map(({ slug: s, name }) => ({ slug: s, name })) };
  },
});

export const findSheet = query({
  args: { neighborhood: v.string() },
  handler: async (ctx, { neighborhood }) => {
    const all = await areas(ctx);
    const m0 = matchName(neighborhood.slice(0, 80), all.map((a) => ({ ...a, matchKey: nameKey(a.name) })));
    // A part of the name ("Silver City") that fits only one area is that area.
    const words = m0.kind === "choose" && m0.names.length === 1 ? nameKey(m0.names[0]).split(" ") : [];
    const fits = words.length > 0 && nameKey(neighborhood).split(" ").every((w) => words.includes(w)); // whole words only: "Harambe" is a typo, not a part
    const m = fits && m0.kind === "choose" ? { kind: "one" as const, row: all.find((a) => a.name === m0.names[0])! } : m0;
    if (m.kind !== "one") return { status: "no-neighborhood" as const, asked: neighborhood.slice(0, 80), nearest: m0.kind === "choose" ? m0.names.slice(0, 3) : m0.kind === "none" ? m0.nearest : [] };
    const got = await assemble(ctx, m.row);
    if (!got) return { status: "no-neighborhood" as const, asked: neighborhood.slice(0, 80), nearest: [] };
    return { status: "ok" as const, slug: got.slug, name: got.name, year: got.year, period: got.period, headlines: got.headlines.filter((h) => CARD_FACTS.includes(h.id)) };
  },
});
