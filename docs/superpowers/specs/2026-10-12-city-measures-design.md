# Cream City Almanac: Totals, Medians and Averages in City Counts — Design

Approved in conversation 2026-10-12 (Tarik), section by section. This is Project F in the build order Tarik set for making the "Partly / Not yet" questions answerable:

- J: data fixes (spike done; PR #28)
- **F: this spec**
- G: tract questions by City neighborhood
- D: fact sheet
- H: address lookup
- I: boundaries and places
- K: files split by period, including elections
- C2: share link
- L: more "how long" pairs

## 1. Why

Some of the most common accountability questions ask "how much", and today Ask can only count records:
- How much back property tax is owed, and where?
- What do City employees earn, by department?
- What do homes sell for?
- What is the City's taxable property worth, by aldermanic district?

The City publishes all of these as live files. Ask counts their rows but can't add up or take the middle of a money column.

## 2. What the exploration found (2026-10-12, read-only)

- **Money is stored as text, inconsistently:**
  - Delinquent Real Estate Tax "Total Tax Principal" reads `25909.88`.
  - City Employee Salary "Total Gross" reads `128,459.22 ` (comma, trailing space).
  - Property Sales "Sale_price" reads `650000`.

  Ask's existing number reader (`num()` in `citySql.ts`) accepts only plain digits, so it would silently skip every salary.
- **The tax files' "Zip" is the owner's mailing ZIP, not the property's.** It sits beside "Owner's Mailing Address", "City" and "State"; the first sample row is 55318, a Minnesota ZIP. "Ald Dist" is the property's aldermanic district.
- **Some number-like columns must never be summed:** ward turnout percentages, years, ZIP codes, IDs, tax keys.
- **Election files are wide.** One row per ward and one column per candidate, with different columns in every file. Ask refuses them today with `ELECTIONS_NOTE`. That is right for counting, and they move to Project K.
- **Property Sales dates read `10/15/2025`.** The profiler didn't recognize them, so the file has no date column; E's date reader (`readDate` in `spanSql.ts`) handles that format.
- **Files that name people:** both delinquent-tax files (owners) and the salary file (employees). The profiles mark them `namesPeople: true`.

## 3. Decisions (Tarik, 2026-10-12)

- **Money files now; elections in K.** F adds totals, medians and averages of one approved number column, grouped like counts. Candidate-by-candidate ward results belong to K.
- **Measures:** every card shows records, total and median per group. The average is shown only when asked for, beside the median, with a note when the two differ a lot.
- **Privacy:** in files that name people, a group with fewer than 5 records shows "fewer than 5 records" instead of its numbers. It still counts in the All row.
- **Approach A: an approved measures list.** A hand-checked list per file says which column, its unit, the splits that make sense, its caveat, and whether the file names people. It is added as a `measure` option on the existing City count tool.

## 4. The approved measures (`convex/lib/cityMeasures.ts`)

| id | File (family key) | Column | Name | Unit | Splits | Date column | Names people | Skip zeros | Caveat |
|---|---|---|---|---|---|---|---|---|---|
| `tax-owed` | `city:delinquent-real-estate-tax-accounts` | Total Tax Principal | back tax owed | dollars | Ald Dist, Levy Year | none | yes | no | "ZIP in this file is the owner's mailing ZIP, not the property's; aldermanic district is where the property is." |
| `pp-tax-owed` | `city:delinquent-personal-property-tax-accounts` | Total Tax Principal | back personal property tax owed | dollars | Levy Year | none | yes | no | "ZIP in this file is the owner's mailing ZIP, not the property's." |
| `gross-pay` | `city:city-employee-salary-data` | Total Gross | gross pay | dollars | Department, Job Title, Full/Part | none | yes | yes | "Gross pay is what each employee was paid in the file's period; part-time and partial-year employees are included unless filtered out." |
| `hourly-rate` | `city:city-employee-salary-data` | Hourly Rate | hourly pay rate | dollars per hour | Department, Job Title, Full/Part | none | yes | yes | "Hourly rate is each employee's rate of pay, not their total earnings." |
| `sale-price` | `city:property-sales-data` | Sale_price | sale price | dollars | District, PropType, year | Sale_date | no | yes | "Sale prices cover the sales in the City's file; property type and district come from the City's records." |
| `assessed-value` | `city:master-property-file-mprop` | C_A_TOTAL | total assessed value | dollars | GEO_ALDER | none | no (owners are never listed; totals only) | no | "Assessed value is the City's figure for property taxes, not what a property would sell for." |

The list is the single source; Ask's tool description is generated from it. Before any code depends on them, the plan's first step confirms on the City's live data that every split column exists. The live check (section 9) confirms them again.

## 5. Reading money

One SQL expression per measure column. It strips `$`, commas and spaces with `regexp_replace(col, '[$, ]', '', 'g')`, then accepts only text matching `^-?[0-9]+([.][0-9]+)?$`, cast with `::float` inside that CASE guard (the existing rule in `citySql.ts`).

Anything else is **unreadable**: counted and shown, never guessed. For entries with "skip zeros", a value of exactly 0 is left out and counted separately.

The City's firewall refuses some query text (see spec 2026-10-12-time-spans §2.1), so the query keeps the patterns proven there:
- boolean flags, never `= 1` / `= 0`;
- no function result compared to a text literal;
- no `FILTER`, `trim` or `extract`.

## 6. The tool

**One new argument on `countRecords`:** `measure?: { id: string; average?: boolean }`.

- **Without `measure`,** everything is unchanged: counts, maps, neighborhoods, over/under filters and election refusals.
- **With `measure`,** the flow is:
  1. sign-in;
  2. the shared `askCity` allowance;
  3. the file lookup (`countContext`, which already returns `key`);
  4. the election refusal still first;
  5. find the entry by id **and** family key;
  6. `buildMeasure(profile, entry, args, today)`;
  7. the City's server;
  8. shaping;
  9. the result.

**Refusals:**

| Status | When | Offer |
|---|---|---|
| `no-measure` | the file has no approved measure | names the files that do |
| `choose-measure` | an id that isn't this file's | the file's measures as buttons |
| `bad-column` | a split not in the entry's splits | the allowed splits |
| `choose` | an unknown filter value | as for counts |
| `bad-dates` | a bad date range | |
| `outside-coverage` | the period is outside the data | |
| `too-broad` | the City's server timed out; "try a filter" | |
| `unavailable` | any other City error, including a firewall HTML page | |
| `busy` | the allowance is used up | |

`neighborhood` combined with `measure` is refused: none of these files records locations.

**The query (`convex/lib/measureSql.ts`):**
- An inner SELECT reads the value once per row: the cleaned number, an `unreadable` flag, a `zero` flag, and the group value.
- The outer SELECT groups and returns: `n` (records with a usable value), `total` = `SUM`, `median` = `percentile_cont(0.5) WITHIN GROUP (ORDER BY v)`, `average` = `AVG`, `unreadable`, `zeros`.
- An All query returns the same without groups.
- **Group keys:**
  - a split column by its value;
  - `year` by `to_char(<readDate(date column)>, 'YYYY')`, computed in the outer query, newest first.
- The top 24 groups (`MAX_GROUPS`) by records get rows; the rest are one "All other groups" line with records and total (medians can't be combined).
- Value filters reuse `valueFilter`. A period (`from`/`to`) needs the entry's date column and filters on the parsed date. Entries without a date column refuse a period with `bad-dates`, which tells the model there is no date to filter on.

**Shaping (`convex/lib/measureShape.ts`):**
- Numbers are read from the City's text.
- For `namesPeople` entries, groups under 5 records lose total, median and average and are marked `hidden`. **If exactly one group is hidden, the next-smallest visible group is hidden too,** so nobody can subtract the shown groups from the All row.
- **The result:**
  - `measure`: `{ id, name, unit, caveat, column }`;
  - `groupBy`, `period`, `filters`;
  - `groups[]`: `{ label, n, total, median, average?, hidden }`;
  - `other`: `{ n, total } | null`;
  - `all`: `{ n, total, median, average?, unreadable, zeros }`;
  - `averageAsked`, `splits`.

## 7. The card

- **Title:** "{file} · {measure name}{ · by {split}}" plus the CITY tag.
- **Summary sentence** (code-written):
  - "{n} {records word} total {total}; the median is {median}."
  - With a split, it adds: "The largest total is {label} ({total}); the highest median is {label} ({median})." Hidden groups are never named.
- **Table:** {split} · Records · Total · Median, plus Average when asked; then "All other groups"; then All. A hidden group shows "fewer than 5 records" across its number cells.
- **Money formatting:**
  - **In the table:** whole dollars with commas ("$2,412,903") for totals and amounts of $1,000 or more; cents only under $1,000 or for hourly rates ("$41.42 an hour").
  - **In sentences:** totals of $1 million or more read "$2.4 million".
- **Notes:**
  1. the entry's caveat;
  2. unreadable values;
  3. skipped zeros;
  4. "Some groups have fewer than 5 records, so their figures are hidden to protect individuals" (when any group is hidden);
  5. the average note when asked and |average − median| > 25% of the median: "A few large values pull the average away from the typical one; the median is the better guide";
  6. period and filters;
  7. the source.
- **Exports:** `measureExport` through C1's `ExportBar`. The CSV carries unrounded values and the unit in the headings. Hidden groups export as empty cells with the label "fewer than 5 records".
- **Follow-ups:** "By year" (when the entry has a date column), "By {another split}" (up to 2), "Show the average" (when not shown).

## 8. Ask

- **The `countRecords` description** gains a sentence listing the approved measures, generated from `cityMeasures.ts`. **The prompt gains one rule:** "How much", "total", "median", "average", "typical", "pay", "earn", "owed" and "sale price" questions about City files use `countRecords` with `measure`, and the average only when asked for. If `no-measure` comes back, say the file's numbers aren't set up to be totaled.
- **The scripted test model:** "how much back property tax" → `searchCatalog` "delinquent real estate tax", then `countRecords` with `measure: { id: "tax-owed" }` grouped by "Ald Dist".

## 9. Testing

**Unit tests (Vitest)**
- **The list:** well-formed, ids unique, units valid, splits non-empty.
- **`measureSql`:**
  - money cleaning;
  - year groups and periods through `readDate`;
  - allowed splits only;
  - the period refused without a date column;
  - quoting;
  - a ban on `FILTER`, `trim(`, `extract(`, `= 1`, `= 0` and `left(`.
- **`measureShape`:** small-group hiding, including the one-hidden subtraction rule; unreadable and zero counts; the "All other groups" arithmetic.
- **Text:** money formatting, hourly formatting, the summary, the notes, `measureExport`, follow-ups and choices.

**Database tests (convex-test, fake City server)**
- a measure answer end to end;
- `no-measure`, `choose-measure`, `bad-column`;
- neighborhood with measure refused;
- timeout → `too-broad`; a firewall-style 403 → `unavailable`;
- election files still refused;
- counts without `measure` unchanged (the existing count tests stay green).

**Browser test (Playwright, scripted model)**
- "How much back property tax is owed, by aldermanic district?" draws the measure card on phone and desktop, with Records, Total and Median columns, the ZIP caveat, the export line, and no sideways page scroll.

**Live check before the PR:** `internal.city.checkMeasures` runs each entry whole against the City's real data. Record the totals, medians and unreadable counts.

**One graded real-AI question** (`npm run ask:card -- --only=N`): "How much back property tax is owed, by aldermanic district?" must reach `countRecords` with `measure.id = "tax-owed"`.

**Not covered:** the real AI across many phrasings; check a handful on the preview before merge.

## 10. Docs

- **Decision 034:** totals and medians from an approved measures list. It covers why a list rather than any number column, why the median is the default and the average only on request, and why groups under 5 are hidden in files that name people, with the subtraction rule. "What actually happened" is left blank.
- **/how-it-works:** one paragraph on totals and medians, and on why small groups are hidden.
- **DESIGN.md:** "### Totals" under the count card.
- **The Ask guide:** no change unless Tarik picks an example to swap (all roles are full at 4).

## 11. Out of scope

- Election results and turnout (Project K).
- Ratios such as ballots ÷ registered voters.
- Any column not on the list.
- Measures inside a City neighborhood boundary (no locations in these files).
- Wide year-by-year files (assessment summaries, TID value history).
- Listing individual records, names or owners, ever.
