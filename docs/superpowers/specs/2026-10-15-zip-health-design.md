# Cream City Almanac: ZIP Health from Health Compass Milwaukee — Design

Tarik approved this design in conversation on 2026-10-15, section by section.

## 1. Why

- **A weak answer.** Ask answered "Where is food insecurity low despite high poverty?" with census tracts, dataset codes and a dump of 11 dataset links. A reader doesn't know what a census tract is.
- **A better answer exists.** Tarik ran the same question through a general AI agent. It answered by ZIP code, from Health Compass Milwaukee, and he liked it:
  - one bold sentence naming the place ("ZIP 53208 … is the clearest lead");
  - each place's two figures beside a benchmark;
  - the cutoff stated plainly;
  - the survey question quoted;
  - one limitation;
  - sources.

  But the agent did its arithmetic itself and slipped: it screened at 16% while saying 16.3%, which dropped ZIP 53209. It also showed no margins.
- **Health Compass Milwaukee** (healthcompassmilwaukee.org) is the Milwaukee Health Care Partnership's health data site, powered by Metopio.
  - **Size:** 204 topics, by ZIP code, census tract, municipality, county, state and US.
  - **Sources:** many Ask doesn't have, such as the 2024 community health survey, hospital emergency visits (Wisconsin Hospital Association) and vital records.
  - **Access:** its read-only API (`/api/v1/`) returns figures with standard errors without a login.

## 2. Decisions (Tarik, 2026-10-15)

- **Use Health Compass now,** with its source and credit attached to every figure wherever it travels (§6).
- **Health Compass before Part 1.** Neighborhood answers (Part 1) come next and can reuse this work.
- **First slice:** every Milwaukee County ZIP, every topic with data, the newest period, the whole population. Stored weekly.
- **Which source answers:** "where" / "which areas" questions about a measure Health Compass has go to ZIP health. Questions that name census tracts or a DYCU dataset keep the tract tools.
- **ZIP rows name the City neighborhoods inside them,** in this project.

## 3. What's stored, and how (weekly)

### 3.1 Health Compass figures

The weekly build (`convex/build.ts`, beside `refreshCityFigures` and `refreshFire`) calls a new `health:refreshHealth` internal action.

1. **Topics:** GET `/api/v1/topics/` (paginated, `limit` + `next`). For each topic, keep:
   - `key`, `name`, `description`, `units`, `format`, `is_count`, `direction`, `privacy`;
   - its datasets' source text: `source`, `dataset.name` and `notes` (for example "U.S. Census Bureau · American Community Survey (ACS) · Table B17001").
2. **Figures:**
   - **Places:** one request per place, `GET /api/v1/data/?layer=zip&geography=<zip>`, for each ZIP in `COUNTY_ZIPS` (`convex/lib/zips.ts`, 37 ZIPs). Also `layer=county&geography=55079` (Milwaukee County) and `layer=place&geography=5553000` (City of Milwaukee).
   - **Pacing:** one request per second, with the existing retry helper.
   - **Rows:** each row is `{ g, l, a, p, d, v, se }`: geography, layer, topic key, population group, period, value, standard error.
3. **Keep only the whole population** (`p === ""`), and **one period per topic and place:**
   - the newest end year (the period `d` is "2024" or "2020-2024");
   - on a tie, the longer span (multi-year figures are steadier for small areas).
4. **Drop topics** that end up with no ZIP figure (Health Compass also carries Chicago and New York topics).
5. **Storage:**
   - **Tables:** `healthTopics` (one row per topic) and `healthFigures` (`{ topic, layer, geo, period, value, se }`, indexed by topic and by geo), plus a `healthRefresh` status row (`{ status: "read" | "failed", note, at, figures }`).
   - **Replacement:** all at once, only when the run succeeded.
   - **Size:** about 160 topics × 39 places, roughly 6,000 rows.
6. **Shape check:** every response is checked with Zod before anything is stored. Their API page says it "may change without notice". A failed check or failed request keeps last week's copy, marks the status `failed` with the reason, and adds a line to the build notes.

### 3.2 ZIP neighborhood names

- **Outlines:** the weekly build fetches the Census Bureau's ZIP (ZCTA) outlines for the 37 ZIPs from TIGERweb (public, no key).
- **Matching:** it counts grid points against the City's 190 neighborhood shapes, the method in `convex/lib/tractPlaces.ts` (decision 031).
- **Stored per ZIP:** the City neighborhoods covering at least 10% of it, biggest first, in a `zipNeighborhoods` table (`{ zip, city: { name, share }[] }`).
- **Fallback:** if the outlines can't be fetched, the old rows stay. A ZIP with none shows its main town (`COUNTY_ZIPS[zip].mainPlace`), as Ask does today.

## 4. Ask's new tool: `zipHealth`

**Topic matching is done by code.**
- The AI passes the measure in words ("food insecurity", "asthma emergency visits"), never a topic key.
- Code scores the stored topics' names, descriptions and keywords.
- **One clear best match:** it answers.
- **Several close matches:** status `choose` with up to 8 "Pick one" buttons (the existing `refusalChoices` pattern).
- **None:** status `not-found`, saying what Health Compass does cover.

**Modes:**

| Mode | Asked like | Returns |
|---|---|---|
| `one` | "How does 53208 compare with the county on food insecurity?" | the ZIP's figure and range, the county's (and the city's, where Health Compass has it), and a verdict: clearly higher / clearly lower / about the same / too uncertain to say |
| `rank` | "Which ZIP codes have the most asthma emergency visits?" | every ZIP ordered, with ranges; the top 10 shown first |
| `relate` | "Where is food insecurity low despite high poverty?" (mismatch), "Is asthma higher where poverty is higher?" (go together) | **Mismatch:** matches as clear / possible / too uncertain. **Go together:** the strength of the pattern. Both reuse `convex/lib/tractStats.ts` (`spearman`, `relationship`, `byClearance`), with ZIPs in place of tracts. |

**Ranges:**
- `value ± 1.96 × se`, a 95% range, labeled on the card.
- **No standard error:** "no range published", never "clear".
- **Too uncertain:** the same rule as tracts (`isUnreliable`: a standard error over 40% of the value), shown as "too uncertain to say".

**Mismatch cutoffs:**
- **"High" side:** the third of ZIPs with the highest figures.
- **"Low" side:** clearly below the county figure, so the whole range is below it.
- **The reverse:** for "high despite low", the high side must be clearly above the county, and the low side is the third of ZIPs with the lowest figures.
- **Both stated on the card.**

**The AI's routing rule** (`lib/ask/prompt.ts`):
- "Where", "which areas" or "which ZIP" questions about health, food, poverty or another Health Compass measure use `zipHealth`.
- Questions that name census tracts, a DYCU dataset or its code keep `rankTracts` / `compareYears` / `relateTracts`.
- Demographic makeup of one ZIP stays `zipProfile`.
- No `searchCatalog` or `showDataset` before `zipHealth`.

## 5. The card (`[data-card=zip-health]`)

1. **A bold lead sentence, written by code.** Examples:
   - "**Clearest lead: <ZIP>.** Poverty is high there, but fewer people reported running short of food money than across Milwaukee County."
   - "**No ZIP clearly has high poverty with low food hardship. Possible: 53208.** Its figures point that way, but their ranges overlap the cutoffs."
   - "**Highest: 53205, 53206, 53218.**"
   - "**53208 is clearly lower than the county.**"
2. **Rows:**
   - the ZIP and its neighborhoods ("53208 · Washington Park, Sherman Park"), or its town for suburbs;
   - the figures with ranges;
   - the county figure;
   - a strength word.

   Clearest first.
3. **Code-written lines under the rows:**
   - **What it measures:** the topic's `description` word for word, its units and period.
   - **The cutoff,** plainly.
   - **The limitation:** a one-line note per dataset kind. For example, survey: "Answers come from the people who took the survey; small ZIPs have wide ranges." Modeled estimate: "A modeled estimate, not a count."
4. **Source and credit (§6),** the HCM tag, and a link to the topic on Health Compass.
5. **Map:** ZIP outlines shaded by the figure.
6. **Export bar and share link,** as on other cards.
7. **Codes** (topic keys) appear only in "How to read this" and the CSV.

**The AI adds** one to three sentences of context:
- possible explanations as possibilities, never causes;
- no new numbers (the existing unverified-number check applies);
- no dataset codes.

**Follow-up buttons** are written by code in plain words: "Show <measure> for every ZIP", "What else is in 53208?" (zipProfile).

## 6. Source and credit stay attached

Wherever a Health Compass figure goes, it carries:
- "Health Compass Milwaukee (Milwaukee Health Care Partnership), powered by Metopio";
- the topic's original source and dataset text, verbatim;
- the period;
- the topic's link: `https://healthcompassmilwaukee.org/topics/<key>`.

That covers:
- the card;
- the CSV: a source block with these lines, unrounded values and standard errors;
- copied text;
- the PNG image;
- the share-link page.

A unit test fails if any export of a ZIP-health card lacks the credit line, the source text or the link. The HCM tag's title reads "From Health Compass Milwaukee (Milwaukee Health Care Partnership)".

## 7. When things go wrong

| Situation | What a person sees |
|---|---|
| The weekly fetch fails or the response shape changed | last week's figures, with "as of <date>"; the build notes name the reason |
| Never fetched yet | "Health figures aren't loaded yet" (status `unavailable`) |
| A ZIP has no figure for the topic | that row reads "no data" |
| No standard error | "no range published"; never "clear" |
| Standard error over 40% of the value | "too uncertain to say" |
| ZIP outlines fail | rows show the main town |
| Throttled (HTTP 429) | the retry helper backs off; after its tries, the run fails as above |

Nothing about a person is fetched or stored: Health Compass figures are area totals and rates.

## 8. Tests and grading

**Unit tests (Vitest):**
- **The parsers' Zod shapes** accept a real response sample and reject a changed one.
- **Period pick:** newest end year, then longer span.
- **Ranges:** ± 1.96 × se; the no-se case; the 40% rule.
- **Topic matching:**
  - "food insecurity" finds the 2024 survey topic (`MQ35`), or offers it among the choices;
  - "poverty" finds `POV`;
  - nonsense returns `not-found`.
- **Modes:**
  - `one`: the verdict words;
  - `rank`: the ordering;
  - `relate`, on a fixture of real Health Compass figures (poverty `POV` 2020-2024 and survey food hardship `MQ35` 2024, each with its standard error, captured from the API): **no clear match, and 53208 is the only possible match.**
    - Its food hardship, 9.71 ± 1.96 × 2.24 (about 5.3–14.1), is below the county's 13.85, but its range reaches past it, so it isn't clear.
    - Its poverty, 21.63, sits right at the top-third cutoff (about 21.63 across the 34 reliable ZIPs), so it isn't clear either.
    - Of 35 ZIPs with both figures, 53203 is set aside as too uncertain.
    - The general AI agent called 53208 "the clearest lead"; with margins counted, it's a possible match. The card says so.
- **The lead sentences** for each mode and each outcome.
- **ZIP-neighborhood counting** on a small synthetic grid.
- **Exports:** every export carries the §6 credit.

**Backend tests (convex-test):**
- the refresh replaces the old copy on success;
- it keeps the old copy and marks `failed` on a bad response;
- the `zipHealth` action reads only stored rows.

**Browser test:** the scripted test model (`lib/ask/model.ts`) answers a "despite" question with a `zipHealth` call and draws `[data-card=zip-health]` with the HCM tag and the topic link.

**Live check on dev (with Tarik's OK):** push, run `health:refreshHealth` once, and confirm:
- 53208's food hardship reads 9.71% with its range;
- the county reads 13.85%;
- poverty is present for 37 ZIPs.

**Graded against the real AI** (`scripts/ask-questions.ts`):
- **Changed:**
  - "Where is food insecurity low despite high poverty?" now expects `zipHealth` (relate, mismatch);
  - "Is asthma higher where poverty is higher?" now expects `zipHealth` (relate).
- **Added:**
  - "Which ZIP codes have the highest rate of emergency visits for asthma?" (`zipHealth`, rank);
  - "How does 53208 compare with the county on food insecurity?" (`zipHealth`, one).
- **Unchanged and rerun:**
  - "What is the demographic makeup of 53228?" (`zipProfile`);
  - "Which census tracts have the highest poverty rate?" (`rankTracts`);
  - the two home-value questions (`relateTracts`).

**After merge:** Tarik runs `npx convex run health:refreshHealth --prod` once. The weekly build keeps it fresh after that.

## 9. Docs

- **Decision 050:**
  - **Options:** add Health Compass now (chosen), or link to it only.
  - **Why ZIP answers over tracts for "where" questions.**
  - "What actually happened" is left blank.
- **DESIGN.md:** a "ZIP health" card section and the HCM tag.
- **How it works page:** Health Compass added to the list of sources.

## 10. Out of scope

- group breakdowns (race, sex, age);
- Health Compass tract and municipality data;
- older periods and trends;
- Part 1 (neighborhood answers built from tracts), which is next;
- Part 2 (plain words across all of Ask).
