# 311 requests by neighborhood — design

Status: design approved by Tarik 2026-10-20 ("approve": counts only, addresses never stored). Decision 057.

## 1. Why

An Arlington Heights organizer asked for a training. Neighbors there want to know about potholes, streetlights and dumping. The Almanac can count the City's 311 requests by type citywide. It can't count them by neighborhood, because the City publishes each request's street address but no map coordinates. Every Almanac neighborhood count places a record by its coordinates (`convex/lib/citySql.ts:225`).

**Success:** Ask answers "How many pothole requests in Arlington Heights this year, and how long did they take to close, next to the city?" The answer gives a count, days to close, and how many requests couldn't be placed. It works for the City's 190 neighborhoods and for DYCU's areas (built from tracts), for 2020 to now.

## 2. Facts this design rests on (checked 2026-10-20)

- **The 311 files** (data.milwaukee.gov):
  - "Call Center Data (Current)": resource `bf2b508a-…`, 33,349 rows, 2026-01-01 to 2026-10-19, refreshed daily.
  - "Call Center Data (Historical)": resource `abdfe983-…`, 175,840 rows, 2020-03-21 to 2025-12-31.
- **Columns:**
  - `CREATIONDATE` and `CLOSEDDATETIME`: dates with no time of day.
  - `OBJECTDESC`: the address, e.g. "8205 W HOLT AV, MILWAUKEE, WI, 53219-3851", sometimes with a unit ("2613 W CAPITOL DR, 3, MILWAUKEE, WI, 53206-1413").
  - `TITLE`: the request type, e.g. "Potholes", "Street Light Out", "Area Dark".
  - `CASECLOSUREREASONDESCRIPTION`: in practice, often the resident's own comment.
- **Geocoder test:** 1,000 current rows, sent to the Census batch geocoder (`/geocoder/geographies/addressbatch`, benchmark `Public_AR_Current`, vintage `Current_Current`).
  - 218 had no full address.
  - Of the 782 that did, 772 matched (98.7%), in 15 seconds.
  - Each match returns longitude and latitude plus state, county and tract codes.
- **Census batch limit:** at most 10,000 addresses per file.

## 3. What gets stored, and what never does

- **Stored:** counts only. Per **place × request type × year**:
  - `requests`: the number of requests.
  - `closed`: how many have a close date.
  - `days`: a histogram of days to close, as `{ [days]: count }` with whole days only. Histograms add exactly, so a median for any combination (a place across all types, a DYCU area built from tracts, several years) is exact.
- **Two kinds of place:**
  - `hood`: a City neighborhood name, by point-in-polygon against the City's boundary.
  - `tract`: the 2020 tract GEOID the geocoder returns. DYCU areas are added up from their tracts at read time.
- **Citywide** rows have place `city`. Citywide includes requests that couldn't be placed, so citywide totals match the City's file.
- **Unplaced,** per type × year:
  - `noAddress`: the row had no usable address.
  - `noMatch`: the geocoder found no match.
  - `outside`: the point fell outside every City neighborhood.
- **Never stored:**
  - Addresses: held in memory only during a batch.
  - Points.
  - The comment column: never selected from the City at all.
  - Any per-request row.

This fits the rule that nothing about a person or an address is stored. Decision 057 records the tradeoff: no block-level questions.

## 4. How a refresh runs

The weekly catalog build (`convex/build.ts`, next to `refreshFire`) calls `requests311.refresh311`. Steps:

1. **Choose files.** The current file is always recounted. The historical file is recounted only when its contents change: a fingerprint of row count, newest creation date and newest close date, stored with each run. The City re-uploads both files daily, so `last_modified` can't tell a changed file from a re-pushed one (found in review, 2026-10-20). The first run counts both. A run still "running" after 3 hours is marked failed, since a timed-out chunk never reaches its own error handling. A run younger than that makes the refresh skip that file, so two refreshes never count at once. The build's notes give each file's last result.
2. **Page through the file** with the datastore API, selecting `_id`, `CREATIONDATE`, `CLOSEDDATETIME`, `OBJECTDESC` and `TITLE` only.
3. **Batch.** Group rows into chunks of up to 5,000 distinct addresses, deduplicated within the chunk. Each chunk runs as its own scheduled action, because Convex actions stop at 10 minutes. The Census call for 5,000 addresses should take about 100 seconds at the tested rate.
4. **Clean each address** (pure function, tested):
   - Split on commas. Street = first part. City, state and ZIP5 = the last three parts.
   - Drop unit parts.
   - Rows with fewer than 4 parts, or no street number, count as `noAddress`.
5. **Geocode** with a multipart POST of the CSV to the batch endpoint. Parse the CSV reply: match, longitude/latitude, and state + county + tract into a GEOID. A failed HTTP call retries once. A second failure marks the run failed, and the stored counts for that file stay as they were (same approach as `markFireFailed`).
6. **Place each point** in a City neighborhood by testing it against the neighborhood boundaries (`inShape` from `lib/geo`).
   - The boundaries are loaded once per action in pages of 20. Reading all 190 shapes in one query passes Convex's 16 MB read limit, per the note in `convex/factSheet.ts`.
   - A bounding-box check runs first.
7. **Tally** each chunk into a staging table (`requests311Stage`, keyed by run ID, file, place, type and year) by adding counts and histograms. No addresses go into staging.
8. **Swap in.** When the last chunk of a file finishes, one mutation per year replaces that file's year rows from staging, then clears the staging rows for the run. Readers never see a half-counted year.
9. **Status table** `requests311Refresh`, one row per file: last run, status, `last_modified`, and the matched, unmatched and no-address totals. The build's notes list failures the way fire's do.

**Cost:** first run about 209,000 rows, so about 42 chunks and roughly 70 minutes of Census calls spread across chained actions. A typical week is about 40,000 current-year rows: 8 chunks, about 15 minutes. Free, no key.

**Courtesy limit:** one Census request in flight at a time.

## 5. How Ask uses it

New public query `requests311.count311`, and an Ask tool `count311`.

- **Inputs:**
  - `place`: a City neighborhood name, a DYCU area name, or empty for citywide.
  - `type`: optional. Request types match by words against the stored `TITLE`s, with groups: "potholes" covers "Potholes" and "Pothole in Alley", plus the City's earlier titles for the same requests, "Pothole" (until 2023-11-12) and "Pothole Alley Request" (2023–24); "streetlights" covers "Street Light Out" and "Area Dark"; "dumping" covers "Large Items Discarded on Private Property" and "Scattered Litter and Debris on Private Property".
  - `from` / `to`: years.
  - `groupBy`: `type` or `year`.
- **Output:**
  - Requests, closed, median days to close, and the same three figures citywide.
  - The unplaced counts.
  - A note on whether the area is a City neighborhood or a DYCU area built from tracts.
  - The caveat: "311 dates have no time of day, so a request closed the same day counts as 0 days."
- **Place lookup:**
  - City neighborhood names go through `matchName`, which offers a choice or says there's no such name and never guesses.
  - DYCU names use the area's newest tract list.
- **Prompt rule:** 311 by place goes to `count311`. Citywide 311 by type can still go to `countRecords`, but `count311` is preferred so the answer comes with a city comparison.
- **Card:** reuses the stored-count card style of `fireHistory`. It shows the "couldn't be placed" line whenever that count isn't zero.

## 6. Error handling

- **Census down:** the run is marked failed, old counts stay, and the card shows the stored "counted" date.
- **City file's columns change:** if a required column is missing, the run fails with a note naming the column. It never stores zeros.
- **Too few matches:** if a chunk's match rate drops below 80%, the chunk fails and is retried next week. That signals a format change, not real data.
- **Unknown place:** the user gets a choice or "no such neighborhood", never a citywide answer.

## 7. Testing

- **Pure unit tests:**
  - Address cleaning, including units, missing parts and "MILWAUKEE" as a street name.
  - Parsing a recorded Census batch reply.
  - Histogram merging and its median.
  - The type groups.
  - Assembling a DYCU area from tracts.
- **convex-test:**
  - Staging, then swap per year.
  - A failed run keeps the old counts.
  - The historical file is skipped when `last_modified` hasn't changed.
  - `count311` for a neighborhood, a DYCU area, citywide, an unknown place, and a type group.
- **Real-data check** (dev, with OK):
  - Run `refresh311` on dev.
  - Each year's citywide total must equal the City's own count.
  - The unplaced share must be reported.
  - Spot-check Arlington Heights potholes in 2026 against a hand count of geocoded rows.
- **e2e:** Ask "pothole requests in Arlington Heights this year" shows a card with the count and the city comparison.

## 8. Not in scope

- Maps of 311 points: points aren't stored.
- Block- or ward-level counts.
- The 2016–2017 "visualizations" file.
- Budget data.
- DNR data.

## 9. After merge

Tarik runs `npx convex run requests311:refresh311 --prod` once. The first run takes about 70 minutes, chained. Weekly refreshes then come with the catalog build.
