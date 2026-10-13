# Cream City Almanac: Election Turnout (Files Split by Period, Part 4) — Design

Tarik approved this design in conversation on 2026-10-13, section by section.

It is **K4**, the last part of Project K ("files split by period", gap 6 in docs/research/2026-10-12-questions-by-audience.md). K1 (crime), K2 (property) and K3 (stop and search) are live.

## 1. Why

"Did turnout change between elections?" is marked **Not yet**. The City publishes election results as one package per election, with one file per race. Today Ask refuses every election file ("Election results list wards and vote totals, not records to count").

## 2. What the exploration found (2026-10-13, live City data)

**The portal's election data stops at 2022.** "Election Results" (X46), the only recent entry, is a link to the Election Commission's site. The catalog groups each election's per-race packages into one dataset per election date.

**Per-ward turnout exists for 12 elections, in four shapes.** Each source is listed with its catalog family, the member title or file it's found by, and its numbers:

| Election | Family | Found by | Shape | Notes |
|---|---|---|---|---|
| April 2016 spring | `city:2016-spring-election-results` | "Voter Turnout by Ward" | queryable table | columns "REGISTERED VOTERS - TOTAL", "BALLOTS CAST - TOTAL" |
| November 2016 general | `city:election-2016-11-08` | "VoterTurnoutbyWardNov82016.csv" | queryable table | **wards 1–250 only**; 265,664 registered, 195,901 ballots; numeric columns |
| February 2017 primary | `city:election-2017-02-21` | "VoterTurnoutbyWardFeb212017.csv" | queryable table | 327 wards |
| April 2018 spring | `city:2018-spring-election-results` | "Voter Turnout by Ward" | queryable table | "REGISTERED VOTERS", "BALLOTS CAST" |
| August 2018 primary | `city:2018-partisan-primary` | "2018 August Results (1).xlsx" | workbook, "General Turnout" sheet | summary block above the ward table; 327 wards |
| November 2018 general | `city:election-2018-11-06` | member "2018 Nov 6, Voter Turnout" (file named "CSV") | queryable table | 294,032 registered, 216,545 ballots |
| April 2019 spring | `city:2019-spring-election-results` | "Voter Turnout by Ward" | queryable table | "Registered Voters Total", "Ballots Cast Total" |
| February 2020 primary | `city:2020-spring-primary-election-results` | "Voter Turnout By Ward" | queryable table | "Registered Voters -Total", "Ballots Cast - Total" |
| April 2020 spring | `city:2020-spring-election-results` | "Voter Turnout by Ward" | queryable table | wards written "Ward 1"; "Ballots Cast-Total" |
| November 2020 general | `city:2020-general-election` | "City of Mlwaukee Canvassed Election Results.csv" (not queryable) | printed canvass report saved as CSV | ward lines `1,City of Milwaukee Ward,1,1502,1185,0,78.89`; report totals 315,483 registered, 247,695 ballots |
| April 2021 spring | `city:2021-spring-election` | "Spring 2021 Election Results Data (1).xlsx" | workbook, "General Turnout" sheet | plain header; "Total" row 325,024 registered, 48,782 ballots |
| August 2022 primary | `city:2022-partisan-primary` | "2022 Partisan Primary" (XLSX) | workbook, "General Turnout" sheet | summary block above the ward table; 354 wards (new map) |

**Other facts:**
- **Ward maps:** 327 wards from 2012 to 2021; 354 from 2022 after redistricting.
- **Turnout percentages** are written as 78.89 in some files and 0.7575 in others, so they are never read: code computes turnout from registered voters and ballots.
- **Not covered:** the 2018 fall primary package (144 race files) has no turnout file. The 2018 November workbook duplicates the queryable 2018 November table.
- **No districts:** none of the turnout files carries an aldermanic district.
- **Reuse:** the project already reads workbooks (`readWorkbook` in `convex/lib/xlsx.ts`) and CSVs (`parseCsv` in `convex/lib/stops.ts`).

## 3. Decisions (Tarik, 2026-10-13)

- **Scope:** turnout only (registered voters and ballots cast per ward), for the 12 elections above. No candidate results.
- **Approach:** counted at build time and stored, like stop and search. Four of the twelve sources can't be queried live.
- **Partial files stay visible and labelled,** never silently dropped or silently totalled.

## 4. The data

**A hand-kept list, `ELECTIONS`** (`convex/lib/turnout.ts`). Each entry has:
- `key`: `"2016-04"` … `"2022-08"`;
- `label`: e.g. "April 2016 spring election";
- `type`: `"spring" | "primary" | "general"`;
- `familyKey`, and `match`, a pattern tested against "<member title> <file name>";
- `reader`: `"table" | "sheet" | "report"`;
- `map`: `"2012" | "2022"`;
- `wards`: the map's ward count, 327 or 354.

**Readers, all pure except the fetch:**
- **`table`:** a queryable file, `SELECT "<ward>" AS ward, "<registered>"::text AS reg, "<ballots>"::text AS bal FROM "<id>"`. The `::text` cast handles numeric columns. Columns are found by name:
  - **ward:** the column named "Ward" (any case);
  - **registered:** letters only starts with "registeredvoters";
  - **ballots:** letters only is "ballotscast" or "ballotscasttotal".

  "Ballots Cast - Blank" and "Ballots Cast - Democratic" never match.
- **`sheet`:** download the workbook; take the sheet named "General Turnout"; find the first row that has a ward column ("Ward" or "Ward No.") and registered and ballots columns by the same rules; read rows below it whose ward cell is a ward.
- **`report`:** download the CSV (`parseCsv`); read rows whose second cell is "City of Milwaukee Ward": ward = the third cell, registered = the fourth, ballots = the fifth.

**Ward cells:** "1", "Ward 1", "01" and the number 1 all become ward 1. A row whose ward cell says "Total" is the file's total. Anything else is skipped.

**Numbers:** commas and spaces are stripped; a cell that isn't a whole number makes that ward's row unreadable. An election with any unreadable ward fails.

**Checks before storing:**
- **Total check:** if the file has a total row, the summed wards must equal it (registered and ballots); otherwise the election fails with a note.
- **Partial:** fewer wards than the map's count marks the election `partial: { wards, of }` (2016 November: 250 of 327).

**Tables:**
- `turnout`: `{ election: string; ward: number; registered: number; ballots: number }`, indexed by `election`;
- `elections`: `{ election, label, type, map, wards: number, of: number, partial: boolean, modified, status: "read" | "failed", note? }`.

Only public vote totals are stored.

**`elections:refreshTurnout`** (internalAction, also run at the end of the weekly build):
- for each `ELECTIONS` entry, find the source file in the family's catalog members (`files`, with the id read from the link);
- skip the entry if it was already read from the same member `modified`;
- read it, check it, and replace that election's rows atomically;
- on any failure, mark it failed with the reason and keep earlier rows.

Downloads accept only `https://data.milwaukee.gov/` links, with a 30-second timeout.

## 5. Ask's tool: `countTurnout`

**Arguments:**

| Argument | Values |
|---|---|
| `type` | `"spring"`, `"primary"`, `"general"`, or `"all"` (default) |
| `from`, `to` | years, 2016–2022 |
| `ward` | a ward number (optional) |
| `groupBy` | `"election"` (default) or `"ward"` (one election only) |
| `order` | `"lowest"` or `"highest"`, with `groupBy: "ward"`: the 10 wards at that end |

**The result** (code computes everything):
- **rows,** each with label, type, registered, ballots and turnout % (ballots ÷ registered × 100, one decimal). Elections run oldest to newest. A partial election's label reads "November 2016 general election (wards 1–250 of 327 only)".
- **notes:**
  - **always:** "Registered voters is the City's count on election day."
  - **when types are mixed:** "Turnout differs by type of election: November general elections draw far more voters than spring or primary ones, so compare like with like."
  - **when a partial election is included:** "The City's November 2016 file lists only 250 of the city's 327 wards, so its citywide figure undercounts."
  - **when one ward spans both maps:** "Ward lines were redrawn in 2022, so a ward number before and after names a different area."
  - **when a failed election is in range:** "The City's file for <label> couldn't be read."
- **source:** "From the City of Milwaukee's election results files (2016–2022), read by the Almanac."

**Refusals, with reasons:**
- years outside 2016–2022, or reversed;
- a ward that isn't on any asked election's map;
- `groupBy: "ward"` with more than one election in range ("pick one election, or ask for one ward across elections");
- `order` without `groupBy: "ward"`;
- no data yet ("Turnout hasn't been built yet.").

The tool has no district argument, and its description says districts aren't available.

## 6. What people see

**A turnout card** (`data-card="turnout"`):
- **title:** "Milwaukee voter turnout · <types> · <years>[ · ward N]";
- **table:** election, registered, ballots, turnout;
- **notes and source,** on their own lines;
- **export:** CSV, text and PNG;
- **follow-ups:** "ONLY NOVEMBER ELECTIONS" when types are mixed; "LOWEST-TURNOUT WARDS" for the newest election in range; "THIS WARD OVER TIME" from a ward list.

**Ask's prompt gains one line:** "For voter turnout (2016–2022), use countTurnout: citywide or one ward across elections, or a single election's lowest or highest wards. Candidate results and districts aren't available."

**The election dataset pages** (families in `ELECTIONS`) gain one line: "Ask can compare turnout across elections, 2016–2022."

## 7. Testing

**Unit (Vitest)**
- **Column matching:** every spelling in §2 matches; "Ballots Cast - Blank", "Ballots Cast - Democratic" and "Ballots Cast Crossover" don't.
- **Ward cells:** "1", "Ward 1", "01" and 1 become 1; "Total" is the total; "Ward No." is a header, not a ward.
- **The sheet reader:**
  - the plain layout (2021);
  - the summary-block layout (2018 August, 2022), header found below the block;
  - the total row is used for the check.
- **The report reader:** ward lines read; summary lines ("01 = REGISTERED VOTERS - TOTAL …") ignored.
- **Checks:** a total mismatch fails; 250 of 327 marks partial.
- **The tool:**
  - turnout math and order;
  - the partial label and note;
  - the mixed-types, redraw and registered notes;
  - lowest and highest 10;
  - every refusal.

**Database (convex-test, the City faked)**
- One election of each reader stores rows.
- An election read from the same `modified` is skipped.
- A total mismatch stores nothing and marks the election failed.

**Live check on dev**
- `elections:refreshTurnout` reads the 12 elections, or names those that fail.
- Totals match:
  - 2020 November: 315,483 / 247,695;
  - 2018 November: 294,032 / 216,545;
  - 2016 November: 265,664 / 195,901, partial 250 of 327;
  - 2021 April: 325,024 / 48,782.

**Browser (Playwright)** — a scripted "did turnout change" question shows the turnout card.

**Graded real-AI question** — "How did voter turnout in Milwaukee change across elections from 2016 to 2022?" must reach `countTurnout`.

## 8. Docs

- **Decision 042:**
  - turnout only;
  - the 2022 cutoff;
  - the partial 2016 November file;
  - no districts;
  - a hand-kept election list.
  - "What actually happened" is left blank.
- **/how-it-works:** one sentence.
- **The questions document:**
  - "Did turnout change between elections?" becomes **Now**;
  - gap 6 is done (K1–K4).

## 9. Going live

Merging deploys the code. Then:

```
npx convex run elections:refreshTurnout --prod
```

It makes about 9 small queries and 4 small downloads (under 1 MB each). Sunday's weekly build would also do it. Tarik runs it, or OKs it.

## 10. Out of scope

- candidate and referendum results;
- aldermanic-district turnout;
- elections after 2022 (not on the portal);
- the 2018 fall primary (no turnout file);
- turnout by voting method (absentee, in person).
