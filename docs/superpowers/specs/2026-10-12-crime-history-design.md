# Cream City Almanac: Crime History (Files Split by Period, Part 1) — Design

Tarik approved this design in conversation on 2026-10-12, section by section.

It is **K1**, the first part of Project K ("files split by period", gap 6 in docs/research/2026-10-12-questions-by-audience.md). The other parts get their own specs later:
- **K2:** the property file by year;
- **K3:** quarterly stop-and-search;
- **K4:** elections.

## 1. Why

Ask's City counts read one file per dataset: the "(Current)" one. For crime, that file starts on Jan 1, 2024. Today:
- "Robberies in 2019" is refused as outside the data's range.
- "Robberies 2022–2024" quietly counts only 2024, clamped.
- The City's Historical crime file holds the earlier incidents, and no count reads it.

Questions about change over time ("did robberies fall since 2019?") are among the most common accountability questions, and Ask can't answer them.

## 2. What the exploration found (2026-10-12, live City data)

**Four shapes of "split by period" in the City catalog:**
- **Current + Historical pairs:** crime (`city:nibrs-crime-data`) and 311 (`city:call-center-data`). Counts read only "(Current)".
- **One package per quarter:** MPD stop-and-search, about 12 quarterly packages with about 30 tables each.
- **One package with a file per year:** MPROP Historical, 52 "Parcel Tax - MPROP <year>" files.
- **One dataset per election:** 5 election dates, with 50–144 race files per package.

**The crime pair:**
- **Current:** 110,644 rows, 2024-01-01 onward.
- **Historical:** 1,091,606 rows, dated 1991-01-01 to 2023-12-31.
- **Columns:** identical in both. They are `Case_Number`, `Incident_Date`, `Incident_Last_Edited`, `Offense_Last_Edited`, `Police_District`, `Offense_All`, `Location_All`, `Address_Longitude`, `Address_Latitude` and `Weapon_Used_All`.
- **Offense codes:** the national NIBRS codes on both sides of the seam (2023: 240, 520, 13B, 13A, 290, 23F; 2024: the same set), and also in 2005.

**The years are uneven.** The Historical file holds 2–140 records a year for 1991–2004, then 38,949–74,742 a year for 2005–2023. Current holds 44,420 for 2024, 39,210 for 2025 and 27,013 for 2026 so far. **Crime records are complete only from 2005.**

**The 311 pair:**
- **Current:** 2026 only, 27,774 rows.
- **Historical:** 2020-03-21 to 2025-12-31.
- **Columns:** identical.
- **The archive has a hole.** It holds about 20,000 requests a month from May to November 2020, then about 300 a month from December 2020 through 2025, against about 2,900 a month in 2026. **The archive is missing most requests after November 2020, so joining it would mislead.**

**Also:**
- **311 today:** "last 12 months" (with no dates asked) is clamped to Jan 2026 onward, so it covers about 9 months.
- **The City's SQL** (`datastore_search_sql`) accepts `UNION ALL` across two resources (checked: Jun 2023 – Jun 2024 gave 48,429). The dates are text, so `date_part` fails.
- **Only `citySql.ts` (counts, maps, tract counts) needs the archive.** It is one of three query builders that name a file. The other two, `measureSql.ts` (sums and medians) and `spanSql.ts` ("how long"), have no measure or span pair on the crime file.

## 3. Decisions (Tarik, 2026-10-12)

- **Scope:** K1 only: Current + Historical.
- **Approach:** one query over both files (approach A), not adding up in code and not one file per question.
- **Which pairs:**
  - **Crime** is joined, counting from 2005-01-01.
  - **311 is not joined;** it keeps its Current file and gets an honest note.

## 4. The data

**A hand-kept list,** `ARCHIVES` in `convex/lib/cityFamilies.ts` (beside `REPLACED_BY` and `CITY_NOTES`), keyed by family key:

```
"city:nibrs-crime-data": { join: true, from: "2005-01-01",
  note: "The City's crime records are complete from 2005; earlier years hold only a few stray records." }
"city:call-center-data": { join: false,
  note: "The City's earlier 311 file (2020–2025) is missing most requests after November 2020, so counts here start in 2026." }
```

**When the build profiles a family's representative file** (`profileCity`, unchanged for every other family), and the family has an `ARCHIVES` entry with `join: true`:
1. **Find the archive.** It is the family's member whose title ends "(Historical)" and has a `datastoreId`. Without one, nothing is joined, and a build note says why.
2. **Check the columns.** Read the archive's columns (`datastoreFields`). Unless its sorted column names *and types* equal the representative's, nothing is joined, and the note reads "<name>: Historical file's columns differ; counting the Current file only".
3. **Store the archive** on the profile:

   ```
   archive: { resourceId: string; before: string }
   ```

   `before` is the entry's hand-kept `seam` ("2024-01-01"), never read from the data: one mistyped date in Current would otherwise move it. Historical rows count only before it, Current rows only from it. If Current holds records dated before the seam, the build note says combined counts leave them out.
4. **Move the profile's start.** `minDate` becomes the entry's `from` ("2005-01-01"). Everything that shows or clamps to the data's range (counts, the dataset page, its map) then uses 2005 automatically. `rowCount`, `categories` and the rest stay the representative's.

A family with `join: false` gets no archive; its `note` is used as in §6.

**A new step, `internalAction build:reprofileCity({ familyKey })`,** re-profiles one City family's representative without touching its AI-written card. It exists for going live and for dev checks. Its result is the build notes.

**Nothing else is stored.** No City rows are copied.

## 5. The query (`convex/lib/citySql.ts`)

**Picking the source.** After the period is settled (the asked dates or the default last 12 months, then clamped to the data's range), `sourceFor(p, from, to)` returns the table expression:

| Period | Source |
|---|---|
| no `p.archive`, or `from >= archive.before` | `"<representative id>"` (exactly today's SQL) |
| `to < archive.before` | `"<archive id>"` |
| otherwise | `(SELECT <columns> FROM "<archive id>" WHERE "<date column>" < '<before>' UNION ALL SELECT <columns> FROM "<representative id>" WHERE "<date column>" >= '<before>') AS t` |

The seam filter compares dates the same way `buildCount` already compares the period, never as raw text. When only the archive is read, it needs no seam filter: the period already ends before `before`. The combined form keeps the seam filter, so a record in both files is counted once.

**What reads from the source:** every SQL `buildCount` returns. That covers the total, the grouped, future-check, map-points, grid, "of" and tract SQL. The neighborhood count's points and map cells therefore include the archive's years.

**What doesn't:** `buildMeasure` and `buildSpan` keep `FROM "<representative id>"` and ignore `archive`. A test pins this.

**The result's `resourceName`:**
- the representative's file name when only it was read;
- "Historical file" when only the archive was;
- "Historical and Current files" when both were.

**Before 2005:**
- A period reaching before `minDate` (2005-01-01) is clamped as today, and the `ARCHIVES` note is added to the period notes.
- A period entirely before it is `outside-coverage`, and its coverage text is followed by the note.

**Unchanged:**
- With no dates, the window is the last 12 months, inside Current today.
- The "too broad" refusal for huge neighborhood counts still applies.

## 6. What people see

**The crime count card:**
- the date range "Jan 1, 2005 – <latest>";
- a source line naming the files read (§5);
- the 2005 note when a question reached before 2005.

**The crime dataset page and its map** show the range from Jan 2005, via `minDate`.

**311:**
- Counts are unchanged.
- When the asked or default period reaches before the file's start, the period notes add the 311 `ARCHIVES` note, so a reader knows why 2025 isn't counted.
- The 311 dataset page shows the same note (`cityInfo`'s `note` falls back to the `ARCHIVES` note).

**Ask's prompt gains one line:** "City crime counts reach back to 2005; for change over several years, make one countRecords call with from/to and groupBy year."

## 7. Testing

**Unit (Vitest)**
- **`sourceFor`:** after the seam → the representative id; before it → the archive id; across it → the `UNION ALL` form with the seam filter on the archive side.
- **`buildCount` with an archive:**
  - a period across the seam puts the union in the total, grouped and tract SQL;
  - a request before 2005 is clamped with the note;
  - a request entirely before 2005 is `outside-coverage` with the note.
- **A profile without an archive builds byte-identical SQL to today** (a pinned snapshot of one existing case).
- **`buildMeasure` and `buildSpan`** ignore an archive.
- **`resourceName`** wording for each of the three sources.

**Database (convex-test, the City faked)**
- `reprofileCity` on crime stores `archive: { resourceId, before: "2024-01-01" }` and `minDate: "2005-01-01"`.
- Mismatched archive columns give no archive and the build note.
- 311 gets no archive, and its dataset page shows the note.

**Live check on dev**
- Citywide robberies grouped by year, 2019–2024, return six non-zero years.
- A Harambee robbery count across the seam returns a map.
- The time for a full 2005–2026 citywide count is recorded.

**Browser (Playwright)** — a scripted crime count across the seam shows "Historical and Current files" and "Jan 1, 2005" on the card.

**Graded real-AI question** — "How many robberies were there in Milwaukee each year from 2019 to 2024?" must reach `countRecords` with `from` in 2019 and a 2019 group in the result.

## 8. Docs

- **Decision 039:**
  - one query over both files rather than adding up in code;
  - why crime starts at 2005;
  - why 311 isn't joined.
  - "What actually happened" is left blank.
- **/how-it-works:** one sentence saying crime counts reach back to 2005 by reading the City's Historical and Current files together.
- **The questions document:** gap 6 says Current + Historical is done for crime (2005 onward). It also says stop-and-search, elections and the property file by year remain (K2–K4), and why 311 isn't joined.

## 9. Going live

Merging deploys the code. Crime's profile gains its archive when it's re-profiled: either Sunday's weekly build, or the same day with:

```
npx convex run build:reprofileCity '{"familyKey":"city:nibrs-crime-data"}' --prod
```

It takes a few seconds and changes one profile row. Tarik runs it, or OKs it.

## 10. Out of scope

- **K2:** the property file by year.
- **K3:** quarterly stop-and-search.
- **K4:** elections.
- **Joining 311's archive.**
- **Archives for sums, medians or "how long".**
- **Crime before 2005.**
