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
