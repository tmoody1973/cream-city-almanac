# Cream City Almanac: How Long Things Have Been Open (Project L2) — Design

Tarik approved this design in conversation on 2026-10-14, section by section.

It is **L2**, the second of four parts of Project L, the "how long" measures (decision 044). L1, the Fire Department's dispatch and on-scene times, is live (PR #43).

## 1. Why

"How long do vacant buildings stay vacant?" can't be answered: the City's Vacant Buildings file lists buildings that are vacant now, with the date each was registered, and has no end date. What it can answer is **how long today's vacant buildings have been vacant**.

The same "still open" question fits police and fire complaints with no close date: how long have open complaints been waiting?

## 2. What the exploration found (2026-10-14, live City data)

**Vacant Buildings (`city:vacant-buildings`, 1,751 rows):**
- `DATEOPENED` is set on every row, and Ask's profile already dates the file by it. Splits: AldermanicDistrict, ZipCode, LANDUSE, CensusTract, Neighborhood.
- Registrations by year:

  | Years | Buildings |
  |---|---|
  | 2002–2017 | 13 |
  | 2018–2022 | 361 |
  | 2023–2024 | 508 |
  | 2025–2026 | 868 |
  | 2027 (a data-entry error) | 1 |

- The City updated the file today, so it looks like a daily file.

**Police and fire complaints (`complaint-close` pair):**
- 2,919 rows, of which 105 have no `Date Closed`. Of those, 21 were reported in 2024 and 79 in 2025, so most look like genuinely pending cases.
- The file covers complaints through Q3 2025. The City last updated it on 2026-02-25.

**Not included, with reasons:**
- **311:** even January 2026 requests are 65% "open", so most requests never get a close date, and their age would measure the file's habits, not waiting.
- **Permits:** no open cases.
- **Fire calls:** "open" means a cancelled call, not a waiting one.

## 3. Decisions (Tarik, 2026-10-14)

- **Scope:** vacant buildings and open complaints.
- **Approach:** "age" entries in the existing list of measurable pairs (`convex/lib/spanPairs.ts`), using the same tool and card. Not a separate tool, and not an "open only" switch on every pair.
- **The summary** leads with the median and the longest-waiting tenth.

## 4. The list: a second kind of entry

`SpanPair` becomes a union.

**Existing pairs** gain `kind: "between"`. Nothing else changes.

**Age entries:**

```ts
{ kind: "age"; id; familyKey; file; from: string; openWhen?: string; asOf: "today" | "file";
  name; things; toWhat; unit: "days"; caveat; asOfNote: string }
```

- `openWhen`: the close-date column. When it's set, only rows where that column is empty count.
- `asOf`:
  - `"today"` measures to today (America/Chicago).
  - `"file"` measures to the date in the family's `latestModified`.
- `asOfNote`: the card's as-of sentence, with `{date}` filled in.

**The two entries:**

| id | from | openWhen | asOf | name | things |
|---|---|---|---|---|---|
| `vacant-age` | `DATEOPENED` | none | today | time vacant so far | buildings |
| `complaint-open-age` | `DateReported` | `Date Closed` | file | time open so far | open complaints |

- **`vacant-age` as-of note:** "As of {date}: buildings still on the City's vacant-building list. The date is when the City registered the building as vacant, not when it emptied. Buildings taken off the list aren't counted."
- **`complaint-open-age` as-of note:** "As of {date}, when the City last updated this file. Complaints with no close date then are counted; some may have closed since."

`pairsFor` and Ask's generated tool description cover both kinds. The age entries read "(age {id}: {from} → as of {today|the file's last update})".

## 5. The query (`convex/lib/spanSql.ts`)

`buildSpan` takes an extra `asOf` day (YYYY-MM-DD) when it is handed an age entry.

**Inner query:**
- reads `f` (the start date, read with `readDate`);
- reads `hu` (`present(openWhen)`) when `openWhen` is set, and keeps only rows where it is false;
- adds `g` when grouped.

**Measures:**

| Measure | How |
|---|---|
| `cases` | rows with `f <= asOf` |
| `median`, `p90` | of `asOf − f` in days, over those rows |
| `open` | always 0 |
| `unreadable` | a present start date that can't be read |
| `backwards` | rows with `f > asOf`, labelled "dated after the as-of date" on the card |

**Unchanged:** grouping (column or year), filters, periods (on `f`), the cap on groups, and the 25-second limit.

## 6. The tool (`convex/spans.ts`)

`countContext` also returns `modified` (the family's `latestModified`).

For an age entry:
- `asOf` is `chicagoDay(now)` when the entry says `"today"`, or the Chicago day of `modified` when it says `"file"`;
- `buildSpan` is called with that date.

The ok result gains:
- `asOf: string | null` (`null` for between pairs);
- `pair.kind`;
- `pair.asOfNote` for age entries.

Everything else stays as it is: sign-in, the `askCity` allowance, choose-pair, no-pair and the error handling.

`checkPairs` measures age entries too.

## 7. The card (`ui/lib/spanText.ts`, `SpanCard`)

| Part | Age entries |
|---|---|
| Title | `{file name} · {pair.name}` (+ ` · by {split}`) |
| Summary, no split | "Half of the {things} have been open {median} or more; 1 in 10 for {p90} or more." Vacant buildings say "on the list" instead of "open". The wording comes from `toWhat`. |
| Summary, with a split | "Overall, half … {median} or more. Longest: {label} ({median}); shortest: {label} ({median})." |
| Durations | One year or more: years with one decimal ("2.1 years"). Under a year: today's day format. |
| Table | Group, cases, median, longest 1 in 10. No "still open" column. |
| Notes | The as-of note (dated); "{n} records dated after the as-of date were left out." when `backwards > 0`; unreadable dates; the caveat; the period; filters; "too few to say". |
| Export | The existing span export uses the same title, rows and notes. |

**Never shown:** addresses or single buildings. The file has addresses, but the tool returns counts and medians only, like every City answer.

## 8. Ask

**Prompt line:** "'How long has something been open, vacant or waiting' uses timeSpan with an age entry; 'how long did something take' uses a between pair. On a file with both, pick by the question, or ask."

**Scripted test model:** "vacant buildings been vacant" → searchCatalog "vacant buildings", then timeSpan with `vacant-age`.

**Graded real-AI question:** "How long have Milwaukee's vacant buildings been vacant?" must reach timeSpan with the vacant file and `vacant-age`.

## 9. Testing

**Unit (Vitest):**
- **The list:**
  - two age entries with unique ids;
  - every between pair has `kind: "between"`;
  - `pairsFor(complaints)` lists `complaint-close` and `complaint-open-age`.
- **The age query:**
  - measures `asOf − f` in days;
  - counts future dates as `backwards`;
  - keeps only open rows when `openWhen` is set (the SQL has `NOT` on its presence);
  - groups and periods work as before;
  - between pairs produce the same SQL as before.
- **The wording:**
  - the age title, summary (with and without a split), years formatting and as-of note;
  - "dated after the as-of date";
  - no open column.

**Database (convex-test, the City faked):**
- `vacant-age` returns `asOf` = today;
- `complaint-open-age` returns `asOf` = the family's `latestModified` day;
- choose-pair on the complaints file lists both entries.

**Live check on dev:** `checkPairs` returns both age entries with plausible medians (vacant: about a year or two).

**Browser (Playwright):** the scripted vacant question draws the span card with "time vacant so far" and the as-of note.

**Graded real-AI question:** §8.

## 10. Docs

- **Decision 045:**
  - an age is to an as-of date, never "how long it stayed open";
  - why 311 is excluded;
  - the file-date versus today choice.
  - "What actually happened" is left blank.
- **/how-it-works:** one sentence on "so far" measures.
- **The questions document:** add "How long have vacant buildings been vacant?" and "How long have open complaints been waiting?" as **Now**, and note L2 done under gap 8.

## 11. Going live

Merging deploys the code. There is no data step. Verify with `npx convex run spans:checkPairs --prod` (read-only).

## 12. Out of scope

- how long buildings stayed vacant, which needs an end date the City doesn't publish;
- the age of open 311 requests;
- listing or mapping single vacant buildings;
- fire incidents 2015–2023 (L3);
- employee tenure (L4).
