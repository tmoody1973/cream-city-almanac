# Cream City Almanac

> Look up your Milwaukee neighborhood. Every number says where it came from.

An unofficial, phone-first guide to Milwaukee's public data: [Data You Can Use](https://datayoucanuse.org)'s neighborhood data, the [City of Milwaukee's open data](https://data.milwaukee.gov), [Health Compass Milwaukee](https://www.healthcompassmilwaukee.org)'s ZIP code measures, and the U.S. Census Bureau's survey. Not affiliated with any of them. Built by Tarik Moody.

**Live:** https://www.creamcityalmanac.app · **New here?** [What's in the Almanac](https://www.creamcityalmanac.app/about) · [Start here](https://www.creamcityalmanac.app/start-here) · [How it works](https://www.creamcityalmanac.app/how-it-works), a real dataset sheet annotated in plain English.

## Overview

Milwaukee publishes a lot of data, in two places that don't talk to each other. Data You Can Use (DYCU) publishes what neighborhoods are like (income, housing, health) on an [ArcGIS Hub](https://getdata-dycu.hub.arcgis.com): 382 items with thin descriptions and cryptic column names. The City publishes what happens in them (crimes, fire and EMS calls, 311 requests, permits, property sales): 186 datasets on its CKAN portal and map server. Cream City Almanac puts both in one list a reporter can use on deadline, on a phone:

- **Search by meaning, not exact titles.** "kids who can't afford food" finds Food Insecurity Prevalence. When nothing is close, it says so instead of listing unrelated data.
- **Every dataset, grouped and coded.** DYCU's 382 items form 49 families; the City's 186 datasets form about 130. Each family has a permanent code like `F02`, so the 2022, 2023 and 2024 versions of one measure, or a City dataset's Current and Historical files, live together. City rows carry a CITY tag; daily feeds carry a LIVE mark.
- **Your address first.** Type an address on the home page or at `/n` to see your neighborhood, alder and aldermanic district, voting ward, and polling place (with its accessible entrance). The address goes to the Census Bureau's geocoder and is never stored.
- **A fact sheet for every City neighborhood.** DYCU's 27 profiled neighborhoods get printable sheets from DYCU's own figures. Every other City neighborhood gets the same nine figures built from census tracts, each tract shared out by how much of its land lies in the neighborhood, tagged CENSUS and labeled approximate. Each figure sits beside the City's, with "clearly higher", "clearly lower" or "about the same".
- **Plain-English dataset sheets.** What a dataset measures, a column guide, caveats, story angles, every file to download, and a live preview. Every fact carries its source: **DYCU** (DYCU's own definitions), **HUB** (the Hub listing), **CITY** (the City's catalog), **CENSUS** (the Census Bureau's survey), **HCM** (Health Compass Milwaukee), **SOURCE** (the source agency's website), or **AI** (written by AI from the facts above).
- **Ask, in plain English.** Sign in and ask a question; the answer points to the right dataset and, for the City's live data, counts the records (by date, type, district or neighborhood) and shows the number on a card with its source. Numbers come from the data, never from the AI's own words. Ask can also:
  - rank neighborhoods ("Which neighborhoods have the highest rent burden?") and test whether two measures go together, by neighborhood or by census tract;
  - describe a ZIP code (who lives there) and its health, food and hospital-visit figures from Health Compass Milwaukee;
  - answer history questions: crime counts and property values back to 2005, Fire Department calls since 2015, police stops 2019 to 2024, and election turnout;
  - answer "how long" questions, like 311 requests, permits, and how long vacant buildings have been on the City's list.
- **Take it with you.** Every answer card exports as a spreadsheet, plain text or an image with its source notes attached, and can be shared as a link anyone can open.
- **The neighborhood translator.** DYCU reports neighborhoods by census tract (small areas the Census Bureau draws); the City counts by its own official neighborhood boundaries. The almanac matches the two, so "Harambee" means the same place in both.
- **The map.** A count shows where it happened as shaded quarter-mile squares in three bands (1–4, 5–19, 20 or more), never as dots at addresses, inside the neighborhood's or the City's boundary. Located City sheets (crime, fire and EMS calls) get What / When / Where filters whose map you can share by link; the City's map layers (zoning, parcels, districts) draw for the area you're looking at.
- **Day and night editions**, a two-pane layout on laptops (the list beside the selected sheet, with Ask in a side rail), a short first-visit tour, and [`/about`](https://www.creamcityalmanac.app/about), which explains the whole product with its own working parts.

**Status:** live and in public use. Decisions, with what each one cost, are in [`docs/decisions/`](docs/decisions/).

## How it works

A weekly job (a Convex cron, a function that runs on a schedule, Mondays 09:00 UTC) rebuilds the catalog:

1. Reads DYCU's Hub catalog feed and its inventory spreadsheet (which holds DYCU's column definitions), and the City's CKAN catalog.
2. Groups items into families and assigns permanent codes. A code is never reused.
3. Reads the 180 neighborhood report PDFs with Firecrawl so search can match text inside them.
4. Profiles each live City dataset: its columns and most common values, the only things Ask may count by. It also refreshes the City's 190 neighborhood boundaries, the census-tract list behind the neighborhood translator, and the City's district, ward and investment-area boundaries.
5. Fetches the Census Bureau's figures for the City and for every Milwaukee County census tract (the tract figures build the neighborhood fact sheets and answers), plus Health Compass Milwaukee's ZIP code measures, Fire Department yearly totals, police stop counts and election turnout, each stored so Ask reads them instantly.
6. Asks Claude (through the Vercel AI Gateway) to write each family's plain-English card. DYCU's own column definitions always win over AI text.
7. Indexes cards and report text for keyword search and meaning-based (vector) search, which finds text that *means* something similar.

Unchanged items are skipped, so a typical weekly run costs cents. A failed run never replaces the live catalog.

When someone asks a question, Ask's AI picks a tested tool: search the catalog, read a dataset sheet, count City records, look up an address, rank or compare neighborhoods, describe a ZIP code, or read stored history. Counts run as live, read-only queries against the City's own database, built only from the columns and values in that dataset's profile, so the AI never writes the query. Maps are built the same way: the City returns quarter-mile cell counts, never coordinates, and only the cells reach the browser.

## Tech stack

| Layer | Technology |
|---|---|
| Web app | Next.js 16.4 (App Router), React 19.3, CSS Modules |
| Backend, database, search, cron | Convex 1.46 (full-text and vector indexes) |
| Sign-in | Clerk 7 (needed for Ask only; browsing is open) |
| Ask chat | CopilotKit 1.77 and the AI SDK, Claude Sonnet 5.5 through the Vercel AI Gateway |
| Maps | MapLibre GL JS 6.11 with OpenFreeMap streets (free, no key); City layers from the City's ArcGIS map server |
| Rate limiting | `@convex-dev/rate-limiter`: search embeddings, Ask, City counts, tract reads, address lookups, the public map |
| AI | Claude Sonnet 5.5 for dataset cards and Ask; OpenAI `text-embedding-3-small` for search; all through the Vercel AI Gateway |
| PDF reading | Firecrawl v2 |
| Source data | DYCU ArcGIS Hub (DCAT feed and FeatureServer API); City of Milwaukee CKAN (`datastore_search_sql`) and ArcGIS REST; U.S. Census Bureau ACS 5-year API and geocoder; Health Compass Milwaukee |
| Tests | Vitest 5 + convex-test, Playwright 1.63 + axe (phone and desktop), an Ask report card graded against the real AI |
| Design | [Impeccable](DESIGN.md) comp-led build; system recorded in [`DESIGN.md`](DESIGN.md) |

## Quick start

### Prerequisites

- Node.js 20.9 or newer (CI uses Node 22)
- A free [Convex](https://convex.dev) account
- For the weekly catalog build: a [Vercel AI Gateway](https://vercel.com/ai-gateway) key and a [Firecrawl](https://firecrawl.dev) key
- For Ask: a [Clerk](https://clerk.com) application with its Convex integration turned on

### Install and run

```bash
git clone https://github.com/tmoody1973/cream-city-almanac.git
cd cream-city-almanac
npm install
npx convex dev --once        # creates your Convex project and writes .env.local
```

Add the browser's copy of your Convex URL to `.env.local` (same value as `CONVEX_URL`):

```bash
echo "NEXT_PUBLIC_CONVEX_URL=$(grep '^CONVEX_URL=' .env.local | cut -d= -f2-)" >> .env.local
```

Set the build's keys in Convex. Type them in your own terminal; never commit them:

```bash
npx convex env set AI_GATEWAY_API_KEY <your-key>
npx convex env set FIRECRAWL_API_KEY <your-key>
```

For Ask, add your Clerk keys to `.env.local` (`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`), set `CLERK_FRONTEND_API_URL` in Convex, and set the same random `ASK_METER_SECRET` in both `.env.local` and Convex (`npx convex env set ASK_METER_SECRET <random-string>`).

Build the catalog once (about 25 minutes on Firecrawl's free plan, which reads report PDFs 7 seconds apart; roughly $1 of AI on the first run), then start the site:

```bash
npx convex run build:start
npm run dev                  # http://localhost:3000
```

## Environment variables

| Variable | Where | Purpose | Required |
|---|---|---|---|
| `CONVEX_DEPLOYMENT` | `.env.local` | Which Convex deployment the CLI talks to (written by `npx convex dev`) | Yes |
| `CONVEX_URL` | `.env.local` | Convex URL for server-side calls (written by `npx convex dev`) | Yes |
| `NEXT_PUBLIC_CONVEX_URL` | `.env.local`, Vercel | Convex URL for the browser | Yes |
| `AI_GATEWAY_API_KEY` | Convex env (and `.env.local` for Ask locally) | Card writing, search embeddings, and Ask's model. On Vercel, Ask uses the project's built-in OIDC token (a sign-in Vercel issues automatically) instead | For builds, meaning search and Ask |
| `FIRECRAWL_API_KEY` | Convex env | Reading report PDFs | For builds |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | `.env.local`, Vercel | Sign-in | For Ask |
| `CLERK_FRONTEND_API_URL` | Convex env | Lets Convex check Clerk's sign-in tokens (`CLERK_PREVIEW_FRONTEND_API_URL` for preview deploys) | For Ask |
| `ASK_METER_SECRET` | `.env.local`, Vercel, Convex env | Lets the Ask route record each answer's AI spend | For Ask |
| `CENSUS_API_KEY` | Convex env | The Census Bureau's survey: City and tract figures for fact sheets, ZIP profiles, tract populations. Never written to code, files or logs | For census figures |
| `E2E_CLERK_USER_EMAIL` | `.env.local` | A test user for the signed-in browser tests | For e2e |
| `TEST_ACCOUNTS` | Convex env, **dev only** | Comma-separated verified emails that get 10x the per-account City and tract limits, so back-to-back test runs don't drain them. Never set it on production | For e2e |

Without `AI_GATEWAY_API_KEY`, search still works on keywords only and says so. Ask's limits live in the Convex `settings` table: 30 questions a day per person (200 for newsroom email domains) and a $10 site-wide daily AI cap, after which Ask pauses until tomorrow.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Next.js dev server |
| `npm run build` / `npm start` | Production build / serve it |
| `npm test` | Unit and Convex tests (Vitest) |
| `npm run typecheck` | TypeScript check for the app (`npx tsc --noEmit -p convex` checks the backend) |
| `npm run e2e` | Playwright on an iPhone 13 and a 1440px desktop, including axe accessibility checks; starts the dev server itself. Ask tests use a scripted model, never the real AI |
| `npm run capture` | Design screenshots for Impeccable's comp comparison |
| `npm run fixtures` | Re-pins the Hub catalog and inventory test fixtures |
| `npm run ask:card` | Asks the real AI a set of reporter questions and grades the answers (costs a few cents per question; `--only=N` runs one) |
| `npx tsx scripts/city-sql-smoke.ts` | Checks that the City's live database still accepts every kind of query Ask builds |
| `npx convex run evals:searchReportCard` | Grades search on 26 reporter-style questions (target: 80%+ in the top 3) |

## Project structure

```
app/                 Next.js routes: front door (/), search (/search), dataset sheets (/d/[code]), neighborhood fact sheets
                     (/n, /n/[slug]), Ask (/ask, /ask/guide), shared cards (/s/[id]), What's in the Almanac (/about),
                     Start here, How it works, and the Ask API route (api/copilotkit)
ui/components/       Rundown rows, dataset sheets, Ask panel and cards, the map, grease-pencil marks
ui/lib/              Pure UI logic: formatting, marks, address parameters, map cells and layers
lib/ask/             Ask's prompt, tools and model wiring
convex/              Catalog build, search, Ask, City counts, the map, cron, rate limits
convex/lib/          Pure backend logic: Hub and CKAN parsing, grouping, City SQL, neighborhoods, the map grid
tests/               Vitest unit tests and pinned fixtures
e2e/                 Playwright tests (phone and desktop) and design captures
scripts/             The Ask report card, the City query smoke test, fixture tools
public/plates/       Grease-pencil images as served (originals with provenance in assets/plates/)
public/maplibre/     MapLibre's worker files (a test fails if they drift from the installed version)
docs/decisions/      Decision records: what was decided, why, and what it cost
docs/superpowers/    Design specs and implementation plans
DESIGN.md            The "Rundown" design system
PRODUCT.md           Product brief: users, purpose, principles
```

## AI use and costs

- **Cards:** Claude Sonnet 5.5 writes each family's explainer, column guide, caveats and story angles. AI-written facts are labeled `AI` on screen. Numbers shown on a sheet come from the data, never from the AI.
- **Ask:** Claude Sonnet 5.5 chooses tools and writes short replies; any number appears only on a card that came from the data. Each answer's spend is metered, with a $10 site-wide daily cap and 30 questions a day per person.
- **Search:** each search embeds the query once with `text-embedding-3-small`. Public search is capped at 600 per hour (bursts up to 100); past the cap it falls back to keywords with a notice.
- **The map:** no AI. Answers are cached for 10 minutes, and the public map is capped at 60 requests a minute site-wide (bursts up to 20) so the City's server isn't hammered.
- **Builds:** the first full catalog build costs about $1 of AI. Weekly rebuilds skip unchanged items and usually cost cents. Each build stops calling AI at a $5 cap (`settings.buildCapUsd`).
- **Firecrawl:** about 1 credit plus 1 per PDF page, only for new or changed reports.

## Design and decisions

- [`DESIGN.md`](DESIGN.md): the Rundown design system (a radio show's rundown sheet: ruled rows, permanent codes, red used only as grease-pencil marks, including the line drawn around the area a map count covers).
- [`docs/decisions/`](docs/decisions/): 55 numbered decision records, each with the options considered and the honest downside.

## License

[MIT](LICENSE) © 2026 Tarik Moody. Data © Data You Can Use, the City of Milwaukee, and their sources; see each dataset's source page for terms.
