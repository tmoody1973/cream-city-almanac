# Cream City Almanac: Neighborhood Fact Sheet — Design

Approved in conversation 2026-10-12 (Tarik), section by section. This is Project D in the build order for making the "Partly / Not yet" questions answerable:

- J: data fixes (done)
- F: totals and medians (live)
- G: tract questions by neighborhood (live)
- **D: this spec**
- H: address lookup
- I: boundaries and places
- K: files split by period
- C2: share link
- L: more "how long" pairs

## 1. Why

Nonprofits, reporters and residents ask:
- "Give me a one-page fact sheet for our neighborhood."
- "How does our neighborhood compare with the city as a whole?"

The questions document (docs/research/2026-10-12-questions-by-audience.md) marks both **Not yet** and **Partly**. Today Ask reads one portrait row at a time (`getNumber`), and nothing sets a neighborhood beside the City.

## 2. What the exploration found (2026-10-12, read-only)

**DYCU's portraits**
- DYCU publishes portrait spreadsheets for 27 of its areas: 20 for 2021, 25 for 2022, 27 for 2023 and 27 for 2024, which is 99 in all. They are stored in `portraitTables`, one row per topic per spreadsheet (1,564 tables).
- **The 16 topics** (`TOPICS` in `convex/lib/portrait.ts`) come from standard American Community Survey (ACS) tables:

| Topic | Table |
|---|---|
| poverty | B17001 |
| income | B19001 |
| housing, rent, occupancy | DP04 |
| units in structure | S2504 |
| education | S1501 |
| employment | S2301 |
| vehicles | B08201 |
| commute | B08301 / B08303 / S0801 |
| households | B01001 / S1101 |
| age | B01001 |
| race | B03002 |

- **Every row is a count with its margin of error.** Harambee 2024 examples:
  - poverty: Total 18,894, below poverty 6,520;
  - occupancy: 9,457 housing units, 1,457 vacant, 8,000 occupied, 5,745 renter-occupied;
  - no vehicle: 2,586 of 8,000 households;
  - rent as a share of income: rows for "Occupied units paying rent (excluding …)" 5,549, then bands from "Less than 15.0 percent" upward.
- **Employment** carries DYCU's own rate groups ("Unemployment Rate (% of Labor)") rather than counts.

**What's missing or unclear**
- **There is no whole-city portrait,** so a city figure needs another source.
- **An open data question:** Harambee's 2024 "Sex and Age" rows read 0 in their first value group, while its poverty table counts 18,894 people. Either Ask's reader or DYCU's file causes it.
- **The portrait listing gives only "2024".** It doesn't say which five-year survey period that is (probably 2019–2023).

## 3. Decisions (Tarik, 2026-10-12)

- **A page to print or share,** at its own address per neighborhood, with a print / PDF button. Ask links to it.
- **DYCU's 27 profiled areas,** built from DYCU's portraits. Nothing is blended from tracts. City neighborhoods would need combined-tract math, which is a separate project.
- **The comparison uses the Census Bureau's own figures for the City of Milwaukee:** the same tables and the same survey years, for a hand-checked headline list, shown beside the neighborhood with both margins of error.
- **The page holds headlines plus the full tables:** about 10 headline figures with the city beside each, then all of DYCU's tables for that year, folded.

## 4. The headline list (`convex/lib/factSheet.ts`)

A hand-checked list, like F's approved measures list. Each entry has:
- `id` and `label`, the reader's words;
- `topic`, the portrait slug;
- `parts`, the DYCU row labels added together;
- `of`, the DYCU row label for the "out of" total;
- `census`, the Census table plus the variable codes for the same parts and total;
- `meaning`, one plain sentence.

| id | Label | Topic | Parts ÷ of |
|---|---|---|---|
| `poverty` | People in poverty | poverty-status-by-age | below poverty ÷ Total |
| `low-income` | Households earning under $25,000 | household-income | the four bands under $25,000 ÷ Total |
| `renters` | Renter households | occupancy-and-tenure | renter-occupied ÷ occupied |
| `vacant` | Vacant homes | occupancy-and-tenure | vacant ÷ total housing units |
| `rent-burden` | Renters paying 30% or more of income on rent | rent-paid | 30.0–34.9% + 35.0% or more ÷ occupied units paying rent (excluding not computed) |
| `no-car` | Households with no vehicle | vehicles-per-household | no vehicle ÷ Total |
| `degree` | Adults 25+ with a bachelor's degree or more | educational-attainment | bachelor's + graduate ÷ population 25+ |
| `no-diploma` | Adults 25+ without a high school diploma | educational-attainment | less than 9th + 9th–12th no diploma ÷ population 25+ |
| `unemployment` | Unemployment rate (ages 20–64) | employment-status-by-sex | DYCU's rate as published, and the Census rate for the same ages |
| `population` | People | sex-and-age, or poverty's Total if sex-and-age is unusable | a count, with no city comparison |

**Before any code depends on the list,** the plan's first task:
- confirms every DYCU row label exists in every portrait year;
- looks up every Census variable code in the Census Bureau's variable list for each year;
- confirms which ACS five-year period each portrait year uses.

An entry that can't be matched is dropped and noted, never guessed.

## 5. City figures

- **Fetching:** a new build step, `refreshCityFigures`, part of the weekly build and runnable on its own. It asks the Census Bureau's data service (`api.census.gov`, ACS 5-year: detailed, profile and subject tables) for the City of Milwaukee (place 53000, state 55). It requests each entry's variables for each survey period a portrait uses.
- **Storage:** a new table, `cityFigures`: `{ period, figureId, parts: {estimate, moe}[], of: {estimate, moe} | null, rate?: {estimate, moe} }`.
- **No key at first:** about 10 figures × 4 periods stays under the service's free, key-free limit. A `CENSUS_API_KEY` environment variable is used when it is set.
- **Failure:** the step keeps the last good figures and records the error. The page shows "City figure unavailable" for a period with nothing stored, and never shows a city figure from a different period.

## 6. The math (`convex/lib/factMath.ts`, pure)

These are the Census Bureau's published approximations (*Understanding and Using ACS Data*, appendix).
- **A sum:** estimate Σx, with margin √(Σ moe²).
- **A proportion** p = X / Y:
  - margin = √(moe_X² − p²·moe_Y²) / Y;
  - when the part under the square root is negative, the ratio form √(moe_X² + p²·moe_Y²) / Y.
- **A rate given as a rate** (unemployment) is used as published, with its margin.
- **Comparison with the city:**
  - "clearly higher than the city" when p_n − p_c > √(moe_n² + moe_c²);
  - "clearly lower" for the reverse;
  - otherwise "about the same as the city (within the margin of error)".
- **A note on every sheet:** "The neighborhood is part of the city, so this comparison is approximate."
- **Margins are 90%** (the Census standard). The page says so.

## 7. The page

- **Address:** `/n/[slug]`. The slug comes from the DYCU area name: `harambee`, `clarke-square`, `silver-city-burnham-park-and-layton-park`.
- **Years:** the newest year is the default. `?year=2023` picks another, and a year switcher lists the years the area has.
- **An unknown slug** shows a not-found page listing the 27 areas.
- **Layout, top to bottom:**
  1. The name, "Neighborhood fact sheet", the year and the survey period ("2019–2023 American Community Survey").
  2. The headline figures. Each one shows:
     - its label;
     - the neighborhood's percent ± margin;
     - the city's percent ± margin;
     - the verdict line;
     - the counts it came from;
     - its one-line meaning.
  3. A small map of the area's tracts.
  4. All of DYCU's tables for that year, folded on screen and left out of print.
  5. The sources:
     - DYCU's portrait spreadsheet, with a link;
     - "U.S. Census Bureau, American Community Survey 5-year estimates, City of Milwaukee";
     - the approximate-comparison note, "Margins of error are at 90% confidence", and the date.
- **Print:** a print / PDF button. Print styles fit the title, headlines, map and sources on one US Letter page; the folded tables stay off paper.
- **Exports:** CSV and text of the headline figures through C1's ExportBar. The CSV carries unrounded values, margins and both sources.
- **No AI-written text** anywhere on the page.
- **The comp comes first:** before the page is built, a design comp following DESIGN.md (the Impeccable workflow used for the other pages), for phone, laptop and print. Tarik approves the comp before the page is coded.

## 8. Ask

- **A new tool, `factSheet`:** given a neighborhood name, it returns the sheet's link and its headline figures for the card. It matches DYCU's area names with `matchName`; a miss returns `no-neighborhood` with the nearest DYCU names.
- **The card** is short: the area name, three headline figures with the city beside each, and "Open the fact sheet →".
- **The prompt gains one rule:** "fact sheet", "profile", "overview" or "compare with the city" for a DYCU area uses `factSheet`. For a City neighborhood DYCU doesn't profile, say that fact sheets cover DYCU's 27 areas, and offer the tract tools.

## 9. Testing

**Unit (Vitest)**
- `factMath`: the sum, proportion and ratio-fallback margins, checked against the worked examples in the Census Bureau's guide; the three verdicts and their boundaries.
- The headline list: well-formed and ids unique; every entry names its parts, total and Census variables.
- Slugs: all 27 areas round-trip, and an unknown slug gets the not-found page.

**Database (convex-test, Census faked)**
- `refreshCityFigures` stores figures, and on failure keeps the last good ones.
- The page's query assembles the headlines for an area and year.
- A missing city period reads "unavailable".
- `factSheet`'s refusals.

**Browser (Playwright)**
- `/n/harambee` shows the headline figures with the city beside each, a verdict line and the sources.
- The year switcher works, and the print button is present.
- No sideways scroll on phone or laptop.
- A print-media screenshot fits one page.
- Ask's scripted "fact sheet for Harambee" draws the card with the link.

**Live check:** after `refreshCityFigures` runs on development, the stored City of Milwaukee poverty rate for one period must match the Census Bureau's published figure for that table and period.

**Graded real-AI question:** "Give me a fact sheet for Clarke Square" must reach `factSheet`.

## 10. Docs

- **Decision 036:** fact sheets for DYCU's areas, with a city comparison from the Census. It covers why DYCU's areas and not City neighborhoods, why Census figures for the city, the comparison test and its caveat. "What actually happened" is left blank.
- **/how-it-works:** one paragraph on fact sheets and where the city figure comes from.
- **DESIGN.md:** "### Fact sheet", from the approved comp.

## 11. Out of scope

- Fact sheets for City neighborhoods (combined-tract figures; a later project).
- Trends across years on one sheet; the year switcher shows one year at a time.
- Comparing two neighborhoods side by side.
- Any AI-written summary on the sheet.
- City counts (crime, 311) on the sheet. Their periods don't match the survey's, which would mix kinds of figure.
