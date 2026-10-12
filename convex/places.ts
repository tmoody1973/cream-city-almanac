import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalQuery, type ActionCtx } from "./_generated/server";
import { portraitAreas } from "./factSheet";
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
  | { status: "ok"; matched: string; tract: { geoid: string; number: string }; neighborhood: string | null; inCity: boolean; dycu: { name: string; slug: string | null }[] }
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
    return { neighborhood: hood?.name ?? null, dycu };
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
  return { status: "ok", matched: g.matched, tract: { geoid: g.geoid, number: tractNumber(g.geoid) }, neighborhood: at.neighborhood, inCity: at.neighborhood !== null, dycu: at.dycu };
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
