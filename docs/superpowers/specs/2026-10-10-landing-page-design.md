# Cream City Almanac: Landing Page — Design

Approved in conversation 2026-10-10 (Tarik): a real front page instead of landing on search; the descriptor "A guide to
Milwaukee's public data." and tagline "Find it. Understand it. Check where it came from."; landing at `/`, search
moved to `/search` with every old link redirected; sections Find / Understand / Check, The data (live counts), Ask a
question, Who it's for + fine print; layout A ("Front page"); live figures, never frozen ones; Parts 1 (routing) and
2 (content). Mockup (throwaway) in `.superpowers/brainstorm/…/content/landing-layouts.html`. Builds after the map
(Phase 4d) merges, because the sample Ask answer uses its public cached count.

## 1. Why

People arriving at creamcityalmanac.app land on a search box with no explanation of what the site is, whose data it
holds, or why to trust it. The launch posts (`outreach/2026-10-08-*.md`) already tell that story well; the site
should tell it first.

## 2. Words (approved)

- Wordmark: Cream City Almanac.
- Headline: "A guide to Milwaukee's public data."
- Tagline: "Find it. Understand it. Check where it came from."
- Avoid on this page: "open data portal", "data catalog", "platform", "dashboard", "tool", "RAG", "AI-powered". When AI
  is mentioned, say what it does: "Ask in plain English; the answer shows the number and its source."

## 3. Routing (Part 1)

- `/` (bare, no search parameters) renders the landing page, server-rendered, with metadata title
  "Cream City Almanac — A guide to Milwaukee's public data." and a description built from the tagline.
- `/search` renders what `/` renders today (rundown, results, laptop two-pane, Ask's laptop column), unchanged.
- `/` with a search parameter redirects (307) to `/search` with the same query string. The search parameters are
  exactly those the search screen reads today — `q`, `open`, `ask`, `prompt`, `row`, `place`, `year`, `topic`, `day`,
  `month`, `weekday` — kept in one exported constant `SEARCH_PARAMS` that the search screen's readers and
  `isSearchAddress(params)` share. Any other parameter (e.g. `utm_source` on a campaign link) keeps the landing
  page.
- Every place that builds a search address changes from `/?…` to `/search?…`: masthead SEARCH, phone menu, tab bar,
  laptop redirect on sheets (`LaptopRedirect`), Ask's laptop link (`laptopAskHref` → `/search?ask=1…`), the Ask
  guide's links, Start here's example links, `SearchHome`'s own address updates, and the e2e tests.
- The wordmark still links to `/` (now the landing page).

## 4. The page (Part 2) — layout A

Top to bottom (laptop composition as in the mockup; phone stacks):

1. Masthead with the wordmark and site links (SEARCH, ASK, START HERE, HOW IT WORKS).
2. 2px rule; the headline in condensed capitals (Saira Extra Condensed 700 — not the wordmark face, per the One
   Wordmark Rule); the tagline in body type.
3. The search entry (TOPIC: "What are you looking into?") submitting to `/search?q=…`.
4. Three ruled columns (stacked on phones), each with a linked example:
   - **Find it** — "Search in your own words across Data You Can Use and the City of Milwaukee." Example: "kids who
     can't afford food" → F02 Food Insecurity Prevalence (links to that search).
   - **Understand it** — "Every dataset gets a plain-English sheet: what it measures, which places and years exist,
     the caveats, a map, and story angles."
   - **Check where it came from** — "Every fact says who wrote it. Numbers come from the data, never from the AI."
     with the four provenance tags.
5. **The data** (ruled table) beside **Ask a question**:
   - Rows: Data You Can Use (neighborhood health, income and housing; reports read word by word) and City of
     Milwaukee (crime, fire and EMS calls, City services, property, elections, maps), each with its live family count
     and the City row's daily-updated count; "Refreshed every Monday."; "Updated this season:" the three newest
     rundown items, linked.
   - Ask: the sentence above; a sample answer card for "How many robberies in Harambee this year?" whose figure comes
     live from `api.map.mapCells` (NIBRS, Robbery, from January 1, Harambee); if it isn't ok, the card shows the
     question and "See the count →" with no figure; "Free with sign-in · 30 questions a day · How to use Ask →".
6. **Who it's for**: a reporter checking a number on deadline, a nonprofit writing a grant, a resident curious about
   their block → Start here.
7. Fine print: "Unofficial. Not affiliated with Data You Can Use or the City of Milwaukee." · How it works · Code on
   GitHub · "Questions about the data: hub@datayoucanuse.org".

House rules: ink rules (2px opens a block, 1px divides), no cards, no shadows or radii, no red; boxes only around the
search entry and the sample answer (the same hairline box Ask's cards use); tabular lining figures for counts; 44px
touch targets; night edition via the existing tokens.

## 5. Data

- Counts: a public query `api.catalog.landingStats({})` → `{ dycuFamilies, cityFamilies, cityLive, newest: { code,
  name }[] (3) }`, read from `families` (by `source`; `live`) and the existing rundown order.
- Sample answer: `api.map.mapCells` (public, cached 10 minutes, site-wide limit) — no new City load beyond the cache.

## 6. Testing

- Unit: `isSearchAddress` (empty → false; `q=x` → true; `open=P14` → true; `utm_source=x` → false); `landingStats` counts by source and live.
- Browser: bare `/` shows the headline and the three verbs; submitting the entry lands on `/search?q=…`;
  `/?q=homicide&open=P14` redirects to `/search?q=homicide&open=P14`; the sample answer shows a figure or the
  fallback link; existing search, laptop, Ask and menu tests pass against `/search`; axe on `/` in both editions.

## 7. Rollout and docs

Backend change: one public query (deploy before or with the frontend). Decision 026 (the front door moves to a landing
page; search to `/search`; what it costs: one more click for people who came to search, every search address
changes, old links rely on the redirect). DESIGN.md: a "Landing page" section. Search engines: `/search` stays
indexable; the landing page becomes the site's described front page.
