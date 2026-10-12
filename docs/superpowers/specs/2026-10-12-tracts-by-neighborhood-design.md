# Cream City Almanac: Tract Questions by Neighborhood — Design

Tarik approved this design in conversation on 2026-10-12, section by section. It is Project G in the build order for making the "Partly / Not yet" questions answerable:

- J: data fixes (done)
- F: totals and medians (live)
- **G: this spec**
- D: fact sheet
- H: address lookup
- I: boundaries and places
- K: files split by period
- C2: share link
- L: more "how long" pairs

## 1. Why

Nonprofits and reporters ask about "the tracts we serve" by neighborhood name:
- What's the poverty rate in Bay View's tracts?
- Which Harambee tracts changed since 2018?
- Where in Sherman Park is poverty high but food insecurity low?

Ask can rank, compare and relate all tracts, and each row already names its City neighborhoods. It can't yet limit a question to one neighborhood. The questions document marks "All tracts in Bay View" as **Not yet** (docs/research/2026-10-12-questions-by-audience.md, line 138).

## 2. What the exploration found (2026-10-12, read-only)

- **Tract rows already carry both maps.**
  - `toRow` in `convex/tracts.ts` gives each row `city` (City neighborhoods with `share`) and `dycu` (DYCU area names). The DYCU areas are worked out for that dataset's year by `neighborhoodsFor`.
  - So limiting to a neighborhood is a filter on rows the tools already build.
- **`share` is the percent of the tract's area inside the neighborhood.**
  - `cityShares` in `convex/lib/tractPlaces.ts` computes it from points inside the tract and drops anything under 10%.
  - The tract table has 210 tracts and 426 tract–neighborhood pairs. 69 tracts lie in 1 neighborhood, 83 in 2, 42 in 3 and 16 in 4–5.
- **How neighborhoods line up with tracts:**
  - Bay View touches 11 tracts: 5 are 97–100% inside, and 6 are 15–61% inside.
  - Harambee touches 9 tracts.
  - Sherman Park touches 7, none more than 75% inside.
- **15 of the 190 City neighborhoods have no tract,** for example Buchel Park and College Heights. Each covers less than 10% of every tract it touches.
- **Names are consistent.** Every name in the tract table is one of the City's 190 neighborhoods in the `neighborhoods` table, where `definition` is "city".
- **DYCU has 27 areas** (definition "dycu"). Each lists tract numbers by year; Washington Park, for example, has 6.
- **17 names are on both maps,** including Harambee, Clarke Square, Sherman Park and Riverwest.
- **The "do these go together" test needs at least 20 tracts.** `relationship` in `convex/lib/tractStats.ts` reports "too-few" under 20, and a neighborhood has 2–11 tracts.

## 3. Decisions (Tarik, 2026-10-12)

- **The tracts, listed.** Each tract keeps its own number and margin of error, and nothing is blended. A combined neighborhood figure is out of scope; it belongs with the fact sheet (D).
- **Any overlap counts, with the share shown.** Every tract with at least 10% of its area in the neighborhood is included. Each row says how much: "61% of this tract is in Bay View".
- **The City's map by default, DYCU's on request.**
  - A name means the City's official neighborhood, as in City counts, and the card says so.
  - "DYCU's Harambee", or a name that exists only on DYCU's map, uses DYCU's area.
- **Approach A:** a `neighborhood` option on the three tract tools, rather than a separate lookup tool or a filter on the card.

## 4. The tools

Three tools gain two optional inputs: `rankTracts`, `compareYears` and `relateTracts`.

- `neighborhood?: string`: a neighborhood name as the person said it.
- `map?: "city" | "dycu"`: set to "dycu" only when the person says DYCU's area. The default is "city".

Without `neighborhood`, everything is unchanged.

### 4.1 Finding the neighborhood (`convex/lib/tractsIn.ts`, new)

- **Matching the name.** `matchName` (from `convex/lib/neighborhoodNames.ts`) matches the asked name against the `neighborhoods` rows for the chosen map.
- **The DYCU fallback.** When the map is "city" and nothing matches, but a DYCU area matches exactly, the DYCU area is used and the card says so.
- **No match:** the result is `no-neighborhood` `{ asked, nearest: string[] }` with the 3 nearest names from the chosen map, shown as buttons. City counts use the same status.
- **The filter:**

  | Map | A row is kept when | Its share is |
  |---|---|---|
  | City | `row.city` contains the name | that entry's `share` |
  | DYCU | `row.dycu` contains the name | 100, since DYCU areas are whole tracts |

- **A match with no rows:**
  - It is a `no-tracts` refusal: `{ name, map }`.
  - The message reads: "{name} covers less than 10% of every census tract it touches, so no tract can stand for it. Try a larger neighborhood nearby, or count City records inside its boundary."
  - For a DYCU area with no tract in that dataset's year, the message names the years it has.

### 4.2 Rank (`rankTracts`)

- **Order:** the tool loads the whole place's values as today, filters them to the neighborhood, and ranks every remaining tract, not only a top 10.
- **Citywide rank:** each row gains `cityRank: { position, of }`, its place among all reliable tracts in the same direction (for example "12th highest of 210"). Unreliable rows get no rank, as today.
- **Header:** the result gains `area: { name, map, tracts, partly }`, where `partly` counts rows with a share under 90.
- **Ties:** the "can't tell apart" rule is applied within the listed rows.

### 4.3 Compare years (`compareYears`)

- The same filter, applied to the tracts present in both years.
- The rows split into "changed clearly" and "no clear change" by the existing margin-of-error test.
- The header is the same as rank's.

### 4.4 Relate (`relateTracts`)

- **Mismatch mode:** the high and low cutoffs are computed from the whole place first, then the rows are filtered to the neighborhood. "High" keeps its citywide meaning.
- **Relate mode inside a neighborhood:** it returns `too-few-tracts` `{ name, n, needed: 20 }` without computing a relationship. The card offers one button that asks the same question citywide.

### 4.5 Ask

- **The prompt gains one rule:** a tract question that names a neighborhood passes `neighborhood`; "DYCU's" sets `map: "dycu"`.
- **The tool descriptions** each gain one sentence on `neighborhood`, `no-neighborhood`, `no-tracts` and `too-few-tracts`.
- **The scripted test model:** "What's the poverty rate in Bay View's tracts?" → `searchCatalog` "poverty" → `rankTracts` with `neighborhood: "Bay View"`.

## 5. The cards

- **Header line:**
  - "Bay View (City of Milwaukee boundary) · 11 tracts, 6 partly inside".
  - For a DYCU area: "Harambee (DYCU's area) · 9 tracts".
- **Each row** adds two things:
  - its share, as "61% of this tract is in Bay View", shown only under 100;
  - for rank, its citywide rank ("12th highest of 210").
- **Refusals:**
  - `no-neighborhood` shows the nearest names as buttons.
  - `no-tracts` shows the message in §4.1.
  - `too-few-tracts` reads "Too few tracts in {name} to tell whether these go together (it takes 20; {name} has {n})", with an "Ask citywide" button.
- **Exports** (C1's ExportBar) carry the header line, and the share and citywide rank as columns.

## 6. Testing

**Unit (Vitest)**
- `tractsIn`:
  - matching on each map;
  - the DYCU fallback;
  - nearest names on a miss;
  - shares carried through;
  - a DYCU row's share is 100;
  - `no-tracts` for a match with no rows.
- Rank: every tract listed, citywide rank computed against the whole place, `partly` counted.
- Compare: the changed and no-change split, limited to the neighborhood.
- Relate: mismatch keeps the whole-place cutoffs; relate mode under 20 returns `too-few-tracts`.

**Database (convex-test, DYCU's server faked)**
- Each tool end to end with `neighborhood`.
- `no-neighborhood` and `no-tracts`.
- Without `neighborhood`, results are unchanged (existing tests stay green).

**Browser (Playwright, scripted model)**
- "What's the poverty rate in Bay View's tracts?" draws the rank card on phone and desktop with:
  - the boundary line;
  - a "% of this tract is in Bay View" row;
  - a citywide rank;
  - no sideways page scroll.

**One graded real-AI question** (`npm run ask:card -- --only=N`): "What's the poverty rate in Bay View's tracts?" must reach `rankTracts` with `neighborhood: "Bay View"`.

## 7. Docs

- **Decision 035:** limit tract questions to a neighborhood by listing its tracts with their share, not by blending them. It covers why the City's map is the default and why "go together" refuses under 20. "What actually happened" is left blank.
- **/how-it-works:** one paragraph on asking about a neighborhood's tracts and what "61% of this tract" means.
- **DESIGN.md:** the header line and share text on tract cards.

## 8. Out of scope

- One combined figure for a neighborhood (with D, the fact sheet).
- Neighborhoods outside Milwaukee in County datasets: limits use the City's map or DYCU's areas only.
- Address lookup ("the tract at 2nd and Center"), which is Project H.
- Changing the 10% cutoff or recomputing shares.
