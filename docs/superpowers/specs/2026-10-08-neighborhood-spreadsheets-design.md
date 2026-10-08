# Cream City Almanac: Neighborhood Spreadsheets (Phase 3a) — Design

**Status:** sections approved in conversation 2026-10-08; this document is the written spec for Tarik's review.
**Builds on:** `docs/superpowers/specs/2026-10-07-cream-city-almanac-design.md` (product spec; §8 Ask, §11 build order), `DESIGN.md` (The Rundown), decisions 014 (City data after Ask) and 015 (this design's core choice).
**Phase 3b (the Ask chat)** gets its own spec after this ships; it will read the tables this phase stores.

## 1. Why

Tarik, looking at the N03 sheet: show what's in the Neighborhood Portrait spreadsheets ("the fields, etc."). Today N03 lists 99 files but says nothing about their contents: no column guide, a generic explainer, and a reporter has to download a file blind. Reading these files is also the first step of Phase 3: the Ask chat needs their tables to answer neighborhood questions with real numbers.

**Success:** open the spreadsheets entry, pick a neighborhood and year, and within a minute see its Census topics and read any table with its margins of error, knowing which cells DYCU's file has errors in. The weekly job stores the same tables so search finds them now and Ask can quote them later.

## 2. What the files are (verified 2026-10-08)

- **99 files** in family N03 ("Neighborhood Portrait Spreadsheet"): 20 for 2021, 25 for 2022, 27 for 2023, 27 for 2024, across 28 neighborhood names (some are groups, e.g. "Silver City, Layton Park, and Burnham Park").
- **Two layouts.** 2022–2024 files have **16 tabs**: Race and Ethnicity, Sex and Age, Poverty Status by Age, Household Characteristics, Vehicles per Household, Employment Status by Sex, Commute Method and Time, Employment Sector, Educational Attainment, Occupancy and Tenure, Units in Structure, Bedrooms and Year, Rent Paid, Mortgage Status and Cost (SMOC), Mortgage Status (SMOCAPI), Household Income. 2021 files have **15 tabs**: no Commute Method and Time, "Bedroom and Year" instead of "Bedrooms and Year", and no VINTAGE line.
- **Each tab is one American Community Survey table** (ACS, the Census Bureau's household survey; 5-year estimates): a header block (`TABLE ID: B03002`, `SURVEY/PROGRAM`, `VINTAGE: 2024`, `PRODUCT`, `GEO`), then a header row `Variable | Estimate | % | MOE | SE` (some tabs repeat the group per column, e.g. `Total Estimate | Total % | …` for Total / Male / Female).
- **Problems in DYCU's files:** every 2022–2024 file sampled has **577 error cells** (`#DIV/0!`), filling the % columns; 2021 files have 5. One 2024 file's Sex and Age tab is all zeros. Estimates and margins of error read cleanly.
- Sample checked: 2024 Silver City/Layton Park/Burnham Park; 2021 and 2022 Silver City groups; 2023 Walker's Point; 2023 United Community; 2022 Florist Highlands. The rest are assumed to follow one of the two layouts; anything else is flagged, not guessed (§6).

## 3. Scope

**In:** reading all 99 files weekly; storing tidy tables; a "What's in each spreadsheet" section on the N03 sheet (phone page and laptop pane); search over the tables; a shareable address for a neighborhood/year/topic.

**Out:** the Ask chat (3b); separate neighborhood pages (`/n/hillside`, kept as a later option, and the stored tables support it); computing percentages; comparing years side by side; the City of Milwaukee data (Phase 4).

## 4. Data: how the files get in (weekly build)

For each N03 member, in the existing weekly build:

1. **Skip unchanged files** by the Hub's `modified` date, as the build already does for report PDFs.
2. **Download** the member's `fileUrl` and **open** it: an `.xlsx` is a zip of XML files, read with small, widely used libraries (chosen and checked against current docs during planning; pure JavaScript, no AI).
3. **Tidy each tab into one shape:** canonical topic name (renamed tabs map to one name), Census table ID, year, column groups (e.g. Total / Male / Female), and rows of `label → { estimate, moe, se }` per group. The `%` columns are dropped.
4. **Record issues per tab instead of hiding them:** `% column has formula errors in DYCU's file`; `every estimate is 0 in DYCU's file`; `topic not in this year's layout`; `unrecognized tab or layout` (stored as found, flagged in the build report).
5. **Store** one record per file × tab (about 1,584) in a new table keyed to the member, with a normalized neighborhood key that ignores name order ("Silver City, Burnham Park, and Layton Park" = "…Layton Park, and Burnham Park").
6. **Index for search:** one passage per neighborhood × year × topic (the topic, table ID, neighborhood, year and its rows as text), embedded like report passages, so "Hillside rent" finds that table.

**Safety:** a file that fails to download or open keeps last week's tables and is named in the build report; one bad file never stops the run; a failed run never replaces the live catalog. No AI is used in this pipeline; embeddings only.

## 5. The sheet: "What's in each spreadsheet" (phone + laptop)

A new section under WHAT IT MEASURES on the N03 sheet, the same component on the phone page (`/d/N03`) and in the laptop pane.

1. **Pickers:** neighborhood and year as native `<select>`s (good on phones and with screen readers); default the newest file; the year list shows only that neighborhood's years.
2. **Topics:** the topics as a ruled list with their Census table IDs; a topic missing from a year's layout says so.
3. **Table:** the chosen topic as label | Estimate | ± margin of error, per column group; wide tables scroll inside their own box on phones (the place-by-year grid's pattern).
4. **Issues** appear above the affected table in the site's tag style, in plain words, e.g. "% column left out: it has formula errors in DYCU's file."
5. **Provenance:** numbers tagged **DYCU**; each table ID links to the Census Bureau's page for that table, tagged **SOURCE**; one fixed line defines a margin of error ("the range the true number likely falls in, at the Census Bureau's 90% confidence level"). Topic and column explanations are written once, reviewed by Tarik, and linked to Census definitions; no AI writes them.
6. **Address:** the choice lives in the link (`/?open=N03&place=hillside&year=2023&topic=rent-paid`, and the same on `/d/N03`), so links and refresh restore it and search results land on the table.

**Design process:** one Impeccable comp round for this section, phone and laptop (about 2–4 images, under $1, Tarik picks), then a comp-led build with the usual gates and the independent finish review; DESIGN.md updated.

## 6. Errors and edge cases

| Case | Behavior |
|---|---|
| File won't download or open | Last week's tables stay; build report names the file; run continues |
| Neighborhood named in a different order across years | One neighborhood in the picker, all its years |
| Tab name or layout not seen before | Stored as found; flagged in the build report; never dropped silently |
| Text in a number cell ("N/A", "-") | Shown as written, never turned into 0 |
| `#DIV/0!` and other error cells | Never shown as numbers; the tab's issue note explains |
| Unknown neighborhood/year/topic in the address | Fall back to the newest file and its first topic |
| No JavaScript | The newest file's first table renders; pickers need JavaScript |

## 7. Testing

- **Parser, on real fixtures** (one 2021-layout and one 2022+-layout DYCU file in the repo's test fixtures): tab count and canonical names; Estimates and MOEs exact; % dropped with its issue; all-zero tab flagged; column groups kept; neighborhood key matches across name orders.
- **Build:** stores tables; skips unchanged files; a failed file keeps last week's tables; the build report lists issues.
- **Browser (phone + laptop):** pick neighborhood → year → topic and see the table with ± margins; issue note visible; the address restores the table; axe scan; no sideways scroll at 390, 1024 and 1440.
- **Search report card:** two neighborhood questions added (e.g. "rent paid in Hillside").
- **Design:** comp diffs at the comps' sizes and the finish review disposition.

## 8. Open items for planning

1. Pick and verify the zip/XML libraries against current docs (ctx7), including that they run in the Convex action runtime.
2. Confirm the Census table link format (e.g. a data.census.gov table URL for B25063) before writing it into the sheet.
3. Run the parser over all 99 files in a dev build and list any layout the sample missed before building the UI.
4. Comp round (Tarik picks) before the UI tasks start.
