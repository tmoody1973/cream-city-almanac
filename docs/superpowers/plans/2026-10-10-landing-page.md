# Landing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A front page at `/` that explains Cream City Almanac ("A guide to Milwaukee's public data.") with live counts and a live sample Ask answer, while search moves to `/search` and every old search link keeps working.

**Architecture:** `/` becomes a server-rendered landing page; any request to `/` carrying a search parameter redirects (307) to `/search` with the same query. Counts come from one public Convex query; the sample answer comes from the map's public cached `mapCells` action. The search entry is a plain HTML form (`GET /search?q=…`), so it works before JavaScript loads.

**Tech Stack:** Next.js 16 App Router (server components, `redirect`, `searchParams` as a Promise), Convex (`fetchQuery`, `useAction`), CSS modules with the site tokens, Vitest, Playwright, axe.

**Spec:** `docs/superpowers/specs/2026-10-10-landing-page-design.md`

**Depends on:** the map branch (`api.map.mapCells`) merged to `main`. Start this plan from `main` after that merge.

## Global Constraints

- Words exactly: headline "A guide to Milwaukee's public data."; tagline "Find it. Understand it. Check where it came from."; Ask line "Ask in plain English; the answer shows the number and its source."; fine print "Unofficial. Not affiliated with Data You Can Use or the City of Milwaukee."; data questions "Questions about the data: hub@datayoucanuse.org".
- Never use on this page: "open data portal", "data catalog", "platform", "dashboard", "tool", "RAG", "AI-powered".
- Metadata title: "Cream City Almanac — A guide to Milwaukee's public data."
- `SEARCH_PARAMS` = `q, open, ask, prompt, row, place, year, topic, day, month, weekday` (exactly these); any other parameter (e.g. `utm_source`) keeps the landing page.
- Redirect is 307 to `/search` with the identical query string.
- House rules (DESIGN.md): 2px ink rule opens a block, 1px hairline divides; no cards, shadows, radii, gradients; no red; condensed capitals name things (headline in Saira Extra Condensed 700 via the existing caps font token, never the wordmark face); tabular lining figures for counts; 44px touch targets; night edition via existing tokens; laptop query `(min-width: 1100px) and (orientation: landscape)`.
- No frozen figures: counts from `api.catalog.landingStats`, the sample answer from `api.map.mapCells`; when the sample isn't ok, show the question and "See the count →" with no figure.
- No new npm dependency. Commit trailers name the implementing model. No production deploys by Claude.
- Tests: `npx vitest run --maxWorkers=2`; e2e against `npx next dev -p 3200` with `set -a; . ./.env.local; set +a; BASE_URL=http://localhost:3200 npx playwright test …`.

## Review Focus

1. A shared link from before the move (`/?q=homicide&open=P14`, `/?ask=1&prompt=…`) must land on the same view at `/search` — pinned in Task 1 (e2e for both).
2. A campaign link (`/?utm_source=linkedin`) must show the landing page, not search — pinned in Task 1 (unit + e2e).
3. The landing page must work with JavaScript off or still loading: the search entry submits to `/search?q=…` as a plain form — pinned in Task 3 (e2e with JavaScript disabled).
4. If the City's data is down, the sample Ask answer must show a link and no number — pinned in Task 4 (unit test of the fallback rendering).
5. "Back to the rundown" links (not-found, error, dataset sheet) must go to `/search`, not the landing page — pinned in Task 1 (e2e on an unknown code).

---

## File Structure

| File | Responsibility |
|---|---|
| `app/search/page.tsx` (new) | What `/` renders today (rundown + search). |
| `app/page.tsx` | Redirect search addresses; otherwise render the landing page; metadata. |
| `ui/lib/selection.ts` | `SEARCH_PARAMS`, `isSearchAddress`. |
| `convex/catalog.ts` | `landingStats` public query. |
| `ui/components/Landing.tsx` (new), `ui/components/landing.module.css` (new) | The page (server component). |
| `ui/components/LandingAskSample.tsx` (new) | Live sample answer (client). |
| Link sites: `SiteNav.tsx`, `LaptopRedirect.tsx`, `SearchHome.tsx`, `AskCards.tsx`, `askPrompt.ts`, `HowItWorks.tsx`, `StartHere.tsx`, `DatasetSheet.tsx`, `app/d/[code]/not-found.tsx`, `app/error.tsx` | `/` → `/search` where they mean search. |
| `e2e/*.spec.ts` | Search addresses → `/search`; new landing tests. |
| `docs/decisions/026-landing-page.md`, `DESIGN.md` | Decision and the landing section. |

---

### Task 1: Move search to `/search`, redirect old addresses

**Files:**
- Create: `app/search/page.tsx`
- Modify: `app/page.tsx`, `ui/lib/selection.ts`, the link sites listed above, `e2e/*.spec.ts`
- Test: `tests/ui/selection.test.ts`, `e2e/landing.spec.ts` (new)

**Interfaces:**
- Produces: `SEARCH_PARAMS: readonly string[]`; `isSearchAddress(params: Record<string, string | string[] | undefined>): boolean`; route `/search`.

- [ ] **Step 1: Failing unit test** (append to `tests/ui/selection.test.ts`)

```ts
import { isSearchAddress, SEARCH_PARAMS } from "../../ui/lib/selection";

describe("search addresses", () => {
  it("lists exactly the parameters the search screen reads", () => {
    expect([...SEARCH_PARAMS]).toEqual(["q", "open", "ask", "prompt", "row", "place", "year", "topic", "day", "month", "weekday"]);
  });
  it("sends any search parameter to /search and keeps other links on the landing page", () => {
    expect(isSearchAddress({})).toBe(false);
    expect(isSearchAddress({ q: "x" })).toBe(true);
    expect(isSearchAddress({ open: "P14" })).toBe(true);
    expect(isSearchAddress({ q: "" })).toBe(true);
    expect(isSearchAddress({ utm_source: "linkedin" })).toBe(false);
    expect(isSearchAddress({ utm_source: "x", ask: "1" })).toBe(true);
  });
});
```

(Merge the import into the file's existing import line from `../../ui/lib/selection`.)

- [ ] **Step 2: Run** — `npx vitest run tests/ui/selection.test.ts` — FAIL.

- [ ] **Step 3: Implement** in `ui/lib/selection.ts`:

```ts
// Every address parameter the search screen reads. A request to / with any of these is a search link from before the
// landing page existed (or a share of one) and goes to /search unchanged; other parameters (campaign tags) stay home.
export const SEARCH_PARAMS = ["q", "open", "ask", "prompt", "row", "place", "year", "topic", "day", "month", "weekday"] as const;

export const isSearchAddress = (params: Record<string, string | string[] | undefined>) =>
  SEARCH_PARAMS.some((k) => params[k] !== undefined);
```

- [ ] **Step 4: Run** — PASS.

- [ ] **Step 5: Move the search page**

`app/search/page.tsx` = the current `app/page.tsx` content verbatim, with the function renamed `SearchPage` and this metadata added: `export const metadata = { title: "Search — Cream City Almanac" };`.

`app/page.tsx` becomes (landing content arrives in Task 3; this stub keeps the site whole):

```tsx
import { redirect } from "next/navigation";
import { isSearchAddress } from "@/ui/lib/selection";

export const metadata = {
  title: "Cream City Almanac — A guide to Milwaukee's public data.",
  description: "Find it. Understand it. Check where it came from. Milwaukee's public data from Data You Can Use and the City of Milwaukee, explained.",
};

type Params = Promise<Record<string, string | string[] | undefined>>;

// The front door. Links made before the landing page (/?q=…&open=…) go to /search with the same settings.
export default async function HomePage({ searchParams }: { searchParams: Params }) {
  const params = await searchParams;
  if (isSearchAddress(params)) {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) for (const one of [v].flat()) if (one !== undefined) q.append(k, one);
    redirect(`/search?${q}`);
  }
  return (
    <main>
      <h1>A guide to Milwaukee&apos;s public data.</h1>
      <form action="/search" method="get"><label>Topic: <input name="q" placeholder="What are you looking into?" /></label></form>
    </main>
  );
}
```

(Next 16 `redirect` in a server component sends a 307 for a GET.)

- [ ] **Step 6: Point search links at `/search`**

Change exactly:
- `ui/components/SiteNav.tsx`: the SEARCH link `href="/"` → `href="/search"`.
- `ui/components/LaptopRedirect.tsx`: `` `/${selectionSearch(…)}…` `` → `` `/search${selectionSearch(…)}…` ``.
- `ui/components/SearchHome.tsx:213`: `` `/${selectionSearch(…)}` `` → `` `/search${selectionSearch(…)}` ``.
- `ui/components/AskCards.tsx:48`: `` `/?ask=1&${params}` `` → `` `/search?ask=1&${params}` ``.
- `ui/lib/askPrompt.ts` `laptopAskHref`: `/?ask=1…` → `/search?ask=1…` (both branches); update `tests/ui/askPrompt.test.ts` expectations accordingly.
- `ui/components/HowItWorks.tsx`, `ui/components/StartHere.tsx`: every `` `/?q=` `` / `"/?q=` → `/search?q=`.
- "Back to the rundown" links: `ui/components/DatasetSheet.tsx`, `app/d/[code]/not-found.tsx`, `app/error.tsx`: `href="/"` → `href="/search"`.
- Leave `ui/components/Masthead.tsx`'s wordmark link at `/`.

Then run `git grep -n -E "[\"'\`]/\?" -- app ui lib` — expected: no matches.

- [ ] **Step 7: Point e2e at `/search`**

In every `e2e/*.spec.ts`: `page.goto("/")` that expects the rundown → `page.goto("/search")`; `page.goto("/?…")` → `page.goto("/search?…")`; URL assertions like `toHaveURL(/\/\?/)` → `toHaveURL(/\/search\?/)`. Then `git grep -n -E "goto\((\"|\`)/(\?|\"|\`)" -- e2e` — expected: no matches.

- [ ] **Step 8: New e2e** `e2e/landing.spec.ts`:

```ts
import { expect, test } from "./fixtures";

test("a bare / is the landing page; a campaign tag keeps it", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("A guide to Milwaukee's public data.");
  await page.goto("/?utm_source=linkedin");
  await expect(page).toHaveURL(/\/\?utm_source=linkedin$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("A guide to Milwaukee's public data.");
});

test("links from before the move land on the same search view", async ({ page }) => {
  await page.goto("/?q=homicide&open=P14");
  await expect(page).toHaveURL(/\/search\?q=homicide&open=P14/);
  await page.goto("/?ask=1&prompt=" + encodeURIComponent("Rent in Lincoln Park"));
  await expect(page).toHaveURL(/\/search\?ask=1&prompt=Rent/);
});

test("Back to the rundown goes to search, not the landing page", async ({ page }) => {
  await page.goto("/d/ZZ99");
  await page.getByRole("link", { name: /back to the rundown/i }).click();
  await expect(page).toHaveURL(/\/search$/);
});
```

- [ ] **Step 9: Run everything** — `npx vitest run --maxWorkers=2`, `npx tsc --noEmit -p .`, `npm run build`, then the full e2e suite on both projects (`BASE_URL=http://localhost:3200 npx playwright test --workers=2 --reporter=line`). Load-flaky failures: rerun alone twice.

- [ ] **Step 10: Commit**

```bash
git add -A app ui lib e2e tests
git commit -m "feat: search moves to /search; / redirects old search links and becomes the front door"
```

---

### Task 2: Live numbers for the landing page

**Files:**
- Modify: `convex/catalog.ts`
- Test: `convex/catalog.test.ts`

**Interfaces:**
- Produces: `api.catalog.landingStats({})` → `{ dycuFamilies: number; cityFamilies: number; cityLive: number; newest: { code: string; name: string }[]; sampleCode: string | null }` — `newest` = the first three rows of `rundownRows`; `sampleCode` = the code of family `city:nibrs-crime-data` (null if absent). Pages (`kind === "page"`) don't count as families.

- [ ] **Step 1: Failing test** (add to `convex/catalog.test.ts`; uses the file's `seed(t)` which loads the DYCU fixture families; insert two City families)

```ts
describe("landing stats", () => {
  it("counts families by source, City live feeds, the three newest, and the crime code", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    await t.run(async (ctx) => {
      for (const [key, code, live] of [["city:nibrs-crime-data", "P32", true], ["city:zoning", "G05", false]] as const) {
        await ctx.db.insert("families", { key, code, name: key, kind: "dataset", topic: "Public Safety", keywords: [], places: ["City"], years: [], latestModified: "2020-01-01", baseSearchText: "", searchText: "", dictionaryTab: null, source: "city", live });
      }
    });
    const s = await t.query(api.catalog.landingStats, {});
    const dycu = (await t.run((ctx) => ctx.db.query("families").collect())).filter((f) => !f.source && f.kind !== "page").length;
    expect(s).toMatchObject({ dycuFamilies: dycu, cityFamilies: 2, cityLive: 1, sampleCode: "P32" });
    expect(s.newest).toHaveLength(3);
    expect(s.newest[0]).toEqual({ code: expect.any(String), name: expect.any(String) });
  });
});
```

(Copy the real required `families` fields from `convex/schema.ts` if the insert fails validation.)

- [ ] **Step 2: Run** — FAIL (`landingStats` undefined).

- [ ] **Step 3: Implement** in `convex/catalog.ts`:

```ts
// The landing page's live numbers: families per source (guide pages aren't families), City feeds updated daily, the
// three newest rundown rows, and the crime dataset's code for the sample Ask answer (codes differ between deployments).
export const landingStats = query({
  args: {},
  handler: async (ctx) => {
    const families = (await ctx.db.query("families").collect()).filter((f) => f.kind !== "page");
    const city = families.filter((f) => f.source === "city");
    const newest = (await rundownRows(ctx)).slice(0, 3).map((r) => ({ code: r.code, name: r.name }));
    return {
      dycuFamilies: families.length - city.length,
      cityFamilies: city.length,
      cityLive: city.filter((f) => f.live).length,
      newest,
      sampleCode: families.find((f) => f.key === "city:nibrs-crime-data")?.code ?? null,
    };
  },
});
```

- [ ] **Step 4: Run** — PASS; `npx tsc --noEmit -p .` clean.

- [ ] **Step 5: Commit**

```bash
git add convex/catalog.ts convex/catalog.test.ts
git commit -m "feat: landingStats — live family counts, newest rows and the sample crime code"
```

---

### Task 3: The landing page (layout A)

**Files:**
- Create: `ui/components/Landing.tsx`, `ui/components/landing.module.css`
- Modify: `app/page.tsx` (render `<Landing />` instead of the stub)
- Test: `e2e/landing.spec.ts`

**Interfaces:**
- Consumes: `api.catalog.landingStats` (Task 2); `Masthead`, `SiteNav`, `ProvenanceTag` (existing components — read their props before use).
- Produces: `<Landing stats={…} />` server component; `<LandingAskSample code={string | null} />` placeholder import (Task 4 creates it — in this task render nothing in its slot).

- [ ] **Step 1: e2e first** — add to `e2e/landing.spec.ts`:

```ts
test("the landing page explains the almanac, with live numbers and working links", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Find it. Understand it. Check where it came from.")).toBeVisible();
  for (const h of ["Find it", "Understand it", "Check where it came from", "The data", "Ask a question", "Who it's for"]) {
    await expect(page.getByRole("heading", { name: h, exact: true })).toBeVisible();
  }
  await expect(page.locator("[data-landing-count=dycu]")).toHaveText(/^\d+$/);
  await expect(page.locator("[data-landing-count=city]")).toHaveText(/^\d+$/);
  await expect(page.getByText("Unofficial. Not affiliated with Data You Can Use or the City of Milwaukee.")).toBeVisible();
  // Whole words only ("RAG" must not match "average" or "coverage").
  expect(await page.locator("main").innerText()).not.toMatch(/open data portal|data catalog|\bplatform\b|\bdashboard\b|\btool\b|\bRAG\b|AI-powered/i);
  await page.getByRole("link", { name: /start here/i }).first().click();
  await expect(page).toHaveURL(/\/start-here$/);
});

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });
  test("the search entry still submits to /search", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("searchbox", { name: /topic/i }).fill("kids who can't afford food");
    await page.getByRole("searchbox", { name: /topic/i }).press("Enter");
    await expect(page).toHaveURL(/\/search\?q=kids/);
  });
});
```

- [ ] **Step 2: Run** — FAIL (headings missing).

- [ ] **Step 3: Implement `Landing.tsx`** (server component; check `Masthead`/`SiteNav` prop names in their files and reuse the search page's masthead usage from `SearchHome.tsx`):

```tsx
import Link from "next/link";
import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
import { Masthead } from "./Masthead";
import { ProvenanceTag } from "./ProvenanceTag";
import { SiteNav } from "./SiteNav";
import styles from "./landing.module.css";

type Stats = FunctionReturnType<typeof api.catalog.landingStats>;
const EXAMPLE = "kids who can't afford food";

// The front door: what the almanac is, what it holds, why to trust it, and where to go next. Live numbers only.
export function Landing({ stats }: { stats: Stats }) {
  return (
    <div className={styles.page}>
      <Masthead side="" showDate={false} nav={<SiteNav placement="masthead" current="home" />} />
      <main>
        <h1 className={styles.headline}>A guide to Milwaukee&apos;s public data.</h1>
        <p className={styles.tagline}>Find it. Understand it. Check where it came from.</p>
        <form action="/search" method="get" className={styles.entry} role="search">
          <label htmlFor="landing-q" className={styles.entryLabel}>Topic:</label>
          <input id="landing-q" name="q" type="search" placeholder="What are you looking into?" className={styles.entryInput} />
          <button type="submit" className={styles.button}>Search</button>
        </form>

        <div className={styles.three}>
          <section><h2 className={styles.heading}>Find it</h2>
            <p>Search in your own words across Data You Can Use and the City of Milwaukee.</p>
            <p className={styles.example}><Link href={`/search?q=${encodeURIComponent(EXAMPLE)}`}>&ldquo;{EXAMPLE}&rdquo;</Link> → Food Insecurity Prevalence</p></section>
          <section><h2 className={styles.heading}>Understand it</h2>
            <p>Every dataset gets a plain-English sheet: what it measures, which places and years exist, the caveats, a map, and story angles.</p></section>
          <section><h2 className={styles.heading}>Check where it came from</h2>
            <p>Every fact says who wrote it. Numbers come from the data, never from the AI.</p>
            <p className={styles.example}><ProvenanceTag source="DYCU" /> <ProvenanceTag source="HUB" /> <ProvenanceTag source="CITY" /> <ProvenanceTag source="AI" /></p></section>
        </div>

        <div className={styles.pair}>
          <section><h2 className={styles.heading}>The data</h2>
            <table className={styles.table}>
              <thead><tr><th scope="col">Source</th><th scope="col">What&apos;s in it</th><th scope="col">Families</th></tr></thead>
              <tbody>
                <tr><th scope="row">Data You Can Use</th><td>Neighborhood health, income and housing; reports read word by word</td><td className={styles.num} data-landing-count="dycu">{stats.dycuFamilies}</td></tr>
                <tr><th scope="row">City of Milwaukee</th><td>Crime, fire and EMS calls, City services, property, elections, maps; {stats.cityLive} updated daily</td><td className={styles.num} data-landing-count="city">{stats.cityFamilies}</td></tr>
              </tbody>
            </table>
            <p className={styles.example}>Refreshed every Monday. Updated this season: {stats.newest.map((n, i) => (<span key={n.code}>{i ? " · " : ""}<Link href={`/d/${n.code}`}>{n.name}</Link></span>))}</p></section>
          <section><h2 className={styles.heading}>Ask a question</h2>
            <p>Ask in plain English; the answer shows the number and its source.</p>
            {/* Task 4: <LandingAskSample code={stats.sampleCode} /> */}
            <p className={styles.example}>Free with sign-in · 30 questions a day · <Link href="/ask/guide">How to use Ask →</Link></p></section>
        </div>

        <section className={styles.block}><h2 className={styles.heading}>Who it&apos;s for</h2>
          <ul className={styles.who}>
            <li><b>A reporter</b> checking a number on deadline</li>
            <li><b>A nonprofit</b> writing a grant</li>
            <li><b>A resident</b> curious about their block</li>
            <li><Link href="/start-here">Start here →</Link></li>
          </ul></section>

        <p className={styles.fine}>Unofficial. Not affiliated with Data You Can Use or the City of Milwaukee. · <Link href="/how-it-works">How it works</Link> · <a href="https://github.com/tmoody1973/cream-city-almanac">Code on GitHub</a> · Questions about the data: <a href="mailto:hub@datayoucanuse.org">hub@datayoucanuse.org</a></p>
      </main>
    </div>
  );
}
```

If `SiteNav`'s `current` prop doesn't accept `"home"`, add it to its union (no link is marked current on the landing page). If `Masthead` requires a non-empty `side`, pass the existing value the search page uses for the date line and set `showDate={false}`.

`landing.module.css` — follow DESIGN.md (2px rule opens a block, 1px hairline inside, no cards/radii/shadows/red, caps font for names, tabular figures):

```css
.page { max-width: 1280px; margin: 0 auto; padding: 0 16px 48px; }
.headline { font-family: var(--font-caps); font-weight: 700; text-transform: uppercase; font-size: clamp(36px, 6vw, 64px); line-height: 0.95; margin: 22px 0 6px; border-top: var(--rule); padding-top: 18px; }
.tagline { font-size: var(--fs-body); margin: 0 0 18px; }
.entry { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 12px; border: var(--hair); padding: 10px 12px; max-width: 760px; }
.entryLabel { font-family: var(--font-caps); font-weight: 700; text-transform: uppercase; }
.entryInput { flex: 1; min-width: 12ch; min-height: 44px; border: 0; background: transparent; color: var(--ink); font: inherit; }
.button { min-height: 44px; padding: 0 18px; border: var(--rule); background: transparent; color: var(--ink); font-family: var(--font-caps); font-weight: 700; text-transform: uppercase; }
.heading { font-family: var(--font-caps); font-weight: 700; text-transform: uppercase; font-size: var(--fs-label); margin: 0 0 6px; }
.three { display: grid; gap: 0; margin-top: 30px; border-top: var(--rule); }
.three > section { padding: 14px 0; border-top: var(--hair); }
.three > section:first-child { border-top: 0; }
.pair { display: grid; gap: 28px; margin-top: 30px; border-top: var(--rule); padding-top: 12px; }
.block { margin-top: 30px; border-top: var(--rule); padding-top: 12px; }
.example { font-size: var(--fs-small); color: var(--muted); border-top: var(--hair); margin: 10px 0 0; padding-top: 8px; }
.table { width: 100%; border-collapse: collapse; }
.table th, .table td { text-align: left; padding: 10px 10px 10px 0; border-bottom: var(--hair); vertical-align: top; }
.num { font-family: var(--font-caps); font-weight: 700; font-size: var(--fs-label); font-variant-numeric: tabular-nums lining-nums; }
.who { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px 24px; }
.fine { margin-top: 34px; border-top: var(--rule); padding-top: 10px; font-size: var(--fs-small); color: var(--muted); }
@media (min-width: 1100px) and (orientation: landscape) {
  .three { grid-template-columns: repeat(3, 1fr); }
  .three > section { border-top: 0; padding: 14px 20px 4px 0; }
  .three > section + section { border-left: var(--hair); padding-left: 20px; }
  .pair { grid-template-columns: 1.1fr 1fr; gap: 40px; }
  .who { grid-template-columns: repeat(4, auto); }
}
```

(Check `globals.css` for the exact token names — `--rule`, `--hair`, `--ink`, `--muted`, `--font-caps`, `--fs-*` — and use those.)

`app/page.tsx`: replace the stub's return with

```tsx
  const stats = await fetchQuery(api.catalog.landingStats, {});
  return <Landing stats={stats} />;
```

(imports: `fetchQuery` from `convex/nextjs`, `api`, `Landing`), and add `export const revalidate = 300;`.

- [ ] **Step 4: Run** — the landing e2e (both projects) PASS; `npx tsc --noEmit -p .`, `npm run build`.

- [ ] **Step 5: Look at it** — screenshot `/` at 390×844 and 1440×900 in light and dark (Playwright script in the scratchpad), compare with the mockup's layout A; fix spacing only.

- [ ] **Step 6: Commit**

```bash
git add app/page.tsx ui/components/Landing.tsx ui/components/landing.module.css ui/components/SiteNav.tsx e2e/landing.spec.ts
git commit -m "feat: the landing page — what the almanac is, live numbers, and where to go next"
```

---

### Task 4: The live sample Ask answer

**Files:**
- Create: `ui/components/LandingAskSample.tsx`, `ui/lib/landingSample.ts`
- Modify: `ui/components/Landing.tsx`
- Test: `tests/ui/landingSample.test.ts`, `e2e/landing.spec.ts`

**Interfaces:**
- Consumes: `api.map.mapCells`; `CountResult` (`lib/ask/tools.ts`); `stats.sampleCode` (Task 2).
- Produces: `sampleView(r: CountResult | null): { kind: "figure"; count: string; caption: string } | { kind: "link" }` — pure; `<LandingAskSample code />` client component.

- [ ] **Step 1: Failing unit test**

```ts
// tests/ui/landingSample.test.ts
import { describe, expect, it } from "vitest";
import { sampleView } from "../../ui/lib/landingSample";

describe("landing sample answer", () => {
  it("shows the figure and its caption only for an ok count", () => {
    const ok = { status: "ok", count: 26, name: "NIBRS Crime Data", filters: ["Robbery"], period: "Jan 1, 2026 – Oct 10, 2026", area: "Harambee (City of Milwaukee boundary)" } as never;
    expect(sampleView(ok)).toEqual({ kind: "figure", count: "26", caption: "NIBRS Crime Data · Robbery · Jan 1, 2026 – Oct 10, 2026 · In Harambee (City of Milwaukee boundary)" });
  });
  it("never shows a number when the City is down, busy, or the code is missing", () => {
    for (const r of [null, { status: "unavailable" }, { status: "busy" }, { status: "not-found" }] as never[]) expect(sampleView(r)).toEqual({ kind: "link" });
  });
});
```

- [ ] **Step 2: Run** — FAIL.

- [ ] **Step 3: Implement**

```ts
// ui/lib/landingSample.ts
import type { CountResult } from "@/lib/ask/tools";

// The landing page's sample answer: a real count, or a link — never a number that didn't come from the data.
export function sampleView(r: CountResult | null): { kind: "figure"; count: string; caption: string } | { kind: "link" } {
  if (!r || r.status !== "ok") return { kind: "link" };
  return { kind: "figure", count: r.count.toLocaleString("en-US"), caption: [r.name, ...r.filters, r.period, r.area ? `In ${r.area}` : null].filter(Boolean).join(" · ") };
}
```

```tsx
// ui/components/LandingAskSample.tsx
"use client";
import { useAction } from "convex/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { CountResult } from "@/lib/ask/tools";
import { sampleView } from "@/ui/lib/landingSample";
import { ProvenanceTag } from "./ProvenanceTag";
import styles from "./landing.module.css";

const QUESTION = "How many robberies in Harambee this year?";

export function LandingAskSample({ code }: { code: string | null }) {
  const run = useAction(api.map.mapCells);
  const [r, setR] = useState<CountResult | null>(null);
  useEffect(() => {
    if (!code) return;
    const year = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" }).slice(0, 4);
    run({ code, from: `${year}-01-01`, filters: [{ column: "Offense_All", values: ["120"] }], neighborhood: "Harambee" }).then(setR, () => setR(null));
  }, [code, run]);
  const v = sampleView(r);
  return (
    <div className={styles.sample} data-landing-sample>
      <p className={styles.sampleQ}>{QUESTION}</p>
      {v.kind === "figure"
        ? (<><p className={styles.sampleFigure} data-landing-sample-count>{v.count}</p><p className={styles.sampleCaption}>{v.caption} <ProvenanceTag source="CITY" /></p></>)
        : (<p className={styles.sampleCaption}><Link href={`/search?ask=1&prompt=${encodeURIComponent(QUESTION)}`}>See the count →</Link></p>)}
    </div>
  );
}
```

CSS additions: `.sample { border: var(--hair); padding: 12px 14px; margin-top: 10px; } .sampleQ { font-weight: 600; margin: 0; } .sampleFigure { font-family: var(--font-caps); font-weight: 700; font-size: clamp(36px, 6vw, 56px); line-height: 1; margin: 6px 0; font-variant-numeric: tabular-nums lining-nums; } .sampleCaption { font-size: var(--fs-small); margin: 0; }`.

In `Landing.tsx`, replace the Task 3 comment with `<LandingAskSample code={stats.sampleCode} />` and import it.

- [ ] **Step 4: e2e** — add:

```ts
test("the sample answer shows a real count or a link, never a made-up number", async ({ page }) => {
  await page.goto("/");
  const sample = page.locator("[data-landing-sample]");
  await expect(sample.locator("[data-landing-sample-count], a", { hasText: /^\d[\d,]*$|See the count/ }).first()).toBeVisible({ timeout: 30_000 });
});
```

- [ ] **Step 5: Run** unit, tsc, build, landing e2e (both projects) — PASS.

- [ ] **Step 6: Commit**

```bash
git add ui/lib/landingSample.ts tests/ui/landingSample.test.ts ui/components/LandingAskSample.tsx ui/components/Landing.tsx ui/components/landing.module.css e2e/landing.spec.ts
git commit -m "feat: the landing page's live sample Ask answer, with a link instead of a number when the City is down"
```

---

### Task 5: Accessibility, docs, verification

**Files:**
- Modify: `e2e/a11y.spec.ts`, `DESIGN.md`, `docs/LEARNING-LOG.md`
- Create: `docs/decisions/026-landing-page.md`

- [ ] **Step 1: axe on `/` in both editions** — add `/` to the pages `e2e/a11y.spec.ts` checks (light and dark), waiting for `[data-landing-sample]`. Expected: no serious/critical violations.

- [ ] **Step 2: Decision 026** (plain English; "What actually happened" blank)

```markdown
# 026: A front page that explains the almanac; search moves to /search

**Decision:** creamcityalmanac.app now opens on a page that says what the almanac is — "A guide to Milwaukee's public data. Find it. Understand it. Check where it came from." — with live numbers and a live sample answer; search moves to /search.

**Why this came up:** New visitors landed on a search box with no explanation of whose data this is, what the site does with it, or why to trust it.

**Options:**
- *Front page at /, search at /search (chosen):* explains first; one more click for people who came to search. Cost: every search address changes; links shared before the move rely on a redirect.
- *Front page for first visits only:* regulars skip it. Cost: two front doors, harder to share and test.
- *Keep search at /, explanation at /about:* smallest change. Cost: visitors still land without context.

**What we chose and why:** Front page at / — Tarik's call, 2026-10-10 — so the first thing anyone sees says what this is. The descriptor avoids words like "portal", "platform" and "AI-powered" that describe how it's built rather than what it does for someone.

**What we gave up:** A click for searchers; the redirect becomes something to keep working.

**How we'll know if this was right:** first-time visitors go on to search, Start here, or Ask instead of leaving; no reports of broken old links.

**What actually happened:**
```

- [ ] **Step 3: DESIGN.md** — add a "Landing page" section: layout A (headline in condensed capitals, never the wordmark face; three verb columns on laptops, stacked on phones; the data table beside the sample answer; who it's for; fine print), live numbers only, and the redirect rule for search addresses.

- [ ] **Step 4: Learning log** — a dated "Suggested entries (for Tarik to write in his own words)" item: expected a landing page to be mostly words → most of the work was moving search without breaking links; expected "redirect any parameter" → campaign tags would have been sent to search.

- [ ] **Step 5: Full verification** — `npx vitest run --maxWorkers=2`, `npx tsc --noEmit -p .`, `npm run build`, `npx convex dev --once`, the full e2e suite on both projects.

- [ ] **Step 6: Commit; hand off** — commit docs; tell Tarik: `! npx convex deploy -y` (adds `landingStats`; no import), then PR, CI, merge on his word. After merge, check www.creamcityalmanac.app/ and an old link like `/?q=homicide`.
