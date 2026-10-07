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
  CARD_MAX_TOKENS,
  CARD_SYSTEM,
  cardEmbeddingText,
  latestDescription,
  PROMPT_VERSION,
  uniqueDescriptions,
  type AiCard,
} from "./lib/card";
import { chunkMarkdown } from "./lib/chunk";
import { firecrawlKey, scrapeMarkdown } from "./lib/firecrawl";
import { chatJson, costUsd, embed, estimateTokens, gatewayKey } from "./lib/gateway";
import { hashInputs } from "./lib/hash";
import { matchSources } from "./lib/sources";
import type { Card, Column } from "./lib/types";
import type { Settings } from "./settings";

type Outcome = "done" | "skipped" | "failed";
interface Result {
  outcome: Outcome;
  note?: string;
}

const MAX_CHUNKS_PER_REPORT = 60;
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
    await ctx.runMutation(internal.buildStore.markDone, { buildId, outcome: result.outcome, note: result.note });
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
  const estimate = costUsd(
    { inputTokens: estimateTokens(CARD_SYSTEM + prompt), outputTokens: CARD_MAX_TOKENS },
    settings.cardInputUsdPerToken,
    settings.cardOutputUsdPerToken,
  );

  let card: Card | null = null;
  let reason = "budget cap reached";
  if (await ctx.runMutation(internal.buildStore.reserveSpend, { buildId, usd: estimate })) {
    const ai = await writeAiCard(prompt, settings, key);
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
          maxTokens: CARD_MAX_TOKENS,
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
    await ctx.runMutation(internal.buildStore.markDone, { buildId, outcome: result.outcome, note: result.note });
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
