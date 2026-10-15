import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, type ActionCtx } from "./_generated/server";
import { fetchColumns, pdfUrl } from "./lib/arcgis";
import type { Geometry } from "./lib/geo";
import { allTractsUrl, cityShares, newestCountyUrl, parseTractShapes, type Hood } from "./lib/tractPlaces";
import { parseZipShapes, zctaUrl } from "./lib/zipPlaces";
import { COUNTY_ZIPS } from "./lib/zips";
import { BOUNDARY_KINDS, BOUNDARY_LAYERS, boundaryShares, layerUrl, parseBoundaryLayer, unionOf, type BoundaryShape } from "./lib/boundaries";
import { tractNumber } from "./lib/tractData";
import {
  assembleCard,
  basicCard,
  buildCardPrompt,
  CARD_JSON_SCHEMA,
  CARD_SYSTEM,
  cardEmbeddingText,
  cardMaxTokens,
  latestDescription,
  parseAiCard,
  PROMPT_VERSION,
  uniqueDescriptions,
  type AiCard,
} from "./lib/card";
import { ARCHIVES, cityRepresentative, groupCityItems, YEARLY } from "./lib/cityFamilies";
import { assessmentYear } from "./lib/propertyMeasures";
import { layoutOf, yearFiles, type YearFile } from "./lib/propertyYears";
import { chunkMarkdown } from "./lib/chunk";
import { fetchCityCatalog, datastoreFields, datastoreSql } from "./lib/ckan";
import { assembleProfile, isMultiValued, planProfile, profileSql, type CityProfile } from "./lib/cityProfile";
import { HUB_FEED_URL, parseDcat } from "./lib/dcat";
import { INVENTORY_XLSX_URL, isSuspectLink, mapDictionaries, readInventory, unlinkedTabs, type Inventory } from "./lib/dictionary";
import { groupItems, hubCounts, isPdfFamily, isSpreadsheetFamily, reportDelays, toFamilyInput } from "./lib/families";
import { buildDycuNeighborhoods, parseCityNeighborhoods, parseDefinitions } from "./lib/neighborhoodSources";
import { parsePortrait, portraitBuildNote, portraitPassage } from "./lib/portrait";
import { firecrawlKey, scrapeMarkdown } from "./lib/firecrawl";
import { chatJson, costUsd, embed, estimateTokens, gatewayKey } from "./lib/gateway";
import { hashInputs } from "./lib/hash";
import { fetchWithTimeout } from "./lib/http";
import { matchSources, SOURCE_JSON_SCHEMA, SOURCE_SITES, SOURCE_SYSTEM, sourceProfileSchema } from "./lib/sources";
import { fixTypos } from "./lib/titles";
import type { Card, Column, Family, FamilyInput, Mismatch } from "./lib/types";
import { retryOnConflict } from "./lib/retry";
import { STALE_BUILD_MS } from "./buildStore";
import type { Settings } from "./settings";

type Outcome = "done" | "skipped" | "failed";
interface Result {
  outcome: Outcome;
  note?: string;
}

const MAX_CHUNKS_PER_REPORT = 60;
const SOURCE_FETCH_TIMEOUT_MS = 60_000;
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export const processFamily = internalAction({
  args: { buildId: v.id("builds"), familyKey: v.string() },
  handler: async (ctx, { buildId, familyKey }) => {
    let result: Result;
    const notes: string[] = [];
    try {
      result = await writeCard(ctx, buildId, familyKey, notes);
    } catch (e) {
      result = { outcome: "failed", note: `${familyKey}: ${message(e)}` };
    }
    const note = [result.note, ...notes].filter(Boolean).join("; ") || undefined;
    await retryOnConflict(() =>
      ctx.runMutation(internal.buildStore.markDone, { buildId, outcome: result.outcome, note }),
    );
  },
});

// One City family's profile, rebuilt without touching its AI-written card: for going live and for dev checks
// (spec 2026-10-12-crime-history-design §4). Returns the build notes.
export const reprofileCity = internalAction({
  args: { familyKey: v.string() },
  handler: async (ctx, { familyKey }): Promise<string[]> => {
    const data = await ctx.runQuery(internal.buildStore.familyContext, { familyKey });
    if (!data) return [`${familyKey}: not in the catalog`];
    const rep = cityRepresentative(data.members);
    if (!rep?.datastoreId) return [`${familyKey}: no live City file`];
    const notes: string[] = [];
    await profileCity(ctx, familyKey, rep.datastoreId, rep.datastoreName ?? null, historicalOf(data.members), notes);
    return notes;
  },
});

// A City family's "(Historical)" file, when it has a live one.
const historicalOf = (members: { title: string; datastoreId?: string | null }[]) =>
  members.find((m) => /\(historical\)/i.test(m.title) && m.datastoreId)?.datastoreId ?? null;

// Crime's Historical file, read with Current from ARCHIVES' date (spec 2026-10-12-crime-history-design §4). Joined
// only when its columns match Current's exactly; otherwise the profile counts Current alone and the build says why.
async function withArchive<P extends CityProfile>(familyKey: string, profile: P, archiveRid: string | null, notes: string[]): Promise<P> {
  const entry = ARCHIVES[familyKey];
  if (!entry?.join) return profile;
  if (!archiveRid) { notes.push(`${familyKey}: no Historical file to read with Current`); return profile; }
  if (!profile.minDate || !profile.dateColumn) { notes.push(`${familyKey}: Current file has no dates; counting it alone`); return profile; }
  let fields: { id: string; type: string }[];
  try {
    fields = await datastoreFields(archiveRid);
  } catch (e) {
    notes.push(`${familyKey}: Historical file unavailable; counting the Current file only (${message(e)})`);
    return profile;
  }
  // Names and types: a UNION fails on a type mismatch, so a retyped column means no join, with a note.
  const shape = (cs: { id: string; type: string }[]) => cs.map((c) => `${c.id}:${c.type}`).sort().join(",");
  if (shape(fields) !== shape(profile.columns.map((c) => ({ id: c.name, type: c.type })))) {
    notes.push(`${familyKey}: Historical file's columns differ; counting the Current file only`);
    return profile;
  }
  if (profile.minDate < entry.seam) notes.push(`${familyKey}: Current file has records dated before ${entry.seam}; combined counts leave them out`);
  return { ...profile, minDate: entry.from, archive: { resourceId: archiveRid, before: entry.seam } };
}

// The property file's yearly history (spec 2026-10-13-property-history-design §4): each year's file and layout, read
// one request at a time. A year whose columns can't be read or match no layout is skipped, and the build says which.
// ponytail: no pause between the ~21 requests; a year the City refuses (403) is skipped until next week's build.
async function withYears<P extends CityProfile>(ctx: ActionCtx, familyKey: string, profile: P, notes: string[]): Promise<P> {
  const entry = YEARLY[familyKey];
  if (!entry) return profile;
  const files = yearFiles(await ctx.runQuery(internal.buildStore.familyFiles, { familyKey: entry.history }), entry.from);
  const current = Number(assessmentYear(profile.categories));
  const years: YearFile[] = [];
  for (const f of files.filter((x) => x.year !== current)) {
    try {
      const layout = layoutOf(await datastoreFields(f.resourceId));
      if (layout) years.push({ ...f, layout });
      else notes.push(`${familyKey}: ${f.year} file's columns match no known layout; skipped`);
    } catch (e) {
      notes.push(`${familyKey}: ${f.year} file unavailable; skipped (${message(e)})`);
    }
  }
  if (!years.length) { notes.push(`${familyKey}: no yearly property files found`); return profile; }
  const own = layoutOf(profile.columns.map((c) => ({ id: c.name })));
  if (current && own === "classic") years.push({ year: current, resourceId: profile.resourceId, layout: "classic" });
  else notes.push(`${familyKey}: today's file can't join the years (no assessment year or unknown columns)`);
  return { ...profile, years: years.sort((a, b) => a.year - b.year) };
}

// Live City dataset: read its columns and build the counting menu. If the City won't describe its columns, the profile
// goes (it can't be counted); a failed counting query after that keeps last week's profile.
async function profileCity(ctx: ActionCtx, familyKey: string, rid: string, resourceName: string | null, archiveRid: string | null, notes: string[]): Promise<Column[]> {
  let fields: { id: string; type: string }[];
  try {
    fields = await datastoreFields(rid);
  } catch (e) {
    await ctx.runMutation(internal.buildStore.deleteCityProfile, { familyKey });
    throw e;
  }
  const plan = planProfile(fields);
  const q = profileSql(rid, plan);
  try {
    const [count] = await datastoreSql<{ n: string }>(q.count);
    const [range] = q.range ? await datastoreSql<{ lo: string | null; hi: string | null }>(q.range) : [undefined];
    const tops = [];
    for (const t of q.tops) {
      const rows = await datastoreSql<{ v: string | null; n: string }>(t.sql);
      tops.push(isMultiValued(rows) ? { column: t.column, rows: await datastoreSql<{ v: string | null; n: string }>(t.multiSql), multi: true } : { column: t.column, rows });
    }
    // The location check is optional: if the sample fails, the profile is still stored, just without point columns.
    let points: { lat: unknown; lon: unknown }[] = [];
    if (q.points) {
      try {
        points = await datastoreSql<{ lat: unknown; lon: unknown }>(q.points);
      } catch (e) {
        console.error(`City point sample failed for ${familyKey}: ${message(e)}`);
      }
    }
    const profile = await withYears(ctx, familyKey, await withArchive(familyKey, { ...assembleProfile(familyKey, rid, fields, plan, count, range, tops, Date.now(), points), resourceName }, archiveRid, notes), notes);
    await ctx.runMutation(internal.buildStore.replaceCityProfile, { profile });
  } catch (e) {
    console.error(`City profile failed for ${familyKey}: ${message(e)}`);
    notes.push(`${familyKey}: profile not updated; last week's stays (${message(e)})`);
  }
  return fields.map((f) => ({ name: f.id, alias: f.id, type: f.type }));
}

async function writeCard(ctx: ActionCtx, buildId: Id<"builds">, familyKey: string, notes: string[]): Promise<Result> {
  const data = await ctx.runQuery(internal.buildStore.familyContext, { familyKey });
  if (!data) return { outcome: "skipped", note: `${familyKey}: no longer in catalog` };
  const { family, members, dictionary, sources, existing, settings } = data;

  const rep = members
    .filter((m) => m.featureServerUrl)
    .sort((a, b) => b.modified.localeCompare(a.modified))[0];
  const cityRep = cityRepresentative(members);
  if (family.source === "city" && !cityRep?.datastoreId) await ctx.runMutation(internal.buildStore.deleteCityProfile, { familyKey });
  const columns: Column[] = cityRep?.datastoreId
    ? await profileCity(ctx, familyKey, cityRep.datastoreId, cityRep.datastoreName ?? null, historicalOf(members), notes)
    : rep?.featureServerUrl ? await fetchColumns(rep.featureServerUrl) : [];
  const inputHash = await hashInputs({
    v: PROMPT_VERSION,
    members: members.map((m) => [m.hubId, m.modified]).sort(),
    dictionary,
    columns,
  });
  if (existing?.inputHash === inputHash) return { outcome: "skipped" };

  const base = { familyKey, name: family.name, hubSummary: latestDescription(members), columns, dictionary };
  const key = gatewayKey();
  const prompt = buildCardPrompt({
    name: family.name,
    kind: family.kind,
    places: family.places,
    years: family.years,
    descriptions: uniqueDescriptions(members),
    columns,
    dycuDefinitions: dictionary?.fields ?? [],
    sources: matchSources(sources, [dictionary?.dataSource ?? "", ...members.map((m) => m.description)].join(" ")),
  });
  const maxTokens = cardMaxTokens(columns.length);
  const estimate = costUsd(
    { inputTokens: estimateTokens(CARD_SYSTEM + prompt), outputTokens: maxTokens },
    settings.cardInputUsdPerToken,
    settings.cardOutputUsdPerToken,
  );

  let card: Card | null = null;
  let reason = "budget cap reached";
  if (await ctx.runMutation(internal.buildStore.reserveSpend, { buildId, usd: estimate })) {
    const ai = await writeAiCard(prompt, settings, key, maxTokens);
    await ctx.runMutation(internal.buildStore.settleSpend, { buildId, usd: ai.costUsd - estimate });
    if (ai.card) card = assembleCard(ai.card, base);
    else reason = `AI failed twice (${ai.error})`;
  }

  let note: string | undefined;
  let storedHash = inputHash;
  if (!card) {
    if (existing && !existing.basic) return { outcome: "failed", note: `${familyKey}: ${reason}; kept last card` };
    card = basicCard(base);
    storedHash = `basic:${inputHash}`; // forces a retry next run
    note = `${familyKey}: ${reason}; wrote basic card`;
  }

  const { vectors, tokens } = await embed([cardEmbeddingText(family, card)], settings.embedModel, key);
  await ctx.runMutation(internal.buildStore.settleSpend, { buildId, usd: tokens * settings.embedUsdPerToken });
  await ctx.runMutation(internal.buildStore.replaceCard, { inputHash: storedHash, card, embedding: vectors[0] });
  return { outcome: "done", note };
}

async function writeAiCard(
  prompt: string,
  settings: Settings,
  key: string,
  maxTokens: number,
): Promise<{ card: AiCard | null; costUsd: number; error: string }> {
  let spent = 0;
  let error = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { value, usage } = await chatJson(
        {
          model: settings.cardModel,
          system: CARD_SYSTEM,
          user: prompt,
          schemaName: "dataset_card",
          schema: CARD_JSON_SCHEMA,
          maxTokens,
        },
        key,
      );
      spent += costUsd(usage, settings.cardInputUsdPerToken, settings.cardOutputUsdPerToken);
      const parsed = parseAiCard(value);
      if (parsed.success) return { card: parsed.data, costUsd: spent, error: "" };
      error = `schema: ${parsed.error.issues[0]?.message ?? "invalid"}`;
    } catch (e) {
      error = message(e);
    }
  }
  return { card: null, costUsd: spent, error };
}

export const processReport = internalAction({
  args: { buildId: v.id("builds"), hubId: v.string() },
  handler: async (ctx, { buildId, hubId }) => {
    let result: Result;
    try {
      result = await indexReport(ctx, buildId, hubId);
    } catch (e) {
      result = { outcome: "failed", note: `report ${hubId}: ${message(e)}` };
    }
    await retryOnConflict(() =>
      ctx.runMutation(internal.buildStore.markDone, { buildId, outcome: result.outcome, note: result.note }),
    );
  },
});

async function indexReport(ctx: ActionCtx, buildId: Id<"builds">, hubId: string): Promise<Result> {
  const data = await ctx.runQuery(internal.buildStore.reportContext, { hubId });
  if (!data) return { outcome: "skipped", note: `report ${hubId}: no longer in catalog` };
  if (data.indexedModified === data.member.modified) return { outcome: "skipped" };
  const fcKey = firecrawlKey();
  if (!(await ctx.runMutation(internal.buildStore.reserveFirecrawl, { buildId }))) {
    return { outcome: "failed", note: `report ${hubId}: Firecrawl call cap reached` };
  }
  const markdown = await scrapeMarkdown(pdfUrl(hubId), fcKey);
  const chunks = chunkMarkdown(markdown).slice(0, MAX_CHUNKS_PER_REPORT);
  if (chunks.length === 0) return { outcome: "failed", note: `report ${hubId}: no readable text` };
  const { vectors, tokens } = await embed(
    chunks.map((c) => `${data.member.title}. ${c.section}. ${c.text}`),
    data.settings.embedModel,
    gatewayKey(),
  );
  await ctx.runMutation(internal.buildStore.settleSpend, { buildId, usd: tokens * data.settings.embedUsdPerToken });
  await ctx.runMutation(internal.buildStore.replaceChunks, {
    hubId,
    modified: data.member.modified,
    chunks: chunks.map((c, i) => ({ ...c, embedding: vectors[i] })),
  });
  return { outcome: "done" };
}

const PORTRAIT_SPACING_MS = 1500;

export const processPortrait = internalAction({
  args: { buildId: v.id("builds"), hubId: v.string() },
  handler: async (ctx, { buildId, hubId }) => {
    let result: Result;
    try {
      result = await storePortrait(ctx, buildId, hubId);
    } catch (e) {
      result = { outcome: "failed", note: `spreadsheet ${hubId}: ${message(e)}` };
    }
    await retryOnConflict(() =>
      ctx.runMutation(internal.buildStore.markDone, { buildId, outcome: result.outcome, note: result.note }),
    );
  },
});

async function storePortrait(ctx: ActionCtx, buildId: Id<"builds">, hubId: string): Promise<Result> {
  const data = await ctx.runQuery(internal.buildStore.portraitContext, { hubId });
  if (!data) return { outcome: "skipped", note: `spreadsheet ${hubId}: no longer in catalog` };
  if (data.indexedModified === data.member.modified) return { outcome: "skipped" };
  const res = await fetchOk(pdfUrl(hubId), `spreadsheet ${hubId}`);
  const tables = parsePortrait(new Uint8Array(await res.arrayBuffer()));
  if (tables.length === 0) return { outcome: "failed", note: `spreadsheet ${hubId}: no tabs found` };
  // A file with no readable tab is a failure, not an update: last week's tables stay.
  if (tables.every((t) => t.rows.length === 0)) {
    return { outcome: "failed", note: portraitBuildNote(hubId, tables) ?? `spreadsheet ${hubId}: no readable tabs` };
  }
  const passages = tables.map((t) => portraitPassage(data.member.place, data.member.year, t));
  const { vectors, tokens } = await embed(passages, data.settings.embedModel, gatewayKey());
  await ctx.runMutation(internal.buildStore.settleSpend, { buildId, usd: tokens * data.settings.embedUsdPerToken });
  await ctx.runMutation(internal.buildStore.replacePortrait, {
    hubId,
    modified: data.member.modified,
    tables,
    chunks: tables.map((t, i) => ({ section: t.topic, text: passages[i], embedding: vectors[i] })),
  });
  const note = portraitBuildNote(hubId, tables);
  return note ? { outcome: "done", note } : { outcome: "done" };
}

export const finish = internalAction({
  args: { buildId: v.id("builds") },
  handler: async (ctx, { buildId }) => {
    let cursor: string | null = null;
    let deleted = 0;
    do {
      const page: { deleted: number; isDone: boolean; continueCursor: string } = await ctx.runMutation(
        internal.buildStore.cleanupOrphanChunks,
        { cursor },
      );
      deleted += page.deleted;
      cursor = page.isDone ? null : page.continueCursor;
    } while (cursor !== null);
    // A neighborhoods failure must not leave the build "running": it is noted and the build still completes.
    let neighborhoodNotes: string[];
    try {
      neighborhoodNotes = await ctx.runAction(internal.build.refreshNeighborhoods, {});
    } catch (e) {
      neighborhoodNotes = [`Neighborhoods refresh failed: ${message(e)}`];
    }
    let boundaryNotes: string[];
    try {
      boundaryNotes = await ctx.runAction(internal.build.refreshBoundaries, {});
    } catch (e) {
      boundaryNotes = [`Boundaries refresh failed: ${message(e)}`];
    }
    let cityNotes: string[];
    try {
      cityNotes = await ctx.runAction(internal.cityFigures.refreshCityFigures, {});
    } catch (e) {
      cityNotes = [`City figures refresh failed: ${message(e)}`];
    }
    let stopNotes: string[];
    try {
      stopNotes = await ctx.runAction(internal.stops.refreshStops, {});
    } catch (e) {
      stopNotes = [`Stop counts refresh failed: ${message(e)}`];
    }
    let turnoutNotes: string[];
    try {
      turnoutNotes = await ctx.runAction(internal.elections.refreshTurnout, {});
    } catch (e) {
      turnoutNotes = [`Turnout refresh failed: ${message(e)}`];
    }
    let fireNotes: string[];
    try {
      fireNotes = await ctx.runAction(internal.fire.refreshFire, {});
    } catch (e) {
      fireNotes = [`Fire history refresh failed: ${message(e)}`];
    }
    let healthNotes: string[];
    try {
      healthNotes = await ctx.runAction(internal.health.refreshHealth, {});
    } catch (e) {
      healthNotes = [`Health Compass refresh failed: ${message(e)}`];
    }
    await ctx.runMutation(internal.buildStore.completeBuild, { buildId, orphanChunksDeleted: deleted, notes: [...neighborhoodNotes, ...boundaryNotes, ...cityNotes, ...stopNotes, ...turnoutNotes, ...fireNotes, ...healthNotes] });
  },
});

export const NEIGHBORHOODS_URL =
  "https://milwaukeemaps.milwaukee.gov/arcgis/rest/services/planning/special_districts/MapServer/4/query?where=1%3D1&outFields=NEIGHBORHD&outSR=4326&f=geojson";

// The City's boundaries and DYCU's tract lists. Each definition is replaced only when it was read; a City outage
// keeps last week's boundaries. Runs at the end of the build, after this week's reports were indexed.
export const refreshNeighborhoods = internalAction({
  args: {},
  handler: async (ctx): Promise<string[]> => {
    const notes: string[] = [];
    let hoods: Hood[] | null = null; // this run's City shapes, for the tract match; null when the layer wasn't read
    try {
      const { rows, skipped } = parseCityNeighborhoods(await (await fetchOk(NEIGHBORHOODS_URL, "City neighborhoods")).json());
      if (rows.length === 0) throw new Error("no neighborhoods in the layer");
      await ctx.runMutation(internal.buildStore.replaceNeighborhoods, { definition: "city", rows });
      hoods = rows.map((r) => ({ name: r.name, geometry: JSON.parse(r.geometry) as Geometry, bbox: r.bbox }));
      if (skipped.length) notes.push(`City neighborhoods skipped (no usable shape): ${skipped.join(", ")}`);
    } catch (e) {
      notes.push(`City neighborhoods unavailable, kept last week's: ${message(e)}`);
    }
    notes.push(...(await refreshTractNeighborhoods(ctx, hoods)));
    notes.push(...(await refreshZipNeighborhoods(ctx, hoods)));
    const { reports, places } = await ctx.runQuery(internal.buildStore.neighborhoodSources, {});
    const found: { name: string; year: number | null; tracts: string[] }[] = [];
    for (const r of reports) {
      for (const text of await ctx.runQuery(internal.buildStore.definitionSentences, { hubId: r.hubId })) {
        for (const d of parseDefinitions(text)) found.push({ ...d, year: r.year });
      }
    }
    const dycu = buildDycuNeighborhoods(found, places);
    if (dycu.rows.length) await ctx.runMutation(internal.buildStore.replaceNeighborhoods, { definition: "dycu", rows: dycu.rows });
    return [...notes, ...dycu.notes];
  },
});

// Every County tract's outline, from E02's newest County map (the same outlines the count cards' tract maps use).
// ponytail: fetched twice a week (neighborhoods and boundaries); share one fetch if the build ever gets slow.
async function tractOutlines(ctx: ActionCtx) {
  const e02 = await ctx.runQuery(internal.tracts.familyForTracts, { code: "E02" });
  const url = newestCountyUrl(e02?.members ?? []);
  if (!url) throw new Error("E02 has no County tract map");
  return parseTractShapes(await (await fetchOk(allTractsUrl(url), "Tract outlines")).json());
}

// Each tract's City neighborhoods (convex/lib/tractPlaces.ts), from this run's City shapes and DYCU's tract outlines
// (E02's newest County map). Replaced only when both were read and at least one tract matched.
async function refreshTractNeighborhoods(ctx: ActionCtx, hoods: Hood[] | null): Promise<string[]> {
  try {
    if (!hoods) throw new Error("the City's neighborhoods weren't read this week");
    const tracts = await tractOutlines(ctx);
    const rows = tracts.map((t) => ({ geoid: t.geoid, city: cityShares(t.geometry, hoods) })).filter((r) => r.city.length > 0);
    if (rows.length === 0) throw new Error("no tract matched a City neighborhood");
    await ctx.runMutation(internal.buildStore.replaceTractNeighborhoods, { rows });
    return [];
  } catch (e) {
    return [`Tract neighborhoods unavailable, kept last week's: ${message(e)}`];
  }
}

// Each county ZIP's City neighborhoods, from this run's City shapes and TIGERweb's ZIP outlines. Replaced only when both
// were read and at least one ZIP matched; the card falls back to the ZIP's main town.
async function refreshZipNeighborhoods(ctx: ActionCtx, hoods: Hood[] | null): Promise<string[]> {
  try {
    if (!hoods) throw new Error("the City's neighborhoods weren't read this week");
    const zips = parseZipShapes(await (await fetchOk(zctaUrl(Object.keys(COUNTY_ZIPS)), "ZIP outlines")).json());
    const rows = zips.map((z) => ({ zip: z.zip, city: cityShares(z.geometry, hoods) })).filter((r) => r.city.length > 0);
    if (rows.length === 0) throw new Error("no ZIP matched a City neighborhood");
    await ctx.runMutation(internal.buildStore.replaceZipNeighborhoods, { rows });
    return [];
  } catch (e) {
    return [`ZIP neighborhoods unavailable, kept last week's: ${message(e)}`];
  }
}

// The City's boundary files (docs/superpowers/specs/2026-10-12-boundaries-design.md §4). Each kind is replaced only when
// its layer was read; the overlap table is rebuilt from whatever is stored, only when the tract outlines were read.
export const refreshBoundaries = internalAction({
  args: {},
  handler: async (ctx): Promise<string[]> => {
    const notes: string[] = [];
    for (const kind of BOUNDARY_KINDS) {
      const label = BOUNDARY_LAYERS[kind].label;
      try {
        const { rows, skipped } = parseBoundaryLayer(kind, await (await fetchOk(layerUrl(kind), `${label} boundaries`)).json());
        await ctx.runMutation(internal.buildStore.replaceBoundaries, { kind, rows, fetchedAt: Date.now() });
        if (skipped.length) notes.push(`${label} boundaries skipped (no usable shape or name): ${skipped.join(", ")}`);
      } catch (e) {
        notes.push(`${label} boundaries unavailable, kept last week's: ${message(e)}`);
      }
    }
    return [...notes, ...(await refreshOverlaps(ctx))];
  },
});

async function refreshOverlaps(ctx: ActionCtx): Promise<string[]> {
  try {
    const inputs = await ctx.runQuery(internal.buildStore.overlapInputs, {});
    if (inputs.boundaries.length === 0) throw new Error("no boundaries are stored");
    const tracts = await tractOutlines(ctx);
    const shapes: BoundaryShape[] = inputs.boundaries.map(({ fetchedAt: _f, ...b }) => ({ ...b, geometry: JSON.parse(b.geometry) as Geometry }));
    const asOf = Math.min(...inputs.boundaries.map((b) => b.fetchedAt)); // a kind kept from last week dates the answer
    const byNumber = new Map(tracts.map((t) => [tractNumber(t.geoid), t.geometry]));
    const places = [
      ...tracts.map((t) => ({ placeType: "tract" as const, place: t.geoid, geometry: t.geometry })),
      ...inputs.city.map((h) => ({ placeType: "city" as const, place: h.name, geometry: JSON.parse(h.geometry) as Geometry })),
      ...inputs.dycu.flatMap((d) => {
        const gs = d.tracts.flatMap((n) => byNumber.get(n) ?? []);
        return gs.length ? [{ placeType: "dycu" as const, place: d.name, geometry: unionOf(gs) }] : [];
      }),
      ...shapes.filter((s) => s.kind === "district").map((s) => ({ placeType: "district" as const, place: s.name.replace(/^District /, ""), geometry: s.geometry })),
    ];
    const builtAt = Date.now();
    const rows = places.map((p) => ({
      placeType: p.placeType, place: p.place, builtAt, asOf,
      covers: boundaryShares(p.geometry, shapes).filter((c) => !(p.placeType === "district" && c.kind === "district" && c.name === `District ${p.place}`)),
    }));
    if (rows.length === 0) throw new Error("no place to measure");
    await ctx.runMutation(internal.buildStore.replaceBoundaryOverlaps, { rows });
    return [];
  } catch (e) {
    return [`Boundary overlaps unavailable, kept last week's: ${message(e)}`];
  }
}

async function fetchOk(url: string, label: string): Promise<Response> {
  const res = await fetchWithTimeout(url, {}, SOURCE_FETCH_TIMEOUT_MS);
  if (!res.ok) throw new Error(`${label} request failed: ${res.status}`);
  return res;
}

export const start = internalAction({
  args: {},
  handler: async (ctx): Promise<Id<"builds">> => {
    await ctx.runMutation(internal.settings.ensureDefaults, {});
    const buildId = await ctx.runMutation(internal.buildStore.beginBuild, {});
    // Watchdog: if an item hangs or its action is killed, markDone never completes the count. failBuild ignores builds that already finished.
    await ctx.scheduler.runAfter(STALE_BUILD_MS, internal.buildStore.failBuild, {
      buildId,
      reason: "Build did not finish within 2 hours (an item hung or its action was killed)",
    });
    try {
      await runBuild(ctx, buildId);
    } catch (e) {
      await ctx.runMutation(internal.buildStore.failBuild, { buildId, reason: message(e) });
    }
    return buildId;
  },
});

async function runBuild(ctx: ActionCtx, buildId: Id<"builds">) {
  const settings = await ctx.runQuery(internal.settings.get, {});
  const notes: string[] = [];

  const items = parseDcat(await (await fetchOk(HUB_FEED_URL, "Hub feed")).json());
  const overrides = await ctx.runQuery(internal.buildStore.listOverrides, {});
  const families = groupItems(items, overrides.items);

  // The City's catalog: if it can't be read, last week's City families stay (swap would otherwise retire them).
  let cityFamilies: Family[] = [];
  let carried: FamilyInput[] = [];
  try {
    cityFamilies = groupCityItems(await fetchCityCatalog(), new Date());
  } catch (e) {
    notes.push(`City catalog unavailable, kept last week's City datasets: ${message(e)}`);
    carried = await ctx.runQuery(internal.buildStore.cityFamilyInputs, {});
  }

  let inventory: Inventory = { dictionaries: [], links: [], tabs: [] };
  try {
    inventory = readInventory(new Uint8Array(await (await fetchOk(INVENTORY_XLSX_URL, "Inventory sheet")).arrayBuffer()));
  } catch (e) {
    notes.push(`Inventory sheet unavailable, continuing without DYCU definitions: ${message(e)}`);
  }
  const { byFamily, unmatchedHomeTitles } = mapDictionaries(families, inventory.links, overrides.dictionaries);
  const mismatch: Mismatch = {
    unlinkedTabs: unlinkedTabs(inventory.tabs, inventory.links),
    suspectLinks: inventory.links.filter(isSuspectLink),
    unmatchedHomeTitles,
    typoFixes: items.filter((i) => fixTypos(i.title) !== i.title).map((i) => i.title),
  };

  const swap = await ctx.runMutation(internal.buildStore.swapCatalog, {
    buildId,
    families: [...families.map((f) => toFamilyInput(f, byFamily[f.key] ?? null)), ...cityFamilies.map((f) => toFamilyInput(f, null)), ...carried],
    dictionaries: inventory.dictionaries,
  });
  if (!swap.ok) throw new Error(swap.reason);
  if (swap.cityKept) {
    // Last week's City families stayed (like an outage), so none of this week's are processed.
    if (swap.note) notes.push(swap.note);
    cityFamilies = [];
  }

  await refreshSources(ctx, buildId, settings, notes);

  const reports = families.filter(isPdfFamily).flatMap((f) => f.members.map((m) => ({ hubId: m.hubId, modified: m.modified })));
  const indexed: { hubId: string; modified: string }[] = await ctx.runQuery(internal.buildStore.indexedModified, {
    hubIds: reports.map((r) => r.hubId),
  });
  const delays = reportDelays(reports, new Map(indexed.map((i) => [i.hubId, i.modified])), settings.firecrawlSpacingMs);
  const portraits = families.filter(isSpreadsheetFamily).flatMap((f) => f.members.map((m) => ({ hubId: m.hubId, modified: m.modified })));
  const portraitStored: { hubId: string; modified: string }[] = await ctx.runQuery(internal.buildStore.portraitIndexed, {
    hubIds: portraits.map((p) => p.hubId),
  });
  const portraitDelays = reportDelays(portraits, new Map(portraitStored.map((p) => [p.hubId, p.modified])), PORTRAIT_SPACING_MS);
  const pending = families.length + cityFamilies.length + reports.length + portraits.length;
  await ctx.runMutation(internal.buildStore.setPending, {
    buildId,
    pending,
    hubCounts: hubCounts(families),
    pdfReports: reports.length,
    notes,
    mismatch,
  });
  for (const [i, f] of families.entries()) {
    await ctx.scheduler.runAfter(i * 500, internal.build.processFamily, { buildId, familyKey: f.key });
  }
  for (const [i, f] of cityFamilies.entries()) {
    await ctx.scheduler.runAfter((families.length + i) * 500, internal.build.processFamily, { buildId, familyKey: f.key });
  }
  for (const { hubId, delayMs } of delays) {
    await ctx.scheduler.runAfter(delayMs, internal.build.processReport, { buildId, hubId });
  }
  for (const { hubId, delayMs } of portraitDelays) {
    await ctx.scheduler.runAfter(delayMs, internal.build.processPortrait, { buildId, hubId });
  }
  if (pending === 0) await ctx.scheduler.runAfter(0, internal.build.finish, { buildId });
}

async function refreshSources(ctx: ActionCtx, buildId: Id<"builds">, settings: Settings, notes: string[]) {
  const ages = new Map((await ctx.runQuery(internal.buildStore.sourceAges, {})).map((s) => [s.name, s.fetchedAt]));
  const maxAgeMs = settings.sourceRefreshDays * 86_400_000;
  for (const site of SOURCE_SITES) {
    if (Date.now() - (ages.get(site.name) ?? 0) < maxAgeMs) continue;
    try {
      if (!(await ctx.runMutation(internal.buildStore.reserveFirecrawl, { buildId }))) {
        notes.push(`Source ${site.name}: Firecrawl call cap reached`);
        continue;
      }
      const page = await scrapeMarkdown(site.url, firecrawlKey());
      const prompt = JSON.stringify({ source: site.name, url: site.url, page: page.slice(0, 12000) });
      const estimate = costUsd(
        { inputTokens: estimateTokens(SOURCE_SYSTEM + prompt), outputTokens: 600 },
        settings.cardInputUsdPerToken,
        settings.cardOutputUsdPerToken,
      );
      if (!(await ctx.runMutation(internal.buildStore.reserveSpend, { buildId, usd: estimate }))) {
        notes.push(`Source ${site.name}: budget cap reached`);
        continue;
      }
      const { value, usage } = await chatJson(
        { model: settings.cardModel, system: SOURCE_SYSTEM, user: prompt, schemaName: "source_profile", schema: SOURCE_JSON_SCHEMA, maxTokens: 600 },
        gatewayKey(),
      );
      const actual = costUsd(usage, settings.cardInputUsdPerToken, settings.cardOutputUsdPerToken);
      await ctx.runMutation(internal.buildStore.settleSpend, { buildId, usd: actual - estimate });
      const profile = sourceProfileSchema.parse(value);
      await ctx.runMutation(internal.buildStore.upsertSource, { name: site.name, url: site.url, ...profile });
    } catch (e) {
      notes.push(`Source ${site.name}: ${message(e)}`);
    }
  }
}
