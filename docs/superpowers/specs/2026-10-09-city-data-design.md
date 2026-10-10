# Cream City Almanac: City of Milwaukee Open Data (Phase 4a + 4b) — Design

Approved in conversation 2026-10-09 (Tarik): scope (catalog and Ask counting together; all 186 datasets, grouped),
counting filters (time, type, the data's own districts), privacy (Ask counts; names stay on the sheet), home rundown
(one list, CITY tag, daily feeds marked LIVE), approach A (ask the City live), Design Part 1 (catalog) and Part 2
(counting). Follows decision 014 (City data is Phase 4; Ask's tools stay source-agnostic).

## 1. Why

Data You Can Use describes what Milwaukee's neighborhoods are like; the City's portal records what happens: crimes,
crashes, fire and EMS calls, 311-style requests, permits, property. A reporter often needs both. This phase makes the
City's catalog part of the almanac and lets Ask count City records, with the same rule as before: every figure comes
from the data and is shown on a card, never typed by the AI.

Out of this phase (piece 3, later): neighborhoods (matching records to DYCU neighborhoods), "near an address", maps.

## 2. Verified facts (2026-10-09)

- data.milwaukee.gov runs CKAN. API at `https://data.milwaukee.gov/api/3/action/` (`package_search`, `datastore_search`,
  `datastore_search_sql` all answer 200 without a key). DCAT is also published (`/catalog.jsonld`).
- 186 datasets from 18 organizations. Groups: Elections & Campaign 65, Housing & Property 39, Maps 32, Public Safety 15,
  City Services 10, External 2. 72 are election files. Formats: CSV 118, Esri REST 43, PDF 25, SHP 23, ZIP 18, XLSX 12.
- 123 of 186 have a datastore-active resource (live-queryable). 44 were modified in the last week; 132 not in a year.
- Samples: NIBRS Crime Data (Current) 110,461 rows: `Incident_Date`, `Police_District`, `Offense_All` (NIBRS numeric
  codes, e.g. 120), `Location_All`, latitude/longitude; one row is dated 2027. Call Center Data (Current) 26,383 rows:
  `CREATIONDATE`, `OBJECTDESC` (address), `TITLE` (e.g. "Potholes"). MPROP 159,949 rows incl. `OWNER_NAME_1..3`,
  `OWNER_MAIL_ADDR`. Traffic Crash Data's datastore resource returns 0 rows.
- The DYCU build: Monday cron `internal.build.start`; items are `HubItem` (`convex/lib/types.ts`); families/members/
  codes/cards tables; codes are a topic letter + number from one registry (`convex/lib/codes.ts`, letters F W S V H E D,
  N documents, A apps, X other); the rundown sorts families by `latestModified` (`convex/search.ts` `rundownRows`);
  `/d/CODE` accepts `[A-Za-z]\d{2,3}`.

## 3. Scope

In: a City source in the weekly build; families, codes, AI cards and search for all 186; column profiles for live
datasets; CITY and LIVE marks; the private-names note; City sheets with live preview rows; the `countRecords` Ask tool
and its card; NIBRS offense names; Ask instruction updates; report-card City questions; decision 023.
Out: neighborhoods, address radius, maps, copying City rows into Convex, AI-written queries, Saved.

## 4. Catalog (Part 1)

### 4.1 Weekly import
- The Monday build reads the City catalog (CKAN `package_search`, paged) alongside DYCU's DCAT feed. Each CKAN package
  becomes a source item with `source: "city"`, its organization, groups, tags, modified date, landing page, downloads,
  and its datastore resource id when one is active.
- City items join the existing family grouping. "(Current)" / "(Historical)" pairs are one family; election files group
  by election type (e.g. one family per kind of election, years as members). Topics from City groups map to code
  letters: **P** Public Safety, **B** Elections, **C** City Services, **G** Maps; Housing & Property uses **H**.
  Codes come from the shared registry and are never reused.
- Cards (explainer, caveats, story angles, glossary) are written by the same pipeline, citing the City as source.
- If the City API fails during a build, City families from the last good build stay; the failure is logged on the
  build record. DYCU's part of the build is unaffected.

### 4.2 Column profiles (live datasets)
For each family's newest datastore resource, the build stores: columns and types; the date column used for time
(first of a known list: `Incident_Date`, `CREATIONDATE`, `CASEDATE`, …, else none); district columns (police district,
aldermanic district, ZIP when present); category columns with their top values (up to 200 distinct values, by count);
the row count; min/max date. A resource with 0 rows is profiled as "live rows unavailable".
Datasets that name private people are flagged by column names (owner name, owner mailing address, taxpayer name …).

### 4.3 How City data appears
- Search covers both sources in one list. A **CITY** provenance tag joins DYCU/HUB/AI on rows, sheets and cards.
- Daily feeds are marked **LIVE**. For them `latestModified` is the last structural change (new dataset, new or
  removed columns), not the daily refresh, so they don't flood "Updated this season".
- City sheets: code and name, CITY tag, explainer and caveats, the column guide from the profile, a preview of the
  newest rows (live, from the datastore), and the download link to the City. Flagged datasets show "Names private
  individuals. Shown as the City publishes it."
- Ask's existing tools (searchCatalog, showDataset, previewData) work on City families unchanged (decision 014's test).

## 5. Counting (Part 2)

### 5.1 `countRecords`
Arguments (structured; the model never writes a query): `code`; `from?`, `to?` (Milwaukee dates; default the last 12
months, stated on the card); `filters?` (column → allowed values); `groupBy?` (`month` | `year` | a category or district
column; at most 24 groups).

Server: resolve the family's live resource and profile; accept only profiled columns and values (case-insensitive, NIBRS
words mapped back to codes); a value that doesn't match returns `choose` with the closest real values (like `pickRow`);
build the SQL from whitelisted identifiers and escaped literals; exclude dates after today and report how many; run
with a 10-second timeout; rate-limit per account (`askCity` bucket, like `askEmbeds`). Returns counts only, never rows.

### 5.2 NIBRS offense names
A static table of the FBI's published NIBRS offense codes → names (e.g. 120 Robbery, 23H All Other Larceny) used in
profiles, filters, grouping labels and cards.

### 5.3 The count card
Ask's card style with the CITY tag: the count in large figures; the filters in words ("NIBRS Crime Data · Robbery ·
Police district 6 · Jan 1 – Oct 8, 2026"); with grouping, a small ruled table; caveats (future-dated records left out;
the dataset's own caveat); "Open the data →" to the City sheet.

### 5.4 Ask's instructions
Counts only through `countRecords`; no figures in prose (unchanged); never return or repeat an individual's record;
for flagged datasets decline individual lookups and point to the sheet; say when a dataset can't be counted live.

## 6. Errors and edge cases

City API down at build: keep last good City families. City down at question time: "The City's data didn't respond.
Try again shortly." and no number. Unknown category: choices. Non-live dataset: "can't be counted live" + link.
Future dates: excluded and counted. Huge groupings: capped at 24 (the rest summed as "Other"). Rate limited: the
existing busy message.

## 7. Testing

Unit: CKAN item mapping; family grouping for Current/Historical and elections; code letters; profile building
(date/district/category detection, private-name flag, empty resource); SQL builder (whitelist, escaping, date bounds,
future exclusion, group cap); NIBRS mapping; category matching and `choose`. Convex: build with a fake CKAN (success,
API failure keeps last good, empty datastore); `countRecords` with a fake datastore (ok, timeout, rate limit). e2e
(fake model): a City row with CITY and LIVE marks; a City sheet with preview and the private-names note; a count card
with filters in words; no owner name ever rendered in Ask. Report card: City questions (counts, a choose, a privacy
refusal) graded against the real model before the PR. Axe in light and dark on a City sheet.

## 8. Design process

The CITY tag, LIVE mark and count card follow existing components (provenance tags, Ask's number card). The reviewer
checks City rows, a City sheet and a count card against DESIGN.md, laptop and phone, light and dark. DESIGN.md gains the
new marks and the card; decision 023 records the choices above.

## 9. Open items for planning

- Confirm CKAN `package_search` paging and the datastore SQL dialect (PostgreSQL) on a real query.
- Choose the election grouping key from real titles.
- Decide whether profiles refresh weekly only or also on first use of a stale profile.
- Backend-first deploy: the Convex changes reach production before the PR's preview e2e.
