import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalQuery, mutation, query, type QueryCtx } from "./_generated/server";
import { chicagoDay, costUsd, dailyLimit, isContentsPassage, matchTopic, pickRow } from "./lib/ask";
import { embed, gatewayKey } from "./lib/gateway";
import { placeKey, TOPICS } from "./lib/portrait";
import { MIN_VECTOR_SCORE } from "./lib/rank";
import { rateLimiter } from "./limits";
import { readSettings } from "./settings";

async function today(ctx: QueryCtx, user: string) {
  const day = chicagoDay(Date.now());
  const count = await ctx.db.query("askCounts").withIndex("by_day_user", (q) => q.eq("day", day).eq("user", user)).unique();
  const spend = await ctx.db.query("askSpend").withIndex("by_day", (q) => q.eq("day", day)).unique();
  return { day, count, spend };
}

// What the chat shows: questions left today and whether the site budget has paused Ask.
export const status = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const s = await readSettings(ctx);
    const { count, spend } = await today(ctx, identity.tokenIdentifier);
    const limit = dailyLimit(identity, s);
    return { limit, left: Math.max(0, limit - (count?.questions ?? 0)), paused: (spend?.usd ?? 0) >= s.askDailyCapUsd, newsroom: limit === s.askNewsroomLimit };
  },
});

// Called by the Ask route before the model runs; reserves the question so a failed answer still counts.
export const begin = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { ok: false as const, reason: "signed-out" as const };
    const s = await readSettings(ctx);
    const { day, count, spend } = await today(ctx, identity.tokenIdentifier);
    if ((spend?.usd ?? 0) >= s.askDailyCapUsd) return { ok: false as const, reason: "paused" as const };
    if ((count?.questions ?? 0) >= dailyLimit(identity, s)) return { ok: false as const, reason: "limit" as const };
    if (!(await rateLimiter.limit(ctx, "askRuns", { key: identity.tokenIdentifier })).ok) return { ok: false as const, reason: "busy" as const };
    if (!(await rateLimiter.limit(ctx, "askRunsAll")).ok) return { ok: false as const, reason: "busy" as const };
    if (count) await ctx.db.patch(count._id, { questions: count.questions + 1 });
    else await ctx.db.insert("askCounts", { day, user: identity.tokenIdentifier, questions: 1 });
    return { ok: true as const };
  },
});

// Called by the Ask route's model wrapper after each model step. The secret keeps a signed-in
// person from inflating the site spend (and pausing Ask for everyone) by calling this directly.
export const recordUsage = mutation({
  args: { secret: v.string(), inputTokens: v.number(), outputTokens: v.number() },
  handler: async (ctx, { secret, inputTokens, outputTokens }) => {
    const expected = process.env.ASK_METER_SECRET;
    if (!expected || secret !== expected) throw new Error("Not allowed");
    const s = await readSettings(ctx);
    const day = chicagoDay(Date.now());
    const usd = costUsd({ inputTokens: Math.max(0, inputTokens), outputTokens: Math.max(0, outputTokens) }, s);
    const spend = await ctx.db.query("askSpend").withIndex("by_day", (q) => q.eq("day", day)).unique();
    if (spend) await ctx.db.patch(spend._id, { usd: spend.usd + usd });
    else await ctx.db.insert("askSpend", { day, usd });
    return null;
  },
});

const N03_KEY = "document:neighborhood-portrait-spreadsheet";

const listWords = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

// "census tracts 71, 72 and 107": DYCU's definition for that report year (or its latest), or null if none is stored.
async function dycuDefinition(ctx: QueryCtx, place: string, year: number | null): Promise<string | null> {
  const row = await ctx.db.query("neighborhoods").withIndex("by_definition_matchKey", (q) => q.eq("definition", "dycu").eq("matchKey", place)).first();
  const versions = row?.tracts ?? [];
  const v = versions.find((x) => year !== null && x.years.includes(year)) ?? versions.at(-1);
  return v ? `census tract${v.tracts.length > 1 ? "s" : ""} ${listWords(v.tracts)}` : null;
}

// One row of one DYCU neighborhood table, exactly as written. Never combines rows, tables, places or years.
export const getNumber = query({
  args: { neighborhood: v.string(), topic: v.string(), year: v.optional(v.number()), row: v.string() },
  handler: async (ctx, args) => {
    const family = await ctx.db.query("families").withIndex("by_key", (q) => q.eq("key", N03_KEY)).first();
    const members = family ? await ctx.db.query("members").withIndex("by_family", (q) => q.eq("familyKey", N03_KEY)).collect() : [];
    const label = (m: (typeof members)[number]) => m.place ?? m.title;
    const here = members.filter((m) => placeKey(label(m)) === placeKey(args.neighborhood));
    if (!family || here.length === 0) {
      return { status: "no-neighborhood" as const, neighborhoods: [...new Set(members.map(label))].sort() };
    }
    const topic = matchTopic(args.topic);
    if (!topic) return { status: "no-topic" as const, topics: TOPICS.map((t) => t.topic) };
    const newestFirst = [...here].sort((a, b) => (b.years[0] ?? 0) - (a.years[0] ?? 0));
    const ordered = [...newestFirst.filter((m) => m.years[0] === args.year), ...newestFirst];
    for (const m of ordered) {
      const table = (await ctx.db.query("portraitTables").withIndex("by_hubId", (q) => q.eq("hubId", m.hubId)).collect()).find((x) => x.slug === topic.slug);
      if (!table) continue;
      const picked = pickRow(table.rows, args.row);
      if ("choose" in picked) return { status: "choose-row" as const, rows: picked.choose };
      // The row and the rows on either side of it, for a phone's excerpt; only the asked-for row is marked.
      const at = picked.index;
      const nearby = table.rows.slice(Math.max(0, at - 1), at + 2).map((r) => ({ label: r.label, values: r.values, marked: r === picked.row }));
      return {
        status: "ok" as const,
        code: family.code,
        neighborhood: label(m),
        place: placeKey(label(m)),
        year: m.years[0] ?? null,
        topic: topic.topic,
        slug: topic.slug,
        tableIdText: table.tableIdText,
        vintage: table.vintage,
        groups: table.groups,
        label: picked.row.label,
        rowIndex: picked.index,
        values: picked.row.values,
        nearby,
        issues: table.issues,
        definition: await dycuDefinition(ctx, placeKey(label(m)), m.years[0] ?? null),
      };
    }
    return { status: "no-table" as const, neighborhood: label(here[0]), topic: topic.topic };
  },
});

type Passage = { quote: string; section: string; report: string; code: string; name: string };
type ReportResult = { status: "ok" | "busy"; passages: Passage[] };

export const chunkDetails = internalQuery({
  args: { ids: v.array(v.id("docChunks")) },
  handler: async (ctx, { ids }): Promise<Passage[]> => {
    const out: Passage[] = [];
    for (const id of ids) {
      const chunk = await ctx.db.get(id);
      if (!chunk) continue;
      const member = await ctx.db.query("members").withIndex("by_hubId", (q) => q.eq("hubId", chunk.hubId)).first();
      const family = member ? await ctx.db.query("families").withIndex("by_key", (q) => q.eq("key", member.familyKey)).first() : null;
      if (!member || !family) continue;
      out.push({ quote: chunk.text, section: chunk.section, report: member.title, code: family.code, name: family.name });
    }
    return out;
  },
});

// Report passages for a question, by meaning. Signed-in only: each call spends an embedding.
export const readReport = action({
  args: { question: v.string(), familyCode: v.optional(v.string()) },
  // Typed explicitly: this action calls a query in its own module, which TypeScript can't infer through.
  handler: async (ctx, { question, familyCode }): Promise<ReportResult> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Sign in to ask");
    const allowed = await rateLimiter.limit(ctx, "askEmbeds", { key: identity.tokenIdentifier });
    if (!allowed.ok) return { status: "busy", passages: [] };
    const settings = await ctx.runQuery(internal.settings.get, {});
    const { vectors } = await embed([question.slice(0, 500)], settings.embedModel, gatewayKey());
    const hits = (await ctx.vectorSearch("docChunks", "by_embedding", { vector: vectors[0], limit: 16 })).filter((h) => h._score >= MIN_VECTOR_SCORE);
    const passages: Passage[] = await ctx.runQuery(internal.ask.chunkDetails, { ids: hits.map((h) => h._id) });
    const wanted = familyCode?.trim().toUpperCase();
    return { status: "ok", passages: passages.filter((p) => (!wanted || p.code === wanted) && !isContentsPassage(p.section, p.quote)).slice(0, 3) };
  },
});

export const askSettings = query({ args: {}, handler: async (ctx) => ({ askModel: (await readSettings(ctx)).askModel }) });
