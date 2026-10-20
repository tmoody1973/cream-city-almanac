import { v } from "convex/values";
import { internalQuery, query, type QueryCtx } from "./_generated/server";
import { tablesFor } from "./catalog";
import { areaSlug, FACTS, headline, neighborhoodFigure, tractGeoid, type PortraitTable } from "./lib/factSheet";
import { areaInText, matchName, nameKey } from "./lib/neighborhoodNames";
import { placeKey } from "./lib/portrait";
import { newestCountyUrl } from "./lib/tractPlaces";
import { buildCityFigures, type Piece } from "./lib/cityFactSheet";
import type { Est } from "./lib/factMath";
import { tractNumber } from "./lib/tractData";

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
export async function portraitAreas(ctx: QueryCtx) {
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

async function countyTractUrl(ctx: QueryCtx) {
  const e02 = await ctx.db.query("families").withIndex("by_code", (q) => q.eq("code", "E02")).first();
  const ms = e02 ? await ctx.db.query("members").withIndex("by_family", (q) => q.eq("familyKey", e02.key)).collect() : [];
  return newestCountyUrl(ms.filter((m) => m.featureServerUrl && m.place).map((m) => ({ place: m.place as string, year: m.yearLabel ?? String(m.years[0] ?? ""), url: m.featureServerUrl as string })));
}

async function tractMap(ctx: QueryCtx, name: string, year: number) {
  const def = await ctx.db.query("neighborhoods").withIndex("by_definition_matchKey", (q) => q.eq("definition", "dycu").eq("matchKey", placeKey(name))).first();
  const tracts = (def?.tracts ?? []).filter((e) => e.years.includes(year)).flatMap((e) => e.tracts);
  const url = await countyTractUrl(ctx);
  return url && tracts.length ? { url, geoids: tracts.map(tractGeoid) } : null;
}

// Each City neighborhood's tract pieces, from one read of the small tract table (never the neighborhoods' shapes, which
// are megabytes: reading all of them on every sheet or search keystroke ran past Convex's 16 MB read limit).
async function piecesByName(ctx: QueryCtx): Promise<Map<string, Piece[]>> {
  const by = new Map<string, Piece[]>();
  for (const r of await ctx.db.query("tractNeighborhoods").collect()) for (const p of r.pieces ?? []) by.set(p.name, [...(by.get(p.name) ?? []), { geoid: r.geoid, share: p.share }]);
  for (const ps of by.values()) ps.sort((a, b) => b.share - a.share);
  return by;
}
// ponytail: names from tract pieces, so a City neighborhood touching no tract by 1%+ (no residents) isn't listed; its page still opens.
const cityNames = async (ctx: QueryCtx) => [...(await piecesByName(ctx)).keys()];

// DYCU areas whose newest tract list holds every tract a City neighborhood touches ("Arlington Heights" → "United Community").
// DYCU's reports name tracts, not City neighborhoods, so this is the only honest link between the two; partial overlaps aren't named.
async function dycuHolding(ctx: QueryCtx, pieces: Piece[], all: Awaited<ReturnType<typeof portraitAreas>>) {
  if (!pieces.length) return [];
  const rows = await ctx.db.query("neighborhoods").withIndex("by_definition_matchKey", (q) => q.eq("definition", "dycu")).collect();
  return rows.flatMap((r) => {
    const newest = [...(r.tracts ?? [])].sort((x, y) => Math.max(0, ...y.years) - Math.max(0, ...x.years))[0];
    const held = new Set((newest?.tracts ?? []).map(tractGeoid));
    const area = all.find((a) => placeKey(a.name) === r.matchKey);
    return area && pieces.every((p) => held.has(p.geoid)) ? [{ slug: area.slug, name: area.name }] : [];
  });
}

// A City neighborhood DYCU doesn't profile, built from census tracts (spec 2026-10-16-city-neighborhood-fact-sheets §5–6).
// A slug's words are the name's match key ("the-valley-pigsville" → "the valley pigsville"): one indexed read.
async function cityHood(ctx: QueryCtx, slug: string) {
  const hood = await ctx.db.query("neighborhoods").withIndex("by_definition_matchKey", (q) => q.eq("definition", "city").eq("matchKey", nameKey(slug.replace(/-/g, " ")))).first();
  return hood && areaSlug(hood.name) === slug ? hood : null;
}

// Decision 054, DYCU first: a City name that is, as whole words, part of exactly one DYCU area's name ("Layton Park" in
// "Silver City, Layton Park, and Burnham Park") is that area, as Ask's findSheet already reads it.
function dycuCovering(name: string, all: Awaited<ReturnType<typeof portraitAreas>>) {
  const key = ` ${nameKey(name)} `;
  const hits = all.filter((a) => a.members.some((m) => ` ${nameKey(m.place as string)} `.includes(key)));
  return hits.length === 1 ? hits[0] : null;
}

async function citySheet(ctx: QueryCtx, slug: string, byName?: Map<string, Piece[]>) {
  const hood = await cityHood(ctx, slug);
  if (!hood) return null;
  const pieces = (byName ?? (await piecesByName(ctx))).get(hood.name) ?? [];
  const pops = new Map<string, number>();
  const values = new Map<string, Record<string, Est>>();
  let period: number | null = null;
  for (const p of pieces) {
    const pop = await ctx.db.query("tractPopulations").withIndex("by_geoid", (q) => q.eq("geoid", p.geoid)).first();
    if (pop) pops.set(p.geoid, pop.population);
    const f = await ctx.db.query("tractFigures").withIndex("by_geoid", (q) => q.eq("geoid", p.geoid)).first();
    if (f) { values.set(p.geoid, f.values); period = f.period; }
  }
  const latest = await ctx.db.query("cityFigures").withIndex("by_period").order("desc").first();
  const y = period ?? latest?.period ?? new Date().getFullYear() - 2;
  // The City column is always the tract rows' period, never a newer one.
  const city = await ctx.db.query("cityFigures").withIndex("by_period", (q) => q.eq("period", y)).first();
  const url = await countyTractUrl(ctx);
  const map = url && pieces.length ? { url, geoids: pieces.map((p) => p.geoid) } : null;
  const built = buildCityFigures(pieces, values, pops, city?.values);
  if (built.status === "small") return { status: "small" as const, slug, name: hood.name, people: built.people, tracts: pieces.map((p) => ({ number: tractNumber(p.geoid), share: p.share })), map };
  return {
    status: "ok" as const, kind: "census" as const, slug, name: hood.name, year: y, years: [] as number[], period: `${y - 4}–${y}`,
    headlines: built.headlines, tables: [], source: null, map, cityFetchedAt: city?.fetchedAt ?? null, built: { tracts: pieces.length }, loaded: period !== null,
  };
}

async function assemble(ctx: QueryCtx, area: Awaited<ReturnType<typeof portraitAreas>>[number], year?: number) {
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
    const all = await portraitAreas(ctx);
    const asked = slug.trim().toLowerCase();
    const area = all.find((a) => a.slugs.includes(asked));
    const got = area ? await assemble(ctx, area, year) : null;
    if (got) return got;
    const hood = asked ? await cityHood(ctx, asked) : null;
    const cover = hood ? dycuCovering(hood.name, all) : null;
    const covered = cover ? await assemble(ctx, cover, year) : null;
    if (covered) return covered;
    const census = asked ? await citySheet(ctx, asked) : null;
    if (census) return census;
    const dycu = new Set(all.flatMap((a) => a.slugs));
    const cityAreas = (await cityNames(ctx)).map((name) => ({ slug: areaSlug(name), name })).filter((h) => !dycu.has(h.slug) && !dycuCovering(h.name, all)).sort((a, b) => a.name.localeCompare(b.name));
    return { status: "not-found" as const, areas: all.map(({ slug: s, name }) => ({ slug: s, name })), cityAreas };
  },
});

export const findSheet = query({
  args: { neighborhood: v.string() },
  handler: async (ctx, { neighborhood }) => {
    const all = await portraitAreas(ctx);
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

// Search: the fact sheet a search names ("riverwest crime" → Riverwest), so it can lead the results.
export const areaInSearch = query({
  args: { q: v.string() },
  handler: async (ctx, { q }) => {
    const all = await portraitAreas(ctx);
    const hit = areaInText(q.slice(0, 200), all.map((a) => ({ ...a, spellings: [...new Set(a.members.map((m) => m.place as string))] })));
    if (hit) return { slug: hit.slug, name: hit.name };
    const byName = await piecesByName(ctx);
    const city = areaInText(q.slice(0, 200), [...byName.keys()].map((name) => ({ name, slug: areaSlug(name), spellings: [name] })));
    const cover = city ? dycuCovering(city.name, all) : null;
    if (cover) return { slug: cover.slug, name: cover.name };
    return city ? { slug: city.slug, name: city.name, within: await dycuHolding(ctx, byName.get(city.name) ?? [], all) } : null;
  },
});

// The real-data check (spec §8.5): every City neighborhood's people added up, how many are small, how many figures are thin.
// `npx convex run factSheet:checkCitySheets` (dev with OK; prod is Tarik's). With a name, also that neighborhood's built figures.
export const checkCitySheets = internalQuery({
  args: { name: v.optional(v.string()) },
  handler: async (ctx, { name }) => {
    const byName = await piecesByName(ctx);
    const hoods = [...byName.keys()].map((n) => ({ name: n }));
    let people = 0, small = 0, sheets = 0, thinFigures = 0;
    let built: unknown = undefined;
    for (const h of hoods) {
      const s = await citySheet(ctx, areaSlug(h.name), byName);
      if (!s) continue;
      if (s.status === "small") { small++; people += s.people; continue; }
      sheets++;
      people += s.headlines.find((x) => x.isCount)?.hood?.count.estimate ?? 0;
      thinFigures += s.headlines.filter((x) => !x.isCount && !x.hood).length;
      if (name && h.name === name) built = s.headlines.map((x) => ({ id: x.id, rate: x.hood?.rate ?? null, count: x.hood?.count ?? null }));
    }
    return { neighborhoods: hoods.length, sheets, small, people, thinFigures, built };
  },
});
