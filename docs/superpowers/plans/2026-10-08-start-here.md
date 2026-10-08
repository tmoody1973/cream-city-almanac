# Start Here Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/start-here` page with three worked examples (a reporter, a nonprofit, a resident) that show live excerpts of the real data, followed by DYCU's own guide pages, and stop treating those guide pages (X01–X03) as data.

**Architecture:** One public Convex query, `catalog.startHere`, gathers each example's real data (cards, the newest Harambee poverty table, the air feed's preview inputs, the guide pages' Hub links). A server-rendered page (`app/start-here/page.tsx`, the How it works pattern: `fetchQuery`, `revalidate = 300`, `null` on failure) passes it to a `StartHere` component; the air chart reuses the client `LivePreview` in chart-only mode. Families of kind `page` leave the rundown and show a "guide page on DYCU's Hub" block on their sheet and phone preview.

**Tech Stack:** Convex 1.46, Next.js 16.4 App Router (server components + `convex/nextjs` `fetchQuery`), React 19, CSS Modules, Vitest 5 (`convex-test`, edge-runtime), Playwright 1.63 + axe, Impeccable comp-led gates. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-08-start-here-design.md` (and `docs/decisions/018-start-here.md`).

## What the planning research settled (2026-10-08)

- **How it works' pattern** (`app/how-it-works/page.tsx`): server component, `export const revalidate = 300`, `Promise.all` of `fetchQuery(...).catch(() => null)`, data passed as props. Start here copies it.
- **Live preview:** `LivePreview({ members, fields, chartOnly })` (`ui/components/LivePreview.tsx`) fetches the newest member's first 10 rows in the feed's own order (`rowsUrl` has no ordering), so it does **not** show "the latest days". The resident excerpt therefore uses `chartOnly` (every day's reading per year, the mode How it works uses), and its step says "charts every day's reading".
- **Masthead room:** at 1100×800 the site links start at x=718 and the wordmark ends at x=430: 288px free; START HERE needs about 125px. It fits.
- **Resident Try it:** `/?q=air%20quality&open=V02` does not redirect on phones (V02 is in that search's rows, so the row only expands). Try it uses `/d/V02`: the sheet on phones, the two-pane view on laptops (existing `LaptopRedirect`).
- **Keys:** `dataset:asthma-prevalence` (W01), `dataset:housing-built-before-1950` (H05), `dataset:daily-air-quality` (V02), `document:neighborhood-portrait-spreadsheet` (N03), `page:about-the-data` (X01), `page:getting-started` (X02), `page:questions-and-feedback` (X03). The test fixture holds all of them and 11 Harambee items.
- **Provenance on the sheet:** caveats and story angles both carry the AI tag (`SheetBody.tsx`); the excerpts keep those tags.
- **Reusable helpers in `convex/catalog.ts`:** `familyMembers(ctx, key)`, `familyCard(ctx, key)`, `tablesFor(ctx, hubId)`, `newestYearFirst`; `placeKey` in `convex/lib/portrait.ts`. `familySheet`'s `family` is `toRow(family)`, which includes `kind`.

## Global Constraints

- **Numbers appear only inside excerpts, read live from the data**; no typed-in numbers, no new AI text.
- **Story angles and caveats appear exactly as on their sheets, with the AI tag.** Step text never quotes a specific angle.
- **When data is missing, the example keeps its steps and Try it link and says "Live data didn't load."** Nothing is filled in.
- **Routes and links:** page at `/start-here`; laptop masthead START HERE beside HOW IT WORKS; home band "Milwaukee data in plain English. Start here →" on every screen; footer "Start here" beside "How it works"; phone masthead and tab bar unchanged.
- **Guide pages:** "Updated this season" lists data only (still 10 rows); guide pages stay in search; their sheet and phone preview show "A guide page on DYCU's Hub, not a dataset." with an "Open it on the Hub" link (HUB tag) and a link to Start here.
- **Laptop query unchanged:** `(min-width: 1100px) and (orientation: landscape)` (`LAPTOP_QUERY`).
- **Design:** one Impeccable comp round (phone + laptop) before page code; Tarik picks; DESIGN.md rules (red is grease pencil only; no shadows, radii or cards; 44px touch targets).
- **Workflow:** branch `feat/start-here`; PR with CI `check` green; Conventional Commits; no `Co-Authored-By` trailers; never run `prettier` on whole files.

## Review Focus

1. **Harambee's newest file lacks the poverty table** (not read yet, or DYCU drops the tab) → the example uses the newest year that has it, or says the live data didn't load. Pinned by Task 2, test "uses the newest Harambee year that has the poverty table".
2. **A card hasn't been written yet** (new week, failed AI step) → the reporter or resident excerpt is empty and says so; the page still renders. Pinned by Task 2, test "returns nulls instead of failing when data is missing".
3. **A guide page has no landing page** → listed without a link. Pinned by Task 2, same test.
4. **Long story angles or a wide table on a 390px phone** → no sideways page scroll. Pinned by Task 4, e2e "no sideways scroll on Start here".
5. **Search ranking drifts** so the reporter's search stops finding H05 → a test fails. Pinned by Task 5, e2e "the reporter's search finds both datasets".

---

## File Structure

```
convex/search.ts               rundownRows skips kind "page" (modify)
convex/catalog.ts              familyPreview adds kind + guideUrl; startHere query (modify)
convex/catalog.test.ts         rundown, familyPreview, startHere tests (modify)
convex/lib/evalQuestions.ts    reporter question (modify)
ui/components/SheetBody.tsx    guide-page block for kind "page" (modify)
ui/components/FamilyPreview.tsx  guide-page block on the phone preview (modify)
ui/components/SiteNav.tsx      START HERE link; current "start" (modify)
ui/components/ExplainerBand.tsx, CreditFooter.tsx  Start here links (modify)
ui/components/StartHere.tsx    the page body (new)
ui/components/start.module.css page styles (new)
app/start-here/page.tsx        server route (new)
e2e/start.spec.ts              page tests (new); e2e/a11y.spec.ts, e2e/capture.spec.ts (modify)
DESIGN.md, .impeccable/*       Task 6
```

---

### Task 1: Guide pages are not data

**Files:**
- Modify: `convex/search.ts`, `convex/catalog.ts`, `ui/components/SheetBody.tsx`, `ui/components/FamilyPreview.tsx`
- Test: `convex/catalog.test.ts`, `e2e/start.spec.ts` (new)

**Interfaces:**
- Produces: `rundownRows` returns 10 non-page families; `api.catalog.familyPreview` adds `kind: string` and `guideUrl: string | null`.

- [ ] **Step 1: Write the failing tests**

`convex/catalog.test.ts` (inside `describe("catalog queries", …)`, using the file's `seed`):

```ts
  it("the rundown lists data only, still ten rows", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    await t.run(async (ctx) => {
      const x02 = (await ctx.db.query("families").withIndex("by_key", (q) => q.eq("key", "page:getting-started")).first())!;
      await ctx.db.patch(x02._id, { latestModified: "2099-01-01T00:00:00.000Z" });
    });
    const rows = await t.query(api.catalog.rundown, {});
    expect(rows).toHaveLength(10);
    expect(rows.some((r) => r.kind === "page")).toBe(false);
  });

  it("a guide page's preview points at its Hub page", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const preview = (await t.query(api.catalog.familyPreview, { key: "page:getting-started" }))!;
    expect(preview.kind).toBe("page");
    expect(preview.guideUrl).toMatch(/^https:\/\/getdata-dycu\.hub\.arcgis\.com\/pages\//);
    const data = (await t.query(api.catalog.familyPreview, { key: "dataset:asthma-prevalence" }))!;
    expect(data.guideUrl).toBeNull();
  });
```

(If `families` has no `latestModified` field under that name, use the field the `by_latestModified` index reads: `grep -n by_latestModified convex/schema.ts`.)

`e2e/start.spec.ts` (new):

```ts
import { expect, test } from "./fixtures";

test("a guide page opens as a guide, not a dataset", async ({ page }, info) => {
  await page.goto("/d/X02");
  if (info.project.name === "desktop") await expect(page).toHaveURL(/open=X02/);
  await expect(page.getByText("A guide page on DYCU's Hub, not a dataset.")).toBeVisible();
  await expect(page.getByRole("link", { name: /Open it on the Hub/ })).toHaveAttribute("href", /getdata-dycu\.hub\.arcgis\.com\/pages\//);
  await expect(page.getByRole("heading", { name: "WHAT IT MEASURES" })).toHaveCount(0);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run convex/catalog.test.ts && npm run e2e -- e2e/start.spec.ts`
Expected: FAIL — a page row in the rundown; `preview.kind` undefined; the guide text not found.

- [ ] **Step 3: Implement**

`convex/search.ts`, replace `rundownRows`:

```ts
const RUNDOWN_SIZE = 10;

// "Updated this season" is for data; DYCU's guide pages (kind "page") are left out.
export async function rundownRows(ctx: QueryCtx): Promise<ResultRow[]> {
  const rows: ResultRow[] = [];
  for await (const f of ctx.db.query("families").withIndex("by_latestModified").order("desc")) {
    if (f.kind !== "page") rows.push(toRow(f));
    if (rows.length === RUNDOWN_SIZE) break;
  }
  return rows;
}
```

`convex/catalog.ts`, in `familyPreview`'s return object add:

```ts
      kind: family.kind,
      // DYCU's guide pages explain the Hub; their preview links out instead of describing data.
      guideUrl: family.kind === "page" ? (members[0]?.landingPage ?? null) : null,
```

`ui/components/SheetBody.tsx`: at the top of the returned fragment, right after the `</header>`, branch for guide pages (the header stays):

```tsx
      {family.kind === "page" ? (
        <section className={styles.section}>
          <p>
            A guide page on DYCU&apos;s Hub, not a dataset.{" "}
            {latest?.landingPage && (
              <a href={latest.landingPage}>
                Open it on the Hub <ProvenanceTag source="HUB" />
              </a>
            )}
          </p>
          <p>
            New here? <Link href="/start-here">Start here</Link>.
          </p>
        </section>
      ) : (
        <>
          {/* …everything that follows the header today, unchanged… */}
        </>
      )}
```

(Move the existing JSX after `</header>` inside the second branch; add `import Link from "next/link";`.)

`ui/components/FamilyPreview.tsx`: before the normal return, add:

```tsx
  if (preview.guideUrl) {
    return (
      <div id={id} className={styles.panel}>
        <p className={styles.explainer}>
          A guide page on DYCU&apos;s Hub, not a dataset.{" "}
          <a href={preview.guideUrl}>
            Open it on the Hub <ProvenanceTag source="HUB" />
          </a>
        </p>
      </div>
    );
  }
```

- [ ] **Step 4: Run tests, push to dev, typecheck**

Run: `npx convex dev --once && npx vitest run && npm run typecheck && npm run e2e -- e2e/start.spec.ts`
Expected: all pass (the e2e needs the dev deployment updated first).

- [ ] **Step 5: Commit**

```bash
git add convex ui e2e/start.spec.ts
git commit -m "feat: DYCU's guide pages open as guides, and leave the data rundown"
```

---

### Task 2: The Start here query

**Files:**
- Modify: `convex/catalog.ts`
- Test: `convex/catalog.test.ts`

**Interfaces:**
- Consumes: `familyMembers`, `familyCard`, `tablesFor`, `newestYearFirst` (catalog.ts), `placeKey` (`convex/lib/portrait.ts`).
- Produces: `api.catalog.startHere({}) → StartHereData`:

```ts
{
  reporter: {
    asthma: { code: string; name: string; caveat: string | null } | null;
    housing: { code: string; name: string; angles: string[] } | null;
  };
  nonprofit: { place: string; year: number | null; table: PortraitTableView } | null;
  resident: {
    code: string;
    name: string;
    members: { place: string | null; yearLabel: string | null; featureServerUrl: string | null }[];
    fields: string[];
    caveat: string | null;
  } | null;
  guides: { code: string; name: string; url: string | null }[];
}
```

(`PortraitTableView` = what `tablesFor` returns per table.)

- [ ] **Step 1: Write the failing tests** — append to `convex/catalog.test.ts`:

```ts
describe("startHere", () => {
  const card = (familyKey: string, extra: { caveats?: string[]; storyAngles?: string[]; glossary?: { field: string; meaning: string; provenance: "AI" }[] }) => ({
    familyKey, inputHash: "h", explainer: "x", explainerProvenance: "AI" as const, hubSummary: "", glossary: extra.glossary ?? [],
    caveats: extra.caveats ?? [], storyAngles: extra.storyAngles ?? [], basic: false, embedding: [],
  });
  const poverty = (hubId: string) => ({
    hubId, modified: "m", slug: "poverty-status-by-age", topic: "Poverty Status by Age", tab: "Poverty Status by Age", order: 2,
    tableIds: ["B17001"], tableIdText: "B17001", vintage: null, groups: [""],
    rows: [{ label: "Total", heading: false, values: [{ estimate: "100", moe: "5" }] }], issues: [],
  });
  const harambee = (year: number) =>
    fixtureFamilies().find((f) => f.key === "document:neighborhood-portrait-spreadsheet")!.members.find((m) => m.place === "Harambee" && m.years[0] === year)!;

  it("gathers each example's real data", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    await t.run(async (ctx) => {
      await ctx.db.insert("cards", card("dataset:housing-built-before-1950", { storyAngles: ["Angle one?", "Angle two?", "Angle three?"] }));
      await ctx.db.insert("cards", card("dataset:asthma-prevalence", { caveats: ["Modeled estimates."] }));
      await ctx.db.insert("cards", card("dataset:daily-air-quality", { caveats: ["Citywide average."], glossary: [{ field: "AQI", meaning: "m", provenance: "AI" }] }));
      await ctx.db.insert("portraitTables", poverty(harambee(2024).hubId));
    });
    const d = await t.query(api.catalog.startHere, {});
    expect(d.reporter.housing).toMatchObject({ code: expect.any(String), angles: ["Angle one?", "Angle two?"] });
    expect(d.reporter.asthma!.caveat).toBe("Modeled estimates.");
    expect(d.nonprofit).toMatchObject({ year: 2024, table: { slug: "poverty-status-by-age" } });
    expect(d.resident!.fields).toEqual(["AQI"]);
    expect(d.resident!.members.some((m) => m.featureServerUrl)).toBe(true);
    expect(d.guides.map((g) => g.name)).toEqual(["About the Data", "Getting Started", "Questions and Feedback"]);
    expect(d.guides.every((g) => g.url?.startsWith("https://"))).toBe(true);
  });

  it("uses the newest Harambee year that has the poverty table", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    await t.run((ctx) => ctx.db.insert("portraitTables", poverty(harambee(2022).hubId)));
    expect((await t.query(api.catalog.startHere, {})).nonprofit!.year).toBe(2022);
  });

  it("returns nulls instead of failing when data is missing", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const d = await t.query(api.catalog.startHere, {});
    expect(d.reporter.housing).toMatchObject({ angles: [] });
    expect(d.reporter.asthma!.caveat).toBeNull();
    expect(d.nonprofit).toBeNull();
    expect(d.resident!.caveat).toBeNull();
  });
});
```

(Check `cards`' required fields with `grep -n "cards: defineTable" -A12 convex/schema.ts` and adjust the `card()` helper to match exactly.)

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run convex/catalog.test.ts`
Expected: FAIL — `api.catalog.startHere` is not a function.

- [ ] **Step 3: Implement** — `convex/catalog.ts`:

```ts
const START_HERE = {
  asthma: "dataset:asthma-prevalence",
  housing: "dataset:housing-built-before-1950",
  air: "dataset:daily-air-quality",
  spreadsheets: "document:neighborhood-portrait-spreadsheet",
  place: "harambee",
  topic: "poverty-status-by-age",
} as const;

async function familyWithCard(ctx: QueryCtx, key: string) {
  const family = await ctx.db.query("families").withIndex("by_key", (q) => q.eq("key", key)).first();
  return family ? { family, card: await familyCard(ctx, key), members: await familyMembers(ctx, key) } : null;
}

// The newest neighborhood file that has the topic's table (a new or failing file never becomes the example).
async function neighborhoodTable(ctx: QueryCtx, place: string, topic: string) {
  const files = (await familyMembers(ctx, START_HERE.spreadsheets)).filter((m) => placeKey(m.place ?? m.title) === place).sort(newestYearFirst);
  for (const m of files) {
    const table = (await tablesFor(ctx, m.hubId)).find((t) => t.slug === topic);
    if (table) return { place: m.place ?? m.title, year: m.years[0] ?? null, table };
  }
  return null;
}

// Everything the Start here page shows, read live; a missing piece comes back null, never invented.
export const startHere = query({
  args: {},
  handler: async (ctx) => {
    const [asthma, housing, air] = await Promise.all([START_HERE.asthma, START_HERE.housing, START_HERE.air].map((k) => familyWithCard(ctx, k)));
    const pages = (await ctx.db.query("families").collect()).filter((f) => f.kind === "page").sort((a, b) => a.code.localeCompare(b.code));
    const guides = await Promise.all(
      pages.map(async (f) => ({ code: f.code, name: f.name, url: (await familyMembers(ctx, f.key))[0]?.landingPage ?? null })),
    );
    return {
      reporter: {
        asthma: asthma && { code: asthma.family.code, name: asthma.family.name, caveat: asthma.card?.caveats[0] ?? null },
        housing: housing && { code: housing.family.code, name: housing.family.name, angles: housing.card?.storyAngles.slice(0, 2) ?? [] },
      },
      nonprofit: await neighborhoodTable(ctx, START_HERE.place, START_HERE.topic),
      resident: air && {
        code: air.family.code,
        name: air.family.name,
        members: air.members.map((m) => ({ place: m.place, yearLabel: m.yearLabel, featureServerUrl: m.featureServerUrl })),
        fields: air.card?.glossary.map((g) => g.field) ?? [],
        caveat: air.card?.caveats[0] ?? null,
      },
      guides,
    };
  },
});
```

(`placeKey` is already imported in `catalog.ts`; `newestYearFirst` and `tablesFor` are defined above `portraitIndex`, so place this after them.)

- [ ] **Step 4: Run tests, regenerate, typecheck**

Run: `npx convex codegen && npx vitest run && npm run typecheck && npx tsc --noEmit -p convex`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add convex
git commit -m "feat: one query gathers the Start here page's live examples"
```

---

### Task 3 (HUMAN checkpoint): Comps

**Files:** `.impeccable/mocks/start-*.webp` (+ sidecars), `.impeccable/surfaces/start-here.md`

- [ ] **Step 1:** Capture How it works at 1536×1024 (laptop) and 1024×1536 (phone) as the comp references (`.impeccable/review/start-ref-laptop.png`, `start-ref-phone.png`); Start here is its sibling.
- [ ] **Step 2:** Generate two directions × two devices (4 images, under $1) with `impeccable generate-image --ref <capture> --prompt-file <prompt> --out .impeccable/mocks/start-<a|b>-<laptop|phone>.webp --size <WxH> --quality high`. The prompt leads with the structure: masthead with START HERE current; heading START HERE and the opener; three examples, each a label (A REPORTER / A NONPROFIT / A RESIDENT), the question in large type, 3–4 numbered steps, an excerpt, a "Try it →" link; then DYCU'S OWN GUIDES (three links with HUB tags) and "How the almanac works →". Real content: the reporter excerpt shows H05's angle "Are areas with older housing stock also areas where residents face higher housing burdens or maintenance problems?" [AI] and W01's caveat "These are modeled estimates produced by a methodology, not direct counts of people with asthma, so avoid saying how many people have asthma." [AI]; the nonprofit excerpt shows "Harambee, 2024: Poverty Status by Age" with Total 18,894 ±1,504; Income in the past 12 months below poverty level 6,520 ±790; Under 5 years 608 ±252 [DYCU] and its note; the resident excerpt shows a strip chart of daily readings for 2023, 2024, 2025. Name DESIGN.md's palette, type and rules. Direction A: examples stacked, excerpt beside the steps on laptop. Direction B: the three examples as three ruled columns on laptop.
- [ ] **Step 3 (HUMAN):** Tarik picks; record the pick in sidecars (`approved: true`) and in `.impeccable/surfaces/start-here.md` (scope, audience, comps, direction contract).
- [ ] **Step 4: Commit**

```bash
git add .impeccable
git commit -m "design: approve the Start here comps"
```

---

### Task 4: The Start here page and its links

**Files:**
- Create: `app/start-here/page.tsx`, `ui/components/StartHere.tsx`, `ui/components/start.module.css`
- Modify: `ui/components/SiteNav.tsx`, `ui/components/ExplainerBand.tsx`, `ui/components/CreditFooter.tsx`, `e2e/start.spec.ts`, `e2e/a11y.spec.ts`

**Interfaces:**
- Consumes: Task 2 `api.catalog.startHere`; `LivePreview`, `ProvenanceTag`, `Masthead`, `SiteNav`, `CreditFooter`; `formatPortraitNumber`, `formatPortraitMargin` (`ui/lib/portrait.ts`).
- Produces: `SiteNav` `current` accepts `"start"`.

- [ ] **Step 1: Write the failing tests** — append to `e2e/start.spec.ts`:

```ts
test("Start here walks through three real examples", async ({ page }) => {
  await page.goto("/start-here");
  await expect(page).toHaveTitle(/Start here/);
  for (const who of ["A REPORTER", "A NONPROFIT", "A RESIDENT"]) await expect(page.getByRole("heading", { name: who })).toBeVisible();
  await expect(page.getByText(/^Harambee, \d{4}: Poverty Status by Age$/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "DYCU'S OWN GUIDES" })).toBeVisible();
  for (const name of ["Getting Started", "About the Data", "Questions and Feedback"]) {
    await expect(page.getByRole("link", { name })).toHaveAttribute("href", /getdata-dycu\.hub\.arcgis\.com\/pages\//);
  }
});

test("the nonprofit excerpt matches the stored table", async ({ page }) => {
  await page.goto("/start-here");
  const caption = await page.getByText(/^Harambee, \d{4}: Poverty Status by Age$/).textContent();
  const year = caption!.match(/\d{4}/)![0];
  const excerptFirstRow = await page.locator("[data-example=nonprofit] tbody tr").first().textContent();
  await page.goto(`/d/N03?place=harambee&year=${year}&topic=poverty-status-by-age`);
  await expect(page.locator("section[aria-labelledby=portrait-heading] tbody tr").first()).toHaveText(excerptFirstRow!);
});

test("each Try it link lands where its steps say", async ({ page }, info) => {
  await page.goto("/start-here");
  await page.locator("[data-example=nonprofit]").getByRole("link", { name: /Try it/ }).click();
  await expect(page.locator("section[aria-labelledby=portrait-heading] caption")).toHaveText(/Harambee, \d{4}: Poverty Status by Age/i);
  await page.goto("/start-here");
  await page.locator("[data-example=resident]").getByRole("link", { name: /Try it/ }).click();
  await expect(page).toHaveURL(info.project.name === "desktop" ? /open=V02/ : /\/d\/V02/);
});

test("the masthead, home band and footer lead to Start here", async ({ page }, info) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: /Start here/ }).first()).toHaveAttribute("href", "/start-here");
  await expect(page.locator("footer").getByRole("link", { name: "Start here" })).toHaveAttribute("href", "/start-here");
  if (info.project.name === "desktop") {
    await expect(page.getByRole("navigation", { name: "Site" }).getByRole("link", { name: "START HERE" })).toHaveAttribute("href", "/start-here");
  }
});

test("no sideways scroll on Start here", async ({ page }, info) => {
  for (const width of info.project.name === "desktop" ? [1024, 1440] : [390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/start-here");
    await page.waitForLoadState("networkidle");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  }
});
```

In `e2e/a11y.spec.ts`, add `"/start-here"` to `PAGES`.

- [ ] **Step 2: Run them to see them fail**

Run: `npm run e2e -- e2e/start.spec.ts`
Expected: FAIL — `/start-here` is a 404.

- [ ] **Step 3: Implement** (lay it out to the approved comp; this is the content and markup contract)

`app/start-here/page.tsx`:

```tsx
import { fetchQuery } from "convex/nextjs";
import type { Metadata } from "next";
import { api } from "@/convex/_generated/api";
import { StartHere } from "@/ui/components/StartHere";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Start here — Cream City Almanac",
  description: "How a reporter, a nonprofit and a resident use Cream City Almanac, with live examples from Milwaukee's public data.",
};

export default async function StartHerePage() {
  // The walkthroughs must render even when the catalog can't be reached; the excerpts then say so.
  const data = await fetchQuery(api.catalog.startHere, {}).catch(() => null);
  return <StartHere data={data} />;
}
```

`ui/components/StartHere.tsx`:

```tsx
import type { FunctionReturnType } from "convex/server";
import Link from "next/link";
import type { ReactNode } from "react";
import type { api } from "@/convex/_generated/api";
import { formatPortraitMargin, formatPortraitNumber } from "@/ui/lib/portrait";
import { Arrow } from "./Arrow";
import { CreditFooter } from "./CreditFooter";
import { LivePreview } from "./LivePreview";
import { Masthead } from "./Masthead";
import { ProvenanceTag } from "./ProvenanceTag";
import { SiteNav } from "./SiteNav";
import styles from "./start.module.css";

type Data = FunctionReturnType<typeof api.catalog.startHere>;
const REPORTER_QUERY = "older housing and asthma rates";
const EXCERPT_ROWS = 3;

const NotLoaded = () => <p className={styles.missing}>Live data didn&apos;t load. The steps and the Try it link still work.</p>;

function Example({ id, who, question, steps, excerpt, tryHref }: { id: string; who: string; question: string; steps: ReactNode[]; excerpt: ReactNode; tryHref: string }) {
  return (
    <section className={styles.example} data-example={id} aria-labelledby={`${id}-who`}>
      <h3 id={`${id}-who`} className={styles.who}>{who}</h3>
      <p className={styles.question}>&ldquo;{question}&rdquo;</p>
      <ol className={styles.steps}>{steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
      <div className={styles.excerpt}>{excerpt}</div>
      <p><Link href={tryHref}>Try it<Arrow /></Link></p>
    </section>
  );
}

export function StartHere({ data }: { data: Data | null }) {
  const housing = data?.reporter.housing;
  const asthma = data?.reporter.asthma;
  const table = data?.nonprofit;
  const air = data?.resident;
  return (
    <div className={styles.page}>
      <Masthead side="START HERE" showDate={false} nav={<SiteNav placement="masthead" current="start" />} />
      <main className={styles.main}>
        <h2 className={styles.headline}>START HERE</h2>
        <p className={styles.lede}>Three people, three questions, and how each gets an answer here.</p>

        <Example
          id="reporter"
          who="A REPORTER"
          question="Do the neighborhoods with the most old housing also have the most asthma?"
          steps={[
            <>Search <Link href={`/?q=${encodeURIComponent(REPORTER_QUERY)}`}>{REPORTER_QUERY}</Link>. Asthma Prevalence and Housing Built Before 1950 come up.</>,
            <>Read each sheet&apos;s caveats first: they say what the numbers can and can&apos;t support.</>,
            <>Use the story angles as starting questions.</>,
            <>Download both CSVs and match them by census tract.</>,
          ]}
          excerpt={
            housing?.angles.length || asthma?.caveat ? (
              <>
                {housing && housing.angles.length > 0 && (
                  <>
                    <p className={styles.excerptLabel}>{housing.code} story angles</p>
                    <ul>{housing.angles.map((a) => <li key={a}>{a} <ProvenanceTag source="AI" /></li>)}</ul>
                  </>
                )}
                {asthma?.caveat && (
                  <>
                    <p className={styles.excerptLabel}>{asthma.code} caveat</p>
                    <p>{asthma.caveat} <ProvenanceTag source="AI" /></p>
                  </>
                )}
              </>
            ) : <NotLoaded />
          }
          tryHref={`/?q=${encodeURIComponent(REPORTER_QUERY)}`}
        />

        <Example
          id="nonprofit"
          who="A NONPROFIT"
          question="Our grant application needs Harambee's poverty numbers, by age."
          steps={[
            <>Open the <Link href="/d/N03">Neighborhood Portrait Spreadsheet</Link> (N03).</>,
            <>Pick Harambee and the newest year, then Poverty Status by Age.</>,
            <>Quote each estimate with its margin of error, and cite the Census table linked on the sheet.</>,
            <>For the story behind the numbers, read Harambee&apos;s <Link href="/d/N02">Neighborhood Portrait</Link> report.</>,
          ]}
          excerpt={
            table ? (
              <>
                {table.table.issues.map((i) => <p key={i} className={styles.issue}>{i}</p>)}
                <table className={styles.table}>
                  <caption>{table.place}, {table.year}: {table.table.topic}</caption>
                  <thead><tr><th scope="col"><span className="visually-hidden">Variable</span></th><th scope="col">Estimate</th><th scope="col">± Margin</th></tr></thead>
                  <tbody>
                    {table.table.rows.filter((r) => !r.heading).slice(0, EXCERPT_ROWS).map((r) => (
                      <tr key={r.label}>
                        <th scope="row">{r.label}</th>
                        <td>{r.values[0] ? formatPortraitNumber(r.values[0].estimate) : ""}</td>
                        <td>{r.values[0]?.moe ? formatPortraitMargin(r.values[0].moe) : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p><ProvenanceTag source="DYCU" /> Census table {table.table.tableIds.join(", ")}</p>
              </>
            ) : <NotLoaded />
          }
          tryHref={table ? `/d/N03?place=harambee&year=${table.year}&topic=poverty-status-by-age` : "/d/N03"}
        />

        <Example
          id="resident"
          who="A RESIDENT"
          question="What has the air been like in Milwaukee lately?"
          steps={[
            <>Search <Link href="/?q=air%20quality">air quality</Link> and open Daily Air Quality (V02).</>,
            <>The live preview charts every day&apos;s reading, straight from DYCU&apos;s Hub. No download needed.</>,
            <>Read the caveat before comparing days or years.</>,
          ]}
          excerpt={
            air ? (
              <>
                <LivePreview members={air.members} fields={air.fields} chartOnly />
                {air.caveat && <p>{air.caveat} <ProvenanceTag source="AI" /></p>}
              </>
            ) : <NotLoaded />
          }
          tryHref="/d/V02"
        />

        <section className={styles.guides} aria-labelledby="guides-heading">
          <h3 id="guides-heading" className={styles.who}>DYCU&apos;S OWN GUIDES</h3>
          <ul>
            {(data?.guides ?? []).map((g) => (
              <li key={g.code}>{g.url ? <a href={g.url}>{g.name}</a> : g.name} <ProvenanceTag source="HUB" /></li>
            ))}
          </ul>
          <p>Questions about the data itself: <a href="mailto:hub@datayoucanuse.org">hub@datayoucanuse.org</a></p>
        </section>

        <p><Link href="/how-it-works">How the almanac works<Arrow /></Link></p>
      </main>
      <CreditFooter />
    </div>
  );
}
```

(Before writing, read `ui/components/Masthead.tsx` for its prop types and `LivePreview` for whether `chartOnly` renders a heading; follow How it works' use of both.)

`ui/components/SiteNav.tsx`: widen `current` to `"search" | "how" | "start" | null` and add, before the HOW IT WORKS link (masthead only):

```tsx
      {!dock && (
        <Link className={cls(current === "start")} href="/start-here" aria-current={current === "start" ? "page" : undefined}>
          START HERE
        </Link>
      )}
```

(Keep HOW IT WORKS last; the set-apart hairline in `rundown.module.css` moves to sit before START HERE — check `.mastTab` rules for the separator and apply it to the first of the two.)

`ui/components/ExplainerBand.tsx`: `<Link href="/start-here">Start here<Arrow /></Link>` in place of the How it works link.

`ui/components/CreditFooter.tsx`: add `{" · "}<Link href="/start-here">Start here</Link>` before How it works.

`ui/components/start.module.css`: first pass from `ui/components/how.module.css` (page, main, headline, lede) plus `.example`, `.who`, `.question`, `.steps`, `.excerpt`, `.excerptLabel`, `.issue`, `.table`, `.missing`, `.guides`; Task 6's gates tune it to the comp.

- [ ] **Step 4: Run every test**

Run: `npx convex dev --once && npm run e2e && npx vitest run && npm run typecheck && npx next build`
Expected: all pass (existing How it works tests that asserted the band's "How it works" link may need its href updated: the band now leads to Start here; update those assertions and record the change).

- [ ] **Step 5: Commit**

```bash
git add app ui e2e
git commit -m "feat: Start here walks a reporter, a nonprofit and a resident through real data"
```

---

### Task 5: Keep the reporter's search honest

**Files:**
- Modify: `convex/lib/evalQuestions.ts`, `e2e/start.spec.ts`

- [ ] **Step 1: Write the failing test** — append to `e2e/start.spec.ts`:

```ts
test("the reporter's search finds both datasets", async ({ page }) => {
  await page.goto("/?q=" + encodeURIComponent("older housing and asthma rates"));
  const codes = await page.locator("li[data-code]").evaluateAll((els) => els.slice(0, 5).map((e) => e.getAttribute("data-code")));
  expect(codes).toEqual(expect.arrayContaining(["W01", "H05"]));
});
```

and add to `convex/lib/evalQuestions.ts`:

```ts
  // Start here's reporter example searches this; it must keep finding both datasets.
  { question: "older housing and asthma rates", expect: ["dataset:asthma-prevalence", "dataset:housing-built-before-1950"] },
```

- [ ] **Step 2: Run it**

Run: `npm run e2e -- e2e/start.spec.ts -g "reporter's search" && npx convex run evals:searchReportCard`
Expected: PASS today (W01 1st, H05 3rd); the report card stays ≥ 0.8. This test guards against drift, so it passes on arrival; record that in the ledger rather than forcing a red run.

- [ ] **Step 3: Commit**

```bash
git add convex/lib/evalQuestions.ts e2e/start.spec.ts
git commit -m "test: guard the Start here reporter search"
```

---

### Task 6: Design gates, finish review, DESIGN.md

- [ ] **Step 1:** Archive `.impeccable/build/{state.json,spec.json,regions.json,scaffold,crops,font-match,comp-grid.png}` into `.impeccable/build/archive/portrait-tables/`; `impeccable build-phase start --comp .impeccable/mocks/<approved laptop comp> --breakpoint 1536x1024`.
- [ ] **Step 2:** Spec the comp (regions for masthead, heading, lede, each example's label, question, steps, excerpt, Try it, the guides), measure type, plates (none expected unless the comp draws grease pencil), add a `@capture` test for `/start-here` at 1536×1024 and 1024×1536 into `.impeccable/review/hero-repro.png` and `start-phone-repro.png`, and pass the hero gate (≥72%). Real excerpts differ from the comp's in length; if the gate fails on content length alone, show Tarik the side-by-side and ask before forcing.
- [ ] **Step 3:** Sections, motion (none), responsive (`desktop.png` 1440 and `mobile.png` 390).
- [ ] **Step 4:** Fresh finish reviewer (`reference/degraded/finish-reviewer.md` packet: request, answers, artifact paths, captures, comps, state, spec, diffs, direction contract, DESIGN.md, PRODUCT.md); one fix batch and a verdict pass; leftovers to Tarik.
- [ ] **Step 5:** Documenter: DESIGN.md gains the Start here page and the guide-page block; `.impeccable/design.json` additions only (`json.dumps(..., ensure_ascii=False)` + trailing newline).
- [ ] **Step 6: Commit**

```bash
git add .impeccable DESIGN.md ui e2e
git commit -m "feat: build Start here to its comp"
```

---

### Task 7 (HUMAN checkpoint, then ship): Preview and merge

- [ ] **Step 1:** This branch changes Convex (`rundownRows`, `familyPreview`, `startHere`), and previews read production Convex: ask Tarik before deploying the functions to production (`npx convex deploy -y`; additive except the rundown filter), as in Phase 3a. Then push and open the PR; `gh pr checks` until `check` and `e2e` pass.
- [ ] **Step 2 (HUMAN):** Tarik checks the preview on a laptop and a phone: the three examples, each Try it link, the guides, `/d/X02`, and the home band and footer links. Merge only on his go-ahead.
- [ ] **Step 3:** `gh pr merge --merge --delete-branch`; confirm the production deploy and run `BASE_URL=https://cream-city-almanac.vercel.app npx playwright test e2e/start.spec.ts`.
- [ ] **Step 4:** Leave decision 018's "What actually happened" blank for Tarik.
