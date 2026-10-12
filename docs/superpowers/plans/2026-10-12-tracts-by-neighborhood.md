# Tract Questions by Neighborhood Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Ask's three tract tools (rank, compare years, relate) limit a question to one neighborhood: the City's official one by default, or DYCU's area on request. The tracts are listed with their share inside, never blended.

**Architecture:**
- **One shared step** (`convex/lib/tractsIn.ts`, plus `findArea` and `areaFor` in `convex/tracts.ts`) turns a typed name into an area or a refusal.
- **Each tool then filters rows it already builds.** Tract rows already carry `city` (City neighborhoods with `share`) and `dycu` (DYCU areas for the dataset's year), so membership is a lookup, not new geography.
- **Cards** gain a header line, a share note per row and, on rank, a citywide rank. They read new optional fields on the stored detail.

**Tech Stack:** Convex (actions, internal queries, convex-test), Next.js 16 / React 19, CopilotKit v2 tool renderers, Zod tool params, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-12-tracts-by-neighborhood-design.md`

## Global Constraints

- **Without `neighborhood`, every tool's answer is unchanged.** The existing `convex/tracts.test.ts` tests stay green untouched.
- **Inclusion:** a tract is in a City neighborhood when its stored `share` (percent of the tract's area) is ≥ 10, which is every stored entry. A DYCU area counts whole tracts (share 100).
- **"Partly inside" means `share < 90`.**
- **The City's map is the default.** `map: "dycu"` is set only when the person says DYCU's area. On the City map, a name that matches no City neighborhood but exactly matches a DYCU area uses the DYCU area, and the card says so.
- **"Go together" needs 20 tracts** (`relationship()` in `convex/lib/tractStats.ts`). In a neighborhood it refuses with `too-few-tracts` and never computes a relationship.
- **Mismatch cutoffs are computed from the whole place before filtering,** so "high" keeps its citywide meaning.
- **Exact copy:**
  - share note: `"{share}% of this tract is in {name}"` (shown only when share < 100);
  - header line: `"{name} (City of Milwaukee boundary) · {n} tracts, {k} partly inside"` or `"{name} (DYCU's area) · {n} tracts"`;
  - citywide rank: `"12th highest of 210"`.
- **No AI writes a number:** cards and sentences are written by code; the model sees the compact answer as today.
- **Commits** end with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- **Never stage** `.superpowers/` or `clerk-creamcityalmanac.app.zone`.

## Review Focus

1. **A one-figure question about a neighborhood DYCU profiles** ("What's the poverty rate in Harambee?") must still go to `getNumber`, not the tract tools. The prompt rule is scoped to tracts ("tracts", "which parts", "where in"). Task 5 pins the rule text, and the existing e2e "poverty" test stays green.
2. **A tract in the neighborhood with no published value** must count as left out, never silently dropped. Rank sets `leftOut` to the area's stored tract count minus the tracts listed (Task 2 test).
3. **The sentences must not describe a neighborhood list with whole-city words.** Rank, change and relate summaries say "in Bay View", and rank says the list is every tract, not "the highest" (Task 6 test).
4. **A follow-up or nearest-name button must keep the neighborhood.** Buttons append "Only the tracts in {name}." (Task 6 test). The "do they go together" follow-up is dropped inside a neighborhood.
5. **A misspelled name costs the person nothing.** `no-neighborhood` is returned before any DYCU request or allowance spend (Task 2 test checks no fetch).

---

## File Structure

| File | Responsibility |
|---|---|
| `convex/lib/tractsIn.ts` (new) | Pure helpers: `shareIn`, `areaHead`, `placeRanks`, constants |
| `convex/lib/tractNames.ts` | + `areaYears(defs, name)` |
| `convex/tracts.ts` | `findArea` internal query, `areaFor` / `areaSize` / `noTracts` helpers, new refusals, the filter in the three handlers, new optional fields on rows and details |
| `lib/ask/tools.ts` | `neighborhood` and `map` on `rankParams`, `changeParams`, `relateParams`; one sentence per tool description |
| `lib/ask/prompt.ts` | One rule |
| `lib/ask/model.ts` | Scripted "Bay View" case |
| `ui/lib/tractArea.ts` (new) | Card words: `areaLine`, `shareText`, `cityRankText`, `onlyIn`, `noTractsText`, `tooFewText`, `areaPhrase` |
| `ui/lib/tractSummary.ts` | Summaries take an optional `area` |
| `ui/lib/refusalChoices.ts` | `no-neighborhood` buttons, the relate citywide button |
| `ui/components/TractCards.tsx`, `ui/components/AskCards.tsx`, `ui/components/ask.module.css` | Header line, share note, citywide rank column, refusal text, follow-ups keep the area |
| `ui/lib/cardExport.ts` | The area line in every tract export; a citywide rank column in the rank CSV |
| Docs | decision 035, How it works paragraph, DESIGN.md, e2e |

**A ruling carried from the spec:** spec §5 asks exports to carry the share "as a column". The tract CSVs already list every City neighborhood with its share ("Bay View 61%") in the "City neighborhoods" column, so no second share column is added. Rank gets a "Citywide rank" column.

---

### Task 1: Finding the neighborhood

**Files:**
- Create: `convex/lib/tractsIn.ts`
- Modify: `convex/lib/tractNames.ts`, `convex/tracts.ts`
- Test: `tests/lib/tractsIn.test.ts` (new), `convex/tracts.test.ts`

**Interfaces:**
- Produces:
  - `type AreaMap = "city" | "dycu"`; `type Area = { name: string; map: AreaMap }`; `type AreaHead = Area & { tracts: number; partly: number }`
  - `shareIn(row: { city: CityShare[]; dycu: string[] }, area: Area): number | null`
  - `areaHead(area: Area, shares: number[]): AreaHead`
  - `placeRanks(values: TractValue[], direction: "high" | "low"): { of: number; position: Map<string, number> }`
  - `PARTLY_UNDER = 90`, `RELATE_MIN = 20`
  - `areaYears(defs: DycuDef[], name: string): number[]`
  - In `convex/tracts.ts`:
    - `internal.tracts.findArea({ asked, map }) → { kind: "one"; area: Area } | { kind: "none"; nearest: string[] }`
    - `areaFor(ctx, { neighborhood?, map? }) → Promise<Area | null | Refusal>`
    - `areaSize(names, area): number`
    - `noTracts(area, names): Refusal`
  - New `Refusal` members:
    - `{ status: "no-neighborhood"; asked: string; nearest: string[] }`
    - `{ status: "no-tracts"; name: string; map: AreaMap; years?: number[] }`
    - `{ status: "too-few-tracts"; name: string; map: AreaMap; n: number; needed: number }`
  - `TractRow` gains `share?: number; cityRank?: { position: number; of: number }`

- [ ] **Step 1: Write the failing unit tests** in `tests/lib/tractsIn.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { areaHead, placeRanks, shareIn } from "../../convex/lib/tractsIn";
import { areaYears } from "../../convex/lib/tractNames";

const row = (city: { name: string; share: number }[], dycu: string[] = []) => ({ city, dycu });
const tv = (geoid: string, value: number, moe = 1) => ({ geoid, value, lo: value - moe, hi: value + moe, kind: "moe90" as const });

describe("which tracts are in a neighborhood", () => {
  it("reads the City share from the tract's own list, and 100 for a DYCU area", () => {
    expect(shareIn(row([{ name: "Bay View", share: 61 }, { name: "Fernwood", share: 39 }]), { name: "Bay View", map: "city" })).toBe(61);
    expect(shareIn(row([{ name: "Fernwood", share: 100 }]), { name: "Bay View", map: "city" })).toBeNull();
    expect(shareIn(row([], ["Harambee"]), { name: "Harambee", map: "dycu" })).toBe(100);
    expect(shareIn(row([{ name: "Harambee", share: 80 }]), { name: "Harambee", map: "dycu" })).toBeNull();
  });
  it("counts tracts under 90% inside as partly inside", () => {
    expect(areaHead({ name: "Bay View", map: "city" }, [100, 97, 61, 15])).toEqual({ name: "Bay View", map: "city", tracts: 4, partly: 2 });
  });
  it("ranks each reliable tract across the whole place, in the asked direction", () => {
    const r = placeRanks([tv("a", 10), tv("b", 30), tv("c", 20), tv("d", 25, 40)], "high");
    expect(r.of).toBe(3);
    expect([r.position.get("b"), r.position.get("c"), r.position.get("a"), r.position.get("d")]).toEqual([1, 2, 3, undefined]);
    expect(placeRanks([tv("a", 10), tv("b", 30)], "low").position.get("a")).toBe(1);
  });
  it("lists the years DYCU defines an area for", () => {
    expect(areaYears([{ name: "Harambee", tracts: [{ years: [2022, 2021], tracts: ["1860"] }, { years: [2023], tracts: ["1860"] }] }], "Harambee")).toEqual([2021, 2022, 2023]);
  });
});
```

- [ ] **Step 2: Write the failing name-matching test** at the end of `convex/tracts.test.ts`

```ts
import { internal } from "./_generated/api"; // add beside the existing `api` import

describe("findArea", () => {
  async function seedNames() {
    const t = await seedTracts();
    await t.run(async (ctx) => {
      await ctx.db.insert("neighborhoods", { definition: "city", name: "Bay View", matchKey: "bay view" });
      await ctx.db.insert("neighborhoods", { definition: "city", name: "Hillside", matchKey: "hillside" });
    });
    return t;
  }
  it("finds a City neighborhood by name, and offers the nearest on a near miss", async () => {
    const t = await seedNames();
    expect(await t.query(internal.tracts.findArea, { asked: "bay view", map: "city" })).toEqual({ kind: "one", area: { name: "Bay View", map: "city" } });
    expect(await t.query(internal.tracts.findArea, { asked: "Bay Vew", map: "city" })).toEqual({ kind: "none", nearest: ["Bay View"] });
  });
  it("uses DYCU's area for a name only DYCU has, and DYCU's map when asked", async () => {
    const t = await seedNames();
    expect(await t.query(internal.tracts.findArea, { asked: "Harambee", map: "city" })).toEqual({ kind: "one", area: { name: "Harambee", map: "dycu" } });
    expect(await t.query(internal.tracts.findArea, { asked: "Harambee", map: "dycu" })).toEqual({ kind: "one", area: { name: "Harambee", map: "dycu" } });
    expect(await t.query(internal.tracts.findArea, { asked: "Hillside", map: "dycu" })).toMatchObject({ kind: "none" });
  });
});
```

- [ ] **Step 3: Run both and watch them fail**

Run: `npx vitest run tests/lib/tractsIn.test.ts convex/tracts.test.ts -t "which tracts|findArea"`
Expected: FAIL. `tractsIn` can't be resolved, and `internal.tracts.findArea` is undefined.

- [ ] **Step 4: Create `convex/lib/tractsIn.ts`**

```ts
import type { CityShare } from "./tractPlaces";
import { isUnreliable, type TractValue } from "./tractStats";

// Tract questions limited to one neighborhood (docs/superpowers/specs/2026-10-12-tracts-by-neighborhood-design.md).
// Pure: no I/O. A tract is in a City neighborhood when its stored share (percent of the tract's area, ≥10) names it;
// DYCU's areas are whole tracts.
export type AreaMap = "city" | "dycu";
export type Area = { name: string; map: AreaMap };
export type AreaHead = Area & { tracts: number; partly: number };
export const PARTLY_UNDER = 90; // under this share, the header line counts a tract as "partly inside"
export const RELATE_MIN = 20; // the "go together" test needs this many tracts (relationship() in tractStats)

export function shareIn(row: { city: CityShare[]; dycu: string[] }, area: Area): number | null {
  if (area.map === "dycu") return row.dycu.includes(area.name) ? 100 : null;
  return row.city.find((c) => c.name === area.name)?.share ?? null;
}

export const areaHead = (area: Area, shares: number[]): AreaHead => ({ ...area, tracts: shares.length, partly: shares.filter((s) => s < PARTLY_UNDER).length });

// Each reliable tract's place across the whole place, in the ranking's direction ("12th highest of 210").
export function placeRanks(values: TractValue[], direction: "high" | "low") {
  const ok = values.filter((v) => !isUnreliable(v)).sort((x, y) => (direction === "high" ? y.value - x.value : x.value - y.value));
  return { of: ok.length, position: new Map(ok.map((v, i) => [v.geoid, i + 1])) };
}
```

- [ ] **Step 5: Add `areaYears` to `convex/lib/tractNames.ts`** (append)

```ts
// The years DYCU defines an area for, oldest first: what a "no tracts this year" refusal names.
export const areaYears = (defs: DycuDef[], name: string): number[] =>
  [...new Set(defs.filter((d) => d.name === name).flatMap((d) => (d.tracts ?? []).flatMap((e) => e.years)))].sort((a, b) => a - b);
```

- [ ] **Step 6: Add the lookup, helpers and types to `convex/tracts.ts`**

Imports:
- add `import { matchName } from "./lib/neighborhoodNames";`
- add `import { areaHead, placeRanks, RELATE_MIN, shareIn, type Area, type AreaHead, type AreaMap } from "./lib/tractsIn";`
- change the tractNames import to `import { areaYears, latestDefYear, neighborhoodsFor, type DycuDef } from "./lib/tractNames";`

Replace the `TractRow` type with:

```ts
export type TractRow = { geoid: string; tract: string; city: CityShare[]; dycu: string[]; value: number; lo: number | null; hi: number | null; unreliable: boolean; share?: number; cityRank?: { position: number; of: number } };
```

Add three members to the `Refusal` union, after `| { status: "busy" }`:

```ts
  | { status: "no-neighborhood"; asked: string; nearest: string[] }
  | { status: "no-tracts"; name: string; map: AreaMap; years?: number[] }
  | { status: "too-few-tracts"; name: string; map: AreaMap; n: number; needed: number }
```

After `loadNames`, add:

```ts
// A typed neighborhood name → the area a tract question is limited to (spec §4.1). The City's map unless asked for
// DYCU's; on the City map a name only DYCU has (exact match) uses DYCU's area. Free: no DYCU request.
export type FoundArea = { kind: "one"; area: Area } | { kind: "none"; nearest: string[] };
const vMap = v.union(v.literal("city"), v.literal("dycu"));
export const findArea = internalQuery({
  args: { asked: v.string(), map: vMap },
  handler: async (ctx, { asked, map }): Promise<FoundArea> => {
    const rows = (definition: AreaMap) => ctx.db.query("neighborhoods").withIndex("by_definition_matchKey", (q) => q.eq("definition", definition)).collect();
    const m = matchName(asked, await rows(map));
    if (m.kind === "one") return { kind: "one", area: { name: m.row.name, map } };
    if (map === "city") {
      const d = matchName(asked, await rows("dycu"));
      if (d.kind === "one") return { kind: "one", area: { name: d.row.name, map: "dycu" } };
    }
    return { kind: "none", nearest: m.kind === "choose" ? m.names.slice(0, 3) : m.nearest };
  },
});

const vArea = { neighborhood: v.optional(v.string()), map: v.optional(vMap) };
async function areaFor(ctx: ActionCtx, a: { neighborhood?: string; map?: AreaMap }): Promise<Area | null | Refusal> {
  if (!a.neighborhood?.trim()) return null;
  const f: FoundArea = await ctx.runQuery(internal.tracts.findArea, { asked: a.neighborhood, map: a.map ?? "city" });
  return f.kind === "one" ? f.area : { status: "no-neighborhood", asked: a.neighborhood, nearest: f.nearest };
}
// How many tracts the stored names put in the area: the City table's entries, or DYCU's largest year.
const areaSize = (names: Names, area: Area) =>
  area.map === "dycu"
    ? Math.max(0, ...names.defs.filter((d) => d.name === area.name).flatMap((d) => (d.tracts ?? []).map((e) => e.tracts.length)))
    : [...names.city.values()].filter((c) => c.some((x) => x.name === area.name)).length;
const noTracts = (area: Area, names: Names): Refusal => ({ status: "no-tracts", name: area.name, map: area.map, ...(area.map === "dycu" ? { years: areaYears(names.defs, area.name) } : {}) });
// A tract's names for a year, without its figures: enough to test membership before building a row.
const placesOf = (geoid: string, year: string, names: Names) => ({ city: names.city.get(geoid) ?? [], dycu: neighborhoodsFor(tractNumber(geoid), yearNumber(year), names.defs) });
```

- [ ] **Step 7: Run the tests and watch them pass**

Run: `npx vitest run tests/lib/tractsIn.test.ts convex/tracts.test.ts && npx tsc --noEmit`
Expected: PASS, with all existing tract tests still green. tsc may warn about unused `areaHead`, `placeRanks`, `RELATE_MIN`, `AreaHead`, `vArea`, `areaFor`, `areaSize`, `noTracts` and `placesOf`, which Task 2 uses. If tsc fails on unused names (noUnusedLocals), add a `void` line below them and remove it in Task 2.

- [ ] **Step 8: Commit**

```bash
git add convex/lib/tractsIn.ts convex/lib/tractNames.ts convex/tracts.ts convex/tracts.test.ts tests/lib/tractsIn.test.ts
git commit -m "feat: tract tools can find a City neighborhood or DYCU area by name

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Rank within a neighborhood

**Files:**
- Modify: `convex/tracts.ts` (`RankDetail`, `rankTracts`)
- Test: `convex/tracts.test.ts`

**Interfaces:**
- Consumes: Task 1's `areaFor`, `areaSize`, `noTracts`, `shareIn`, `areaHead`, `placeRanks`, `vArea`
- Produces:
  - `rankTracts` args gain `neighborhood?: string; map?: "city" | "dycu"`
  - `RankDetail` gains `area?: AreaHead`
  - With an area, every row in `top` and `unreliable` has `share`, and every reliable row has `cityRank`

- [ ] **Step 1: Write the failing tests** (append to `convex/tracts.test.ts`)

```ts
// Bay View: tracts 1000 (100%), 1001 (61%), 1002 (15%), and 1099 (no figure in the data). Buchel Park: no tract.
async function seedAreas() {
  const t = await seedTracts();
  await t.run(async (ctx) => {
    for (const [name, matchKey] of [["Bay View", "bay view"], ["Hillside", "hillside"], ["Buchel Park", "buchel park"]]) await ctx.db.insert("neighborhoods", { definition: "city", name, matchKey });
    for (const [geoid, share] of [["55079100000", 100], ["55079100100", 61], ["55079100200", 15], ["55079109900", 100]] as const)
      await ctx.db.insert("tractNeighborhoods", { geoid, city: [{ name: "Bay View", share }] });
  });
  return t;
}
const rankArgs = { code: "E02", column: "pov_rate", place: "City" as const, year: "2022", direction: "high" as const };

describe("rankTracts in a neighborhood", () => {
  it("lists every tract in it with its share and citywide rank, and counts a tract with no figure as left out", async () => {
    const t = await seedAreas();
    installFakeFetch({ columns: POV_FIELDS, tractRows: povertyRows });
    const r = await t.withIdentity(reader).action(api.tracts.rankTracts, { ...rankArgs, neighborhood: "bay view" });
    expect(r).toMatchObject({ status: "ok", area: { name: "Bay View", map: "city", tracts: 3, partly: 2 }, header: { n: 3, leftOut: 1 } });
    if (r.status !== "ok") return;
    expect(r.top.map((x) => [x.tract, x.share, x.cityRank])).toEqual([
      ["1002", 15, { position: 23, of: 25 }],
      ["1001", 61, { position: 24, of: 25 }],
      ["1000", 100, { position: 25, of: 25 }],
    ]);
  });
  it("uses DYCU's area when the name is only DYCU's", async () => {
    const t = await seedAreas();
    installFakeFetch({ columns: POV_FIELDS, tractRows: povertyRows });
    const r = await t.withIdentity(reader).action(api.tracts.rankTracts, { ...rankArgs, neighborhood: "Harambee" });
    expect(r).toMatchObject({ status: "ok", area: { name: "Harambee", map: "dycu", tracts: 1, partly: 0 }, top: [{ tract: "1860", share: 100 }] });
  });
  it("offers the nearest names for a misspelling and says when a neighborhood has no tract, both without asking DYCU", async () => {
    const t = await seedAreas();
    const fake = installFakeFetch({ columns: POV_FIELDS, tractRows: povertyRows });
    expect(await t.withIdentity(reader).action(api.tracts.rankTracts, { ...rankArgs, neighborhood: "Bay Vew" })).toEqual({ status: "no-neighborhood", asked: "Bay Vew", nearest: ["Bay View"] });
    expect(await t.withIdentity(reader).action(api.tracts.rankTracts, { ...rankArgs, neighborhood: "Buchel Park" })).toEqual({ status: "no-tracts", name: "Buchel Park", map: "city" });
    expect(fake.calls.length).toBe(0);
  });
  it("leaves the answer unchanged without a neighborhood", async () => {
    const t = await seedAreas();
    installFakeFetch({ columns: POV_FIELDS, tractRows: povertyRows });
    const r = await t.withIdentity(reader).action(api.tracts.rankTracts, rankArgs);
    expect(r).not.toHaveProperty("area");
    if (r.status === "ok") expect(r.top).toHaveLength(10);
  });
});
```

- [ ] **Step 2: Run and watch them fail**

Run: `npx vitest run convex/tracts.test.ts -t "in a neighborhood"`
Expected: FAIL. The validator rejects `neighborhood` ("Object contains extra field").

- [ ] **Step 3: Implement.** In `RankDetail`, add `area?: AreaHead` after `key: string`. Replace the `rankTracts` definition with:

```ts
export const rankTracts = action({
  args: { code: v.string(), column: v.string(), place: vPlace, year: v.string(), direction: v.union(v.literal("high"), v.literal("low")), cutoff: v.optional(v.number()), ...vArea },
  handler: async (ctx, args): Promise<RankDetail | Refusal> => {
    const spend = await spender(ctx);
    // A neighborhood is checked first, from the database alone: a misspelling or an empty one costs nothing.
    const area = await areaFor(ctx, args);
    if (area && "status" in area) return area;
    const names = await loadNames(ctx);
    if (area && areaSize(names, area) === 0) return noTracts(area, names);
    const prop = await propertySide(ctx, args.code, args.column, args.cutoff);
    if (prop && "status" in prop) return prop;
    let picked: PropertySide | Looked;
    if (prop) picked = prop;
    else {
      const looked = pickMember(await ctx.runQuery(internal.tracts.familyForTracts, { code: args.code }), args.place, args.year);
      if ("status" in looked) return looked;
      picked = looked;
    }
    const resolved = await resolveSide(ctx, picked, args.column, spend);
    if ("status" in resolved) return resolved;
    const side = await loadSide(ctx, resolved, spend);
    if ("status" in side) return side;
    const nameYear = side.year ?? String(latestDefYear(names.defs));
    const all = side.rows.values;
    // In a neighborhood every tract is listed (spec §4.2), with its share and its place across the whole place.
    const kept = area ? all.filter((x) => shareIn(placesOf(x.geoid, nameYear, names), area) !== null) : all;
    if (area && kept.length === 0) return noTracts(area, names);
    const ranked = rankValues(kept, args.direction, area ? kept.length : undefined);
    const places = area ? placeRanks(all, args.direction) : null;
    const row = (x: TractValue): TractRow => {
      const r = toRow(x, nameYear, names);
      if (!area || !places) return r;
      const position = places.position.get(x.geoid);
      return { ...r, share: shareIn(r, area) ?? undefined, ...(position ? { cityRank: { position, of: places.of } } : {}) };
    };
    const head = area ? side.head(args.place, kept.length, Math.max(0, areaSize(names, area) - kept.length)) : side.head(args.place, all.length, side.rows.leftOut);
    const { key, save } = await store(ctx, { tool: "rank", ...args, year: head.year, code: head.code, column: head.column });
    const detail: RankDetail = {
      status: "ok", tool: "rank", header: head, direction: args.direction,
      top: ranked.top.map(row),
      ties: ranked.ties.map(row), tieCount: ranked.ties.length,
      unreliable: ranked.unreliable.map(row), unreliableCount: ranked.unreliable.length,
      highlighted: ranked.top.map((x) => x.geoid), key,
      ...(area ? { area: areaHead(area, kept.map((x) => shareIn(placesOf(x.geoid, nameYear, names), area) ?? 0)) } : {}),
    };
    await save(detail); // the card gets every tie and every unreliable tract; the model gets the first three of each, with the totals
    return { ...detail, ties: detail.ties.slice(0, 3), unreliable: detail.unreliable.slice(0, 3) };
  },
});
```

`rankValues(values, direction, top = 10)`: passing `undefined` keeps the default of 10.

- [ ] **Step 4: Run and watch them pass**

Run: `npx vitest run convex/tracts.test.ts && npx tsc --noEmit`
Expected: PASS, every tract test (existing and new).

- [ ] **Step 5: Commit**

```bash
git add convex/tracts.ts convex/tracts.test.ts
git commit -m "feat: rank the tracts in one neighborhood, each with its share and citywide rank

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Compare years within a neighborhood

**Files:**
- Modify: `convex/tracts.ts` (`ChangeRow`, `ChangeDetail`, `compareYears`)
- Test: `convex/tracts.test.ts`

**Interfaces:**
- Consumes: Task 1 helpers, `placesOf`
- Produces:
  - `compareYears` args gain `neighborhood?` and `map?`
  - `ChangeRow` gains `share?: number`
  - `ChangeDetail` gains `area?: AreaHead`

- [ ] **Step 1: Write the failing test.** Append inside `describe("compareYears", …)`, after the existing tests; it reuses `seedTwoYears`, `later` and `run`'s fake setup.

```ts
  it("compares only the tracts in a neighborhood, with their share", async () => {
    const t = await seedTwoYears();
    await t.run(async (ctx) => {
      await ctx.db.insert("neighborhoods", { definition: "city", name: "Bay View", matchKey: "bay view" });
      for (const [geoid, share] of [["55079100000", 100], ["55079100100", 61], ["55079100200", 15]] as const)
        await ctx.db.insert("tractNeighborhoods", { geoid, city: [{ name: "Bay View", share }] });
    });
    installFakeFetch({ columns: POV_FIELDS, tractRows: (url) => (url.includes("2023") ? later((i) => ({ delta: i === 0 || i === 5 ? 5 : 0 }))() : povertyRows()) });
    const r = await t.withIdentity(reader).action(api.tracts.compareYears, { code: "E02", column: "pov_rate", place: "City", from: "2022", to: "2023", neighborhood: "Bay View" });
    expect(r).toMatchObject({ status: "ok", increases: 1, decreases: 0, none: 2, area: { name: "Bay View", tracts: 3, partly: 2 }, header: { n: 3, leftOut: 0 } });
    if (r.status === "ok") expect(r.changes.map((c) => [c.tract, c.share])).toEqual([["1000", 100]]);
  });
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run convex/tracts.test.ts -t "only the tracts in a neighborhood"`
Expected: FAIL on the extra field `neighborhood`.

- [ ] **Step 3: Implement**
  - Add `share?: number` to `ChangeRow`, and `area?: AreaHead` to `ChangeDetail` (after `key: string`).
  - In `compareYears`:
    - add `...vArea` to `args`;
    - after `const spend = await spender(ctx);`, add:

```ts
    const area = await areaFor(ctx, args);
    if (area && "status" in area) return area;
    const names = await loadNames(ctx);
    if (area && areaSize(names, area) === 0) return noTracts(area, names);
```

  - Delete the later `const names = await loadNames(ctx);` line.
  - Replace the comparison block (from `const later = new Map(...)` through the `leftOut` line) with:

```ts
    // In a neighborhood, only its tracts are compared or counted (spec §4.3); membership uses the later year's names.
    const inArea = (geoid: string) => (area ? shareIn(placesOf(geoid, r2.year, names), area) : 100);
    const v1 = y1.values.filter((x) => inArea(x.geoid) !== null);
    const v2 = y2.values.filter((x) => inArea(x.geoid) !== null);
    const later = new Map(v2.map((x) => [x.geoid, x]));
    let increases = 0, decreases = 0, none = 0, unreliableCount = 0;
    const changes: ChangeRow[] = [];
    for (const a of v1) {
      const b = later.get(a.geoid);
      if (!b) continue;
      if (isUnreliable(a) || isUnreliable(b)) { unreliableCount++; continue; }
      const d = changeOf(a, b);
      if (d === "none") { none++; continue; }
      if (d === "increase") increases++; else decreases++;
      const to = toRow(b, r2.year, names);
      changes.push({ geoid: a.geoid, tract: to.tract, city: to.city, dycu: to.dycu, from: toRow(a, r1.year, names), to, change: b.value - a.value, direction: d, ...(area ? { share: inArea(a.geoid) ?? undefined } : {}) });
    }
    changes.sort((p, q) => Math.abs(q.change) - Math.abs(p.change));
    const { key, save } = await store(ctx, { tool: "change", ...args, from: r1.year, to: r2.year, code: r1.family.code, column: r1.column });
    const matched = increases + decreases + none + unreliableCount;
    // Left out: tracts only one year has, plus the rows each year dropped for having no usable value (whole place only).
    const leftOut = v1.length - matched + (v2.length - matched) + (area ? 0 : y1.leftOut + y2.leftOut);
    const areaShares = area ? v1.filter((x) => later.has(x.geoid)).map((x) => inArea(x.geoid) ?? 0) : [];
```

  - In the `detail` object, add after `key,`:

```ts
      ...(area ? { area: areaHead(area, areaShares) } : {}),
```

- [ ] **Step 4: Run and watch it pass**

Run: `npx vitest run convex/tracts.test.ts && npx tsc --noEmit`
Expected: PASS, with every existing compareYears test unchanged.

- [ ] **Step 5: Commit**

```bash
git add convex/tracts.ts convex/tracts.test.ts
git commit -m "feat: compare years for the tracts in one neighborhood

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Relate within a neighborhood

**Files:**
- Modify: `convex/tracts.ts` (`RelateDetail`, `relateTracts`)
- Test: `convex/tracts.test.ts`

**Interfaces:**
- Consumes: Task 1 helpers
- Produces:
  - `relateTracts` args gain `neighborhood?` and `map?`
  - `RelateDetail` gains `area?: AreaHead`
  - Mismatch `fits`, `close` and `points` are limited to the area, and each pair's `a` row carries `share`
  - Relate mode with an area returns `too-few-tracts`

- [ ] **Step 1: Write the failing tests.** Append inside `describe("relateTracts", …)`.

```ts
  it("keeps the citywide cutoffs and lists only the neighborhood's matches", async () => {
    const t = await seedPair();
    await t.run(async (ctx) => {
      await ctx.db.insert("neighborhoods", { definition: "city", name: "Hillside", matchKey: "hillside" });
      await ctx.db.insert("neighborhoods", { definition: "city", name: "Bay View", matchKey: "bay view" });
      await ctx.db.insert("tractNeighborhoods", { geoid: "55079100000", city: [{ name: "Bay View", share: 100 }] });
    });
    installFakeFetch({ columnsFor: routeFields, tractRows: routeRows });
    const all = await t.withIdentity(reader).action(api.tracts.relateTracts, { ...relateArgs, mode: "mismatch", aSide: "high", bSide: "low" });
    const hill = await t.withIdentity(reader).action(api.tracts.relateTracts, { ...relateArgs, mode: "mismatch", aSide: "high", bSide: "low", neighborhood: "Hillside" });
    const bay = await t.withIdentity(reader).action(api.tracts.relateTracts, { ...relateArgs, mode: "mismatch", aSide: "high", bSide: "low", neighborhood: "Bay View" });
    if (all.status !== "ok" || hill.status !== "ok" || bay.status !== "ok") throw new Error("expected ok");
    expect([hill.cutA, hill.cutB]).toEqual([all.cutA, all.cutB]);
    expect(hill).toMatchObject({ area: { name: "Hillside", tracts: 1, partly: 1 }, fitsCount: 1, fits: [{ a: { tract: "1860", share: 51 } }] });
    expect(bay).toMatchObject({ fitsCount: 0, fits: [] });
  });
  it("refuses 'do they go together' inside a neighborhood without asking DYCU", async () => {
    const t = await seedPair();
    await t.run(async (ctx) => { await ctx.db.insert("neighborhoods", { definition: "city", name: "Hillside", matchKey: "hillside" }); });
    const fake = installFakeFetch({ columnsFor: routeFields, tractRows: routeRows });
    expect(await t.withIdentity(reader).action(api.tracts.relateTracts, { ...relateArgs, mode: "relate", neighborhood: "Hillside" }))
      .toEqual({ status: "too-few-tracts", name: "Hillside", map: "city", n: 1, needed: 20 });
    expect(fake.calls.length).toBe(0);
  });
```

- [ ] **Step 2: Run and watch them fail**

Run: `npx vitest run convex/tracts.test.ts -t "neighborhood's matches|inside a neighborhood"`
Expected: FAIL on the extra field `neighborhood`.

- [ ] **Step 3: Implement**
  - Add `area?: AreaHead` to `RelateDetail` (after `key: string;`).
  - In `relateTracts`:
    - add `...vArea` to `args`;
    - immediately after `const spend = await spender(ctx);`, add:

```ts
    const area = await areaFor(ctx, args);
    if (area && "status" in area) return area;
    const names = await loadNames(ctx);
    if (area && areaSize(names, area) === 0) return noTracts(area, names);
    // "Do they go together" needs 20 tracts; a neighborhood has 2 to 11 (spec §4.4).
    if (area && args.mode === "relate") return { status: "too-few-tracts", name: area.name, map: area.map, n: areaSize(names, area), needed: RELATE_MIN };
```

  - Delete the later `const names = await loadNames(ctx);` line.
  - After the `close` line (`const close = mm ? byClearance(...) : [];`), replace the `fitsIds`, `closeIds` and `both` lines with:

```ts
    // Cutoffs above come from the whole place; a neighborhood only narrows which matches are listed (spec §4.4).
    const inArea = (geoid: string) => (area ? shareIn(placesOf(geoid, nameYear, names), area) : 100);
    const fitsIn = fits.filter((p) => inArea(p.geoid) !== null);
    const closeIn = close.filter((p) => inArea(p.geoid) !== null);
    const fitsIds = new Set(fitsIn.map((p) => p.geoid));
    const closeIds = new Set(closeIn.map((p) => p.geoid));
    const withShare = (r: TractRow): TractRow => (area ? { ...r, share: inArea(r.geoid) ?? undefined } : r);
    const both = (p: { a: TractValue; b: TractValue }) => ({ a: withShare(toRow(p.a, nameYear, names)), b: toRow(p.b, nameYear, names) });
    const shown = area ? pairs.filter((p) => inArea(p.geoid) !== null) : pairs;
```

  - In `detail`:
    - change `fits: fits.map(both), fitsCount: fits.length, close: close.map(both), closeCount: close.length,` to `fits: fitsIn.map(both), fitsCount: fitsIn.length, close: closeIn.map(both), closeCount: closeIn.length,`;
    - change `points: pairs.map(...)` to `points: shown.map(...)`, with the same body;
    - add after `key,`:

```ts
      ...(area ? { area: areaHead(area, shown.map((p) => inArea(p.geoid) ?? 0)) } : {}),
```

- [ ] **Step 4: Run and watch them pass**

Run: `npx vitest run convex/tracts.test.ts && npx tsc --noEmit`
Expected: PASS, every relate test, old and new.

- [ ] **Step 5: Commit**

```bash
git add convex/tracts.ts convex/tracts.test.ts
git commit -m "feat: relate within a neighborhood: citywide cutoffs, its matches only, and an honest refusal for 'go together'

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Ask wiring

**Files:**
- Modify: `lib/ask/tools.ts`, `lib/ask/prompt.ts`, `lib/ask/model.ts`
- Test: `tests/ui/askTools.test.ts`

**Interfaces:**
- Consumes: Tasks 2–4's action args
- Produces: `rankParams`, `changeParams` and `relateParams` with `neighborhood: z.string().max(80).optional()` and `map: z.enum(["city", "dycu"]).optional()`

- [ ] **Step 1: Write the failing test** (append to `tests/ui/askTools.test.ts`)

```ts
import { ASK_PROMPT } from "../../lib/ask/prompt"; // add beside the other imports

describe("tract questions by neighborhood", () => {
  it("gives all three tract tools a neighborhood and a map, and says what their refusals mean", () => {
    for (const name of ["rankTracts", "compareYears", "relateTracts"]) {
      const tool = askTools(backend({})).find((t) => t.name === name)!;
      const shape = (tool.parameters as { shape: Record<string, unknown> }).shape;
      expect(shape).toHaveProperty("neighborhood");
      expect(shape).toHaveProperty("map");
      expect(tool.description).toContain("neighborhood");
      expect(tool.description).toContain("no-neighborhood");
    }
    expect(askTools(backend({})).find((t) => t.name === "relateTracts")!.description).toContain("too-few-tracts");
  });
  it("keeps one figure for a DYCU neighborhood on getNumber, and sends its tracts to the tract tools", () => {
    expect(ASK_PROMPT).toContain("For a neighborhood's tracts");
    expect(ASK_PROMPT).toContain("one figure for a neighborhood DYCU profiles, use getNumber");
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run tests/ui/askTools.test.ts -t "by neighborhood"`
Expected: FAIL. The shape has no `neighborhood`, and the prompt doesn't contain the rule.

- [ ] **Step 3: Implement**

In `lib/ask/tools.ts`, after the `cutoff` const:

```ts
// A tract question limited to one neighborhood: the City's official one, or DYCU's area when the person says so.
const area = {
  neighborhood: z.string().max(80).optional().describe("A neighborhood name, when the person asks about its tracts (e.g. \"Bay View's tracts\")"),
  map: z.enum(["city", "dycu"]).optional().describe('"dycu" only when the person says DYCU\'s area (e.g. "DYCU\'s Harambee"); otherwise leave it out for the City\'s official neighborhood'),
};
```

and add `...area` to `rankParams`, `changeParams` and the `relateParams` object.

Append this sentence to each of the three descriptions (rank, compare, relate):

```ts
" With neighborhood, only the tracts in that neighborhood are used (the City's boundary, or DYCU's area with map dycu), each with how much of it is inside; if it returns no-neighborhood, offer the names it returned; if no-tracts, say the neighborhood is smaller than any tract."
```

Append this to the relate description only:

```ts
" Inside a neighborhood, mode relate returns too-few-tracts (it takes 20 tracts): say so and offer the citywide question."
```

In `lib/ask/prompt.ts`, after the tract rule (the line starting `- DYCU's census-tract datasets`), add:

```
- For a neighborhood's tracts ("the tracts in Bay View", "which parts of Harambee", "where in Sherman Park"), call the tract tool with neighborhood; set map to dycu only when the person says DYCU's area. For one figure for a neighborhood DYCU profiles, use getNumber, as before. Never add tracts together into one neighborhood number.
```

In `lib/ask/model.ts`:
- add, before the `question.includes("rank tracts")` branch:

```ts
                : question.includes("bay view")
                ? call("rankTracts", { code: "E02", column: "pov_rate", place: "County", year: "2023", direction: "high", neighborhood: "Bay View" })
```

- add `"bay view" → rankTracts E02 County 2023 limited to Bay View;` to the comment listing the scripted cases.

- [ ] **Step 4: Run and watch it pass**

Run: `npx vitest run tests/ui/askTools.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/ask/tools.ts lib/ask/prompt.ts lib/ask/model.ts tests/ui/askTools.test.ts
git commit -m "feat: Ask can limit tract questions to a neighborhood

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: The cards

**Files:**
- Create: `ui/lib/tractArea.ts`
- Modify:
  - `ui/lib/tractSummary.ts`, `ui/lib/refusalChoices.ts`, `ui/lib/cardExport.ts`
  - `ui/components/TractCards.tsx`, `ui/components/AskCards.tsx`, `ui/components/ask.module.css`
  - `e2e/ask.spec.ts`
- Test: `tests/ui/tractArea.test.ts` (new), `tests/ui/cardExport.test.ts`

**Interfaces:**
- Consumes: `AreaHead` and the new detail fields from Tasks 2–4; Task 5's params
- Produces:
  - `areaLine(a: AreaHead): string`
  - `shareText(share: number, name: string): string`
  - `cityRankText(r: { position: number; of: number }, direction: "high" | "low"): string`
  - `areaPhrase(a: { name: string; map: "city" | "dycu" }): string`
  - `onlyIn(a): string`
  - `noTractsText(r): string`
  - `tooFewText(r): string`
  - `withArea(items: FollowUp[], area?: …): FollowUp[]`

- [ ] **Step 1: Write the failing unit tests** in `tests/ui/tractArea.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { areaLine, cityRankText, noTractsText, onlyIn, shareText, tooFewText, withArea } from "../../ui/lib/tractArea";
import { changeSummary, rankSummary, relateSummary } from "../../ui/lib/tractSummary";
import { rankChoices, relateChoices } from "../../ui/lib/refusalChoices";

const bay = { name: "Bay View", map: "city" as const, tracts: 11, partly: 6 };
const h = { code: "E02", name: "Households Living in Poverty", column: "pov_rate", meaning: "Share of households below the poverty line.", kind: "rate" as const, place: "County", year: "2023", n: 11, leftOut: 0, confidence: "90% confidence (Census)" };

describe("the card's neighborhood words", () => {
  it("names the map, the tract count and the partly-inside count", () => {
    expect(areaLine(bay)).toBe("Bay View (City of Milwaukee boundary) · 11 tracts, 6 partly inside");
    expect(areaLine({ name: "Harambee", map: "dycu", tracts: 1, partly: 0 })).toBe("Harambee (DYCU's area) · 1 tract");
  });
  it("writes the share, the citywide rank and the refusals in plain words", () => {
    expect(shareText(61, "Bay View")).toBe("61% of this tract is in Bay View");
    expect(cityRankText({ position: 12, of: 210 }, "high")).toBe("12th highest of 210");
    expect(cityRankText({ position: 1, of: 210 }, "low")).toBe("1st lowest of 210");
    expect(cityRankText({ position: 23, of: 210 }, "high")).toBe("23rd highest of 210");
    expect(noTractsText({ name: "Buchel Park", map: "city" })).toBe("Buchel Park covers less than 10% of every census tract it touches, so no tract can stand for it. Try a larger neighborhood nearby, or count City records inside its boundary.");
    expect(noTractsText({ name: "Harambee", map: "dycu", years: [2021, 2022] })).toBe("DYCU's Harambee area has no tracts in this dataset's year; DYCU defines it for 2021, 2022.");
    expect(tooFewText({ name: "Harambee", n: 9, needed: 20 })).toBe("Too few tracts in Harambee to tell whether these go together (it takes 20; Harambee has 9).");
  });
  it("keeps the neighborhood on follow-up questions", () => {
    expect(onlyIn({ name: "Harambee", map: "dycu" })).toBe("Only the tracts in DYCU's Harambee area.");
    expect(withArea([{ label: "SHOW THE LOWEST", question: "Rank census tracts by x." }], bay)).toEqual([{ label: "SHOW THE LOWEST", question: "Rank census tracts by x. Only the tracts in Bay View." }]);
    expect(withArea([{ label: "A", question: "Q?" }], undefined)).toEqual([{ label: "A", question: "Q?" }]);
  });
});

describe("sentences for a neighborhood", () => {
  it("says the list is every tract in the neighborhood, not the highest citywide", () => {
    expect(rankSummary({ header: h, direction: "high", top: 11, tieCount: 0, unreliableCount: 0, area: bay })).toMatch(/^These are the 11 census tracts in Bay View, from highest to lowest/);
  });
  it("places a change and a mismatch in the neighborhood", () => {
    expect(changeSummary({ header: h, from: "2022", to: "2023", increases: 1, decreases: 0, none: 2, area: bay })).toContain("in Bay View");
    expect(relateSummary({ mode: "mismatch", a: h, b: { ...h, code: "F02", column: "per_insecure" }, aSide: "high", bSide: "low", cutA: 30, cutB: 10, fitsCount: 1, closeCount: 0, n: 210, area: bay } as never)).toContain("census tracts in Bay View");
  });
});

describe("buttons keep the neighborhood", () => {
  const args = { code: "E02", column: "pov_rate", place: "County", year: "2023", direction: "high" as const, neighborhood: "Bay Vew" };
  it("offers each nearest name with the rest of the question", () => {
    const b = rankChoices(args, { status: "no-neighborhood", asked: "Bay Vew", nearest: ["Bay View"] } as never);
    expect(b).toEqual([{ label: "Bay View", question: expect.stringMatching(/Only the tracts in Bay View\.$/) }]);
  });
  it("offers the citywide question when a neighborhood is too small to relate", () => {
    const r = relateChoices({ a: { code: "E02", column: "pov_rate" }, b: { code: "F02", column: "per_insecure" }, place: "City", year: "2022", mode: "relate", neighborhood: "Harambee" } as never, { status: "too-few-tracts", name: "Harambee", n: 9, needed: 20 } as never);
    expect(r).toHaveLength(1);
    expect(r[0].label).toBe("ASK CITYWIDE");
    expect(r[0].question).not.toContain("Harambee");
  });
});
```

Append to `tests/ui/cardExport.test.ts`, inside `describe("rank export", …)`:

```ts
  it("adds the neighborhood line and a citywide rank column when the card is limited to one", () => {
    const inArea = rankExport({ ...d, top: [{ ...hillside, share: 51, cityRank: { position: 3, of: 210 } }], area: { name: "Hillside", map: "city", tracts: 1, partly: 1 } }, card, ctx);
    expect(inArea.lines[0]).toBe("Hillside (City of Milwaukee boundary) · 1 tract, 1 partly inside");
    expect(inArea.csv.head.at(-1)).toBe("Citywide rank");
    expect(inArea.csv.rows[0].at(-1)).toBe("3 of 210");
  });
```

- [ ] **Step 2: Run and watch them fail**

Run: `npx vitest run tests/ui/tractArea.test.ts tests/ui/cardExport.test.ts`
Expected: FAIL. `tractArea` can't be resolved, and the rank export has no area line.

- [ ] **Step 3: Create `ui/lib/tractArea.ts`**

```ts
import type { FollowUp } from "@/ui/components/FollowUps";
import type { AreaHead } from "@/convex/lib/tractsIn";

// The words a tract card uses when it is limited to one neighborhood (spec 2026-10-12-tracts-by-neighborhood §5).
type AreaIn = { name: string; map: "city" | "dycu" };
export const areaPhrase = (a: AreaIn) => (a.map === "dycu" ? `DYCU's ${a.name} area` : a.name);
export function areaLine(a: AreaHead): string {
  const which = a.map === "dycu" ? `${a.name} (DYCU's area)` : `${a.name} (City of Milwaukee boundary)`;
  return `${which} · ${a.tracts} ${a.tracts === 1 ? "tract" : "tracts"}${a.partly ? `, ${a.partly} partly inside` : ""}`;
}
export const shareText = (share: number, name: string) => `${share}% of this tract is in ${name}`;
const ordinal = (n: number) => {
  const v = n % 100;
  return `${n}${v >= 11 && v <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th"}`;
};
export const cityRankText = (r: { position: number; of: number }, direction: "high" | "low") => `${ordinal(r.position)} ${direction === "high" ? "highest" : "lowest"} of ${r.of}`;
export const onlyIn = (a: AreaIn) => `Only the tracts in ${areaPhrase(a)}.`;
export const withArea = (items: FollowUp[], area?: AreaIn): FollowUp[] => (area ? items.map((f) => ({ ...f, question: `${f.question} ${onlyIn(area)}` })) : items);
export function noTractsText(r: { name: string; map: "city" | "dycu"; years?: number[] }): string {
  if (r.map === "dycu") return `DYCU's ${r.name} area has no tracts in this dataset's year${r.years?.length ? `; DYCU defines it for ${r.years.join(", ")}` : ""}.`;
  return `${r.name} covers less than 10% of every census tract it touches, so no tract can stand for it. Try a larger neighborhood nearby, or count City records inside its boundary.`;
}
export const tooFewText = (r: { name: string; n: number; needed: number }) => `Too few tracts in ${r.name} to tell whether these go together (it takes ${r.needed}; ${r.name} has ${r.n}).`;
```

- [ ] **Step 4: Sentences take an area** (`ui/lib/tractSummary.ts`)
  - Import: `import { areaPhrase } from "./tractArea";`
  - **`rankSummary`:**
    - add `area?: { name: string; map: "city" | "dycu" }` to its parameter type;
    - replace the `lead` line with:

```ts
  const lead = r.area
    ? `${r.top === 1 ? "This is the census tract" : `These are the ${tracts(r.top)}`} in ${areaPhrase(r.area)}, from ${r.direction === "high" ? "highest to lowest" : "lowest to highest"} ${subject(h)} (${yearIn(h.year)}).`
    : `${which} in ${placeName(h.place)} with the ${r.direction === "high" ? "highest" : "lowest"} ${subject(h)} (${yearIn(h.year)}).`;
```

  - **`changeSummary`:**
    - add `area?: { name: string; map: "city" | "dycu" }` to its parameter type;
    - change `in ${placeName(h.place)}` in `when` to `in ${r.area ? areaPhrase(r.area) : placeName(h.place)}`.
  - **`relateSummary`:**
    - add `area?: { name: string; map: "city" | "dycu" }` to the `Relate` type;
    - change `const where = …` to:

```ts
  const where = r.area ? `${areaPhrase(r.area)} (${yearsIn(r.a, r.b)}; cutoffs from all of ${placeName(place)})` : `${placeName(place)} (${yearsIn(r.a, r.b)})`;
```

- [ ] **Step 5: Buttons keep the neighborhood** (`ui/lib/refusalChoices.ts`)
  - Import: `import { onlyIn } from "./tractArea";`
  - Add `neighborhood?: string; map?: "city" | "dycu"` to `RankArgs`, `ChangeArgs` and `RelateArgs`.
  - First line inside `rankChoices`:

```ts
  if (r.status === "no-neighborhood" && "nearest" in r) return (r.nearest as string[]).slice(0, MAX).map((n) => ({ label: n, question: `${rankQ(args, args.column, args.column)} ${onlyIn({ name: n, map: args.map ?? "city" })}` }));
```

  - First line inside `changeChoices`:

```ts
  if (r.status === "no-neighborhood" && "nearest" in r) return (r.nearest as string[]).slice(0, MAX).map((n) => ({ label: n, question: `${changeQ(args, args.column, args.column)} ${onlyIn({ name: n, map: args.map ?? "city" })}` }));
```

  - First lines inside `relateChoices`:

```ts
  if (r.status === "no-neighborhood" && "nearest" in r) return (r.nearest as string[]).slice(0, MAX).map((n) => ({ label: n, question: `${relateQ(args)} ${onlyIn({ name: n, map: args.map ?? "city" })}` }));
  if (r.status === "too-few-tracts") return [{ label: "ASK CITYWIDE", question: relateQ(args) }];
```

- [ ] **Step 6: The rank export** (`ui/lib/cardExport.ts`)
  - Import: `import { areaLine } from "./tractArea";`
  - In `rankExport`:
    - change `lines: [metaLine(h), ...card.lines],` to `lines: [...(d.area ? [areaLine(d.area)] : []), metaLine(h), ...card.lines],`;
    - change the csv `head` to end with `"Status", ...(d.area ? ["Citywide rank"] : [])]`;
    - append `...(d.area ? [t.cityRank ? \`${t.cityRank.position} of ${t.cityRank.of}\` : null] : [])` to each csv row array.
  - In `changeExport` and `relateExport`, change `lines: [` to start with `...(d.area ? [areaLine(d.area)] : []),`.

- [ ] **Step 7: Run the unit tests and watch them pass**

Run: `npx vitest run tests/ui/tractArea.test.ts tests/ui/cardExport.test.ts tests/ui && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 8: The cards** (`ui/components/TractCards.tsx`)
  - Import: `import { areaLine, cityRankText, shareText } from "@/ui/lib/tractArea";` and `type AreaHead` from `@/convex/lib/tractsIn`.
  - Below `Places`, add:

```tsx
// A tract's City neighborhoods, plus how much of it is in the card's neighborhood when the card is limited to one.
function Where({ t, area }: { t: { city: CityShare[]; share?: number }; area?: AreaHead }) {
  return <><Places city={t.city} />{area && t.share !== undefined && t.share < 100 && <span className={styles.tractShare}>{shareText(t.share, area.name)}</span>}</>;
}
const AreaLine = ({ area }: { area?: AreaHead }) => (area ? <p className={styles.tractMeta} data-area>{areaLine(area)}</p> : null);
```

  - **In `RankCard`:**
    - `const area = full?.area ?? r.area;`
    - `head` becomes `["#", "Tract", "Neighborhood", "DYCU area", h.column, ...(area ? ["Citywide"] : [])]`;
    - pass `area` to `rankSummary({ …, area })`;
    - in every row (top, tie, unreliable):
      - replace `<Places city={t.city} />` with `<Where t={t} area={area} />`;
      - when `area`, end the row with `<td>{t.cityRank ? cityRankText(t.cityRank, r.direction) : "—"}</td>`;
    - render `<AreaLine area={area} />` right after `<Head … />`;
    - in its ExportBar `lines`, use `(bare ? [summary, BARE_RANK] : [summary])` unchanged (the area line comes from `rankExport`).
  - **In `ChangeCard`:**
    - `const area = full?.area ?? r.area;`
    - pass `area` to `changeSummary`;
    - replace `<Places city={c.city} />` with `<Where t={c} area={area} />`;
    - add `<AreaLine area={area} />` after `<Head … />`.
  - **In `RelateCard`:**
    - `const area = full?.area ?? r.area;`
    - pass `area` into `relateSummary({ ...r, a, b, area })`;
    - add `<AreaLine area={area} />` after `<Head … />`;
    - give `PairRow` an `area?: AreaHead` prop, pass it from each `PairRow` use, and in `PairRow` replace `<Places city={p.a.city} />` with `<Where t={p.a} area={area} />`.
  - In `ui/components/ask.module.css`, after `.tractMeta { … }`, add:

```css
.tractShare { display: block; color: var(--muted); }
```

- [ ] **Step 9: Refusal text and follow-ups** (`ui/components/AskCards.tsx`)
  - Import: `import { noTractsText, tooFewText, withArea } from "@/ui/lib/tractArea";`
  - In `tractCard`, before the final `return <FollowUps pick …`, add:

```tsx
    if (r.status === "no-tracts") return <p className={styles.failed} data-card="tract-no-tracts">{noTractsText(r as never)}</p>;
    if (r.status === "too-few-tracts") return <><p className={styles.failed} data-card="tract-too-few">{tooFewText(r as never)}</p><FollowUps pick items={choices(r)} id={id} /></>;
```

  - In the three `useRenderTool` calls, wrap the follow-ups:
    - rank: `(r) => withArea(rankFollowUps(r.header, r.direction), r.area)`
    - compare: `(r) => withArea(changeFollowUps(r.header, r.to), r.area)`
    - relate: `(r) => withArea(relateFollowUps({ … }).filter((f) => !(r.area && f.label === "DO THEY GO TOGETHER?")), r.area)`

- [ ] **Step 10: Write the failing browser test** (`e2e/ask.spec.ts`, after "a ranking question draws a ranked tract table with ranges")

```ts
  test("a neighborhood's tracts arrive as every tract in it, with its share and citywide rank", async ({ page }) => {
    test.skip(!(await dycuUp(page)), "DYCU unreachable");
    await ask(page, "What's the poverty rate in Bay View's tracts?");
    const card = page.locator("[data-card=tract-rank]:visible");
    await expect(card.locator("tbody tr").first()).toBeVisible({ timeout: 60_000 });
    await expect(card.locator("[data-area]")).toContainText("Bay View (City of Milwaukee boundary)");
    await expect(card).toContainText(/\d+% of this tract is in Bay View/);
    await expect(card).toContainText(/\d+(st|nd|rd|th) highest of \d+/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
```

- [ ] **Step 11: Push the backend to development (needs Tarik's OK), build, and run the browser test**
  - Ask Tarik before `npx convex dev --once`, which pushes Tasks 1–4's backend to the development deployment.
  - Then:

Run: `npx next build && (npx next start -p 3100 &) && BASE_URL=http://localhost:3100 npx playwright test e2e/ask.spec.ts -g "neighborhood's tracts|ranking question|despite|grow most"`, with `.env.local` sourced (`set -a; . ./.env.local; set +a`).
Expected:
- **Before the push:** FAIL. The old backend rejects `neighborhood`.
- **After it:** PASS on desktop and phone, and the existing rank, mismatch and change tests still pass.
- **Screenshots:** take one of the card on each project with a throwaway spec (deleted after), and fix what looks wrong.

- [ ] **Step 12: Commit**

```bash
git add ui/lib/tractArea.ts ui/lib/tractSummary.ts ui/lib/refusalChoices.ts ui/lib/cardExport.ts ui/components/TractCards.tsx ui/components/AskCards.tsx ui/components/ask.module.css tests/ui/tractArea.test.ts tests/ui/cardExport.test.ts e2e/ask.spec.ts
git commit -m "feat: tract cards show a neighborhood's tracts with their share, citywide rank and honest refusals

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Docs and the graded question

**Files:**
- Create: `docs/decisions/035-tracts-by-neighborhood.md`
- Modify: `ui/components/HowItWorks.tsx`, `DESIGN.md`, `e2e/how.spec.ts`, `scripts/ask-questions.ts`

- [ ] **Step 1: Write the failing How it works test** (append to `e2e/how.spec.ts`)

```ts
test("it explains asking about a neighborhood's tracts", async ({ page }) => {
  await page.goto("/how-it-works");
  await expect(page.getByText(/61% of this tract is in Bay View/)).toBeVisible();
});
```

Run against the current build. Expected: FAIL.

- [ ] **Step 2: Write the docs**

`docs/decisions/035-tracts-by-neighborhood.md`:

```markdown
# 035: Tract questions by neighborhood list the tracts, never blend them

**Decision:** Ask can limit a tract ranking, a year-to-year comparison or a mismatch search to one neighborhood. It lists that neighborhood's census tracts (a census tract is a small area of 1,200 to 8,000 people the Census Bureau reports on), each with its own figure, margin of error and how much of the tract lies inside.

**Why this came up:** Nonprofits ask about "the tracts we serve" by neighborhood name. Ask could rank every tract in the city, but not just Bay View's. Neighborhoods and tracts don't line up: Bay View touches 11 tracts, and 6 of them are only partly inside. Blending them into one number would hide that.

**Options:**
- List the tracts, each with its share inside. Cheap and honest; the reader sees the edge tracts.
- One combined neighborhood number. It needs counts rather than rates, a rule for partial tracts and new margin-of-error math, and it fits better with the fact sheet (D).
- Only tracts mostly inside. A cleaner list, but Sherman Park would drop to 2 tracts, and nobody would see why.

**What we chose and why (Tarik, 2026-10-12):**
- List every tract with at least 10% of its area inside, and show the share ("61% of this tract is in Bay View").
- Use the City's official neighborhood by default and DYCU's area on request, the same rule City counts use.
- Inside a neighborhood, "do these go together" refuses, because that test needs 20 tracts and a neighborhood has 2 to 11. It offers the citywide question instead.
- Mismatch searches keep their citywide cutoffs, so "high" still means high for Milwaukee.

**What we gave up:**
- No single neighborhood number yet.
- 15 small City neighborhoods (Buchel Park, College Heights and others) cover less than 10% of every tract they touch, so they get a message instead of a list.

**How we'll know if this was right:** reporters and nonprofits quote individual tracts with their shares rather than asking for a combined number; no card shows a blended neighborhood figure.

**What actually happened:**
```

In `ui/components/HowItWorks.tsx`, inside the "WHAT THE AI DOES" section and after the paragraph that starts "Ask can also say how long", add:

```tsx
            <p>
              You can also ask about one neighborhood&apos;s census tracts, like &ldquo;the poverty rate in Bay View&apos;s tracts.&rdquo; Ask
              lists every tract with at least 10% of its area in the neighborhood, each with its own figure and range, and says how much of
              it is inside: &ldquo;61% of this tract is in Bay View.&rdquo; It never adds tracts together into one neighborhood number.
            </p>
```

In `DESIGN.md`, after the `### Totals` section, add:

```markdown
### A neighborhood's tracts

- A tract card limited to a neighborhood opens with one line: "Bay View (City of Milwaukee boundary) · 11 tracts, 6 partly inside", or "Harambee (DYCU's area) · 9 tracts".
- Each partly-inside row adds a muted line under its neighborhoods: "61% of this tract is in Bay View". At 100% nothing is added.
- A ranking adds a "Citywide" column ("12th highest of 210") so a reader can tell whether high is high for Milwaukee.
```

- [ ] **Step 3: Add the graded question.** In `scripts/ask-questions.ts`, after the "How much back property tax" entry, add:

```ts
  { q: "What's the poverty rate in Bay View's tracts?", tool: "rankTracts", expect: { neighborhood: "Bay View" }, final: true },
```

The grader (`scripts/ask-report-card.ts`) passes when every `expect` value appears in the tool's output; "Bay View" is in the answer's `area.name`, so no grader change is needed.

- [ ] **Step 4: Rebuild, run How it works and the graded question**

Run: `npx next build`, then restart on port 3100, then `BASE_URL=http://localhost:3100 npx playwright test e2e/how.spec.ts`
Expected: PASS (all).

Run: `npm run ask:card -- --only=<its position>`
Expected: 1/1 passed, with `rankTracts` called with `neighborhood: "Bay View"`.

- [ ] **Step 5: Commit**

```bash
git add docs/decisions/035-tracts-by-neighborhood.md ui/components/HowItWorks.tsx DESIGN.md e2e/how.spec.ts scripts/ask-questions.ts
git commit -m "docs: decision 035, How it works and DESIGN.md on a neighborhood's tracts; grade one real-model question

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```
