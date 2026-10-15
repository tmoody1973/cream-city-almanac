# Cream City Almanac: Neighborhood Answers Built From Census Tracts (Part 1) — Design

Tarik approved this design in conversation on 2026-10-15, section by section.

## 1. Why

**Ask answers "where" questions about DYCU's data in census tracts.** A reader doesn't know what a census tract is; people think in neighborhoods.
- **Decision 035** chose to list tracts rather than blend them, to avoid hiding partial tracts.
- **Decision 036** built neighborhood fact sheets only for DYCU's 27 areas.

**ZIP health (decision 050)** now answers health, food and poverty "where" questions by ZIP. This part answers the rest of DYCU's tract measures by the City's neighborhoods: housing, income, internet, education, jobs, and the like.

## 2. Decisions (Tarik, 2026-10-15)

- **Unit:** the City's 190 official neighborhoods.
- **Figures:** built from DYCU's census tracts, each piece weighted by how many residents live in it.
- **Tools:** neighborhoods become the default unit of the existing rank and compare-two tools. Census tracts are available on request ("by census tract", or a "BY CENSUS AREA" follow-up button).
- **Routing:**
  - **The words decide first:** "neighborhood" → neighborhoods; "ZIP" → ZIP health.
  - **Otherwise, the topic:**
    - health, food, hospital visits and poverty → ZIP health (as today);
    - housing, income, internet, education, jobs → neighborhoods.
- **First slice:**
  - `rankTracts` and `relateTracts` (both modes) by neighborhood;
  - `compareYears` by neighborhood comes next;
  - the City's property file (MPROP medians) keeps tract answers, because tract medians can't be averaged.
- **This revisits decision 035** ("never blend tracts"). The blend is labeled as approximate, and the tract answer stays one click away.

## 3. Data (weekly, in `build:refreshNeighborhoods`)

### 3.1 Every piece of every tract

- **Today:** `tractNeighborhoods` stores `city: { name, share }[]` with shares of 10% or more, for display (decision 031).
- **Added:** a `pieces: { name, share }[]` field, every City neighborhood covering **1% or more** of the tract.
- **How:** from a new `cityPieces(tract, hoods)` in `convex/lib/tractPlaces.ts`. It is `cityShares` with a minimum argument: `cityShares(tract, hoods, min = 10)`, and the build calls it with 1.
- **Shares** are percent of the tract's area, as today.

### 3.2 Tract populations

- **New table:** `tractPopulations` (`{ geoid, population, period }`).
- **Filled weekly** from the Census Bureau's ACS 5-year total population (`B01003_001E`) for every Milwaukee County tract, in one request: `for=tract:*&in=state:55&in=county:079`. It uses the stored city figures' period, as the ZIP card does, and the existing `CENSUS_API_KEY`.
- **Replaced only on a successful read.** A failure keeps last week's and adds a build note.

## 4. The math (`convex/lib/neighborhoodFigures.ts`, pure)

**Inputs:**
- a measure's tract values (`TractValue[]`: geoid, value, lo, hi, kind);
- each tract's `pieces`;
- tract populations.

**Neighborhood figure:**
- **Residents in a piece:** `population × share / 100`.
- **Weights:** a neighborhood's weight for tract *i* is `wᵢ = residents in that piece / Σ residents over its pieces`.
- **Value:** `Σ wᵢ · valueᵢ`.
- **Range:** half-width = `√Σ (wᵢ · halfWidthᵢ)²`. This is the standard combination for independent estimates. The dataset's own range kind (90% Census, 95% CDC) is kept, along with the result's `lo` and `hi`.
- **No range** (`lo`/`hi` null) if any piece lacks one.
- **Residents:** `Σ residents`. **Census areas:** the number of tracts with a piece.

**Coverage rules:**
- **Small neighborhoods:** fewer than **1,000 residents** → left out of rankings and comparisons, and named on the card (as in ZIP health).
- **Tracts with no value** (DYCU's file left them out) leave their pieces out of the neighborhood. If that drops more than half of a neighborhood's residents, it's left out with "too little data".
- **Too uncertain** uses the tract cards' existing rule (`isUnreliable`).

**City benchmark:** the City of Milwaukee figure, built the same way from every City tract. Each tract's City residents are its population × the sum of its pieces' shares.

**Answers:**
- **Rank:** neighborhoods ordered by value. The too-uncertain ones are set aside. Each gets a verdict against the city: clearly higher (its whole range is above the city's figure), clearly lower, about the same, or too uncertain.
- **Compare-two, "go together" (`relate`):** Spearman's rank correlation over neighborhoods, with at least 20 usable neighborhoods; the existing `relationship()` wording.
- **Compare-two, "low despite high" (`mismatch`):**
  - `b`, the measure asked about (low or high), is compared with the city figure: "clear" means the whole range is past it;
  - `a`, the condition, is compared with thirds of neighborhoods;
  - matches are "clear" or "possible", ordered as ZIP health orders them.

## 5. Tools and routing

- **`rankParams` and `relateParams`** gain `unit: "neighborhood" | "tract"` (default `"neighborhood"`).
  - With `neighborhood` (limit to one neighborhood's tracts) set, or a City property file code, the unit is `"tract"` whatever was asked.
  - With unit `"neighborhood"`, only City tracts are used, from whichever member (City or County) the dataset has.
- **`rankTracts` / `relateTracts`** return their current tract answer for `"tract"`. For `"neighborhood"` they return `{ status: "ok", tool: "rank-n" | "relate-n", … }`, stored and served through `tractDetail` like today's answers, so share links and exports work the same way.
- **The prompt's routing line** (lib/ask/prompt.ts) states §2's rule, and that census tracts are only for questions that say so.

## 6. The card (`[data-card=neighborhood-rank]`, `[data-card=neighborhood-relate]`)

Shaped like the ZIP health card:
1. **A bold code-written lead:**
   - "Highest {measure}: Harambee, Lindsay Heights, Metcalfe Park."
   - "No neighborhood clearly has {low b} with {high a}. Possible: Riverwest."
   - "Neighborhoods with more {a} tend to have more {b} (a strong pattern)."
2. **"City of Milwaukee: {figure} ({range})."**
3. **Rows:** neighborhood, figure (range), and the verdict against the city (for rank) or the match strength (for mismatch). Top 10 for a rank.
4. **Notes:**
   - the measure in plain words (DYCU's column description, never a code or column name);
   - "Neighborhood figures are built from census areas, weighted by how many residents live in each part, so they're approximate.";
   - the cutoff (mismatch);
   - the range rule;
   - "Left out (fewer than 1,000 residents): …";
   - the period;
   - DYCU's credit and a link to the dataset.
5. **Map:** the matching neighborhoods, from the City's neighborhood layer (`NEIGHBORHD` field). `CityMap`'s shape loader gains a `field` option (default `GEOID`) and accepts neighborhood names.
6. **Follow-up buttons:**
   - "BY CENSUS AREA" (the same question, by census tract);
   - for rank, "{top} VS CITY" (that neighborhood's fact sheet, if DYCU profiles it, or its rank figure).
7. **Export bar and share link,** as on other cards.

## 7. When things go wrong

| Situation | What a person sees |
|---|---|
| No populations stored yet | rank and relate fall back to the tract answer, and say "neighborhood figures aren't ready yet" |
| A tract is missing from the populations | its pieces count with no residents (left out); the build notes how many |
| Fewer than 20 usable neighborhoods for "go together" | the existing "too few" wording |
| A measure that's a count, not a rate | neighborhoods aren't built (a weighted average of counts is wrong); the tract answer, with the note "counts can't be combined across census areas" |

## 8. Tests and grading

**Unit tests:**
- `neighborhoodFigures` on a small hand-checked fixture: two tracts, three neighborhoods, a partial tract. Checks the weights, the value, the range, residents, the small-neighborhood rule, a missing-value tract, and the city benchmark.
- `cityShares` with a minimum of 1.
- Rank and mismatch on neighborhood figures.
- The card's lead sentences.
- Export credit.

**Backend tests:**
- the population refresh stores tracts and keeps last week's on failure;
- `rankTracts` with unit `"neighborhood"` returns a `rank-n` answer from fixtures;
- a count measure falls back to tracts.

**Browser test:** the scripted model's "rank tracts" question with unit `"neighborhood"` draws `[data-card=neighborhood-rank]` with "City of Milwaukee:".

**Live check on dev (with Tarik's OK):**
- push;
- run `build:refreshNeighborhoods`;
- confirm populations for about 300 County tracts and pieces stored, and a sample neighborhood's residents within 10% of the Census Bureau's own neighborhood-sized totals where known.

**Graded (real AI):**
- add "Which neighborhoods have the highest rent burden?" (`rankTracts`, `tool: "rank-n"`) and "Do neighborhoods with more renters have less internet at home?" (`relateTracts`, `relate-n`);
- rerun the tract and ZIP questions to confirm the routing.

## 9. Docs

- **Decision 052:**
  - blending tracts into neighborhoods, revisiting 035;
  - the weights;
  - why counts and MPROP medians stay tract answers;
  - "What actually happened" is left blank.
- **DESIGN.md:** a "Neighborhood figures" card section.

## 10. Out of scope

- `compareYears` by neighborhood (next slice);
- DYCU's own 27 report areas;
- City property file figures by neighborhood;
- Health Compass tract data.
