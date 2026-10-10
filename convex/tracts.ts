import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalQuery, query, type ActionCtx } from "./_generated/server";
import { MAP_TTL_MS } from "./map";
import { fetchColumns } from "./lib/arcgis";
import { chicagoDay } from "./lib/ask";
import { hashInputs } from "./lib/hash";
import { columnKind, fetchTractRows, isNumericField, rangeColumns, tractNumber, type RangeCols } from "./lib/tractData";
import { neighborhoodFor, type DycuDef } from "./lib/tractNames";
import { changeOf, isUnreliable, mismatch, rankValues, relationship, spearman, type TractValue } from "./lib/tractStats";
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
export type RankDetail = { status: "ok"; tool: "rank"; header: Header; direction: "high" | "low"; top: TractRow[]; ties: TractRow[]; tieCount: number; unreliable: TractRow[]; unreliableCount: number; highlighted: string[]; key: string };

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

export type Spend = () => Promise<boolean>;
export type Resolved = { family: { code: string; name: string; caveats: string[] }; url: string; year: string; column: string; meaning: string; range: RangeCols };

// The checks every tool runs before any math (spec §4). Throws nothing: a refusal is an answer the model acts on.
// `spend` is called once, after the database-only checks and before the first call to DYCU's server, so a refusal that
// never reached DYCU costs the person nothing. Pass the same memoized spend (see spender) to every resolve in one action.
export async function resolveTract(ctx: ActionCtx, code: string, column: string, place: string, year: string, spend: Spend): Promise<Resolved | Refusal> {
  const fam = await ctx.runQuery(internal.tracts.familyForTracts, { code });
  if (!fam) return { status: "not-found" };
  const available = fam.members.map(({ place, year }) => ({ place, year }));
  const member = fam.members.find((m) => m.place === place && sameYear(m.year, year));
  if (!member) return { status: "choose-year", available };
  if (!(await spend())) return { status: "busy" };
  let fields;
  try {
    fields = await fetchColumns(member.url);
  } catch (e) {
    console.error(`Tract columns failed for ${member.url}: ${e instanceof Error ? e.message : String(e)}`);
    return { status: "unavailable" };
  }
  if (!fields.some((f) => f.name.toUpperCase() === "GEOID")) return { status: "not-tract" };
  const meaningOf = (name: string) => fam.glossary.find((g) => g.field.toLowerCase() === name.toLowerCase())?.meaning ?? "";
  const numeric = fields.filter((f) => isNumericField(f) && !/_moe$|confidence_limit$|(low|high)_confidence$/i.test(f.name));
  const col = numeric.find((f) => f.name.toLowerCase() === column.trim().toLowerCase());
  if (!col) return { status: "choose-column", columns: numeric.map((f) => ({ column: f.name, meaning: meaningOf(f.name) })) };
  return { family: { code: fam.code, name: fam.name, caveats: fam.caveats }, url: member.url, year: member.year, column: col.name, meaning: meaningOf(col.name), range: rangeColumns(col.name, fields.map((f) => f.name), fam.glossary) };
}

// DYCU years can be spelled with any dash ("2018–2022"); compare them with one.
const yearKey = (s: string) => s.trim().replace(/[\u2010-\u2015]/g, "-");
const sameYear = (a: string, b: string) => yearKey(a) === yearKey(b);

// Signed-in check first (throws), then a spend that charges the person's askTracts bucket once however often it is called.
export async function spender(ctx: ActionCtx): Promise<Spend> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Sign in to ask");
  let charged: Promise<boolean> | null = null;
  return () => (charged ??= rateLimiter.limit(ctx, "askTracts", { key: identity.tokenIdentifier }).then((r) => r.ok));
}

type Loaded = { values: TractValue[]; leftOut: number };

// DYCU's server is the weak link: a failed read is "unavailable", never a partial answer. Rows are kept 10 minutes under
// tractrows: (not tracts:, so tractDetail never serves them) and shared by everyone asking the same thing.
export async function loadValues(ctx: ActionCtx, r: Resolved): Promise<Loaded | null> {
  const fields = ["GEOID", r.column, ...(r.range?.kind === "moe90" ? [r.range.moe] : r.range?.kind === "ci95" ? [r.range.lo, r.range.hi] : [])];
  const key = `tractrows:${await hashInputs({ url: r.url, fields })}`;
  // The cache only saves DYCU a request: a cache that fails to read or write must never change the answer.
  try {
    const hit: string | null = await ctx.runQuery(internal.map.cached, { key, now: Date.now() });
    if (hit) return JSON.parse(hit) as Loaded;
  } catch (e) {
    console.error(`Tract rows cache read failed for ${key}: ${e instanceof Error ? e.message : String(e)}`);
  }
  let rows: Loaded;
  try {
    rows = await fetchTractRows(r.url, r.column, r.range);
  } catch (e) {
    console.error(`Tract rows failed for ${r.url}: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
  try {
    await ctx.runMutation(internal.map.remember, { key, result: JSON.stringify(rows), expiresAt: Date.now() + MAP_TTL_MS });
  } catch (e) {
    console.error(`Tract rows cache write failed for ${key}: ${e instanceof Error ? e.message : String(e)}`);
  }
  return rows;
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
    const spend = await spender(ctx);
    const r = await resolveTract(ctx, args.code, args.column, args.place, args.year, spend);
    if ("status" in r) return r;
    const rows = await loadValues(ctx, r);
    if (!rows) return { status: "unavailable" };
    const defs = await ctx.runQuery(internal.tracts.dycuDefs, {});
    const ranked = rankValues(rows.values, args.direction);
    const { key, save } = await store(ctx, { tool: "rank", ...args, year: r.year, code: r.family.code, column: r.column });
    const detail: RankDetail = {
      status: "ok", tool: "rank", header: header(r, args.place, r.year, rows.values.length, rows.leftOut), direction: args.direction,
      top: ranked.top.map((v) => toRow(v, r.year, defs)),
      ties: ranked.ties.map((v) => toRow(v, r.year, defs)), tieCount: ranked.ties.length,
      unreliable: ranked.unreliable.map((v) => toRow(v, r.year, defs)), unreliableCount: ranked.unreliable.length,
      highlighted: ranked.top.map((v) => v.geoid), key,
    };
    await save(detail); // the card gets every tie and every unreliable tract; the model gets the first ten of each, with the totals
    return { ...detail, ties: detail.ties.slice(0, 10), unreliable: detail.unreliable.slice(0, 10) };
  },
});

// The card's full answer by key. Anyone with the key may read it: it holds public DYCU data and expires in 10 minutes.
export const tractDetail = query({
  args: { key: v.string(), now: v.number() }, // the page passes its clock: queries don't read the wall clock
  handler: async (ctx, { key, now }): Promise<RankDetail | ChangeDetail | RelateDetail | { status: "expired" }> => {
    if (!key.startsWith("tracts:")) return { status: "expired" };
    const row = await ctx.db.query("mapCache").withIndex("by_key", (q) => q.eq("key", key)).first();
    return row && row.expiresAt > now ? JSON.parse(row.result) : { status: "expired" };
  },
});

export type ChangeRow = { geoid: string; tract: string; neighborhood: string | null; from: TractRow; to: TractRow; change: number; direction: "increase" | "decrease" };
export type ChangeDetail = { status: "ok"; tool: "change"; header: Header; from: string; to: string; increases: number; decreases: number; none: number; unreliableCount: number; changes: ChangeRow[]; highlighted: string[]; key: string };
export type Point = { geoid: string; tract: string; neighborhood: string | null; a: [number, number | null, number | null]; b: [number, number | null, number | null]; mark: "fits" | "close" | null };
export type RelateDetail = {
  status: "ok"; tool: "relate"; mode: "relate" | "mismatch"; a: Header; b: Header; n: number; rho: number;
  strength: "too-few" | "little" | "weak" | "moderate" | "strong"; direction: "higher" | "lower";
  aSide?: "high" | "low"; bSide?: "high" | "low"; cutA?: number; cutB?: number;
  fits: { a: TractRow; b: TractRow }[]; close: { a: TractRow; b: TractRow }[]; points: Point[]; highlighted: string[]; closeIds: string[]; key: string;
};

// A change counts only when both years are reliable (spec §5 rule 2); tracts that aren't are counted apart, never listed.
export const compareYears = action({
  args: { code: v.string(), column: v.string(), place: vPlace, from: v.string(), to: v.string() },
  handler: async (ctx, args): Promise<ChangeDetail | Refusal> => {
    const spend = await spender(ctx); // sign-in check now; the budget is spent once, before the first DYCU fetch
    const r1 = await resolveTract(ctx, args.code, args.column, args.place, args.from, spend);
    if ("status" in r1) return r1;
    const r2 = await resolveTract(ctx, args.code, r1.column, args.place, args.to, spend);
    if ("status" in r2) return r2;
    const [y1, y2] = await Promise.all([loadValues(ctx, r1), loadValues(ctx, r2)]);
    if (!y1 || !y2) return { status: "unavailable" };
    const defs = await ctx.runQuery(internal.tracts.dycuDefs, {});
    const later = new Map(y2.values.map((x) => [x.geoid, x]));
    let increases = 0, decreases = 0, none = 0, unreliableCount = 0;
    const changes: ChangeRow[] = [];
    for (const a of y1.values) {
      const b = later.get(a.geoid);
      if (!b) continue;
      if (isUnreliable(a) || isUnreliable(b)) { unreliableCount++; continue; }
      const d = changeOf(a, b);
      if (d === "none") { none++; continue; }
      if (d === "increase") increases++; else decreases++;
      const to = toRow(b, r2.year, defs);
      changes.push({ geoid: a.geoid, tract: to.tract, neighborhood: to.neighborhood, from: toRow(a, r1.year, defs), to, change: b.value - a.value, direction: d });
    }
    changes.sort((p, q) => Math.abs(q.change) - Math.abs(p.change));
    const { key, save } = await store(ctx, { tool: "change", ...args, from: r1.year, to: r2.year, code: r1.family.code, column: r1.column });
    const matched = increases + decreases + none + unreliableCount;
    const detail: ChangeDetail = {
      status: "ok", tool: "change", header: header(r1, args.place, `${r1.year}\u2013${r2.year}`, matched, y1.values.length + y1.leftOut - matched),
      from: r1.year, to: r2.year, increases, decreases, none, unreliableCount, changes: changes.slice(0, 10), highlighted: changes.slice(0, 10).map((c) => c.geoid), key,
    };
    await save(detail);
    return detail;
  },
});

const vSide = v.union(v.literal("high"), v.literal("low"));
const vPick = v.object({ code: v.string(), column: v.string() });

export const relateTracts = action({
  args: { a: vPick, b: vPick, place: vPlace, year: v.string(), mode: v.union(v.literal("relate"), v.literal("mismatch")), aSide: v.optional(vSide), bSide: v.optional(vSide) },
  handler: async (ctx, args): Promise<Omit<RelateDetail, "points"> | Refusal> => {
    const spend = await spender(ctx); // one charge covers both datasets
    const ra = await resolveTract(ctx, args.a.code, args.a.column, args.place, args.year, spend);
    if ("status" in ra && ra.status !== "choose-year") return ra;
    const rb = "status" in ra ? ra : await resolveTract(ctx, args.b.code, args.b.column, args.place, args.year, spend);
    if ("status" in ra || "status" in rb) {
      if ("status" in rb && rb.status !== "choose-year") return rb;
      // A place/year one dataset lacks: say which the two share.
      const [fa, fb] = await Promise.all([ctx.runQuery(internal.tracts.familyForTracts, { code: args.a.code }), ctx.runQuery(internal.tracts.familyForTracts, { code: args.b.code })]);
      const pa = (fa?.members ?? []).map(({ place, year }) => ({ place, year }));
      const shared = pa.filter((x) => (fb?.members ?? []).some((y) => y.place === x.place && sameYear(y.year, x.year)));
      return { status: "choose-year", available: pa, shared };
    }
    const [va, vb] = await Promise.all([loadValues(ctx, ra), loadValues(ctx, rb)]);
    if (!va || !vb) return { status: "unavailable" };
    const defs = await ctx.runQuery(internal.tracts.dycuDefs, {});
    const bBy = new Map(vb.values.map((x) => [x.geoid, x]));
    const pairs = va.values.flatMap((a) => (bBy.has(a.geoid) ? [{ geoid: a.geoid, a, b: bBy.get(a.geoid)! }] : []));
    const ok = pairs.filter((p) => !isUnreliable(p.a) && !isUnreliable(p.b));
    const rho = ok.length ? spearman(ok.map((p) => p.a.value), ok.map((p) => p.b.value)) : 0;
    const verdict = relationship(rho, ok.length);
    const mm = args.mode === "mismatch" && ok.length >= 20 ? mismatch(pairs, args.aSide ?? "high", args.bSide ?? "low") : null;
    const fitsIds = new Set(mm?.fits.map((p) => p.geoid));
    const closeIds = new Set(mm?.close.map((p) => p.geoid));
    const both = (p: { a: TractValue; b: TractValue }) => ({ a: toRow(p.a, ra.year, defs), b: toRow(p.b, ra.year, defs) });
    const { key, save } = await store(ctx, { tool: "relate", ...args, year: ra.year, a: { code: ra.family.code, column: ra.column }, b: { code: rb.family.code, column: rb.column } });
    const detail: RelateDetail = {
      status: "ok", tool: "relate", mode: args.mode,
      a: header(ra, args.place, ra.year, pairs.length, va.values.length + va.leftOut - pairs.length), b: header(rb, args.place, rb.year, pairs.length, vb.values.length + vb.leftOut - pairs.length),
      n: ok.length, rho, strength: verdict.strength, direction: verdict.direction,
      ...(mm ? { aSide: args.aSide ?? "high", bSide: args.bSide ?? "low", cutA: mm.cutA, cutB: mm.cutB } : {}),
      fits: (mm?.fits ?? []).slice(0, 10).map(both), close: (mm?.close ?? []).slice(0, 10).map(both),
      points: pairs.map((p) => {
        const row = toRow(p.a, ra.year, defs);
        return { geoid: p.geoid, tract: row.tract, neighborhood: row.neighborhood, a: [p.a.value, p.a.lo, p.a.hi], b: [p.b.value, p.b.lo, p.b.hi], mark: fitsIds.has(p.geoid) ? "fits" : closeIds.has(p.geoid) ? "close" : null };
      }),
      highlighted: [...fitsIds].slice(0, 10), closeIds: [...closeIds].slice(0, 10), key,
    };
    await save(detail);
    const { points: _points, ...forModel } = detail;
    return forModel;
  },
});
