# Cream City Almanac: How Long City Employees Have Worked There (Project L4) — Design

Tarik approved this design in conversation on 2026-10-14.

It is **L4**, the last of four parts of Project L (decision 044). The earlier parts are live:
- L1: Fire Department times;
- L2: ages of open cases;
- L3: Fire Department history by year.

## 1. Why

"How long have City employees worked here?" and "how long had people worked when they left?" are common reporter questions.

The City publishes an employee pay file (`city:city-employee-salary-data`) with start and termination dates. It names every employee. Ask already reads it for pay (project F), with a rule that hides small groups. The "how long" tool has no such rule on the server.

## 2. What the exploration found (2026-10-14, live City data)

**The file:**
- resource `562e3c33-d7c0-4fa2-b7da-6aa31026ae53`, named "2025";
- 9,057 rows;
- the City last updated it on **2026-03-19** (`resource_show` `last_modified`).

**Columns:**
- `Name`, `Department`, `Job Title`, `Full/Part`;
- `Start Date`, `Termination Date`, `Effective Date`;
- pay columns.

**Dates:**
- All 9,057 start dates are `M/D/YYYY`, which the existing date reader already handles. No termination date is malformed.
- 8,066 rows have no termination date: current employees as of the file.
- 991 have one, mostly 2024–2026 (144 in 2024, 657 in 2025, 139 in 2026), plus 51 from 2018–2023.

**`Effective Date` isn't a file date.** 6,463 rows read 12/21/2025; the rest are scattered back to 2011.

**Small groups exist.** The smallest departments have 1, 2, 3, 3 and 4 employees.

**The privacy gap:**
- The "how long" card writes "too few to say" for a group under 10 (`MIN_CASES`).
- But `shapeSpan` returns each group's raw median and 9-in-10 time.
- So those numbers reach the AI's tool result, the CSV export (`spanExport`) and share links.
- On this file, a one-person group's median is that person's exact tenure.
- The pay measures already hide groups under 5 on the server (`shapeMeasure`, `MIN_GROUP`).

## 3. Decisions (Tarik, 2026-10-14)

- **Scope:** both current employees' tenure so far and departing employees' time worked.
- **Privacy:** for files that name people, the server withholds the median and 9-in-10 time for any group, and for the All row, under **10** cases. Counts still show.
- **Approach:** two entries in the existing "how long" list (no new tool or card), plus the server-side rule.

## 4. The list (`convex/lib/spanPairs.ts`)

```ts
const EMPLOYEES = "city:city-employee-salary-data";
const START = "Start Date is as the City records it; it may be when someone began their current job rather than their first day with the City.";
```

| id | kind | from → to | name | things | toWhat | verb |
|---|---|---|---|---|---|---|
| `tenure-current` | age (`openWhen: "Termination Date"`, `asOf: "file"`) | `Start Date` → the file's update day | time worked so far | current employees | with the City | — |
| `tenure-left` | between | `Start Date` → `Termination Date` | time worked before leaving | employees who left | before leaving | had worked |

- `file`: "City employee pay records".
- `unit`: "days".
- `caveat`: START.
- **`tenure-current` asOfNote:** "As of {date}, when the City last updated this file: employees on its 2025 payroll with no termination date."
- **`tenure-left` missing:** "{n} employees are still with the City and aren't counted here."

**A new optional field, `verb`, on between pairs** (default "took"):
- the summary reads "half of the {things} measured {verb} {median} or less {toWhat}; 9 in 10 {verb} {p90} or less";
- the "too few" sentence reads "how long they {verb} {toWhat}".

Example: "Half of the employees who left measured had worked 3.4 years or less before leaving."

## 5. Years for long times (`ui/lib/spanText.ts`)

`durationText(v, "days")` shows **365 days or more as years**, to one decimal ("8.4 years"). That is the rule `ageText` already uses, so `ageText` becomes `durationText(v, "days")`. It applies to every day-measured card: a 400-day permit time will read "1.1 years".

## 6. The privacy rule (server)

- `shapeSpan(groupRows, allRow, overlap, byYear, namesPeople = false)`: when `namesPeople` is true, any group or All row with `cases < MIN_CASES` (10) gets `median: null` and `p90: null`.
- `MIN_CASES` moves to `convex/lib/spanShape.ts` and `ui/lib/spanText.ts` re-exports it, so one number serves the server and the card.
- `timeSpan` and `checkPairs` pass `data.profile.namesPeople`.
- **Result:** the tool's result, the card, the CSV, the text export and share snapshots all carry `null`, shown as "too few to say". Counts (`cases`, `open`), unreadable and backwards counts are unchanged. Files that don't name people are unchanged.

## 7. Ask

- **Tool description:** the generated pair list gains the two entries. Add one sentence: "On files that name people, groups under 10 show no times; say there are too few to report, never guess."
- **Prompt:** in the existing "how long" line, "how long City employees have worked" goes to `tenure-current`, and "when they left" to `tenure-left`.
- **Scripted test model:** "city employees worked" → searchCatalog "employee salary", then timeSpan `tenure-current` by Department on the found row.
- **Graded real-AI question:** "How long have City of Milwaukee employees worked for the City?" must reach timeSpan with `tenure-current`.

## 8. Testing

**Unit:**
- `shapeSpan` withholds times at 9 cases but not 10, for groups and for All, only when `namesPeople` is true;
- the two entries are valid, and `pairsFor(EMPLOYEES)` lists both;
- `verb` in the summary and the "too few" sentence;
- years at 365+ days.

**Database:** `timeSpan` on a profile with `namesPeople: true` returns `median: null` for a group of 3. A profile without it returns the median.

**Live on dev (with Tarik's OK):**
- `checkPairs` includes both entries with plausible medians;
- one `tenure-current` call filtered to a 1–4-person department returns its count and no times. A by-department card shows only the 24 largest departments; the small ones fold into "all other groups".

**Browser:** the scripted question draws the span card with "time worked so far".

**Graded:** §7, about $0.05.

## 9. Docs

- **Decision 048:**
  - tenure from the pay file;
  - the start-date caveat;
  - the server-side privacy rule for people files and why 10.
  - "What actually happened" is left blank.
- **/how-it-works:** one sentence on tenure and small groups.
- **The questions document:** both questions become **Now**.

## 10. Going live

Merging deploys it. There is no data step. Check with `npx convex run spans:checkPairs --prod` (read-only).

## 11. Out of scope

- tenure for years before this file (earlier pay files);
- counting re-hires;
- tenure by pay or overtime;
- naming or listing employees, ever.
