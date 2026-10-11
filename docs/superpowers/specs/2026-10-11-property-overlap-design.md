# Cream City Almanac: Property × Tract Overlap — Design

Approved in conversation 2026-10-11 (Tarik), section by section:
- what Ask shows: counts and a tract map, never addresses or owners;
- scope: over/under counts and the overlap with DYCU tract data in one build;
- the four measures;
- sections 1–4 below.

Builds on Ask analyzes (spec 2026-10-10-ask-analyzes-design.md, decision 027) and the plain analysis cards (decision 028, PR #20).

## 1. Why

A reader asked Ask "can you show me property with an assessed value over 200,000". Ask declined:
- its instructions forbid looking up individual records in datasets that name people;
- its City counter can only match exact values, not "over $200,000".

The question, and the stronger ones behind it ("do home values go with broadband?", "where are homes valuable but food insecurity high?"), can be answered without naming anyone. The City's property file carries each property's census tract, so property records can be lined up with DYCU's tract data exactly.

## 2. Facts this design rests on (verified 2026-10-11)

- **The file.** H28 in the live catalog is the City's Master Property File (MPROP). Its CKAN resource is `0a2c7f31-cd15-4151-8222-09dd57d5f16d`: 159,949 rows, one per property, the file's current assessment (2026 when checked; read from the profile's most common YR_ASSMT). It is already profiled for counting, with `namesPeople: true`.
- **Tracts match DYCU's.**
  - `GEO_TRACT` holds the census tract without leading zeros ("101" = `000101`).
  - Padded to 6 digits and prefixed with `55079`, it is DYCU's `GEOID`.
  - 210 of the 213 distinct values are tracts in DYCU's County 2023 data (2020 Census tracts).
  - The other three hold 14 properties, including `000000` (no tract).
- **Queries work.** The City's datastore SQL accepts `GROUP BY "GEO_TRACT"`, the guarded `CASE WHEN … ~ '^[0-9]+$' THEN …::float END` cast, and `percentile_cont(0.5) WITHIN GROUP (ORDER BY …)`.
- **Class codes** (C_A_CLASS, MPROP documentation fall 2024, Appendix A):

  | Code | Class |
  |---|---|
  | 1 | Residential |
  | 2 | Mercantile |
  | 3 | Manufacturing |
  | 4 | Special Mercantile |
  | 5 | Condominiums |
  | 7 | Mercantile Apartments (4+ units) |
  | 9 | Exempt |

  Rows by class: 1: 125,594 · 5: 11,452 · 9: 7,992 · 2: 6,840 · 7: 5,302 · 4: 1,876 · 3: 499 · null: 394.
- **Owner-occupied.** OWN_OCPD is "O" when the property address matches the owner's mailing address (documentation p.13); otherwise it is empty. 97,471 rows are "O".
- **Year built.** YR_BUILT is "maintained for residential parcels only", and gives the most prominent structure's year. "0" means none.
- **Masked columns.** TAX_DELQ (`99999`), BI_VIOL (`XXXX`) and RAZE_STATUS (`9`) hold one value on every row in the public file.
- **Thin tracts.** Only 5 tracts have fewer than 30 class-1 homes (1, 1, 3, 8, 29); the next smallest has 68.
- **Latent bug.** The live H28 profile's date column is `CONVEY_DATE` (last sale date). With no dates asked, `buildCount` (convex/lib/citySql.ts) counts the last 12 months by that column, so a property count today would count only properties sold in the past year.
- **Street columns.** `STREET` and `SDIR` were profiled as categories; the H28 override drops them.
- **District column.** `GEO_ALDER` (aldermanic district) isn't recognized by the profiler's district pattern, so H28 has no district columns today.

## 3. Words the reader sees

- **Measures**, each with one plain definition, written once:
  - "Typical home value": the median assessed value of homes (houses and condos);
  - "Share of homes assessed over $X" / "under $X";
  - "Owner-occupied share of homes";
  - "Typical year built": the median year built of houses.
- **Range label:** "exact (City records)".
- **Years:** "2026 assessment and 2023 survey".
- **Left out:**
  - "N left out (fewer than 30 homes)";
  - "N left out (outside the City)".
- **Caveats:**
  - "Assessed value is the City's figure for property taxes, not what a home would sell for."
  - "'Owner-occupied' means the owner's mailing address is the property's address; an owner who gets mail elsewhere isn't counted."
  - "Year built is the main building's year."
  - "A pattern across tracts doesn't tell you about any one home or family."
  - "Property figures cover the City of Milwaukee; tracts on the City line count only their City part."
- **Not published:** "The City doesn't publish tax delinquency, code violations or raze orders in this file."
- **One property:** "To look up one property, use the City's Address Search" (link to the City's application).

## 4. What Ask can answer

| Question | Tool | Card |
|---|---|---|
| "How many properties are assessed over $200,000?" | `countRecords` with a new `over`/`under` filter | Count card: plain sentence, the count out of all assessed properties, table by aldermanic district, tract map |
| "Which tracts have the highest home values?" | `rankTracts` with a property measure | Ranking card (no ties or margins on the property side) |
| "Do home values go with broadband access?" | `relateTracts` (relate), property measure × DYCU | Relate card: sentence, scatter, map, EXPAND |
| "Where are homes valuable but food insecurity high?" | `relateTracts` (mismatch) | Mismatch card |
| Change over time on a property measure | `compareYears` refuses | "The public file holds only the current assessment." |

Never shown:
- owner names, mailing addresses, street addresses or parcel numbers;
- a list of properties;
- anything below tract or district level.

## 5. The measures (server code)

- **New file `convex/lib/propertyMeasures.ts`.** It holds the four measures, each with:
  - an id (`median_value`, `share_over`, `share_under`, `owner_share`, `median_year_built`);
  - a plain name and definition;
  - its unit (dollars, percent, year);
  - the SQL that returns one row per `GEO_TRACT`: the measure's value and the number of homes behind it.
- **"Homes":**
  - `C_A_CLASS IN ('1','5')` with a numeric `C_A_TOTAL` above 0;
  - year built uses class 1 only and excludes `YR_BUILT` 0 or below 1800.
- **`share_over` / `share_under`** take a `cutoff` in dollars, an integer from 1,000 to 10,000,000.
- **SQL** is built from the fixed text in that file plus validated numbers only. No column name or value from the model enters it.
- **Tract id:** `55079` + `GEO_TRACT` padded to 6 digits. Rows whose tract is `000000` or isn't 1–6 digits are dropped.
- **Value shape:** each tract becomes a `TractValue` with `lo = hi = value` and a new range kind `exact`.
  - `isUnreliable` is false for exact values, so a zero half-width is never "unreliable".
  - `overlaps` and `mismatch` work unchanged: an exact range is a point.
  - `changeOf` is never reached (compareYears refuses).
- **Too few homes:** a tract with fewer than 30 homes behind its value is left out and counted as "fewer than 30 homes".
- **Cache:** results go in `mapCache` under `property:<measure>:<cutoff>` for 24 hours (the assessment changes yearly). Fetch failures return `unavailable`, as for DYCU.
- **Budget:** fetches spend from the person's `askTracts` budget through the same memoized `spender`, only after the free checks.

## 6. Tract tools accept a property side

- **Parameters.** `rankTracts` and `relateTracts` (both sides) accept `code: "H28"` with `column` set to a measure id, plus `cutoff` for the share measures. The change goes in `lib/ask/tools.ts` (zod, bounded).
- **Wrong measure.** An unknown measure returns `choose-column` with the measure menu: id, plain name, `range: true`.
- **Owner, address and parcel columns** return `choose-column` like any non-measure. There is no path to them.
- **Years.** The property side's year is the file's current assessment (read from the data; "2026 assessment" when checked), whatever `year` was asked. Pairing ignores year matching for that side, and the header names both years.
- **Places.**
  - `place: "City"` pairs with DYCU's City members.
  - `place: "County"` pairs with County members; tracts with no property value are left out as "outside the City".
- **Header.** `confidence: "exact (City records)"`; `kind: "value"` (median value, year) or `"rate"` (shares).
- **Cards.** The plain sentences (ui/lib/tractSummary.ts) gain property wording for the years and the "homes" subject. The footer lists "exact (City records)" with the other side's confidence level, and the property caveats from §3.

## 7. The count: over/under, all records, districts, tract map

- **`countRecords` filters** gain `{ column, over?: number, under?: number }`.
  - The column must be in the dataset's override list of number columns. Every CKAN column is typed text, so this can't be inferred. For H28: `C_A_TOTAL`, `C_A_LAND`, `C_A_IMPRV`, `BLDG_AREA`, `NR_UNITS`, `YR_BUILT`.
  - SQL uses the existing guarded `num()` cast. The filter label reads "assessed over $200,000" for value columns and "over 2,000" otherwise.
- **Current-state datasets.** A profile flag `snapshot: true` marks a dataset whose rows describe things as they are now, not events (H28). For a snapshot:
  - a count with no dates covers every row, and the period reads "the 2026 assessment" (the year is read from the data);
  - asked dates filter the date column and the card says "last sold between …".
- **H28 districts:** `districtColumns: ["GEO_ALDER"]`, labeled "Aldermanic district N".
- **Overrides.** The three H28 settings (snapshot, district column, number columns) are set in one small table in `convex/lib/cityProfile.ts`, keyed by resource id. They are not inferred: the profiler's patterns stay as they are.
- **Count card's tract map.** For H28 counts with a value filter:
  - the server runs the per-tract version of the same count (share of all assessed properties past the cutoff, per tract);
  - tracts where more than half pass are hatched;
  - at most 50 shapes are drawn;
  - the outlines come from the newest DYCU County tract layer of E02, named once in the measures file, because a count has no DYCU dataset of its own to take shapes from;
  - EXPAND works as on the tract cards.

## 8. Privacy (code, not prompt)

- **Single entry point.** The measures file is the only way property values reach a tract tool. `countRecords` only counts and groups by profiled district or category columns, and owner columns are already excluded by `PEOPLE`.
- **Locked out of filters and groups:** TAXKEY, HOUSE_NR_*, STREET, SDIR, STTYPE, and every column `PEOPLE` matches.
- **Test.** Every tool result in the property tests is checked for owner or address field names and for any value from those columns.
- **Prompt rule (lib/ask/prompt.ts):** answer property questions with counts by district or tract and the property measures; never list properties; offer the City's Address Search for one property.

## 9. Testing

- **Unit:**
  - measure SQL text;
  - tract-id padding and drops;
  - the fewer-than-30 rule;
  - exact ranges through `rankValues`, `relationship` and `mismatch` (never unreliable; a mismatch's clearness depends on the DYCU side only);
  - over/under filter SQL and bounds;
  - snapshot counts (no default 12-month window);
  - `GEO_ALDER` grouping label;
  - plain sentences with property wording.
- **Convex (convex-test, recorded City responses):**
  - `choose-column` with the measure menu;
  - owner and address columns refused;
  - cache hit;
  - `unavailable` on a City failure;
  - compact results under 8 KB;
  - the privacy test.
- **E2E (scripted model):**
  - "how many properties over 200000" draws the count card with the district table and tract map;
  - "home values vs broadband" draws the relate card with "exact (City records)".
- **Report card (real AI):**
  - "How many homes in Milwaukee are assessed over $200,000?";
  - "Do neighborhoods with higher home values have more broadband?";
  - "Where are home values high but food insecurity is also high?".

## 10. Rollout and docs

- **No new dependency, no data job.** Property figures are fetched live and cached.
- **No schema change.** `mapCache` is reused; the profile override lives in code.
- **Merging to `main` deploys Convex first** (scripts/vercel-build.sh).
- **Decision 029:**
  - City records joined to DYCU tracts by the City's own tract field;
  - counts and maps, never a list;
  - "exact" ranges;
  - the snapshot fix.
  - The "What actually happened" part is left blank for Tarik.
- **DESIGN.md:** a "Property figures" note under Analysis cards.
- **Ask guide (/ask/guide):** one property example.

## 11. Out of scope

- City point data (crimes, 311) per tract: needs point-in-polygon against tract shapes, a later spec.
- Parcel outlines or any address-level map.
- Previous-year assessment (P_A_*) as change over time.
- Neighborhood (rather than tract) property figures.
- Commercial-property measures.
