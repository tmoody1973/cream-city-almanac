import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalQuery, type ActionCtx } from "./_generated/server";
import { portraitAreas } from "./factSheet";
import { BOUNDARY_KINDS, boundariesAt, tractGeoid, type AddressBoundaries, type BoundaryKind, type Cover } from "./lib/boundaries";
import type { FoundArea } from "./tracts";
import { vBoundaryKind, vPlaceType } from "./validators";
import { checkAddress, geocodeUrl, parseGeocode, withCity } from "./lib/geocode";
import { inBbox, inShape, type Geometry } from "./lib/geo";
import { fetchWithTimeout } from "./lib/http";
import { placeKey } from "./lib/portrait";
import { tractNumber } from "./lib/tractData";
import { latestDefYear, neighborhoodsFor, type DycuDef } from "./lib/tractNames";
import { rateLimiter } from "./limits";

// Address → the places it lies in (spec 2026-10-12-address-lookup §4). Never stores the address, never logs it, never
// returns anything about the property.
export type PlaceResult =
  | { status: "ok"; matched: string; tract: { geoid: string; number: string }; neighborhood: string | null; inCity: boolean; dycu: { name: string; slug: string | null }[]; boundaries: AddressBoundaries }
  | { status: "bad-address" | "no-match" | "unavailable" | "outside-county" | "busy" };

const TIMEOUT_MS = 10_000;
const COUNTY = "55079"; // Milwaukee County's tract GEOID prefix

export const placeAt = internalQuery({
  args: { lat: v.number(), lon: v.number(), geoid: v.string() },
  handler: async (ctx, { lat, lon, geoid }) => {
    const p = { lat, lon };
    const hoods = await ctx.db.query("neighborhoods").withIndex("by_definition_matchKey", (q) => q.eq("definition", "city")).collect();
    const hood = hoods.find((h) => h.bbox && h.geometry && inBbox(p, h.bbox) && inShape(p, JSON.parse(h.geometry) as Geometry));
    const defs: DycuDef[] = (await ctx.db.query("neighborhoods").withIndex("by_definition_matchKey", (q) => q.eq("definition", "dycu")).collect()).map((d) => ({ name: d.name, tracts: d.tracts }));
    const names = neighborhoodsFor(tractNumber(geoid), latestDefYear(defs), defs);
    const sheets = await portraitAreas(ctx);
    const dycu = names.map((name) => ({ name, slug: sheets.find((a) => placeKey(a.name) === placeKey(name))?.slug ?? null }));
    // ponytail: reads every stored boundary (≈550 rows, 1.75 MB) per lookup; a bbox table would cut it if lookups get busy.
    const boundaries = boundariesAt(p, await ctx.db.query("boundaries").collect());
    return { neighborhood: hood?.name ?? null, dycu, boundaries };
  },
});

// `a` is already checked (checkAddress): bad input is refused before any allowance is spent.
async function locate(ctx: ActionCtx, a: string): Promise<PlaceResult> {
  let g;
  try {
    const res = await fetchWithTimeout(geocodeUrl(withCity(a)), {}, TIMEOUT_MS);
    if (!res.ok) { console.error(`Address lookup failed: geocoder status ${res.status}`); return { status: "unavailable" }; }
    g = parseGeocode(await res.json());
  } catch (e) {
    // The error's text can hold the request URL, and so the address: log only its kind.
    console.error(`Address lookup failed: ${e instanceof Error ? e.name : "error"}`);
    return { status: "unavailable" };
  }
  if (!g) return { status: "no-match" };
  if (!g.geoid) return { status: "unavailable" }; // a match without its tract: the reply was incomplete, not outside the County
  if (!g.geoid.startsWith(COUNTY)) return { status: "outside-county" };
  const at = await ctx.runQuery(internal.places.placeAt, { lat: g.lat, lon: g.lon, geoid: g.geoid });
  return { status: "ok", matched: g.matched, tract: { geoid: g.geoid, number: tractNumber(g.geoid) }, neighborhood: at.neighborhood, inCity: at.neighborhood !== null, dycu: at.dycu, boundaries: at.boundaries };
}

export const findPlace = action({
  args: { address: v.string() },
  handler: async (ctx, { address }): Promise<PlaceResult> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Sign in to ask");
    const a = checkAddress(address);
    if (!a) return { status: "bad-address" };
    if (!(await rateLimiter.limit(ctx, "askPlace", { key: identity.tokenIdentifier })).ok) return { status: "busy" };
    return locate(ctx, a);
  },
});

export const placeForBox = action({
  args: { address: v.string() },
  handler: async (ctx, { address }): Promise<PlaceResult> => {
    const a = checkAddress(address);
    if (!a) return { status: "bad-address" };
    if (!(await rateLimiter.limit(ctx, "placePublic")).ok) return { status: "busy" };
    return locate(ctx, a);
  },
});

// Which City boundaries cover a place (spec 2026-10-12-boundaries-design §6). Reads the weekly overlap table; no outside calls.
export type PlaceType = "tract" | "city" | "dycu" | "district";
export type BoundariesResult =
  | { status: "ok"; place: { type: PlaceType; name: string; details?: Record<string, string> }; kinds: BoundaryKind[]; asOf: number; covers: Cover[] }
  | { status: "unknown-place"; suggestions: string[] }
  | { status: "outside-city" }
  | { status: "not-loaded" };

export const overlapFor = internalQuery({
  args: { placeType: vPlaceType, place: v.string() },
  handler: async (ctx, { placeType, place }) => {
    if (!(await ctx.db.query("boundaryOverlaps").first())) return { kind: "not-loaded" as const };
    const row = await ctx.db.query("boundaryOverlaps").withIndex("by_place", (q) => q.eq("placeType", placeType).eq("place", place)).unique();
    if (!row) return { kind: "missing" as const };
    const own = placeType === "district"
      ? (await ctx.db.query("boundaries").withIndex("by_kind", (q) => q.eq("kind", "district")).collect()).find((b) => b.name === `District ${place}`)?.details
      : undefined;
    return { kind: "row" as const, covers: row.covers, builtAt: row.builtAt, own };
  },
});

const unknown = (suggestions: string[] = []): BoundariesResult => ({ status: "unknown-place", suggestions });

export const boundariesFor = action({
  args: { neighborhood: v.optional(v.string()), map: v.optional(v.union(v.literal("city"), v.literal("dycu"))), tract: v.optional(v.string()), district: v.optional(v.number()), kinds: v.optional(v.array(vBoundaryKind)) },
  handler: async (ctx, a): Promise<BoundariesResult> => {
    if (!(await ctx.auth.getUserIdentity())) throw new Error("Sign in to ask");
    const given = [a.neighborhood?.trim(), a.tract?.trim(), a.district].filter((x) => x !== undefined && x !== "");
    if (given.length !== 1) return unknown();
    let target: { placeType: PlaceType; place: string; name: string };
    if (a.tract) {
      const geoid = tractGeoid(a.tract);
      if (!geoid) return unknown();
      target = { placeType: "tract", place: geoid, name: `Census tract ${tractNumber(geoid)}` };
    } else if (a.district !== undefined) {
      if (!Number.isInteger(a.district) || a.district < 1 || a.district > 15) return unknown();
      target = { placeType: "district", place: String(a.district), name: `District ${a.district}` };
    } else {
      const f: FoundArea = await ctx.runQuery(internal.tracts.findArea, { asked: a.neighborhood!.trim().slice(0, 80), map: a.map ?? "city" });
      if (f.kind !== "one") return unknown(f.nearest);
      target = { placeType: f.area.map, place: f.area.name, name: f.area.name };
    }
    const r = await ctx.runQuery(internal.places.overlapFor, { placeType: target.placeType, place: target.place });
    if (r.kind === "not-loaded") return { status: "not-loaded" };
    if (r.kind === "missing") return unknown();
    if (target.placeType === "tract" && r.covers.length === 0) return { status: "outside-city" };
    const kinds = a.kinds?.length ? BOUNDARY_KINDS.filter((k) => a.kinds!.includes(k)) : [...BOUNDARY_KINDS];
    return {
      status: "ok",
      place: { type: target.placeType, name: target.name, ...(r.own ? { details: r.own } : {}) },
      kinds,
      asOf: r.builtAt,
      covers: r.covers.filter((c) => kinds.includes(c.kind)),
    };
  },
});
