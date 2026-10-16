# Fact Sheets for Every City Neighborhood Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every City of Milwaukee neighborhood opens a fact sheet at `/n/<slug>`. DYCU's 27 areas keep their own sheets. Every other neighborhood gets the same nine figures, built from Census tract tables shared out by land.

**Architecture:**
1. A weekly job stores each Milwaukee County tract's values for the nine figures' Census variables in a new `tractFigures` table.
2. When a sheet opens, the `factSheet.sheet` query falls through from DYCU's areas to the City's neighborhoods. It adds up the tracts' shares with a pure function (`convex/lib/cityFactSheet.ts`) and returns the same `SheetOk` shape the page already draws, marked `built`.
3. Neighborhoods under 1,000 residents return `status: "small"` and get a page without figures.

**Tech Stack:** Convex (actions, queries, convex-test), Next.js 16 / React 19, Vitest, Playwright, the Census Bureau's ACS 5-year API.

**Spec:** `docs/superpowers/specs/2026-10-16-city-neighborhood-fact-sheets-design.md` (decision 054)

## Global Constraints

- The Census key never appears in code, files, logs or notes. Every note goes through `scrubKey`.
- **Numbers:** every number is computed by code from stored Census values. No AI text on the sheet.
- **Period:** the newest five-year period only. The sheet's City column uses the City figures for the same period as the tract rows.
- **Shares:** `share` is 0–100, the percent of a tract's land in the neighborhood. A count is `estimate × share/100`, and its margin is `√Σ(moe × share/100)²`.
- **Small:** `MIN_RESIDENTS` = 1,000 (import from `convex/lib/neighborhoodFigures.ts`, never retype it).
- **Thin rule:** a figure is shown as missing when the tracts that have all of its values hold under half the neighborhood's residents.
- **DYCU first:** a slug matching a DYCU area always opens DYCU's sheet.
- **A refused fetch:** fewer than 250 tracts back means refused, and last week's rows are kept.
- **Copy, verbatim from the spec:**
  - Source line: "U.S. Census Bureau, 2020–2024 American Community Survey · built from census tracts". The period comes from data.
  - Method note: "Built from N census tracts, each counted by the share of its land in <name>. Approximate: it assumes residents are spread evenly within a tract. Ranges are the Census Bureau's margins of error, at 90% confidence."
  - Small line: "Too few residents (about N) for reliable Census figures."
- **Git and data:**
  - Never stage `.superpowers/` or `clerk-creamcityalmanac.app.zone`.
  - Commit trailer: `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
  - A dev Convex push or dev data run needs Tarik's explicit OK. Prod data jobs are Tarik's.
- **Typecheck both:** `npx tsc --noEmit -p .` and `npx tsc -p convex/tsconfig.json --noEmit`.

## Review Focus

1. **City names with punctuation** ("The Valley/Pigsville", "Walker's Point"). The slug round-trips: `/n/the-valley-pigsville` opens The Valley/Pigsville, and `/n/walkers-point` opens DYCU's Walker's Point. *Test: Task 4.*
2. **Tract figures never fetched** (empty `tractFigures`, for example right after deploy, before the first refresh). The sheet opens with every figure "—". It doesn't crash and doesn't fall back to the index. *Test: Task 4.*
3. **The City figures move to a newer period than the tract rows.** The City column still uses the tract rows' period, never a mismatched one. *Test: Task 4.*
4. **A City neighborhood with no tract pieces** (a sliver or park with no 1%+ share). It gets the small page with "about 0" and an empty tract list, not a crash. *Test: Task 3 (math) and Task 4 (query).*
5. **A search that names both a DYCU area and a City neighborhood** ("harambee crime"). It leads with DYCU's sheet. *Test: Task 4.*

---

### Task 0: Start from main with PR #55

PR #55 changes `FindPlaceBox` and `askAboutArea`, and Task 6 builds on that. It must be merged first.

- [ ] **Step 1: Check PR #55 is merged.**
Run: `gh pr view 55 --json state -q .state`
Expected: `MERGED`. If it prints `OPEN`, stop and ask Tarik to merge it ("merge 55"). Don't merge it yourself.

- [ ] **Step 2: Rebase this branch onto main.**
```bash
git checkout main && git pull && git checkout feat/city-fact-sheets && git rebase main
```
Expected: the rebase succeeds. The branch holds only the spec and decision 054 commit (`git log --oneline main..` shows one line).

---

### Task 1: Census tract requests and parser

**Files:**
- Modify: `convex/lib/census.ts`
- Test: `tests/lib/census.test.ts`

**Interfaces:**
- Produces:
  - `TRACTS_GEO: string`
  - `MIN_TRACTS_FETCHED = 250`
  - `tractRequests(): { kind: CensusPick["kind"]; codes: string[] }[]` (the nine figures' codes, no race codes)
  - `parseTractCensus(body: unknown, codes: string[]): { geoid: string; values: Record<string, Est> }[]`

- [ ] **Step 1: Write the failing tests.** Append to `tests/lib/census.test.ts`, and add `MIN_TRACTS_FETCHED, parseTractCensus, TRACTS_GEO, tractRequests` to its import from `../../convex/lib/census`:

```ts
describe("tract figures (spec 2026-10-16-city-neighborhood-fact-sheets §4.3)", () => {
  it("asks for every Milwaukee County tract with the fact sheet's codes, without the ZIP card's race codes", () => {
    const reqs = tractRequests();
    expect(reqs.map((r) => r.kind).sort()).toEqual(["", "/profile", "/subject"]);
    const all = reqs.flatMap((r) => r.codes);
    expect(all).toContain("B17001_002");
    expect(all).toContain("DP04_0136");
    expect(all).toContain("S1501_C01_006");
    expect(all.some((c) => c.startsWith("B03002"))).toBe(false);
    expect(censusUrl(2024, "", ["B17001_002"], "k", TRACTS_GEO)).toContain("for=tract:*&in=state:55&in=county:079");
    expect(MIN_TRACTS_FETCHED).toBe(250);
  });
  it("reads one row per tract, builds its GEOID, keeps 'no sampling error' as 0 and drops special values", () => {
    const body = [
      ["B17001_002E", "B17001_002M", "state", "county", "tract"],
      ["400", "60", "55", "079", "186000"],
      ["-666666666", "-222222222", "55", "079", "000100"],
      ["50", "-555555555", "55", "079", "000200"],
    ];
    expect(parseTractCensus(body, ["B17001_002"])).toEqual([
      { geoid: "55079186000", values: { B17001_002: { estimate: 400, moe: 60 } } },
      { geoid: "55079000100", values: {} },
      { geoid: "55079000200", values: { B17001_002: { estimate: 50, moe: 0 } } },
    ]);
  });
  it("refuses a reply without tract columns", () => {
    expect(() => parseTractCensus([["B17001_002E"], ["1"]], ["B17001_002"])).toThrow(/tract/);
    expect(() => parseTractCensus({}, ["B17001_002"])).toThrow();
  });
});
```

- [ ] **Step 2: Run them and watch them fail.**
Run: `npx vitest run tests/lib/census.test.ts`
Expected: FAIL, with `tractRequests is not a function` (or an import error for `TRACTS_GEO`).

- [ ] **Step 3: Implement.** Append to `convex/lib/census.ts`:

```ts
// Every Milwaukee County tract, for the fact sheets built from tracts (spec 2026-10-16-city-neighborhood-fact-sheets §4.3).
export const TRACTS_GEO = "for=tract:*&in=state:55&in=county:079";
// Fewer tracts than this means a partial reply: keep last week's rows rather than replace a full week.
export const MIN_TRACTS_FETCHED = 250;

// The nine figures' codes per table kind, without the ZIP card's race codes (tracts don't need them).
export const tractRequests = () => requestsFor().map((r) => ({ ...r, codes: r.codes.filter((c) => !RACE_CODES.includes(c)) }));

// One row per tract; each row is read with parseCensus's rules, so a special value is never a number.
export function parseTractCensus(body: unknown, codes: string[]): { geoid: string; values: Record<string, Est> }[] {
  if (!Array.isArray(body) || !Array.isArray(body[0])) throw new Error("Census tract reply was not a table");
  const [head, ...rows] = body as unknown[][];
  const [s, c, t] = ["state", "county", "tract"].map((n) => head.indexOf(n));
  if ([s, c, t].some((i) => i < 0)) throw new Error("Census tract reply has no tract columns");
  return rows.map((r) => ({ geoid: `${r[s]}${r[c]}${r[t]}`, values: parseCensus([head, r], codes) }));
}
```

- [ ] **Step 4: Run them and watch them pass.**
Run: `npx vitest run tests/lib/census.test.ts`
Expected: PASS, every test in the file.

- [ ] **Step 5: Commit.**
```bash
git add convex/lib/census.ts tests/lib/census.test.ts
git commit -m "feat: Census tract requests and parser for fact sheets built from tracts

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: `tractFigures` table and the weekly refresh

**Files:**
- Modify: `convex/schema.ts` (add the table after `tractPopulations`)
- Modify: `convex/cityFigures.ts` (add `replaceTractFigures`, `refreshTractFigures`)
- Modify: `convex/build.ts:385-390` (run it after the City figures)
- Test: `convex/cityFigures.test.ts`

**Interfaces:**
- Consumes: `TRACTS_GEO`, `MIN_TRACTS_FETCHED`, `tractRequests`, `parseTractCensus` (Task 1); `internal.cityFigures.latestCityFigures` (exists).
- Produces:
  - table `tractFigures { geoid, period, values: Record<code, { estimate, moe | null }>, fetchedAt }`, index `by_geoid`
  - `internal.cityFigures.refreshTractFigures` (internalAction, no args, returns `string[]` notes)

- [ ] **Step 1: Write the failing tests.** Append to `convex/cityFigures.test.ts`:

```ts
// A tract reply: every requested code, for n tracts numbered 000100, 000200, …
const tractReply = (n: number) => (url: string) => {
  const codes = new URL(url).searchParams.get("get")!.split(",");
  const head = [...codes, "state", "county", "tract"];
  return [head, ...Array.from({ length: n }, (_, i) => [...codes.map((c) => (c.endsWith("M") ? "10" : "100")), "55", "079", String((i + 1) * 100).padStart(6, "0")])];
};
const isTract = (url: string) => url.includes("for=tract");

describe("refreshTractFigures", () => {
  it("stores every tract's values for the newest City period, one row per tract", async () => {
    const t = await seed();
    process.env.CENSUS_API_KEY = "k";
    installFakeFetch({ census: reply });
    await t.action(internal.cityFigures.refreshCityFigures, {});
    const fake = installFakeFetch({ census: (url) => (isTract(url) ? tractReply(300)(url) : reply(url)) });
    expect(await t.action(internal.cityFigures.refreshTractFigures, {})).toEqual([]);
    expect(fake.count("for=tract")).toBe(3);
    const rows = await t.run((ctx) => ctx.db.query("tractFigures").collect());
    expect(rows).toHaveLength(300);
    expect(rows[0]).toMatchObject({ period: 2024, values: { B17001_002: { estimate: 100, moe: 10 }, DP04_0136: { estimate: 100, moe: 10 } } });
  });
  it("refuses a partial reply and keeps last week's rows", async () => {
    const t = await seed();
    process.env.CENSUS_API_KEY = "k";
    installFakeFetch({ census: reply });
    await t.action(internal.cityFigures.refreshCityFigures, {});
    installFakeFetch({ census: (url) => (isTract(url) ? tractReply(300)(url) : reply(url)) });
    await t.action(internal.cityFigures.refreshTractFigures, {});
    installFakeFetch({ census: (url) => (isTract(url) ? tractReply(12)(url) : reply(url)) });
    expect((await t.action(internal.cityFigures.refreshTractFigures, {}))[0]).toMatch(/Tract figures unavailable, kept last week's: only 12 tracts/);
    expect(await t.run((ctx) => ctx.db.query("tractFigures").collect())).toHaveLength(300);
  });
  it("says so without a key or without City figures, and never puts the key in a note", async () => {
    const t = await seed();
    expect((await t.action(internal.cityFigures.refreshTractFigures, {}))[0]).toMatch(/CENSUS_API_KEY is not set/);
    process.env.CENSUS_API_KEY = "SECRET123";
    expect((await t.action(internal.cityFigures.refreshTractFigures, {}))[0]).toMatch(/No City figures stored yet/);
    installFakeFetch({ census: reply });
    await t.action(internal.cityFigures.refreshCityFigures, {});
    vi.stubGlobal("fetch", vi.fn(async (url: string) => { throw new Error(`Request timed out after 30000ms: ${url}`); }));
    const notes = await t.action(internal.cityFigures.refreshTractFigures, {});
    expect(notes.join(" ")).not.toContain("SECRET123");
  });
});
```

- [ ] **Step 2: Run them and watch them fail.**
Run: `npx vitest run convex/cityFigures.test.ts`
Expected: FAIL, with `Expected a Convex function exported from module "cityFigures" as refreshTractFigures`, or a schema error for `tractFigures`.

- [ ] **Step 3: Add the table.** In `convex/schema.ts`, after the `tractPopulations` line:

```ts
  // Each Milwaukee County tract's values for the fact sheet's nine figures (Census ACS 5-year), weekly, for the sheets
  // built from tracts (spec 2026-10-16-city-neighborhood-fact-sheets §4.2).
  tractFigures: defineTable({
    geoid: v.string(),
    period: v.number(),
    values: v.record(v.string(), v.object({ estimate: v.number(), moe: v.union(v.number(), v.null()) })),
    fetchedAt: v.number(),
  }).index("by_geoid", ["geoid"]),
```

- [ ] **Step 4: Add the refresh.** In `convex/cityFigures.ts`, change the census import to `import { censusUrl, MIN_TRACTS_FETCHED, parseCensus, parseTractCensus, requestsFor, scrubKey, tractRequests, TRACTS_GEO } from "./lib/census";`, then append:

```ts
export const replaceTractFigures = internalMutation({
  args: { period: v.number(), rows: v.array(v.object({ geoid: v.string(), values: v.record(v.string(), vEst) })) },
  handler: async (ctx, { period, rows }) => {
    for (const old of await ctx.db.query("tractFigures").collect()) await ctx.db.delete(old._id);
    const fetchedAt = Date.now();
    for (const r of rows) await ctx.db.insert("tractFigures", { ...r, period, fetchedAt });
  },
});

// Weekly (build.finish, after the City figures) or alone: `npx convex run cityFigures:refreshTractFigures`. Asks for the
// newest stored City period, so a sheet and its City column match. Notes, never throws; a failure keeps last week's rows.
export const refreshTractFigures = internalAction({
  args: {},
  handler: async (ctx): Promise<string[]> => {
    const key = process.env.CENSUS_API_KEY;
    if (!key) return ["CENSUS_API_KEY is not set (run: npx convex env set CENSUS_API_KEY <key>); tract figures not refreshed."];
    const city = await ctx.runQuery(internal.cityFigures.latestCityFigures, {});
    if (!city) return ["No City figures stored yet; tract figures not refreshed."];
    try {
      const by = new Map<string, Record<string, Est>>();
      for (const r of tractRequests()) {
        const res = await fetchWithTimeout(censusUrl(city.period, r.kind, r.codes, key, TRACTS_GEO), {}, TIMEOUT_MS);
        if (!res.ok) throw new Error(`Census request failed: ${res.status}`);
        for (const t of parseTractCensus(await res.json(), r.codes)) by.set(t.geoid, { ...(by.get(t.geoid) ?? {}), ...t.values });
      }
      if (by.size < MIN_TRACTS_FETCHED) throw new Error(`only ${by.size} tracts came back`);
      await ctx.runMutation(internal.cityFigures.replaceTractFigures, { period: city.period, rows: [...by].map(([geoid, values]) => ({ geoid, values })) });
      return [];
    } catch (e) {
      // Never store the key: error text from fetch can include the full request URL.
      return [`Tract figures unavailable, kept last week's: ${scrubKey(e instanceof Error ? e.message : String(e))}`];
    }
  },
});
```

- [ ] **Step 5: Run it weekly.** In `convex/build.ts`, replace

```ts
      cityNotes = await ctx.runAction(internal.cityFigures.refreshCityFigures, {});
```
with
```ts
      cityNotes = await ctx.runAction(internal.cityFigures.refreshCityFigures, {});
      cityNotes.push(...(await ctx.runAction(internal.cityFigures.refreshTractFigures, {})));
```

- [ ] **Step 6: Run the tests and both typechecks.**
Run: `npx vitest run convex/cityFigures.test.ts && npx tsc -p convex/tsconfig.json --noEmit`
Expected: PASS and no type errors. Commit nothing under `convex/_generated` unless codegen changed it and the diff is only the new table and functions.

- [ ] **Step 7: Commit.**
```bash
git add convex/schema.ts convex/cityFigures.ts convex/build.ts convex/cityFigures.test.ts
git commit -m "feat: weekly tract figures for fact sheets built from tracts

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: The share-out math

**Files:**
- Create: `convex/lib/cityFactSheet.ts`
- Test: `tests/lib/cityFactSheet.test.ts`

**Interfaces:**
- Consumes: `FACTS`, `cityFigure`, `Headline`, `Figure` (`convex/lib/factSheet.ts`); `shareOf`, `sumOf`, `versus`, `Est` (`convex/lib/factMath.ts`); `MIN_RESIDENTS` (`convex/lib/neighborhoodFigures.ts`).
- Produces:
  - `type Piece = { geoid: string; share: number }`
  - `buildCityFigures(pieces: Piece[], values: Map<string, Record<string, Est>>, pops: Map<string, number>, city: Record<string, Est> | undefined): { status: "small"; people: number } | { status: "ok"; people: number; headlines: Headline[] }`
  - `BUILT_PEOPLE_MEANING: string`

- [ ] **Step 1: Write the failing tests.** Create `tests/lib/cityFactSheet.test.ts`. The two-tract numbers were worked out by hand: count 240+75, margin √(36²+20²), and the Census ratio formula.

```ts
import { describe, expect, it } from "vitest";
import { buildCityFigures } from "../../convex/lib/cityFactSheet";
import { shareOf } from "../../convex/lib/factMath";

const tract = (part: [number, number], of: [number, number]) => ({ B17001_002: { estimate: part[0], moe: part[1] }, B17001_001: { estimate: of[0], moe: of[1] } });
const A = "55079000100";
const B = "55079000200";
const values = new Map([[A, tract([400, 60], [2000, 100])], [B, tract([300, 80], [1000, 90])]]);
const pops = new Map([[A, 2000], [B, 1000]]);
const city = { B17001_002: { estimate: 125891, moe: 4212 }, B17001_001: { estimate: 552601, moe: 503 } };
const poverty = (r: ReturnType<typeof buildCityFigures>) => (r.status === "ok" ? r.headlines.find((h) => h.id === "poverty")! : null);

describe("a neighborhood built from census tracts", () => {
  it("inside one tract (share 100) is that tract", () => {
    const r = buildCityFigures([{ geoid: A, share: 100 }], values, pops, city);
    expect(r).toMatchObject({ status: "ok", people: 2000 });
    const h = poverty(r)!;
    expect(h.hood!.count).toEqual({ estimate: 400, moe: 60 });
    expect(h.hood!.rate).toEqual(shareOf({ estimate: 400, moe: 60 }, { estimate: 2000, moe: 100 }));
  });
  it("across two tracts adds each tract's share of counts and combines margins (hand-checked)", () => {
    const r = buildCityFigures([{ geoid: A, share: 60 }, { geoid: B, share: 25 }], values, pops, city);
    expect(r.status === "ok" && r.people).toBe(1450);
    const h = poverty(r)!;
    expect(h.hood!.count.estimate).toBeCloseTo(315, 6);
    expect(h.hood!.count.moe!).toBeCloseTo(41.183, 3);
    expect(h.hood!.of!.estimate).toBeCloseTo(1450, 6);
    expect(h.hood!.of!.moe!).toBeCloseTo(64.08, 2);
    expect(h.hood!.rate!.estimate).toBeCloseTo(0.21724, 5);
    expect(h.hood!.rate!.moe!).toBeCloseTo(0.02673, 5);
    expect(h.city!.rate!.estimate).toBeCloseTo(125891 / 552601, 6);
    expect(h.verdict).toBe("same");
  });
  it("marks a figure missing when tracts with its values hold under half the residents", () => {
    const thin = new Map([[A, {}], [B, tract([300, 80], [1000, 90])]]);
    const r = buildCityFigures([{ geoid: A, share: 60 }, { geoid: B, share: 25 }], thin, pops, city);
    expect(poverty(r)!.hood).toBeNull();
  });
  it("gives people as a count with no range, and says it comes from tract counts", () => {
    const r = buildCityFigures([{ geoid: A, share: 100 }], values, pops, city);
    const people = r.status === "ok" ? r.headlines.find((h) => h.id === "population")! : null;
    expect(people).toMatchObject({ isCount: true, hood: { count: { estimate: 2000, moe: null }, rate: null }, verdict: "unknown" });
    expect(people!.meaning).toMatch(/census tract/i);
  });
  it("returns small, without figures, under 1,000 residents and for a neighborhood with no tracts", () => {
    expect(buildCityFigures([{ geoid: B, share: 50 }], values, pops, city)).toEqual({ status: "small", people: 500 });
    expect(buildCityFigures([], values, pops, city)).toEqual({ status: "small", people: 0 });
  });
});
```

- [ ] **Step 2: Run them and watch them fail.**
Run: `npx vitest run tests/lib/cityFactSheet.test.ts`
Expected: FAIL, with `Cannot find module '../../convex/lib/cityFactSheet'`.

- [ ] **Step 3: Implement.** Create `convex/lib/cityFactSheet.ts`:

```ts
import { shareOf, sumOf, versus, type Est } from "./factMath";
import { cityFigure, FACTS, type Figure, type Headline } from "./factSheet";
import { MIN_RESIDENTS } from "./neighborhoodFigures";

// A City neighborhood's fact sheet figures, built from census tracts (spec 2026-10-16-city-neighborhood-fact-sheets §5).
// Each tract counts by the share of its land in the neighborhood (0–100), which assumes residents spread evenly in it.
export type Piece = { geoid: string; share: number };
export const BUILT_PEOPLE_MEANING = "Residents, from the Census Bureau's census tract counts, each tract shared out by its land in the neighborhood.";

const scaled = (e: Est, f: number): Est => ({ estimate: e.estimate * f, moe: e.moe === null ? null : e.moe * f });

export function buildCityFigures(pieces: Piece[], values: Map<string, Record<string, Est>>, pops: Map<string, number>, city: Record<string, Est> | undefined):
  { status: "small"; people: number } | { status: "ok"; people: number; headlines: Headline[] } {
  const residents = (p: Piece) => (pops.get(p.geoid) ?? 0) * (p.share / 100);
  const people = Math.round(pieces.reduce((t, p) => t + residents(p), 0));
  if (people < MIN_RESIDENTS) return { status: "small", people };
  const headlines = FACTS.map((e): Headline => {
    if (!e.census) {
      const hood: Figure = { rate: null, count: { estimate: people, moe: null }, of: null };
      return { id: e.id, label: e.label, meaning: BUILT_PEOPLE_MEANING, isCount: true, hood, city: null, verdict: "unknown" };
    }
    const codes = [...e.census.parts, e.census.of];
    const usable = pieces.filter((p) => codes.every((c) => values.get(p.geoid)?.[c]));
    // The thin rule (decision 052): tracts with every value must hold at least half of the residents.
    const covered = usable.reduce((t, p) => t + residents(p), 0);
    const total = (code: string) => sumOf(usable.map((p) => scaled(values.get(p.geoid)![code], p.share / 100)));
    const hood: Figure | null = usable.length && covered >= people / 2
      ? (() => { const count = sumOf(e.census!.parts.map(total)); const of = total(e.census!.of); return { rate: shareOf(count, of), count, of }; })()
      : null;
    const c = cityFigure(e, city);
    return { id: e.id, label: e.label, meaning: e.meaning, isCount: false, hood, city: c, verdict: hood?.rate && c?.rate ? versus(hood.rate, c.rate) : "unknown" };
  });
  return { status: "ok", people, headlines };
}
```

- [ ] **Step 4: Run them and watch them pass.**
Run: `npx vitest run tests/lib/cityFactSheet.test.ts`
Expected: PASS, 5 tests. If the two-tract margin is off in the 3rd decimal, recheck `scaled` against `√Σ(moe × share/100)²`. Don't loosen the test.

- [ ] **Step 5: Commit.**
```bash
git add convex/lib/cityFactSheet.ts tests/lib/cityFactSheet.test.ts
git commit -m "feat: build a City neighborhood's fact sheet figures from census tracts

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: The sheet query, the index list and search

**Files:**
- Modify: `convex/factSheet.ts`
- Test: `convex/factSheet.test.ts`

**Interfaces:**
- Consumes: `buildCityFigures`, `Piece` (Task 3); table `tractFigures` (Task 2); `tractNumber` (`convex/lib/tractData.ts`); `newestCountyUrl` (`convex/lib/tractPlaces.ts`, already imported).
- Produces:
  - `api.factSheet.sheet({ slug, year? })` now returns one of:
    - DYCU `ok` (unchanged, plus `source` stays an object);
    - census `ok`: `{ status: "ok", kind: "census", slug, name, year, years: [], period, headlines, tables: [], source: null, map, cityFetchedAt, built: { tracts: number } }`;
    - `{ status: "small", slug, name, people, tracts: { number: string; share: number }[], map }`;
    - `{ status: "not-found", areas, cityAreas }`, where `cityAreas: { slug, name }[]` excludes slugs DYCU covers.
  - `api.factSheet.areaInSearch` also matches City names (DYCU first).
  - `internal.factSheet.checkCitySheets({ name? })` → `{ neighborhoods, sheets, small, people, thinFigures, built? }` for the real-data check.

- [ ] **Step 1: Write the failing tests.** In `convex/factSheet.test.ts`, extend the `beforeEach` seed (inside `t.run`) with:

```ts
    // Two City neighborhoods built from two tracts, one small one, one with a DYCU name, one with a slash.
    for (const name of ["Bay View", "Tiny Park", "Harambee", "The Valley/Pigsville"]) await ctx.db.insert("neighborhoods", { definition: "city", name, matchKey: name.toLowerCase() });
    await ctx.db.insert("tractNeighborhoods", { geoid: "55079000100", city: [], pieces: [{ name: "Bay View", share: 60 }, { name: "Tiny Park", share: 1 }, { name: "The Valley/Pigsville", share: 39 }] });
    await ctx.db.insert("tractNeighborhoods", { geoid: "55079000200", city: [], pieces: [{ name: "Bay View", share: 25 }] });
    await ctx.db.insert("tractPopulations", { geoid: "55079000100", population: 2000, period: 2024 });
    await ctx.db.insert("tractPopulations", { geoid: "55079000200", population: 1000, period: 2024 });
```

and add a helper plus a `describe` block:

```ts
const tractValues = (part: number, of: number) => ({ B17001_002: { estimate: part, moe: 60 }, B17001_001: { estimate: of, moe: 100 } });
async function withTractFigures(period = 2024) {
  await t.run(async (ctx) => {
    await ctx.db.insert("tractFigures", { geoid: "55079000100", period, values: tractValues(400, 2000), fetchedAt: 1 });
    await ctx.db.insert("tractFigures", { geoid: "55079000200", period, values: tractValues(300, 1000), fetchedAt: 1 });
  });
}

describe("fact sheets built from census tracts", () => {
  it("opens a City neighborhood DYCU doesn't profile, built from its tracts, with the City column of the same period", async () => {
    await withTractFigures();
    const r = await t.query(api.factSheet.sheet, { slug: "bay-view" });
    expect(r).toMatchObject({ status: "ok", kind: "census", name: "Bay View", year: 2024, period: "2020–2024", years: [], tables: [], source: null, built: { tracts: 2 } });
    if (r.status !== "ok") return;
    expect(r.headlines.find((h) => h.id === "poverty")!.hood!.count.estimate).toBeCloseTo(315, 6);
    expect(r.headlines.find((h) => h.id === "poverty")!.city).not.toBeNull();
  });
  it("keeps DYCU's sheet when a City name matches a DYCU area, and round-trips a slash", async () => {
    await withTractFigures();
    expect(await t.query(api.factSheet.sheet, { slug: "harambee" })).toMatchObject({ status: "ok", name: "Harambee" });
    expect((await t.query(api.factSheet.sheet, { slug: "harambee" }) as { kind?: string }).kind).toBeUndefined();
    expect(await t.query(api.factSheet.sheet, { slug: "the-valley-pigsville" })).toMatchObject({ status: "small", name: "The Valley/Pigsville" });
  });
  it("gives a small neighborhood a page without figures, listing its tracts", async () => {
    expect(await t.query(api.factSheet.sheet, { slug: "tiny-park" })).toEqual(expect.objectContaining({ status: "small", name: "Tiny Park", people: 20, tracts: [{ number: "1", share: 1 }] }));
  });
  it("opens with every figure missing before the first tract fetch, instead of the index", async () => {
    const r = await t.query(api.factSheet.sheet, { slug: "bay-view" });
    expect(r).toMatchObject({ status: "ok", kind: "census" });
    if (r.status === "ok") expect(r.headlines.filter((h) => !h.isCount).every((h) => h.hood === null)).toBe(true);
  });
  it("never pairs tract figures with a newer period's City column", async () => {
    await withTractFigures(2023);
    const r = await t.query(api.factSheet.sheet, { slug: "bay-view" });
    expect(r).toMatchObject({ status: "ok", year: 2023 });
    if (r.status === "ok") expect(r.headlines.every((h) => h.city === null)).toBe(true); // only 2024 City figures are seeded
  });
  it("lists every City neighborhood DYCU doesn't cover on the index", async () => {
    const index = await t.query(api.factSheet.sheet, { slug: "" });
    expect(index).toMatchObject({ status: "not-found", cityAreas: [{ slug: "bay-view", name: "Bay View" }, { slug: "the-valley-pigsville", name: "The Valley/Pigsville" }, { slug: "tiny-park", name: "Tiny Park" }] });
  });
  it("leads a search with a City neighborhood's sheet, DYCU's first on a shared name", async () => {
    expect(await t.query(api.factSheet.areaInSearch, { q: "bay view crime" })).toEqual({ slug: "bay-view", name: "Bay View" });
    expect(await t.query(api.factSheet.areaInSearch, { q: "harambee crime" })).toEqual({ slug: "harambee", name: "Harambee" });
  });
  it("adds up every City neighborhood for the real-data check", async () => {
    await withTractFigures();
    // Bay View 1,200 + 250 = 1,450 (a sheet); Tiny Park 20, The Valley/Pigsville 780, and the City's Harambee (no tract pieces, 0) are small.
    expect(await t.query(internal.factSheet.checkCitySheets, {})).toMatchObject({ neighborhoods: 4, sheets: 1, small: 3, people: 2250 });
  });
});
```

Also add `internal` to the import: `import { api, internal } from "./_generated/api";`.

- [ ] **Step 2: Run them and watch them fail.**
Run: `npx vitest run convex/factSheet.test.ts`
Expected: FAIL. `bay-view` returns `not-found`, `cityAreas` is undefined, and `checkCitySheets` doesn't exist.

- [ ] **Step 3: Implement.** In `convex/factSheet.ts`:

(a) Add imports:
```ts
import { buildCityFigures, type Piece } from "./lib/cityFactSheet";
import type { Est } from "./lib/factMath";
import { tractNumber } from "./lib/tractData";
```

(b) Replace `tractMap` with a URL helper plus the existing function:
```ts
async function countyTractUrl(ctx: QueryCtx) {
  const e02 = await ctx.db.query("families").withIndex("by_code", (q) => q.eq("code", "E02")).first();
  const ms = e02 ? await ctx.db.query("members").withIndex("by_family", (q) => q.eq("familyKey", e02.key)).collect() : [];
  return newestCountyUrl(ms.filter((m) => m.featureServerUrl && m.place).map((m) => ({ place: m.place as string, year: m.yearLabel ?? String(m.years[0] ?? ""), url: m.featureServerUrl as string })));
}

async function tractMap(ctx: QueryCtx, name: string, year: number) {
  const def = await ctx.db.query("neighborhoods").withIndex("by_definition_matchKey", (q) => q.eq("definition", "dycu").eq("matchKey", placeKey(name))).first();
  const tracts = (def?.tracts ?? []).filter((e) => e.years.includes(year)).flatMap((e) => e.tracts);
  const url = await countyTractUrl(ctx);
  return url && tracts.length ? { url, geoids: tracts.map(tractGeoid) } : null;
}
```

(c) Add the City sheet builder:
```ts
const cityHoods = (ctx: QueryCtx) => ctx.db.query("neighborhoods").withIndex("by_definition_matchKey", (q) => q.eq("definition", "city")).collect();

async function piecesFor(ctx: QueryCtx, name: string): Promise<Piece[]> {
  const rows = await ctx.db.query("tractNeighborhoods").collect();
  return rows.flatMap((r) => (r.pieces ?? []).filter((p) => p.name === name).map((p) => ({ geoid: r.geoid, share: p.share }))).sort((a, b) => b.share - a.share);
}

// A City neighborhood DYCU doesn't profile, built from census tracts (spec 2026-10-16-city-neighborhood-fact-sheets §5–6).
async function citySheet(ctx: QueryCtx, slug: string) {
  const hood = (await cityHoods(ctx)).find((h) => areaSlug(h.name) === slug);
  if (!hood) return null;
  const pieces = await piecesFor(ctx, hood.name);
  const pops = new Map<string, number>();
  const values = new Map<string, Record<string, Est>>();
  let period: number | null = null;
  for (const p of pieces) {
    const pop = await ctx.db.query("tractPopulations").withIndex("by_geoid", (q) => q.eq("geoid", p.geoid)).first();
    if (pop) pops.set(p.geoid, pop.population);
    const f = await ctx.db.query("tractFigures").withIndex("by_geoid", (q) => q.eq("geoid", p.geoid)).first();
    if (f) { values.set(p.geoid, f.values); period = f.period; }
  }
  const latest = await ctx.db.query("cityFigures").withIndex("by_period").order("desc").first();
  const y = period ?? latest?.period ?? new Date().getFullYear() - 2;
  // The City column is always the tract rows' period, never a newer one.
  const city = await ctx.db.query("cityFigures").withIndex("by_period", (q) => q.eq("period", y)).first();
  const url = await countyTractUrl(ctx);
  const map = url && pieces.length ? { url, geoids: pieces.map((p) => p.geoid) } : null;
  const built = buildCityFigures(pieces, values, pops, city?.values);
  if (built.status === "small") return { status: "small" as const, slug, name: hood.name, people: built.people, tracts: pieces.map((p) => ({ number: tractNumber(p.geoid), share: p.share })), map };
  return {
    status: "ok" as const, kind: "census" as const, slug, name: hood.name, year: y, years: [] as number[], period: `${y - 4}–${y}`,
    headlines: built.headlines, tables: [], source: null, map, cityFetchedAt: city?.fetchedAt ?? null, built: { tracts: pieces.length },
  };
}
```

(d) Change the `sheet` handler's last two lines to:
```ts
    const got = area ? await assemble(ctx, area, year) : null;
    if (got) return got;
    const census = asked ? await citySheet(ctx, asked) : null;
    if (census) return census;
    const dycu = new Set(all.flatMap((a) => a.slugs));
    const cityAreas = (await cityHoods(ctx)).map((h) => ({ slug: areaSlug(h.name), name: h.name })).filter((h) => !dycu.has(h.slug)).sort((a, b) => a.name.localeCompare(b.name));
    return { status: "not-found" as const, areas: all.map(({ slug: s, name }) => ({ slug: s, name })), cityAreas };
```

(e) In `areaInSearch`, return DYCU's hit if any, else try City names:
```ts
    if (hit) return { slug: hit.slug, name: hit.name };
    const city = areaInText(q.slice(0, 200), (await cityHoods(ctx)).map((h) => ({ name: h.name, slug: areaSlug(h.name), spellings: [h.name] })));
    return city ? { slug: city.slug, name: city.name } : null;
```
(replacing its final `return hit ? … : null;`).

(f) Add the real-data check:
```ts
// The real-data check (spec §8.5): every City neighborhood's people added up, how many are small, how many figures are thin.
// `npx convex run factSheet:checkCitySheets` (dev with OK; prod is Tarik's). With a name, also that neighborhood's built figures.
export const checkCitySheets = internalQuery({
  args: { name: v.optional(v.string()) },
  handler: async (ctx, { name }) => {
    const hoods = await cityHoods(ctx);
    let people = 0, small = 0, sheets = 0, thinFigures = 0;
    let built: unknown = undefined;
    for (const h of hoods) {
      const s = await citySheet(ctx, areaSlug(h.name));
      if (!s) continue;
      if (s.status === "small") { small++; people += s.people; continue; }
      sheets++;
      people += s.headlines.find((x) => x.isCount)?.hood?.count.estimate ?? 0;
      thinFigures += s.headlines.filter((x) => !x.isCount && !x.hood).length;
      if (name && h.name === name) built = s.headlines.map((x) => ({ id: x.id, rate: x.hood?.rate ?? null, count: x.hood?.count ?? null }));
    }
    return { neighborhoods: hoods.length, sheets, small, people, thinFigures, built };
  },
});
```

- [ ] **Step 4: Run the tests and the Convex typecheck.**
Run: `npx vitest run convex/factSheet.test.ts && npx tsc -p convex/tsconfig.json --noEmit`
Expected: PASS, all old and new tests, and no type errors.

- [ ] **Step 5: Commit.**
```bash
git add convex/factSheet.ts convex/factSheet.test.ts
git commit -m "feat: fact sheets for City neighborhoods built from tracts, on the index and in search

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: The page

**Files:**
- Modify: `ui/lib/factText.ts` (built-sheet copy, export)
- Modify: `ui/components/FactSheet.tsx` (`SheetOk`, built variant, `FactSheetSmall`, index list)
- Modify: `app/n/[slug]/page.tsx`, `app/n/page.tsx`
- Test: `tests/ui/factText.test.ts`, `e2e/factsheet.spec.ts`

**Interfaces:**
- Consumes: the `sheet` return shapes from Task 4.
- Produces:
  - `BUILT_SOURCE(period)`, `builtNote(name, tracts)`, `smallLine(people)`, `MISSING_BUILT`;
  - `FactSheetSmall({ s })`;
  - `FactSheetIndex({ areas, cityAreas })`.

- [ ] **Step 1: Write the failing unit tests.** Append to `tests/ui/factText.test.ts`, and add `BUILT_SOURCE, builtNote, factSheetExport, MISSING_BUILT, smallLine` to its `factText` import if they aren't there:

```ts
describe("sheets built from census tracts (spec 2026-10-16 §6)", () => {
  it("says where the numbers come from and how they were built, in the spec's words", () => {
    expect(BUILT_SOURCE("2020–2024")).toBe("U.S. Census Bureau, 2020–2024 American Community Survey · built from census tracts");
    expect(builtNote("Bay View", 7)).toBe("Built from 7 census tracts, each counted by the share of its land in Bay View. Approximate: it assumes residents are spread evenly within a tract. Ranges are the Census Bureau's margins of error, at 90% confidence.");
    expect(builtNote("Bay View", 1)).toMatch(/^Built from 1 census tract, each/);
    expect(smallLine(640)).toBe("Too few residents (about 640) for reliable Census figures.");
    expect(MISSING_BUILT).not.toMatch(/DYCU/);
  });
  it("exports a built sheet without DYCU's source or a year link", () => {
    const s = { status: "ok" as const, kind: "census" as const, slug: "bay-view", name: "Bay View", year: 2024, years: [], period: "2020–2024", headlines: [], tables: [], source: null, map: null, cityFetchedAt: null, built: { tracts: 7 } };
    const e = factSheetExport(s, { origin: "https://x.test", now: new Date("2026-10-16T12:00:00Z") } as never);
    expect(e.notes.join(" ")).toContain("built from census tracts");
    expect(e.notes.join(" ")).not.toContain("Data You Can Use");
    expect(e.notes.join(" ")).toContain("https://x.test/n/bay-view");
    expect(e.notes.join(" ")).not.toContain("?year=");
  });
});
```

- [ ] **Step 2: Run them and watch them fail.**
Run: `npx vitest run tests/ui/factText.test.ts`
Expected: FAIL, with `BUILT_SOURCE is not a function`.

- [ ] **Step 3: Implement the copy and the export.** In `ui/lib/factText.ts`, add:

```ts
export const BUILT_SOURCE = (period: string) => `U.S. Census Bureau, ${period} American Community Survey · built from census tracts`;
export const builtNote = (name: string, tracts: number) =>
  `Built from ${tracts} census tract${tracts === 1 ? "" : "s"}, each counted by the share of its land in ${name}. Approximate: it assumes residents are spread evenly within a tract. Ranges are the Census Bureau's margins of error, at 90% confidence.`;
export const smallLine = (people: number) => `Too few residents (about ${people.toLocaleString("en-US")}) for reliable Census figures.`;
export const MISSING_BUILT = "Too few census answers here";
```

In `factSheetExport`, replace the `notes` line with:

```ts
    notes: s.built
      ? [`Source: ${BUILT_SOURCE(s.period)}.`, builtNote(s.name, s.built.tracts), `City figures: ${CENSUS_SOURCE}, ${s.period}.`, `Sheet: ${ctx.origin}/n/${s.slug}`, exported(ctx)]
      : [`Source: Data You Can Use, ${s.source!.title}: ${s.source!.landingPage}`, `City figures: ${CENSUS_SOURCE}, ${s.period}.`, `Sheet: ${ctx.origin}/n/${s.slug}?year=${s.year}`, exported(ctx)],
```

- [ ] **Step 4: Run them and watch them pass.**
Run: `npx vitest run tests/ui/factText.test.ts`
Expected: PASS. If `Ctx` needs other fields, read `ui/lib/cardExport.ts` and fill them in the test's ctx object. Don't change `exported`.

- [ ] **Step 5: Write the failing browser tests.** Append to `e2e/factsheet.spec.ts`. These need Task 2's table on dev, the dev push and the dev refresh (Task 7). Until then they fail with a not-found index, which is the expected RED.

```ts
test("a City neighborhood DYCU doesn't profile opens a sheet built from census tracts", async ({ page }) => {
  await page.goto("/n/bay-view");
  await expect(page.getByRole("heading", { level: 2 }).first()).toContainText("Bay View");
  await expect(page.locator("[data-period]")).toContainText("built from census tracts");
  await expect(page.locator("[data-period] abbr")).toHaveText("CENSUS");
  await expect(page.locator("tbody tr[data-fact]")).toHaveCount(8);
  await expect(page.getByText(/^Built from \d+ census tracts?, each counted by the share of its land in Bay View\./)).toBeVisible();
  await expect(page.getByRole("link", { name: /^20\d\d$/ })).toHaveCount(0); // no year switcher
});

test("the fact sheet list adds every City neighborhood", async ({ page }) => {
  await page.goto("/n");
  await expect(page.getByRole("heading", { name: "Every City neighborhood" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Bay View", exact: true })).toHaveAttribute("href", "/n/bay-view");
});
```

- [ ] **Step 6: Implement the page.** In `ui/components/FactSheet.tsx`:

(a) Widen `SheetOk`:
```ts
export type SheetOk = {
  status: "ok"; slug: string; name: string; year: number; years: number[]; period: string;
  headlines: Headline[]; tables: PortraitTable[]; source: { title: string; landingPage: string } | null;
  map: { url: string; geoids: string[] } | null; cityFetchedAt: number | null;
  kind?: "census"; built?: { tracts: number };
};
export type SheetSmall = { status: "small"; slug: string; name: string; people: number; tracts: { number: string; share: number }[]; map: { url: string; geoids: string[] } | null };
```

(b) Thread the missing text. Change `Row` to take `missing` and use it in place of `MISSING`:
```ts
function Row({ h, name, missing }: { h: Headline; name: string; missing: string }) {
```
In `FactSheet`, compute `const missing = s.built ? MISSING_BUILT : MISSING;` and render `<Row key={h.id} h={h} name={s.name} missing={missing} />`. Also use `missing` for the people line.

(c) In the header's period line, show the built source and tag when `s.built`:
```tsx
            <p className={styles.period} data-period>
              {s.built ? <>{BUILT_SOURCE(s.period)} <ProvenanceTag source="CENSUS" /></> : <>{s.period} American Community Survey</>}
              <span className={styles.years}>
```
(The years map stays; it renders nothing when `years` is empty.)

(d) People reads "about" when built: `{people.hood ? `${s.built ? "About " : ""}${estimate(people.hood.count)}` : missing}`.

(e) Map caption and notes:
```tsx
                <figcaption>{s.built ? `The census tracts ${s.name} is built from` : `${s.name} as Data You Can Use defines it`}</figcaption>
```
```tsx
            <div className={styles.notes}>
              {s.built ? <p>{builtNote(s.name, s.built.tracts)}</p> : <p>{NOTE_APPROX} {MARGIN_NOTE}</p>}
              {!s.built && people?.hood && populationNote(s.tables) && <p className={styles.muted}>{populationNote(s.tables)}</p>}
              {s.tables.length > 0 && <Tables tables={s.tables} year={s.year} />}
            </div>
```

(f) Aside sources:
```tsx
          {s.source ? <p><a href={s.source.landingPage}>Data You Can Use, {s.source.title}</a></p> : <p>{BUILT_SOURCE(s.period)}.</p>}
```

(g) Imports: add `BUILT_SOURCE, builtNote, MISSING_BUILT, smallLine` to the `factText` import, and `import { ProvenanceTag } from "./ProvenanceTag";`.

(h) Add the small page:
```tsx
export function FactSheetSmall({ s }: { s: SheetSmall }) {
  return (
    <div className={styles.page}>
      <div className={styles.chrome}><Masthead side={null} showDate={false} nav={<SiteNav placement="masthead" current={null} />} /></div>
      <main className={styles.main}>
        <div className={styles.sheet}>
          <header className={styles.head}><h2 className={styles.name}>{s.name}<span className={styles.kind}>Neighborhood fact sheet</span></h2></header>
          <p data-small>{smallLine(s.people)}</p>
          {s.tracts.length > 0 && (
            <ul className={styles.areas}>{s.tracts.map((t) => <li key={t.number}>Census tract {t.number} ({t.share}% of its land)</li>)}</ul>
          )}
          {s.map && (
            <figure className={styles.map}>
              <TractMapSlot url={s.map.url} fits={s.map.geoids} height={220} />
              <figcaption>The census tracts {s.name} sits in</figcaption>
            </figure>
          )}
        </div>
      </main>
      <div className={styles.chrome}><CreditFooter /></div>
    </div>
  );
}
```

(i) The index takes `cityAreas` and adds the second list:
```tsx
export function FactSheetIndex({ areas, cityAreas = [] }: { areas: { slug: string; name: string }[]; cityAreas?: { slug: string; name: string }[] }) {
```
After the existing `<ul>`, add:
```tsx
        {cityAreas.length > 0 && (
          <>
            <h3 className={styles.findLabel}>Every City neighborhood</h3>
            <p className={styles.muted}>Built from census tracts, so approximate.</p>
            <ul className={styles.areas}>{cityAreas.map((a) => <li key={a.slug}><Link href={`/n/${a.slug}`}>{a.name}</Link></li>)}</ul>
          </>
        )}
```
Change the existing intro to: `<p>Data You Can Use profiles {areas.length} neighborhoods; every other City neighborhood has a sheet built from census tracts. Find yours from an address, or pick one:</p>`. Put `<h3 className={styles.findLabel}>Data You Can Use&apos;s neighborhood portraits</h3>` above the first `<ul>`.

(j) Routes. `app/n/[slug]/page.tsx`:
```tsx
import { FactSheet, FactSheetIndex, FactSheetSmall } from "@/ui/components/FactSheet";
…
  return { title: s.status === "ok" || s.status === "small" ? `${s.name} fact sheet · Cream City Almanac` : "Fact sheets · Cream City Almanac" };
…
  return s.status === "ok" ? <FactSheet s={s} /> : s.status === "small" ? <FactSheetSmall s={s} /> : <FactSheetIndex areas={s.areas} cityAreas={s.cityAreas} />;
```
`app/n/page.tsx`:
```tsx
  return <FactSheetIndex areas={s.status === "not-found" ? s.areas : []} cityAreas={s.status === "not-found" ? s.cityAreas : []} />;
```

- [ ] **Step 7: Run the unit suite and both typechecks.**
Run: `npm test > /tmp/suite.txt 2>&1; tail -5 /tmp/suite.txt; npx tsc --noEmit -p . && npx tsc -p convex/tsconfig.json --noEmit`
Expected: all tests pass and no type errors. A type error in a DYCU-only spot that reads `s.source.title` means it needs the `s.source` guard. Fix it the way (f) does.

- [ ] **Step 8: Commit.**
```bash
git add ui/lib/factText.ts ui/components/FactSheet.tsx "app/n/[slug]/page.tsx" app/n/page.tsx tests/ui/factText.test.ts e2e/factsheet.spec.ts
git commit -m "feat: fact sheet page for neighborhoods built from tracts, the small page, and every City neighborhood on the list

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: The address box links the new sheet

**Files:**
- Modify: `ui/lib/placeText.ts` (`askAboutArea` from PR #55)
- Modify: `ui/components/FindPlaceBox.tsx`
- Test: `tests/ui/placeText.test.ts`, `e2e/factsheet.spec.ts`

**Interfaces:**
- Consumes: `areaSlug` (`convex/lib/factSheet.ts`).
- Produces: `askAboutArea(name)` → `{ text, sheet: { href, label }, question, href }`.

- [ ] **Step 1: Write the failing tests.** In `tests/ui/placeText.test.ts`, replace PR #55's `describe("a City neighborhood DYCU doesn't profile", …)` body with:

```ts
  it("opens the neighborhood's sheet built from tracts, and still offers a City-records count in Ask", () => {
    const a = askAboutArea("Bay View");
    expect(a.text).toBe("That address is in the City's Bay View neighborhood.");
    expect(a.sheet).toEqual({ href: "/n/bay-view", label: "Open Bay View's fact sheet →" });
    expect(a.question).toBe("How many robberies in Bay View this year?");
    expect(a.href).toBe(`/ask?prompt=${encodeURIComponent("How many robberies in Bay View this year?")}`);
    expect(askAboutArea("The Valley/Pigsville").sheet.href).toBe("/n/the-valley-pigsville");
  });
```

In `e2e/factsheet.spec.ts`, in the test "an address outside DYCU's areas says which City neighborhood it is in", replace the `toContainText(/neighborhood\. Data You Can Use doesn't make a fact sheet for it/…)` line with:

```ts
  await expect(page.locator("[data-place-message]").getByRole("link", { name: /^Open .+'s fact sheet →$/ })).toHaveAttribute("href", /^\/n\/[a-z0-9-]+$/, { timeout: 20_000 });
```

- [ ] **Step 2: Run the unit test and watch it fail.**
Run: `npx vitest run tests/ui/placeText.test.ts`
Expected: FAIL. `a.text` still has the "doesn't make a fact sheet" sentence, and `a.sheet` is undefined.

- [ ] **Step 3: Implement.** In `ui/lib/placeText.ts`, add `import { areaSlug } from "@/convex/lib/factSheet";` (use the relative path `../../convex/lib/factSheet` if that's how the file imports, so the tests resolve), and replace `askAboutArea`:

```ts
// A City neighborhood DYCU doesn't profile: its sheet built from census tracts, and a City-records count Ask can answer.
export const askAboutArea = (neighborhood: string) => {
  const question = `How many robberies in ${neighborhood} this year?`;
  return {
    text: `That address is in the City's ${neighborhood} neighborhood.`,
    sheet: { href: `/n/${areaSlug(neighborhood)}`, label: `Open ${neighborhood}'s fact sheet →` },
    question,
    href: `/ask?prompt=${encodeURIComponent(question)}`,
  };
};
```

In `ui/components/FindPlaceBox.tsx`, replace PR #55's `AskAbout` with:

```tsx
const AskAbout = ({ area }: { area: ReturnType<typeof askAboutArea> }) => (
  <>
    <p>{area.text} <Link href={area.sheet.href}>{area.sheet.label}</Link></p>
    <p>Ask can also count City records there. <Link href={area.href}>Try &ldquo;{area.question}&rdquo; →</Link></p>
  </>
);
```

- [ ] **Step 4: Run the tests and watch them pass.**
Run: `npx vitest run tests/ui/placeText.test.ts && npx tsc --noEmit -p .`
Expected: PASS and no type errors.

- [ ] **Step 5: Commit.**
```bash
git add ui/lib/placeText.ts ui/components/FindPlaceBox.tsx tests/ui/placeText.test.ts e2e/factsheet.spec.ts
git commit -m "feat: the address box opens a City neighborhood's fact sheet

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Docs, dev data, and the real-data check

**Files:**
- Modify: `DESIGN.md` (Fact sheet section, the `/n` box, search "Fact sheet first")
- Modify: `docs/superpowers/specs/2026-10-16-city-neighborhood-fact-sheets-design.md` (status line only)

- [ ] **Step 1: Update DESIGN.md.**
  - Under the fact sheet section, add a "Built from census tracts" bullet with the source line, the CENSUS tag, no year switcher, the method note, the map caption, the small page, and DYCU first on a shared slug.
  - Under "Address lookup", replace the PR #55 "A City neighborhood DYCU doesn't profile" bullet with the two lines from Task 6.
  - In search's "Fact sheet first" bullet, say City neighborhoods match too, DYCU first.
  - Commit with the spec's status changed to "approved; implemented".

- [ ] **Step 2: Full suite and typechecks.**
Run: `npm test > /tmp/suite.txt 2>&1; grep -E "Tests +[0-9]" /tmp/suite.txt; npx tsc --noEmit -p . && npx tsc -p convex/tsconfig.json --noEmit && echo ok`
Expected: every test passes, then `ok`.

- [ ] **Step 3: STOP. Ask Tarik for the dev push and dev data run.** Say that `npx convex dev --once` adds the `tractFigures` table and the new functions to dev. Then `npx convex run cityFigures:refreshTractFigures` writes about 300 rows to dev's new table and changes nothing else. Wait for an explicit OK.

- [ ] **Step 4: After the OK, push and refresh dev.**
Run: `npx convex dev --once && npx convex run cityFigures:refreshTractFigures`
Expected: `Convex functions ready!`, then `[]`. A note instead of `[]` is a finding: report it, don't retry in a loop.

- [ ] **Step 5: The real-data check.**
Run: `npx convex run factSheet:checkCitySheets '{"name":"Harambee"}'`
Expected:
- `neighborhoods` about 190, with `sheets + small` equal to it.
- `people` within 3% of 566,973, the Census Bureau's City of Milwaukee population from decision 052's prod check. Part 1's piece total was 565,600, and this should be the same, because it's the same pieces and populations.
- `built` holds Harambee's built poverty rate.

Then open `/n/harambee` (DYCU's sheet) locally and compare. The built rate should fall within DYCU's published poverty range for Harambee. **If it doesn't, report both numbers; don't tune.**

- [ ] **Step 6: Browser tests locally.**
Run the app on :3100 (`npx next dev -p 3100`), then: `BASE_URL=http://localhost:3100 npx playwright test e2e/factsheet.spec.ts e2e/landing.spec.ts e2e/home.spec.ts e2e/a11y.spec.ts`
Expected: all pass, including Task 5's and Task 6's new tests. Stop the app afterward.

- [ ] **Step 7: Commit.**
```bash
git add DESIGN.md docs/superpowers/specs/2026-10-16-city-neighborhood-fact-sheets-design.md
git commit -m "docs: DESIGN.md for fact sheets built from census tracts

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

After merge (Tarik's step, put it in the PR body): `npx convex run cityFigures:refreshTractFigures --prod`.
