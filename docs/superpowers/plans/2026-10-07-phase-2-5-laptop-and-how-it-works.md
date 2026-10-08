# Phase 2.5: Laptop Two-Pane Layout and "How It Works" Page — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give laptops a real two-pane design (rundown or results on the left, the selected dataset's full sheet on the right, newest auto-opened), add a plain-English `/how-it-works` page built around an annotated real dataset sheet, and add a one-line explainer band on the home page — without changing anything phones see today except the band.

**Architecture:** Selection lives in the URL (`?q=…&open=CODE`) and is parsed by a small pure module. A `useLaptop()` hook (the same media query as the CSS) switches row clicks from "expand in place" to "open in the right pane". The dataset sheet's body is split out of the page so the same `SheetBody` renders on `/d/[code]` and inside the laptop pane (`SheetPane`, a client component that loads `api.catalog.familySheet`). `/how-it-works` is a server-rendered page that reads live counts from `catalogStatus` and renders a real W01 sheet with grease-pencil teaching notes. Both new surfaces go through Impeccable's comp-led build gates, one surface at a time.

**Tech Stack:** Next.js 16.4 App Router, React 19.3, Convex 1.46 (`convex/react`, `convex/nextjs`), CSS Modules, Vitest 5, Playwright 1.63 + axe, Impeccable (comp-led build).

**Spec:** `docs/superpowers/specs/2026-10-07-laptop-layout-and-how-it-works-design.md` (§9 records the comp decisions). Also read `DESIGN.md`, `PRODUCT.md`, and the approved comps `.impeccable/mocks/laptop-b.webp`, `.impeccable/mocks/how-laptop.webp`, `.impeccable/mocks/how-phone.webp`.

## Global Constraints

- **Laptop media query, identical in CSS and JS:** `(min-width: 1100px) and (orientation: landscape)`. JS reads it from `LAPTOP_QUERY` in `ui/lib/selection.ts`.
- **Phones unchanged:** every existing phone e2e test passes unchanged; the only phone-visible addition is the explainer band (Task 6).
- **Comp sizes (gate viewports):** `laptop-b.webp` and `how-laptop.webp` 1536×1024; `how-phone.webp` 1024×1536.
- **Live numbers only:** counts, PDF count and "as of" date come from `api.search.catalogStatus`; when a value is missing, the sentence omits it. No hardcoded counts or quality scores. No testimonials, usage numbers, or DYCU endorsement (`PRODUCT.md`).
- **Red stays grease pencil:** circle (updated), tick (opened), arrow + swash (the open/selected row), and on `/how-it-works` hand-written teaching notes. No other red. No numbered red keys (a red number means "saved").
- **Plates:** reuse `public/plates/pencil-arrow.png` and `pencil-mark.png`. Generating any new image needs Tarik's OK (budget ceiling: 4 more images, about $1).
- **Copy:** plain English; define a term in one clause on first use. Credit line: "Unofficial; not affiliated with Data You Can Use." Byline: "Built by Tarik Moody" → `https://github.com/tmoody1973`. Decision log: `https://github.com/tmoody1973/cream-city-almanac/tree/main/docs/decisions`.
- **Workflow:** branch `feat/laptop-and-how-it-works`; ship through a pull request (branch protection requires CI `check`); Conventional Commits, **no** `Co-Authored-By` trailers.

## Review Focus

1. **Switching rows quickly while the Hub is slow** → the right pane shows only the newest selection's preview, never a late answer for the previous row. Pinned by Task 4, test "switching rows quickly never shows the wrong sheet's preview".
2. **A laptop link opened on a phone** (`/?open=W01` where W01 isn't in the phone's list) → the phone opens W01's full sheet page instead of silently ignoring it. Pinned by Task 4, test "a shared laptop link opens the full sheet on a phone".
3. **An unknown or retired code in the address** (`/?open=Z99`) → the pane says so with a way back, and the list still works. Pinned by Task 4, test "an unknown code shows not-found in the pane and the list still works".
4. **The catalog is unreachable when `/how-it-works` renders** → the page still explains everything and simply omits the numbers. Pinned by Task 2, test "countsLine and friends omit missing values".
5. **Resizing a laptop window narrower than 1100px after choosing a row** → the chosen row shows expanded in the phone layout. Pinned by Task 4, test "narrowing the window keeps the chosen row open".

---

## File Structure

```
convex/schema.ts, buildStore.ts, build.ts, search.ts   pdfReports count on builds and catalogStatus (modify)
ui/lib/selection.ts        LAPTOP_QUERY, parseSelection, selectionSearch (new)
ui/lib/useLaptop.ts        useLaptop() hook (new)
ui/lib/how.ts              countsLine, pdfReportsPhrase, asOfPhrase (new)
ui/components/SheetBody.tsx       sheet header + sections (split out of DatasetSheet) (new)
ui/components/SheetDownloads.tsx  CSV / app / file / View on Hub links (new)
ui/components/SiteNav.tsx         dock + masthead navigation; replaces TabBar.tsx (new; delete TabBar.tsx)
ui/components/SheetPane.tsx       laptop right pane (new)
ui/components/LaptopRedirect.tsx  /d/CODE on a laptop → /?open=CODE (new)
ui/components/ExplainerBand.tsx   one-line "how it works" band (new)
ui/components/AnnotatedSheet.tsx, PencilNote.tsx, HowItWorks.tsx, how.module.css   /how-it-works (new)
ui/components/DatasetSheet.tsx, Masthead.tsx, ResultRow.tsx, RundownList.tsx, SearchHome.tsx, LivePreview.tsx (modify)
ui/components/rundown.module.css, sheet.module.css (modify)
app/how-it-works/page.tsx (new), app/layout.tsx (note font)
tests/ui/selection.test.ts, tests/ui/how.test.ts (new)
e2e/laptop.spec.ts, e2e/how.spec.ts (new); e2e/home.spec.ts, e2e/a11y.spec.ts, e2e/capture.spec.ts, e2e/sheet.spec.ts (modify)
.impeccable/build/archive/** (Phase 2 build record), DESIGN.md (laptop + how-it-works rules)
```

---

### Task 1: Count the report PDFs in the catalog status

**Files:**
- Modify: `convex/schema.ts`, `convex/buildStore.ts` (`setPending`), `convex/build.ts` (`runBuild`), `convex/search.ts` (`catalogStatus`)
- Test: `convex/orchestrator.test.ts`, `convex/catalog.test.ts`, `convex/search.test.ts`, `convex/build.test.ts`

**Interfaces:**
- Consumes: Phase 2 `hubCounts`, `setPending`, `catalogStatus`.
- Produces: `api.search.catalogStatus()` returns `{ asOf, lastRunFailed, running, counts, pdfReports: number | null }`.

- [ ] **Step 0: Branch**

```bash
git switch -c feat/laptop-and-how-it-works
```

- [ ] **Step 1: Write the failing tests**

In `convex/orchestrator.test.ts`, after `expect(build.hubCounts).toEqual({ rawData: 93, reports: 282, visualizations: 7 });` add:

```ts
      expect(build.pdfReports).toBe(180);
```

In `convex/catalog.test.ts`, change the `setPending` call in "catalogStatus reports the Hub-collection counts from the last good build" to include `pdfReports: 180,` and its expectation to:

```ts
    expect(await t.query(api.search.catalogStatus, {})).toMatchObject({
      counts: { rawData: 93, reports: 282, visualizations: 7 },
      pdfReports: 180,
      lastRunFailed: false,
    });
```

In `convex/search.test.ts`, change the catalogStatus expectation to `{ asOf: goodRow!.finishedAt, lastRunFailed: true, running: false, counts: null, pdfReports: null }`. In `convex/build.test.ts`, add `pdfReports: 180,` to the `setPending` call in `seed`.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run convex/orchestrator.test.ts convex/catalog.test.ts convex/search.test.ts convex/build.test.ts`
Expected: FAIL — `pdfReports` is undefined / not a valid `setPending` argument.

- [ ] **Step 3: Implement**

`convex/schema.ts`, in `builds` after `hubCounts`:

```ts
    pdfReports: v.optional(v.number()),
```

`convex/buildStore.ts`, `setPending` args, after `hubCounts`:

```ts
    pdfReports: v.number(),
```

`convex/build.ts`, in the `setPending` call. `reports` already exists a few lines above it (`const reports = families.filter(isPdfFamily).flatMap(...)`, about line 265): it is every PDF the weekly job reads, so the page's wording is "Read the N report PDFs", not "N PDFs have searchable text" (a PDF that Firecrawl fails on is still counted).

```ts
    pdfReports: reports.length,
```

`convex/search.ts`, `catalogStatus` return, after `counts`:

```ts
      pdfReports: lastGood?.pdfReports ?? null,
```

- [ ] **Step 4: Run, regenerate, typecheck, push to dev, rebuild**

```bash
npx convex codegen
npx vitest run
npm run typecheck && npx tsc --noEmit -p convex
npx convex dev --once
npx convex run build:start
```

Expected: all tests pass; the dev rebuild completes (wait about two minutes) and `npx convex run search:catalogStatus` shows `"pdfReports": 180`.

- [ ] **Step 5: Commit**

```bash
git add convex
git commit -m "feat: report how many report PDFs the catalog reads"
```

---

### Task 2: Selection, laptop and "how it works" logic

**Files:**
- Create: `ui/lib/selection.ts`, `ui/lib/useLaptop.ts`, `ui/lib/how.ts`
- Test: `tests/ui/selection.test.ts`, `tests/ui/how.test.ts`

**Interfaces:**
- Consumes: `asOfLabel` from `ui/lib/format.ts`; `CatalogStatus` type from `ui/components/CatalogLine.tsx`.
- Produces: `LAPTOP_QUERY: string`; `interface Selection { q: string; open: string | null }`; `parseSelection(search: string): Selection`; `selectionSearch(s: Selection): string` (returns `""` or `"?…"`); `useLaptop(): boolean`; `countsLine(status: CatalogStatus | null): string | null`; `pdfReportsPhrase(status: CatalogStatus | null): string`; `asOfPhrase(status: CatalogStatus | null): string | null`.

- [ ] **Step 1: Write the failing tests**

`tests/ui/selection.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { LAPTOP_QUERY, parseSelection, selectionSearch } from "../../ui/lib/selection";

describe("selection in the address", () => {
  it("reads the query and a normalized code", () => {
    expect(parseSelection("?q=asthma&open=w01")).toEqual({ q: "asthma", open: "W01" });
    expect(parseSelection("")).toEqual({ q: "", open: null });
  });
  it("ignores anything that isn't a dataset code", () => {
    expect(parseSelection("?open=../etc").open).toBeNull();
    expect(parseSelection("?open=W0123").open).toBeNull();
  });
  it("writes the smallest address that restores the view", () => {
    expect(selectionSearch({ q: "kids who can't afford food", open: "F02" })).toBe("?q=kids+who+can%27t+afford+food&open=F02");
    expect(selectionSearch({ q: "  ", open: null })).toBe("");
    expect(parseSelection(selectionSearch({ q: "rent burden", open: "H08" }))).toEqual({ q: "rent burden", open: "H08" });
  });
  it("uses the same laptop breakpoint as the CSS", () => {
    expect(LAPTOP_QUERY).toBe("(min-width: 1100px) and (orientation: landscape)");
  });
});
```

`tests/ui/how.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { asOfPhrase, countsLine, pdfReportsPhrase } from "../../ui/lib/how";

const status = {
  asOf: Date.UTC(2026, 9, 7, 18),
  lastRunFailed: false,
  running: false,
  counts: { rawData: 93, reports: 282, visualizations: 7 },
  pdfReports: 180,
};

describe("countsLine and friends omit missing values", () => {
  it("says the Hub's counts in the Hub's words", () => {
    expect(countsLine(status)).toBe("93 raw data · 282 reports · 7 visualizations");
    expect(pdfReportsPhrase(status)).toBe("the 180 report PDFs");
    expect(asOfPhrase(status)).toBe("Oct 7");
  });
  it("omits numbers when the catalog can't be reached", () => {
    expect(countsLine(null)).toBeNull();
    expect(pdfReportsPhrase(null)).toBe("the neighborhood report PDFs");
    expect(asOfPhrase(null)).toBeNull();
    expect(countsLine({ ...status, counts: null })).toBeNull();
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/ui/selection.test.ts tests/ui/how.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write `ui/lib/selection.ts`**

```ts
// Laptops get the two-pane layout. Keep this string identical to the CSS media query in rundown.module.css.
export const LAPTOP_QUERY = "(min-width: 1100px) and (orientation: landscape)";

const CODE = /^[A-Za-z]\d{2,3}$/;

export interface Selection {
  q: string;
  open: string | null;
}

export function parseSelection(search: string): Selection {
  const params = new URLSearchParams(search);
  const open = params.get("open")?.trim() ?? "";
  return { q: params.get("q")?.trim() ?? "", open: CODE.test(open) ? open.toUpperCase() : null };
}

export function selectionSearch({ q, open }: Selection): string {
  const params = new URLSearchParams();
  if (q.trim()) params.set("q", q.trim());
  if (open) params.set("open", open);
  const s = params.toString();
  return s ? `?${s}` : "";
}
```

- [ ] **Step 4: Write `ui/lib/useLaptop.ts` and `ui/lib/how.ts`**

```ts
// ui/lib/useLaptop.ts
"use client";
import { useSyncExternalStore } from "react";
import { LAPTOP_QUERY } from "./selection";

function subscribe(onChange: () => void) {
  const media = window.matchMedia(LAPTOP_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

// False during server rendering and hydration; CSS lays out the panes, this only switches click behavior.
export function useLaptop(): boolean {
  return useSyncExternalStore(subscribe, () => window.matchMedia(LAPTOP_QUERY).matches, () => false);
}
```

```ts
// ui/lib/how.ts
import type { CatalogStatus } from "@/ui/components/CatalogLine";
import { asOfLabel } from "./format";

export function countsLine(status: CatalogStatus | null): string | null {
  const c = status?.counts;
  return c ? `${c.rawData} raw data · ${c.reports} reports · ${c.visualizations} visualizations` : null;
}

export function pdfReportsPhrase(status: CatalogStatus | null): string {
  return typeof status?.pdfReports === "number" ? `the ${status.pdfReports} report PDFs` : "the neighborhood report PDFs";
}

export function asOfPhrase(status: CatalogStatus | null): string | null {
  return status?.asOf ? asOfLabel(status.asOf) : null;
}
```

- [ ] **Step 5: Run tests and typecheck**

Run: `npx vitest run tests/ui && npm run typecheck`
Expected: PASS; typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add ui/lib tests/ui
git commit -m "feat: add selection, laptop and how-it-works logic"
```

---

### Task 3: Split the sheet body out of the page, and one site navigation

**Files:**
- Create: `ui/components/SheetBody.tsx`, `ui/components/SheetDownloads.tsx`, `ui/components/SiteNav.tsx`
- Modify: `ui/components/DatasetSheet.tsx`, `ui/components/Masthead.tsx`, `ui/components/SearchHome.tsx`, `ui/components/rundown.module.css`
- Delete: `ui/components/TabBar.tsx`
- Test: `e2e/sheet.spec.ts`

**Interfaces:**
- Consumes: `SheetData` (moves to `SheetBody.tsx`), `Masthead`.
- Produces: `SheetBody({ sheet, headingId? }: { sheet: SheetData; headingId?: string })`; `SheetDownloads({ sheet }: { sheet: SheetData })`; `export type SheetData`; `SiteNav({ placement, current }: { placement: "dock" | "masthead"; current: "search" | "how" | null })`; `Masthead({ side, showDate, nav?, sideClassName? })`.

- [ ] **Step 1: Write the failing test** (append to `e2e/sheet.spec.ts`)

```ts
test("a dataset sheet doesn't claim SEARCH as the current page", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "laptops open sheets in the two-pane view (Task 4)");
  await page.goto("/d/W01");
  await expect(page.getByRole("link", { name: "SEARCH" })).not.toHaveAttribute("aria-current", "page");
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm run e2e -- e2e/sheet.spec.ts --project=phone -g "doesn't claim"`
Expected: FAIL — the sheet's tab bar marks SEARCH as current.

- [ ] **Step 3: Write `SheetDownloads.tsx`, `SheetBody.tsx`, `SiteNav.tsx`**

```tsx
// ui/components/SheetDownloads.tsx
import type { SheetData } from "./SheetBody";
import styles from "./sheet.module.css";

export function SheetDownloads({ sheet }: { sheet: SheetData }) {
  const latest = sheet.members[0];
  if (!latest) return null;
  return (
    <>
      {latest.downloads.CSV && <a className={styles.button} href={latest.downloads.CSV}>CSV</a>}
      {latest.downloads.App && <a className={styles.button} href={latest.downloads.App}>Open app</a>}
      {latest.fileUrl && sheet.fileLabel && <a className={styles.button} href={latest.fileUrl}>{sheet.fileLabel}</a>}
      <a className={styles.button} href={latest.landingPage}>View on Hub</a>
    </>
  );
}
```

`ui/components/SheetBody.tsx` (the header and every section from today's `DatasetSheet`, moved verbatim; the only addition is the optional `headingId` so the laptop pane can move focus to the heading):

```tsx
import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
import { shortDate, subline, yearSpan } from "@/ui/lib/format";
import { LivePreview } from "./LivePreview";
import { PlaceYearGrid } from "./PlaceYearGrid";
import { ProvenanceTag } from "./ProvenanceTag";
import styles from "./sheet.module.css";

// Long column names (Low_Confidence_Limit) wrap after underscores on phones instead of mid-word.
const breakable = (field: string) => field.split("_").flatMap((part, i, all) => (i < all.length - 1 ? [part + "_", <wbr key={i} />] : [part]));

export type SheetData = NonNullable<FunctionReturnType<typeof api.catalog.familySheet>>;
const DOWNLOAD_ORDER = ["CSV", "GeoJSON", "XLSX", "KML", "ZIP", "App"];

export function SheetBody({ sheet, headingId }: { sheet: SheetData; headingId?: string }) {
  const { family, card, members, grid, sources, fileLabel } = sheet;
  const latest = members[0];
  return (
    <>
      <header className={styles.header}>
        <span className={styles.code}>{family.code}</span>
        <h2 className={styles.name} id={headingId} tabIndex={headingId ? -1 : undefined}>
          {family.name}
        </h2>
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
                  <th scope="row"><code>{breakable(g.field)}</code></th>
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
    </>
  );
}
```

```tsx
// ui/components/SiteNav.tsx
import Link from "next/link";
import styles from "./rundown.module.css";

type Placement = "dock" | "masthead";

export function SiteNav({ placement, current }: { placement: Placement; current: "search" | "how" | null }) {
  const dock = placement === "dock";
  const cls = (active: boolean) => (dock ? (active ? styles.tabActive : styles.tab) : active ? styles.mastTabActive : styles.mastTab);
  return (
    <nav className={dock ? styles.tabBar : styles.mastNav} aria-label={dock ? "Sections" : "Site"}>
      <Link className={cls(current === "search")} href="/" aria-current={current === "search" ? "page" : undefined}>
        SEARCH
      </Link>
      <span className={cls(false)} aria-disabled="true" title="Coming soon">
        ASK
      </span>
      <span className={cls(false)} aria-disabled="true" title="Coming soon">
        SAVED
      </span>
      {!dock && (
        <Link className={cls(current === "how")} href="/how-it-works" aria-current={current === "how" ? "page" : undefined}>
          HOW IT WORKS
        </Link>
      )}
    </nav>
  );
}
```

- [ ] **Step 4: Rewire `DatasetSheet`, `Masthead`, `SearchHome`; delete `TabBar.tsx`**

`Masthead.tsx`:

```tsx
import type { ReactNode } from "react";
import { TodayDate } from "./TodayDate";
import styles from "./rundown.module.css";

export function Masthead({ side, showDate, nav, sideClassName }: { side: ReactNode; showDate: boolean; nav?: ReactNode; sideClassName?: string }) {
  return (
    <header className={styles.masthead}>
      <h1 className={styles.wordmark}>Cream City Almanac</h1>
      <p className={sideClassName ? `${styles.side} ${sideClassName}` : styles.side}>
        {side}
        {showDate && <TodayDate className={styles.sideDate} />}
      </p>
      {nav}
    </header>
  );
}
```

`DatasetSheet.tsx` becomes the page chrome around `SheetBody`:

```tsx
import Link from "next/link";
import { Arrow } from "./Arrow";
import { CreditFooter } from "./CreditFooter";
import { Masthead } from "./Masthead";
import { OpenedMark } from "./OpenedMark";
import { SheetBody, type SheetData } from "./SheetBody";
import { SheetDownloads } from "./SheetDownloads";
import { SiteNav } from "./SiteNav";
import styles from "./sheet.module.css";

export type { SheetData };

export function DatasetSheet({ sheet }: { sheet: SheetData }) {
  return (
    <div className={styles.page}>
      <OpenedMark code={sheet.family.code} />
      <Masthead side="RUNDOWN" showDate={false} nav={<SiteNav placement="masthead" current={null} />} />
      <main>
        <nav className={styles.back}>
          <Link href="/">
            <Arrow direction="left" />
            Rundown
          </Link>
        </nav>
        <SheetBody sheet={sheet} />
      </main>
      <div className={styles.downloadBar}>
        <SheetDownloads sheet={sheet} />
      </div>
      <SiteNav placement="dock" current={null} />
      <CreditFooter />
    </div>
  );
}
```

`SearchHome.tsx`: replace `import { TabBar } from "./TabBar";` with `import { SiteNav } from "./SiteNav";`, pass `nav={<SiteNav placement="masthead" current="search" />}` to `Masthead`, and replace `<TabBar />` in the dock with `<SiteNav placement="dock" current="search" />`. Then `git rm ui/components/TabBar.tsx`.

`rundown.module.css` (append; the masthead nav exists in the DOM everywhere but only shows on laptops, Task 4):

```css
.mastNav {
  display: none;
}

.mastTab,
.mastTabActive {
  font-family: var(--font-caps);
  font-weight: 700;
  font-size: var(--fs-label);
  text-decoration: none;
  color: var(--muted);
  padding-bottom: 6px;
}

.mastTabActive {
  color: var(--ink);
  border-bottom: 4px solid var(--ink);
}
```

- [ ] **Step 5: Run every test**

Run: `npm run e2e && npx vitest run && npm run typecheck`
Expected: all pass, including the new test; no other test changes.

- [ ] **Step 6: Commit**

```bash
git add ui e2e
git commit -m "refactor: split the sheet body from its page and unify site navigation"
```

---

### Task 4: Laptop two-pane behavior

**Files:**
- Create: `ui/components/SheetPane.tsx`, `ui/components/LaptopRedirect.tsx`, `e2e/laptop.spec.ts`
- Modify: `ui/components/SearchHome.tsx`, `ui/components/RundownList.tsx`, `ui/components/ResultRow.tsx`, `ui/components/DatasetSheet.tsx`, `ui/components/rundown.module.css`, `ui/components/sheet.module.css`, `e2e/home.spec.ts`

**Interfaces:**
- Consumes: Task 2 (`LAPTOP_QUERY`, `parseSelection`, `selectionSearch`, `useLaptop`), Task 3 (`SheetBody`, `SheetDownloads`, `SiteNav`), `SEARCH_TIMEOUT_MS`.
- Produces: `SheetPane({ code, focusHeading, onEscape })`; `SHEET_HEADING_ID = "sheet-heading"`; `ResultRow` props `selected?`, `onSelect?(code, viaKeyboard)`, `defaultOpen?`; `RundownList` props `selected?`, `onSelect?`, `expandCode?`.

- [ ] **Step 1: Write the failing tests**

`e2e/laptop.spec.ts`:

```ts
import { expect, test } from "./fixtures";

test.beforeEach(({}, info) => test.skip(info.project.name !== "desktop", "laptop layout only"));

const pane = (page: import("@playwright/test").Page) => page.locator("#sheet-pane");

test("the newest dataset opens in the right pane on arrival", async ({ page }) => {
  await page.goto("/");
  const first = await page.locator("li[data-code]").first().getAttribute("data-code");
  await expect(pane(page)).toContainText(first!);
  await expect(page.getByRole("complementary", { name: /ask: coming soon/i })).toBeVisible();
});

test("clicking a row opens its sheet and puts it in the address", async ({ page }) => {
  await page.goto("/?q=asthma");
  await page.locator("li[data-code='W01'] button").click();
  await expect(pane(page).getByRole("heading", { level: 2, name: /Asthma Prevalence/ })).toBeVisible();
  await expect(page).toHaveURL(/open=W01/);
});

test("Back and refresh restore the selection", async ({ page }) => {
  await page.goto("/?q=asthma");
  await page.locator("li[data-code='W01'] button").click();
  await expect(page).toHaveURL(/open=W01/);
  const other = page.locator("li[data-code]:not([data-code='W01']) button").first();
  await other.click();
  await page.goBack();
  await expect(page).toHaveURL(/open=W01/);
  await expect(pane(page)).toContainText("W01");
  await page.reload();
  await expect(pane(page)).toContainText("W01");
});

test("a sheet address opens the two-pane view with that dataset selected", async ({ page }) => {
  await page.goto("/d/W01");
  await expect(page).toHaveURL(/\?open=W01$/);
  await expect(pane(page)).toContainText("W01");
  await expect(page.locator("li[data-code]").first()).toBeVisible();
});

test("searching opens the top result", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("SLUG:").fill("asthma");
  await expect(pane(page)).toContainText("W01");
});

test("an unknown code shows not-found in the pane and the list still works", async ({ page }) => {
  await page.goto("/?open=Z99");
  await expect(pane(page)).toContainText("No dataset with that code");
  await page.locator("li[data-code] button").first().click();
  await expect(pane(page)).not.toContainText("No dataset with that code");
});

test("Enter opens a row in the pane and moves focus there; Escape comes back", async ({ page }) => {
  await page.goto("/?q=asthma");
  const row = page.locator("li[data-code='W01'] button");
  await row.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#sheet-heading")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(row).toBeFocused();
});

test("switching rows quickly never shows the wrong sheet's preview", async ({ page }) => {
  // Every Hub layer answers 3 s late, so W01's preview would arrive after the switch if anything let it through.
  await page.route(/FeatureServer\/\d+\/query/, async (route) => {
    await new Promise((r) => setTimeout(r, 3000));
    await route.continue();
  });
  await page.goto("/?open=W01");
  await expect(pane(page).getByRole("heading", { level: 2, name: /Asthma/ })).toBeVisible();
  // Any rundown row that isn't W01: nothing about it mentions asthma, so asthma text in the pane can only be W01's late answer.
  const other = page.locator("li[data-code]:not([data-code='W01'])").first();
  const otherCode = await other.getAttribute("data-code");
  await other.locator("button").click();
  await page.waitForTimeout(4500);
  await expect(pane(page)).toContainText(otherCode!);
  await expect(pane(page)).not.toContainText(/asthma/i);
});

test("narrowing the window keeps the chosen row open", async ({ page }) => {
  await page.goto("/?q=asthma");
  await page.locator("li[data-code='W01'] button").click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("li[data-code='W01'] button")).toHaveAttribute("aria-expanded", "true");
});
```

Append to `e2e/home.spec.ts`:

```ts
test("a shared laptop link opens the full sheet on a phone", async ({ page }, info) => {
  test.skip(info.project.name !== "phone");
  // Pick a code that isn't in today's rundown, so the phone has no row to expand.
  await page.goto("/");
  const listed = await page.locator("li[data-code]").evaluateAll((els) => els.map((e) => e.getAttribute("data-code")));
  const code = ["W01", "F02", "H08", "N02", "A04"].find((c) => !listed.includes(c))!;
  await page.goto(`/?open=${code}`);
  await expect(page).toHaveURL(new RegExp(`/d/${code}$`));
});

test("a shared search link with a selection expands that row on a phone", async ({ page }, info) => {
  test.skip(info.project.name !== "phone");
  await page.goto("/?q=asthma&open=W01");
  await expect(page.locator("li[data-code='W01'] button")).toHaveAttribute("aria-expanded", "true");
});
```

**Two existing tests change on the laptop-size run only (spec conflict, ruled).** Spec §8 says existing desktop tests pass unchanged, but spec §5 changes what a click does at 1440px. §5 is the feature, so it wins. The phone half of each test stays byte-for-byte; the desktop half asserts the laptop behavior instead. Ledger this as a ruling.

`e2e/home.spec.ts`, "searching by meaning finds a dataset and opens it in place": replace the line `await expect(row.getByRole("button")).toHaveAttribute("aria-expanded", "true");` (line 26) and anything after it that reads the inline preview with:

```ts
  if (info.project.name === "desktop") {
    await expect(page.locator("#sheet-pane")).toContainText("W01");
    await expect(page).toHaveURL(/open=W01/);
    return;
  }
  await expect(row.getByRole("button")).toHaveAttribute("aria-expanded", "true");
```

(add `info` to the test's parameters: `async ({ page }, info) =>`). Same pattern in `e2e/a11y.spec.ts`, "the search works from the keyboard alone" (line 40): on desktop, assert `#sheet-heading` is focused instead of `aria-expanded`.

`e2e/sheet.spec.ts` runs `/d/…` on desktop, which now redirects to the two-pane view. Leave those tests unchanged; if one turns flaky because it asserts before the redirect lands, add `if (info.project.name === "desktop") await page.waitForURL(/open=/);` after its `goto`, and ledger it.

- [ ] **Step 2: Run them to see them fail**

Run: `npm run e2e -- e2e/laptop.spec.ts e2e/home.spec.ts e2e/a11y.spec.ts`
Expected: the new tests and the two changed desktop halves FAIL (no pane, no `open=` handling); every phone test passes.

- [ ] **Step 3: Write `SheetPane.tsx` and `LaptopRedirect.tsx`**

```tsx
// ui/components/SheetPane.tsx
"use client";
import { useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "@/convex/_generated/api";
import { SEARCH_TIMEOUT_MS } from "@/ui/lib/search";
import { OpenedMark } from "./OpenedMark";
import { SheetBody } from "./SheetBody";
import { SheetDownloads } from "./SheetDownloads";
import styles from "./rundown.module.css";
import sheetStyles from "./sheet.module.css";

export const SHEET_HEADING_ID = "sheet-heading";

export function SheetPane({ code, focusHeading, onEscape }: { code: string; focusHeading: boolean; onEscape: () => void }) {
  const sheet = useQuery(api.catalog.familySheet, { code });
  const [stalled, setStalled] = useState(false);

  useEffect(() => {
    setStalled(false);
    if (sheet !== undefined) return;
    const timer = setTimeout(() => setStalled(true), SEARCH_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [sheet, code]);

  useEffect(() => {
    if (focusHeading && sheet) document.getElementById(SHEET_HEADING_ID)?.focus();
  }, [focusHeading, sheet]);

  const body =
    sheet === undefined ? (
      <p role="status" aria-busy={!stalled}>{stalled ? "Can't reach the catalog. Check your connection and try again." : "Loading…"}</p>
    ) : sheet === null ? (
      <p role="status">No dataset with that code. It may have left DYCU&apos;s Hub.</p>
    ) : (
      <>
        <OpenedMark code={sheet.family.code} />
        {/* key: a new code remounts the sheet, so a slow preview from the previous row can never land here */}
        <SheetBody key={sheet.family.code} sheet={sheet} headingId={SHEET_HEADING_ID} />
        <div className={sheetStyles.paneDownloads}>
          <SheetDownloads sheet={sheet} />
        </div>
      </>
    );

  return (
    <section id="sheet-pane" className={styles.sheetPane} aria-label="Dataset sheet" onKeyDown={(e) => e.key === "Escape" && onEscape()}>
      {body}
    </section>
  );
}
```

```tsx
// ui/components/LaptopRedirect.tsx
"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { LAPTOP_QUERY, selectionSearch } from "@/ui/lib/selection";

// On a laptop, a sheet address opens the two-pane view with that dataset selected.
export function LaptopRedirect({ code }: { code: string }) {
  const router = useRouter();
  useEffect(() => {
    if (window.matchMedia(LAPTOP_QUERY).matches) router.replace(`/${selectionSearch({ q: "", open: code })}`);
  }, [code, router]);
  return null;
}
```

In `DatasetSheet.tsx` add `import { LaptopRedirect } from "./LaptopRedirect";` and render `<LaptopRedirect code={sheet.family.code} />` next to `<OpenedMark …/>`.

- [ ] **Step 4: Selection in rows and list**

`ResultRow.tsx` — the whole file after the change (new: `selected`, `onSelect`, `defaultOpen`; on laptops a click selects instead of expanding):

```tsx
"use client";
import { Fragment, useEffect, useState } from "react";
import type { ResultRow as Row } from "@/convex/lib/types";
import { placeSummary, shortDate, subline, yearShort } from "@/ui/lib/format";
import { FamilyPreview } from "./FamilyPreview";
import { PencilMark } from "./PencilMark";
import { Tick } from "./Tick";
import styles from "./rundown.module.css";

// Segments ("29 neighborhoods", "2022–2024") never split; lines break only between them.
function Parts({ text }: { text: string }) {
  return text.split(" · ").map((part, i) => (
    <Fragment key={part}>
      {i > 0 && " · "}
      <span className={styles.nowrap}>{part}</span>
    </Fragment>
  ));
}

export function ResultRow({
  row,
  mode,
  circled,
  opened,
  selected = false,
  onSelect,
  defaultOpen = false,
}: {
  row: Row;
  mode: "rundown" | "results";
  circled: boolean;
  opened: boolean;
  selected?: boolean;
  onSelect?: (code: string, viaKeyboard: boolean) => void;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  useEffect(() => {
    if (defaultOpen) setOpen(true);
  }, [defaultOpen]);
  const panelId = `preview-${row.code}`;
  const marked = onSelect ? selected : open;
  const sub = subline(row);
  const place = placeSummary(row.kind, row.places);
  return (
    <li className={styles.row} data-code={row.code}>
      <button
        type="button"
        className={styles.rowHead}
        aria-expanded={onSelect ? undefined : open}
        aria-controls={onSelect ? "sheet-pane" : panelId}
        aria-current={onSelect && selected ? "true" : undefined}
        onClick={(e) => (onSelect ? onSelect(row.code, e.detail === 0) : setOpen((o) => !o))}
      >
        <span className={styles.code}>
          {marked && <img className={styles.openArrow} src="/plates/pencil-arrow.png" alt="" aria-hidden="true" width={216} height={197} />}
          {row.code}
        </span>
        {mode === "results" ? (
          <>
            <span className={styles.slug}>
              <span className={styles.name}>{row.name}</span>
            </span>
            <span className={styles.right}>
              {place && <span className={styles.place}>{place}</span>}
              <span className={styles.years}>{yearShort(row.years)}</span>
              {opened && <Tick />}
            </span>
          </>
        ) : (
          <>
            <span className={styles.slug}>
              <span className={styles.name}>{sub ? `${row.name} —` : row.name}</span>
              {sub && (
                <span className={styles.sub}>
                  <Parts text={sub} />
                </span>
              )}
            </span>
            <span className={styles.right}>
              <span className={styles.when}>
                {shortDate(row.latestModified)}
                {circled && <PencilMark />}
              </span>
              {opened && <Tick />}
            </span>
          </>
        )}
      </button>
      {!onSelect && open && <FamilyPreview id={panelId} familyKey={row.key} />}
    </li>
  );
}
```

`RundownList.tsx`: add props `selected?: string | null; onSelect?: (code: string, viaKeyboard: boolean) => void; expandCode?: string | null` and pass to each row `selected={row.code === selected} onSelect={onSelect} defaultOpen={row.code === expandCode}`.

`rundown.module.css`: make the open-row name styles also apply to the selected row by extending both selectors: `.rowHead[aria-expanded="true"] .name, .rowHead[aria-current="true"] .name { … }` and the same for `::after` and the results variant.

- [ ] **Step 5: Selection in `SearchHome.tsx`**

Replace the component body with:

```tsx
"use client";
import { useAction } from "convex/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { ResultRow, SearchResponse } from "@/convex/lib/types";
import { circledCodes, LAST_VISIT_KEY, OPENED_KEY, readOpened, safeStorage } from "@/ui/lib/marks";
import { SEARCH_TIMEOUT_MS, searchNotice, withTimeout, type SearchState } from "@/ui/lib/search";
import { LAPTOP_QUERY, parseSelection, selectionSearch } from "@/ui/lib/selection";
import { useLaptop } from "@/ui/lib/useLaptop";
import { CatalogLine, type CatalogStatus } from "./CatalogLine";
import { CreditFooter } from "./CreditFooter";
import { Masthead } from "./Masthead";
import { RundownList } from "./RundownList";
import { SheetPane } from "./SheetPane";
import { SiteNav } from "./SiteNav";
import { SlugBar } from "./SlugBar";
import styles from "./rundown.module.css";

const DEBOUNCE_MS = 350;
const LOADING_ROWS = 5;

export function SearchHome({ rundown, status }: { rundown: ResultRow[]; status: CatalogStatus }) {
  const search = useAction(api.search.searchCatalog);
  const router = useRouter();
  const laptop = useLaptop();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null); // an explicit choice, from a click or the address
  const [focusPane, setFocusPane] = useState(false);
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const [state, setState] = useState<SearchState>("idle");
  const [marks, setMarks] = useState({ circled: new Set<string>(), opened: new Set<string>() });
  const requestId = useRef(0);

  // The address is the source of truth on load and on Back / Forward.
  useEffect(() => {
    const restore = () => {
      const s = parseSelection(window.location.search);
      setQuery(s.q);
      setOpen(s.open);
    };
    restore();
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);

  useEffect(() => {
    const store = safeStorage();
    setMarks({ circled: circledCodes(rundown, store.get(LAST_VISIT_KEY)), opened: readOpened(store.get(OPENED_KEY)) });
    const save = () => store.set(LAST_VISIT_KEY, new Date().toISOString());
    window.addEventListener("pagehide", save);
    return () => window.removeEventListener("pagehide", save);
  }, [rundown]);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      requestId.current++;
      setResponse(null);
      setState("idle");
      return;
    }
    const id = ++requestId.current;
    setState("loading");
    const timer = setTimeout(() => {
      withTimeout(search({ query: q }), SEARCH_TIMEOUT_MS)
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
  const rows = searching ? response?.results ?? [] : rundown;
  const selected = open ?? (laptop ? rows[0]?.code ?? null : null);

  const onQueryChange = (value: string) => {
    setQuery(value);
    setOpen(null);
    window.history.replaceState(null, "", `${window.location.pathname}${selectionSearch({ q: value, open: null })}`);
  };

  const select = useCallback(
    (code: string, viaKeyboard: boolean) => {
      setOpen(code);
      setFocusPane(viaKeyboard);
      window.history.pushState(null, "", `${window.location.pathname}${selectionSearch({ q: query, open: code })}`);
    },
    [query],
  );

  // Phones: a laptop link to an item that isn't in this list opens that item's full sheet page.
  useEffect(() => {
    if (!open || window.matchMedia(LAPTOP_QUERY).matches) return;
    if (searching && !response) return;
    if (!rows.some((r) => r.code === open)) router.replace(`/d/${open}`);
  }, [open, rows, searching, response, router]);

  const backToRow = () => document.querySelector<HTMLButtonElement>(`li[data-code="${selected}"] button`)?.focus();
  const notice = searchNotice(state, response);
  const listProps = { selected, onSelect: laptop ? select : undefined, expandCode: laptop ? null : open };

  return (
    <div className={styles.page}>
      <Masthead
        side={
          searching ? (
            <>
              RUNDOWN <span className={styles.sideCount}>· {response?.results.length ?? 0} results</span>
            </>
          ) : (
            "TODAY'S RUNDOWN"
          )
        }
        showDate={!searching}
        sideClassName={searching ? undefined : styles.sideRundown}
        nav={<SiteNav placement="masthead" current="search" />}
      />
      <div className={styles.split}>
        <main className={styles.main}>
          {!searching && <CatalogLine status={status} />}
          <SlugBar value={query} onChange={onQueryChange} showTags={!searching} />
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
                <RundownList mode="results" rows={response.results} circled={new Set()} opened={marks.opened} {...listProps} />
              )
            )
          ) : (
            <RundownList title="UPDATED THIS SEASON" mode="rundown" rows={rundown} circled={marks.circled} opened={marks.opened} {...listProps} />
          )}
        </main>
        {laptop && selected && <SheetPane code={selected} focusHeading={focusPane} onEscape={backToRow} />}
        <aside className={styles.askRail} aria-label="Ask: coming soon">
          <span className={styles.askRailLabel}>ASK</span>
          <span>coming soon</span>
        </aside>
      </div>
      <div className={styles.dock}>
        <SiteNav placement="dock" current="search" />
        <CreditFooter />
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Laptop layout CSS** (append to `rundown.module.css`; sizes are first-pass values the Task 5 gate tunes)

```css
.split {
  display: block;
}

.askRail {
  display: none;
}

/* Keep this media query identical to LAPTOP_QUERY in ui/lib/selection.ts. */
@media (min-width: 1100px) and (orientation: landscape) {
  .page {
    max-width: none;
    --fs-wordmark: clamp(48px, 5vw, 80px);
    --fs-code: clamp(20px, 1.7vw, 28px);
    --fs-heading: clamp(22px, 2vw, 32px);
    --fs-body: clamp(15px, 1.2vw, 19px);
    --fs-small: clamp(13px, 1vw, 15px);
    --fs-label: clamp(14px, 1.1vw, 17px);
    --row-h: 72px;
  }

  .masthead {
    align-items: flex-end;
  }

  .sideRundown,
  .tabBar {
    display: none;
  }

  .mastNav {
    display: flex;
    gap: clamp(16px, 2vw, 32px);
    align-items: flex-end;
  }

  .split {
    display: grid;
    grid-template-columns: minmax(0, 2fr) minmax(0, 3fr) 72px;
    align-items: start;
  }

  .main {
    padding-right: var(--gutter);
  }

  .sheetPane {
    position: sticky;
    top: 0;
    max-height: 100vh;
    overflow-y: auto;
    padding: 0 var(--gutter);
    border-left: var(--hair);
  }

  .askRail {
    display: flex;
    flex-direction: column;
    gap: 4px;
    align-self: stretch;
    padding: 16px 8px;
    border-left: var(--hair);
    color: var(--muted);
    font-size: var(--fs-small);
  }

  .askRailLabel {
    font-family: var(--font-caps);
    font-weight: 700;
    font-size: var(--fs-label);
  }
}
```

`sheet.module.css` (append):

```css
.paneDownloads {
  display: flex;
  gap: 12px;
  padding: 16px 0;
  border-top: var(--rule);
}
```

- [ ] **Step 7: Run every test**

Run: `npm run e2e && npx vitest run && npm run typecheck && npm run build`
Expected: all pass, including the 9 laptop tests and 2 phone tests. If a desktop test in `e2e/home.spec.ts` or `e2e/sheet.spec.ts` now reads the pane instead of a full page, keep its assertion and only scope the locator to `#sheet-pane`; ledger that as a ruling.

- [ ] **Step 8: Commit**

```bash
git add ui e2e
git commit -m "feat: laptop two-pane layout with selection in the address"
```

---

### Task 5: Impeccable build of the laptop two-pane surface

**Files:**
- Create: `.impeccable/build/archive/phase-2-home/` (copy of the Phase 2 build record), new `.impeccable/build/*` for this surface, `.impeccable/surfaces/app-page-tsx-laptop.md`
- Modify: `ui/components/rundown.module.css` and `ui/components/sheet.module.css` (as the gates direct), `e2e/capture.spec.ts`

**Interfaces:**
- Consumes: Task 4's layout; approved comp `.impeccable/mocks/laptop-b.webp`.
- Produces: `.impeccable/review/laptop-repro.png`; laptop build-phase closed through responsive.

- [ ] **Step 1: Archive Phase 2's build record and start this surface**

```bash
I=/Users/tarikmoody/.claude/skills/impeccable/scripts/impeccable
mkdir -p .impeccable/build/archive/phase-2-home
cp -R .impeccable/build/state.json .impeccable/build/spec.json .impeccable/build/regions.json .impeccable/build/scaffold .impeccable/build/crops .impeccable/build/font-match .impeccable/build/comp-grid.png .impeccable/build/archive/phase-2-home/
$I build-phase start --comp .impeccable/mocks/laptop-b.webp --breakpoint 1536x1024
$I build-phase status
```

Expected: a new build at phase `comps` with `laptop-b.webp` as the comp. Follow each `NEXT` line the tool prints; advance `comps` (the comp is approved in its sidecar).

- [ ] **Step 2: Spec the comp**

```bash
$I comp-spec --comp .impeccable/mocks/laptop-b.webp --grid
```

Open `.impeccable/build/comp-grid.png`. Write `.impeccable/build/regions.json` naming every salient region by grid span, with a `note` saying what the comp shows: `wordmark`, `masthead-nav`, `catalog-line`, `explainer-band` (comp shows it; Task 6 builds it), `slug`, `tags`, `section-head`, `row-v02`, `row-s01`, `row-a04`, `pencil-circle` (kind `plate`), `pencil-arrow` (kind `plate`), `sheet-header`, `place-year-grid`, `what-it-measures`, `column-guide`, `live-preview`, `pane-downloads`, `ask-rail`. Then:

```bash
$I comp-spec --comp .impeccable/mocks/laptop-b.webp --regions .impeccable/build/regions.json
$I font-match --measure sheet-header
$I font-match --measure row-v02
$I build-phase advance
```

Expected: `ADVANCED spec -> plates`. Font sizes measured here replace the first-pass laptop tokens in Task 4's CSS.

- [ ] **Step 3: Plates (reuse the existing ones)**

Point both plate regions at the existing files (`public/plates/pencil-mark.png`, `public/plates/pencil-arrow.png`); then `$I build-phase advance`. If the plates gate refuses reused files and asks for region plates, stop and ask Tarik before generating (each is one image, about $0.15–0.20); with his OK, generate per `visualize.md` from the region crop and embed provenance.

- [ ] **Step 4: Capture and pass the hero gate**

Append to `e2e/capture.spec.ts` inside the `@capture` describe:

```ts
  test("laptop two-pane at the comp's size", async ({ page }) => {
    await page.clock.setFixedTime(FIXED);
    await page.setViewportSize({ width: 1536, height: 1024 });
    await page.goto("/");
    await page.locator("#sheet-pane h2").waitFor();
    await settle(page);
    await page.screenshot({ path: ".impeccable/review/laptop-repro.png" });
  });
```

```bash
npm run capture -- e2e/capture.spec.ts -g "laptop two-pane"
$I build-phase record hero --build .impeccable/review/laptop-repro.png
$I build-phase advance
```

Expected: `ADVANCED hero -> sections` at ≥72% with no vetoes. On a miss, open the crops it names under `.impeccable/review/diff/hero/`, fix those regions' CSS from their measured boxes, recapture, and record again. Mockup content (invented column names, grid years) is not a fidelity target: live data wins (spec §9).

- [ ] **Step 5: Sections, motion, responsive**

Sections: check the pane's sheet, the Ask rail and the masthead nav against `DESIGN.md` (no shadows, radii, cards; red only as marks), then `$I build-phase advance`. Motion: no new motion (the pencil draw-on already exists); `$I build-phase advance`. Responsive: capture at 1280×800 and 1440×900 as well as 1536×1024; nothing overflows and the pane stays readable; `$I build-phase advance`.

- [ ] **Step 6: Commit**

```bash
git add ui e2e .impeccable
git commit -m "feat: build the laptop two-pane layout to its approved comp"
```

---

### Task 6: Home explainer band

**Files:**
- Create: `ui/components/ExplainerBand.tsx`
- Modify: `ui/components/SearchHome.tsx`, `ui/components/CreditFooter.tsx`, `ui/components/rundown.module.css`, `e2e/home.spec.ts`

**Interfaces:**
- Consumes: `Arrow`.
- Produces: `ExplainerBand()`; `CreditFooter` now carries a "How it works" link.

- [ ] **Step 1: Write the failing test** (append to `e2e/home.spec.ts`)

The spec's example copy ("Milwaukee's public data, searchable in plain English.") is about 470px wide at the phone's 14px small text; a 390px phone has 358px. The band uses the shorter line below, and the test proves it stays on one line.

```ts
const BAND = "Milwaukee data in plain English.";

test("the home page explains itself in one line and links to How it works", async ({ page }) => {
  await page.goto("/");
  const band = page.getByText(BAND);
  await expect(band).toBeVisible();
  // One line: the band's height is no more than one line of its own text plus its padding.
  const lines = await band.evaluate((el) => {
    const cs = getComputedStyle(el);
    const pad = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    return Math.round((el.clientHeight - pad) / parseFloat(cs.lineHeight));
  });
  expect(lines).toBe(1);
  await expect(page.getByRole("link", { name: "How it works" }).first()).toHaveAttribute("href", "/how-it-works");
  await page.getByLabel("SLUG:").fill("asthma");
  await expect(band).toBeHidden();
});

test("every page's footer links to How it works", async ({ page }) => {
  await page.goto("/d/W01");
  await expect(page.getByRole("contentinfo").getByRole("link", { name: "How it works" })).toHaveAttribute("href", "/how-it-works");
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm run e2e -- e2e/home.spec.ts -g "explains itself|footer links"`
Expected: FAIL — text and link not found.

- [ ] **Step 3: Implement**

```tsx
// ui/components/ExplainerBand.tsx
import Link from "next/link";
import { Arrow } from "./Arrow";
import styles from "./rundown.module.css";

export function ExplainerBand() {
  return (
    <p className={styles.band}>
      Milwaukee data in plain English.{" "}
      <Link href="/how-it-works">
        How it works
        <Arrow />
      </Link>
    </p>
  );
}
```

`ui/components/CreditFooter.tsx` (spec §2: linked from the footer):

```tsx
import Link from "next/link";
import styles from "./rundown.module.css";

export function CreditFooter() {
  return (
    <footer className={styles.footer}>
      <a href="https://datayoucanuse.org">Built on Data You Can Use&apos;s public data</a>
      {" · "}
      <Link href="/how-it-works">How it works</Link>
    </footer>
  );
}
```

If the one-line test still fails on the phone run, cut the band to "Plain-English public data." and ledger the ruling; never let it wrap.

In `SearchHome.tsx`, render `{!searching && <ExplainerBand />}` directly after `{!searching && <CatalogLine status={status} />}`.

```css
/* rundown.module.css */
.band {
  margin: 0;
  padding: clamp(8px, 1.6vw, 14px) 0;
  border-bottom: var(--hair);
  font-size: var(--fs-small);
  line-height: 1.3;
}

.band a {
  white-space: nowrap;
}
```

- [ ] **Step 4: Run all e2e; recapture the phone hero; check it still passes**

```bash
npm run e2e
npm run capture -- e2e/capture.spec.ts -g "hero at the comp's size"
I=/Users/tarikmoody/.claude/skills/impeccable/scripts/impeccable
$I comp-diff --comp .impeccable/mocks/home-b.webp --build .impeccable/review/hero-repro.png --spec .impeccable/build/archive/phase-2-home/spec.json --out-dir .impeccable/review/diff/phone-band
```

Expected: all pass; the phone comparison stays above 72% overall (the band adds one line above the search).

- [ ] **Step 5: Commit**

```bash
git add ui e2e
git commit -m "feat: one-line explainer band on the home page"
```

---

### Task 7: Impeccable spec and plates for the How it works page

**Files:**
- Create: `.impeccable/build/archive/laptop-two-pane/` (Task 5's record), new `.impeccable/build/*` for this surface, `.impeccable/surfaces/how-it-works.md`

**Interfaces:**
- Consumes: approved comps `how-laptop.webp`, `how-phone.webp`.
- Produces: measured regions and the handwriting face for notes (`font-match` USE line), used by Task 8.

- [ ] **Step 1: Archive and start**

```bash
I=/Users/tarikmoody/.claude/skills/impeccable/scripts/impeccable
mkdir -p .impeccable/build/archive/laptop-two-pane
cp -R .impeccable/build/state.json .impeccable/build/spec.json .impeccable/build/regions.json .impeccable/build/scaffold .impeccable/build/crops .impeccable/build/font-match .impeccable/build/comp-grid.png .impeccable/build/archive/laptop-two-pane/
$I build-phase start --comp .impeccable/mocks/how-laptop.webp --breakpoint 1536x1024
$I build-phase advance
```

- [ ] **Step 2: Spec**

```bash
$I comp-spec --comp .impeccable/mocks/how-laptop.webp --grid
```

Name regions in `.impeccable/build/regions.json`: `wordmark`, `masthead-nav`, `headline`, `lede`, `sheet-header`, `place-year-grid`, `explainer`, `column-guide`, `live-preview`, `sheet-actions`, `note-grid`, `note-source`, `note-preview`, `note-download` (kind `text`, each with its note's words), `note-arrows` (kind `plate`, the four red arrows), `section-heads`.

```bash
$I comp-spec --comp .impeccable/mocks/how-laptop.webp --regions .impeccable/build/regions.json
$I font-match --measure headline
$I font-match --rank note-grid --text "every year & place DYCU publishes" --category handwriting
$I build-phase advance
```

Expected: `ADVANCED spec -> plates`. Record the note face from the `USE` line (for example `font-family: 'Caveat'; font-weight: 600;`). Task 8 loads that family.

- [ ] **Step 3: Plates**

Arrows reuse `public/plates/pencil-arrow.png`, rotated per note in CSS. `$I build-phase advance`. If the gate requires dedicated arrow plates, stop and ask Tarik before generating (budget: up to 4 images).

- [ ] **Step 4: Commit**

```bash
git add .impeccable
git commit -m "design: spec the How it works page from its approved comp"
```

---

### Task 8: The How it works page

**Files:**
- Create: `app/how-it-works/page.tsx`, `ui/components/HowItWorks.tsx`, `ui/components/AnnotatedSheet.tsx`, `ui/components/PencilNote.tsx`, `ui/components/how.module.css`, `e2e/how.spec.ts`
- Modify: `ui/components/LivePreview.tsx` (`chartOnly`), `app/layout.tsx` (note font), `app/globals.css` (`--font-note`), `e2e/capture.spec.ts`

**Interfaces:**
- Consumes: Task 1 (`pdfReports`), Task 2 (`countsLine`, `pdfReportsPhrase`, `asOfPhrase`), Task 3 (`SiteNav`, `SheetData`, `Masthead`), `PlaceYearGrid`, `ProvenanceTag`, `shortExplainer`, `LivePreview`.
- Produces: route `/how-it-works`; `HowItWorks({ status, example })`; `AnnotatedSheet({ sheet })`; `PencilNote({ side, children })`; `LivePreview` prop `chartOnly?: boolean`.

- [ ] **Step 1: Write the failing tests** (`e2e/how.spec.ts`)

```ts
import { expect, test } from "./fixtures";

const NOTES = ["every year & place DYCU publishes", "who wrote this", "live rows from DYCU's Hub", "download the real data"];
const SECTIONS = ["WHERE THE DATA COMES FROM", "EACH WEEK", "WHAT THE AI DOES", "HOW SEARCH WORKS", "HOW IT'S BUILT", "LIMITS AND CREDITS"];

test("How it works explains the product with live numbers", async ({ page }) => {
  await page.goto("/how-it-works");
  await expect(page).toHaveTitle(/How it works/);
  await expect(page.getByRole("heading", { level: 2, name: /how to read a dataset in 60 seconds/i })).toBeVisible();
  await expect(page.getByText(/\d+ raw data · \d+ reports · \d+ visualizations/).first()).toBeVisible();
  await expect(page.getByRole("figure", { name: /how to read W01/i })).toBeVisible();
  for (const note of NOTES) await expect(page.getByText(note).first()).toBeVisible();
  for (const name of SECTIONS) await expect(page.getByRole("heading", { name })).toBeVisible();
  await expect(page.getByText(/read the \d+ report PDFs/i)).toBeVisible();
  await expect(page.getByText(/unofficial, phone-first way to find, understand and download/i)).toBeVisible();
});

test("its links go where they say", async ({ page }) => {
  await page.goto("/how-it-works");
  await expect(page.getByRole("link", { name: "the decision log" })).toHaveAttribute(
    "href",
    "https://github.com/tmoody1973/cream-city-almanac/tree/main/docs/decisions",
  );
  await expect(page.getByRole("link", { name: "Tarik Moody" })).toHaveAttribute("href", "https://github.com/tmoody1973");
  await expect(page.getByRole("link", { name: "hub@datayoucanuse.org" })).toHaveAttribute("href", "mailto:hub@datayoucanuse.org");
  await page.getByRole("link", { name: "kids who can't afford food" }).click();
  await expect(page.locator("li[data-code='F02']")).toBeVisible();
});

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });
  test("the explanation still reads", async ({ page }) => {
    await page.goto("/how-it-works");
    await expect(page.getByRole("heading", { level: 2, name: /how to read a dataset/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: "EACH WEEK" })).toBeVisible();
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm run e2e -- e2e/how.spec.ts --project=desktop`
Expected: FAIL — 404.

- [ ] **Step 3: Note font and LivePreview `chartOnly`**

`app/layout.tsx`: import the family from Task 7's `USE` line (example below uses Caveat; use the font-match result if different) and add its variable to `<html>`:

```tsx
import { Caveat, Saira, Saira_Extra_Condensed, Vazirmatn } from "next/font/google";
const note = Caveat({ subsets: ["latin"], weight: ["600"], variable: "--font-caveat", display: "swap" });
// …
<html lang="en" className={`${wordmark.variable} ${caps.variable} ${body.variable} ${note.variable}`}>
```

`app/globals.css` (in `:root`): `--font-note: var(--font-caveat), "Comic Sans MS", cursive;`

`LivePreview.tsx`: add `chartOnly = false` to the props (`{ members, fields, chartOnly = false }: { members: Member[]; fields: string[]; chartOnly?: boolean }`). In the success return (about line 59), wrap the existing `<div className={styles.scroll} …>` element (the rows table, lines 61–72) in `{!chartOnly && ( … )}`, leaving it otherwise untouched, so the return reads:

```tsx
  return (
    <>
      {!chartOnly && (
        <div className={styles.scroll} tabIndex={0} role="region" aria-label="First rows, scroll sideways for more columns">
          {/* unchanged: <table className={styles.rowsTable} aria-label="First rows from the Hub"> … </table> */}
        </div>
      )}
      {headline && series && scale && <StripChart field={headline} series={series} scale={scale} />}
    </>
  );
```

- [ ] **Step 4: Write `PencilNote.tsx`, `AnnotatedSheet.tsx`, `HowItWorks.tsx`, the route, and CSS**

```tsx
// ui/components/PencilNote.tsx
import type { ReactNode } from "react";
import styles from "./how.module.css";

// A grease-pencil teaching note. Real text (readable, translatable); the arrow is the shared pencil plate.
export function PencilNote({ side, children }: { side: "left" | "right"; children: ReactNode }) {
  return (
    <p className={styles.note} data-side={side}>
      <span>{children}</span>
      <img className={styles.noteArrow} src="/plates/pencil-arrow.png" alt="" aria-hidden="true" width={216} height={197} />
    </p>
  );
}
```

```tsx
// ui/components/AnnotatedSheet.tsx
import Link from "next/link";
import { shortExplainer } from "@/ui/lib/format";
import { LivePreview } from "./LivePreview";
import { PencilNote } from "./PencilNote";
import { PlaceYearGrid } from "./PlaceYearGrid";
import { ProvenanceTag } from "./ProvenanceTag";
import type { SheetData } from "./SheetBody";
import styles from "./how.module.css";

const GUIDE_ROWS = 2;

export function AnnotatedSheet({ sheet }: { sheet: SheetData }) {
  const { family, card, members, grid } = sheet;
  const guide = card?.glossary.slice(0, GUIDE_ROWS) ?? [];
  const csv = members.find((m) => m.downloads.CSV)?.downloads.CSV;
  return (
    <figure className={styles.annotated} aria-label={`Example: how to read ${family.code} ${family.name}`}>
      <div className={styles.sheetHead}>
        <span className={styles.code}>{family.code}</span>
        <span className={styles.name}>{family.name}</span>
      </div>
      <div className={styles.part}>
        <PencilNote side="left">every year &amp; place DYCU publishes</PencilNote>
        <PencilNote side="right">who wrote this: DYCU, the Hub, the source, or AI</PencilNote>
        <div className={styles.gridRow}>
          <PlaceYearGrid grid={grid} />
          <p className={styles.explainer}>
            {shortExplainer(card?.explainer ?? family.name)} {card && <ProvenanceTag source={card.explainerProvenance} />}
          </p>
        </div>
      </div>
      {guide.length > 0 && (
        <table className={styles.guide} aria-label="Column guide, first rows">
          <caption className={styles.partHead}>COLUMN GUIDE</caption>
          <tbody>
            {guide.map((g) => (
              <tr key={g.field}>
                <th scope="row"><code>{g.field}</code></th>
                <td>{g.meaning} <ProvenanceTag source={g.provenance} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className={styles.part}>
        <PencilNote side="left">live rows from DYCU&apos;s Hub</PencilNote>
        <p className={styles.partHead}>LIVE PREVIEW</p>
        <LivePreview members={members} fields={card?.glossary.map((g) => g.field) ?? []} chartOnly />
      </div>
      <div className={styles.part}>
        <PencilNote side="left">download the real data</PencilNote>
        <div className={styles.actions}>
          {csv && <a className={styles.button} href={csv}>CSV</a>}
          <Link className={styles.button} href={`/d/${family.code}`}>OPEN SHEET</Link>
        </div>
      </div>
    </figure>
  );
}
```

```tsx
// ui/components/HowItWorks.tsx
import Link from "next/link";
import { asOfPhrase, countsLine, pdfReportsPhrase } from "@/ui/lib/how";
import { AnnotatedSheet } from "./AnnotatedSheet";
import type { CatalogStatus } from "./CatalogLine";
import { CreditFooter } from "./CreditFooter";
import { Masthead } from "./Masthead";
import { ProvenanceTag } from "./ProvenanceTag";
import type { SheetData } from "./SheetBody";
import { SiteNav } from "./SiteNav";
import styles from "./how.module.css";

const DECISION_LOG = "https://github.com/tmoody1973/cream-city-almanac/tree/main/docs/decisions";
const AUTHOR = "https://github.com/tmoody1973";
const EXAMPLE_QUERY = "kids who can't afford food";

export function HowItWorks({ status, example }: { status: CatalogStatus | null; example: SheetData | null }) {
  const counts = countsLine(status);
  const asOf = asOfPhrase(status);
  return (
    <div className={styles.page}>
      <Masthead side="HOW IT WORKS" showDate={false} nav={<SiteNav placement="masthead" current="how" />} />
      <main className={styles.main}>
        <h2 className={styles.headline}>How to read a dataset in 60 seconds</h2>
        <p className={styles.lede}>
          An unofficial, phone-first way to find, understand and download Milwaukee&apos;s public data from Data You Can Use.
          Search in your own words; every fact shows where it came from.
        </p>
        {example && <AnnotatedSheet sheet={example} />}

        <section className={styles.section}>
          <h3 className={styles.heading}>WHERE THE DATA COMES FROM</h3>
          <p>
            DYCU&apos;s ArcGIS Hub, the public website where Data You Can Use publishes its data
            {counts ? `: ${counts}, in the Hub's own words.` : "."}
          </p>
          <p>Refreshed weekly and never altered. Downloads come straight from the Hub.</p>
        </section>

        <section className={styles.section}>
          <h3 className={styles.heading}>EACH WEEK</h3>
          <ol className={styles.steps}>
            <li>Read DYCU&apos;s Hub catalog and its inventory sheet.</li>
            <li>Group the yearly and geographic versions of each measure into one family with a permanent code, like F02.</li>
            <li>Read {pdfReportsPhrase(status)} so search can match the text inside them.</li>
            <li>Ask AI (Claude) to write each family&apos;s plain-English explainer, column guide, caveats and story angles. DYCU&apos;s own definitions always win.</li>
            <li>Index everything for search by meaning and by exact words.</li>
          </ol>
          <p>A failed week never replaces the live catalog.{asOf ? ` Data as of ${asOf}.` : ""}</p>
        </section>

        <section className={styles.section}>
          <h3 className={styles.heading}>WHAT THE AI DOES</h3>
          <p>Every fact carries a tag saying who wrote it:</p>
          <ul className={styles.tags}>
            <li><ProvenanceTag source="DYCU" /> DYCU&apos;s own definition, from its inventory sheet.</li>
            <li><ProvenanceTag source="HUB" /> From DYCU&apos;s Hub listing.</li>
            <li><ProvenanceTag source="SOURCE_SITE" /> From the source agency&apos;s own website.</li>
            <li><ProvenanceTag source="AI" /> Written by AI from the facts above, and always labeled.</li>
          </ul>
          <p>Numbers on a sheet come from the Hub&apos;s data, never from the AI.</p>
        </section>

        <section className={styles.section}>
          <h3 className={styles.heading}>HOW SEARCH WORKS</h3>
          <p>
            Type what you&apos;re reporting on, in your own words. Search matches meaning (text that means something similar) and
            exact words, then ranks what agrees. Try{" "}
            <Link href={`/?q=${encodeURIComponent(EXAMPLE_QUERY)}`}>{EXAMPLE_QUERY}</Link>: it finds Food Insecurity Prevalence.
          </p>
          <p>When nothing is close, it says so instead of listing unrelated data.</p>
        </section>

        <section className={styles.section}>
          <h3 className={styles.heading}>HOW IT&apos;S BUILT</h3>
          <p>
            Next.js on Vercel; Convex for the database, search and the weekly job; Claude through the Vercel AI Gateway; Firecrawl
            to read PDFs. A weekly automated check grades search on 26 reporter-style questions. Every trade-off is in{" "}
            <a href={DECISION_LOG}>the decision log</a>.
          </p>
        </section>

        <section className={styles.section}>
          <h3 className={styles.heading}>LIMITS AND CREDITS</h3>
          <p>Unofficial; not affiliated with Data You Can Use.{asOf ? ` Data as of ${asOf}.` : ""}</p>
          <p>
            Questions about the data itself go to DYCU: <a href="mailto:hub@datayoucanuse.org">hub@datayoucanuse.org</a>.
          </p>
          <p>
            Built by <a href={AUTHOR}>Tarik Moody</a>.
          </p>
        </section>
      </main>
      <SiteNav placement="dock" current={null} />
      <CreditFooter />
    </div>
  );
}
```

```tsx
// app/how-it-works/page.tsx
import { fetchQuery } from "convex/nextjs";
import type { Metadata } from "next";
import { api } from "@/convex/_generated/api";
import { HowItWorks } from "@/ui/components/HowItWorks";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "How it works — Cream City Almanac",
  description: "How Cream City Almanac finds, explains and links Milwaukee's public data from Data You Can Use, in plain English.",
};

const EXAMPLE_CODE = "W01";

export default async function HowItWorksPage() {
  // The explanation must render even when the catalog can't be reached; it then omits the numbers.
  const [status, example] = await Promise.all([
    fetchQuery(api.search.catalogStatus, {}).catch(() => null),
    fetchQuery(api.catalog.familySheet, { code: EXAMPLE_CODE }).catch(() => null),
  ]);
  return <HowItWorks status={status} example={example} />;
}
```

`ui/components/how.module.css` (first pass; Task 8's gate tunes it). Phones: notes sit above the part they explain. Laptops: notes move into the margins beside the sheet.

```css
.page { max-width: min(1280px, 100%); margin: 0 auto; padding-inline: var(--gutter); }
.main { padding-bottom: 32px; }
.headline { margin: clamp(16px, 3vw, 36px) 0 8px; font-family: var(--font-caps); font-weight: 700; font-size: var(--fs-heading); line-height: 1; text-transform: uppercase; }
.lede { margin: 0 0 clamp(16px, 3vw, 32px); }
.annotated { position: relative; margin: 0 auto; max-width: 760px; border-top: var(--rule); }
.sheetHead { display: flex; gap: 24px; align-items: baseline; padding: 12px 8px; background: var(--band); border-bottom: var(--rule); }
.code { font-family: var(--font-caps); font-weight: 700; font-size: var(--fs-code); }
.name { font-family: var(--font-caps); font-weight: 700; font-size: var(--fs-label); }
.part { position: relative; padding: 12px 0; border-bottom: var(--hair); }
.partHead { margin: 0 0 8px; padding: 6px 8px; background: var(--band); font-family: var(--font-caps); font-weight: 700; font-size: var(--fs-label); text-align: left; }
.gridRow { display: flex; flex-wrap: wrap; gap: 16px 24px; align-items: flex-start; }
.explainer { flex: 1 1 16ch; margin: 0; }
.guide { width: 100%; border-collapse: collapse; }
.guide th, .guide td { padding: 8px; border-top: var(--hair); text-align: left; vertical-align: top; }
.actions { display: flex; gap: 12px; }
.button { display: inline-flex; align-items: center; min-height: 44px; padding: 0 clamp(14px, 3vw, 28px); border: var(--rule); font-family: var(--font-caps); font-weight: 700; font-size: var(--fs-label); text-decoration: none; }
.note { margin: 0 0 6px; color: var(--pencil); font-family: var(--font-note); font-size: clamp(18px, 2vw, 26px); line-height: 1.1; display: flex; align-items: flex-end; gap: 6px; }
.noteArrow { width: 28px; height: auto; transform: rotate(60deg); }
.section { padding: clamp(16px, 3vw, 28px) 0; border-top: var(--hair); }
.heading { margin: 0 0 12px; font-family: var(--font-caps); font-weight: 700; font-size: var(--fs-label); }
.steps { margin: 0; padding-left: 1.4em; }
.tags { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }

/* Keep identical to LAPTOP_QUERY. */
@media (min-width: 1100px) and (orientation: landscape) {
  /* Leave 260px of margin each side so the 220px notes never fall off-screen between 1100 and 1300px. */
  .annotated { max-width: min(760px, calc(100% - 520px)); }
  .note { position: absolute; top: 12px; width: 220px; }
  .note[data-side="left"] { right: calc(100% + 24px); flex-direction: row; }
  .note[data-side="right"] { left: calc(100% + 24px); flex-direction: row-reverse; }
  .note[data-side="right"] .noteArrow { transform: scaleX(-1) rotate(-15deg); }
  .note[data-side="left"] .noteArrow { transform: rotate(-15deg); }
}
```

- [ ] **Step 5: Run the tests**

Run: `npm run e2e -- e2e/how.spec.ts && npx vitest run && npm run typecheck && npm run build`
Expected: PASS on phone and desktop.

- [ ] **Step 6: Hero gate (laptop) and phone comparison**

Append to `e2e/capture.spec.ts`:

```ts
  test("how it works at the comp sizes", async ({ page }) => {
    await page.clock.setFixedTime(FIXED);
    for (const [width, height, file] of [
      [1536, 1024, "how-laptop-repro.png"],
      [1024, 1536, "how-phone-repro.png"],
    ] as const) {
      await page.setViewportSize({ width, height });
      await page.goto("/how-it-works");
      await page.locator("figure svg").first().waitFor({ timeout: 20_000 });
      await settle(page);
      await page.screenshot({ path: `.impeccable/review/${file}` });
    }
  });
```

```bash
I=/Users/tarikmoody/.claude/skills/impeccable/scripts/impeccable
npm run capture -- e2e/capture.spec.ts -g "how it works at the comp sizes"
$I build-phase record hero --build .impeccable/review/how-laptop-repro.png
$I build-phase advance
$I comp-diff --comp .impeccable/mocks/how-phone.webp --build .impeccable/review/how-phone-repro.png --spec .impeccable/build/spec.json --out-dir .impeccable/review/diff/how-phone
```

Expected: `ADVANCED hero -> sections` at ≥72%; the phone diff shows the same structure (notes above parts). Fix named regions and recapture on a miss.

- [ ] **Step 7: Sections, motion, responsive gates; commit**

Sections: check `DESIGN.md` rules (red only as pencil; no shadows, radii, cards). Motion: none added. Responsive: no overflow at 390, 1024 and 1440. Advance each with `$I build-phase advance`.

```bash
git add app ui e2e .impeccable
git commit -m "feat: How it works page built around an annotated real dataset sheet"
```

---

### Task 9: Accessibility and layout checks across every size

**Files:**
- Modify: `e2e/a11y.spec.ts`

**Interfaces:**
- Consumes: all new pages.
- Produces: axe + overflow coverage for `/how-it-works` and `/?open=W01` at 390, 1024 and 1440.

- [ ] **Step 1: Write the failing test cases**

In `e2e/a11y.spec.ts`, change `PAGES` to:

```ts
const PAGES = ["/", "/?q=asthma", "/d/W01", "/d/N02", "/how-it-works", "/?q=asthma&open=W01"];
```

and append:

```ts
for (const width of [1024, 1440]) {
  test(`no sideways scroll at ${width}px on the new pages`, async ({ page }, info) => {
    test.skip(info.project.name !== "desktop");
    await page.setViewportSize({ width, height: 900 });
    for (const path of ["/", "/how-it-works", "/?q=asthma&open=W01"]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), path).toBeLessThanOrEqual(0);
    }
  });
}
```

- [ ] **Step 2: Run them; fix every failure in CSS or markup (never by excluding a rule)**

Run: `npm run e2e -- e2e/a11y.spec.ts`
Expected first run: possibly contrast or name issues on the pencil notes or Ask rail. Fix and rerun until all pass on both projects.

- [ ] **Step 3: Run the whole suite and commit**

```bash
npm run e2e && npx vitest run && npm run typecheck
git add e2e ui
git commit -m "test: accessibility and no-overflow checks for the laptop and How it works pages"
```

---

### Task 10: Finish review and DESIGN.md

**Files:**
- Modify: `DESIGN.md`, `.impeccable/design.json` (by the documenter)

**Interfaces:**
- Consumes: captures `laptop-repro.png`, `how-laptop-repro.png`, `how-phone-repro.png`, `desktop.png`, `mobile.png`; approved comps; both build records (archive + current).
- Produces: finish-review disposition; updated design system.

- [ ] **Step 1: Fresh finish reviewer**

Dispatch a general-purpose agent with `/Users/tarikmoody/.claude/skills/impeccable/reference/degraded/finish-reviewer.md` and the input packet:
- the spec;
- the three approved comps and their captures;
- `PRODUCT.md` and `DESIGN.md`;
- both build records;
- the diff dirs;
- the craft floor.

Apply its disposition per `new-work.md` §7: at most two fix rounds, then bring any remaining items to Tarik.

- [ ] **Step 2: Update the design system**

Dispatch the documenter (`reference/degraded/documenter.md` + `reference/document.md`) to update `DESIGN.md` and `.impeccable/design.json` from the built code. It records:
- the laptop rules: two-pane, masthead nav, Ask rail;
- the `/how-it-works` annotation rule: grease-pencil teaching notes are red handwriting, never numbered.

Run `$I build-phase finish --disposition <word>` with the reviewer's word.

- [ ] **Step 3: Commit**

```bash
git add DESIGN.md .impeccable ui
git commit -m "docs: record the laptop layout and annotation rules in the design system"
```

---

### Task 11 (HUMAN checkpoint, then ship): Preview review and merge

- [ ] **Step 1: Pull request and checks**

```bash
git push -u origin feat/laptop-and-how-it-works
gh pr create --title "Laptop two-pane layout and How it works page" --body "Implements docs/superpowers/specs/2026-10-07-laptop-layout-and-how-it-works-design.md."
gh pr checks --watch
```

Expected: `check` and `e2e` (preview) green.

- [ ] **Step 2 (HUMAN):** Tarik opens the PR's Vercel preview link on a laptop and a phone, tries three searches, opens two sheets, and reads `/how-it-works`. Material changes go back through the TDD + gate loop; merge only on his go-ahead.

- [ ] **Step 3: Merge and refresh production**

```bash
gh pr merge --squash --delete-branch
npx convex run --prod build:start
```

Wait about two minutes. `npx convex run --prod search:catalogStatus` shows `pdfReports: 180` and `lastRunFailed: false` (cost about $0: unchanged items are skipped). `curl -s -o /dev/null -w '%{http_code}' https://cream-city-almanac.vercel.app/how-it-works` prints `200`.

- [ ] **Step 4: Decide on sharing**

Ask Tarik whether to add the live URL to `README.md` and start sharing (the quiet-launch hold ends when this ships). Write `docs/decisions/013-laptop-two-pane.md` in the decision-log format, with "What actually happened" left blank.
