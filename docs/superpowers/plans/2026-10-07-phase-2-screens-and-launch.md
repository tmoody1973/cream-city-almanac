# Cream City Almanac, Phase 2: Screens and Public Launch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A public, phone-first website where a reporter searches Milwaukee's DYCU data, opens a result in place, reads a plain-English dataset sheet with a live preview, and downloads the data, launched on Vercel production with CI and a public GitHub repo.

**Architecture:** Next.js 16 App Router on Vercel renders pages on the server with `fetchQuery` from the Phase 1 Convex backend; small client components handle search (`useAction`), in-place previews (`useQuery`), the live Hub preview (browser `fetch` to ArcGIS, CORS verified), and grease-pencil marks (`localStorage`). Pure UI logic lives in `ui/lib/` and `convex/lib/grid.ts` with Vitest unit tests; screens are proven with Playwright on a phone and a desktop, accessibility-checked with axe, and measured against the approved comp by Impeccable's comp-led build gates. Part B makes the repo public, adds CI, creates the Convex production deployment, and deploys to Vercel production.

**Tech Stack:** Next.js 16.4, React 19.3, Convex 1.46 (`convex/react`, `convex/nextjs`), `@convex-dev/rate-limiter` 0.4.1, Playwright 1.63 + `@axe-core/playwright` 4.13, Vitest 5, GitHub Actions, Vercel, Impeccable (comp-led build).

**Spec:** `docs/superpowers/specs/2026-10-07-cream-city-almanac-design.md` (§7 screens, §9 preview/search rows, §10 items 5–7, §11 steps 2 and 5). Also read `PRODUCT.md`, the direction contract `.impeccable/surfaces/app-page-tsx.md`, the approved comps `.impeccable/mocks/home-b.webp` (first viewport) and `.impeccable/mocks/home-c.webp` (results state), and `.impeccable/build/spec.json` (measured regions). Phase 1 plan: `docs/superpowers/plans/2026-10-07-phase-1-catalog-builder-and-search.md`.

## Global Constraints

- Versions: `next@^16.4.0`, `react@^19.3.0`, `react-dom@^19.3.0`, `@convex-dev/rate-limiter@^0.4.1`, `@playwright/test@^1.63.0`, `@axe-core/playwright@^4.13.0`. Existing: `convex@^1.46.0`, `typescript@^6.0.3`, `vitest@^5.0.3`.
- Fonts come from Impeccable's font-match (never hand-picked): display **Karantina** (400/700), body **Vazirmatn** (300/500/700), via `next/font/google`.
- Colors: paper `#FFFFFF`, ink `#111111`, band `#EDEDEA`, muted text `#5C5C5C`, red `#D7261E` **only** for grease-pencil marks (updated circle, opened tick). No shadows, border radii, gradients, cards, or glow.
- Type sizes: comp px measured at 1024px wide, applied as `clamp(min, px/1024*100vw, px)`; phone floor 16px for body text. Tap targets ≥ 44px.
- Comp-led: Impeccable `build-phase` is at **hero**. No page code beyond the app shell until the hero task; every later phase gate (`build-phase advance`) must pass in order: hero → sections → motion → responsive → review.
- Labels and fixed words are copied verbatim from the comps (`TODAY'S RUNDOWN`, `SLUG:`, `What are you reporting on?`, `UPDATED THIS SEASON`, `CODE`/`SLUG`/`UPDATED`/`YEARS`, `Open sheet →`, `CSV`, `SEARCH`/`ASK`/`SAVED`, `Built on Data You Can Use's public data`). Dataset names, places, years, codes and dates always come from live data.
- Live preview timeout: **8 seconds** (spec §9).
- Public search embedding cap: token bucket, **600 per hour, burst 100**; over the cap, search degrades to keyword-only with a notice.
- WCAG 2.2 AA: axe reports no serious or critical violations on phone and desktop.
- Convex dev deployment: `https://standing-swordfish-685.convex.cloud` (project `inventory`, team `tarikjmoody-gmail-com`).
- Secrets never enter git, the chat, or command output. Humans type secret values (marked **HUMAN**); tools pipe them from files that are deleted after use.
- Commits: Conventional Commits, **no** `Co-Authored-By` trailers (Tarik's global rule).
- Real codes used by tests: `W01` Asthma Prevalence, `F02` Food Insecurity Prevalence, `N02` Neighborhood Portrait, `V02` Daily Air Quality.

## Rulings carried into this plan

1. **Live names over comp names:** comp B shortens "Individuals with Bachelors Degree or Higher" to "Bachelor's Degree or Higher"; the build shows the real name (product truth beats comp copy for data).
2. **"web app" instead of comp's "map app":** two of the seven apps are dashboards, not maps.
3. **Ask and Saved tabs** render disabled ("Coming soon"); they ship in Phases 3–4.
4. **Rows show place, not source:** spec §7 asks for "place and source" on each row, but a catalog row carries no source today; sources show on the dataset sheet (SOURCES section). Cost if wrong: add a `source` field to `families` at build time and one span to `ResultRow`.
5. **No-results notice offers DYCU's email only;** spec §7 also offers Ask, which arrives in Phase 3 and joins the notice then.
6. **The search report card in CI grades the live production deployment** (on every push to `main` and weekly after the Monday rebuild), so it trails the newest commit by one deploy. Cost if wrong: a search regression is caught one deploy late.

## Review Focus

1. **Long names and many neighborhoods on a 390px phone** → text wraps, nothing scrolls sideways. Pinned by Task 9, test "no horizontal scroll on a phone".
2. **Browser storage blocked (private mode, strict settings)** → the page works, just without grease-pencil marks. Pinned by Task 3, test "safeStorage never throws when storage is blocked".
3. **The Hub's data server is slow or down** → the live preview says so within 8 seconds; the rest of the sheet and the downloads still work. Pinned by Task 3, test "fetchJson gives up after the timeout", and Task 7, test "when the Hub is down the preview says so and offers a retry".
4. **Unknown, lowercase, or retired code in the URL** → lowercase works; unknown or retired shows a 404 with a link back. Pinned by Task 1, test "familySheet accepts lowercase and returns null for unknown codes", and Task 7, test "unknown code shows the not-found page".
5. **Search degraded (cap reached, embeddings down) or the network fails** → a plain notice appears and keyword results still show. Pinned by Task 2, test "the 101st search in a burst falls back to keywords", and Task 3, test "searchNotice explains each state".

---

## File Structure

```
convex/
  convex.config.ts        registers the rate-limiter component (new)
  limits.ts               rate limiter instance + search cap (new)
  catalog.ts              public read queries: rundown, familySheet, familyPreview (new)
  lib/grid.ts             place × year grid (new, shared by Convex and UI)
  schema.ts               + families.by_code index, builds.familyCount/reportCount (modify)
  buildStore.ts / build.ts  setPending stores counts (modify)
  search.ts               cap in runSearch, exports rundownRows/toRow, catalogStatus counts (modify)
app/
  layout.tsx, globals.css, ConvexClientProvider.tsx
  page.tsx                home (server) → <SearchHome>
  d/[code]/page.tsx       dataset sheet (server) → <DatasetSheet>
  d/[code]/not-found.tsx
ui/
  lib/format.ts marks.ts preview.ts search.ts     pure, unit-tested
  components/
    rundown.module.css    home + results styles
    sheet.module.css      dataset sheet styles
    SearchHome.tsx Masthead.tsx TodayDate.tsx CatalogLine.tsx SlugBar.tsx
    RundownList.tsx ResultRow.tsx FamilyPreview.tsx PlaceYearGrid.tsx
    ProvenanceTag.tsx PencilMark.tsx Tick.tsx TabBar.tsx CreditFooter.tsx
    DatasetSheet.tsx LivePreview.tsx StripChart.tsx OpenedMark.tsx
public/plates/pencil-mark.png        the approved plate (copied from assets/plates)
e2e/ home.spec.ts sheet.spec.ts a11y.spec.ts capture.spec.ts
playwright.config.ts next.config.ts vercel.json scripts/vercel-build.sh
.github/workflows/ci.yml .github/workflows/e2e-preview.yml
README.md LICENSE (Task 12)
```

---

## Part A: Build (local)

### Task 1: Public catalog queries and catalog counts

**Files:**
- Create: `convex/lib/grid.ts`, `convex/catalog.ts`
- Modify: `convex/schema.ts` (families index `by_code`; builds `familyCount`, `reportCount`), `convex/buildStore.ts` (`setPending` args), `convex/build.ts` (`runBuild` passes counts), `convex/search.ts` (export `toRow`, `rundownRows`; `catalogStatus` returns counts)
- Test: `tests/lib/grid.test.ts`, `convex/catalog.test.ts`

**Interfaces:**
- Consumes: Phase 1 schema, `search.ts` (`ResultRow`), `matchSources` from `convex/lib/sources.ts`.
- Produces: `placeYearGrid(members: { place: string | null; years: number[] }[]): PlaceYearGrid` with `interface PlaceYearGrid { places: string[]; years: number[]; cells: string[] }` and `cellKey(place: string, year: number): string`; public queries `api.catalog.rundown() → ResultRow[]`, `api.catalog.familySheet({ code }) → SheetData | null` (includes `fileLabel: "PDF" | "Spreadsheet" | null` and per-member `fileUrl: string | null`), `api.catalog.familyPreview({ key }) → { code, explainer, explainerProvenance, grid, csvUrl } | null`; `api.search.catalogStatus()` gains `families: number | null`, `reports: number | null`.

- [ ] **Step 1: Write the failing tests**

`tests/lib/grid.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { cellKey, placeYearGrid } from "../../convex/lib/grid";

describe("placeYearGrid", () => {
  it("lists City and County first, years ascending, and the filled cells", () => {
    const grid = placeYearGrid([
      { place: "County", years: [2023] },
      { place: "City", years: [2022] },
      { place: "Harambee", years: [2022, 2023] },
    ]);
    expect(grid.places).toEqual(["City", "County", "Harambee"]);
    expect(grid.years).toEqual([2022, 2023]);
    expect(grid.cells.sort()).toEqual([cellKey("City", 2022), cellKey("County", 2023), cellKey("Harambee", 2022), cellKey("Harambee", 2023)].sort());
  });
  it("labels a member without a place as Milwaukee and handles no years", () => {
    expect(placeYearGrid([{ place: null, years: [] }])).toEqual({ places: ["Milwaukee"], years: [], cells: [] });
  });
});
```

`convex/catalog.test.ts`:

```ts
/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { describe, expect, it } from "vitest";
import { fixtureFamilies } from "../tests/helpers/fixtures";
import { api, internal } from "./_generated/api";
import { toFamilyInput } from "./lib/families";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");

async function seed(t: TestConvex<typeof schema>) {
  const buildId = await t.mutation(internal.buildStore.beginBuild, {});
  await t.mutation(internal.buildStore.swapCatalog, { buildId, families: fixtureFamilies().map((f) => toFamilyInput(f, null)), dictionaries: [] });
  return buildId;
}
const codeOf = (t: TestConvex<typeof schema>, key: string) =>
  t.run(async (ctx) => (await ctx.db.query("families").withIndex("by_key", (q) => q.eq("key", key)).first())!.code);

describe("catalog queries", () => {
  it("rundown returns the ten most recently updated families, newest first", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const rows = await t.query(api.catalog.rundown, {});
    expect(rows).toHaveLength(10);
    expect(rows.map((r) => r.latestModified)).toEqual([...rows.map((r) => r.latestModified)].sort().reverse());
  });

  it("familySheet accepts lowercase and returns null for unknown codes", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const code = await codeOf(t, "dataset:households-living-in-poverty");
    const sheet = await t.query(api.catalog.familySheet, { code: code.toLowerCase() });
    expect(sheet!.family.name).toBe("Households Living in Poverty");
    expect(sheet!.members).toHaveLength(5);
    expect(sheet!.members.map((m) => m.modified)).toEqual([...sheet!.members.map((m) => m.modified)].sort().reverse());
    expect(sheet!.grid.places).toEqual(["City", "County"]);
    expect(sheet!.card).toBeNull();
    expect(sheet!.fileLabel).toBeNull();
    expect(await t.query(api.catalog.familySheet, { code: "Z99" })).toBeNull();
  });

  it("familySheet gives report families a file link", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const sheet = await t.query(api.catalog.familySheet, { code: await codeOf(t, "document:neighborhood-portrait") });
    expect(sheet!.fileLabel).toBe("PDF");
    expect(sheet!.members[0].fileUrl).toMatch(/^https:\/\/www\.arcgis\.com\/sharing\/rest\/content\/items\/\w+\/data$/);
  });

  it("familyPreview links the newest CSV and falls back to the Hub description", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const preview = await t.query(api.catalog.familyPreview, { key: "dataset:daily-air-quality" });
    expect(preview!.csvUrl).toMatch(/\/csv/);
    expect(preview!.explainerProvenance).toBe("HUB");
    expect(preview!.grid.years).toEqual([2023, 2024, 2025]);
    expect(await t.query(api.catalog.familyPreview, { key: "dataset:nope" })).toBeNull();
  });

  it("catalogStatus reports family and report counts from the last good build", async () => {
    const t = convexTest(schema, modules);
    const buildId = await seed(t);
    await t.mutation(internal.buildStore.setPending, {
      buildId, pending: 226, familyCount: 46, reportCount: 180, notes: [],
      mismatch: { unlinkedTabs: [], suspectLinks: [], unmatchedHomeTitles: [], typoFixes: [] },
    });
    await t.mutation(internal.buildStore.completeBuild, { buildId, orphanChunksDeleted: 0 });
    expect(await t.query(api.search.catalogStatus, {})).toMatchObject({ families: 46, reports: 180, lastRunFailed: false });
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/lib/grid.test.ts convex/catalog.test.ts`
Expected: FAIL — `convex/lib/grid` and `api.catalog` do not exist.

- [ ] **Step 3: Write `convex/lib/grid.ts`**

```ts
export interface PlaceYearGrid {
  places: string[];
  years: number[];
  cells: string[];
}

const FIRST = ["City", "County"];
const NO_PLACE = "Milwaukee";

export const cellKey = (place: string, year: number) => `${place}|${year}`;

function placeOrder(a: string, b: string): number {
  const ia = FIRST.indexOf(a);
  const ib = FIRST.indexOf(b);
  if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  return a.localeCompare(b);
}

export function placeYearGrid(members: { place: string | null; years: number[] }[]): PlaceYearGrid {
  const places = [...new Set(members.map((m) => m.place ?? NO_PLACE))].sort(placeOrder);
  const years = [...new Set(members.flatMap((m) => m.years))].sort((a, b) => a - b);
  const cells = [...new Set(members.flatMap((m) => m.years.map((y) => cellKey(m.place ?? NO_PLACE, y))))];
  return { places, years, cells };
}
```

- [ ] **Step 4: Schema, build counts, and search exports**

In `convex/schema.ts`, add `.index("by_code", ["code"])` after `.index("by_key", ["key"])` on `families`, and add to the `builds` table object:

```ts
    familyCount: v.optional(v.number()),
    reportCount: v.optional(v.number()),
```

In `convex/buildStore.ts`, replace `setPending` with:

```ts
export const setPending = internalMutation({
  args: {
    buildId: v.id("builds"),
    pending: v.number(),
    familyCount: v.number(),
    reportCount: v.number(),
    notes: v.array(v.string()),
    mismatch: vMismatch,
  },
  handler: async (ctx, { buildId, ...fields }) => {
    await ctx.db.patch(buildId, fields);
  },
});
```

In `convex/build.ts` `runBuild`, change the `setPending` call to:

```ts
  await ctx.runMutation(internal.buildStore.setPending, {
    buildId,
    pending,
    familyCount: families.length,
    reportCount: reports.length,
    notes,
    mismatch,
  });
```

In `convex/build.test.ts`, add `familyCount: 46, reportCount: 180,` to the `setPending` call in `seed`.

In `convex/search.ts`: change `const toRow =` to `export const toRow =`; add above `rundown`:

```ts
export async function rundownRows(ctx: QueryCtx): Promise<ResultRow[]> {
  return (await ctx.db.query("families").withIndex("by_latestModified").order("desc").take(10)).map(toRow);
}
```

change the internal `rundown` handler to `handler: (ctx) => rundownRows(ctx),`, add `type QueryCtx` to the `./_generated/server` import, and replace the `catalogStatus` return with:

```ts
    return {
      asOf: lastGood?.finishedAt ?? null,
      lastRunFailed: latest?.status === "failed",
      running: latest?.status === "running" && Date.now() - latest.startedAt < STALE_BUILD_MS,
      families: lastGood?.familyCount ?? null,
      reports: lastGood?.reportCount ?? null,
    };
```

Update the existing `catalogStatus` test in `convex/search.test.ts` to expect `{ asOf: goodRow!.finishedAt, lastRunFailed: true, running: false, families: null, reports: null }`.

- [ ] **Step 5: Write `convex/catalog.ts`**

```ts
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { query, type QueryCtx } from "./_generated/server";
import { pdfUrl } from "./lib/arcgis";
import { isPdfFamily } from "./lib/families";
import { placeYearGrid } from "./lib/grid";
import { matchSources } from "./lib/sources";
import { rundownRows, toRow } from "./search";

const MAX_CODE_CHARS = 8;
const newestFirst = (a: Doc<"members">, b: Doc<"members">) => b.modified.localeCompare(a.modified);

async function familyMembers(ctx: QueryCtx, key: string) {
  return (await ctx.db.query("members").withIndex("by_family", (q) => q.eq("familyKey", key)).collect()).sort(newestFirst);
}

async function familyCard(ctx: QueryCtx, key: string) {
  return ctx.db.query("cards").withIndex("by_family", (q) => q.eq("familyKey", key)).first();
}

export const rundown = query({ args: {}, handler: (ctx) => rundownRows(ctx) });

export const familySheet = query({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const normalized = code.trim().toUpperCase().slice(0, MAX_CODE_CHARS);
    const family = await ctx.db.query("families").withIndex("by_code", (q) => q.eq("code", normalized)).first();
    if (!family) return null;
    const members = await familyMembers(ctx, family.key);
    const card = await familyCard(ctx, family.key);
    const dictionary = family.dictionaryTab
      ? await ctx.db.query("dictionaries").withIndex("by_tab", (q) => q.eq("tab", family.dictionaryTab!)).first()
      : null;
    const profiles = (await ctx.db.query("sources").collect()).map(({ name, url, summary, limits }) => ({ name, url, summary, limits }));
    return {
      family: toRow(family),
      // Reports have no Hub download links; their file is served from the item's /data URL.
      fileLabel: family.kind !== "document" ? null : isPdfFamily(family) ? "PDF" : "Spreadsheet",
      grid: placeYearGrid(members),
      members: members.map((m) => ({
        hubId: m.hubId,
        title: m.title,
        place: m.place,
        years: m.years,
        yearLabel: m.yearLabel,
        modified: m.modified,
        landingPage: m.landingPage,
        featureServerUrl: m.featureServerUrl,
        downloads: m.downloads,
        fileUrl: m.kind === "document" ? pdfUrl(m.hubId) : null,
      })),
      card: card
        ? {
            explainer: card.explainer,
            explainerProvenance: card.explainerProvenance,
            hubSummary: card.hubSummary,
            glossary: card.glossary,
            caveats: card.caveats,
            storyAngles: card.storyAngles,
            basic: card.basic,
          }
        : null,
      sources: matchSources(profiles, [dictionary?.dataSource ?? "", ...members.map((m) => m.description)].join(" ")),
    };
  },
});

export const familyPreview = query({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    const family = await ctx.db.query("families").withIndex("by_key", (q) => q.eq("key", key)).first();
    if (!family) return null;
    const members = await familyMembers(ctx, key);
    const card = await familyCard(ctx, key);
    return {
      code: family.code,
      explainer: card?.explainer ?? members[0]?.description ?? family.name,
      explainerProvenance: card ? card.explainerProvenance : ("HUB" as const),
      grid: placeYearGrid(members),
      csvUrl: members.find((m) => m.downloads.CSV)?.downloads.CSV ?? null,
    };
  },
});
```

- [ ] **Step 5b: Run tests, regenerate bindings, typecheck**

```bash
npx convex codegen
npx vitest run
npm run typecheck && npx tsc --noEmit -p convex
```

Expected: all tests pass (Phase 1's 129 plus 7 new); both typechecks clean.

- [ ] **Step 6: Deploy to dev and refresh counts**

```bash
npx convex dev --once
npx convex run build:start
```

Wait about a minute, then `npx convex run search:catalogStatus`. Expected: `"families": 46, "reports": 180`, `"lastRunFailed": false`.

- [ ] **Step 7: Commit**

```bash
git add convex tests
git commit -m "feat: add public catalog queries for the home, previews and dataset sheets"
```

---

### Task 2: Public search usage cap

**Files:**
- Create: `convex/convex.config.ts`, `convex/limits.ts`
- Modify: `convex/search.ts` (`runSearch`), `convex/search.test.ts`, `convex/evals.test.ts` (register the component)
- Test: `convex/search.test.ts`

**Interfaces:**
- Consumes: `runSearch` (Phase 1).
- Produces: `rateLimiter` and `SEARCH_EMBEDS` exported from `convex/limits.ts`; `runSearch` returns `degraded: true` once the cap is reached.

- [ ] **Step 1: Install the component**

```bash
npm install @convex-dev/rate-limiter@^0.4.1
```

- [ ] **Step 2: Write the failing test** (append to the `describe("searchCatalog")` block in `convex/search.test.ts`; add `import rateLimiterTest from "@convex-dev/rate-limiter/test";` to the imports, and call `rateLimiterTest.register(t)` right after every `convexTest(schema, modules)` in this file and in `convex/evals.test.ts`)

```ts
  it("the 101st search in a burst falls back to keywords", async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    rateLimiterTest.register(t);
    const fake = installFakeFetch();
    await seed(t);
    for (let i = 0; i < 100; i++) {
      expect((await t.action(api.search.searchCatalog, { query: "asthma" })).degraded).toBe(false);
    }
    const last = await t.action(api.search.searchCatalog, { query: "asthma" });
    expect(last.degraded).toBe(true);
    expect(last.results.map((r) => r.key)).toContain("dataset:asthma-prevalence");
    expect(fake.count("/v1/embeddings")).toBe(100);
    vi.useRealTimers();
  }, 60_000);
```

- [ ] **Step 3: Run it to see it fail**

Run: `npx vitest run convex/search.test.ts`
Expected: FAIL — `@convex-dev/rate-limiter/test` registers a component the app doesn't declare yet, or the 101st search is not degraded.

- [ ] **Step 4: Write `convex/convex.config.ts` and `convex/limits.ts`**

```ts
// convex/convex.config.ts
import rateLimiter from "@convex-dev/rate-limiter/convex.config.js";
import { defineApp } from "convex/server";

const app = defineApp();
app.use(rateLimiter);
export default app;
```

```ts
// convex/limits.ts
import { HOUR, RateLimiter } from "@convex-dev/rate-limiter";
import { components } from "./_generated/api";

// Public search spends one embedding call per non-blank query. About 10 a minute sustained, bursts to 100.
export const SEARCH_EMBEDS = { kind: "token bucket" as const, rate: 600, period: HOUR, capacity: 100 };

export const rateLimiter = new RateLimiter(components.rateLimiter, { searchEmbeds: SEARCH_EMBEDS });
```

In `convex/search.ts` add `import { rateLimiter } from "./limits";` and, inside the `try` in `runSearch`, as its first line:

```ts
    const allowance = await rateLimiter.limit(ctx, "searchEmbeds");
    if (!allowance.ok) throw new Error(`search embedding cap reached; retry in ${Math.ceil(allowance.retryAfter / 1000)}s`);
```

- [ ] **Step 5: Regenerate, run tests, typecheck, push to dev**

```bash
npx convex codegen
npx vitest run
npm run typecheck && npx tsc --noEmit -p convex
npx convex dev --once
```

Expected: all tests pass; dev push shows the `rateLimiter` component installed and `Convex functions ready!`.

- [ ] **Step 6: Commit**

```bash
git add convex package.json package-lock.json
git commit -m "feat: cap public search embedding calls with the Convex rate limiter"
```

---

### Task 3: UI logic modules

**Files:**
- Create: `ui/lib/format.ts`, `ui/lib/marks.ts`, `ui/lib/preview.ts`, `ui/lib/search.ts`
- Test: `tests/ui/format.test.ts`, `tests/ui/marks.test.ts`, `tests/ui/preview.test.ts`, `tests/ui/search.test.ts`

**Interfaces:**
- Consumes: `HubKind` from `convex/lib/types.ts`.
- Produces: `shortDate(iso)`, `asOfLabel(ms)`, `todayLabel(date)`, `yearSpan(years)`, `yearShort(years)`, `placeSummary(kind, places)`, `subline(row)`, `firstSentence(text)`; `LAST_VISIT_KEY`, `OPENED_KEY`, `interface Store`, `safeStorage(storage?)`, `circledCodes(rows, lastVisitIso)`, `readOpened(raw)`, `withOpened(raw, code)`; `PREVIEW_TIMEOUT_MS`, `rowsUrl(url, limit?)`, `valuesUrl(url, field)`, `headlineColumn(fields)`, `sharedScale(series)`, `type FetchResult<T>`, `fetchJson<T>(url, ms?, fetchImpl?)`; `type SearchState`, `searchNotice(state, response)`.

- [ ] **Step 1: Write the failing tests**

`tests/ui/format.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { asOfLabel, firstSentence, placeSummary, shortDate, subline, todayLabel, yearShort, yearSpan } from "../../ui/lib/format";

describe("format", () => {
  it("formats dates the way the comp does", () => {
    expect(shortDate("2026-07-28T15:18:39.612Z")).toBe("Jul 28");
    expect(shortDate("not a date")).toBe("");
    expect(asOfLabel(Date.UTC(2026, 9, 7, 18))).toBe("Oct 7");
    expect(todayLabel(new Date(2026, 9, 7, 12))).toBe("Wed Oct 7, 2026");
  });
  it("collapses years into spans", () => {
    expect(yearSpan([2023, 2024, 2025])).toBe("2023–2025");
    expect(yearSpan([2010, 2020])).toBe("2010, 2020");
    expect(yearSpan([2016, 2015, 2024, 2025])).toBe("2015–2016, 2024–2025");
    expect(yearSpan([])).toBe("");
    expect(yearShort([2022, 2023, 2024])).toBe("22 · 23 · 24");
    expect(yearShort([])).toBe("—");
  });
  it("summarizes places and builds the row subline", () => {
    expect(placeSummary("app", [])).toBe("web app");
    expect(placeSummary("document", Array.from({ length: 29 }, (_, i) => `n${i}`))).toBe("29 neighborhoods");
    expect(placeSummary("dataset", ["City", "County"])).toBe("City · County");
    expect(subline({ kind: "dataset", places: ["City"], years: [2023, 2024, 2025] })).toBe("City · 2023–2025");
    expect(subline({ kind: "app", places: [], years: [] })).toBe("web app");
  });
  it("takes the first sentence of an explainer", () => {
    expect(firstSentence("Share of adults with asthma. Uses CDC PLACES.")).toBe("Share of adults with asthma.");
    expect(firstSentence("No period here")).toBe("No period here");
  });
});
```

`tests/ui/marks.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { circledCodes, readOpened, safeStorage, withOpened } from "../../ui/lib/marks";

const rows = [
  { code: "V02", latestModified: "2026-07-28T00:00:00Z" },
  { code: "S01", latestModified: "2026-07-16T00:00:00Z" },
  { code: "A04", latestModified: "2026-06-25T00:00:00Z" },
];

describe("grease-pencil marks", () => {
  it("circles only the newest row on a first visit", () => {
    expect([...circledCodes(rows, null)]).toEqual(["V02"]);
  });
  it("circles everything updated since the last visit", () => {
    expect([...circledCodes(rows, "2026-07-01T00:00:00Z")].sort()).toEqual(["S01", "V02"]);
    expect([...circledCodes(rows, "2026-08-01T00:00:00Z")]).toEqual([]);
  });
  it("records opened codes, deduplicated, newest last", () => {
    const raw = withOpened(withOpened(null, "F02"), "W01");
    expect([...readOpened(withOpened(raw, "F02"))]).toEqual(["W01", "F02"]);
    expect([...readOpened("not json")]).toEqual([]);
  });
  it("safeStorage never throws when storage is blocked", () => {
    const blocked = { getItem: () => { throw new Error("SecurityError"); }, setItem: () => { throw new Error("SecurityError"); } } as unknown as Storage;
    const store = safeStorage(blocked);
    expect(store.get("x")).toBeNull();
    expect(() => store.set("x", "1")).not.toThrow();
  });
});
```

`tests/ui/preview.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { fetchJson, headlineColumn, rowsUrl, sharedScale, valuesUrl } from "../../ui/lib/preview";

describe("live preview helpers", () => {
  it("builds ArcGIS query URLs", () => {
    expect(rowsUrl("https://s.test/FeatureServer/0", 10)).toBe(
      "https://s.test/FeatureServer/0/query?where=1%3D1&outFields=*&returnGeometry=false&resultRecordCount=10&f=json",
    );
    expect(valuesUrl("https://s.test/FeatureServer/0", "per_asthma")).toContain("outFields=per_asthma");
  });
  it("picks a headline measure column", () => {
    expect(headlineColumn(["GEOID", "NAME", "per_asthma", "TotalPopulation"])).toBe("per_asthma");
    expect(headlineColumn(["GEOID", "median_income"])).toBe("median_income");
    expect(headlineColumn(["GEOID", "NAME"])).toBeNull();
  });
  it("puts every year on one shared scale", () => {
    expect(sharedScale([[1, 5], [3, 9]])).toEqual({ min: 1, max: 9 });
    expect(sharedScale([[4], [4]])).toEqual({ min: 3, max: 5 });
    expect(sharedScale([[], [Number.NaN]])).toBeNull();
  });
  it("fetchJson gives up after the timeout", async () => {
    vi.useFakeTimers();
    const pending = fetchJson("https://slow.test", 8000, () => new Promise<Response>(() => {}));
    await vi.advanceTimersByTimeAsync(8000);
    expect(await pending).toEqual({ ok: false, reason: "timeout" });
    vi.useRealTimers();
  });
  it("fetchJson reports HTTP and ArcGIS errors", async () => {
    expect(await fetchJson("u", 8000, async () => new Response("", { status: 503 }))).toEqual({ ok: false, reason: "HTTP 503" });
    expect(await fetchJson("u", 8000, async () => new Response(JSON.stringify({ error: { message: "Invalid URL" } })))).toEqual({
      ok: false,
      reason: "Invalid URL",
    });
  });
});
```

`tests/ui/search.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { searchNotice } from "../../ui/lib/search";

describe("searchNotice explains each state", () => {
  it("covers failure, no results, degraded, and normal", () => {
    expect(searchNotice("error", null)).toBe("Search failed. Check your connection and try again.");
    expect(searchNotice("idle", { degraded: false, results: [] })).toBe(
      "No datasets matched. Try fewer words, or email hub@datayoucanuse.org to ask DYCU.",
    );
    expect(searchNotice("idle", { degraded: true, results: [1] })).toBe("Showing keyword matches only right now.");
    expect(searchNotice("idle", { degraded: false, results: [1] })).toBeNull();
    expect(searchNotice("loading", null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/ui`
Expected: FAIL — `ui/lib/*` modules not found.

- [ ] **Step 3: Write `ui/lib/format.ts`**

```ts
import type { HubKind } from "../../convex/lib/types";

const MONTH_DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export function shortDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : MONTH_DAY.format(d);
}

export function asOfLabel(ms: number): string {
  return MONTH_DAY.format(new Date(ms));
}

export function todayLabel(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("weekday")} ${get("month")} ${get("day")}, ${get("year")}`;
}

export function yearSpan(years: number[]): string {
  const sorted = [...new Set(years)].sort((a, b) => a - b);
  const runs: number[][] = [];
  for (const y of sorted) {
    const last = runs[runs.length - 1];
    if (last && y === last[last.length - 1] + 1) last.push(y);
    else runs.push([y]);
  }
  return runs.map((r) => (r.length === 1 ? `${r[0]}` : `${r[0]}–${r[r.length - 1]}`)).join(", ");
}

export function yearShort(years: number[]): string {
  return years.length ? [...years].sort((a, b) => a - b).map((y) => String(y).slice(2)).join(" · ") : "—";
}

export function placeSummary(kind: HubKind, places: string[]): string {
  if (kind === "app") return "web app";
  if (places.length > 3) return `${places.length} neighborhoods`;
  return places.join(" · ");
}

export function subline(row: { kind: HubKind; places: string[]; years: number[] }): string {
  return [placeSummary(row.kind, row.places), yearSpan(row.years)].filter(Boolean).join(" · ");
}

export function firstSentence(text: string): string {
  return /^.*?[.!?](?=\s|$)/.exec(text.trim())?.[0] ?? text.trim();
}
```

- [ ] **Step 4: Write `ui/lib/marks.ts`**

```ts
export const LAST_VISIT_KEY = "cca:lastVisit";
export const OPENED_KEY = "cca:opened";
const MAX_OPENED = 200;

export interface Store {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

// Marks are a convenience: when storage is blocked (private mode), the page simply shows no marks.
export function safeStorage(storage?: Storage): Store {
  const target = () => storage ?? globalThis.localStorage;
  return {
    get: (key) => {
      try {
        return target()?.getItem(key) ?? null;
      } catch {
        return null;
      }
    },
    set: (key, value) => {
      try {
        target()?.setItem(key, value);
      } catch {
        // storage blocked: skip the mark, never break the page
      }
    },
  };
}

export function circledCodes(rows: { code: string; latestModified: string }[], lastVisitIso: string | null): Set<string> {
  if (!lastVisitIso) {
    const newest = [...rows].sort((a, b) => b.latestModified.localeCompare(a.latestModified))[0];
    return new Set(newest ? [newest.code] : []);
  }
  return new Set(rows.filter((r) => r.latestModified > lastVisitIso).map((r) => r.code));
}

export function readOpened(raw: string | null): Set<string> {
  try {
    const parsed: unknown = JSON.parse(raw ?? "[]");
    return new Set(Array.isArray(parsed) ? parsed.filter((c): c is string => typeof c === "string") : []);
  } catch {
    return new Set();
  }
}

export function withOpened(raw: string | null, code: string): string {
  const codes = [...readOpened(raw)].filter((c) => c !== code);
  return JSON.stringify([...codes, code].slice(-MAX_OPENED));
}
```

- [ ] **Step 5: Write `ui/lib/preview.ts` and `ui/lib/search.ts`**

```ts
// ui/lib/preview.ts
export const PREVIEW_TIMEOUT_MS = 8000;
const HEADLINE = /^(per_|pct|percent|rate|median|avg)/i;

export function rowsUrl(featureServerUrl: string, limit = 10): string {
  const params = new URLSearchParams({ where: "1=1", outFields: "*", returnGeometry: "false", resultRecordCount: String(limit), f: "json" });
  return `${featureServerUrl}/query?${params}`;
}

export function valuesUrl(featureServerUrl: string, field: string): string {
  const params = new URLSearchParams({ where: "1=1", outFields: field, returnGeometry: "false", resultRecordCount: "2000", f: "json" });
  return `${featureServerUrl}/query?${params}`;
}

export function headlineColumn(fields: string[]): string | null {
  return fields.find((f) => HEADLINE.test(f)) ?? null;
}

export function sharedScale(series: number[][]): { min: number; max: number } | null {
  const all = series.flat().filter(Number.isFinite);
  if (all.length === 0) return null;
  const min = all.reduce((m, v) => Math.min(m, v), Infinity);
  const max = all.reduce((m, v) => Math.max(m, v), -Infinity);
  return min === max ? { min: min - 1, max: max + 1 } : { min, max };
}

export type FetchResult<T> = { ok: true; data: T } | { ok: false; reason: string };

export async function fetchJson<T>(url: string, ms = PREVIEW_TIMEOUT_MS, fetchImpl: typeof fetch = fetch): Promise<FetchResult<T>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("timeout")), ms);
    });
    const res = await Promise.race([fetchImpl(url), timeout]);
    if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` };
    const body = await res.json();
    if (body?.error) return { ok: false, reason: String(body.error.message ?? "ArcGIS error") };
    return { ok: true, data: body as T };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(timer);
  }
}
```

```ts
// ui/lib/search.ts
export type SearchState = "idle" | "loading" | "error";

export function searchNotice(state: SearchState, response: { degraded: boolean; results: unknown[] } | null): string | null {
  if (state === "error") return "Search failed. Check your connection and try again.";
  if (state === "loading" || !response) return null;
  if (response.results.length === 0) return "No datasets matched. Try fewer words, or email hub@datayoucanuse.org to ask DYCU.";
  if (response.degraded) return "Showing keyword matches only right now.";
  return null;
}
```

- [ ] **Step 6: Run tests and typecheck**

Run: `npx vitest run tests/ui && npm run typecheck`
Expected: 15 tests PASS; typecheck clean. (If `tsc` does not include `ui/`, add `"ui"` to `include` in `tsconfig.json` — Task 4 rewrites it anyway.)

- [ ] **Step 7: Commit**

```bash
git add ui tests/ui tsconfig.json
git commit -m "feat: add UI logic for formatting, grease-pencil marks, live preview and search notices"
```

---

### Task 4: Next.js app shell and end-to-end harness

**Files:**
- Create: `next.config.ts`, `app/layout.tsx`, `app/globals.css`, `app/ConvexClientProvider.tsx`, `app/page.tsx` (shell only), `playwright.config.ts`, `e2e/home.spec.ts` (smoke), `public/plates/pencil-mark.png`
- Modify: `package.json` (deps + scripts), `tsconfig.json`, `.gitignore`, `.env.local` (add `NEXT_PUBLIC_CONVEX_URL`)

**Interfaces:**
- Consumes: `api.catalog.rundown`, `api.search.catalogStatus` (Task 1).
- Produces: CSS tokens in `app/globals.css` (`--paper --ink --band --muted --pencil --rule --hair --font-display --font-body --fs-wordmark --fs-masthead-side --fs-heading --fs-code --fs-body --fs-small --fs-label --gutter --row-h`); `ConvexClientProvider`; Playwright projects `phone` (iPhone 13) and `desktop` (1440×900); `npm run dev|build|e2e|capture`.

- [ ] **Step 1: Install and wire scripts**

```bash
npm install next@^16.4.0 react@^19.3.0 react-dom@^19.3.0
npm install -D @playwright/test@^1.63.0 @axe-core/playwright@^4.13.0 @types/react @types/react-dom
npm pkg set scripts.dev="next dev" scripts.build="next build" scripts.start="next start" scripts.e2e="playwright test --grep-invert @capture" scripts.capture="playwright test --grep @capture --project=desktop"
npx playwright install chromium webkit
grep -q '^NEXT_PUBLIC_CONVEX_URL=' .env.local || echo "NEXT_PUBLIC_CONVEX_URL=$(grep '^CONVEX_URL=' .env.local | cut -d= -f2-)" >> .env.local
mkdir -p public/plates && cp assets/plates/pencil-mark.png public/plates/pencil-mark.png
printf '\n# Next.js and Playwright\n.next/\nnext-env.d.ts\ntest-results/\nplaywright-report/\n' >> .gitignore
```

- [ ] **Step 2: Write `tsconfig.json`, `next.config.ts`, `app/globals.css`, `app/ConvexClientProvider.tsx`, `app/layout.tsx`**

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "preserve",
    "strict": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "allowJs": false,
    "noEmit": true,
    "incremental": true,
    "types": ["vite/client", "node"],
    "baseUrl": ".",
    "paths": { "@/*": ["./*"] },
    "plugins": [{ "name": "next" }]
  },
  "include": ["next-env.d.ts", "app", "ui", "convex", "tests", "e2e", "playwright.config.ts", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

`next.config.ts`:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {};

export default nextConfig;
```

`app/globals.css`:

```css
:root {
  --paper: #ffffff;
  --ink: #111111;
  --band: #ededea;
  --muted: #5c5c5c;
  --pencil: #d7261e;
  --rule: 2px solid var(--ink);
  --hair: 1px solid var(--ink);
  --font-display: var(--font-karantina), "Arial Narrow", sans-serif;
  --font-body: var(--font-vazirmatn), "Helvetica Neue", Arial, sans-serif;
  /* Measured from the approved comp at 1024px wide (.impeccable/build/spec.json), floored for phones. */
  --fs-wordmark: clamp(36px, 9.96vw, 102px);
  --fs-masthead-side: clamp(15px, 4vw, 41px);
  --fs-heading: clamp(26px, 5.47vw, 56px);
  --fs-code: clamp(22px, 5.66vw, 58px);
  --fs-body: clamp(16px, 2.93vw, 30px);
  --fs-small: clamp(14px, 2.54vw, 26px);
  --fs-label: clamp(14px, 2.73vw, 28px);
  --gutter: clamp(16px, 3.5vw, 36px);
  --row-h: clamp(64px, 15vw, 154px);
}

*,
*::before,
*::after {
  box-sizing: border-box;
}

html,
body {
  margin: 0;
  background: var(--paper);
  color: var(--ink);
}

body {
  font-family: var(--font-body);
  font-weight: 300;
  font-size: var(--fs-body);
  line-height: 1.3;
  -webkit-font-smoothing: antialiased;
}

a {
  color: inherit;
}

:focus-visible {
  outline: 3px solid var(--ink);
  outline-offset: 2px;
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation: none !important;
    transition: none !important;
  }
}
```

`app/ConvexClientProvider.tsx`:

```tsx
"use client";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import type { ReactNode } from "react";

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  return <ConvexProvider client={convex}>{children}</ConvexProvider>;
}
```

`app/layout.tsx`:

```tsx
import type { Metadata, Viewport } from "next";
import { Karantina, Vazirmatn } from "next/font/google";
import type { ReactNode } from "react";
import { ConvexClientProvider } from "./ConvexClientProvider";
import "./globals.css";

const display = Karantina({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-karantina", display: "swap" });
const body = Vazirmatn({ subsets: ["latin"], weight: ["300", "500", "700"], variable: "--font-vazirmatn", display: "swap" });

export const metadata: Metadata = {
  title: "Cream City Almanac",
  description: "Find, understand, and download Milwaukee's public data. Unofficial; built on Data You Can Use's public data.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#ffffff" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>
        <ConvexClientProvider>{children}</ConvexClientProvider>
      </body>
    </html>
  );
}
```

`app/page.tsx` (shell; Task 5 replaces the body):

```tsx
export default function HomePage() {
  return <main><h1>Cream City Almanac</h1></main>;
}
```

- [ ] **Step 3: Write `playwright.config.ts` and the failing smoke test `e2e/home.spec.ts`**

```ts
// playwright.config.ts
import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.BASE_URL ?? "http://localhost:3000";
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;

export default defineConfig({
  testDir: "e2e",
  timeout: 45_000,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL,
    trace: "retain-on-failure",
    extraHTTPHeaders: bypass ? { "x-vercel-protection-bypass": bypass, "x-vercel-set-bypass-cookie": "true" } : undefined,
  },
  projects: [
    { name: "phone", use: { ...devices["iPhone 13"] } },
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
  ],
  webServer: process.env.BASE_URL ? undefined : { command: "npm run dev", url: baseURL, reuseExistingServer: true, timeout: 120_000 },
});
```

```ts
// e2e/home.spec.ts
import { expect, test } from "@playwright/test";

test("home renders the wordmark", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: /cream city almanac/i })).toBeVisible();
  await expect(page).toHaveTitle("Cream City Almanac");
});
```

- [ ] **Step 4: Run the smoke test, the unit suite and both typechecks**

```bash
npm run e2e -- e2e/home.spec.ts
npx vitest run
npm run typecheck && npx tsc --noEmit -p convex
npm run build
```

Expected: smoke test PASS on `phone` and `desktop`; unit suite green; typechecks clean; `next build` succeeds. Next may rewrite `tsconfig.json` on first run — keep its changes and record them as a ruling.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json tsconfig.json next.config.ts app public playwright.config.ts e2e .gitignore
git commit -m "feat: add the Next.js app shell, fonts, tokens and Playwright harness"
```

---

### Task 5: Home first viewport (Impeccable hero)

**Files:**
- Create: `ui/components/rundown.module.css`, `ui/components/SearchHome.tsx`, `Masthead.tsx`, `TodayDate.tsx`, `CatalogLine.tsx`, `SlugBar.tsx`, `RundownList.tsx`, `ResultRow.tsx`, `PencilMark.tsx`, `Tick.tsx`, `TabBar.tsx`, `CreditFooter.tsx`, `e2e/capture.spec.ts`
- Modify: `app/page.tsx`, `e2e/home.spec.ts`

**Interfaces:**
- Consumes: Task 1 queries; Task 3 `format`/`marks`; Task 4 tokens.
- Produces: `<SearchHome rundown status />` (rundown mode in this task; search added in Task 6); `<ResultRow row mode circled opened />` collapsed; `.impeccable/review/hero-repro.png`.

- [ ] **Step 1: Write the failing e2e test** (replace `e2e/home.spec.ts`)

```ts
import { expect, test } from "@playwright/test";

test("home shows today's rundown with live codes and the catalog line", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: /cream city almanac/i })).toBeVisible();
  await expect(page.getByText("TODAY'S RUNDOWN")).toBeVisible();
  await expect(page.getByText(/Catalog as of \w{3} \d{1,2} · 46 datasets · 180 neighborhood reports/)).toBeVisible();
  await expect(page.getByLabel("SLUG:")).toHaveAttribute("placeholder", "What are you reporting on?");
  await expect(page.getByRole("heading", { name: "UPDATED THIS SEASON" })).toBeVisible();
  const rows = page.getByRole("listitem").filter({ has: page.locator("[data-code]") });
  await expect(rows).toHaveCount(10);
  await expect(rows.first()).toContainText("V02");
  await expect(page.getByText("updated since your last visit").first()).toBeAttached();
  await expect(page.getByRole("link", { name: "SEARCH" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByText("Built on Data You Can Use's public data")).toBeVisible();
});
```

`e2e/capture.spec.ts`:

```ts
import { test } from "@playwright/test";

const FIXED = new Date("2026-10-07T17:00:00Z");

test.describe("@capture", () => {
  test("hero at the comp's size", async ({ page }) => {
    await page.clock.setFixedTime(FIXED);
    await page.setViewportSize({ width: 1024, height: 1536 });
    await page.goto("/");
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: ".impeccable/review/hero-repro.png" });
  });

  test("desktop and mobile full pages", async ({ page }) => {
    await page.clock.setFixedTime(FIXED);
    for (const [width, height, file] of [
      [1440, 900, "desktop.png"],
      [390, 844, "mobile.png"],
    ] as const) {
      await page.setViewportSize({ width, height });
      await page.goto("/");
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: `.impeccable/review/${file}`, fullPage: true });
    }
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm run e2e -- e2e/home.spec.ts --project=desktop`
Expected: FAIL — "TODAY'S RUNDOWN" not found.

- [ ] **Step 3: Read the craft floor and place the plate first**

Read `/Users/tarikmoody/.claude/skills/impeccable/reference/craft-floor.md` in full before writing any component. Then confirm the plate box: `npx … impeccable comp-spec --print | grep pencil-mark` (box x70% y30% w30% h20% of the comp; the ellipse wraps the date in row 1).

- [ ] **Step 4: Write the components**

`ui/components/PencilMark.tsx`:

```tsx
import styles from "./rundown.module.css";

// The approved grease-pencil plate (assets/plates/pencil-mark.png); decorative, so the meaning is in hidden text.
export function PencilMark() {
  return (
    <>
      <img className={styles.pencil} src="/plates/pencil-mark.png" alt="" aria-hidden="true" width={1024} height={1024} />
      <span className="visually-hidden">updated since your last visit</span>
    </>
  );
}
```

`ui/components/Tick.tsx`:

```tsx
import styles from "./rundown.module.css";

export function Tick() {
  return (
    <>
      <svg className={styles.tick} viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 13 L9 19 L21 5" fill="none" stroke="var(--pencil)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="visually-hidden">opened before</span>
    </>
  );
}
```

`ui/components/TodayDate.tsx`:

```tsx
"use client";
import { useEffect, useState } from "react";
import { todayLabel } from "@/ui/lib/format";

// Client-side so the date is the reader's today (and so captures can fix the clock).
export function TodayDate({ className }: { className?: string }) {
  const [label, setLabel] = useState("");
  useEffect(() => setLabel(todayLabel(new Date())), []);
  return <span className={className} suppressHydrationWarning>{label}</span>;
}
```

`ui/components/Masthead.tsx`:

```tsx
import { TodayDate } from "./TodayDate";
import styles from "./rundown.module.css";

export function Masthead({ side, showDate }: { side: string; showDate: boolean }) {
  return (
    <header className={styles.masthead}>
      <h1 className={styles.wordmark}>Cream City Almanac</h1>
      <p className={styles.side}>
        {side}
        {showDate && <TodayDate className={styles.sideDate} />}
      </p>
    </header>
  );
}
```

`ui/components/CatalogLine.tsx`:

```tsx
import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
import { asOfLabel } from "@/ui/lib/format";
import styles from "./rundown.module.css";

export type CatalogStatus = FunctionReturnType<typeof api.search.catalogStatus>;

export function CatalogLine({ status }: { status: CatalogStatus }) {
  if (status.asOf === null) return <p className={styles.catalogLine}>Catalog is being built for the first time.</p>;
  const parts = [`Catalog as of ${asOfLabel(status.asOf)}`];
  if (status.families !== null) parts.push(`${status.families} datasets`);
  if (status.reports !== null) parts.push(`${status.reports} neighborhood reports`);
  if (status.lastRunFailed) parts.push("last refresh failed");
  return <p className={styles.catalogLine}>{parts.join(" · ")}</p>;
}
```

`ui/components/SlugBar.tsx`:

```tsx
import styles from "./rundown.module.css";

export const SUGGESTIONS = ["food insecurity", "rent burden", "air quality"];

export function SlugBar({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <>
      <form className={styles.slugForm} role="search" onSubmit={(e) => e.preventDefault()}>
        <label className={styles.slugLabel} htmlFor="slug">
          SLUG:
        </label>
        <input
          id="slug"
          className={styles.slugInput}
          type="search"
          autoComplete="off"
          placeholder="What are you reporting on?"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </form>
      <div className={styles.tags} aria-label="Suggested searches">
        {SUGGESTIONS.map((s) => (
          <button key={s} type="button" className={styles.tag} onClick={() => onChange(s)}>
            {s}
          </button>
        ))}
      </div>
    </>
  );
}
```

`ui/components/ResultRow.tsx` (collapsed in this task; Task 6 adds expansion):

```tsx
"use client";
import type { ResultRow as Row } from "@/convex/lib/types";
import { shortDate, subline, yearShort } from "@/ui/lib/format";
import { PencilMark } from "./PencilMark";
import { Tick } from "./Tick";
import styles from "./rundown.module.css";

export function ResultRow({ row, mode, circled, opened }: { row: Row; mode: "rundown" | "results"; circled: boolean; opened: boolean }) {
  const sub = mode === "rundown" ? subline(row) : row.kind === "app" ? "web app" : subline({ ...row, years: [] });
  return (
    <li className={styles.row} data-code={row.code}>
      <button type="button" className={styles.rowHead}>
        <span className={styles.code}>{row.code}</span>
        <span className={styles.slug}>
          <span className={styles.name}>{sub ? `${row.name} —` : row.name}</span>
          {sub && <span className={styles.sub}>{sub}</span>}
        </span>
        <span className={styles.right}>
          {mode === "rundown" ? shortDate(row.latestModified) : yearShort(row.years)}
          {circled && <PencilMark />}
          {opened && <Tick />}
        </span>
      </button>
    </li>
  );
}
```

`ui/components/RundownList.tsx`:

```tsx
import type { ResultRow as Row } from "@/convex/lib/types";
import { ResultRow } from "./ResultRow";
import styles from "./rundown.module.css";

export function RundownList({ title, mode, rows, circled, opened }: { title?: string; mode: "rundown" | "results"; rows: Row[]; circled: Set<string>; opened: Set<string> }) {
  return (
    <section className={styles.list} aria-label={title ?? "Search results"}>
      {title && <h2 className={styles.sectionTitle}>{title}</h2>}
      <div className={styles.colHeads} aria-hidden="true">
        <span>CODE</span>
        <span>SLUG</span>
        <span>{mode === "rundown" ? "UPDATED" : "YEARS"}</span>
      </div>
      <ol className={styles.rows}>
        {rows.map((row) => (
          <ResultRow key={row.key} row={row} mode={mode} circled={circled.has(row.code)} opened={opened.has(row.code)} />
        ))}
      </ol>
    </section>
  );
}
```

`ui/components/TabBar.tsx`:

```tsx
import Link from "next/link";
import styles from "./rundown.module.css";

export function TabBar() {
  return (
    <nav className={styles.tabBar} aria-label="Sections">
      <Link className={styles.tabActive} href="/" aria-current="page">
        SEARCH
      </Link>
      <span className={styles.tab} aria-disabled="true" title="Coming soon">
        ASK
      </span>
      <span className={styles.tab} aria-disabled="true" title="Coming soon">
        SAVED
      </span>
    </nav>
  );
}
```

`ui/components/CreditFooter.tsx`:

```tsx
import styles from "./rundown.module.css";

export function CreditFooter() {
  return (
    <footer className={styles.footer}>
      <a href="https://datayoucanuse.org">Built on Data You Can Use&apos;s public data</a>
    </footer>
  );
}
```

`ui/components/SearchHome.tsx` (rundown mode; Task 6 adds search):

```tsx
"use client";
import { useEffect, useState } from "react";
import type { ResultRow } from "@/convex/lib/types";
import { circledCodes, LAST_VISIT_KEY, OPENED_KEY, readOpened, safeStorage } from "@/ui/lib/marks";
import { CatalogLine, type CatalogStatus } from "./CatalogLine";
import { CreditFooter } from "./CreditFooter";
import { Masthead } from "./Masthead";
import { RundownList } from "./RundownList";
import { SlugBar } from "./SlugBar";
import { TabBar } from "./TabBar";
import styles from "./rundown.module.css";

export function SearchHome({ rundown, status }: { rundown: ResultRow[]; status: CatalogStatus }) {
  const [query, setQuery] = useState("");
  const [marks, setMarks] = useState({ circled: new Set<string>(), opened: new Set<string>() });

  useEffect(() => {
    const store = safeStorage();
    setMarks({ circled: circledCodes(rundown, store.get(LAST_VISIT_KEY)), opened: readOpened(store.get(OPENED_KEY)) });
    // Saved when the reader leaves, so reloads and React's dev double-render don't erase today's circles.
    const save = () => store.set(LAST_VISIT_KEY, new Date().toISOString());
    window.addEventListener("pagehide", save);
    return () => window.removeEventListener("pagehide", save);
  }, [rundown]);

  return (
    <div className={styles.page}>
      <Masthead side="TODAY'S RUNDOWN" showDate />
      <main className={styles.main}>
        <CatalogLine status={status} />
        <SlugBar value={query} onChange={setQuery} />
        <RundownList title="UPDATED THIS SEASON" mode="rundown" rows={rundown} circled={marks.circled} opened={marks.opened} />
      </main>
      <TabBar />
      <CreditFooter />
    </div>
  );
}
```

`app/page.tsx`:

```tsx
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { SearchHome } from "@/ui/components/SearchHome";

export const revalidate = 300;

export default async function HomePage() {
  const [rundown, status] = await Promise.all([fetchQuery(api.catalog.rundown, {}), fetchQuery(api.search.catalogStatus, {})]);
  return <SearchHome rundown={rundown} status={status} />;
}
```

`ui/components/rundown.module.css`:

```css
.page {
  max-width: 1024px;
  margin: 0 auto;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.main {
  flex: 1;
}

.masthead {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: var(--gutter);
  padding: clamp(12px, 2.9vw, 30px) var(--gutter) clamp(10px, 2.4vw, 24px);
  border-bottom: var(--hair);
}

.wordmark {
  margin: 0;
  font-family: var(--font-display);
  font-weight: 400;
  font-size: var(--fs-wordmark);
  line-height: 0.9;
  text-transform: uppercase;
}

.side {
  margin: 0;
  text-align: right;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: var(--fs-masthead-side);
  line-height: 1.1;
  text-transform: uppercase;
}

.sideDate {
  display: block;
  font-family: var(--font-body);
  font-weight: 300;
  text-transform: none;
}

.catalogLine {
  margin: 0;
  padding: clamp(10px, 2.4vw, 24px) var(--gutter);
  font-size: var(--fs-small);
  color: var(--muted);
  border-bottom: var(--hair);
}

.slugForm {
  display: flex;
  align-items: baseline;
  gap: clamp(10px, 2.9vw, 30px);
  padding: clamp(12px, 3vw, 30px) var(--gutter) clamp(6px, 1.4vw, 14px);
  border-bottom: var(--rule);
}

.slugLabel {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: var(--fs-heading);
  line-height: 1;
}

.slugInput {
  flex: 1;
  min-width: 0;
  min-height: 44px;
  border: 0;
  background: transparent;
  font: inherit;
  font-size: var(--fs-body);
  color: var(--ink);
}

.slugInput::placeholder {
  color: var(--muted);
}

.tags {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  border-bottom: var(--hair);
}

.tag {
  min-height: 44px;
  padding: clamp(10px, 2.4vw, 24px) 8px;
  border: 0;
  border-left: var(--hair);
  background: transparent;
  font: inherit;
  font-size: var(--fs-body);
  color: var(--ink);
  cursor: pointer;
}

.tag:first-child {
  border-left: 0;
}

.list {
  padding-top: clamp(16px, 3.4vw, 36px);
}

.sectionTitle {
  margin: 0;
  padding: clamp(8px, 1.4vw, 14px) var(--gutter);
  border-top: var(--hair);
  border-bottom: var(--rule);
  font-family: var(--font-display);
  font-weight: 700;
  font-size: var(--fs-heading);
  line-height: 1;
}

.colHeads,
.rowHead {
  display: grid;
  grid-template-columns: minmax(3.5ch, 17%) 1fr auto;
  gap: clamp(8px, 2vw, 20px);
  align-items: center;
  padding: 0 var(--gutter);
}

.colHeads {
  padding-block: clamp(10px, 2.4vw, 24px);
  border-bottom: var(--hair);
  font-family: var(--font-display);
  font-weight: 700;
  font-size: var(--fs-label);
}

.rows {
  list-style: none;
  margin: 0;
  padding: 0;
}

.row:nth-child(even) {
  background: var(--band);
}

.rowHead {
  position: relative;
  width: 100%;
  min-height: var(--row-h);
  border: 0;
  background: transparent;
  text-align: left;
  font: inherit;
  color: var(--ink);
  cursor: pointer;
}

.code {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: var(--fs-code);
  font-variant-numeric: tabular-nums;
}

.slug {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.name {
  overflow-wrap: anywhere;
}

.sub {
  overflow-wrap: anywhere;
}

.right {
  position: relative;
  justify-self: end;
  padding-right: clamp(36px, 9vw, 90px);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.pencil {
  position: absolute;
  left: -40%;
  top: 50%;
  width: 190%;
  height: auto;
  transform: translateY(-50%);
  pointer-events: none;
}

.tick {
  position: absolute;
  right: 0;
  top: 50%;
  width: clamp(18px, 3vw, 30px);
  transform: translateY(-50%);
}

.tabBar {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  border-top: var(--hair);
  border-bottom: var(--hair);
}

.tab,
.tabActive {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 56px;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: var(--fs-label);
  text-decoration: none;
}

.tab {
  color: var(--muted);
}

.tabActive {
  box-shadow: inset 0 -6px 0 var(--ink);
}

.footer {
  padding: clamp(12px, 2.4vw, 24px) var(--gutter) calc(clamp(12px, 2.4vw, 24px) + env(safe-area-inset-bottom));
  text-align: center;
  font-size: var(--fs-small);
  color: var(--muted);
}

.footer a {
  text-decoration: none;
}
```

- [ ] **Step 5: Run the e2e test**

Run: `npm run e2e -- e2e/home.spec.ts`
Expected: PASS on `phone` and `desktop`.

- [ ] **Step 6: Hero gate — plates first, then text**

```bash
I=/Users/tarikmoody/.claude/skills/impeccable/scripts/impeccable
npm run capture -- e2e/capture.spec.ts -g "hero"
$I build-phase record hero
$I build-phase advance
```

Expected: `ADVANCED hero -> sections` (gate passes at ≥72% with no hard veto). If it fails, open the region crops it lists in `.impeccable/review/diff/hero/` in order, fix the named regions in `rundown.module.css` (sizes, spacing, rule weights, pencil placement), recapture, and advance again. The gate refuses a third attempt that only nudges values on the same region; re-derive that region's box from `.impeccable/build/scaffold/layout.css` instead. Ledger each deviation from the comp (e.g., the live "Individuals with Bachelors Degree or Higher" name) as a ruling.

- [ ] **Step 7: Commit**

```bash
git add app ui e2e .impeccable
git commit -m "feat: build the Rundown home first viewport to the approved comp"
```

---

### Task 6: Search and results that open in place

**Files:**
- Create: `ui/components/FamilyPreview.tsx`, `ui/components/PlaceYearGrid.tsx`, `ui/components/ProvenanceTag.tsx`
- Modify: `ui/components/SearchHome.tsx`, `ui/components/ResultRow.tsx`, `ui/components/rundown.module.css`, `e2e/home.spec.ts`

**Interfaces:**
- Consumes: `api.search.searchCatalog`, `api.catalog.familyPreview`, `searchNotice`, `firstSentence`, `cellKey`.
- Produces: `<PlaceYearGrid grid compact? />`, `<ProvenanceTag source />` (used again by Task 7).

- [ ] **Step 1: Write the failing e2e tests** (append to `e2e/home.spec.ts`)

```ts
test("searching by meaning finds a dataset and opens it in place", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("SLUG:").fill("asthma");
  await expect(page).toHaveURL(/\?q=asthma/);
  const row = page.locator("[data-code='W01']");
  await expect(row).toBeVisible();
  await expect(page.getByText(/RUNDOWN · \d+ results/)).toBeVisible();
  await row.getByRole("button").click();
  await expect(row.getByRole("button")).toHaveAttribute("aria-expanded", "true");
  await expect(row.getByRole("table", { name: /places and years/i })).toBeVisible();
  await expect(row.getByText("AI", { exact: true })).toBeVisible();
  await expect(row.getByRole("link", { name: "Open sheet →" })).toHaveAttribute("href", "/d/W01");
  await expect(row.getByRole("link", { name: "CSV" })).toHaveAttribute("href", /\/csv/);
});

test("a suggestion tag runs a search and clearing returns to the rundown", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "food insecurity" }).click();
  await expect(page.locator("[data-code='F02']")).toBeVisible();
  await page.getByLabel("SLUG:").fill("");
  await expect(page.getByRole("heading", { name: "UPDATED THIS SEASON" })).toBeVisible();
});

test("a nonsense search explains that nothing matched", async ({ page }) => {
  await page.goto("/?q=zzqqxxjj");
  await expect(page.getByRole("status")).toContainText("No datasets matched");
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm run e2e -- e2e/home.spec.ts --project=desktop`
Expected: the three new tests FAIL (no search wiring yet).

- [ ] **Step 3: Write `ProvenanceTag.tsx`, `PlaceYearGrid.tsx`, `FamilyPreview.tsx`**

```tsx
// ui/components/ProvenanceTag.tsx
import type { Provenance } from "@/convex/lib/types";
import styles from "./rundown.module.css";

const LABELS: Record<Provenance, { short: string; title: string }> = {
  HUB: { short: "HUB", title: "From DYCU's Hub listing" },
  DYCU: { short: "DYCU", title: "DYCU's own definition" },
  SOURCE_SITE: { short: "SOURCE", title: "From the source's website" },
  AI: { short: "AI", title: "Written by AI from the facts above" },
};

export function ProvenanceTag({ source }: { source: Provenance }) {
  return (
    <abbr className={styles.provenance} title={LABELS[source].title}>
      {LABELS[source].short}
    </abbr>
  );
}
```

```tsx
// ui/components/PlaceYearGrid.tsx
import { cellKey, type PlaceYearGrid as Grid } from "@/convex/lib/grid";
import styles from "./rundown.module.css";

const COMPACT_MAX_PLACES = 6;

export function PlaceYearGrid({ grid, compact = false }: { grid: Grid; compact?: boolean }) {
  if (grid.years.length === 0) return null;
  if (compact && grid.places.length > COMPACT_MAX_PLACES) {
    return <p className={styles.gridSummary}>{`${grid.places.length} neighborhoods × ${grid.years.length} years — full grid on the sheet`}</p>;
  }
  const filled = new Set(grid.cells);
  return (
    <table className={styles.grid} aria-label="Places and years available">
      <thead>
        <tr>
          <td />
          {grid.years.map((y) => (
            <th key={y} scope="col">{y}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {grid.places.map((place) => (
          <tr key={place}>
            <th scope="row">{place}</th>
            {grid.years.map((y) =>
              filled.has(cellKey(place, y)) ? (
                <td key={y}><span className={styles.cellOn} /><span className="visually-hidden">available</span></td>
              ) : (
                <td key={y} className={styles.cellOff}><span aria-hidden="true">—</span><span className="visually-hidden">not available</span></td>
              ),
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

```tsx
// ui/components/FamilyPreview.tsx
"use client";
import { useQuery } from "convex/react";
import Link from "next/link";
import { api } from "@/convex/_generated/api";
import { firstSentence } from "@/ui/lib/format";
import { PlaceYearGrid } from "./PlaceYearGrid";
import { ProvenanceTag } from "./ProvenanceTag";
import styles from "./rundown.module.css";

export function FamilyPreview({ id, familyKey }: { id: string; familyKey: string }) {
  const preview = useQuery(api.catalog.familyPreview, { key: familyKey });
  if (preview === undefined) return <div id={id} className={styles.panel} aria-busy="true">Loading…</div>;
  if (preview === null) return <div id={id} className={styles.panel}>This dataset is no longer in the catalog.</div>;
  return (
    <div id={id} className={styles.panel}>
      <div className={styles.panelBody}>
        <PlaceYearGrid grid={preview.grid} compact />
        <p className={styles.explainer}>
          {firstSentence(preview.explainer)} <ProvenanceTag source={preview.explainerProvenance} />
        </p>
      </div>
      <div className={styles.actions}>
        <Link className={styles.button} href={`/d/${preview.code}`}>Open sheet →</Link>
        {preview.csvUrl && <a className={styles.button} href={preview.csvUrl}>CSV</a>}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Add expansion to `ResultRow.tsx` and search to `SearchHome.tsx`**

In `ResultRow.tsx`: add `import { useState } from "react";` and `import { FamilyPreview } from "./FamilyPreview";`; inside the component add `const [open, setOpen] = useState(false); const panelId = \`preview-${row.code}\`;`; give the `<button>` `aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((o) => !o)}`; and after the button render `{open && <FamilyPreview id={panelId} familyKey={row.key} />}`.

Replace `SearchHome.tsx` with:

```tsx
"use client";
import { useAction } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { ResultRow, SearchResponse } from "@/convex/lib/types";
import { circledCodes, LAST_VISIT_KEY, OPENED_KEY, readOpened, safeStorage } from "@/ui/lib/marks";
import { searchNotice, type SearchState } from "@/ui/lib/search";
import { CatalogLine, type CatalogStatus } from "./CatalogLine";
import { CreditFooter } from "./CreditFooter";
import { Masthead } from "./Masthead";
import { RundownList } from "./RundownList";
import { SlugBar } from "./SlugBar";
import { TabBar } from "./TabBar";
import styles from "./rundown.module.css";

const DEBOUNCE_MS = 350;
const LOADING_ROWS = 5;

export function SearchHome({ rundown, status }: { rundown: ResultRow[]; status: CatalogStatus }) {
  const search = useAction(api.search.searchCatalog);
  const [query, setQuery] = useState("");
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const [state, setState] = useState<SearchState>("idle");
  const [marks, setMarks] = useState({ circled: new Set<string>(), opened: new Set<string>() });
  const requestId = useRef(0);

  useEffect(() => {
    const store = safeStorage();
    setMarks({ circled: circledCodes(rundown, store.get(LAST_VISIT_KEY)), opened: readOpened(store.get(OPENED_KEY)) });
    const save = () => store.set(LAST_VISIT_KEY, new Date().toISOString());
    window.addEventListener("pagehide", save);
    const q = new URLSearchParams(window.location.search).get("q");
    if (q) setQuery(q);
    return () => window.removeEventListener("pagehide", save);
  }, [rundown]);

  useEffect(() => {
    const q = query.trim();
    window.history.replaceState(null, "", q ? `?q=${encodeURIComponent(q)}` : window.location.pathname);
    if (!q) {
      setResponse(null);
      setState("idle");
      return;
    }
    const id = ++requestId.current;
    setState("loading");
    const timer = setTimeout(() => {
      search({ query: q })
        .then((r) => {
          if (id !== requestId.current) return;
          setResponse(r);
          setState("idle");
        })
        .catch(() => {
          if (id === requestId.current) setState("error");
        });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, search]);

  const searching = query.trim().length > 0;
  const notice = searchNotice(state, response);
  return (
    <div className={styles.page}>
      <Masthead side={searching ? `RUNDOWN · ${response?.results.length ?? 0} results` : "TODAY'S RUNDOWN"} showDate={!searching} />
      <main className={styles.main}>
        <CatalogLine status={status} />
        <SlugBar value={query} onChange={setQuery} />
        <p className={styles.notice} role="status">{notice ?? ""}</p>
        {searching ? (
          state === "loading" && !response ? (
            <ol className={styles.rows} aria-busy="true" aria-label="Loading results">
              {Array.from({ length: LOADING_ROWS }, (_, i) => (
                <li key={i} className={`${styles.row} ${styles.rowEmpty}`} />
              ))}
            </ol>
          ) : (
            response && response.results.length > 0 && (
              <RundownList mode="results" rows={response.results} circled={new Set()} opened={marks.opened} />
            )
          )
        ) : (
          <RundownList title="UPDATED THIS SEASON" mode="rundown" rows={rundown} circled={marks.circled} opened={marks.opened} />
        )}
      </main>
      <TabBar />
      <CreditFooter />
    </div>
  );
}
```

Append to `rundown.module.css`:

```css
/* Loading state from spec §7: empty ruled rows. */
.rowEmpty {
  min-height: var(--row-h);
  border-bottom: var(--hair);
}

.notice:empty {
  display: none;
}

.notice {
  margin: 0;
  padding: 12px var(--gutter);
  border-bottom: var(--hair);
  font-size: var(--fs-small);
}

.panel {
  padding: 0 var(--gutter) clamp(16px, 3vw, 30px) calc(var(--gutter) + clamp(3.5ch, 17%, 174px));
}

.panelBody {
  display: flex;
  flex-wrap: wrap;
  gap: clamp(12px, 3vw, 32px);
  align-items: flex-start;
}

.grid {
  border-collapse: collapse;
  font-size: var(--fs-small);
}

.grid th,
.grid td {
  min-width: 44px;
  height: 44px;
  border: var(--hair);
  text-align: center;
  font-weight: 500;
}

.grid th[scope="row"] {
  padding: 0 10px;
  text-align: left;
}

.cellOn {
  display: inline-block;
  width: 0.9em;
  height: 0.9em;
  background: var(--ink);
}

.cellOff {
  color: var(--muted);
}

.gridSummary {
  margin: 0;
  font-size: var(--fs-small);
}

.explainer {
  flex: 1 1 16ch;
  margin: 0;
}

.provenance {
  display: inline-block;
  padding: 0 0.35em;
  border: var(--hair);
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 0.8em;
  text-decoration: none;
  vertical-align: 0.1em;
}

.actions {
  display: flex;
  gap: 12px;
  margin-top: clamp(12px, 2.4vw, 24px);
}

.button {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  padding: 0 clamp(14px, 3vw, 28px);
  border: var(--rule);
  font-family: var(--font-display);
  font-weight: 700;
  font-size: var(--fs-label);
  text-decoration: none;
}
```

- [ ] **Step 5: Run the e2e tests**

Run: `npm run e2e -- e2e/home.spec.ts`
Expected: 4 tests PASS on `phone` and `desktop`.

- [ ] **Step 6: Compare the results state with comp C**

Capture a 1024×1536 screenshot of `/?q=kids%20who%20can%27t%20afford%20food` with the first row expanded, view it beside `.impeccable/mocks/home-c.webp`, and fix material differences (grid placement beside the explainer, button weight, row banding). Ledger any deliberate difference as a ruling.

- [ ] **Step 7: Commit**

```bash
git add ui e2e
git commit -m "feat: search by meaning and open results in place"
```

---

### Task 7: Dataset sheet page with live preview

**Files:**
- Create: `app/d/[code]/page.tsx`, `app/d/[code]/not-found.tsx`, `ui/components/DatasetSheet.tsx`, `ui/components/LivePreview.tsx`, `ui/components/StripChart.tsx`, `ui/components/OpenedMark.tsx`, `ui/components/sheet.module.css`, `e2e/sheet.spec.ts`

**Interfaces:**
- Consumes: `api.catalog.familySheet`, `PlaceYearGrid`, `ProvenanceTag`, `Masthead`, `TabBar`, `CreditFooter`, `ui/lib/preview`, `ui/lib/marks`.
- Produces: route `/d/[code]`; `type SheetData = NonNullable<FunctionReturnType<typeof api.catalog.familySheet>>`.

- [ ] **Step 1: Write the failing e2e tests** (`e2e/sheet.spec.ts`)

```ts
import { expect, test } from "@playwright/test";

test("a dataset sheet explains, previews and offers downloads", async ({ page }) => {
  await page.goto("/d/W01");
  await expect(page.getByRole("heading", { level: 2, name: /Asthma Prevalence/ })).toBeVisible();
  await expect(page.getByRole("table", { name: /places and years/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: "WHAT IT MEASURES" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "COLUMN GUIDE" })).toBeVisible();
  await expect(page.getByRole("table", { name: "Column guide" }).getByText("DYCU").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "LIVE PREVIEW" })).toBeVisible();
  await expect(page.getByRole("table", { name: /first rows/i })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("link", { name: "CSV" }).first()).toHaveAttribute("href", /\/csv/);
});

test("lowercase codes work and opening a sheet ticks it on the rundown", async ({ page }) => {
  await page.goto("/d/v02");
  await expect(page.getByRole("heading", { level: 2, name: /Daily Air Quality/ })).toBeVisible();
  await page.goto("/");
  await expect(page.locator("[data-code='V02']").getByText("opened before")).toBeAttached();
});

test("unknown code shows the not-found page", async ({ page }) => {
  const res = await page.goto("/d/Z99");
  expect(res?.status()).toBe(404);
  await expect(page.getByText("No dataset with that code")).toBeVisible();
  await expect(page.getByRole("link", { name: "← Back to the rundown" })).toHaveAttribute("href", "/");
});

test("when the Hub is down the preview says so and offers a retry", async ({ page }) => {
  await page.route(/FeatureServer\/\d+\/query/, (route) => route.abort());
  await page.goto("/d/W01");
  await expect(page.getByText(/Preview unavailable/)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  await expect(page.getByRole("link", { name: "CSV" }).first()).toBeVisible();
});

test("a report family lists its neighborhood documents", async ({ page }) => {
  await page.goto("/d/N02");
  await expect(page.getByRole("heading", { name: "ALL VERSIONS" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Harambee/ }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "PDF" }).first()).toHaveAttribute("href", /arcgis\.com\/sharing\/rest\/content\/items\/\w+\/data/);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm run e2e -- e2e/sheet.spec.ts --project=desktop`
Expected: FAIL (404 for every route).

- [ ] **Step 3: Write the route and components**

`app/d/[code]/page.tsx`:

```tsx
import { fetchQuery } from "convex/nextjs";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { api } from "@/convex/_generated/api";
import { DatasetSheet } from "@/ui/components/DatasetSheet";

export const revalidate = 300;

type Props = { params: Promise<{ code: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params;
  const sheet = await fetchQuery(api.catalog.familySheet, { code });
  return { title: sheet ? `${sheet.family.code} · ${sheet.family.name} — Cream City Almanac` : "Not found — Cream City Almanac" };
}

export default async function SheetPage({ params }: Props) {
  const { code } = await params;
  const sheet = await fetchQuery(api.catalog.familySheet, { code });
  if (!sheet) notFound();
  return <DatasetSheet sheet={sheet} />;
}
```

`app/d/[code]/not-found.tsx`:

```tsx
import Link from "next/link";
import { Masthead } from "@/ui/components/Masthead";
import styles from "@/ui/components/sheet.module.css";

export default function NotFound() {
  return (
    <div className={styles.page}>
      <Masthead side="RUNDOWN" showDate={false} />
      <main className={styles.section}>
        <p>No dataset with that code. It may have left DYCU&apos;s Hub.</p>
        <Link href="/">← Back to the rundown</Link>
      </main>
    </div>
  );
}
```

`ui/components/OpenedMark.tsx`:

```tsx
"use client";
import { useEffect } from "react";
import { OPENED_KEY, safeStorage, withOpened } from "@/ui/lib/marks";

export function OpenedMark({ code }: { code: string }) {
  useEffect(() => {
    const store = safeStorage();
    store.set(OPENED_KEY, withOpened(store.get(OPENED_KEY), code));
  }, [code]);
  return null;
}
```

`ui/components/StripChart.tsx`:

```tsx
import styles from "./sheet.module.css";

const ROW = 30;
const LABEL_W = 120;
const WIDTH = 600;

export function StripChart({ field, series, scale }: { field: string; series: { label: string; values: number[] }[]; scale: { min: number; max: number } }) {
  const x = (v: number) => LABEL_W + ((v - scale.min) / (scale.max - scale.min)) * (WIDTH - LABEL_W - 10);
  return (
    <figure className={styles.chart}>
      <svg viewBox={`0 0 ${WIDTH} ${series.length * ROW + 24}`} role="img" aria-label={`Each dot is one area's ${field}, by year, on one shared scale from ${scale.min} to ${scale.max}`}>
        {series.map((s, i) => (
          <g key={s.label} transform={`translate(0 ${i * ROW + 16})`}>
            <text x="0" y="5" className={styles.chartLabel}>{s.label}</text>
            <line x1={LABEL_W} x2={WIDTH - 10} y1="0" y2="0" stroke="var(--band)" />
            {s.values.map((v, j) => (
              <circle key={j} cx={x(v)} cy="0" r="3" fill="var(--ink)" fillOpacity="0.35" />
            ))}
          </g>
        ))}
        <text x={LABEL_W} y={series.length * ROW + 20} className={styles.chartLabel}>{scale.min}</text>
        <text x={WIDTH - 10} y={series.length * ROW + 20} textAnchor="end" className={styles.chartLabel}>{scale.max}</text>
      </svg>
      <figcaption>{field}: every year on one shared scale</figcaption>
    </figure>
  );
}
```

`ui/components/LivePreview.tsx`:

```tsx
"use client";
import { useEffect, useState } from "react";
import { fetchJson, headlineColumn, rowsUrl, sharedScale, valuesUrl, type FetchResult } from "@/ui/lib/preview";
import { StripChart } from "./StripChart";
import styles from "./sheet.module.css";

type Features = { features: { attributes: Record<string, unknown> }[] };
type Member = { place: string | null; yearLabel: string | null; featureServerUrl: string | null };
const SYSTEM = /^(objectid|object_id|fid|globalid|shape(__area|__length)?)$/i;
const MAX_SERIES = 6;

export function LivePreview({ members, fields }: { members: Member[]; fields: string[] }) {
  const sources = members.filter((m) => m.featureServerUrl).slice(0, MAX_SERIES);
  const latestUrl = sources[0]?.featureServerUrl ?? null;
  const headline = headlineColumn(fields);
  const [rows, setRows] = useState<FetchResult<Features> | null>(null);
  const [series, setSeries] = useState<{ label: string; values: number[] }[] | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!latestUrl) return;
    let live = true;
    fetchJson<Features>(rowsUrl(latestUrl)).then((r) => live && setRows(r));
    if (headline) {
      Promise.all(
        sources.map(async (m) => {
          const r = await fetchJson<Features>(valuesUrl(m.featureServerUrl!, headline));
          const values = r.ok ? r.data.features.map((f) => Number(f.attributes[headline])).filter(Number.isFinite) : [];
          return { label: [m.place, m.yearLabel].filter(Boolean).join(" "), values };
        }),
      ).then((s) => live && setSeries(s));
    }
    return () => {
      live = false;
    };
    // sources is derived from members; latestUrl and headline capture what changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestUrl, headline, attempt]);

  if (!latestUrl) return null;
  if (rows === null) return <p aria-busy="true">Loading preview from the Hub…</p>;
  if (!rows.ok) {
    const retry = () => {
      setRows(null);
      setSeries(null);
      setAttempt((a) => a + 1);
    };
    return (
      <div role="status">
        <p>Preview unavailable: the Hub isn&apos;t responding ({rows.reason}). The downloads below still work.</p>
        <button type="button" className={styles.button} onClick={retry}>Try again</button>
      </div>
    );
  }
  const first = rows.data.features.map((f) => f.attributes);
  const columns = Object.keys(first[0] ?? {}).filter((c) => !SYSTEM.test(c));
  const scale = series ? sharedScale(series.map((s) => s.values)) : null;
  return (
    <>
      <div className={styles.scroll} tabIndex={0} role="region" aria-label="First rows, scroll sideways for more columns">
        <table className={styles.rowsTable} aria-label="First rows from the Hub">
          <thead>
            <tr>{columns.map((c) => <th key={c} scope="col">{c}</th>)}</tr>
          </thead>
          <tbody>
            {first.map((row, i) => (
              <tr key={i}>{columns.map((c) => <td key={c}>{String(row[c] ?? "")}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
      {headline && series && scale && <StripChart field={headline} series={series} scale={scale} />}
    </>
  );
}
```

`ui/components/DatasetSheet.tsx`:

```tsx
import type { FunctionReturnType } from "convex/server";
import Link from "next/link";
import type { api } from "@/convex/_generated/api";
import { shortDate, subline, yearSpan } from "@/ui/lib/format";
import { CreditFooter } from "./CreditFooter";
import { LivePreview } from "./LivePreview";
import { Masthead } from "./Masthead";
import { OpenedMark } from "./OpenedMark";
import { PlaceYearGrid } from "./PlaceYearGrid";
import { ProvenanceTag } from "./ProvenanceTag";
import { TabBar } from "./TabBar";
import styles from "./sheet.module.css";

export type SheetData = NonNullable<FunctionReturnType<typeof api.catalog.familySheet>>;
const DOWNLOAD_ORDER = ["CSV", "GeoJSON", "XLSX", "KML", "ZIP", "App"];

export function DatasetSheet({ sheet }: { sheet: SheetData }) {
  const { family, card, members, grid, sources, fileLabel } = sheet;
  const latest = members[0];
  return (
    <div className={styles.page}>
      <OpenedMark code={family.code} />
      <Masthead side="RUNDOWN" showDate={false} />
      <main>
        <nav className={styles.back}><Link href="/">← Rundown</Link></nav>
        <header className={styles.header}>
          <span className={styles.code}>{family.code}</span>
          <h2 className={styles.name}>{family.name}</h2>
          <p className={styles.sub}>{subline(family)}</p>
        </header>
        <div className={styles.section}><PlaceYearGrid grid={grid} /></div>

        <section className={styles.section}>
          <h3 className={styles.heading}>WHAT IT MEASURES</h3>
          <p>{card?.explainer ?? latest?.title} {card && <ProvenanceTag source={card.explainerProvenance} />}</p>
        </section>

        {card && card.glossary.length > 0 && (
          <section className={styles.section}>
            <h3 className={styles.heading}>COLUMN GUIDE</h3>
            <table className={styles.glossary} aria-label="Column guide">
              <tbody>
                {card.glossary.map((g) => (
                  <tr key={g.field}>
                    <th scope="row"><code>{g.field}</code></th>
                    <td>{g.meaning} <ProvenanceTag source={g.provenance} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {card && card.caveats.length > 0 && (
          <section className={styles.section}>
            <h3 className={styles.heading}>CAVEATS</h3>
            <ul>{card.caveats.map((c) => <li key={c}>{c} <ProvenanceTag source="AI" /></li>)}</ul>
          </section>
        )}

        {members.some((m) => m.featureServerUrl) && (
          <section className={styles.section}>
            <h3 className={styles.heading}>LIVE PREVIEW</h3>
            <LivePreview members={members} fields={card?.glossary.map((g) => g.field) ?? []} />
          </section>
        )}

        {card && card.storyAngles.length > 0 && (
          <section className={styles.section}>
            <h3 className={styles.heading}>STORY ANGLES</h3>
            <ul>{card.storyAngles.map((s) => <li key={s}>{s} <ProvenanceTag source="AI" /></li>)}</ul>
          </section>
        )}

        {sources.length > 0 && (
          <section className={styles.section}>
            <h3 className={styles.heading}>SOURCES</h3>
            {sources.map((s) => (
              <p key={s.name}>
                <a href={s.url}>{s.name}</a>: {s.summary} {s.limits} <ProvenanceTag source="SOURCE_SITE" />
              </p>
            ))}
          </section>
        )}

        <section className={styles.section}>
          <h3 className={styles.heading}>ALL VERSIONS</h3>
          <ol className={styles.versions}>
            {members.map((m) => (
              <li key={m.hubId}>
                <a href={m.landingPage}>{[m.place, m.yearLabel ?? yearSpan(m.years)].filter(Boolean).join(" · ") || m.title}</a>
                <span className={styles.updated}>updated {shortDate(m.modified)}</span>
                {DOWNLOAD_ORDER.filter((f) => m.downloads[f]).map((f) => (
                  <a key={f} className={styles.dl} href={m.downloads[f]}>{f === "App" ? "Open app" : f}</a>
                ))}
                {m.fileUrl && fileLabel && <a className={styles.dl} href={m.fileUrl}>{fileLabel}</a>}
              </li>
            ))}
          </ol>
        </section>
      </main>
      {latest && (
        <div className={styles.downloadBar}>
          {latest.downloads.CSV && <a className={styles.button} href={latest.downloads.CSV}>CSV</a>}
          {latest.downloads.App && <a className={styles.button} href={latest.downloads.App}>Open app</a>}
          {latest.fileUrl && fileLabel && <a className={styles.button} href={latest.fileUrl}>{fileLabel}</a>}
          <a className={styles.button} href={latest.landingPage}>View on Hub</a>
        </div>
      )}
      <TabBar />
      <CreditFooter />
    </div>
  );
}
```

`ui/components/sheet.module.css`:

```css
.page { max-width: 1024px; margin: 0 auto; min-height: 100vh; display: flex; flex-direction: column; }
.back { padding: 12px var(--gutter); border-bottom: var(--hair); font-size: var(--fs-small); }
.back a { text-decoration: none; }
.header { padding: clamp(16px, 3vw, 30px) var(--gutter); border-bottom: var(--rule); }
.code { font-family: var(--font-display); font-weight: 700; font-size: var(--fs-code); font-variant-numeric: tabular-nums; }
.name { margin: 4px 0 0; font-family: var(--font-display); font-weight: 700; font-size: var(--fs-heading); line-height: 1; overflow-wrap: anywhere; }
.sub { margin: 8px 0 0; color: var(--muted); font-size: var(--fs-small); }
.section { padding: clamp(16px, 3vw, 30px) var(--gutter); border-bottom: var(--hair); overflow-wrap: anywhere; }
.section ul { margin: 0; padding-left: 1.2em; }
.heading { margin: 0 0 12px; font-family: var(--font-display); font-weight: 700; font-size: var(--fs-label); letter-spacing: 0.02em; }
.glossary { width: 100%; border-collapse: collapse; font-size: var(--fs-small); }
.glossary th, .glossary td { padding: 10px 8px; border-top: var(--hair); text-align: left; vertical-align: top; }
.glossary th { width: 32%; font-weight: 500; overflow-wrap: anywhere; }
.scroll { overflow-x: auto; border: var(--hair); }
.rowsTable { border-collapse: collapse; font-size: var(--fs-small); font-variant-numeric: tabular-nums; }
.rowsTable th, .rowsTable td { padding: 6px 10px; border-bottom: var(--hair); white-space: nowrap; text-align: left; }
.rowsTable tbody tr:nth-child(even) { background: var(--band); }
.chart { margin: 16px 0 0; }
.chart svg { width: 100%; height: auto; }
.chart figcaption { font-size: var(--fs-small); color: var(--muted); }
.chartLabel { font-size: 12px; fill: var(--ink); }
.versions { list-style: none; margin: 0; padding: 0; }
.versions li { display: flex; flex-wrap: wrap; gap: 6px 14px; align-items: baseline; padding: 10px 0; border-top: var(--hair); }
.updated { color: var(--muted); font-size: var(--fs-small); }
.dl { font-family: var(--font-display); font-weight: 700; font-size: var(--fs-label); text-decoration: none; }
.downloadBar { position: sticky; bottom: 0; display: flex; gap: 12px; padding: 12px var(--gutter); border-top: var(--rule); background: var(--paper); }
.button { display: inline-flex; align-items: center; min-height: 44px; padding: 0 clamp(14px, 3vw, 28px); border: var(--rule); font-family: var(--font-display); font-weight: 700; font-size: var(--fs-label); text-decoration: none; }
@media (min-width: 900px) { .downloadBar { position: static; } }
```

`PlaceYearGrid` and `ProvenanceTag` import `rundown.module.css`; the sheet page uses them unchanged.

- [ ] **Step 4: Run the e2e tests and the unit suite**

Run: `npm run e2e -- e2e/sheet.spec.ts && npx vitest run && npm run typecheck`
Expected: 5 sheet tests PASS on both projects; unit suite green; typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add app ui e2e
git commit -m "feat: add dataset sheets with column guide, live Hub preview and downloads"
```

---

### Task 8: Impeccable sections, motion and responsive phases

**Files:**
- Modify: `ui/components/rundown.module.css`, `ui/components/sheet.module.css` (as the gates direct)

**Interfaces:**
- Consumes: the built pages; `e2e/capture.spec.ts`.
- Produces: `.impeccable/review/desktop.png`, `.impeccable/review/mobile.png`; build-phase at **review**.

- [ ] **Step 1: Sections gate**

Every remaining region already sits inside the comp's system (rules, banding, display/body faces, red only for marks). Check the dataset sheet against the direction contract's OWN-WORLD block line by line (no shadows, radii, cards; red only for marks), fix any lapse, then:

```bash
I=/Users/tarikmoody/.claude/skills/impeccable/scripts/impeccable
$I build-phase advance
```

Expected: `ADVANCED sections -> motion`.

- [ ] **Step 2: Motion — the signature, once**

The one signature motion: the grease-pencil circle "draws on" when the rundown loads. Append to `rundown.module.css`:

```css
@keyframes pencil-draw {
  from { clip-path: inset(0 100% 0 0); }
  to { clip-path: inset(0 0 0 0); }
}

.pencil {
  animation: pencil-draw 600ms steps(12, end) 250ms both;
}
```

`prefers-reduced-motion` (in `globals.css`) already disables it. Capture with motion settled (the capture spec waits for fonts; add `await page.waitForTimeout(1000)` before each screenshot in `e2e/capture.spec.ts`). Then `$I build-phase advance` → `ADVANCED motion -> responsive`.

- [ ] **Step 3: Responsive captures and gate**

```bash
npm run capture
$I build-phase advance
```

Expected: `ADVANCED responsive -> review`. If the desktop first viewport fails because the 1024px column sits centered on a 1440px screen, widen `.page` to `max-width: min(1280px, 100%)` with the row grid unchanged, recapture, and advance; ledger the decision.

- [ ] **Step 4: Commit**

```bash
git add ui e2e .impeccable
git commit -m "feat: add the grease-pencil draw-on motion and pass responsive gates"
```

---

### Task 9: End-to-end and accessibility hardening

**Files:**
- Create: `e2e/a11y.spec.ts`
- Modify: components as the findings require

**Interfaces:**
- Consumes: all pages.
- Produces: an accessibility- and layout-clean site on phone and desktop.

- [ ] **Step 1: Write the failing tests** (`e2e/a11y.spec.ts`)

```ts
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const PAGES = ["/", "/?q=asthma", "/d/W01", "/d/N02"];

for (const path of PAGES) {
  test(`no serious accessibility violations on ${path}`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  });

  test(`no horizontal scroll on a phone at ${path}`, async ({ page }, info) => {
    test.skip(info.project.name !== "phone");
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

test("the search works from the keyboard alone", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("SLUG:")).toBeFocused();
  await page.keyboard.type("asthma");
  await expect(page.locator("[data-code='W01']")).toBeVisible();
  await page.locator("[data-code='W01'] button").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-code='W01'] button")).toHaveAttribute("aria-expanded", "true");
});
```

- [ ] **Step 2: Run them and fix every failure**

Run: `npm run e2e -- e2e/a11y.spec.ts`
Expected first run: some FAIL (typical: contrast of `--muted` on `--band`, the disabled tabs, the `.rowsTable` scroll region). Fix each in CSS/markup (never by excluding the rule), rerun until all PASS on both projects. If the keyboard test's two `Tab` presses land elsewhere because of a skip link or wordmark link, adjust the press count to the real order and ledger it.

- [ ] **Step 3: Run the whole e2e and unit suites**

Run: `npm run e2e && npx vitest run`
Expected: everything PASS.

- [ ] **Step 4: Commit**

```bash
git add e2e ui app
git commit -m "test: add accessibility and phone layout checks and fix findings"
```

---

### Task 10: Impeccable finish review and DESIGN.md

**Files:**
- Create: `DESIGN.md`, `.impeccable/design.json` (by the documenter)

**Interfaces:**
- Consumes: built pages, `.impeccable/review/*`, the surface brief, `.impeccable/build/state.json`, `.impeccable/build/spec.json`.
- Produces: finish-review verdict; `DESIGN.md`.

- [ ] **Step 1: Detector and final diff**

```bash
I=/Users/tarikmoody/.claude/skills/impeccable/scripts/impeccable
$I detect --json app ui > .impeccable/review/detect.json
$I comp-diff --comp .impeccable/mocks/home-b.webp --build .impeccable/review/desktop.png --spec .impeccable/build/spec.json --out-dir .impeccable/review/diff/final
```

Fix mechanical detector findings; keep the rest for the reviewer.

- [ ] **Step 2: Finish review by a fresh agent**

Dispatch a general-purpose subagent with the instructions in `/Users/tarikmoody/.claude/skills/impeccable/reference/degraded/finish-reviewer.md` and this input packet: the original request (user-friendly, phone-first DYCU data finder), `PRODUCT.md`, `.impeccable/surfaces/app-page-tsx.md`, approved comp `.impeccable/mocks/home-b.webp` and results comp `.impeccable/mocks/home-c.webp`, captures `.impeccable/review/hero-repro.png`, `desktop.png`, `mobile.png`, `.impeccable/build/state.json`, `.impeccable/build/spec.json`, `.impeccable/review/diff/hero/`, `.impeccable/review/diff/final/`, `.impeccable/review/detect.json`, and `/Users/tarikmoody/.claude/skills/impeccable/reference/craft-floor.md`. Act on its disposition word (recapture / rebuild / fix / ship) exactly as `new-work.md` §7 describes; at most two rounds.

- [ ] **Step 3: Document**

Load `/Users/tarikmoody/.claude/skills/impeccable/reference/degraded/documenter.md` and `reference/document.md`, write `DESIGN.md` and `.impeccable/design.json` from the built world, then `$I build-phase advance` → review closed.

- [ ] **Step 4: Commit**

```bash
git add DESIGN.md .impeccable ui app
git commit -m "docs: record the Rundown design system and finish review"
```

---

### Task 11 (HUMAN checkpoint): Tarik reviews the site locally

- [ ] **Step 1:** Run `npm run dev` and give Tarik `http://localhost:3000` (and the phone-sized view via the browser's device toolbar). Ask him to try three real searches from his newsroom, open two sheets, and download one CSV.
- [ ] **Step 2:** Record his feedback in the ledger. Material changes go through the same TDD + gate loop before Part B; Part B starts only on his explicit go-ahead ("launch").

---

## Part B: Launch

### Task 12: Public-repo readiness

**Files:**
- Create: `README.md`, `LICENSE` (if Tarik picks one)
- Modify: `.gitignore`

**Interfaces:**
- Consumes: the repo history.
- Produces: a history verified free of secrets and personal data; README.

- [ ] **Step 1: Scan the whole history for secrets and env files**

```bash
git log --all --name-only --format= | sort -u | grep -E '(^|/)\.env' | grep -v '\.env\.example$' || echo "OK: no env files in history"
git log --all -p | grep -E -c '(sk-[A-Za-z0-9_-]{20,}|fc-[A-Za-z0-9]{20,}|vck_[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_-]{35}|ghp_[A-Za-z0-9]{36}|-----BEGIN [A-Z ]*PRIVATE KEY-----|prod:[a-z]+-[a-z]+-[0-9]+\|)' || true
git log --all -p | grep -E -o '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}' | sort | uniq -c
```

Expected: "OK: no env files in history"; secret count `0`; the only emails are `hub@datayoucanuse.org` and attribution addresses. Anything else: STOP and show Tarik before going further (rewriting history is his call).

- [ ] **Step 2 (HUMAN decisions):** Ask Tarik, with AskUserQuestion: (a) license — MIT (recommended for a portfolio), or none (all rights reserved); (b) commit or ignore Convex's assistant files (`CLAUDE.md`, `AGENTS.md`, `.agents/`, `.claude/`, `skills-lock.json`) — recommended: ignore `.agents/`, `.claude/`, `skills-lock.json`, commit `AGENTS.md`/`CLAUDE.md`; (c) strip old `Co-Authored-By` trailers before publishing — recommended: leave them (rewriting history changes every commit hash).

- [ ] **Step 3: Write `README.md`**

```markdown
# Cream City Almanac

An unofficial, phone-first way to find, understand, and download Milwaukee's public data. Built on [Data You Can Use](https://datayoucanuse.org)'s public data; not affiliated with DYCU.

- **Search by meaning:** "kids who can't afford food" finds Food Insecurity Prevalence.
- **Plain-English sheets:** what a dataset measures, a column guide where every fact shows its source (DYCU, the Hub, the source website, or AI), caveats, and story angles.
- **Live preview and downloads** straight from DYCU's ArcGIS Hub.

## How it works

A weekly job (Convex) reads DYCU's Hub catalog and inventory sheet, reads report PDFs with Firecrawl, writes plain-English cards with Claude via the Vercel AI Gateway, and indexes them for keyword and meaning search. The site is Next.js on Vercel. Design decisions live in [`docs/decisions/`](docs/decisions/); the design system in [`DESIGN.md`](DESIGN.md).

## Develop

    npm install
    npx convex dev        # creates .env.local for your own Convex project
    npm run dev           # http://localhost:3000
    npm test              # unit and Convex tests
    npm run e2e           # Playwright, phone and desktop

The weekly build needs `AI_GATEWAY_API_KEY` and `FIRECRAWL_API_KEY` set in Convex (`npx convex env set`).
```

- [ ] **Step 4: Commit**

```bash
git add README.md LICENSE .gitignore AGENTS.md CLAUDE.md 2>/dev/null; git commit -m "docs: add README and prepare the repository to go public"
```

---

### Task 13: Public GitHub repo and CI

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: Task 12.
- Produces: public repo `cream-city-almanac`; required check `check`.

- [ ] **Step 1: Write the workflow**

```yaml
# .github/workflows/ci.yml
name: CI
on:
  push:
    branches: [main]
  pull_request:

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run typecheck
      - run: npx tsc --noEmit -p convex
      - run: npm test
      - run: npm run build
        env:
          NEXT_PUBLIC_CONVEX_URL: ${{ vars.NEXT_PUBLIC_CONVEX_URL }}
```

- [ ] **Step 2: Create the repo and push** (confirm `gh auth status` first; if not logged in, Tarik runs `! gh auth login`)

```bash
git add .github && git commit -m "ci: run typecheck, tests and build on every push and pull request"
gh repo create cream-city-almanac --public --source=. --remote=origin --push --description "Find, understand, and download Milwaukee's public data. Unofficial; built on Data You Can Use's public data."
gh variable set NEXT_PUBLIC_CONVEX_URL --body "https://standing-swordfish-685.convex.cloud"
gh run watch --exit-status $(gh run list --limit 1 --json databaseId -q '.[0].databaseId')
```

Expected: the first run on `main` is green.

- [ ] **Step 3: Prove CI catches a failure, then revert**

```bash
git switch -c ci-red-proof
sed -i '' 's/expect(families).toHaveLength(46);/expect(families).toHaveLength(47);/' tests/lib/families.test.ts
git commit -am "test: deliberately break a test to prove CI goes red"
git push -u origin ci-red-proof
gh pr create --fill --title "CI red proof (do not merge)"
gh pr checks --watch || echo "RED as expected"
gh pr close --delete-branch
git switch main && git branch -D ci-red-proof
```

Expected: the PR's `check` fails on the family-count test; PR closed, branch deleted.

- [ ] **Step 4 (HUMAN):** Tarik turns on branch protection: GitHub → repo **Settings → Branches → Add branch ruleset** (or classic rule) for `main` → **Require status checks to pass** → select **check** → Save.

---

### Task 14: Convex production

**Interfaces:**
- Consumes: Phase 1 functions, dev data.
- Produces: production deployment with keys, catalog, cron.

- [ ] **Step 1: Deploy functions and schema to production**

`convex deploy` has no `--yes` flag; with a production deploy key in the environment it deploys without a confirmation prompt. The key goes to a scratch file, is loaded into the environment, and is deleted after; it is never printed.

```bash
KEYFILE=/private/tmp/claude-502/-Users-tarikmoody-Projects-dycu-inventory/prod-deploy.env
npx convex deployment token create cli-first-deploy --deployment prod --save-env "$KEYFILE"
(set -a; . "$KEYFILE"; set +a; npx convex deploy)
rm -f "$KEYFILE"
npx convex deployment token delete cli-first-deploy --deployment prod
```

Expected: ends with the production URL (`https://<name>.convex.cloud`) and "Deployed Convex functions"; the temporary key is deleted.

- [ ] **Step 2 (HUMAN):** in a separate Terminal window (keys never in the chat):

```bash
cd /Users/tarikmoody/Projects/dycu/inventory
npx convex env set --prod AI_GATEWAY_API_KEY <key>
npx convex env set --prod FIRECRAWL_API_KEY <key>
```

Verify names only: `npx convex env list --prod | cut -d= -f1` → both names present.

- [ ] **Step 3: Copy the dev catalog to production (no re-scraping, no AI spend)**

```bash
SNAP=/private/tmp/claude-502/-Users-tarikmoody-Projects-dycu-inventory/catalog-snapshot.zip
npx convex export --path "$SNAP"
npx convex import --prod --replace-all -y "$SNAP"
rm -f "$SNAP"
```

- [ ] **Step 4: Verify with a no-change production build**

```bash
npx convex run --prod build:start
npx convex data --prod builds --limit 1 --format jsonl | grep '^{' | python3 -c "import json,sys; b=json.loads(sys.stdin.read()); print(b['status'], b['skipped'], b['failed'], b['costUsd'])"
```

Expected (after about a minute): `completed 226 0 0` (or near-zero cost). `npx convex run --prod search:searchCatalog '{"query":"asthma"}'` returns `W01` first with `degraded: false` — proves the production AI key works.

- [ ] **Step 5: Add the search report card to CI** (spec §10.7)

Create a production deploy key for GitHub only (revocable on its own) and store it as a repo secret without printing it:

```bash
KEYFILE=/private/tmp/claude-502/-Users-tarikmoody-Projects-dycu-inventory/report-card.env
npx convex deployment token create github-report-card --deployment prod --save-env "$KEYFILE"
grep '^CONVEX_DEPLOY_KEY=' "$KEYFILE" | cut -d= -f2- | tr -d '\n' | gh secret set CONVEX_REPORT_CARD_KEY
rm -f "$KEYFILE"
```

In `.github/workflows/ci.yml`, add a weekly trigger under `on:` (two hours after the Monday 09:00 UTC rebuild):

```yaml
  schedule:
    - cron: "0 11 * * 1"
```

and append this job under `jobs:`:

```yaml
  report-card:
    # Grades search quality on the live production deployment (one deploy behind the commit by design).
    if: github.event_name != 'pull_request'
    needs: check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npx convex run evals:searchReportCard > card.json
        env:
          CONVEX_DEPLOY_KEY: ${{ secrets.CONVEX_REPORT_CARD_KEY }}
      - run: node -e "const c=require('./card.json'); console.log(c.passed + '/' + c.total, JSON.stringify(c.misses)); if (c.rate < 0.8) process.exit(1)"
```

```bash
git add .github/workflows/ci.yml
git commit -m "ci: grade live search quality with the report card on main and weekly"
git push
gh run watch --exit-status $(gh run list --limit 1 --json databaseId -q '.[0].databaseId')
```

Expected: `check` and `report-card` both green; the report-card log prints `24/26` (or better).

---

### Task 15: Vercel production deploy

**Files:**
- Create: `vercel.json`, `scripts/vercel-build.sh`

**Interfaces:**
- Consumes: GitHub repo (Task 13), Convex production (Task 14).
- Produces: the live production URL.

- [ ] **Step 1: Write the build script and config**

```sh
# scripts/vercel-build.sh
#!/bin/sh
set -e
# Production deploys push Convex functions and point the site at production; previews read the dev deployment.
if [ "$VERCEL_ENV" = "production" ]; then
  npx convex deploy --cmd 'npm run build' --cmd-url-env-var-name NEXT_PUBLIC_CONVEX_URL
else
  npm run build
fi
```

```json
{ "buildCommand": "sh scripts/vercel-build.sh" }
```

```bash
chmod +x scripts/vercel-build.sh
git add vercel.json scripts/vercel-build.sh && git commit -m "build: deploy Convex with Vercel production builds"
```

- [ ] **Step 2: Link the project and set environment variables** (`vercel whoami` first; if signed out, Tarik runs `! vercel login`)

```bash
vercel link --yes --project cream-city-almanac
KEYFILE=.env.vercel-prod
npx convex deployment token create vercel-production --deployment prod --save-env "$KEYFILE"
grep '^CONVEX_DEPLOY_KEY=' "$KEYFILE" | cut -d= -f2- | tr -d '\n' | vercel env add CONVEX_DEPLOY_KEY production
rm -f "$KEYFILE"
printf 'https://standing-swordfish-685.convex.cloud' | vercel env add NEXT_PUBLIC_CONVEX_URL preview
vercel env ls | cut -c1-80
```

Expected: `CONVEX_DEPLOY_KEY` (Production) and `NEXT_PUBLIC_CONVEX_URL` (Preview) listed; no values printed.

- [ ] **Step 3: Connect Git and deploy**

```bash
vercel git connect
git push origin main
```

Wait for the production deployment (`vercel ls --prod | head -5`), then verify:

```bash
URL=$(vercel ls --prod 2>/dev/null | grep -o 'https://[^ ]*vercel.app' | head -1)
curl -s -o /dev/null -w "%{http_code}\n" "$URL/"
BASE_URL="$URL" npx playwright test e2e/home.spec.ts e2e/sheet.spec.ts --project=desktop
```

Expected: `200`; the home and sheet tests pass against production.

- [ ] **Step 4 (HUMAN, optional): Custom domain.** If Tarik wants `creamcityalmanac.com` (about $11/year): he approves the purchase, then `vercel domains add creamcityalmanac.com` and the DNS records Vercel prints.

---

### Task 16: End-to-end on preview deploys and launch wrap-up

**Files:**
- Create: `.github/workflows/e2e-preview.yml`, `docs/decisions/007-public-launch.md`, `docs/decisions/008-search-usage-cap.md`
- Modify: `README.md` (live URL)

**Interfaces:**
- Consumes: Vercel previews; GitHub secrets.
- Produces: e2e on every preview deploy; decision records.

- [ ] **Step 1: Write the workflow**

```yaml
# .github/workflows/e2e-preview.yml
name: E2E on preview
on: deployment_status

jobs:
  e2e:
    if: github.event.deployment_status.state == 'success' && github.event.deployment.environment == 'Preview'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npx playwright install --with-deps chromium webkit
      - run: npm run e2e
        env:
          BASE_URL: ${{ github.event.deployment_status.target_url }}
          VERCEL_AUTOMATION_BYPASS_SECRET: ${{ secrets.VERCEL_AUTOMATION_BYPASS_SECRET }}
```

- [ ] **Step 2 (HUMAN):** In Vercel → Project → **Settings → Deployment Protection → Protection Bypass for Automation**, create a secret; then `gh secret set VERCEL_AUTOMATION_BYPASS_SECRET` (paste when prompted, in Tarik's Terminal).

- [ ] **Step 3: Prove it on a preview**

```bash
git switch -c e2e-preview-proof
git commit --allow-empty -m "chore: trigger a preview deploy"
git push -u origin e2e-preview-proof
gh pr create --fill --title "E2E preview proof"
```

Expected: Vercel posts a preview; the "E2E on preview" workflow runs and passes. Merge the PR (it only adds the empty commit) or close it.

- [ ] **Step 4: Launch wrap-up**

Offer Tarik the `clean-code-toolkit:prod-readiness-coach` skill (his launch rule). Write `docs/decisions/007-public-launch.md` (public repo + production at end of Phase 2; options: preview link / production / local; chosen by Tarik; gave up: a quieter soft launch; how we'll know: three reporters complete five tasks under 60 seconds on the live site; "What actually happened" blank) and `docs/decisions/008-search-usage-cap.md` (token bucket 600/hour, burst 100, degrade to keywords; chosen by Claude after review finding #3; gave up: per-visitor fairness; how we'll know: zero cap hits in normal weeks, cost stays under a dollar a month). Add the live URL to `README.md`. Commit:

```bash
git add .github docs README.md
git commit -m "docs: record the public launch and search cap decisions"
git push
```

**Phase 2 is done when:** the production site serves search, results-in-place, and dataset sheets; CI and preview e2e are green; branch protection is on; axe and phone-layout checks pass; Impeccable's review gate closed with `DESIGN.md` written; and Tarik has seen it live.
