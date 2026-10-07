# 002: Pre-build the catalog weekly, and run the whole backend on Convex

**Decision:** A weekly job does all the AI and Firecrawl work ahead of time. Convex (a hosted backend: database, scheduled jobs, and search in one service) stores the result, runs search, and holds user data.

**Why this came up:** The app needs AI-written explanations for about 400 items, search by meaning, and a place to save chats. Where that work happens decides speed on a phone, monthly cost, and how many systems Tarik has to keep running. Getting it wrong means either slow, expensive searches or an ops burden for a side project.

**Options:**
1. **Live AI agent:** no preparation; the AI looks things up on every search. Cost: 5–15 seconds per search, a bill on every query, and answers that vary.
2. **Pre-built catalog with a database (Postgres) for user data:** fast and predictable. Cost: four systems to run (a GitHub job, a catalog file, a search function, a database), and we write the glue between them.
3. **Pre-built catalog, with Convex running everything:** the weekly job, the search, and user data in one service. Cost: dependence on one vendor, and search is a server call (around 100 ms) rather than a local file.
4. **PocketBase on Tarik's own server (a self-hosted, single-file backend):** $0 extra, and Tarik owns the data. Cost: Tarik runs backups, updates, and security; we write search ourselves; it's pre-1.0, so updates can break things.

**What we chose and why:** Pre-built (Tarik chose it over the live agent on Claude's recommendation), on Convex (Tarik chose it after comparing Postgres and PocketBase). Convex has search by meaning, keyword search, and scheduled jobs built in, and its jobs run real Node.js, so Firecrawl's and the AI's code libraries work there. That leaves two systems to run instead of four.

**What we gave up:** Hub changes show up after the next weekly run, not the same minute. Data lives with a vendor instead of on Tarik's own box. PocketBase's $0 running cost.

**How we'll know if this was right:** Search answers in under 300 ms on a phone; a weekly run costs under the $5 cap; Tarik spends zero hours a month on server upkeep.

**What actually happened:**
