# Cream City Almanac: MPD Stop and Search (Files Split by Period, Part 3) — Design

Tarik approved this design in conversation on 2026-10-13, section by section.

It is **K3**, the third part of Project K ("files split by period", gap 6 in docs/research/2026-10-12-questions-by-audience.md).
- **K1** (crime history, decision 039) and **K2** (property history, decision 040) are live.
- **K4** (elections) gets its own spec later.

## 1. Why

"Who gets stopped by MPD, over five years?" is marked **Not yet** in the questions list. MPD publishes stop data quarterly under its stop-and-frisk settlement, as one package per quarter, and none of it can be counted in Ask today. Disparities in who is stopped, frisked and searched are the central public question this data exists to answer.

## 2. What the exploration found (2026-10-13, live City data)

**23 packages**, titled "<year> <n>th Quarter - MPD Stop and Search Data". The first is "2019 1st & 2nd Quarters". Each is its own catalog family, `city:<year>-<n>-quarter-mpd-stop-and-search-data`, with codes X07–X31. None is countable today.

**Two eras:**

| Quarters | Published as |
|---|---|
| 2019 Q1–Q2 through 2021 Q4 (11 packages) | 24–35 queryable tables each (`datastore_active`) |
| 2022 Q1 through 2024 Q4 (12 packages) | one ZIP each (~7 MB; ~34 MB unzipped), not queryable |

The ZIPs hold the same tables as CSV files, plus lookup CSVs and PDF dictionaries.

**The three person tables** carry who was stopped:

| Kind | Table (names vary) | Columns used | Rows, one quarter |
|---|---|---|---|
| Traffic stop | `Tracs_Individual` | `Race` (code), `sex` | 24,770 (2021 Q4), 15,472 (2023 Q4) |
| Field interview | `Inform_FieldInterviewPerson` | `race_Description`, `ethnicity_Description`, `sex_Code`, `Pat_Down_Description`, `Search_Performed_Description`, `Search_Results_Description` | 765 (2021 Q4), 686 (2023 Q4) |
| No-action encounter | `Inform_NoActionEncounterPerson` | `race_Description`, `ethnicity_Description`, `sex_Code` | 9 (2021 Q4), 22 (2022 Q1) |

**Names and columns vary:**
- **Table names seen:**
  - "Tracs Individual", "Tracs Individuals", "Tracs_Individual.csv", "Tracs_Individual_REMCOL.csv";
  - "Inform Field Interview Person Redacted", "Inform Field Interview Person - Redacted", "Inform_FieldInterviewPerson REDACTED TO POST 1.csv", "Inform_FieldInterviewPerson_REDACTED_REMCOL.csv", "Inform_FieldInterviewPerson_REMCOL_REDACTED.csv";
  - and similar for no-action encounters.
- **Column spellings seen:** `race_Description` and `race Description`; `sex_Code` and `sex Code`.
- **2023 Q4's Inform CSVs** start with a placeholder header row ("Column1", "Column2", …). The real header is the second row.

**Values (2019 H1, 2021 Q4, 2023 Q4):**
- **Traffic race codes**, from the City's own lookup `Tracs_V2Race`:
  - A = Asian or Native Hawaiian or Other Pacific Islander;
  - B = Black/African American;
  - H = Hispanic;
  - I = American Indian or Alaskan Native;
  - W = White;
  - plus "NULL".
- **Field-interview race:** "BLACK/AFRICAN AMERICAN", "WHITE", "ASIAN", "AMERICAN INDIAN OR ALASKAN NATIVE", "NATIVE HAWAIIAN OR OTHER PACIFIC ISLANDER", "UNKNOWN", occasionally "H". **Ethnicity is a separate column** ("HISPANIC/LATINO", "NOT HISPANIC/LATINO", "UNKNOWN").
- **Sex:** M, F, U, blank, "NULL".
- **Pat-down and search:** "Yes", "No", blank, "NULL".
- **Search results:** "NONE", "DRUGS", "FIREARM", "OTHER", "STOLEN PROPERTY", "WEAPON/NON-FIREARM", blank, "NULL".
- **Fields never read:** narrative text (justifications, suspect descriptions), date of birth, IDs, `MasterPersonId`.

**The project already depends on `fflate`** (ZIP reading).

## 3. Decisions (Tarik, 2026-10-13)

- **Scope:** every published quarter, 2019 Q1–Q2 through 2024 Q4.
- **Approach:** counted at build time and stored as counts. The 2022–2024 quarters can't be queried live, and published quarters don't change.
- **Counted:** people per stop, as MPD recorded them. A person stopped twice counts twice; a stop with two people counts two.

**Judgment call made in the spec (Claude), for Tarik to confirm or change:**
- **Race/ethnicity is one group: "Hispanic" when the race is "H" or the ethnicity is "HISPANIC/LATINO"; otherwise the recorded race.** Traffic stops record Hispanic as a race code, while field interviews and no-action encounters record it as ethnicity. Counting race alone would undercount Hispanic people in field interviews, and make the kinds incomparable.

## 4. The data

**Hand-kept code** (`convex/lib/stops.ts`):
- **Package titles → periods:** "2021 4th Quarter …" becomes `2021-Q4`; "2019 1st & 2nd Quarters …" becomes `2019-Q1Q2` (shown as "2019 Q1–Q2"). Each period belongs to its year.
- **Table matching:** lowercase the name, drop everything but letters, then remove "redacted", "remcol", "toPost1" and "csv":
  - `tracsindividual` or `tracsindividuals` → traffic;
  - `informfieldinterviewperson` → field interview;
  - `informnoactionencounterperson` → no-action encounter.
  - "Tracs Contact Summary Individual" doesn't match.
- **Column matching:** lowercase, letters only (`racedescription`, `sexcode`, `ethnicitydescription`, `patdowndescription`, `searchperformeddescription`, `searchresultsdescription`; traffic `race`, `sex`).
- **Value normalizing:**
  - **race:** one of Black, White, Hispanic, Asian or Pacific Islander, American Indian or Alaska Native, Unknown. Traffic "A" and field-interview "ASIAN" / "NATIVE HAWAIIAN OR OTHER PACIFIC ISLANDER" become "Asian or Pacific Islander", to match the traffic code's own grouping.
  - **sex:** Male, Female, Unknown.
  - **frisked, searched:** yes, no, unknown.
  - **found:** the result in title case ("Firearm", "Drugs", …), "None", or "Unknown".
  - **Blank, "NULL" and missing** all mean unknown.

**A new table, `stopCounts`:**

```
{ period: string; year: number; kind: "traffic" | "field-interview" | "no-action";
  race: string; sex: string; frisked: "yes" | "no" | "unknown" | null; searched: … | null; found: string | null; n: number }
```

- `frisked`, `searched` and `found` are null for traffic stops and no-action encounters.
- **Indexed** by `period` and by `kind`.

**A second small table, `stopPeriods`:** `{ period, familyKey, modified, status: "counted" | "failed", note? }`. It records which packages were counted and from which version.

**A new action, `build:refreshStops`**, also called at the end of the weekly build. For each stop-and-search family:
1. **Skip it** if `stopPeriods` already has the period, counted from the same package `modified` date.
2. **Queryable package:** run one grouped `datastore_search_sql` per matched table. Each table's id comes from its download link in the catalog's `files` (the K2 method), and its columns from `datastoreFields`; the SQL names only columns that list contains.
3. **ZIP package:** download the member's ZIP link (30-second timeout). Unpack only the three matched CSV entries with `fflate` (`unzipSync` with a filter), parse them with a quote-aware CSV reader (quoted commas, quotes and line breaks), skip a "Column1…" placeholder header, and count in code.
4. **Replace that period's rows atomically.** Then set `stopPeriods` to counted.
5. **A package that fails** (download, missing table, missing column) stays out. Its `stopPeriods` row is marked failed, with the reason in the build notes; earlier counts for it are kept.

**Nothing about a person is stored:** only counts per combination.

## 5. Ask's tool: `countStops`

**Arguments:**

| Argument | Values |
|---|---|
| `kind` | `"traffic"`, `"field-interview"`, `"no-action"`, or `"all"` (default `"all"`) |
| `from`, `to` | `"YYYY"` or `"YYYY-Qn"`; default all stored periods |
| `filters` | `race`, `sex` (lists), `frisked`, `searched` (`"yes"`/`"no"`), `found` (list) |
| `groupBy` | `"year"`, `"quarter"`, `"race"`, `"sex"`, `"kind"`, `"found"` |

**How periods work:** `2019-Q1Q2` is inside any range that includes 2019 Q1 or Q2, and inside 2019.

**The result** (code computes everything; the AI writes no number):
- **total:** people counted.
- **groups:** label, count, and share of the total (percent, one decimal). Ordered by count, except year and quarter, which go oldest to newest.
- **Field-interview rates.** With `kind: "field-interview"` and a race or sex group, each group also gets:
  - frisked % = frisked "yes" ÷ the group's people with a known frisk value;
  - searched % = the same, for searches;
  - found % = searched "yes" with a found value other than None or Unknown, ÷ searched "yes".
  - Each rate is shown only when its denominator is 10 or more; otherwise "too few to say".
- **period text:** e.g. "2019 Q1–Q2 – 2024 Q4".
- **source:** "From MPD's quarterly stop-and-search data (2019 Q1–Q2 to 2024 Q4), counted by the Almanac from the City's files."
- **notes:**
  - "People per stop as MPD recorded them: a person stopped twice counts twice."
  - "Race and ethnicity are one group here: Hispanic when either MPD field says so."
  - Any failed or missing period in range: "The City's file for 2023 Q2 couldn't be read."
  - "These are counts, not rates per resident."

**Refusals:**
- **bad filter:** frisked, searched or found with `kind` other than `"field-interview"` → bad-column, with the reason.
- **bad period:** malformed, reversed, or outside the stored periods → refused with the range.
- **unknown race, sex or found value** → choose, offering the stored values.
- **a `neighborhood` or district** → no-locations: "The stop files don't record locations in the tables Ask counts."
- **no counts stored yet** → not-live, with "Stop counts haven't been built yet."

## 6. What people see

**A stop count card** (new, `data-card="stops"`):
- **title:** "MPD stops · <kind> · <period> · by <group>";
- **headline:** the total;
- **table:** group, count, share, and the three rates when present;
- **notes and source,** each on its own line;
- **export:** CSV, text and PNG, carrying the notes and source.

**Follow-up buttons:**
- "BY RACE" or "BY YEAR" (whichever isn't the current group);
- "FIELD INTERVIEWS: FRISKS AND SEARCHES BY RACE", when the kind isn't field interviews.

**Ask's prompt gains one line:** "For who MPD stops, frisks or searches (2019–2024), use countStops. It counts people per stop by race/ethnicity, sex, year or quarter; frisk, search and found rates exist for field interviews only."

**The stop packages' dataset pages** (X07–X31) gain one line: "Ask can count people stopped across all quarters, 2019–2024."

## 7. Testing

**Unit (Vitest)**
- **Periods:** "2021 4th Quarter - MPD Stop and Search Data" becomes `2021-Q4`; "2019 1st & 2nd Quarters - …" becomes `2019-Q1Q2`; an unknown title gives nothing.
- **Table matching:** every name in §2 maps to its kind, and "Tracs Contact Summary Individual" maps to none.
- **Columns:** "race Description" and "race_Description" both match.
- **CSV:** a quoted field with commas, quotes and a line break; the "Column1…" header row skipped.
- **Normalizing:**
  - traffic "B" becomes Black;
  - "H" becomes Hispanic;
  - a field interview with race "WHITE" and ethnicity "HISPANIC/LATINO" becomes Hispanic;
  - "NULL" and blank become Unknown;
  - "ASIAN" and traffic "A" both become Asian or Pacific Islander.
- **The tool:**
  - year groups add up their quarters, with 2019 Q1–Q2 in 2019;
  - shares;
  - each rate and its 10-person floor;
  - every refusal;
  - the notes, including a failed period.

**Database (convex-test, the City faked)**
- A queryable quarter (grouped SQL rows) and a ZIP quarter (a small ZIP built in the test with `fflate`) both store counts.
- A quarter already counted from the same `modified` date is skipped (no City request).
- A ZIP without the field-interview table is marked failed with a note, and its earlier counts are kept.

**Live check on dev**
- `build:refreshStops` on dev: 23 periods counted, or the failures named.
- 2023 Q4 traffic people = 15,472, and 2021 Q4 field-interview people = 765.
- People per kind per year are recorded.
- The total run time is recorded.

**Browser (Playwright)** — a scripted "who gets stopped" question shows the stops card's table and source line.

**Graded real-AI question** — "Who gets stopped in MPD field interviews, by race, from 2019 to 2024?" must reach `countStops` with `kind: "field-interview"` and `groupBy: "race"`.

## 8. Docs

- **Decision 041:**
  - counted at build time (the 2022–24 ZIPs);
  - counts only, never people;
  - people per stop;
  - race and ethnicity as one group;
  - no location.
  - "What actually happened" is left blank.
- **/how-it-works:** one sentence.
- **The questions document:**
  - "Who gets stopped by MPD, over five years?" becomes **Now**;
  - gap 6 says stop-and-search is done (K3), and elections remain (K4).

## 9. Going live

Merging deploys the code. The counts appear after:

```
npx convex run build:refreshStops --prod
```

It downloads about 85 MB from the City once (12 ZIPs) and makes about 33 small queries. Sunday's weekly build would also do it. Tarik runs it, or OKs it.

## 10. Out of scope

- stop locations and maps (`Tracs_Location`, reporting districts);
- officer, dispatch (CAD) and use-of-force tables;
- stops (events) rather than people;
- rates per resident;
- K4: elections.
