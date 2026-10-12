# Address Lookup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn an address or intersection into the census tract, the City neighborhood and DYCU's area it lies in. It works in Ask (a card) and in a "Find your neighborhood" box on `/n`. The address is sent only to the Census geocoder; nothing is stored, and nothing about the property is ever shown.

**Architecture:**
- **Request and reply:** `convex/lib/geocode.ts` (pure) builds the Census geocoder request and reads its reply.
- **The lookup:** `convex/places.ts` holds the shared `locate()`. It runs the input check, the geocode, a database-only `placeAt` query (City neighborhood by point-in-shape, DYCU areas by tract, fact sheet slugs) and the result.
- **Two entry points:** the signed-in `findPlace` for Ask and the public `placeForBox` for `/n`, each with its own rate-limit bucket.
- **Screens:** the Ask card and the `/n` box use the result.

**Tech Stack:** Convex (actions, internal queries, convex-test, the rate-limiter component), Next.js 16, CopilotKit v2, Zod, Vitest, Playwright, the U.S. Census Bureau geocoder.

**Spec:** `docs/superpowers/specs/2026-10-12-address-lookup-design.md`

## Global Constraints

- **The geocoder:** `https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress?address=<encoded>&benchmark=Public_AR_Current&vintage=Current_Current&layers=Census%20Tracts&format=json`. No key. 10-second timeout.
- **The address** is trimmed, with spaces collapsed, and must be 3–200 characters. One with no city or ZIP gets ", Milwaukee, WI" added.
- **Nothing is stored:** `locate` writes nothing. Logs never contain the address, and error text from fetch, which includes the URL, is never logged.
- **No property information** is ever fetched or returned.
- **Statuses:** `ok`, `bad-address`, `no-match`, `unavailable`, `outside-county`, `busy`.
- **Rate limits:**
  - `askPlace`: token bucket, 60 per hour, capacity 20, per person;
  - `placePublic`: token bucket, 60 per minute, capacity 20, site-wide.
- **Exact copy:**
  - privacy line: "This address was sent to the U.S. Census Bureau's geocoder to find its location; Cream City Almanac doesn't keep it.";
  - no-match: "The Census Bureau couldn't find that address. Try the house number, street name and ZIP code.";
  - unavailable: "The address service didn't respond. Try again shortly.";
  - outside-county: "That address is outside Milwaukee County.";
  - bad-address: "Type a street address or an intersection, like 2400 W Center St."
- **Commits** end with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`. Never stage `.superpowers/` or `clerk-creamcityalmanac.app.zone`.

## Review Focus

1. **An address with no city** ("2400 W Center St") must find Milwaukee, not a same-named street elsewhere. ", Milwaukee, WI" is added when no city, "WI" or 53xxx ZIP is present (Task 1 test).
2. **The geocoder's error text contains the address** (via the URL). It must never reach a log or a stored note (Task 2 test: `console.error` spy).
3. **A point exactly on a boundary** between two neighborhoods gets exactly one (inShape's half-open rule). A County address outside the City gets `inCity: false` with its tract, never a guessed neighborhood (Task 2 test).
4. **A lookup changes no table** (Task 2 test counts every app table before and after).
5. **The public box can't be used to hammer the Census:** `placePublic` gives `busy` after its capacity (Task 2 test).

---

**Rulings carried from planning (re-ledger at execution):**
- **A tract in two DYCU areas opens the area named like the City neighborhood** (`sheetFor`). 2400 W Center St is in the City's Amani; its tract 88 is in DYCU's Metcalfe Park and Amani. The spec's examples said Harambee, which was wrong; corrected to Amani.
- **`/n` itself becomes a route** (`app/n/page.tsx`) listing the areas, with the box. Today the list appears only for an unknown slug. The spec calls `/n` "the fact sheet index".
- **No starter question for Ask:** Ask has no way to take one. The `/n` message for an unprofiled neighborhood links to `/ask` and shows the question to type ("What's the poverty rate in {neighborhood}'s tracts?").
- **`areas()` in `convex/factSheet.ts` is exported** (renamed `portraitAreas`), so `placeAt` reuses its placeKey grouping and slugs.
- **", Milwaukee, WI" is added to bare addresses.** The spec's scripted call already includes it, and the geocoder needs a city.

### Task 1: The geocoder request and reply

**Files:** create `convex/lib/geocode.ts`; test `tests/lib/geocode.test.ts`.

**Interfaces — Produces:**
- `checkAddress(raw: string): string | null`
- `withCity(a: string): string`
- `geocodeUrl(a: string): string`
- `type Geocoded = { matched: string; lat: number; lon: number; geoid: string | null }`
- `parseGeocode(body: unknown): Geocoded | null`, which throws on a malformed reply

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { checkAddress, geocodeUrl, parseGeocode, withCity } from "../../convex/lib/geocode";

const reply = (matches: unknown[]) => ({ result: { input: {}, addressMatches: matches } });
const match = (matchedAddress: string, x: number, y: number, geoid?: string) => ({ matchedAddress, coordinates: { x, y }, geographies: geoid ? { "Census Tracts": [{ GEOID: geoid }] } : {} });

describe("the address the person typed", () => {
  it("trims it, and refuses one too short or too long", () => {
    expect(checkAddress("  2400  W Center St ")).toBe("2400 W Center St");
    expect(checkAddress("ab")).toBeNull();
    expect(checkAddress("x".repeat(201))).toBeNull();
  });
  it("adds Milwaukee when no city, state or ZIP is given", () => {
    expect(withCity("2400 W Center St")).toBe("2400 W Center St, Milwaukee, WI");
    expect(withCity("2400 W Center St, Milwaukee")).toBe("2400 W Center St, Milwaukee");
    expect(withCity("2400 W Center St 53206")).toBe("2400 W Center St 53206");
    expect(withCity("N 2nd St and W Center St, WI")).toBe("N 2nd St and W Center St, WI");
  });
});

describe("the Census geocoder", () => {
  it("asks for the location and its 2020 tract in one request", () => {
    expect(geocodeUrl("2400 W Center St, Milwaukee, WI")).toBe("https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress?address=2400%20W%20Center%20St%2C%20Milwaukee%2C%20WI&benchmark=Public_AR_Current&vintage=Current_Current&layers=Census%20Tracts&format=json");
  });
  it("reads a match (street or intersection), no match, and refuses a malformed reply", () => {
    expect(parseGeocode(reply([match("2400 W CENTER ST, MILWAUKEE, WI, 53206", -87.9425, 43.0679, "55079008800")]))).toEqual({ matched: "2400 W CENTER ST, MILWAUKEE, WI, 53206", lat: 43.0679, lon: -87.9425, geoid: "55079008800" });
    expect(parseGeocode(reply([match("N 2ND ST & W CENTER ST, MILWAUKEE, WI, 53212", -87.91, 43.07, "55079185700")]))!.geoid).toBe("55079185700");
    expect(parseGeocode(reply([match("SOMEWHERE", -87.9, 43.0)]))!.geoid).toBeNull();
    expect(parseGeocode(reply([]))).toBeNull();
    expect(() => parseGeocode({ error: "x" })).toThrow();
  });
});
```

- [ ] **Step 2:** Run `npx vitest run tests/lib/geocode.test.ts`. Expected: FAIL (module not found).

- [ ] **Step 3: Implement** `convex/lib/geocode.ts`

```ts
// The U.S. Census Bureau's geocoder (spec 2026-10-12-address-lookup §4): an address or intersection → its location and
// 2020 census tract, in one request. Free, no key. Pure: building the request and reading the reply.
const GEOCODER = "https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress";

export function checkAddress(raw: string): string | null {
  const a = raw.trim().replace(/\s+/g, " ");
  return a.length >= 3 && a.length <= 200 ? a : null;
}

// The geocoder needs a city; a bare street address means Milwaukee here.
export const withCity = (a: string) => (/\bmilwaukee\b|\bwi\b|\bwisconsin\b|\b53\d{3}\b/i.test(a) ? a : `${a}, Milwaukee, WI`);

export const geocodeUrl = (a: string) =>
  `${GEOCODER}?address=${encodeURIComponent(a)}&benchmark=Public_AR_Current&vintage=Current_Current&layers=Census%20Tracts&format=json`;

export type Geocoded = { matched: string; lat: number; lon: number; geoid: string | null };
type Match = { matchedAddress?: string; coordinates?: { x?: number; y?: number }; geographies?: Record<string, { GEOID?: string }[]> };

export function parseGeocode(body: unknown): Geocoded | null {
  const matches = (body as { result?: { addressMatches?: Match[] } })?.result?.addressMatches;
  if (!Array.isArray(matches)) throw new Error("Geocoder reply had no result");
  const m = matches[0];
  if (!m) return null;
  const lon = Number(m.coordinates?.x), lat = Number(m.coordinates?.y);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error("Geocoder match had no coordinates");
  return { matched: String(m.matchedAddress ?? ""), lat, lon, geoid: m.geographies?.["Census Tracts"]?.[0]?.GEOID ?? null };
}
```

- [ ] **Step 4:** Run `npx vitest run tests/lib/geocode.test.ts`. Expected: PASS (4).
- [ ] **Step 5: Commit:** "feat: read and build Census geocoder requests for address lookup".

---

### Task 2: The lookup

**Files:**
- Create: `convex/places.ts`, `convex/places.test.ts`
- Modify: `convex/limits.ts`, `convex/factSheet.ts` (export `portraitAreas`), `tests/helpers/fakeFetch.ts`

**Interfaces:**
- **Consumes:** Task 1.
- **Produces:**
  - `type PlaceResult` (spec §4)
  - `api.places.findPlace({ address }) → PlaceResult` (requires sign-in)
  - `api.places.placeForBox({ address }) → PlaceResult` (public)
  - `internal.places.placeAt({ lat, lon, geoid }) → { neighborhood: string | null; dycu: { name: string; slug: string | null }[] }`
  - fake-fetch options `geocoder?: (url: string) => unknown` and `geocoderStatus?: number`

- [ ] **Step 1: Write the failing test** in `convex/places.test.ts`

```ts
/// <reference types="vite/client" />
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { installFakeFetch } from "../tests/helpers/fakeFetch";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");
const reader = { subject: "u1", issuer: "test", tokenIdentifier: "test|u1" };
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const N03 = "document:neighborhood-portrait-spreadsheet";
// A square City neighborhood around 2400 W Center St; DYCU's Harambee is tract 88.
async function seed() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  await t.run(async (ctx) => {
    await ctx.db.insert("neighborhoods", { definition: "city", name: "Harambee", matchKey: "harambee", geometry: JSON.stringify({ type: "Polygon", coordinates: [[[-87.95, 43.06], [-87.93, 43.06], [-87.93, 43.08], [-87.95, 43.08], [-87.95, 43.06]]] }), bbox: { minLat: 43.06, maxLat: 43.08, minLon: -87.95, maxLon: -87.93 } });
    await ctx.db.insert("neighborhoods", { definition: "dycu", name: "Harambee", matchKey: "harambee", tracts: [{ years: [2024], tracts: ["88"] }] });
    await ctx.db.insert("families", { key: N03, code: "N03", name: "Neighborhood Portrait Spreadsheet", kind: "document", topic: "Neighborhoods", keywords: [], places: [], years: [2024], latestModified: "2026-01-22", baseSearchText: "", searchText: "", dictionaryTab: null });
    await ctx.db.insert("members", { familyKey: N03, hubId: "h24", title: "2024 Harambee Neighborhood Portrait Spreadsheet", yearLabel: "2024", place: "Harambee", years: [2024], kind: "document", landingPage: "", featureServerUrl: null, modified: "2026-01-22", downloads: {}, description: "", keywords: [] });
  });
  return t;
}
const reply = (lat: number, lon: number, geoid: string) => () => ({ result: { addressMatches: [{ matchedAddress: "2400 W CENTER ST, MILWAUKEE, WI, 53206", coordinates: { x: lon, y: lat }, geographies: { "Census Tracts": [{ GEOID: geoid }] } }] } });

describe("findPlace", () => {
  it("finds the tract, the City neighborhood and DYCU's area with its fact sheet", async () => {
    const t = await seed();
    installFakeFetch({ geocoder: reply(43.0679, -87.9425, "55079008800") });
    expect(await t.withIdentity(reader).action(api.places.findPlace, { address: "2400 W Center St" })).toEqual({
      status: "ok", matched: "2400 W CENTER ST, MILWAUKEE, WI, 53206", tract: { geoid: "55079008800", number: "88" },
      neighborhood: "Harambee", inCity: true, dycu: [{ name: "Harambee", slug: "harambee" }],
    });
  });
  it("gives the tract only for a County address outside the City, and refuses one outside the County", async () => {
    const t = await seed();
    installFakeFetch({ geocoder: reply(43.2, -87.95, "55079150100") });
    expect(await t.withIdentity(reader).action(api.places.findPlace, { address: "Somewhere, Brown Deer, WI" })).toMatchObject({ status: "ok", neighborhood: null, inCity: false, tract: { number: "1501" } });
    installFakeFetch({ geocoder: reply(43.0, -88.2, "55133200100") });
    expect(await t.withIdentity(reader).action(api.places.findPlace, { address: "1 Main St, Waukesha, WI" })).toEqual({ status: "outside-county" });
  });
  it("says no match, unavailable and bad address plainly, and never logs the address", async () => {
    const t = await seed();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    installFakeFetch({ geocoder: () => ({ result: { addressMatches: [] } }) });
    expect(await t.withIdentity(reader).action(api.places.findPlace, { address: "123 Nowhere Blvd" })).toEqual({ status: "no-match" });
    installFakeFetch({ geocoder: () => ({}), geocoderStatus: 500 });
    expect(await t.withIdentity(reader).action(api.places.findPlace, { address: "77 Secret Ln" })).toEqual({ status: "unavailable" });
    vi.stubGlobal("fetch", vi.fn(async (url: string) => { throw new Error(`Request timed out: ${url}`); }));
    expect(await t.withIdentity(reader).action(api.places.findPlace, { address: "77 Secret Ln" })).toEqual({ status: "unavailable" });
    expect(await t.withIdentity(reader).action(api.places.findPlace, { address: "  a " })).toEqual({ status: "bad-address" });
    expect(log.mock.calls.flat().join(" ")).not.toMatch(/Secret/);
  });
  it("needs sign-in in Ask, but the public box doesn't, and the box has a site-wide limit", async () => {
    const t = await seed();
    installFakeFetch({ geocoder: reply(43.0679, -87.9425, "55079008800") });
    await expect(t.action(api.places.findPlace, { address: "2400 W Center St" })).rejects.toThrow(/Sign in/);
    expect(await t.action(api.places.placeForBox, { address: "2400 W Center St" })).toMatchObject({ status: "ok" });
    const last = [];
    for (let i = 0; i < 21; i++) last.push((await t.action(api.places.placeForBox, { address: "2400 W Center St" })).status);
    expect(last).toContain("busy");
  });
  it("changes no table", async () => {
    const t = await seed();
    installFakeFetch({ geocoder: reply(43.0679, -87.9425, "55079008800") });
    const counts = () => t.run(async (ctx) => Object.fromEntries(await Promise.all(Object.keys(schema.tables).map(async (n) => [n, (await ctx.db.query(n as never).collect()).length]))));
    const before = await counts();
    await t.withIdentity(reader).action(api.places.findPlace, { address: "2400 W Center St" });
    await t.action(api.places.placeForBox, { address: "2400 W Center St" });
    expect(await counts()).toEqual(before);
  });
});
```

- [ ] **Step 2:** Run `npx vitest run convex/places.test.ts`. Expected: FAIL (the `places` functions and the `geocoder` fake option are missing).

- [ ] **Step 3: Implement**

`tests/helpers/fakeFetch.ts`:
- add `geocoder?: (url: string) => unknown; geocoderStatus?: number;` to `FakeOptions`;
- before the census handler, add:

```ts
    if (url.includes("geocoding.geo.census.gov")) return json(opts.geocoderStatus ?? 200, opts.geocoder?.(url) ?? { result: { addressMatches: [] } });
```

`convex/limits.ts`: add after `MAP_CITY`:

```ts
// An address lookup in Ask: one Census geocoder request, per person.
export const ASK_PLACE = { kind: "token bucket" as const, rate: 60, period: HOUR, capacity: 20 };
// The public "Find your neighborhood" box: one geocoder request, site-wide, so the box can't hammer the Census.
export const PLACE_PUBLIC = { kind: "token bucket" as const, rate: 60, period: 60_000, capacity: 20 };
```

and register `askPlace: ASK_PLACE, placePublic: PLACE_PUBLIC,` in `new RateLimiter(...)`.

`convex/factSheet.ts`: rename `async function areas(` to `export async function portraitAreas(`, and update its call sites (`const all = await areas(ctx)` → `await portraitAreas(ctx)`).

`convex/places.ts`:

```ts
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

async function locate(ctx: ActionCtx, raw: string): Promise<PlaceResult> {
  const a = checkAddress(raw);
  if (!a) return { status: "bad-address" };
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
  if (!g.geoid || !g.geoid.startsWith(COUNTY)) return { status: "outside-county" };
  const at = await ctx.runQuery(internal.places.placeAt, { lat: g.lat, lon: g.lon, geoid: g.geoid });
  return { status: "ok", matched: g.matched, tract: { geoid: g.geoid, number: tractNumber(g.geoid) }, neighborhood: at.neighborhood, inCity: at.neighborhood !== null, dycu: at.dycu };
}

export const findPlace = action({
  args: { address: v.string() },
  handler: async (ctx, { address }): Promise<PlaceResult> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Sign in to ask");
    if (!(await rateLimiter.limit(ctx, "askPlace", { key: identity.tokenIdentifier })).ok) return { status: "busy" };
    return locate(ctx, address);
  },
});

export const placeForBox = action({
  args: { address: v.string() },
  handler: async (ctx, { address }): Promise<PlaceResult> => {
    if (!(await rateLimiter.limit(ctx, "placePublic")).ok) return { status: "busy" };
    return locate(ctx, address);
  },
});
```

- [ ] **Step 4:** Run `npx convex codegen && npx vitest run convex/places.test.ts && npx vitest run --no-file-parallelism && npx tsc --noEmit`. Expected: PASS, the whole suite green. If `rateLimiterTest.register` doesn't make `placePublic` reach `busy` within 21 calls, read its capacity semantics and adjust the loop count; ledger it.
- [ ] **Step 5: Commit** `convex/lib/geocode.ts` is already committed; commit `convex/places.ts`, `convex/places.test.ts`, `convex/limits.ts`, `convex/factSheet.ts`, `tests/helpers/fakeFetch.ts` and `convex/_generated/api.d.ts`: "feat: address lookup finds the tract, City neighborhood and DYCU area, storing nothing".

---

### Task 3: Ask

**Files:**
- Create: `ui/components/PlaceCard.tsx`, `ui/lib/placeText.ts`
- Modify: `lib/ask/tools.ts`, `lib/ask/backend.ts`, `lib/ask/prompt.ts`, `lib/ask/model.ts`, `ui/components/AskCards.tsx`, `tests/ui/ask.test.ts` and `scripts/ask-report-card.ts` (backend stubs), `scripts/ask-questions.ts`, `e2e/ask.spec.ts`
- Test: `tests/ui/placeText.test.ts`, `tests/ui/askTools.test.ts`

**Interfaces:**
- **Consumes:** `PlaceResult` (Task 2).
- **Produces:**
  - `PLACE_PRIVACY: string`
  - `placeRefusal(status): string`
  - `placeFollowUps(r): FollowUp[]`
  - `sheetFor(r): string | null` (the fact sheet to open: the DYCU area named like the City neighborhood, else the first with a sheet)

- [ ] **Step 1: Write the failing tests.** In `tests/ui/placeText.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { PLACE_PRIVACY, placeFollowUps, placeRefusal, sheetFor } from "../../ui/lib/placeText";

const ok = { status: "ok" as const, matched: "2400 W CENTER ST, MILWAUKEE, WI, 53206", tract: { geoid: "55079008800", number: "88" }, neighborhood: "Harambee", inCity: true, dycu: [{ name: "Harambee", slug: "harambee" }] };

describe("the place card's words", () => {
  it("says where the address went, and refuses plainly", () => {
    expect(PLACE_PRIVACY).toBe("This address was sent to the U.S. Census Bureau's geocoder to find its location; Cream City Almanac doesn't keep it.");
    expect(placeRefusal("no-match")).toBe("The Census Bureau couldn't find that address. Try the house number, street name and ZIP code.");
    expect(placeRefusal("unavailable")).toBe("The address service didn't respond. Try again shortly.");
    expect(placeRefusal("outside-county")).toBe("That address is outside Milwaukee County.");
    expect(placeRefusal("bad-address")).toBe("Type a street address or an intersection, like 2400 W Center St.");
  });
  it("offers the tract's ranking and the neighborhood's counts and tracts, never anything about the property", () => {
    expect(placeFollowUps(ok).map((f) => f.question)).toEqual([
      "How does census tract 88 rank on poverty in Milwaukee County?",
      "How many robberies were there in Harambee this year?",
      "What's the poverty rate in Harambee's tracts?",
    ]);
    expect(placeFollowUps({ ...ok, neighborhood: null, inCity: false }).map((f) => f.question)).toEqual(["How does census tract 88 rank on poverty in Milwaukee County?"]);
  });
  it("opens the DYCU area named like the City neighborhood when a tract is in two areas", () => {
    // 2400 W Center St: City neighborhood Amani; tract 88 is in DYCU's Metcalfe Park and Amani (checked on dev, 2026-10-12).
    const two = { ...ok, neighborhood: "Amani", dycu: [{ name: "Metcalfe Park", slug: "metcalfe-park" }, { name: "Amani", slug: "amani" }] };
    expect(sheetFor(two)).toBe("amani");
    expect(sheetFor({ ...two, neighborhood: "Franklin Heights" })).toBe("metcalfe-park");
    expect(sheetFor({ ...two, dycu: [] })).toBeNull();
  });
});
```

Append to `tests/ui/askTools.test.ts`:

```ts
describe("address lookup", () => {
  it("offers a findPlace tool that takes an address, and the prompt sends where-is questions to it", () => {
    const tool = askTools(backend({})).find((t) => t.name === "findPlace")!;
    expect((tool.parameters as { shape: Record<string, unknown> }).shape).toHaveProperty("address");
    expect(tool.description).toContain("U.S. Census Bureau");
    expect(ASK_PROMPT).toContain("findPlace");
  });
});
```

Add `place: async () => ({ status: "no-match" }) as never,` to that file's `backend` helper.

- [ ] **Step 2:** Run both. Expected: FAIL.

- [ ] **Step 3: Implement**

`ui/lib/placeText.ts`:

```ts
import type { FollowUp } from "@/ui/components/FollowUps";
import type { PlaceResult } from "@/convex/places";

export const PLACE_PRIVACY = "This address was sent to the U.S. Census Bureau's geocoder to find its location; Cream City Almanac doesn't keep it.";
const REFUSALS: Record<Exclude<PlaceResult["status"], "ok">, string> = {
  "no-match": "The Census Bureau couldn't find that address. Try the house number, street name and ZIP code.",
  unavailable: "The address service didn't respond. Try again shortly.",
  "outside-county": "That address is outside Milwaukee County.",
  "bad-address": "Type a street address or an intersection, like 2400 W Center St.",
  busy: "Address lookups are busy right now; try again shortly.",
};
export const placeRefusal = (s: Exclude<PlaceResult["status"], "ok">) => REFUSALS[s];

// The fact sheet an address should open: the DYCU area named like its City neighborhood (a tract can be in two areas),
// else the first area that has a sheet.
export const sheetFor = (r: Extract<PlaceResult, { status: "ok" }>) =>
  (r.dycu.find((d) => d.slug && d.name === r.neighborhood) ?? r.dycu.find((d) => d.slug))?.slug ?? null;

// Questions about the places, never the property.
export function placeFollowUps(r: Extract<PlaceResult, { status: "ok" }>): FollowUp[] {
  const out: FollowUp[] = [{ label: `TRACT ${r.tract.number}`, question: `How does census tract ${r.tract.number} rank on poverty in Milwaukee County?` }];
  if (r.neighborhood) {
    out.push({ label: "CRIME HERE", question: `How many robberies were there in ${r.neighborhood} this year?` });
    out.push({ label: "ITS TRACTS", question: `What's the poverty rate in ${r.neighborhood}'s tracts?` });
  }
  return out;
}
```

`lib/ask/tools.ts`:
- add `"findPlace"` to `AskToolName`;
- add `export type PlaceAnswer = FunctionReturnType<typeof api.places.findPlace>;`;
- add `place(a: { address: string }): Promise<PlaceAnswer>;` to `AskBackend`;
- add to `askTools` (after factSheet):

```ts
    {
      name: "findPlace",
      description: "Find which census tract, City of Milwaukee neighborhood and DYCU area an address or intersection in Milwaukee is in. The address is sent to the U.S. Census Bureau's geocoder; nothing about the property is returned, ever. If it returns no-match, ask for the house number, street and ZIP; outside-county, say Ask covers Milwaukee County; unavailable, try later. Then answer the person's question with the tract, neighborhood or fact sheet it found.",
      parameters: z.object({ address: z.string().min(3).max(200) }),
      execute: (a: { address: string }) => b.place(a),
    },
```

`lib/ask/backend.ts`: add `place: (a) => fetchAction(api.places.findPlace, a, { token }),`. Use the same `fetchAction` pattern as the tract tools. Add `place` to the stubs in `tests/ui/ask.test.ts` (`place: async () => ({ status: "no-match" }) as never,`) and `scripts/ask-report-card.ts` (`place: async (a) => run("places:findPlace", a, true),`).

`lib/ask/prompt.ts`: after the factSheet rule, add:

```
- "Which neighborhood / tract / area is <address> in", or "where I live" with an address or intersection, calls findPlace. Never look up anything about a property itself; for an owner, value or permits at an address, point to the City's Address Search.
```

`lib/ask/model.ts`: add a scripted branch before the `"fact sheet"` branch:

```ts
                : question.includes("center st")
                ? call("findPlace", { address: "2400 W Center St, Milwaukee, WI" })
```

`ui/components/PlaceCard.tsx`:

```tsx
"use client";

import Link from "next/link";
import type { PlaceResult } from "@/convex/places";
import { PLACE_PRIVACY } from "@/ui/lib/placeText";
import styles from "./ask.module.css";

// Where an address is: its tract, City neighborhood and DYCU area. Nothing about the property.
export function PlaceCard({ r }: { r: Extract<PlaceResult, { status: "ok" }> }) {
  return (
    <div className={`${styles.reference} ${styles.tractCard}`} data-card="place">
      <p className={styles.tractVerdict}>{r.matched}</p>
      <p className={styles.tractMeta}>(as the U.S. Census Bureau matched it)</p>
      <ul>
        <li>Census tract {r.tract.number}</li>
        <li>{r.neighborhood ? <>City neighborhood: {r.neighborhood} (City of Milwaukee boundary)</> : <>Outside the City of Milwaukee (Milwaukee County)</>}</li>
        {r.dycu.length > 0
          ? r.dycu.map((d) => <li key={d.name}>DYCU&apos;s area: {d.name}{d.slug && <> · <Link href={`/n/${d.slug}`}>Open the fact sheet →</Link></>}</li>)
          : <li>Not in one of the areas Data You Can Use profiles</li>}
      </ul>
      <p className={styles.tractMeta}>{PLACE_PRIVACY}</p>
    </div>
  );
}
```

`ui/components/AskCards.tsx`:
- import `PlaceCard`, `placeFollowUps`, `placeRefusal` and `type PlaceAnswer`;
- add, beside the factSheet renderer:

```tsx
  useRenderTool({ name: "findPlace", parameters: z.object({ address: z.string() }), render: (props) => {
    if (props.status !== "complete") return <Busy />;
    const r = parse<PlaceAnswer>(props.result);
    if (!r) return <Failed />;
    if (r.status !== "ok") return <p className={styles.failed} data-card="place-refusal">{placeRefusal(r.status)}</p>;
    return <><PlaceCard r={r} /><FollowUps items={placeFollowUps(r)} id={props.toolCallId} /></>;
  } }, []);
```

- [ ] **Step 4:** Run `npx vitest run tests/ui/placeText.test.ts tests/ui/askTools.test.ts tests/ui/ask.test.ts && npx tsc --noEmit`. Expected: PASS.

- [ ] **Step 5: Browser test.** Add to `e2e/ask.spec.ts` (signed in), after the fact-sheet test:

```ts
  test("an address question draws where it is, and says where the address went", async ({ page }) => {
    await ask(page, "What neighborhood is 2400 W Center St in?");
    const card = page.locator("[data-card=place]:visible");
    await expect(card).toBeVisible({ timeout: 40_000 });
    await expect(card).toContainText("Census tract");
    await expect(card).toContainText("U.S. Census Bureau");
  });
```

Push to dev (Tarik's OK), build, run it on desktop and phone. Expected: PASS. It uses the real geocoder, through dev's `findPlace`.

- [ ] **Step 6: Graded question.** Add to `scripts/ask-questions.ts`:

```ts
  { q: "Which neighborhood is 2400 W Center St in?", tool: "findPlace", expect: { status: "ok" }, final: true },
```

Run `npm run ask:card -- --only=<its position>`. Expected: 1/1.

- [ ] **Step 7: Commit:** "feat: Ask finds which tract, neighborhood and DYCU area an address is in".

---

### Task 4: The `/n` box

**Files:**
- Create: `app/n/page.tsx`, `ui/components/FindPlaceBox.tsx`
- Modify: `ui/components/FactSheet.tsx` (`FactSheetIndex` renders the box), `ui/components/factSheet.module.css`, `e2e/factsheet.spec.ts`

- [ ] **Step 1: Write the failing browser test** (append to `e2e/factsheet.spec.ts`)

```ts
test("the fact sheet list finds your neighborhood from an address", async ({ page }) => {
  await page.goto("/n");
  await expect(page.getByRole("link", { name: "Harambee" })).toBeVisible();
  await page.getByLabel("Your address").fill("2400 W Center St");
  await page.getByRole("button", { name: "Find" }).click();
  await expect(page).toHaveURL(/\/n\/amani$/, { timeout: 20_000 }); // 2400 W Center St: City neighborhood Amani (dev check)
});

test("an address outside DYCU's areas says which City neighborhood it is in", async ({ page }) => {
  await page.goto("/n");
  await page.getByLabel("Your address").fill("2000 S Kinnickinnic Ave");
  await page.getByRole("button", { name: "Find" }).click();
  await expect(page.locator("[data-place-message]")).toContainText(/neighborhood|Milwaukee County/, { timeout: 20_000 });
});
```

Run it against the current build. Expected: FAIL (`/n` is a 404).

- [ ] **Step 2: Implement**

`app/n/page.tsx`:

```tsx
import { fetchQuery } from "convex/nextjs";
import type { Metadata } from "next";
import { api } from "@/convex/_generated/api";
import { FactSheetIndex } from "@/ui/components/FactSheet";

export const revalidate = 300;
export const metadata: Metadata = { title: "Neighborhood fact sheets · Cream City Almanac" };

export default async function Page() {
  const s = await fetchQuery(api.factSheet.sheet, { slug: "" });
  return <FactSheetIndex areas={s.status === "not-found" ? s.areas : []} />;
}
```

`ui/components/FindPlaceBox.tsx`:

```tsx
"use client";

import { useAction } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import { PLACE_PRIVACY, placeRefusal, sheetFor } from "@/ui/lib/placeText";
import styles from "./factSheet.module.css";

// "Find your neighborhood": an address → its fact sheet, or which City neighborhood it is in. Nothing is stored.
export function FindPlaceBox() {
  const find = useAction(api.places.placeForBox);
  const router = useRouter();
  const [address, setAddress] = useState("");
  const [message, setMessage] = useState<React.ReactNode>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const r = await find({ address });
      if (r.status !== "ok") return setMessage(placeRefusal(r.status));
      const slug = sheetFor(r);
      if (slug) return router.push(`/n/${slug}`);
      setMessage(r.neighborhood
        ? <>That address is in the City&apos;s {r.neighborhood} neighborhood, which Data You Can Use doesn&apos;t profile. <Link href="/ask">Ask about its census tracts →</Link> (try &ldquo;What&apos;s the poverty rate in {r.neighborhood}&apos;s tracts?&rdquo;)</>
        : <>That address is in Milwaukee County but outside the City of Milwaukee (census tract {r.tract.number}).</>);
    } catch {
      setMessage(placeRefusal("unavailable"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className={styles.find} onSubmit={submit}>
      <label htmlFor="find-address" className={styles.findLabel}>Find your neighborhood</label>
      <div className={styles.findRow}>
        <input id="find-address" aria-label="Your address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="2400 W Center St" maxLength={200} autoComplete="street-address" />
        <button type="submit" className={styles.print} disabled={busy}>Find</button>
      </div>
      {message && <p data-place-message role="status">{message}</p>}
      <p className={styles.muted}>{PLACE_PRIVACY}</p>
    </form>
  );
}
```

In `FactSheetIndex` (`ui/components/FactSheet.tsx`), import `FindPlaceBox` and render `<FindPlaceBox />` between the intro paragraph and the list.

`factSheet.module.css`, append:

```css
/* The "Find your neighborhood" box on /n: one field and one button, in the site's form style. */
.find { border-top: var(--hair); border-bottom: var(--hair); padding: 12px 0; margin: 12px 0 16px; max-width: 640px; }
.findLabel { display: block; font-family: var(--font-caps); font-weight: 700; text-transform: uppercase; font-size: 20px; margin-bottom: 8px; }
.findRow { display: flex; gap: 8px; }
.findRow input { flex: 1; min-width: 0; font: inherit; font-size: 17px; padding: 10px 12px; border: 2px solid var(--ink); background: var(--paper); color: var(--ink); }
.find [data-place-message] { margin: 10px 0 4px; }
.find .muted { font-size: 14px; margin: 8px 0 0; }
```

- [ ] **Step 3: Check it**
  - Rebuild and restart on port 3100, then run `BASE_URL=http://localhost:3100 npx playwright test e2e/factsheet.spec.ts`. Expected: PASS on desktop and phone (real geocoder).
  - Take one screenshot of `/n` on each and read it.
- [ ] **Step 4: Commit:** "feat: /n lists the fact sheets and finds yours from an address".

---

### Task 5: Docs

**Files:** create `docs/decisions/037-address-lookup.md`; modify `ui/components/HowItWorks.tsx`, `DESIGN.md`, `e2e/how.spec.ts`.

- [ ] **Step 1: Write the failing test** (append to `e2e/how.spec.ts`)

```ts
test("it says where an address goes when you look one up", async ({ page }) => {
  await page.goto("/how-it-works");
  await expect(page.getByText(/geocoder/)).toBeVisible();
});
```

Run it. Expected: FAIL.

- [ ] **Step 2: Write the docs**
  - **Decision 037,** in the decision format with "What actually happened" left blank. It covers:
    - why the Census geocoder (the City's property file was the alternative);
    - what is sent where;
    - nothing stored;
    - no property information;
    - district, ward and TIN left to I.
  - **How it works:** one paragraph in "What the AI does", after the fact sheet paragraph: "You can type an address or intersection to find which census tract, City neighborhood and Data You Can Use area it's in. The address goes to the U.S. Census Bureau's geocoder to find its location; Cream City Almanac doesn't keep it, and never shows anything about the property itself."
  - **DESIGN.md**, after "### Fact sheet": "### Address lookup". It covers the place card's lines (matched address, tract, City neighborhood with its boundary named, DYCU area with the fact-sheet link, the privacy line) and the `/n` box (one field, one Find button, the message under it, the privacy line).
- [ ] **Step 3:** Rebuild, then run `BASE_URL=http://localhost:3100 npx playwright test e2e/how.spec.ts`. Expected: PASS (all).
- [ ] **Step 4: Commit:** "docs: decision 037, How it works and DESIGN.md on address lookup".
