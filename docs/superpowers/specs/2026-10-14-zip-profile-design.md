# Cream City Almanac: Who Lives in a ZIP Code (Project Z1) — Design

Tarik approved this design in conversation on 2026-10-14, part by part.

## 1. Why

Someone asked Ask "what is the demographic makeup of 53228". Ask refused: DYCU's tables are by census tract, neighborhood, aldermanic district and ward, never by ZIP. The refusal was correct but unhelpful, because the Census Bureau publishes the same survey for ZIP-shaped areas.

The screenshot also showed the person's own ZIP ("53228") marked UNVERIFIED, as if Ask had made the number up.

## 2. What the exploration found (2026-10-14)

- **The Census survey covers ZIP areas.** The American Community Survey (ACS) 5-year API lists "zip code tabulation area" (geography level 860) nationwide, with no state or county needed. A ZIP code tabulation area (ZCTA) is the Census Bureau's version of a ZIP, built from census blocks. It is close to the post office's ZIP, but not identical.
- **The API now refuses requests without a key** (it redirects to `missing_key.html`). The app already has `CENSUS_API_KEY` on the server, used by `cityFigures:refreshCityFigures` for the fact sheets' city-wide comparison.
- **37 ZIP areas touch Milwaukee County,** from the Census 2020 ZCTA-to-county file. Their share of land inside the City of Milwaukee, from the 2020 ZCTA-to-place file:
  - 100%: 53202–53207, 53216, 53218, 53224, 53233, 53295.
  - Mostly in the City: 53208 (99%), 53210 (99%), 53215 (93%), 53212 (89%), 53225 (80%), 53221 (69%), 53223 (64%), 53209 (61%), 53222 (58%), 53219 (52%), 53211 (50%).
  - Mostly outside: 53220 (30%), 53214 (26%), 53213 (15%), 53226 (10%), 53227 (10%), 53228 (10%, 89% Greenfield).
  - None: 53110, 53126, 53129, 53130, 53132, 53154, 53172, 53217, 53235.
- **Post-office-box ZIPs** (such as 53201) have no ZIP area and no residents in the Census.

## 3. Decisions (Tarik, 2026-10-14)

- **Measures:** race and ethnicity, total population, and the fact sheets' 8 measures, each with Milwaukee's figure beside it.
- **Reach:** the 37 ZIP areas that touch Milwaukee County. Anything else gets "Ask covers Milwaukee County ZIPs".
- **Approach:** live, per question, like City counts. No stored table, and no data step for ZIPs.
- **Not included:** a share link for this card (the fact sheet card isn't shareable either).

## 4. The ZIP list (`convex/lib/zips.ts`)

```ts
export type ZipArea = { cityShare: number; mainPlace: string }; // cityShare: 0–1, land in the City of Milwaukee
export const COUNTY_ZIPS: Record<string, ZipArea> = { "53228": { cityShare: 0.10, mainPlace: "Greenfield" }, /* … 37 entries */ };
```

- It is built once from the two 2020 relationship files named in §2. The comment names them, the county (GEOID 55079), and how the shares were computed: land area of the overlap ÷ the ZIP area's land.
- `mainPlace` is the city or village with the most of the ZIP's land, with " city", " village" or " town" dropped. "Milwaukee city" becomes "the City of Milwaukee".
- The shares are land, not people. The card says "land".

## 5. The tool (`convex/zips.ts`, `zipProfile`)

`zipProfile({ zip })` is an action. In order:

1. Sign-in is required. It takes from the `askCity` allowance and returns `busy` when that runs out.
2. It trims the ZIP:
   - not 5 digits → `bad-zip`;
   - not in `COUNTY_ZIPS` → `outside` (the reply names the county and says a post-office-box ZIP has no residents in the Census).
3. **Period:** the newest period stored in `cityFigures`, so the ZIP and Milwaukee are from the same survey years. If none is stored → `unavailable`.
4. **Census requests:** the same three kinds the fact sheets use (detailed, `/profile`, `/subject`), sent in parallel, for `for=zip%20code%20tabulation%20area:<zip>`.
   - `censusUrl` gains a geography argument. The city call stays as it is.
   - `parseCensus` is reused unchanged.
   - Timeout: 15 seconds.
   - Any error text has `key=…` scrubbed before it is logged, as `refreshCityFigures` does.
5. **Figures** (code only):
   - **Population:** `B03002_001`.
   - **Race and ethnicity** (shares of `B03002_001`, using `sumOf` and `shareOf`):

     | Group | Codes |
     |---|---|
     | White (not Hispanic) | `B03002_003` |
     | Black (not Hispanic) | `B03002_004` |
     | Asian (not Hispanic) | `B03002_006` |
     | Two or more races (not Hispanic) | `B03002_009` |
     | Other (not Hispanic) | `B03002_005` + `_007` + `_008` |
     | Hispanic or Latino (any race) | `B03002_012` |

   - **The 8 fact measures:** `cityFigure(entry, zipValues)` for every `FACTS` entry with a `census` pick, so the formulas are the fact sheets' own.
   - **Milwaukee:** the same figures from the stored `cityFigures` values for that period, with `versus` giving higher, lower, same or unknown.
6. **Returns:**

   ```ts
   { status: "ok"; zip; period: string; cityShare; mainPlace;
     population: Est; race: Row[]; facts: Row[] }
   // Row = { id; label; meaning; zip: Figure | null; city: Figure | null; verdict: Verdict }
   ```

   Totals and shares only. The Census returns no households, and neither does the tool.

**Other statuses:** `busy`, `bad-zip`, `outside`, and `unavailable` (no key, Census down or slow, a non-OK reply, or nothing stored). The person sees "Census figures are unavailable right now; try again later." The log has the reason, without the key.

**Race in the city figures:** the `B03002` codes join `requestsFor()`, so the weekly refresh stores Milwaukee's race figures. Until a refresh runs, Milwaukee's race column reads "—".

## 6. The card (`ZipCard`)

| Part | Content |
|---|---|
| Title | "ZIP {zip} · Census estimates, {period}" + a **CENSUS** tag |
| Where it is | Shown when `cityShare < 0.95`. Examples: "About 10% of this ZIP's land is in the City of Milwaukee; most is in Greenfield. These figures cover the whole ZIP." With no City land: "None of this ZIP is in the City of Milwaukee; most is in {mainPlace}." |
| Population | "{n} people (± {moe})" |
| Who lives here | Race and ethnicity rows: the ZIP's share ± margin, Milwaukee's share, and "clearly higher / clearly lower / about the same" |
| Living here | The 8 measures, same columns |
| Notes | "A Census ZIP area is close to, but not exactly, the post office's ZIP." · "These are survey estimates; each comes with a margin of error, the range the true number likely falls in (90% confidence)." · "U.S. Census Bureau, American Community Survey 5-year estimates, {period}." |
| Export | CSV, text and PNG through `cardExport`, as for every card |

**The tag:** `CENSUS` joins `ProvenanceTag` as display-only, like `CITY`, with the title "From the U.S. Census Bureau's American Community Survey".

## 7. Ask

- **Tool description:** for questions about who lives in a ZIP or what it's like (race, ethnicity, income, renters, cars, schooling). One ZIP per call. Never answer a ZIP question by adding up tracts or neighborhoods.
- **Prompt line:** "A ZIP question goes to zipProfile. When the card says most of the ZIP is outside the City, say that first. Don't restate the card's figures."
- **Scripted test model:** "demographic makeup of 53228" → `zipProfile({ zip: "53228" })`.
- **Graded real-AI question:** "What is the demographic makeup of 53228?" must reach `zipProfile` with `53228`.

## 8. The UNVERIFIED fix (`ui/lib/askProse.ts`)

A 5-digit number that appears in the person's own question is a name, not a figure. Only 5-digit numbers are covered: a model repeating "40%" from the question is still checked.

Today `AskPanel` passes `proseSegments(text, data)` only the tools' output as `data`. It will also pass the person's own messages, as a third argument `asked`, and only 5-digit numbers are matched against it.

## 9. Testing

**Unit tests (Vitest):**
- the ZIP list: 37 entries, shares between 0 and 1, 53228 = 0.10 Greenfield, 53202 = 1;
- ZIP checks: "53228 " is trimmed; "5322", "abcde" and 53201 are refused;
- `censusUrl` for a ZIP area; the city URL is unchanged;
- race groups and the 8 measures from a sample Census reply, including "Other" summing three codes with combined margins;
- the place note at shares of 0, 0.10, 0.94 and 0.95 (none shown);
- an error message containing `key=SECRET` is logged without it;
- the prose fix: "53228" from the question isn't flagged; a 5-digit number the person didn't type is.

**Database tests (convex-test, Census faked):** signed out; allowance spent; outside ZIP; Census down; Census non-OK; no stored period; ok with Milwaukee's comparison; Milwaukee's race missing → "—".

**Live check on dev (with Tarik's OK):** one real `zipProfile("53228")`. Population should be in the tens of thousands, and the shares should add up to about 100%.

**Browser (Playwright):** the scripted 53228 question draws the ZIP card with the Greenfield note.

**Graded real-AI question:** §7, about $0.05.

## 10. Docs

- **Decision 046:** a third source (Census) beside DYCU and the City; ZIP areas versus adding up tracts; live versus stored. "What actually happened" is left blank.
- **/how-it-works:** one sentence on ZIP answers and the CENSUS tag.
- **The questions document:** add "What is the demographic makeup of 53228?" as **Now**.

## 11. Going live

Merging deploys the code. To fill Milwaukee's race column, Tarik runs `npx convex run cityFigures:refreshCityFigures --prod`, or waits for the weekly build.

## 12. Out of scope

- a share link for ZIP cards;
- ZIPs outside Milwaukee County, and post-office-box ZIPs;
- splitting a ZIP's figures into its City and non-City parts;
- age bands and median income;
- maps of ZIP areas.
