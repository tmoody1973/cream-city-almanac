# Cream City Almanac: Property History (Files Split by Period, Part 2) — Design

Tarik approved this design in conversation on 2026-10-13, section by section.

It is **K2**, the second part of Project K ("files split by period", gap 6 in docs/research/2026-10-12-questions-by-audience.md). K1 (crime history, decision 039) is live. K3 (quarterly stop-and-search) and K4 (elections) get their own specs later.

## 1. Why

Ask's property counts and sums read one file: the City's current Master Property File (MPROP), which holds today's assessment (2026). Questions about change ("has the typical home value gone up since 2005?", "how many owner-occupied homes each year?", "properties over $200,000 in 2015 vs 2025, by district") can't be answered, although the City publishes one property file per year.

## 2. What the exploration found (2026-10-13, live City data)

**The package.** "Master Property List (MPROP) Historical" (catalog family `city:master-property-list-mprop-historical`) holds 50 yearly CSV files, 1975–2025. All are queryable in the City's database (`datastore_active`). Each holds about 158,000–162,000 parcels, one row per property. The catalog stores the package as one member whose `files` list each file's name and download link. The link contains the file's id (`…/resource/<id>/download/…`).

**Four column layouts.** The same fact has different names in different years:

| Years | Assessed value | Aldermanic district | Tract | Owner-occupied | Class |
|---|---|---|---|---|---|
| 2005–2021, and the current file | `C_A_TOTAL` | `GEO_ALDER` | `GEO_TRACT` | `OWN_OCPD = 'O'` | `C_A_CLASS` |
| 2022–2023 | `AssessValu` | `DistrictNa` | none | `IsOwnerOcc = '1'` | `PrevNonExemptClass` |
| 2024–2025 | `TotalAssessedValue` | `DistrictName` | none | `IsOwnerOccupied = '1'` | `PrevNonExemptClass` |
| 1975–2004 | two older layouts (`CATOTAL`/`GEOALDER` or `CURTOTAS`/`ALDEROLD`), alternating year to year | | | | |

**Notes on the layouts:**
- **Class codes match.** The 2022–2025 files have no `C_A_CLASS`, but `PrevNonExemptClass` carries the same codes in nearly the same counts (2024: class 1 = 125,604, class 5 = 11,398; 2021 `C_A_CLASS`: 125,638 and 11,452).
- **The map shape can't be used.** 2022–2025 store it as binary geometry that the City's SQL can't read, so those years have no location below district.
- **Problems before 2005:** 1994 doesn't answer, 1981 isn't listed, 1989 holds 1,750 rows, and owner-occupancy is missing in about half the years.

**Values line up across the layout switch** (citywide, by file):

| File | Parcels | Total assessed | Over $200k | Owner-occupied |
|---|---|---|---|---|
| 2020 | 160,466 | $31.4B | 28,045 | 92,369 |
| 2021 | 160,368 | $31.3B | 27,932 | 93,220 |
| 2022 (new layout) | 160,304 | $35.6B | 38,660 | 93,369 |
| 2025 (new layout) | 160,000 | $48.0B | 75,204 | 97,185 |
| current (2026) | 159,950 | $49.8B | 83,244 | 97,471 |

The 2021→2022 jump in total value is the City's 2022 revaluation. Owner-occupied counts are continuous.

**File names vs the City's year field.** In the 2005–2021 files, `YR_ASSMT` disagrees with the file name in a pattern:
- files 2005 and 2006 both say 2006;
- 2007, 2008 and 2009 say 2008, 2009 and 2009;
- 2012, 2013 and 2014 say 2013, 2014 and 2014;
- 2015 and 2016 both say 2016.

The values differ in every file (median parcel value: 2005 file $110,300; 2006 file $124,700). By file name the series runs in order and peaks in 2008. By `YR_ASSMT`, four years appear twice and four disappear. The current file's `YR_ASSMT` is 2026 (159,556 rows; 394 retired parcels keep 2025).

**One query over all years works.** A `UNION ALL` of the 21 files 2005–2025, with count, over-$200k and median by year, returned in 7.4 seconds. Median parcel value by file: $110,300 (2005), $127,700 (2008), $89,600 (2015), $115,300 (2021), $191,900 (2025).

**Today's code:**
- **The property file is a snapshot with hand-kept overrides** (`OVERRIDES[MPROP_RID]` in `convex/lib/cityProfile.ts`): district `GEO_ALDER`, tract `GEO_TRACT`, number columns `C_A_TOTAL` and five others, current-assessment column `YR_ASSMT`. Its `dateColumn` is the last-sold date, so `from`/`to` on the property file mean sale dates.
- **The `assessed-value` City measure** (`convex/lib/cityMeasures.ts`) gives count, total, median and average of `C_A_TOTAL`, split by `GEO_ALDER`.
- **The City query timeout is 10 seconds** (`QUERY_TIMEOUT_MS` in `convex/lib/ckan.ts`).
- **A grouped result holds at most 24 rows** (`MAX_GROUPS`).

## 3. Decisions (Tarik, 2026-10-13)

- **Scope:** citywide and aldermanic-district questions. No neighborhoods or tracts.
- **Years:** 2005 through today's file (2026).
- **Approach:** one query over the years (approach A), not one request per year and not precomputed figures.
- **A year is the City's file year** (today's file is its `YR_ASSMT`, 2026). The card says so.

## 4. The data

**A hand-kept entry,** `YEARLY` in `convex/lib/cityFamilies.ts` (beside `ARCHIVES`):

```
"city:master-property-file-mprop": { history: "city:master-property-list-mprop-historical", from: 2005,
  note: "Years are the City's file years; in a few files the City's own assessment-year field reads a year later." }
```

**Layouts, hand-kept in code** (`convex/lib/propertyYears.ts`). Each maps the four carried facts to that layout's columns. A layout is recognized by one telltale column:

| Layout | Telltale | Value | District | Owner-occupied (as `'O'`) | Class |
|---|---|---|---|---|---|
| `classic` | `C_A_TOTAL` | `C_A_TOTAL` | `GEO_ALDER` | `OWN_OCPD` | `C_A_CLASS` |
| `short` | `AssessValu` | `AssessValu` | `DistrictNa` | `IsOwnerOcc = '1'` | `PrevNonExemptClass` |
| `long` | `TotalAssessedValue` | `TotalAssessedValue` | `DistrictName` | `IsOwnerOccupied = '1'` | `PrevNonExemptClass` |

**When the build profiles the property file** (`profileCity` for `city:master-property-file-mprop`, also through `reprofileCity`), and `YEARLY` has an entry for it:
1. **Find the year files.** Read the history family's member `files`. Keep names ending "MPROP <year>" with year ≥ `from`, and take the id from each link's `/resource/<id>/`. A name without a year, or a link without an id, is skipped.
2. **Recognize each layout.** Read each file's columns (`datastoreFields`), one request at a time. A file whose columns match no layout, or whose columns can't be read, is skipped, and the build note names the year and the reason.
3. **Store the list** on the profile:

   ```
   years: { year: number; resourceId: string; layout: "classic" | "short" | "long" }[]
   ```

   Today's file is added as its current assessment (`YR_ASSMT`'s most common value, 2026), layout `classic`. The list is sorted by year.
4. **No history family, or no usable years:** no `years`, with a build note. The property file works exactly as today.

**Nothing else is stored.** No City rows, owners or addresses: only file ids and layout names.

## 5. The query

**A new argument, `years: { from: number; to: number }`,** on Ask's `countRecords`, including when it carries a `measure`. It means assessment years by file year.
- **Without `years`:** every property query is unchanged, byte for byte.
- **On a file whose profile has no `years` list:** refused: "Years apply to the City's property file only."
- **`from > to`, or outside the stored years:** refused as outside coverage. The message gives the range ("2005–2026") and says why earlier years aren't read (different column layouts, missing years).
- **`years` with `from`/`to`:** dates are refused; the message points to `years`.

**The source** (`yearSource(p, from, to)` in `convex/lib/propertyYears.ts`) is one table with the carried facts under the classic names:

```
(SELECT '<year>' AS "yr", <value> AS "C_A_TOTAL", <district> AS "GEO_ALDER",
        <owner as 'O' or ''> AS "OWN_OCPD", <class> AS "C_A_CLASS"
   FROM "<file id>" [WHERE "YR_ASSMT" = '<year>' — today's file only]
 UNION ALL …) AS t
```

- **One year** gives one `SELECT`, still wrapped as `AS t`.
- **Today's file** keeps only its current assessment, as today.
- **Only fixed text, validated file ids and validated years** enter the SQL.

**What works with `years`:**
- **Filters:**
  - `C_A_TOTAL` over/under (whole dollars);
  - `GEO_ALDER` values;
  - `OWN_OCPD` (owner-occupied, labelled "owner-occupied");
  - `C_A_CLASS` values (labelled by class: 1 houses, 5 condos; "homes" is 1 and 5).
- **Group by** `year` (the `yr` tag) or `GEO_ALDER`.

**A span of several years is always grouped by year** (amended 2026-10-13, while planning). Adding counts across years would add the same parcels up once per year (about 3.4 million "properties" for 2005–2026). So:
- no `groupBy` means `year`;
- `GEO_ALDER` grouping works for one year only (refused across years, with "ask one year at a time, or filter to one district and group by year");
- the headline figures (the count, the "out of" count, a measure's summary and totals) cover **the newest year in the span**, and say which year.
- **Measures:** `assessed-value` gives count, total, median and average by year or district. "Typical home value" is its median with class 1 and 5.
- **Anything else** (another column, a map, tracts) is refused, and the refusal lists the supported filters.

**A missing year inside the span** (a file the build skipped) is named on the card: "The City has no usable file for 2022."

**Speed:** year-span queries use a 25-second City timeout instead of 10. The full span measured 7.4 seconds.

## 6. What people see

**The count or measure card:**
- **Period:** "2005 – 2026 assessments", or "2015 assessment" for one year.
- **Table:** one row per year, oldest to newest (as crime's year table is); for a measure, count, total, median and average per year.
- **Headline across several years:** the count reads "83,244 in 2026"; a measure's summary starts "In 2026, …"; the measure card and its export drop the "All" row (it would repeat the newest year), and a count export labels its total "Total (2026)".
- **Source line:**
  - a span: "From the City's yearly property files (2005–2025) and its current file (2026)", naming only the files actually read;
  - one historical year: "From the City's 2015 property file";
  - today's year: the current file, as now.
- **Notes,** each on its own line:
  - the `YEARLY` note, whenever `years` is used;
  - when filtering or grouping by district across more than one year: "District lines are redrawn after each census, so a district number can cover a different area in different years."
- **No map or tract map** with `years`.
- **Export:** CSV, text and PNG, unchanged.

**Ask's prompt gains one line:** "For the City property file's change over time, use `years` (assessment years 2005–2026), not from/to (those are sale dates), and group by year. Typical home value is the median assessed value with class 1 and 5."

**The property dataset page** (/d/H28) gains one line: "Yearly assessments from 2005 are read for change over time."

**Unchanged:**
- every property question without `years`;
- the tract property measures;
- Ask never lists properties, owners or addresses.

## 7. Testing

**Unit (Vitest)**
- **Layout recognition:** each telltale maps to its layout; columns matching none give no layout.
- **Year files:** "MPROP 2021" and "Parcel Tax - MPROP 2025" become 2021 and 2025. Pre-2005 files are dropped. A link without `/resource/<id>/` is skipped.
- **`yearSource`:**
  - one year reads one file;
  - a span reads each file once, tagged with its year;
  - today's file keeps `YR_ASSMT = '2026'`;
  - each layout's columns are renamed;
  - owner-occupied becomes `'O'` in every layout.
- **Counts with `years`:**
  - an over/under filter, a district group, a year group;
  - owner-occupied and class filters;
  - a bad column is refused with the supported list;
  - outside the range is refused with the range;
  - `years` on another file is refused;
  - `years` with dates is refused.
- **Measures with `years`:** median by year with class 1 and 5.
- **Without `years`, property SQL is byte-identical to today's** (a pinned snapshot).
- **Card wording:** period, source line, both notes.

**Database (convex-test, the City faked)**
- `reprofileCity` on the property file stores the sorted `years` list with layouts, and today's file as 2026.
- A year whose columns match no layout is skipped with a build note.

**Live check on dev**
- Typical home value by year 2005–2025 returns 21 years plus 2026.
- Owner-occupied counts for 2021 and 2022 are 93,220 and 93,369.
- The time for the full span is recorded.

**Browser (Playwright)** — a scripted by-year property question shows the year table and the source line.

**Graded real-AI question** — "How has the typical home value in Milwaukee changed each year since 2005?" must reach `countRecords` with `years`, a year grouping, the `assessed-value` measure and class 1 and 5.

## 8. Docs

- **Decision 040:**
  - the file year over the City's year field;
  - the 2005 start;
  - one query over the years;
  - no neighborhoods.
  - "What actually happened" is left blank.
- **/how-it-works:** one sentence saying property questions can compare yearly assessments from 2005.
- **The questions document:**
  - add "How has the typical home value changed since 2005?" (Now);
  - gap 6 says the property file by year is done (2005 onward, citywide and by district);
  - stop-and-search and elections remain (K3–K4).

## 9. Going live

Merging deploys the code. The property profile gains its year list when it's re-profiled: either Sunday's weekly build, or the same day with:

```
npx convex run build:reprofileCity '{"familyKey":"city:master-property-file-mprop"}' --prod
```

It makes about 22 small City requests and changes one profile row. Tarik runs it, or OKs it.

## 10. Out of scope

- neighborhoods and tracts by year;
- pre-2005 files;
- columns beyond value, district, owner-occupied and class;
- K3: quarterly stop-and-search;
- K4: elections.
