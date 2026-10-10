import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalQuery, query, type ActionCtx } from "./_generated/server";
import { MAP_TTL_MS } from "./map";
import { fetchColumns } from "./lib/arcgis";
import { chicagoDay } from "./lib/ask";
import { hashInputs } from "./lib/hash";
import { columnKind, fetchTractRows, isNumericField, rangeColumns, tractNumber, type RangeCols } from "./lib/tractData";
import { neighborhoodFor, type DycuDef } from "./lib/tractNames";
import { isUnreliable, rankValues, type TractValue } from "./lib/tractStats";
import { rateLimiter } from "./limits";

// Ask's tract analyses (docs/superpowers/specs/2026-10-10-ask-analyzes-design.md). The model gets a compact answer;
// the full one waits in mapCache under a tracts: key for the card (tractDetail), so per-tract points never ride in
// the conversation.

export type TractRow = { geoid: string; tract: string; neighborhood: string | null; value: number; lo: number | null; hi: number | null; unreliable: boolean };
export type Header = { code: string; name: string; column: string; meaning: string; kind: "rate" | "count" | "value"; place: string; year: string; n: number; leftOut: number; confidence: string | null; url: string; caveats: string[] };
export type Refusal =
  | { status: "not-found" }
  | { status: "not-tract" }
  | { status: "choose-column"; columns: { column: string; meaning: string }[] }
  | { status: "choose-year"; available: { place: string; year: string }[]; shared?: { place: string; year: string }[] }
  | { status: "unavailable" }
  | { status: "busy" };
export type RankDetail = { status: "ok"; tool: "rank"; header: Header; direction: "high" | "low"; top: TractRow[]; ties: TractRow[]; unreliable: TractRow[]; highlighted: string[]; key: string };

const vPlace = v.union(v.literal("City"), v.literal("County"));
const CONFIDENCE = { moe90: "90% confidence (Census)", ci95: "95% confidence (CDC)" } as const;

export const familyForTracts = internalQuery({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const family = await ctx.db.query("families").withIndex("by_code", (q) => q.eq("code", code.trim().toUpperCase())).first();
    if (!family || family.source === "city" || family.kind === "page") return null;
    const members = await ctx.db.query("members").withIndex("by_family", (q) => q.eq("familyKey", family.key)).collect();
    const card = await ctx.db.query("cards").withIndex("by_family", (q) => q.eq("familyKey", family.key)).first();
    return {
      code: family.code,
      name: family.name,
      members: members.filter((m) => m.featureServerUrl && m.place).map((m) => ({ place: m.place as string, year: m.yearLabel ?? String(m.years[0] ?? ""), url: m.featureServerUrl as string })),
      glossary: (card?.glossary ?? []).map((g) => ({ field: g.field, meaning: g.meaning })),
      caveats: card?.caveats ?? [],
    };
  },
});

export const dycuDefs = internalQuery({
  args: {},
  handler: async (ctx): Promise<DycuDef[]> =>
    (await ctx.db.query("neighborhoods").collect()).filter((n) => n.definition === "dycu").map((n) => ({ name: n.name, tracts: n.tracts })),
});

export type Resolved = { family: { code: string; name: string; caveats: string[] }; url: string; column: string; meaning: string; range: RangeCols };

// The checks every tool runs before any math (spec §4). Throws nothing: a refusal is an answer the model acts on.
export async function resolveTract(ctx: ActionCtx, code: string, column: string, place: string, year: string): Promise<Resolved | Refusal> {
  const fam = await ctx.runQuery(internal.tracts.familyForTracts, { code });
  if (!fam) return { status: "not-found" };
  const available = fam.members.map(({ place, year }) => ({ place, year }));
  const member = fam.members.find((m) => m.place === place && m.year === year.trim());
  if (!member) return { status: "choose-year", available };
  let fields;
  try {
    fields = await fetchColumns(member.url);
  } catch {
    return { status: "unavailable" };
  }
  if (!fields.some((f) => f.name.toUpperCase() === "GEOID")) return { status: "not-tract" };
  const meaningOf = (name: string) => fam.glossary.find((g) => g.field.toLowerCase() === name.toLowerCase())?.meaning ?? "";
  const numeric = fields.filter((f) => isNumericField(f) && !/_moe$|confidence_limit$/i.test(f.name));
  const col = numeric.find((f) => f.name.toLowerCase() === column.trim().toLowerCase());
  if (!col) return { status: "choose-column", columns: numeric.map((f) => ({ column: f.name, meaning: meaningOf(f.name) })) };
  return { family: { code: fam.code, name: fam.name, caveats: fam.caveats }, url: member.url, column: col.name, meaning: meaningOf(col.name), range: rangeColumns(col.name, fields.map((f) => f.name), fam.glossary) };
}

export async function limitTracts(ctx: ActionCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Sign in to ask");
  return (await rateLimiter.limit(ctx, "askTracts", { key: identity.tokenIdentifier })).ok;
}

// DYCU's server is the weak link: a failed read is "unavailable", never a partial answer.
export async function loadValues(r: Resolved) {
  try {
    return await fetchTractRows(r.url, r.column, r.range);
  } catch {
    return null;
  }
}

export const yearNumber = (year: string) => Number(year.match(/\d{4}/)?.[0] ?? 0);

export const toRow = (v: TractValue, year: string, defs: DycuDef[]): TractRow => {
  const tract = tractNumber(v.geoid);
  return { geoid: v.geoid, tract, neighborhood: neighborhoodFor(tract, yearNumber(year), defs), value: v.value, lo: v.lo, hi: v.hi, unreliable: isUnreliable(v) };
};

export const header = (r: Resolved, place: string, year: string, n: number, leftOut: number): Header => ({
  code: r.family.code, name: r.family.name, column: r.column, meaning: r.meaning, kind: columnKind(r.column, r.meaning),
  place, year, n, leftOut, confidence: r.range ? CONFIDENCE[r.range.kind] : null, url: r.url, caveats: r.family.caveats,
});

export async function store(ctx: ActionCtx, args: unknown) {
  const key = `tracts:${await hashInputs({ args, day: chicagoDay(Date.now()) })}`;
  return { key, save: (detail: unknown) => ctx.runMutation(internal.map.remember, { key, result: JSON.stringify(detail), expiresAt: Date.now() + MAP_TTL_MS }) };
}

export const rankTracts = action({
  args: { code: v.string(), column: v.string(), place: vPlace, year: v.string(), direction: v.union(v.literal("high"), v.literal("low")) },
  handler: async (ctx, args): Promise<RankDetail | Refusal> => {
    if (!(await limitTracts(ctx))) return { status: "busy" };
    const r = await resolveTract(ctx, args.code, args.column, args.place, args.year);
    if ("status" in r) return r;
    const rows = await loadValues(r);
    if (!rows) return { status: "unavailable" };
    const defs = await ctx.runQuery(internal.tracts.dycuDefs, {});
    const ranked = rankValues(rows.values, args.direction);
    const { key, save } = await store(ctx, { tool: "rank", ...args, code: r.family.code, column: r.column });
    const detail: RankDetail = {
      status: "ok", tool: "rank", header: header(r, args.place, args.year, rows.values.length, rows.leftOut), direction: args.direction,
      top: ranked.top.map((v) => toRow(v, args.year, defs)), ties: ranked.ties.slice(0, 10).map((v) => toRow(v, args.year, defs)),
      unreliable: ranked.unreliable.slice(0, 10).map((v) => toRow(v, args.year, defs)), highlighted: ranked.top.map((v) => v.geoid), key,
    };
    await save(detail);
    return detail;
  },
});

// The card's full answer by key. Anyone with the key may read it: it holds public DYCU data and expires in 10 minutes.
export const tractDetail = query({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    if (!key.startsWith("tracts:")) return { status: "expired" as const };
    const row = await ctx.db.query("mapCache").withIndex("by_key", (q) => q.eq("key", key)).first();
    return row && row.expiresAt > Date.now() ? JSON.parse(row.result) : { status: "expired" as const };
  },
});
