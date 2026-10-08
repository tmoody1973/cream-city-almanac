import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, type ActionCtx } from "./_generated/server";
import { fetchColumns, pdfUrl } from "./lib/arcgis";
import {
  aiCardSchema,
  assembleCard,
  basicCard,
  buildCardPrompt,
  CARD_JSON_SCHEMA,
  CARD_SYSTEM,
  cardEmbeddingText,
  cardMaxTokens,
  latestDescription,
  PROMPT_VERSION,
  uniqueDescriptions,
  type AiCard,
} from "./lib/card";
import { chunkMarkdown } from "./lib/chunk";
import { HUB_FEED_URL, parseDcat } from "./lib/dcat";
import { INVENTORY_XLSX_URL, isSuspectLink, mapDictionaries, readInventory, unlinkedTabs, type Inventory } from "./lib/dictionary";
import { groupItems, hubCounts, isPdfFamily, isSpreadsheetFamily, reportDelays, toFamilyInput } from "./lib/families";
import { parsePortrait, portraitBuildNote, portraitPassage } from "./lib/portrait";
import { firecrawlKey, scrapeMarkdown } from "./lib/firecrawl";
import { chatJson, costUsd, embed, estimateTokens, gatewayKey } from "./lib/gateway";
import { hashInputs } from "./lib/hash";
import { fetchWithTimeout } from "./lib/http";
import { matchSources, SOURCE_JSON_SCHEMA, SOURCE_SITES, SOURCE_SYSTEM, sourceProfileSchema } from "./lib/sources";
import { fixTypos } from "./lib/titles";
import type { Card, Column, Mismatch } from "./lib/types";
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
    try {
      result = await writeCard(ctx, buildId, familyKey);
    } catch (e) {
      result = { outcome: "failed", note: `${familyKey}: ${message(e)}` };
    }
    await retryOnConflict(() =>
      ctx.runMutation(internal.buildStore.markDone, { buildId, outcome: result.outcome, note: result.note }),
    );
  },
});

async function writeCard(ctx: ActionCtx, buildId: Id<"builds">, familyKey: string): Promise<Result> {
  const data = await ctx.runQuery(internal.buildStore.familyContext, { familyKey });
  if (!data) return { outcome: "skipped", note: `${familyKey}: no longer in catalog` };
  const { family, members, dictionary, sources, existing, settings } = data;

  const rep = members
    .filter((m) => m.featureServerUrl)
    .sort((a, b) => b.modified.localeCompare(a.modified))[0];
  const columns: Column[] = rep?.featureServerUrl ? await fetchColumns(rep.featureServerUrl) : [];
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
      const parsed = aiCardSchema.safeParse(value);
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
    await ctx.runMutation(internal.buildStore.completeBuild, { buildId, orphanChunksDeleted: deleted });
  },
});

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
    families: families.map((f) => toFamilyInput(f, byFamily[f.key] ?? null)),
    dictionaries: inventory.dictionaries,
  });
  if (!swap.ok) throw new Error(swap.reason);

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
  const pending = families.length + reports.length + portraits.length;
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
