# Cream City Almanac: How Long Things Take (Time Spans) — Design

Approved in conversation 2026-10-12 (Tarik), section by section. This is Project E. The queue is A, B and C1 (all live), then **E**, then C2 (share link), then D (fact sheet).

## 1. Why
A reporter asked Ask: "How long do complaints take to go from being reported to being closed, and does that vary by department or category?" Ask found the right file but couldn't answer. Its tools count records but never measure the time between two dates. Several City files hold a "from → to" pair, and how long things take is a common accountability story: complaints, 311 requests, permits, fire response.

## 2. What the spike found (2026-10-12, read-only queries to data.milwaukee.gov)
- **The City's server does the whole calculation** in `datastore_search_sql`: text-to-date conversion (`to_date`, `::date`), `percentile_cont(0.5)` and `percentile_cont(0.9)` per group. One query answers the question.
- **`FILTER (WHERE …)` is blocked** ("Not authorized to call function FILTER"). `SUM(CASE WHEN … THEN 1 ELSE 0 END)` works instead.
- **Complaints, live numbers:** Milwaukee Police Department, 2,453 complaints, median 92 days, 9 in 10 within 478. Fire Department, 63, median 22 days, 87. 2,731 of 2,919 rows are usable.
- **Complaints, data problems:**
  - Both date columns mix `07/01/2019`, `7/27/2023` and `2022-03-10 00:00:00`.
  - 4 reported and 8 closed dates are unreadable, and one reported date has the year `0225`.
  - 17 complaints were closed before they were reported.
  - 103 are not closed.
  - One group is written four ways ("Non-Employee", "NON-EMPLOYEE", "Non Employee", "NON EMPLOYEE").
- **The other files:**
  - Permits and 311 store date-only text (`2026-10-09 00:00:00`).
  - Fire incidents store milliseconds (`2021-01-01 00:08:34.310`) and the literal text `NULL` for a missing date.
  - MFD calls store seconds.
  - Every one of these date columns is typed `text`.
- **Dataset codes are assigned per database.** Complaints is P01 in development and P24 on the live site. Pairs must name files by their stable family key, never by code.

## 3. Decisions (Tarik, 2026-10-12)
- **Chosen pairs.** A short code list of known "from → to" pairs, checked by hand, each with a plain name, a unit and its own caveat. Ask never pairs arbitrary date columns.
- **Measures per group:** cases measured, the median ("half took less than this"), the 9-in-10 ("9 in 10 took less than this"), still open, unreadable dates, and dates in the wrong order.
- **Over time:** split by one category column OR by year (of the "from" date), plus an optional period. One split at a time, the same choices as City counts.
- **Approach A:** a new Ask tool `timeSpan` on the City count tool's path (sign-in, the same allowance, profile lookup, safe query building, the City's server), with a new card. No new tables, no weekly job.

## 4. The approved pairs (`convex/lib/spanPairs.ts`)

| id | File (family key) | From → to | Name | Unit | Missing "to" means | Caveat |
|---|---|---|---|---|---|---|
| `complaint-close` | `city:citizen-complaints-against-police-and-fire-departments-the-department-of-emergency-communication` | `DateReported` → `Date Closed` | time to close | days | "aren't closed yet" | "Dates are typed by hand in more than one format; a few can't be read." |
| `311-close` | `city:call-center-data` | `CREATIONDATE` → `CLOSEDDATETIME` | time to close | days | "aren't closed yet" | "311 dates have no time of day, so a request closed the same day counts as 0 days." |
| `permit-issue` | `city:residential-and-commercial-permit-work-data` | `Date Opened` → `Date Issued` | time to issue | days | "aren't issued yet" | "A permit can wait on the applicant as well as the City." |
| `fire-dispatch` | `city:fire-incident-detail` | `Date_Received` → `Date_Dispatched` | time to dispatch | minutes | "have no dispatch time" | "This file covers 2021 only." |
| `fire-arrive` | `city:fire-incident-detail` | `Date_Received` → `Date_Arrived` | time to arrive | minutes | "have no arrival time (often cancelled calls)" | "This file covers 2021 only." |
| `fire-clear` | `city:fire-incident-detail` | `Date_Arrived` → `Date_Cleared` | time on scene | minutes | "have no clear time" | "This file covers 2021 only." |
| `mfd-arrive` | `city:mfd-calls-for-service-detail` | `IncidentStarted` → `FirstUnitArrived` | time to arrive | minutes | "have no arrival time (often cancelled calls)" | "Times come from the Fire Department's dispatch records." |

The list is the single source. Ask's tool description is generated from it.

## 5. Reading dates
One SQL expression per date column, shared by every pair:
- `YYYY-MM-DD`, with or without a time and fractional seconds, is read as a timestamp.
- `M/D/YYYY` or `MM/DD/YYYY` is read with `to_date(…, 'MM/DD/YYYY')`.
- Anything else is **unreadable**: empty, the text `NULL`, another shape, or a year before 1900.

A span is measured only when both dates are readable and "to" is not before "from". Days are `(to − from)` in fractional days; minutes are `(to − from)` in minutes. Both come from `extract(epoch …)`.

## 6. The tool (`timeSpan`)
- **Arguments:**
  - `code`: the dataset code, as Ask sees it.
  - `pair?`: a pair id. It can be left out when the file has exactly one pair.
  - `groupBy?`: `"year"` or a column name.
  - `from?` / `to?`: `YYYY-MM-DD`, applied to the "from" date.
  - `filters?`: the same shape and limits as City counts (values only, up to 4 columns).
- **Flow:**
  1. Sign-in.
  2. `rateLimiter.limit("askCity")` per person (shared with counts).
  3. The file and profile lookup (`countContext`).
  4. Find the pair for the file's family key.
  5. `buildSpan(profile, pair, args, today)`.
  6. Run the query on the City's server, with the count tool's timeout.
  7. Shape the small result.
- **Refusals, in plain words:**

  | Status | Meaning | Offer |
  |---|---|---|
  | `not-found` / `not-city` / `not-live` | as for counts | |
  | `no-pair` | this file has no from-and-to dates to measure | lists the files that do |
  | `choose-pair` | the file has several pairs | the pairs, as buttons |
  | `bad-column` | an unknown split or filter column | the file's columns, as buttons |
  | `bad-dates` | a bad period | |
  | `outside-coverage` | the period is outside the file's data | |
  | `too-broad` | the City's server timed out | "try a shorter period" |
  | `unavailable` | the City's server didn't respond | |
  | `busy` | the allowance is used up | |

- **The query:**
  - Per group: cases measured, median, 9-in-10, still open (from readable, to empty or `NULL`), unreadable (either date present but unreadable), and wrong order.
  - Group labels merge by ignoring capitals and punctuation, when the City's server allows `regexp_replace` and `upper` (the plan's first step checks this). Otherwise they merge by `upper(trim(…))`, and the card notes that some labels may still be split.
  - The top 24 groups by cases get rows. The rest are one "Other" line with the case count only.
  - A second query gives the "All" row.
  - Only these totals leave the City's server. Files that name people (fire, MFD) never return rows.
- **The result** carries: `code`, `name`, `pair` (name, unit, caveat, missing wording, from/to columns), `groupBy`, `period`, `groups[]` `{ label, cases, median, p90 }`, `other` `{ groups, cases }`, `all` `{ cases, median, p90, open, unreadable, backwards }`, `coverage`, and `filters` in plain words.

## 7. The card
- **Title:** "{file name} · {pair name}{ · by {split}}", for example "Citizen complaints · time to close · by Department".
- **Summary sentence**, written by code from the result:
  - With a split: "Half of {measured things} {pair verb} within {median} overall; the slowest group is {label} ({median}), the fastest {label} ({median})." Groups marked "too few to say" are skipped.
  - Without a split: "Half {pair verb} within {median}; 9 in 10 within {p90}."
- **Table:** {split column or Year} · Cases · Median · 9 in 10 within, plus an "All" row.
  - A group with fewer than 10 cases shows "too few to say".
  - An "Other" line shows its group count and cases.
- **Numbers:**
  - Minutes: one decimal under 60 ("4.6 minutes"); from 60, hours and minutes ("1 h 12 min").
  - Days: one decimal under 10 ("0.5 days"), whole numbers from 10 ("92 days").
- **Notes, in order:**
  1. Still open: "{n} {missing wording} and aren't counted, so slow cases are under-counted."
  2. Unreadable: "{n} dates couldn't be read and were left out." This becomes a **bold warning above the table** when unreadable dates are more than 1 in 5 of the rows in the period.
  3. Wrong order: "{n} had the later date before the earlier one and were left out."
  4. The pair's caveat.
  5. Coverage and the period.
  6. Filters in plain words.
- **Provenance:** a CITY tag and a link to the dataset sheet.
- **Exports:** CSV · Copy text · PNG through C1's `ExportBar`, with a `spanExport` builder. The CSV carries unrounded medians and the unit in the heading.
- **Follow-ups:** "By year" (when split by a column), "By {another category column}" (up to 2), and "Since {latest year}".

## 8. Ask
- **The tool description** names each approved file and pair, generated from `spanPairs.ts`.
- **One prompt rule:** "How long", "how fast", "time to" and "wait" questions use `timeSpan`; counts stay with `countRecords`. When a file has no pair, Ask says so and doesn't improvise from counts.
- **The scripted test model** (`lib/ask/model.ts`) gets "how long" → `timeSpan` on complaints, by Department.

## 9. Testing
**Unit (Vitest)**
- `spanPairs`: every entry is well-formed, ids are unique, units are days or minutes.
- `spanSql`:
  - the date expression (each shape, `NULL`, a year before 1900);
  - the period filter on the from date;
  - grouping by year and by column;
  - the column check against the profile;
  - quoting and escaping;
  - `SUM(CASE …)` everywhere, never `FILTER`.
- **Shaping:** "too few to say", the "Other" line, the unreadable warning threshold, and the missing wording.
- **Card wording:** the summary sentence, the number formatting, and `spanExport`.

**Database (convex-test, fake City server)**
- sign-in;
- the shared allowance;
- an unknown file or pair (`no-pair`, `choose-pair`);
- a server error, which becomes `unavailable`;
- a timeout, which becomes `too-broad`;
- a good answer shaped end to end.

**Browser (Playwright, scripted model)**
- "How long do complaints take to close, by department?" draws the card: groups, cases, median, 9-in-10, the open note and the export line. It runs against the City's real server, like the theft-count test.

**Live check before the PR** (`npm run` script or one-off): all 7 pairs against the City's server. Read the numbers. Complaints by Department must match the spike (Police 2,453 · 92 days · 478).

**Not covered:** how the real AI chooses between `timeSpan` and counts. Check by asking the live AI 5 real questions on the preview before merge.

## 10. Docs
- **Decision 033: time between two dates, with chosen pairs and live medians.** It covers why chosen pairs over any two dates, why the median and the 9-in-10 over the average, and why live queries over weekly ones. "What actually happened" is left blank.
- **/how-it-works:** a paragraph on what a median and a 9-in-10 mean, and why open cases are left out.
- **Ask guide:** a "how long" example.
- **DESIGN.md:** a "### How long" note on the card.

## 11. Out of scope
- Arbitrary date pairs.
- A category × year grid.
- Averages.
- Maps of spans.
- Spans by City neighborhood. Counts have it; spans can add it later with the same rectangle filter.
- Fixing the City's data. Unreadable and wrong-order dates are counted and shown, never guessed.
