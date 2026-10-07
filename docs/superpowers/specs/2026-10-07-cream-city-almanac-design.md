# Cream City Almanac — Design Spec

- **Date:** 2026-10-07
- **Status:** Draft for review
- **Product record:** [`PRODUCT.md`](../../../PRODUCT.md) (users, purpose, principles, brand rules)
- **Decisions:** [`docs/decisions/`](../../decisions/)

## 1. What we are building

An unofficial, phone-first finder for Milwaukee's **Data You Can Use (DYCU)** public data. A reporter types a plain-language question ("kids who can't afford food"), gets the right dataset families, understands what each one measures, previews real rows, and downloads the file. Signed-in users can also ask an AI that answers with real Hub data rendered as interface pieces, and save datasets, chats, and notes.

**For:** Tarik and the Radio Milwaukee newsroom first; an AI PM portfolio piece second.

**Success:** the right dataset, plus confidence in what it measures, in under 60 seconds on a phone.

**Not:** DYCU-branded, a replacement for DYCU's Hub, or a statistics engine.

## 2. Source material (verified 2026-10-07)

| Source | Where | What it gives | Gap |
|---|---|---|---|
| Hub catalog feed | `https://getdata-dycu.hub.arcgis.com/api/feed/dcat-us/1.1.json` | 382 items: title, description, keywords, `modified` date, landing page, download links | Descriptions are thin (median 88 characters) |
| Hub search API | `…/api/search/v1/collections/all/items` | Same items, GeoJSON-shaped | Not needed if the feed suffices |
| Hub data API (FeatureServer) | e.g. `services5.arcgis.com/3kr3fkJcIf6EOY6g/arcgis/rest/services/<name>/FeatureServer/0` | Column names and types; live rows via `/query`; sends `access-control-allow-origin: *` | Columns have no descriptions; `maxRecordCount` 1000 |
| ArcGIS item API | `https://www.arcgis.com/sharing/rest/content/items/<id>?f=json` | File type and name behind each document | — |
| DYCU inventory sheet | Google Sheet `1HoxLU8dRQmQegM3RMk1GFaJIenKBJCtkvaCi4_Jbosc` (`/export?format=xlsx`) | 101 inventory rows; **29 data-dictionary tabs** (field, description, source, calculation) | Dictionaries cover county datasets only |
| Source websites | CDC PLACES, Census ACS, FFIEC HMDA, MKE FreshAir, etc. | What each source is and what it can't tell you | Must be scraped (Firecrawl) |

**Item breakdown:** 93 downloadable datasets (92 with CSV/GeoJSON/Excel/Shapefile/etc., 1 with fewer formats), 7 apps/visualizations, 282 documents: 100 neighborhood portraits and 80 change-over-time reports (PDF; 2 spot-checked, about 800 KB each), 99 Excel spreadsheets, 3 info pages.

**Sheet data-quality findings** (feed into the mismatch report, and a possible cleanup list for DYCU):
- Typos: "Miwlaukee", "Visisted", "Prevelance", "Spreadhseet".
- Wrong year tags: "2022 Milwaukee Poor Mental Health Prevelance" tagged 2023; 2024 neighborhood rows tagged 2023.
- The "Milwaukee County Racial Demographics" tab has no inbound link; "Racial Demographics" rows link to the "Racial and Ethnic Diversity" tab.
- City-level datasets, visualizations, and reports have no dictionary tab.

## 3. Architecture

Two systems, plus three services they call:

```
Phone / desktop browser
  ├─ Next.js app on Vercel (App Router)
  │    ├─ pages: Search, Dataset sheet, Ask, Saved
  │    ├─ /api/copilotkit/[[...slug]]  ← CopilotKit v2 runtime (BuiltInAgent)
  │    └─ Clerk (sign-in UI + session token)
  ├─ Convex (reads/writes, live sync)
  │    ├─ catalog tables + keyword search index + vector index
  │    ├─ weekly cron → per-item build actions
  │    └─ user data: saved items, chats, notes, usage counters
  └─ ArcGIS FeatureServer (live preview rows, straight from the browser)

Called by Convex actions: Hub feed + item API, Google Sheet export, Firecrawl, AI model + embeddings
```

- **Next.js on Vercel** serves the pages and hosts the CopilotKit runtime route (`app/api/copilotkit/[[...slug]]/route.ts`).
- **Convex** holds the catalog and user data, runs search, and runs the weekly build. Convex limits verified: vector index dimensions 2–2048; `vectorSearch` returns 1–256 results and runs inside actions; crons via `crons.daily` / `crons.cron`.
- **Clerk** handles sign-in; Convex validates the Clerk identity on every user-data function; the chat sends the Clerk token as `headers: { Authorization: "Bearer …" }` (CopilotKit v2 auth pattern, verified).
- **Firecrawl** parses PDFs and scrapes source websites. **AI model + embeddings** are called through one provider. Provider is an open decision (§12); the default proposal is the Vercel AI Gateway.

## 4. Data model (Convex)

| Table | Holds | Key fields |
|---|---|---|
| `hubItems` | Raw Hub items as fetched | `hubId`, `kind` (dataset/document/app/page), `title`, `modified`, `inputHash`, raw JSON |
| `families` | Measure families | `code` (permanent, e.g. `F03`), `name`, `topic`, `retired` |
| `members` | One family × place × year | `familyCode`, `place` (City/County/neighborhood), `years[]`, `hubId`, `downloads{}`, `featureServerUrl` |
| `cards` | AI-written card content per family, versioned | `familyCode`, `version`, `explainer`, `glossary[]` (each with `provenance`), `caveats[]`, `storyAngles[]` |
| `docChunks` | Text from parsed PDFs/Excel for search | `hubId`, `page`, `text`, `embedding` |
| `sources` | Source-site profiles | `name`, `url`, `summary`, `limits` |
| `codes` | Permanent code registry | `code`, `familyCode`, `issuedAt`, `retiredAt`. A code is never reissued |
| `builds` | Each weekly run | `status`, `startedAt`, `costUsd`, `changed`, `failed`, `report` |
| `catalogState` | Which version is live | `liveVersion`, `asOf` |
| `overrides` | Hand fixes to grouping | `hubId` → `familyCode` / place / year |
| `settings` | Caps and limits | `buildCapUsd`, `chatPerUserPerDay`, `chatNewsroomPerDay`, `newsroomDomain`, `globalChatCapUsd` |
| `saved`, `chats`, `messages`, `notes` | User data | all keyed by Clerk `userId` |
| `usage` | Daily chat counters | `userId`, `date`, `messages`, `costUsd` |

**Provenance** is a field, not a style: every glossary entry, caveat, and explainer sentence group carries one of `HUB`, `DYCU`, `SOURCE_SITE`, `AI`.

## 5. Weekly catalog build

Runs as a Convex cron (weekly, plus a manual "run now" button), fanned out into one action per changed item so no single job runs long.

1. **Read the Hub.** Fetch the feed; classify each item as dataset, document, app, or page.
2. **Read the sheet.** Export the workbook as xlsx; parse the 29 dictionary tabs; match them to Hub items by normalized title. Unmatched items go into the **mismatch report**.
3. **Read the columns.** For each dataset, fetch FeatureServer metadata: column names, types, row count, year range.
4. **Read the documents.** Firecrawl parses the PDFs; Excel files are parsed directly. Text is split into chunks with page numbers.
5. **Read the sources.** Firecrawl scrapes about 10 source websites into short profiles.
6. **Group into families.** Strip year and place from titles with rules; AI handles leftovers; `overrides` win. Assign permanent codes to new families.
7. **Write the cards.** AI writes explainer, glossary, caveats, and story angles in a fixed schema. Where DYCU defined a column, the card uses DYCU's text with `DYCU` provenance. Output is validated; one retry; on second failure a basic card ships with Hub facts only.
8. **Fingerprint and publish.** Compute embeddings for cards and doc chunks; write everything as a **draft version**; run checks; flip `catalogState.liveVersion` only if checks pass.

**Rules:**
- **Only pay for what changed:** each item's inputs are hashed; unchanged items skip Firecrawl and the AI.
- **Never publish worse:** failures keep the last good version live; the site shows "Catalog as of [date] · last refresh failed" when the newest run failed.
- **Spending cap:** `settings.buildCapUsd` (default $5) halts AI calls for the run.

## 6. Search

- **Hybrid:** Convex full-text search index (exact words, so "HMDA" finds HMDA) plus vector search (meaning, so "kids who can't afford food" finds Food Insecurity). Results are blended and grouped by family.
- **Filters:** Topic, Place, Year.
- **Empty query** shows **Today's rundown**: the most recently modified datasets by Hub `modified` date.
- **Fallback:** if the embedding service fails, keyword-only results with a visible note.
- Report text (`docChunks`) is searchable; a hit shows the report name and page.

## 7. Screens

**Visual direction: The Rundown** (chosen 2026-10-07 from Impeccable's direction round; seed key `b5397139`, kind `pick`). The catalog as the day's radio show rundown: white paper, black type and thin rules, light-gray row banding, and red used **only** as grease-pencil marks. Decision comp: `.impeccable/mocks/decision/model-pick.webp`.

1. **Search (home).** `SLUG:` line is the search box. Results are rundown rows: permanent code · family name · place and source in small type · years as timecode-style cells. Before typing: Today's rundown.
2. **Dataset sheet.** Header with code and family name. A **place × year grid** (rows: City / County / neighborhoods; columns: years; filled cells mark available data). Then: *What it measures* → *Column guide* → *Caveats* → *Live preview* (first rows plus one chart, all years on one shared scale and baseline) → *Story angles* (tagged `AI`) → download bar, sticky on phones. Every fact carries its provenance tag.
3. **Ask.** Signed-in only. Full-screen on phones; docked side panel on desktop beside the sheet. Answers render rundown rows and sheet sections inline (§8).
4. **Saved.** Your own reorderable rundown of saved datasets, plus saved chats and notes.

**Grease-pencil marks:** red circle = updated since your last visit; tick = opened; number = saved position. Red has no other use.

**States:** loading (empty ruled rows); no results (offer Ask + `hub@datayoucanuse.org`); Hub down (preview says so, rest of sheet works); stale catalog (as-of banner).

**Comp corrections for the build:** the comp's date ("Apr 29, 2025"), its uniform "City, County" place labels, and its source labels are model inventions; the build uses real catalog values.

**Design workflow (at build time):** Impeccable comp-led path: `impeccable build-phase start --direction b5397139 --kind pick`, a comp round adding two variations of the Rundown home for approval, the direction contract in the surface brief, a measured build against the approved comp, finish review, and `DESIGN.md` written at the end.

## 8. Ask chat (CopilotKit v2)

Verified against current docs: import from `@copilotkit/react-core/v2` and `@copilotkit/runtime/v2`; `useComponent` renders our React components when the agent calls a tool; `useRenderTool` renders server tool progress/results; `CopilotChat` can be placed full-screen.

**Principle: the AI picks, the catalog fills in.** Tools take IDs; components load facts, links, and numbers from Convex or the Hub.

| Tool | Input | Renders |
|---|---|---|
| `searchCatalog` | query, filters | Rundown rows |
| `showDataset` | family code, optional place/year | Dataset sheet sections |
| `previewData` | member id, columns, limit ≤ 10 | Table / chart from live Hub rows |
| `getNumber` | member id, field, filter | The value with its source and the exact query. Only values present in the data; **no aggregation of tract percentages** in v1 |
| `readReport` | report id, question | Quoted passage with report name and page |

**Guardrails:** sign-in required; per-person daily limits (default 30, newsroom domain 200); global daily cap (default $10) pauses Ask while search keeps working; a server check flags any number in AI text that is absent from that turn's tool results as **unverified**; Firecrawl text is treated as data, never instructions; tools are read-only except saving your own items; input note "Don't paste private source info"; chats are deletable.

## 9. Errors and guardrails

| Where | Failure | Behavior |
|---|---|---|
| Build | Hub feed down or changed | Run stops; live catalog unchanged; as-of banner |
| Build | PDF unreadable | Report listed as "report text unavailable"; last good text kept |
| Build | AI card fails validation | One retry, then basic Hub-facts card |
| Build | Cost runaway | `buildCapUsd` stops AI calls |
| Build | Wrong grouping | Mismatch report; `overrides` table |
| Search | Embeddings down | Keyword-only with notice |
| Preview | Hub slow/down | 8-second timeout, retry message |
| Ask | Not signed in / limit hit / global cap | Sign-in prompt / reset time / Ask paused |
| Ask | AI states unsupported number | Marked unverified |
| Ask | Prompt injection via scraped text | Data-only handling; read-only tools |
| Accounts | Cross-user access | Convex functions check identity; saved data private |

All caps live in `settings` and change without a redeploy.

## 10. Testing

1. **Unit:** every one of the 382 real titles lands in exactly one family (fixture snapshot); tricky titles pinned; year/place parsing; permanent codes never reused; unverified-number guard; hybrid ranking blend.
2. **Integration (recorded fixtures, no live calls):** unchanged items skipped; draft goes live only after checks pass; failed run keeps live version; cost cap halts spending.
3. **Search report card:** ~25 reporter-style questions with expected families; **≥ 80% top-3**. Claude drafts them from the catalog; Tarik adds 5 real newsroom questions.
4. **Card accuracy:** DYCU-defined columns must use DYCU text (automated); AI-only glossary entries carry `AI`; Tarik spot-checks 10 random cards on the first build.
5. **End-to-end (Playwright, phone + desktop):** search → sheet → preview → download link; sign in → Ask → sheet renders in chat → save. Accessibility checks in the same run (WCAG 2.2 AA).
6. **Design fidelity:** Impeccable comp-diff and finish review against the approved comp.
7. **CI before first live deploy:** GitHub Actions runs typecheck, unit, integration, search report card, and build on every PR and push to `main`; end-to-end on preview deploys. Branch protection on `main` is a manual GitHub step for Tarik.

**Product success measures:** under 60 seconds to the right dataset (3 reporters × 5 tasks); search report card ≥ 80% top-3; zero unverified numbers in a sample of 20 chats.

## 11. Build order

1. **Catalog builder + search** in Convex, with fixtures and the search report card.
2. **Search and dataset sheet UI** (Impeccable comp round first).
3. **Clerk + saved items.**
4. **Ask chat** with tools and guardrails.
5. **CI, then Vercel deploy.**

## 12. Open decisions and unverified facts

- **AI provider and models:** decided 2026-10-07: Vercel AI Gateway with `anthropic/claude-sonnet-5.5` for cards and chat, and `openai/text-embedding-3-small` (1536 dimensions) for meaning fingerprints. Still unverified: which provider strings CopilotKit's `BuiltInAgent` accepts (its docs example uses `"openai:gpt-4.1"`); checked when Phase 4 is planned.
- **Costs:** per weekly run and per chat message, to be measured on the first full build; Firecrawl credits for ~180 PDFs unpriced.
- **Firecrawl API key:** the CLI (v1.19.21) is installed; `FIRECRAWL_API_KEY` is not set in the environment.
- **Convex:** per-action time limit and free-tier limits not verified.
- **Clerk:** free-tier limits not verified.
- **CopilotKit:** reloading saved messages into a v2 chat (for saved chats) not yet verified.
- **Document types:** 2 of 180 report PDFs spot-checked; the rest assumed PDF by title pattern.
- **Trademark:** no formal USPTO search for "Cream City Almanac"; `creamcityalmanac.com` was available on 2026-10-07 and was not registered.

## 13. Out of scope for v1

Place-first map home; computing county totals from tract data; CopilotKit Intelligence; DYCU branding; PocketBase or Postgres backends; languages other than English.
