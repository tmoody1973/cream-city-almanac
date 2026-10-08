# Cream City Almanac: Laptop Layout and "How It Works" Page — Design

**Status:** approved in conversation 2026-10-07 (parts 1 and 2); this document is the written spec for Tarik's review.
**Builds on:** `docs/superpowers/specs/2026-10-07-cream-city-almanac-design.md` (product spec), `DESIGN.md` (the Rundown design system), `PRODUCT.md`, decisions 008 (compact desktop) and 010 (Ask before Saved).

## 1. Why this exists

Phase 2 shipped a phone-first product. On a laptop it is the phone layout in a wider column (decision 008). Two gaps follow from that:

1. **No laptop design.** Newsroom reporters often dig on laptops, and most people who open a portfolio link do so on a laptop first. The phone comps never described a desktop composition.
2. **No plain explanation of the product.** A first-time visitor (a reporter, a DYCU staffer, a hiring manager) has no single page that says what this is, where the data comes from, what the AI does, and how to start.

**Success looks like:** a first-time visitor understands in under a minute what Cream City Almanac is, where its data comes from, what the AI does and doesn't do, and how to start; and a reporter on a 1440×900 laptop can search, scan results, and read a dataset sheet side by side without leaving the page.

**Constraint from Tarik:** the production link is not shared until this ships ("launch quietly").

## 2. What gets built

| # | Surface | Devices | Notes |
|---|---|---|---|
| A | `/how-it-works` page | phone + laptop | New route. Linked from the masthead and the footer. The link to share in the portfolio. |
| B | One-line explainer band on the home page | phone + laptop | e.g. "Milwaukee's public data, searchable in plain English. How it works →". One line on phones. |
| C | Laptop two-pane layout | laptop (≥1100px wide, landscape) | Home, search results, and dataset sheets. Phones unchanged. |

**Out of scope:** the Ask chat itself (Phase 3), Saved items (Phase 4), reading the 99 neighborhood spreadsheets (Phase 3), a custom domain.

## 3. The "How it works" page (A)

Plain English throughout; every technical term defined in one clause where it first appears; every number live from the catalog.

**Sections:**

1. **What it is.** An unofficial, phone-first way to find, understand, and download Milwaukee's public data from Data You Can Use. Search in your own words; every fact shows where it came from.
2. **Where the data comes from.** DYCU's ArcGIS Hub: the live counts in the Hub's own words ("93 raw data · 282 reports · 7 visualizations"). Refreshed weekly; never altered; downloads come straight from the Hub.
3. **What happens each week**, as a short rundown of steps (a real sequence, so numbering is meaningful here): read the Hub catalog → group yearly and geographic versions into families with permanent codes like `F02` → read the report PDFs → AI writes plain-English explainers, column guides, caveats and story angles → index everything for search.
4. **What the AI does and doesn't do.** The four source tags (DYCU, HUB, SOURCE, AI) explained, shown with the real tag component. AI-written text is always labeled. Numbers on a sheet come from the Hub's data, never from the AI.
5. **How search works.** Matches meaning and exact words. Example: "kids who can't afford food" finds Food Insecurity Prevalence (a working link that runs that search). When nothing is close, it says so.
6. **How it's built (light).** Next.js on Vercel, Convex for the database and weekly job, Claude via the Vercel AI Gateway, Firecrawl for PDFs, and a weekly automated search-quality check. Links to the public decision log: `https://github.com/tmoody1973/cream-city-almanac/tree/main/docs/decisions`.
7. **Limits and credits.** Unofficial; not affiliated with DYCU; "Data as of {live date}"; questions about the data go to `hub@datayoucanuse.org`; "Built by Tarik Moody" linking to `https://github.com/tmoody1973` (Tarik may swap in another URL).

**Copy rules (from `PRODUCT.md`):** no usage statistics, testimonials, or DYCU endorsement (none exist; never fabricate). No hardcoded counts or quality scores: counts come from `catalogStatus`; the search-quality score is described, not quoted, because it lives in CI, not the catalog. Never use DYCU's name or logo as the brand.

**Data needs:** `catalogStatus` already returns `asOf` and `counts`. Add one field: how many report PDFs have searchable text, counted at build time like `hubCounts`, so section 3 can say "reads N report PDFs" live. If the catalog can't be reached, the page still renders and omits the numbers rather than showing stale or invented ones.

## 4. Home explainer band (B)

One line linking to `/how-it-works`. On phones it must cost at most one line of the first screen; the comps decide exact placement (under the masthead, under the catalog line, or in the footer area of the dock). Hidden while a search is running (results follow comp C, which shows no band).

## 5. Laptop two-pane layout (C)

**When:** viewport at least 1100px wide and landscape (the breakpoint already used for the unpinned tab bar). Below that, everything stays exactly as built.

**Left pane (~40%):** masthead, catalog line, explainer band and suggestion tags (home only), SLUG search, and the rundown or result rows in their compact results form.

**Right pane (~60%):** the selected item's full dataset sheet (the same sections as `/d/[code]`: place × year grid, explainer, column guide, caveats, live preview, story angles, sources, versions, downloads). On laptops, clicking a row selects it and shows its sheet here instead of expanding in place. The selected row carries comp C's grease-pencil arrow.

**Address and history:** selection is in the URL (`/?q=asthma&open=W01`, or `/?open=V02` on the home rundown), so links, refresh, and the browser's Back button restore the view. `/d/W01` on a laptop opens the same two-pane view with W01 selected and the home rundown on the left; on phones `/d/W01` stays the full-page sheet.

**Before anything is selected:** the right pane shows a short "how it works" summary with a link to the full page. (The comps may instead show the top result auto-opened; Tarik picks.)

**Navigation:** on laptops SEARCH / ASK / SAVED become tabs in the masthead instead of a bottom bar. ASK and SAVED stay disabled ("Coming soon").

**Room for Ask (Phase 3):** the laptop comp shows where the Ask chat will dock (a panel beside the sheet). Nothing for Ask is built now; the layout just must not need restructuring to add it.

**Live preview:** opening a different row cancels the previous sheet's Hub requests so slow responses can't land on the wrong sheet.

## 6. Design process

Comp-led, like Phase 2, but laptop is designed natively this time:

1. **One Impeccable comp round:** laptop two-pane (1440×900), `/how-it-works` on phone (390 portrait), `/how-it-works` on laptop (1440×900), two variations each (about 6 images, roughly $1–2 on Tarik's OpenAI key, approved). Generated inside the Rundown world (`DESIGN.md`).
2. Tarik picks one comp per surface; the choices and the direction contract go into surface briefs.
3. Build with Impeccable's gates per surface (hero, sections, motion, responsive), then the independent finish review; update `DESIGN.md` with the laptop rules.

## 7. Errors and edge cases

- Catalog unreachable: the how-it-works page and band render without counts; no invented numbers.
- `open=` names an unknown or retired code: the right pane shows the not-found message with a link back; the list still works.
- Hub slow or down in the right pane: same 8-second notice and retry as the sheet page today.
- Resizing across the breakpoint keeps the selection: on phones, the selected item shows as the expanded row.
- Keyboard: Tab reaches the rows; Enter opens one in the right pane; focus moves to the sheet's heading; Escape (or a "close" control) returns focus to the row.

## 8. Testing

- **Laptop (1440×900):** clicking a row opens its sheet on the right; the URL gains `open=`; Back returns to the previous selection; refresh restores it; `/d/W01` opens two-pane with W01 selected; keyboard-only selection works; switching rows quickly never shows the wrong sheet's preview.
- **How it works:** renders live counts and the as-of date (pattern match, not fixed numbers); every link resolves (DYCU, GitHub decision log, the example search); the page works with JavaScript disabled for its text content.
- **All new and changed pages:** axe accessibility checks (no serious or critical issues) and no sideways scroll at 390, 1024 and 1440 widths.
- **Regression:** every existing phone and desktop test passes unchanged.
- **Design:** Impeccable comp-diff per surface at the comp's own size; finish review disposition recorded.

## 9. Decisions at comp review (2026-10-07)

- **How it works structure:** Annotated Sheet (surface roll `29e46a9e`, the dealt lead), chosen over Almanac Colophon and Before/After. Approved comps: `.impeccable/mocks/how-laptop.webp` (laptop) and `.impeccable/mocks/how-phone.webp` (phone: each grease-pencil note sits directly above the part it explains; no numbered keys, because a red number means "saved").
- **Laptop right pane before selection:** the newest item auto-opens (Tarik chose comp B, `.impeccable/mocks/laptop-b.webp`, over the summary in `laptop-a.webp`). So the explainer band and masthead tab carry "how it works" on laptops.
- **Mockup copy is not product truth:** the comps' invented column names, grid years and any wording that misstates the source tags are replaced by live data and accurate copy in the build.
- **Byline link:** Tarik's GitHub profile (default; swap any time).
