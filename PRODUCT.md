# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

Mobile-first: phones are the primary device; desktop must work well too.

## Stack

Next.js (App Router) on Vercel · Convex (catalog, search, weekly refresh job, user data) · Clerk (sign-in) · CopilotKit v2 (Ask chat with generative UI) · Firecrawl (parsing report PDFs and source websites). Next.js was proposed because CopilotKit's runtime route expects it; confirmed by the user.

## Users

1. **Primary:** Tarik and the Radio Milwaukee newsroom. Reporters on a phone, mid-story, often on deadline, who need a trustworthy local dataset fast and need to know what it actually measures before they cite it.
2. **Secondary:** portfolio reviewers (people hiring AI product managers) evaluating the product thinking and craft.

## Product Purpose

Find, understand, and download Data You Can Use's (DYCU) public Milwaukee data by meaning, not by exact title. Today the data is listed in a Google Sheet inventory (101 rows) and stored on the DYCU ArcGIS Hub (382 items) with thin descriptions and cryptic column names.

Success: a reporter lands on the right dataset, and is confident what it measures, in under a minute on a phone.

## Positioning

- Groups DYCU's ~400 items into measure families across years and geographies (e.g. one "Households Living in Poverty" with County/City × 2022/2023/2024 tabs instead of six near-duplicate rows).
- Explains cryptic columns in plain English and labels the source of every fact (Hub, DYCU's definitions, source website, or AI-written).
- The Ask chat answers with real Hub data rendered as cards, previews, and download buttons; it never shows numbers or links typed by the AI.

## Operating Context

- Newsroom work: deadlines, phones, often one-handed; desktop for deeper digging.
- Source of truth: the DYCU ArcGIS Hub (https://getdata-dycu.hub.arcgis.com) and the DYCU Hub Data Inventory Google Sheet.
- When data is missing, the path is emailing hub@datayoucanuse.org.

## Capabilities and Constraints

- Topic search (by meaning plus exact keywords) is the home screen and is public; no sign-in.
- Dataset family cards carry: plain-English explainer, glossary, year/geography tabs, live data preview (rows plus a quick chart or mini map), AI-suggested story angles (labeled), and download links.
- Ask tab: AI chat, full-screen on phones and a side panel on desktop. Requires sign-in, with per-person daily message limits (higher for the newsroom's email domain).
- Signed-in users can save chats, datasets, and notes.
- Catalog refreshes weekly; a failed refresh never replaces the live catalog.
- Numbers come only from Hub queries. v1 does not aggregate tract-level percentages into county totals.

## Brand Commitments

Name: **Cream City Almanac**. "Cream City" is Milwaukee's nickname (from its cream-colored brick); an almanac is a reference of facts organized by year, matching the product's year-grouped dataset families.

Unofficial. Must not use DYCU's name or logo as its own brand. Carries a credit line, "Built on Data You Can Use's public data", linking to datayoucanuse.org.

## Evidence on Hand

- Hub catalog feed: 382 items (93 downloadable datasets, 282 documents, 7 apps), via `/api/feed/dcat-us/1.1.json`.
- Google Sheet inventory: 101 rows plus 29 data-dictionary tabs.
- Live Hub rows via the ArcGIS FeatureServer API (cross-site requests allowed).
- Documents: 100 neighborhood portraits and 80 change-over-time reports (PDF; 2 spot-checked), 99 Excel spreadsheets, 3 info pages.
- Absent: usage data, testimonials, and any DYCU endorsement. Never fabricate these.

## Product Principles

1. The AI picks; the catalog fills in.
2. Every fact shows its source.
3. Deadline speed on a phone.
4. Plain English first, jargon defined.
5. Never publish worse.

## Accessibility & Inclusion

WCAG 2.2 AA.
