# Fact sheets for every City neighborhood: design

**Date:** 2026-10-16 · **Decision:** 054 · **Status:** approved; implemented

## 1. Goal

Today a fact sheet exists only for Data You Can Use's (DYCU's) 27 profiled areas. An address anywhere else in the City, such as Bay View, the East Side or Washington Heights, gets "Data You Can Use doesn't make a fact sheet for it." The goal is that every one of the City's official neighborhoods opens a fact sheet like Riverwest's, with its numbers honestly labeled as built from census tracts.

- **For:** residents arriving from the address box (home page and `/n`) or from search.
- **Success:**
  - Every City neighborhood name and address opens a page.
  - The nine figures come with ranges and a City comparison.
  - The sum of all neighborhoods' people lands within 3% of the Census Bureau's City total, the same bar as decision 052.

## 2. Decisions made in conversation (Tarik, 2026-10-16)

| Question | Answer |
|---|---|
| Where the numbers come from | The Census Bureau's tract tables for the same nine figures, shared out to neighborhoods by each tract's share (decision 052's method). Tagged CENSUS. |
| Neighborhoods under 1,000 residents | A page with no figures: "Too few residents (about N) for reliable Census figures," plus the tracts it sits in. |
| Years | Newest five-year period only (today 2020–2024), the same period as the "City of Milwaukee" column. No year switcher. |
| How it's computed | Added up when the page opens (approach A), from stored tract rows. No stored neighborhood rows. |

## 3. Terms

- **Census tract:** a small area the Census Bureau draws, about 4,000 people, whose numbers it publishes every year.
- **Five-year period (ACS 5-year):** the American Community Survey pools five years of answers so small areas have enough of them. "2024" means 2020–2024.
- **Share:** the percent of a tract's land inside a neighborhood (`tractNeighborhoods.pieces[].share`, 0–100). The design treats it as the share of the tract's residents, which assumes residents are spread evenly within the tract.
- **Margin of error (range):** the Census Bureau's ±, at 90% confidence.

## 4. Data

### 4.1 The nine figures and their Census variables

These are the same as `FACTS` in `convex/lib/factSheet.ts`, so the City column and the new sheets can't drift apart.

| id | Figure | Parts (added up) | Of (base) | Table kind |
|---|---|---|---|---|
| population | People | `tractPopulations` (B01003, already stored weekly) | — | — |
| poverty | People in poverty | B17001_002 | B17001_001 | detailed |
| low-income | Households earning under $25,000 | B19001_002–005 | B19001_001 | detailed |
| renters | Renter households | DP04_0047 | DP04_0002 | profile |
| vacant | Vacant homes | DP04_0003 | DP04_0001 | profile |
| rent-burden | Renters paying 30%+ on rent | DP04_0141, DP04_0142 | DP04_0136 | profile |
| no-car | Households with no vehicle | B08201_002 | B08201_001 | detailed |
| degree | Adults 25+ with a bachelor's or more | S1501_C01_012, _013 | S1501_C01_006 | subject |
| no-diploma | Adults 25+ without a diploma | S1501_C01_007, _008 | S1501_C01_006 | subject |

### 4.2 New table `tractFigures`

`{ geoid: string, period: number, values: Record<code, { estimate, moe | null }>, fetchedAt: number }`, indexed `by_geoid`.

- There is one row per Milwaukee County tract. The table is replaced each week.
- About 300 rows, each with about 40 values.

### 4.3 Weekly fetch: `refreshTractFigures`

1. **When it runs.** In the weekly build, next to `cityFigures:refreshCityFigures`. It can also be run alone: `npx convex run cityFigures:refreshTractFigures`.
2. **Which period.** The newest period that `cityFigures` holds, so the sheet and its City column always match.
3. **What it asks for.** One request per table kind (detailed, profile, subject). It reuses `requestsFor()`'s codes without the race codes, and `censusUrl(…, geo)` with `for=tract:*&in=state:55&in=county:079`.
4. **How it reads the answer.** The parser follows `parseCensus`'s rules:
   - -555555555 means a margin of 0;
   - any other large negative number means missing;
   - each tract's GEOID is built from its state, county and tract columns.
5. **Failure handling.** It follows `refreshCityFigures` exactly:
   - it never throws;
   - an HTTP error keeps last week's rows and adds a note;
   - a timeout stops it;
   - the key is scrubbed from every note.
   - A fetch that returns fewer than 250 tracts is treated as a failure, so a partial answer never replaces a full week.

## 5. Building a neighborhood's figures (pure function, `convex/lib/cityFactSheet.ts`)

Inputs:
- the neighborhood's pieces: every tract whose `pieces` list names it, with its share;
- the `tractFigures` rows;
- the tract populations.

1. **Counts.** For each figure's parts and base, add up `estimate × share/100` across the neighborhood's tracts.
2. **Margins.** The margin of that total is `√Σ(moe × share/100)²`, the same rule decision 052 uses. A tract missing a value is left out of that figure. The figure is shown as missing ("—") only if its tracts with values hold less than half of the neighborhood's residents, the "thin" rule from 052.
3. **Rate and comparison.**
   - Rate = parts ÷ base, with its margin from `shareOf` (`convex/lib/factMath.ts`, the Census Bureau's ratio formula, already used by the DYCU sheets).
   - The City comparison uses `versus` with the stored City figure for the same period: "clearly higher / about the same / clearly lower."
4. **People.** Σ population × share/100. No range, because B01003's margin isn't stored. The line says "about".
5. **Small neighborhoods.** Under `MIN_RESIDENTS` (1,000, from `neighborhoodFigures.ts`), return `{ status: "small", people, tracts }` and no figures.

## 6. The page: `/n/<slug>`

**Route order.** The existing `factSheet.sheet` query looks for a DYCU area first. Only if it finds none does it look up a City neighborhood by slug (`areaSlug` of the City name). It returns `{ status: "ok", kind: "census", … }` or `{ status: "small", … }`. An unknown slug still returns the index.

**Name collisions.** If a City name's slug matches a DYCU area (both have a "Harambee"), DYCU's sheet keeps the address. DYCU's own figures win over built ones.

**Layout.** It reuses `FactSheet` (`ui/components/FactSheet.tsx`) with these differences:

| | DYCU sheet | Census-built sheet |
|---|---|---|
| Source line | DYCU's portrait, with its year links | "U.S. Census Bureau, 2020–2024 American Community Survey · built from census tracts" + CENSUS tag |
| Years | 2021–2024 switcher | none |
| Below the figures | DYCU's detail tables | the method note (below), then the tract map |
| Print | one Letter page | one Letter page |

**Method note:** "Built from N census tracts, each counted by the share of its land in <name>. Approximate: it assumes residents are spread evenly within a tract. Ranges are the Census Bureau's margins of error, at 90% confidence."

**Small page:**
- The name and the line "Too few residents (about N) for reliable Census figures."
- A list of the tracts it sits in, with each share.
- The same tract map.

**Map.** It's the existing fact-sheet tract map, given the neighborhood's tract GEOIDs (`tractMap`'s `{ url, geoids }`, which draws tract shapes from DYCU's county poverty layer).

## 7. How people reach it

1. **Address box** (`FindPlaceBox`, home and `/n`). A City neighborhood DYCU doesn't profile now shows "Open <name>'s fact sheet →" to `/n/<slug>`. The PR #55 Ask suggestion stays as a second line.
2. **Search.** `factSheet.areaInSearch` also matches the City's neighborhood names, so "bay view crime" gets the FACT SHEET block. DYCU names are checked first and win a tie.
3. **The `/n` list.** DYCU's 27 stay on top under "Data You Can Use's neighborhood portraits." Below them, "Every City neighborhood," A to Z, without the names DYCU already covers.
4. **Not reached from Ask yet.** Ask's `factSheet` tool keeps its 27. Teaching the AI about the new sheets is a separate change, with its own grading.

## 8. Testing

1. **Unit, the share-out math:**
   - A neighborhood inside one tract (share 100) reproduces the tract's own numbers.
   - A neighborhood across two tracts (shares 60 and 25) matches hand-computed counts, margins and rate.
   - The "thin" rule turns a figure to "—".
   - The small case returns no figures.
2. **Unit, the parser:** the tract response gives GEOIDs and Census annotation values, and a response with under 250 tracts is refused.
3. **Server (convex-test):**
   - `sheet` with a City slug returns a census sheet;
   - a colliding slug returns DYCU's;
   - a small neighborhood returns `small`;
   - `areaInSearch` finds "bay view crime".
4. **Browser:**
   - the Bay View address → "Open Bay View's fact sheet →" → nine figures with a CENSUS tag and the method note;
   - `/n` lists "Every City neighborhood";
   - a small neighborhood's page shows the "Too few residents" line.
5. **Real-data check on dev (after the fetch, with Tarik's OK):**
   - Add up every neighborhood's people and compare to the City's Census total. It must be within 3%.
   - Spot-check one DYCU area that's also a City neighborhood: its built poverty rate should fall within the range DYCU publishes for it. If not, say so; don't tune until it does.

## 9. Not in this piece

- Years and change over time.
- City records (crime, 311) on the sheet.
- Ask's tool reaching the new sheets.
- Median income or median rent, which can't be added up across tracts.

## 10. After merge

Tarik runs `npx convex run cityFigures:refreshTractFigures --prod` once. After that, the weekly build keeps it fresh.
