# Cream City Almanac

> An unofficial, phone-first way to find, understand, and download Milwaukee's public data.

Built on [Data You Can Use](https://datayoucanuse.org)'s public data; not affiliated with DYCU. Built by Tarik Moody.

**Live:** https://cream-city-almanac.vercel.app · **Start here:** [How it works](https://cream-city-almanac.vercel.app/how-it-works), a real dataset sheet annotated in plain English.

## Overview

Data You Can Use (DYCU) publishes Milwaukee's neighborhood data on an [ArcGIS Hub](https://getdata-dycu.hub.arcgis.com): 382 items with thin descriptions and cryptic column names. Cream City Almanac makes that catalog usable for a reporter on deadline, on a phone:

- **Search by meaning, not exact titles.** "kids who can't afford food" finds Food Insecurity Prevalence. When nothing is close, it says so instead of listing unrelated data.
- **Every Hub item, grouped.** All 382 items (93 raw data, 282 reports, 7 visualizations, the same counts as the Hub's own filter) are grouped into 49 families with permanent codes like `F02`, so the 2022, 2023 and 2024 City and County versions of one measure live together.
- **Plain-English dataset sheets.** What a dataset measures, a column guide, caveats, and story angles. Every fact carries its source: **DYCU** (DYCU's own definitions), **HUB** (the Hub listing), **SOURCE** (the source agency's website), or **AI** (written by AI from the facts above).
- **Live preview and downloads** straight from DYCU's Hub: the first rows, and a chart with every year on one shared scale.

**Status:** Phase 2.5 is live: search, results and dataset sheets on phones; a two-pane layout on laptops (list beside the selected sheet, choice kept in the address); and the How it works page. Next up: sign-in and an Ask chat (CopilotKit), then saved items. See [`docs/decisions/`](docs/decisions/).

## How it works

A weekly job (a Convex cron, a function that runs on a schedule, Mondays 09:00 UTC) rebuilds the catalog:

1. Reads DYCU's Hub catalog feed and its inventory spreadsheet (which holds DYCU's column definitions).
2. Groups items into families and assigns permanent codes. A code is never reused.
3. Reads the 180 neighborhood report PDFs with Firecrawl so search can match text inside them.
4. Asks Claude (through the Vercel AI Gateway) to write each family's plain-English card. DYCU's own column definitions always win over AI text.
5. Indexes cards and report text for keyword search and meaning-based (vector) search, which finds text that *means* something similar.

Unchanged items are skipped, so a typical weekly run costs cents. A failed run never replaces the live catalog. The site is Next.js on Vercel and reads the catalog from Convex.

## Tech stack

| Layer | Technology |
|---|---|
| Web app | Next.js 16.4 (App Router), React 19.3, CSS Modules |
| Backend, database, search, cron | Convex 1.46 (full-text and vector indexes) |
| Rate limiting | `@convex-dev/rate-limiter` (public search embedding cap) |
| AI | Claude Sonnet 5.5 for dataset cards; OpenAI `text-embedding-3-small` for search; both through the Vercel AI Gateway |
| PDF reading | Firecrawl v2 |
| Source data | DYCU ArcGIS Hub (DCAT feed and FeatureServer API) |
| Tests | Vitest 5 + convex-test, Playwright 1.63 + axe (phone and desktop) |
| Design | [Impeccable](DESIGN.md) comp-led build; system recorded in [`DESIGN.md`](DESIGN.md) |

## Quick start

### Prerequisites

- Node.js 20.9 or newer (CI uses Node 22)
- A free [Convex](https://convex.dev) account
- For the weekly catalog build: a [Vercel AI Gateway](https://vercel.com/ai-gateway) key and a [Firecrawl](https://firecrawl.dev) key

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
| `AI_GATEWAY_API_KEY` | Convex env | Card writing and search embeddings | For builds and meaning search |
| `FIRECRAWL_API_KEY` | Convex env | Reading report PDFs | For builds |

Without `AI_GATEWAY_API_KEY`, search still works on keywords only and says so.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Next.js dev server |
| `npm run build` / `npm start` | Production build / serve it |
| `npm test` | Unit and Convex tests (Vitest) |
| `npm run typecheck` | TypeScript check for the app (`npx tsc --noEmit -p convex` checks the backend) |
| `npm run e2e` | Playwright on an iPhone 13 and a 1440px desktop, including axe accessibility checks; starts the dev server itself |
| `npm run capture` | Design screenshots for Impeccable's comp comparison |
| `npm run fixtures` | Re-pins the Hub catalog and inventory test fixtures |
| `npx convex run evals:searchReportCard` | Grades search on 26 reporter-style questions (target: 80%+ in the top 3) |

## Project structure

```
app/                 Next.js routes: home (/), dataset sheets (/d/[code]), error and not-found pages
ui/components/       Rundown rows, previews, dataset sheet, live Hub preview, grease-pencil marks
ui/lib/              Pure UI logic: formatting, marks, preview helpers, search notices
convex/              Catalog build pipeline, search, public catalog queries, cron, rate limits
convex/lib/          Pure backend logic: Hub feed parsing, grouping, cards, ranking, retries
tests/               Vitest unit tests and pinned fixtures
e2e/                 Playwright tests (phone and desktop) and design captures
public/plates/       Grease-pencil images as served (originals with provenance in assets/plates/)
docs/decisions/      Decision records: what was decided, why, and what it cost
docs/superpowers/    Design spec and implementation plans
DESIGN.md            The "Rundown" design system
PRODUCT.md           Product brief: users, purpose, principles
```

## AI use and costs

- **Cards:** Claude Sonnet 5.5 writes each family's explainer, column guide, caveats and story angles. AI-written facts are labeled `AI` on screen. Numbers shown on a sheet come from Hub data, never from the AI.
- **Search:** each search embeds the query once with `text-embedding-3-small`. Public search is capped at 600 per hour (bursts up to 100); past the cap it falls back to keywords with a notice.
- **Spend:** the first full catalog build costs about $1 of AI. Weekly rebuilds skip unchanged items and usually cost cents. Each build stops calling AI at a $5 cap (`settings.buildCapUsd`).
- **Firecrawl:** about 1 credit plus 1 per PDF page, only for new or changed reports.

## Design and decisions

- [`DESIGN.md`](DESIGN.md): the Rundown design system (a radio show's rundown sheet: ruled rows, permanent codes, red used only as grease-pencil marks).
- [`docs/decisions/`](docs/decisions/): numbered decision records, each with the options considered and the honest downside.

## License

[MIT](LICENSE) © 2026 Tarik Moody. Data © Data You Can Use and its sources; see each dataset's Hub page for terms.
