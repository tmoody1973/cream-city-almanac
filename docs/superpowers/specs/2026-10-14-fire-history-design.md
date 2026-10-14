# Cream City Almanac: Fire Department Calls and Response Times by Year (Project L3) — Design

Tarik approved this design in conversation on 2026-10-14, part by part.

It is **L3**, the third of four parts of Project L (decision 044). The earlier parts are live:
- L1, the Fire Department's dispatch and on-scene times;
- L2, ages of open cases.

## 1. Why

Ask's Fire Department answers read one year of one file. Fire Incident Detail is profiled from its 2021 file ("This file covers 2021 only"), so "how many fire calls were there in 2018" and "has response time changed since 2015" can't be answered. The City publishes 2015–2023 as yearly files and 2024 onward in a newer system's file.

## 2. What the exploration found (2026-10-14, live City data)

**Fire Incident Detail (Historical), one file per year:**

| Year | Resource id | Rows | Columns | Date shape |
|---|---|---|---|---|
| 2015 | `97509bea-dfa4-435e-aa75-5499adf7bbe0` | 115,960 | spaces ("Date Received") | `1/1/2015 8:07` (to the minute) |
| 2016 | `5d2d6ce8-e4f6-4c41-a800-31e4eface37f` | 118,536 | spaces | `M/D/YYYY H:MM` (to the minute) |
| 2017 | `25a3fb9e-161c-416e-82da-6837c704b643` | 118,329 | spaces | `M/D/YYYY H:MM` (to the minute) |
| 2018 | `18d887be-4254-4386-b9b4-f1a8c016db38` | 127,798 | spaces | ISO with seconds |
| 2019 | `99b49b76-50e6-4b13-b61d-20e94078b310` | 118,978 | spaces | `M/D/YYYY H:MM` (to the minute) |
| 2020 | `8aae2885-b3ac-4ba9-a1e3-daab4464c835` | 99,004 | underscores ("Date_Received") | `01/01/20 12:08 AM` (to the minute; the text NULL for blanks) |
| 2021 | `d1068a0d-b118-4a29-99c3-ee56c9c6f461` | 101,748 | underscores | ISO with milliseconds |
| 2022 | `b184f543-ce98-429d-99a4-3a2dddda3d98` | 114,715 | underscores | ISO with milliseconds |
| 2023 | `d18ef942-9630-4b82-b5a1-61fad0af422a` | 121,073 | underscores | ISO with milliseconds |

- Every file has received, dispatched, arrived and cleared times, and an original and final call type. About 3 rows a year have no received date.
- **Call types:**
  - 42 in 2015 and 49 in 2023;
  - 24 names are shared between 2015 and 2023;
  - spellings drift ("ems" in 2015, "EMS" in 2023);
  - EMS is about 85% of calls.

**MFD Calls for Service Detail (Current), `city:mfd-calls-for-service-detail`** (resource `cdf51c45-…` today; read from its stored profile):
- 350,530 rows, starting **2024-02-20 05:46:50**:
  - 2024: 119,483 rows;
  - 2025: 138,000 rows;
  - 2026 so far: 93,047 rows.
- **Columns:** `IncidentStarted`, `FirstUnitDispatched`, `FirstUnitArrived`, `IncidentClosed`, `IncidentType` (ISO times with seconds).
- **Only 6 broad types:** EMS (113,192 in 2025), Fire/Rescue (20,323), Shared Services, Test (488), Special Event, and blank.
- **Jan 1 – Feb 19, 2024 is in neither file.**
- L1 measured the same median time to dispatch in both systems (about 1.6 minutes, 2021 versus 2024–2026).

**A probe on the City's server** (2015 and 2020, grouped EMS versus other, medians of dispatch and arrive) took about 3 seconds per year. The firewall accepts `to_timestamp(x, 'MM/DD/YYYY HH24:MI')` and `'MM/DD/YY HH12:MI AM'`. It refuses `left()` in a WHERE clause; `LIKE '2025-%'` works.

## 3. Decisions (Tarik, 2026-10-14)

- **Scope:**
  - calls per year by type, 2015–2023;
  - response times by year;
  - carry on into 2024–2026 from the MFD file.
- **Approach:** a stored yearly summary (like K3 stop-and-search), not live reads across files.

## 4. The sources (`convex/lib/fireYears.ts`)

```ts
type DateShape = "iso" | "mdy4-minute" | "mdy2-ampm";
type FireSource =
  | { kind: "incident"; year: number; resourceId: string; cols: { received: string; dispatched: string; arrived: string; type: string }; shape: DateShape; toMinute: boolean }
  | { kind: "mfd"; familyKey: "city:mfd-calls-for-service-detail"; from: number }; // years from 2024 to the current year
export const FIRE_SOURCES: FireSource[]; // the 9 yearly files above, then the MFD file
```

**How each date shape is read** (`NULL` when it doesn't match):
- `iso`: the existing ISO pattern, then `::timestamp`.
- `mdy4-minute`: `^[0-9]{1,2}/[0-9]{1,2}/(19|20)[0-9]{2} [0-9]{1,2}:[0-9]{2}$`, then `to_timestamp(x, 'MM/DD/YYYY HH24:MI')`.
- `mdy2-ampm`: `^[0-9]{2}/[0-9]{2}/[0-9]{2} [0-9]{2}:[0-9]{2} [AP]M$`, then `to_timestamp(x, 'MM/DD/YY HH12:MI AM')`.

**Partial years:** 2024 is marked partial, with the note that it starts Feb 20. The current year is marked "so far".

## 5. The refresh (`convex/fire.ts`, `refreshFire`)

An internal action. For each year:

1. **Skip a year already counted,** unless it is an MFD year: 2015–2023 never change. `refreshFire({ force: true })` re-reads every year.
2. **Group query** (one per year), on the City's server:
   - **Inner query:** received (`r`), dispatched (`d`), arrived (`a`), and a group `g`. EMS when the upper-cased, trimmed type equals `EMS`; otherwise other.
   - **MFD filters:** rows where `IncidentStarted LIKE '<year>-%'`, with `IncidentType` not `Test`.
   - **Outer query, per `g`:** calls; median and 90th percentile of `d − r` and of `a − r` in minutes, only where the later time is on or after `r`; how many were measured; unreadable received dates; times that run backwards.
   - The "all" row is a second query without the group, so its medians are true medians and not averages of the two groups.
3. **Type query** (incident years only): calls per final call type, grouped on the City's server. Spellings are merged in code, keyed by upper-cased trimmed text. The label kept is the spelling with the most calls.
4. **Store:** the year's rows replace its old rows in one mutation, and `fireRefresh` records `{ year, status: "counted" | "failed", note?, counted }`. A failed year keeps its last good rows. Errors give notes, never exceptions.
5. **Timeout:** 25 seconds per query (`SPAN_QUERY_TIMEOUT_MS`).

**When it runs:**
- the weekly build calls it after the stop-and-search refresh;
- by hand: `npx convex run fire:refreshFire` (add `--prod` for the live site).

**Tables:**

```ts
fireYears: { year, group: "all" | "ems" | "other", calls, dispatch: Span | null, arrive: Span | null, unreadable, backwards, source: "incident" | "mfd", partial: string | null, toMinute: boolean }
  // Span = { median: number; p90: number; n: number } (minutes); index by_year
fireTypes: { year, type, calls }   // index by_year
fireRefresh: { year, status, note?, counted }   // index by_year
```

## 6. The tool (`fireHistory`, a public query)

- **Args:**
  - `measure`: `"calls" | "dispatch" | "arrive"`;
  - `group?`: `"all" | "ems" | "other"`, default all;
  - `type?`: a call type, `calls` only, 2015–2023;
  - `from?` and `to?`: years.
- **No stored rows** → `{ status: "refused", reason: "Fire Department history hasn't been built yet." }`
- **`type` given:**
  - matched case-insensitively against stored types;
  - no match → `{ status: "choose", asked, choices }`, the 12 types with the most calls;
  - with a range past 2023 → the range is cut to 2023, with a note.
  - A `type` with `measure` other than `calls` → refused: "Response times are by EMS versus other calls, not by call type."
- **Ok result:**

  ```ts
  { status: "ok", title, measure, group, type: string | null,
    rows: { year: number; calls: number; median: number | null; p90: number | null; n: number | null; partial: string | null }[],
    notes: string[], source: string }
  ```

  The title is "Milwaukee Fire Department · {calls | time to dispatch | time to arrive}{ · EMS | · non-EMS calls | · {type}} · {first}–{last}".

**Notes,** only when they apply:
- "From 2024 the City publishes calls from a new system (MFD Calls for Service); years before and after are close but not identical."
- "Jan 1 – Feb 19, 2024 isn't in either file, so 2024 is short."
- "2015–2017, 2019 and 2020 record times to the minute, so their medians are whole minutes."
- "Call types end in 2023; the new system has only broad types."
- "{n} records had unreadable times or times that run backwards and weren't measured."
- "{year} so far."

**Source:** "City of Milwaukee: Fire Incident Detail (2015–2023) and MFD Calls for Service Detail (2024 on)."

## 7. The card (`FireHistoryCard`)

| Part | Content |
|---|---|
| Title | The tool's title + a **CITY** tag |
| Table | Year · Calls (calls) or Year · Calls measured · Median · 9 in 10 (times). Minutes read like L1: "5.9 min". Partial years carry their note in the row label ("2024 (from Feb 20)", "2026 (so far)"). |
| Notes | The tool's notes, then the source |
| Export | CSV, text and PNG through `cardExport` |
| Share | Added to `SHAREABLE` (stored data, like turnout) |
| Follow-ups | "EMS ONLY" or "ALL CALLS" · the other time measure · "BY CALL TYPE" for calls (asks about the top type, 2015–2023) |

## 8. Ask

- **Tool description:** Fire Department calls and response times by year, 2015 to now, from stored yearly totals. Types run 2015–2023 only. One year's details, by ZIP or type, stay with countRecords and timeSpan. The card carries every figure; don't restate them.
- **Prompt line:** "Fire Department calls or response times across years go to fireHistory; one year's details stay with countRecords and timeSpan."
- **Scripted test model:** "fire calls each year" → `fireHistory({ measure: "calls" })`.
- **Graded real-AI question:** "Has the Fire Department's time to arrive changed since 2015?" must reach `fireHistory` with `arrive`.

## 9. Testing

**Unit (Vitest):**
- each date shape's SQL reader (the pattern and the format);
- the SQL per source: column names, the MFD year and Test filter, and the group;
- merging type spellings;
- the tool's title, notes and range cut;
- the card's export and follow-ups.

**Database (convex-test, the City faked):**
- the refresh stores years;
- it skips counted incident years unless forced;
- it re-reads MFD years;
- a failed year keeps its rows and records the failure;
- the tool's ok, choose, refused and type-past-2023 cases.

**Live on dev (with Tarik's OK):**
- one full refresh;
- 2021 should match L1's measures (dispatch about 1.6 minutes, arrive about 5.9);
- each year's calls should match the table in §2, within the dropped Test and blank-date rows.

**Browser (Playwright):** the scripted question draws the card.

**Graded real-AI question:** §8, about $0.05.

## 10. Docs

- **Decision 047:**
  - a stored summary versus live reads across files;
  - the 2024 system change and gap;
  - minute-only years.
  - "What actually happened" is left blank.
- **/how-it-works:** one sentence.
- **The questions document:** "How many Fire Department calls were there each year?" and "Has the time to arrive changed since 2015?" become **Now**.

## 11. Going live

Merging deploys the code. Tarik runs `npx convex run fire:refreshFire --prod` once, about 10 queries of a few seconds each. After that, the weekly build keeps the MFD years current.

## 12. Out of scope

- live reads across yearly files;
- call types for 2024 onward;
- yearly figures by ZIP or place;
- the Fire Unit Status files;
- EMS Calls for Service Detail (a separate City file);
- employee tenure (L4).
