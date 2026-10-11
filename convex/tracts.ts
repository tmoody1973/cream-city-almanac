import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalQuery, query, type ActionCtx } from "./_generated/server";
import { MAP_TTL_MS } from "./map";
import { fetchColumns } from "./lib/arcgis";
import { chicagoDay } from "./lib/ask";
import { hashInputs } from "./lib/hash";
import { columnKind, fetchTractRows, isNumericField, rangeColumns, tractNumber, type RangeCols } from "./lib/tractData";
import { neighborhoodFor, type DycuDef } from "./lib/tractNames";
import { byClearance, changeOf, isUnreliable, mismatch, rankValues, relationship, spearman, type TractValue } from "./lib/tractStats";
import { rateLimiter } from "./limits";

// Ask's tract analyses (docs/superpowers/specs/2026-10-10-ask-analyzes-design.md). The model gets a compact answer;
// the full one waits in mapCache under a tracts: key for the card (tractDetail), so per-tract points never ride in
// the conversation.

export type TractRow = { geoid: string; tract: string; neighborhood: string | null; value: number; lo: number | null; hi: number | null; unreliable: boolean };
export type Header = { code: string; name: string; column: string; meaning: string; kind: "rate" | "count" | "value"; place: string; year: string; n: number; leftOut: number; confidence: string | null; url: string; caveats: string[] };
type Slot = { place: string; year: string };
// A refusal can say which dataset (relateTracts: "a" or "b") or which year (compareYears: the second) it is about, and
// relateTracts may carry the other cheap problems it found in the same pass.
type Tag = { dataset?: "a" | "b"; year?: string; also?: Refusal[] };
export type Refusal = Tag & (
  | { status: "not-found" }
  | { status: "not-tract" }
  | { status: "choose-column"; columns: { column: string; meaning: string; range: boolean }[] }
  | { status: "choose-year"; available: Slot[] | { a: Slot[]; b: Slot[] }; shared?: Slot[]; reason?: string }
  | { status: "unavailable" }
  | { status: "busy" }
);
export type RankDetail = { status: "ok"; tool: "rank"; header: Header; direction: "high" | "low"; top: TractRow[]; ties: TractRow[]; tieCount: number; unreliable: TractRow[]; unreliableCount: number; highlighted: string[]; key: string };

const vPlace = v.union(v.literal("City"), v.literal("County"));
const CONFIDENCE = { moe90: "90% confidence (Census)", ci95: "95% confidence (CDC)" } as const;

export type Fam = { code: string; name: string; members: { place: string; year: string; url: string }[]; glossary: { field: string; meaning: string }[]; caveats: string[] };

export const familyForTracts = internalQuery({
  args: { code: v.string() },
  handler: async (ctx, { code }): Promise<Fam | null> => {
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

const slotsOf = (fam: Fam | null): Slot[] => (fam?.members ?? []).map(({ place, year }) => ({ place, year }));
export type Looked = { fam: Fam; member: Fam["members"][number] };

// The database-only half of the checks (spec §4): is there such a dataset, and does it have this place and year? Free.
export function pickMember(fam: Fam | null, place: string, year: string): Looked | Refusal {
  if (!fam) return { status: "not-found" };
  const member = fam.members.find((m) => m.place === place && sameYear(m.year, year));
  return member ? { fam, member } : { status: "choose-year", available: slotsOf(fam) };
}

// The half that asks DYCU. Throws nothing: a refusal is an answer the model acts on. `spend` is called once, before the
// first call to DYCU's server, so a refusal that never reached DYCU costs the person nothing. Pass the same memoized
// spend (see spender) to every resolve in one action.
export async function resolveLooked(ctx: ActionCtx, { fam, member }: Looked, column: string, spend: Spend): Promise<Resolved | Refusal> {
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
  // Margins, confidence limits and the map's own geometry columns (Shape__Area, ALAND, AWATER) are never the question.
  const numeric = fields.filter((f) => isNumericField(f) && !/_moe$|confidence_limit$|(low|high)_confidence$|^Shape__|^ALAND$|^AWATER$/i.test(f.name));
  const names = fields.map((f) => f.name);
  const col = numeric.find((f) => f.name.toLowerCase() === column.trim().toLowerCase());
  if (!col) return { status: "choose-column", columns: numeric.map((f) => ({ column: f.name, meaning: meaningOf(f.name), range: rangeColumns(f.name, names, fam.glossary) !== null })) };
  return { family: { code: fam.code, name: fam.name, caveats: fam.caveats }, url: member.url, year: member.year, column: col.name, meaning: meaningOf(col.name), range: rangeColumns(col.name, names, fam.glossary) };
}

export async function resolveTract(ctx: ActionCtx, code: string, column: string, place: string, year: string, spend: Spend): Promise<Resolved | Refusal> {
  const fam: Fam | null = await ctx.runQuery(internal.tracts.familyForTracts, { code });
  const looked = pickMember(fam, place, year);
  return "status" in looked ? looked : resolveLooked(ctx, looked, column, spend);
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

// A card's full answer is a snapshot kept for the day (the key already names it), so a card drawn earlier keeps its
// detail; DYCU's rows (tractrows:) stay at MAP_TTL_MS.
const DETAIL_TTL_MS = 24 * 3_600_000;
export async function store(ctx: ActionCtx, args: unknown) {
  const key = `tracts:${await hashInputs({ args, day: chicagoDay(Date.now()) })}`;
  return { key, save: (detail: unknown) => ctx.runMutation(internal.map.remember, { key, result: JSON.stringify(detail), expiresAt: Date.now() + DETAIL_TTL_MS }) };
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
    await save(detail); // the card gets every tie and every unreliable tract; the model gets the first three of each, with the totals
    return { ...detail, ties: detail.ties.slice(0, 3), unreliable: detail.unreliable.slice(0, 3) };
  },
});

// The card's full answer by key. Anyone with the key may read it: it holds public DYCU data and expires in a day.
export const tractDetail = query({
  args: { key: v.string(), now: v.number() }, // the page passes its clock: queries don't read the wall clock
  handler: async (ctx, { key, now }): Promise<RankDetail | ChangeDetail | RelateDetail | { status: "expired" }> => {
    if (!key.startsWith("tracts:")) return { status: "expired" };
    const row = await ctx.db.query("mapCache").withIndex("by_key", (q) => q.eq("key", key)).first();
    return row && row.expiresAt > now ? JSON.parse(row.result) : { status: "expired" };
  },
});

export type ChangeRow = { geoid: string; tract: string; neighborhood: string | null; from: TractRow; to: TractRow; change: number; direction: "increase" | "decrease" };
export type ChangeDetail = { status: "ok"; tool: "change"; header: Header; note: string | null; from: string; to: string; increases: number; decreases: number; none: number; unreliableCount: number; changeCount: number; changes: ChangeRow[]; highlighted: string[]; key: string };
export type Point = { geoid: string; tract: string; neighborhood: string | null; a: [number, number | null, number | null]; b: [number, number | null, number | null]; unreliable: boolean; mark: "fits" | "close" | null };
export type RelateDetail = {
  status: "ok"; tool: "relate"; mode: "relate" | "mismatch"; a: Header; b: Header; n: number; unreliableCount: number; rho: number;
  strength: "too-few" | "little" | "weak" | "moderate" | "strong"; direction: "higher" | "lower";
  aSide?: "high" | "low"; bSide?: "high" | "low"; cutA?: number; cutB?: number;
  fits: { a: TractRow; b: TractRow }[]; fitsCount: number; close: { a: TractRow; b: TractRow }[]; closeCount: number;
  points: Point[]; highlighted: string[]; closeIds: string[]; key: string;
};

// What the model sees: the card reads the rest (caveats, urls, ids, points, every finding) from tractDetail by key.
type SlimHeader = Omit<Header, "caveats" | "url">;
export type ChangeAnswer = Omit<ChangeDetail, "header" | "highlighted"> & { header: SlimHeader };
export type RelateAnswer = Omit<RelateDetail, "a" | "b" | "points" | "highlighted" | "closeIds"> & { a: SlimHeader; b: SlimHeader };
const slim = ({ caveats: _caveats, url: _url, ...rest }: Header): SlimHeader => rest;
const ANSWER_ROWS = 10;
// A refusal that came from fetching one dataset says which; running out of allowance isn't about either.
const tag = (r: Refusal, dataset: "a" | "b"): Refusal => (r.status === "busy" ? r : { ...r, dataset });

// Why a change between releases is not a clean year-to-year comparison; the card shows it and the model may say it.
const YEAR_NOTE = {
  moe90: "Each year is a 5-year estimate; neighboring releases share four years of responses, so a change is not a clean year-to-year comparison.",
  ci95: "Each year is a model estimate; compare releases with care.",
} as const;

// A change counts only when both years are reliable (spec §5 rule 2); tracts that aren't are counted apart, never listed.
// The card gets every clear change; the model gets the largest ten and the totals.
export const compareYears = action({
  args: { code: v.string(), column: v.string(), place: vPlace, from: v.string(), to: v.string() },
  handler: async (ctx, args): Promise<ChangeAnswer | Refusal> => {
    const spend = await spender(ctx); // sign-in check now; the budget is spent once, before the first DYCU fetch
    const fam: Fam | null = await ctx.runQuery(internal.tracts.familyForTracts, { code: args.code });
    const l1 = pickMember(fam, args.place, args.from);
    if ("status" in l1) return l1;
    const l2 = pickMember(fam, args.place, args.to);
    if ("status" in l2) return { ...l2, year: args.to };
    if (sameYear(l1.member.year, l2.member.year)) return { status: "choose-year", available: slotsOf(fam), reason: "pick two different years" };
    const r1 = await resolveLooked(ctx, l1, args.column, spend);
    if ("status" in r1) return r1;
    const r2 = await resolveLooked(ctx, l2, r1.column, spend);
    if ("status" in r2) return r2.status === "busy" ? r2 : { ...r2, year: args.to };
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
    // Left out: tracts only one year has, plus the rows each year dropped for having no usable value.
    const leftOut = y1.values.length - matched + (y2.values.length - matched) + y1.leftOut + y2.leftOut;
    const detail: ChangeDetail = {
      status: "ok", tool: "change", header: header(r1, args.place, `${r1.year}\u2013${r2.year}`, matched, leftOut), note: r1.range ? YEAR_NOTE[r1.range.kind] : null,
      from: r1.year, to: r2.year, increases, decreases, none, unreliableCount, changeCount: changes.length, changes, highlighted: changes.map((c) => c.geoid), key,
    };
    await save(detail);
    const { highlighted: _highlighted, ...rest } = detail;
    return { ...rest, header: slim(detail.header), changes: changes.slice(0, ANSWER_ROWS) };
  },
});

const vSide = v.union(v.literal("high"), v.literal("low"));
const vPick = v.object({ code: v.string(), column: v.string() });

export const relateTracts = action({
  args: { a: vPick, b: vPick, place: vPlace, year: v.string(), mode: v.union(v.literal("relate"), v.literal("mismatch")), aSide: v.optional(vSide), bSide: v.optional(vSide) },
  handler: async (ctx, args): Promise<RelateAnswer | Refusal> => {
    const spend = await spender(ctx); // one charge covers both datasets
    // Every database-only problem with either dataset comes back at once, before anything is spent or fetched.
    const [fa, fb]: (Fam | null)[] = await Promise.all([ctx.runQuery(internal.tracts.familyForTracts, { code: args.a.code }), ctx.runQuery(internal.tracts.familyForTracts, { code: args.b.code })]);
    const pa = pickMember(fa, args.place, args.year);
    const pb = pickMember(fb, args.place, args.year);
    if ("status" in pa || "status" in pb) {
      const found = [...("status" in pa ? [tag(pa, "a")] : []), ...("status" in pb ? [tag(pb, "b")] : [])];
      const hard = found.filter((r) => r.status !== "choose-year");
      if (hard.length) {
        const [first, ...rest] = [...hard, ...found.filter((r) => r.status === "choose-year")];
        return rest.length ? { ...first, also: rest } : first;
      }
      const sa = slotsOf(fa);
      return { status: "choose-year", available: { a: sa, b: slotsOf(fb) }, shared: sa.filter((x) => slotsOf(fb).some((y) => y.place === x.place && sameYear(y.year, x.year))) };
    }
    const ra = await resolveLooked(ctx, pa, args.a.column, spend);
    if ("status" in ra) return tag(ra, "a");
    const rb = await resolveLooked(ctx, pb, args.b.column, spend);
    if ("status" in rb) return tag(rb, "b");
    const [va, vb] = await Promise.all([loadValues(ctx, ra), loadValues(ctx, rb)]);
    if (!va || !vb) return { status: "unavailable" };
    const defs = await ctx.runQuery(internal.tracts.dycuDefs, {});
    const bBy = new Map(vb.values.map((x) => [x.geoid, x]));
    const pairs = va.values.flatMap((a) => (bBy.has(a.geoid) ? [{ geoid: a.geoid, a, b: bBy.get(a.geoid)! }] : []));
    const ok = pairs.filter((p) => !isUnreliable(p.a) && !isUnreliable(p.b));
    const rho = ok.length ? spearman(ok.map((p) => p.a.value), ok.map((p) => p.b.value)) : 0;
    const verdict = relationship(rho, ok.length);
    const aSide = args.aSide ?? "high", bSide = args.bSide ?? "low";
    const mm = args.mode === "mismatch" && ok.length >= 20 ? mismatch(pairs, aSide, bSide) : null;
    // Most clearly past the cutoffs first, so the ten the model names are the strongest cases, not the first found.
    const fits = mm ? byClearance(mm.fits, aSide, bSide, mm.cutA, mm.cutB, "range") : [];
    const close = mm ? byClearance(mm.close, aSide, bSide, mm.cutA, mm.cutB, "value") : [];
    const fitsIds = new Set(fits.map((p) => p.geoid));
    const closeIds = new Set(close.map((p) => p.geoid));
    const both = (p: { a: TractValue; b: TractValue }) => ({ a: toRow(p.a, ra.year, defs), b: toRow(p.b, ra.year, defs) });
    const { key, save } = await store(ctx, { tool: "relate", ...args, year: ra.year, a: { code: ra.family.code, column: ra.column }, b: { code: rb.family.code, column: rb.column } });
    const detail: RelateDetail = {
      status: "ok", tool: "relate", mode: args.mode,
      a: header(ra, args.place, ra.year, pairs.length, va.values.length + va.leftOut - pairs.length), b: header(rb, args.place, rb.year, pairs.length, vb.values.length + vb.leftOut - pairs.length),
      n: ok.length, unreliableCount: pairs.length - ok.length, rho, strength: verdict.strength, direction: verdict.direction,
      ...(mm ? { aSide, bSide, cutA: mm.cutA, cutB: mm.cutB } : {}),
      fits: fits.map(both), fitsCount: fits.length, close: close.map(both), closeCount: close.length,
      points: pairs.map((p) => {
        const row = toRow(p.a, ra.year, defs);
        return { geoid: p.geoid, tract: row.tract, neighborhood: row.neighborhood, a: [p.a.value, p.a.lo, p.a.hi], b: [p.b.value, p.b.lo, p.b.hi], unreliable: isUnreliable(p.a) || isUnreliable(p.b), mark: fitsIds.has(p.geoid) ? "fits" : closeIds.has(p.geoid) ? "close" : null };
      }),
      highlighted: [...fitsIds], closeIds: [...closeIds], key,
    };
    await save(detail);
    const { points: _points, highlighted: _highlighted, closeIds: _closeIds, ...rest } = detail;
    return { ...rest, a: slim(detail.a), b: slim(detail.b), fits: detail.fits.slice(0, ANSWER_ROWS), close: detail.close.slice(0, ANSWER_ROWS) };
  },
});
