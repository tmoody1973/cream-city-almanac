# How Long Things Take (Time Spans) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new Ask tool, `timeSpan`, measures the time between two dates in seven approved City "from → to" pairs. It works live on the City's server and returns, per group, cases, median, 9-in-10, still open, unreadable and wrong-order counts. A new card shows the result, with exports and follow-ups.

**Architecture:**
- `convex/lib/spanPairs.ts` lists the approved pairs, keyed by stable family key.
- `convex/lib/spanSql.ts` builds the firewall-safe query, reusing `citySql.ts`'s checks.
- `convex/spans.ts` runs it behind the same sign-in and allowance as City counts.
- `lib/ask/*` teaches Ask the tool.
- `ui/lib/spanText.ts` writes the card's words.
- `AskCards.tsx` draws the card, and `cardExport.ts` exports it.

**Tech Stack:** Convex (actions, convex-test), Next.js 16 and React 19, CopilotKit v2 tools, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-12-time-spans-design.md` (read §2.1: what the City's server and firewall allow).

## Global Constraints

- **City SQL never uses** `FILTER`, `trim`, `extract`, a numeric flag compared to 1/0 (`= 1`, `= 0`), or a function result compared to a text literal (`left(x, 4) >= '1900'`). Flags are booleans; the year floor lives in the date pattern.
- **Date patterns, verbatim:**
  - ISO: `^(19|20)[0-9]{2}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])( [0-9]{2}:[0-9]{2}(:[0-9]{2}([.][0-9]+)?)?)?$`
  - Month/day/year: `^(0?[1-9]|1[0-2])/(0?[1-9]|[12][0-9]|3[01])/(19|20)[0-9]{2}$`
- **Pairs are found by family key, never by dataset code.** Codes differ between the development and live databases (complaints is P01 vs P24).
- **Only totals per group leave the City's server.** No row is ever returned or listed.
- **"Too few to say"** applies below 10 measured cases (`MIN_CASES = 10`).
- **Durations:**
  - Minutes: one decimal under 60 ("4.6 minutes"); "{h} h {m} min" from 60.
  - Days: one decimal under 10 ("0.5 days"); whole numbers with commas from 10 ("92 days").
- **Group limit:** `MAX_GROUPS = 24` (from `citySql.ts`). A split by a `;`-separated column overlaps and never gets an "Other" sum.
- **Allowance:** `timeSpan` shares the `askCity` rate limit with `countRecords`.
- **A development Convex push** (`npx convex dev --once`) needs Tarik's explicit OK before it runs (Task 7).
- **Never stage** `.superpowers/` or `clerk-creamcityalmanac.app.zone`.
- **Commit trailer:** `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- **Local browser tests** run against this repo's production build on port 3100, never port 3000 (another project's server runs there):
  1. `npx next build && npx next start -p 3100` in the background;
  2. then `(set -a; . ./.env.local; set +a; BASE_URL=http://localhost:3100 npx playwright test …)`.
- **Under heavy machine load**, run unit suites with `--no-file-parallelism`.

## Review Focus

1. **A split column whose values are blank.** Records with no department still have spans. Their group shows as "(blank)", never dropped. A by-year group with no year (an unreadable "from" date, 0 cases) is dropped. Task 4 pins this with a test.
2. **A period filter on a file whose profile has no date column** (complaints). `from`/`to` still filter on the parsed "from" date, and there is no coverage refusal. Task 3 pins this.
3. **The City's server answering with an HTML page** (the firewall's 403), or timing out. The firewall answer becomes `unavailable`, a timeout becomes `too-broad`; neither crashes. Task 4 pins both.
4. **A median that comes back null** (a group with 0 measured cases), or as a numeric string. It shows as "too few to say", never "NaN days". Tasks 4 and 6 pin this.
5. **Ask asked "how long" about a file with no pair.** `no-pair` reaches the model with words it can relay, and no card pretends to answer. Task 4 and Task 6 (render) pin this.

---

### Task 1: The approved pairs

**Files:**
- Create: `convex/lib/spanPairs.ts`
- Test: `tests/lib/spanPairs.test.ts`

**Interfaces:**
- Produces:
  - `type SpanPair = { id: string; familyKey: string; file: string; from: string; to: string; name: string; things: string; toWhat: string; unit: "days" | "minutes"; missing: string; caveat: string }`
  - `SPAN_PAIRS: SpanPair[]`
  - `pairsFor(familyKey: string): SpanPair[]`

- [ ] **Step 1: Write the failing test.** Create `tests/lib/spanPairs.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { pairsFor, SPAN_PAIRS } from "../../convex/lib/spanPairs";

describe("approved time-span pairs", () => {
  it("are well-formed, with unique ids, a real unit and a {n} in the missing note", () => {
    expect(SPAN_PAIRS).toHaveLength(7);
    expect(new Set(SPAN_PAIRS.map((p) => p.id)).size).toBe(SPAN_PAIRS.length);
    for (const p of SPAN_PAIRS) {
      expect(p.familyKey).toMatch(/^city:[a-z0-9-]+$/);
      expect(["days", "minutes"]).toContain(p.unit);
      expect(p.from).not.toBe(p.to);
      expect(p.missing).toContain("{n}");
      for (const s of [p.file, p.name, p.things, p.toWhat, p.caveat]) expect(s.length).toBeGreaterThan(2);
    }
  });
  it("finds a file's pairs by its family key", () => {
    expect(pairsFor("city:fire-incident-detail").map((p) => p.id)).toEqual(["fire-dispatch", "fire-arrive", "fire-clear"]);
    expect(pairsFor("city:citizen-complaints-against-police-and-fire-departments-the-department-of-emergency-communication").map((p) => p.from)).toEqual(["DateReported"]);
    expect(pairsFor("city:nibrs-crime-data")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it.** `npx vitest run tests/lib/spanPairs.test.ts`. Expected: FAIL, cannot resolve `../../convex/lib/spanPairs`.

- [ ] **Step 3: Implement.** Create `convex/lib/spanPairs.ts`:

```ts
// The City files whose "from → to" dates Ask may measure (spec 2026-10-12-time-spans-design.md §4). Checked by hand:
// each pair's dates, unit and caveat. Found by family key, never by dataset code (codes differ between databases).
export type SpanPair = {
  id: string; familyKey: string; file: string; from: string; to: string;
  name: string; things: string; toWhat: string; unit: "days" | "minutes"; missing: string; caveat: string;
};

const COMPLAINTS = "city:citizen-complaints-against-police-and-fire-departments-the-department-of-emergency-communication";
const FIRE = "city:fire-incident-detail";
const FIRE_2021 = "This file covers 2021 only.";

export const SPAN_PAIRS: SpanPair[] = [
  { id: "complaint-close", familyKey: COMPLAINTS, file: "citizen complaints against the Police and Fire Departments", from: "DateReported", to: "Date Closed", name: "time to close", things: "complaints", toWhat: "to close", unit: "days", missing: "{n} complaints aren't closed yet and aren't counted, so slow cases are under-counted.", caveat: "Dates are typed by hand in more than one format; a few can't be read." },
  { id: "311-close", familyKey: "city:call-center-data", file: "311 call center requests", from: "CREATIONDATE", to: "CLOSEDDATETIME", name: "time to close", things: "requests", toWhat: "to close", unit: "days", missing: "{n} requests aren't closed yet and aren't counted, so slow cases are under-counted.", caveat: "311 dates have no time of day, so a request closed the same day counts as 0 days." },
  { id: "permit-issue", familyKey: "city:residential-and-commercial-permit-work-data", file: "residential and commercial permits", from: "Date Opened", to: "Date Issued", name: "time to issue", things: "permits", toWhat: "to be issued", unit: "days", missing: "{n} permits aren't issued yet and aren't counted, so slow cases are under-counted.", caveat: "A permit can wait on the applicant as well as the City." },
  { id: "fire-dispatch", familyKey: FIRE, file: "fire incidents", from: "Date_Received", to: "Date_Dispatched", name: "time to dispatch", things: "calls", toWhat: "to be dispatched", unit: "minutes", missing: "{n} calls have no dispatch time and aren't counted.", caveat: FIRE_2021 },
  { id: "fire-arrive", familyKey: FIRE, file: "fire incidents", from: "Date_Received", to: "Date_Arrived", name: "time to arrive", things: "calls", toWhat: "for a unit to arrive", unit: "minutes", missing: "{n} calls have no arrival time (often cancelled calls) and aren't counted.", caveat: FIRE_2021 },
  { id: "fire-clear", familyKey: FIRE, file: "fire incidents", from: "Date_Arrived", to: "Date_Cleared", name: "time on scene", things: "calls", toWhat: "to clear after a unit arrived", unit: "minutes", missing: "{n} calls have no clear time and aren't counted.", caveat: FIRE_2021 },
  { id: "mfd-arrive", familyKey: "city:mfd-calls-for-service-detail", file: "Fire Department calls for service", from: "IncidentStarted", to: "FirstUnitArrived", name: "time to arrive", things: "calls", toWhat: "for a unit to arrive", unit: "minutes", missing: "{n} calls have no arrival time (often cancelled calls) and aren't counted.", caveat: "Times come from the Fire Department's dispatch records." },
];

export const pairsFor = (familyKey: string) => SPAN_PAIRS.filter((p) => p.familyKey === familyKey);
```

- [ ] **Step 4: Run it.** `npx vitest run tests/lib/spanPairs.test.ts`. Expected: PASS, 2 tests.

- [ ] **Step 5: Commit.**

```bash
git add convex/lib/spanPairs.ts tests/lib/spanPairs.test.ts
git commit -m "feat: the approved City date pairs Ask may measure

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 2: Share the count builder's checks

**Files:**
- Modify: `convex/lib/citySql.ts`. Export `RID`, `lit`, `isDay`, `addDays`, `human` and `dataSpan`, and extract the value-filter check into an exported `valueFilter`.
- Test: `tests/lib/citySql.test.ts` (append)

**Interfaces:**
- Produces:
  - `RID: RegExp`
  - `lit(s: string): string`
  - `isDay(s: string): boolean`
  - `addDays(day: string, n: number): string`
  - `human(day: string): string`
  - `dataSpan(p: CityProfile, today: string): { min: string; max: string } | null`
  - `valueFilter(p: CityProfile, f: { column: string; values?: string[] }): { ok: true; where: string; labels: string[] } | { ok: false; status: "bad-column"; column: string; columns: string[] } | { ok: false; status: "choose"; column: string; asked: string; choices: string[] }`

- [ ] **Step 1: Write the failing test.** Append to `tests/lib/citySql.test.ts`, and add `valueFilter` to its import from `../../convex/lib/citySql`:

```ts
describe("valueFilter", () => {
  it("lets in only profiled values, quoted, and names them in words", () => {
    expect(valueFilter(P, { column: "police_district", values: ["6"] })).toEqual({ ok: true, where: `"Police_District" IN ('6')`, labels: ["Police district 6"] });
    expect(valueFilter(P, { column: "TITLE", values: ["children's services"] })).toEqual({ ok: true, where: `"TITLE" IN ('Children''s Services')`, labels: ["Children's Services"] });
  });
  it("refuses an unknown column and asks to choose when a value isn't known", () => {
    expect(valueFilter(P, { column: "Nope", values: ["x"] })).toMatchObject({ ok: false, status: "bad-column", column: "Nope" });
    expect(valueFilter(P, { column: "Police_District", values: ["99"] })).toMatchObject({ ok: false, status: "choose", column: "Police_District", asked: "99" });
    expect(valueFilter(P, { column: "Police_District" })).toMatchObject({ ok: false, status: "choose", asked: "" });
  });
});
```

- [ ] **Step 2: Run it.** `npx vitest run tests/lib/citySql.test.ts`. Expected: FAIL, `valueFilter is not a function`.

- [ ] **Step 3: Implement.** In `convex/lib/citySql.ts`:
  - Add `export` to `RID`, `lit`, `addDays`, `human`, `isDay` and `dataSpan`. They are already defined; only the keyword changes.
  - Move the value-filter part of `buildCount`'s loop into this function, placed above `buildCount`:

```ts
// One value filter, checked against the profile: only profiled values get in, quoted; an unknown value asks to choose.
export function valueFilter(p: CityProfile, f: { column: string; values?: string[] }):
  | { ok: true; where: string; labels: string[] }
  | { ok: false; status: "bad-column"; column: string; columns: string[] }
  | { ok: false; status: "choose"; column: string; asked: string; choices: string[] } {
  const values = f.values ?? [];
  const cat = p.categories.find((c) => c.column.toLowerCase() === f.column.toLowerCase());
  if (!cat) return { ok: false, status: "bad-column", column: f.column, columns: p.categories.map((c) => c.column) };
  const top = () => cat.values.slice(0, 8).map((v) => groupLabelFor(cat.column, v.value));
  // Never silently widen: a filter with nothing to filter on asks the user to choose.
  if (values.length === 0) return { ok: false, status: "choose", column: cat.column, asked: "", choices: top() };
  const known = new Map(cat.values.map((v) => [v.value.toLowerCase(), v.value]));
  const picked: string[] = [];
  for (const asked of values) {
    const exact = known.get(asked.trim().toLowerCase());
    const viaOffense = isOffenseColumn(cat.column) ? offenseCodes(asked).filter((c) => known.has(c.toLowerCase())) : [];
    if (!exact && viaOffense.length > MAX_OFFENSE_CODES) {
      return { ok: false, status: "choose", column: cat.column, asked, choices: viaOffense.slice(0, 8).map((c) => groupLabelFor(cat.column, c)) };
    }
    const hits = exact ? [exact] : viaOffense;
    if (cat.multi && hits.some((h) => !LIKE_SAFE.test(h))) {
      return { ok: false, status: "choose", column: cat.column, asked, choices: cat.values.filter((v) => LIKE_SAFE.test(v.value)).slice(0, 8).map((v) => groupLabelFor(cat.column, v.value)) };
    }
    if (hits.length === 0) {
      const word = asked.trim().toLowerCase();
      const near = word ? cat.values.filter((v) => groupLabelFor(cat.column, v.value).toLowerCase().includes(word)).map((v) => groupLabelFor(cat.column, v.value)) : [];
      return { ok: false, status: "choose", column: cat.column, asked, choices: near.length ? near.slice(0, 8) : top() };
    }
    picked.push(...hits);
  }
  const uniq = [...new Set(picked)];
  // A ';'-separated column ("13A;120") matches a record holding the code anywhere in its list.
  const where = cat.multi
    ? `(${uniq.map((v) => `';' || ${quoteId(cat.column)} || ';' LIKE ${lit(`%;${v};%`)}`).join(" OR ")})`
    : `${quoteId(cat.column)} IN (${uniq.map(lit).join(", ")})`;
  return { ok: true, where, labels: uniq.map((v) => filterLabel(cat.column, v, p.districtColumns)) };
}
```

  - In `buildCount`, replace the value-filter block (from `const values = f.values ?? [];` through `filterLabels.push(...uniq.map(...));`) with:

```ts
    const r = valueFilter(p, f);
    if (!r.ok) return r;
    where.push(r.where);
    filterLabels.push(...r.labels);
```

  - Delete the now-unused `menu` lookups inside that loop only. `menu` is still used by `groupBy`, so keep its declaration.

- [ ] **Step 4: Run it.** `npx vitest run tests/lib/citySql.test.ts tests/lib/citySqlProperty.test.ts convex/city.test.ts && npx tsc --noEmit`. Expected: all PASS (the old count tests prove `buildCount` is unchanged), no type errors.

- [ ] **Step 5: Commit.**

```bash
git add convex/lib/citySql.ts tests/lib/citySql.test.ts
git commit -m "refactor: the count builder's value-filter check is shared

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 3: The time-span query

**Files:**
- Create: `convex/lib/spanSql.ts`
- Test: `tests/lib/spanSql.test.ts`

**Interfaces:**
- Consumes: from Task 1, `SpanPair`. From Task 2, `RID`, `lit`, `isDay`, `addDays`, `human`, `dataSpan`, `valueFilter`, and `MAX_GROUPS`. Also `quoteId` and `CityProfile` from `./cityProfile`.
- Produces:
  - `type SpanArgs = { from?: string; to?: string; filters?: { column: string; values?: string[] }[]; groupBy?: string }`
  - `type SpanBuilt = { ok: true; groupSql: string | null; allSql: string; period: string; filterLabels: string[]; groupLabel: string | null; overlap: boolean; coverage: string | null; columns: string[] } | { ok: false; status: "bad-dates"; from: string; to: string } | { ok: false; status: "outside-coverage"; coverage: string } | { ok: false; status: "bad-column"; column: string; columns: string[] } | { ok: false; status: "choose"; column: string; asked: string; choices: string[] }`
  - `readDate(column: string): string`
  - `buildSpan(p: CityProfile, pair: SpanPair, a: SpanArgs, today: string): SpanBuilt`

- [ ] **Step 1: Write the failing test.** Create `tests/lib/spanSql.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { CityProfile } from "../../convex/lib/cityProfile";
import { SPAN_PAIRS } from "../../convex/lib/spanPairs";
import { buildSpan, readDate } from "../../convex/lib/spanSql";

const RID = "5cb9ea51-c23f-4171-ad2d-9e9b1bfde280";
const complaints = SPAN_PAIRS.find((p) => p.id === "complaint-close")!;
const arrive = SPAN_PAIRS.find((p) => p.id === "fire-arrive")!;
const P: CityProfile = {
  familyKey: complaints.familyKey, resourceId: RID, columns: [], dateColumn: null, districtColumns: [],
  categories: [
    { column: "Department", values: [{ value: "Milwaukee Police Department", count: 2569 }, { value: "Milwaukee Fire Department", count: 64 }] },
    { column: "Category1", values: [{ value: "Department Services", count: 369 }], multi: true },
  ],
  rowCount: 2919, minDate: null, maxDate: null, namesPeople: false, signature: "", updatedAt: 0,
};
const FIRE: CityProfile = { ...P, familyKey: arrive.familyKey, dateColumn: "Date_Received", minDate: "2021-01-01", maxDate: "2021-12-31", updatedAt: Date.parse("2026-10-01"), categories: [{ column: "ZIP_Code", values: [{ value: "53206", count: 900 }] }] };
const TODAY = "2026-10-12";
const ok = (b: ReturnType<typeof buildSpan>) => { if (!b.ok) throw new Error(`refused: ${b.status}`); return b; };

describe("reading dates", () => {
  it("reads ISO and month/day/year text, with the year floor inside the pattern", () => {
    const d = readDate("DateReported");
    expect(d).toContain(`"DateReported" ~ '^(19|20)[0-9]{2}-`);
    expect(d).toContain(`"DateReported"::timestamp`);
    expect(d).toContain(`to_timestamp("DateReported", 'MM/DD/YYYY')::timestamp`);
  });
});

describe("the span query", () => {
  it("measures every record when nothing is asked: cases, median, 9-in-10, open, unreadable, wrong order", () => {
    const b = ok(buildSpan(P, complaints, {}, TODAY));
    expect(b.groupSql).toBeNull();
    expect(b.allSql).toContain("percentile_cont(0.5) WITHIN GROUP (ORDER BY CASE WHEN t >= f THEN date_part('epoch', t - f) / 86400 END) AS median");
    expect(b.allSql).toContain("percentile_cont(0.9)");
    expect(b.allSql).toContain("SUM(CASE WHEN hf AND NOT ht THEN 1 ELSE 0 END) AS open");
    expect(b.allSql).toContain("SUM(CASE WHEN (hf AND f IS NULL) OR (ht AND t IS NULL) THEN 1 ELSE 0 END) AS unreadable");
    expect(b.allSql).toContain("SUM(CASE WHEN t < f THEN 1 ELSE 0 END) AS backwards");
    expect(b.allSql).toContain(`FROM "${RID}"`);
    expect(b.period).toBe("all records");
    expect(b.coverage).toBeNull();
  });
  it("measures minutes for a minutes pair", () => {
    expect(ok(buildSpan(FIRE, arrive, {}, TODAY)).allSql).toContain("/ 60 END");
  });
  it("groups by a column, merging labels that differ only in capitals and punctuation", () => {
    const b = ok(buildSpan(P, complaints, { groupBy: "department" }, TODAY));
    expect(b.groupSql).toContain(`"Department" AS g`);
    expect(b.groupSql).toContain("upper(regexp_replace(g, '[^A-Za-z0-9]+', '', 'g')) AS k, min(g) AS label");
    expect(b.groupSql).toContain("GROUP BY k ORDER BY cases DESC LIMIT 24");
    expect(b.groupLabel).toBe("Department");
    expect(b.overlap).toBe(false);
    expect(b.allSql).not.toContain(" AS g");
  });
  it("splits a ;-separated column into overlapping groups, but never in the All row", () => {
    const b = ok(buildSpan(P, complaints, { groupBy: "Category1" }, TODAY));
    expect(b.groupSql).toContain(`unnest(string_to_array("Category1", ';')) AS g`);
    expect(b.overlap).toBe(true);
    expect(b.allSql).not.toContain("unnest");
  });
  it("groups by the year of the parsed 'from' date, newest first", () => {
    const b = ok(buildSpan(P, complaints, { groupBy: "year" }, TODAY));
    expect(b.groupSql).toContain("to_char(f, 'YYYY') AS k, min(to_char(f, 'YYYY')) AS label");
    expect(b.groupSql).toContain("ORDER BY k DESC");
    expect(b.groupLabel).toBe("year");
  });
  it("filters a period on the parsed 'from' date, even when the profile has no date column", () => {
    const b = ok(buildSpan(P, complaints, { from: "2023-01-01", to: "2024-12-31" }, TODAY));
    expect(b.allSql).toContain(") s WHERE f >= '2023-01-01' AND f < '2025-01-01'");
    expect(b.period).toBe("Jan 1, 2023 – Dec 31, 2024");
    expect(ok(buildSpan(P, complaints, { from: "2023-01-01" }, TODAY)).period).toBe("since Jan 1, 2023");
  });
  it("filters by profiled values inside the inner query", () => {
    const b = ok(buildSpan(P, complaints, { filters: [{ column: "Department", values: ["milwaukee fire department"] }] }, TODAY));
    expect(b.allSql).toContain(`FROM "${RID}" WHERE "Department" IN ('Milwaukee Fire Department')) s`);
    expect(b.filterLabels).toEqual(["Milwaukee Fire Department"]);
  });
  it("offers the file's columns for a split, and refuses bad ones", () => {
    expect(ok(buildSpan(P, complaints, {}, TODAY)).columns).toEqual(["Department"]);
    expect(buildSpan(P, complaints, { groupBy: "Nope" }, TODAY)).toMatchObject({ ok: false, status: "bad-column", columns: ["year", "Department", "Category1"] });
    expect(buildSpan(P, complaints, { from: "2025-02-30" }, TODAY)).toMatchObject({ ok: false, status: "bad-dates" });
    expect(buildSpan(P, complaints, { from: "2025-05-01", to: "2025-01-01" }, TODAY)).toMatchObject({ ok: false, status: "bad-dates" });
  });
  it("refuses a period outside the file's data when the profile's date column is the 'from' date", () => {
    expect(buildSpan(FIRE, arrive, { from: "2024-01-01" }, TODAY)).toMatchObject({ ok: false, status: "outside-coverage", coverage: "Jan 1, 2021 – Dec 31, 2021" });
    expect(ok(buildSpan(FIRE, arrive, {}, TODAY)).coverage).toBe("Jan 1, 2021 – Dec 31, 2021");
  });
  it("never writes what the City's server or its firewall refuses", () => {
    const all = [buildSpan(P, complaints, { groupBy: "year", from: "2023-01-01" }, TODAY), buildSpan(P, complaints, { groupBy: "Category1" }, TODAY), buildSpan(FIRE, arrive, { groupBy: "ZIP_Code" }, TODAY)]
      .map((b) => { const x = ok(b); return `${x.groupSql} ${x.allSql}`; }).join(" ");
    for (const banned of ["FILTER", "trim(", "extract(", "= 1", "= 0", ">= '19", "left("]) expect(all).not.toContain(banned);
  });
});
```

- [ ] **Step 2: Run it.** `npx vitest run tests/lib/spanSql.test.ts`. Expected: FAIL, cannot resolve `../../convex/lib/spanSql`.

- [ ] **Step 3: Implement.** Create `convex/lib/spanSql.ts`:

```ts
import type { CityProfile } from "./cityProfile";
import { quoteId } from "./cityProfile";
import { addDays, dataSpan, human, isDay, lit, MAX_GROUPS, RID, valueFilter } from "./citySql";
import type { SpanPair } from "./spanPairs";

// The time between a pair's two dates, measured on the City's server (spec §2.1, §5, §6). Shape proven live
// 2026-10-12: an inner SELECT reads both dates once per row; the outer one groups and measures. The City refuses
// FILTER, trim and extract, and its firewall refuses "= 1"-style flags and `left(x, 4) >= '1900'`, so flags are
// booleans and the year floor (19xx or 20xx) sits inside the date patterns.
export type SpanArgs = { from?: string; to?: string; filters?: { column: string; values?: string[] }[]; groupBy?: string };
export type SpanBuilt =
  | { ok: true; groupSql: string | null; allSql: string; period: string; filterLabels: string[]; groupLabel: string | null; overlap: boolean; coverage: string | null; columns: string[] }
  | { ok: false; status: "bad-dates"; from: string; to: string }
  | { ok: false; status: "outside-coverage"; coverage: string }
  | { ok: false; status: "bad-column"; column: string; columns: string[] }
  | { ok: false; status: "choose"; column: string; asked: string; choices: string[] };

const ISO = "^(19|20)[0-9]{2}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])( [0-9]{2}:[0-9]{2}(:[0-9]{2}([.][0-9]+)?)?)?$";
const MDY = "^(0?[1-9]|1[0-2])/(0?[1-9]|[12][0-9]|3[01])/(19|20)[0-9]{2}$";
const PER = { days: 86400, minutes: 60 } as const;
const absent = (s: string | undefined) => !s || !s.trim();

// One date column, read by its shape; anything else (blank, the text NULL, a year before 1900, another shape) is NULL.
// ponytail: a matched but impossible date (Feb 30) would fail the whole query; none seen in the seven files.
export const readDate = (c: string) => {
  const q = quoteId(c);
  return `CASE WHEN ${q} ~ ${lit(ISO)} THEN ${q}::timestamp WHEN ${q} ~ ${lit(MDY)} THEN to_timestamp(${q}, 'MM/DD/YYYY')::timestamp END`;
};
const present = (c: string) => { const q = quoteId(c); return `(${q} IS NOT NULL AND ${q} <> '' AND upper(${q}) <> 'NULL')`; };

export function buildSpan(p: CityProfile, pair: SpanPair, a: SpanArgs, today: string): SpanBuilt {
  if (!RID.test(p.resourceId)) throw new Error("Not a CKAN resource id");
  const table = quoteId(p.resourceId);
  const askedFrom = absent(a.from) ? undefined : a.from!;
  const askedTo = absent(a.to) ? undefined : a.to!;
  if ((askedFrom && !isDay(askedFrom)) || (askedTo && !isDay(askedTo))) return { ok: false, status: "bad-dates", from: a.from ?? "", to: a.to ?? "" };
  if (askedFrom && askedTo && askedFrom > askedTo) return { ok: false, status: "bad-dates", from: askedFrom, to: askedTo };

  const inner: string[] = [];
  const filterLabels: string[] = [];
  for (const f of a.filters ?? []) {
    const r = valueFilter(p, f);
    if (!r.ok) return r;
    inner.push(r.where);
    filterLabels.push(...r.labels);
  }

  let g: string | null = null;
  let key: string | null = null;
  let label: string | null = null;
  let groupLabel: string | null = null;
  let overlap = false;
  if (a.groupBy?.trim().toLowerCase() === "year") {
    key = "to_char(f, 'YYYY')";
    label = "min(to_char(f, 'YYYY'))";
    groupLabel = "year";
  } else if (a.groupBy?.trim()) {
    const cat = p.categories.find((c) => c.column.toLowerCase() === a.groupBy!.trim().toLowerCase());
    if (!cat) return { ok: false, status: "bad-column", column: a.groupBy, columns: ["year", ...p.categories.map((c) => c.column)] };
    // A ';'-separated column counts a record once in each of its groups, so the groups overlap.
    g = cat.multi ? `unnest(string_to_array(${quoteId(cat.column)}, ';'))` : quoteId(cat.column);
    key = "upper(regexp_replace(g, '[^A-Za-z0-9]+', '', 'g'))"; // "NON-EMPLOYEE" and "Non Employee" are one group
    label = "min(g)";
    groupLabel = cat.column;
    overlap = Boolean(cat.multi);
  }

  // The period is on the parsed "from" date. Only a profile dated by that same column knows the data's range.
  const span = p.dateColumn === pair.from ? dataSpan(p, today) : null;
  const coverage = span ? `${human(span.min)} – ${human(span.max)}` : null;
  if (span && ((askedTo && askedTo < span.min) || (askedFrom && askedFrom > span.max))) return { ok: false, status: "outside-coverage", coverage: coverage! };
  const outer: string[] = [];
  if (askedFrom) outer.push(`f >= ${lit(askedFrom)}`);
  if (askedTo) outer.push(`f < ${lit(addDays(askedTo, 1))}`);
  const period = askedFrom && askedTo ? `${human(askedFrom)} – ${human(askedTo)}` : askedFrom ? `since ${human(askedFrom)}` : askedTo ? `through ${human(askedTo)}` : "all records";

  const innerSql = (grouped: boolean) =>
    `SELECT ${readDate(pair.from)} AS f, ${readDate(pair.to)} AS t, ${present(pair.from)} AS hf, ${present(pair.to)} AS ht${grouped && g ? `, ${g} AS g` : ""} FROM ${table}${inner.length ? ` WHERE ${inner.join(" AND ")}` : ""}`;
  const d = `CASE WHEN t >= f THEN date_part('epoch', t - f) / ${PER[pair.unit]} END`;
  const measures = [
    "SUM(CASE WHEN t >= f THEN 1 ELSE 0 END) AS cases",
    `percentile_cont(0.5) WITHIN GROUP (ORDER BY ${d}) AS median`,
    `percentile_cont(0.9) WITHIN GROUP (ORDER BY ${d}) AS p90`,
    "SUM(CASE WHEN hf AND NOT ht THEN 1 ELSE 0 END) AS open",
    "SUM(CASE WHEN (hf AND f IS NULL) OR (ht AND t IS NULL) THEN 1 ELSE 0 END) AS unreadable",
    "SUM(CASE WHEN t < f THEN 1 ELSE 0 END) AS backwards",
  ].join(", ");
  const where = outer.length ? ` WHERE ${outer.join(" AND ")}` : "";
  const allSql = `SELECT ${measures} FROM (${innerSql(false)}) s${where}`;
  const groupSql = key
    ? `SELECT ${key} AS k, ${label} AS label, ${measures} FROM (${innerSql(true)}) s${where} GROUP BY k ORDER BY ${groupLabel === "year" ? "k DESC" : "cases DESC"} LIMIT ${MAX_GROUPS}`
    : null;
  // The follow-up buttons offer these splits; a ;-separated column would overlap, so it isn't offered there.
  const columns = p.categories.filter((c) => !c.multi).map((c) => c.column);
  return { ok: true, groupSql, allSql, period, filterLabels, groupLabel, overlap, coverage, columns };
}
```

- [ ] **Step 4: Run it.** `npx vitest run tests/lib/spanSql.test.ts && npx tsc --noEmit`. Expected: PASS, 11 tests, and no type errors.

- [ ] **Step 5: Commit.**

```bash
git add convex/lib/spanSql.ts tests/lib/spanSql.test.ts
git commit -m "feat: build the firewall-safe time-span query for an approved pair

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 4: The `timeSpan` action

**Files:**
- Create: `convex/lib/spanShape.ts`
- Create: `convex/spans.ts`
- Modify: `convex/city.ts` (`countContext` also returns the family `key`)
- Test: `tests/lib/spanShape.test.ts`, `convex/spans.test.ts`

**Interfaces:**
- Consumes: from Task 1, `pairsFor` and `SpanPair`. From Task 3, `buildSpan`. Also `datastoreSql` (`./lib/ckan`), `rateLimiter` (`./limits`), `chicagoDay` (`./lib/ask`), `internal.city.countContext`, and `MAX_GROUPS`.
- Produces:
  - `type SpanGroup = { label: string; cases: number; median: number | null; p90: number | null; open: number }`
  - `type SpanAll = SpanGroup & { unreadable: number; backwards: number }`
  - `shapeSpan(groupRows: Record<string, unknown>[] | null, allRow: Record<string, unknown> | undefined, overlap: boolean, byYear: boolean): { groups: SpanGroup[]; other: number; all: SpanAll }`
  - `api.spans.timeSpan(args: { code: string; pair?: string; groupBy?: string; from?: string; to?: string; filters?: { column: string; values?: string[] }[] }): Promise<SpanResult>`
  - `SpanResult`, in which the ok case is:
    `{ status: "ok"; code; name; pair: { id; name; things; toWhat; unit; missing; caveat; from; to }; groupBy: string | null; overlap: boolean; period: string; filters: string[]; coverage: string | null; columns: string[]; groups: SpanGroup[]; other: number; all: SpanAll }`
  - The refusals:

    | Status | Fields |
    |---|---|
    | `not-found` | `code` |
    | `not-city`, `not-live` | `code`, `name` |
    | `no-pair` | `code`, `name`, `files: string[]` |
    | `choose-pair` | `code`, `name`, `pairs: { id; name; from; to }[]` |
    | `bad-column` | `column`, `columns` |
    | `choose` | `column`, `asked`, `choices` |
    | `bad-dates` | `from`, `to` |
    | `outside-coverage` | `coverage` |
    | `too-broad` | `code`, `name` |
    | `unavailable` | `code`, `name` |
    | `busy` | (none) |

- [ ] **Step 1: Write the failing tests.** Create `tests/lib/spanShape.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { shapeSpan } from "../../convex/lib/spanShape";

const row = (label: string | null, cases: number | string, median: unknown, extra: Record<string, unknown> = {}) => ({ k: label?.toUpperCase() ?? null, label, cases, median, p90: median, open: "0", unreadable: "0", backwards: "0", ...extra });

describe("shaping a span answer", () => {
  it("reads numbers from the City's text and keeps a missing median as null", () => {
    const s = shapeSpan([row("Milwaukee Police Department", "2437", "92.0", { open: "105" }), row("Empty", 0, null)], row(null, "2731", "64.0", { open: "105", unreadable: "12", backwards: "17" }), false, false);
    expect(s.groups[0]).toEqual({ label: "Milwaukee Police Department", cases: 2437, median: 92, p90: 92, open: 105 });
    expect(s.groups[1].median).toBeNull();
    expect(s.all).toEqual({ label: "All", cases: 2731, median: 64, p90: 64, open: 105, unreadable: 12, backwards: 17 });
  });
  it("shows records with no value as '(blank)', but drops a by-year group with no year and no cases", () => {
    expect(shapeSpan([row(null, "5", "3")], row(null, "5", "3"), false, false).groups.map((g) => g.label)).toEqual(["(blank)"]);
    expect(shapeSpan([row(null, "0", null), row("2025", "311", "52")], row(null, "311", "52"), false, true).groups.map((g) => g.label)).toEqual(["2025"]);
  });
  it("sums the rest as Other only when the list was cut off and groups don't overlap", () => {
    const full = Array.from({ length: 24 }, (_, i) => row(`G${i}`, "10", "1"));
    expect(shapeSpan(full, row(null, "300", "1"), false, false).other).toBe(60);
    expect(shapeSpan(full, row(null, "300", "1"), true, false).other).toBe(0);
    expect(shapeSpan(full.slice(0, 3), row(null, "300", "1"), false, false).other).toBe(0);
  });
});
```

Create `convex/spans.test.ts`:

```ts
/// <reference types="vite/client" />
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { installFakeFetch } from "../tests/helpers/fakeFetch";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");
const RID = "5cb9ea51-c23f-4171-ad2d-9e9b1bfde280";
const KEY = "city:citizen-complaints-against-police-and-fire-departments-the-department-of-emergency-communication";
const reader = { subject: "u1", issuer: "test", tokenIdentifier: "test|u1" };
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

async function seed() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  await t.run(async (ctx) => {
    await ctx.db.insert("families", { key: KEY, code: "P24", name: "Citizen Complaints", kind: "dataset", topic: "Public Safety", keywords: [], places: ["City"], years: [], latestModified: "2025-10-01", baseSearchText: "", searchText: "", dictionaryTab: null, source: "city", live: true });
    await ctx.db.insert("families", { key: "city:nibrs-crime-data", code: "P01", name: "NIBRS Crime Data", kind: "dataset", topic: "Public Safety", keywords: [], places: ["City"], years: [], latestModified: "2025-10-01", baseSearchText: "", searchText: "", dictionaryTab: null, source: "city", live: true });
    await ctx.db.insert("cityProfiles", { familyKey: KEY, resourceId: RID, columns: [], dateColumn: null, districtColumns: [], categories: [{ column: "Department", values: [{ value: "Milwaukee Police Department", count: 2569 }] }], rowCount: 2919, minDate: null, maxDate: null, namesPeople: false, signature: "s", updatedAt: 0 });
    await ctx.db.insert("cityProfiles", { familyKey: "city:nibrs-crime-data", resourceId: "87843297-a6fa-46d4-ba5d-cb342fb2d3bb", columns: [], dateColumn: "Incident_Date", districtColumns: [], categories: [], rowCount: 10, minDate: "2024-01-01", maxDate: "2026-10-08", namesPeople: false, signature: "s", updatedAt: 0 });
  });
  return t;
}
const all = [{ cases: "2731", median: "64", p90: "400", open: "105", unreadable: "12", backwards: "17" }];

describe("timeSpan", () => {
  it("needs sign-in", async () => {
    const t = await seed();
    await expect(t.action(api.spans.timeSpan, { code: "P24" })).rejects.toThrow(/Sign in/);
  });
  it("measures a pair by department, with the pair's words and the All row", async () => {
    const t = await seed();
    installFakeFetch({ citySql: (sql) => sql.includes("GROUP BY k") ? [{ k: "MILWAUKEEPOLICEDEPARTMENT", label: "Milwaukee Police Department", cases: "2437", median: "92", p90: "478.4", open: "105", unreadable: "12", backwards: "15" }] : all });
    const r = await t.withIdentity(reader).action(api.spans.timeSpan, { code: "p24", groupBy: "Department" });
    expect(r).toMatchObject({
      status: "ok", code: "P24", name: "Citizen Complaints", groupBy: "Department", period: "all records",
      pair: { id: "complaint-close", name: "time to close", unit: "days" },
      groups: [{ label: "Milwaukee Police Department", cases: 2437, median: 92 }],
      all: { cases: 2731, median: 64, open: 105, unreadable: 12, backwards: 17 },
    });
  });
  it("says a file has no pair, and names the files that do", async () => {
    const t = await seed();
    const fake = installFakeFetch({ citySql: () => all });
    const r = await t.withIdentity(reader).action(api.spans.timeSpan, { code: "P01" });
    expect(r).toMatchObject({ status: "no-pair", code: "P01", name: "NIBRS Crime Data" });
    if (r.status !== "no-pair") throw new Error("expected no-pair");
    expect(r.files).toContain("311 call center requests");
    expect(fake.calls.length).toBe(0);
  });
  it("refuses an unknown pair id with the file's pairs", async () => {
    const t = await seed();
    installFakeFetch({ citySql: () => all });
    expect(await t.withIdentity(reader).action(api.spans.timeSpan, { code: "P24", pair: "nope" })).toMatchObject({ status: "choose-pair", pairs: [{ id: "complaint-close" }] });
  });
  it("says unavailable when the City fails, and too-broad when it times out", async () => {
    const t = await seed();
    installFakeFetch({ cityStatus: 403 });
    expect(await t.withIdentity(reader).action(api.spans.timeSpan, { code: "P24" })).toMatchObject({ status: "unavailable", code: "P24" });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("Timed out after 10s: https://data.milwaukee.gov/…"); }));
    expect(await t.withIdentity(reader).action(api.spans.timeSpan, { code: "P24" })).toMatchObject({ status: "too-broad", code: "P24" });
  });
});
```

- [ ] **Step 2: Run them.** `npx vitest run tests/lib/spanShape.test.ts convex/spans.test.ts`. Expected: FAIL, cannot resolve `spanShape` / `api.spans` undefined.

- [ ] **Step 3: Implement.** Create `convex/lib/spanShape.ts`:

```ts
import { MAX_GROUPS } from "./citySql";

export type SpanGroup = { label: string; cases: number; median: number | null; p90: number | null; open: number };
export type SpanAll = SpanGroup & { unreadable: number; backwards: number };

const count = (x: unknown) => { const n = Number(x); return Number.isFinite(n) ? n : 0; };
const time = (x: unknown) => (x === null || x === undefined || x === "" || !Number.isFinite(Number(x)) ? null : Number(x));

// The City's rows as numbers. A record with no group value is "(blank)"; a year group with no year is the unreadable
// "from" dates, which measure nothing (0 cases), so it is dropped; the All row counts them.
export function shapeSpan(groupRows: Record<string, unknown>[] | null, allRow: Record<string, unknown> | undefined, overlap: boolean, byYear: boolean) {
  const groups: SpanGroup[] = (groupRows ?? [])
    .filter((r) => !(byYear && (r.label === null || r.label === undefined) && count(r.cases) === 0))
    .map((r) => ({ label: r.label === null || r.label === undefined || r.label === "" ? "(blank)" : String(r.label), cases: count(r.cases), median: time(r.median), p90: time(r.p90), open: count(r.open) }));
  const a = allRow ?? {};
  const all = { label: "All", cases: count(a.cases), median: time(a.median), p90: time(a.p90), open: count(a.open), unreadable: count(a.unreadable), backwards: count(a.backwards) };
  // Medians can't be combined, so the cut-off rest is a case count only; overlapping groups can't be summed at all.
  const cut = !overlap && (groupRows ?? []).length >= MAX_GROUPS;
  const other = cut ? Math.max(0, all.cases - groups.reduce((s, g) => s + g.cases, 0)) : 0;
  return { groups, other, all };
}
```

In `convex/city.ts`'s `countContext`:
- add `key: string` to the `CountContext` type (`{ code: string; key: string; name: string; … }`);
- change `const base = { code: family.code, name: …` to `const base = { code: family.code, key: family.key, name: …`.

Create `convex/spans.ts`:

```ts
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action } from "./_generated/server";
import { chicagoDay } from "./lib/ask";
import { datastoreSql } from "./lib/ckan";
import { buildSpan } from "./lib/spanSql";
import { pairsFor, SPAN_PAIRS } from "./lib/spanPairs";
import { shapeSpan, type SpanAll, type SpanGroup } from "./lib/spanShape";
import { rateLimiter } from "./limits";

type PairOut = { id: string; name: string; things: string; toWhat: string; unit: "days" | "minutes"; missing: string; caveat: string; from: string; to: string };
export type SpanResult =
  | { status: "ok"; code: string; name: string; pair: PairOut; groupBy: string | null; overlap: boolean; period: string; filters: string[]; coverage: string | null; columns: string[]; groups: SpanGroup[]; other: number; all: SpanAll }
  | { status: "not-found"; code: string }
  | { status: "not-city" | "not-live" | "too-broad" | "unavailable"; code: string; name: string }
  | { status: "no-pair"; code: string; name: string; files: string[] }
  | { status: "choose-pair"; code: string; name: string; pairs: { id: string; name: string; from: string; to: string }[] }
  | { status: "bad-column"; code: string; name: string; column: string; columns: string[] }
  | { status: "choose"; code: string; name: string; column: string; asked: string; choices: string[] }
  | { status: "bad-dates"; code: string; name: string; from: string; to: string }
  | { status: "outside-coverage"; code: string; name: string; coverage: string }
  | { status: "busy" };

const vFilter = v.object({ column: v.string(), values: v.optional(v.array(v.string())) });
const FILES = [...new Set(SPAN_PAIRS.map((p) => p.file))];

// How long things take between an approved pair's two dates, live on the City's server (spec 2026-10-12 §6).
// Returns totals per group only, never rows. Shares the City count's allowance.
export const timeSpan = action({
  args: { code: v.string(), pair: v.optional(v.string()), groupBy: v.optional(v.string()), from: v.optional(v.string()), to: v.optional(v.string()), filters: v.optional(v.array(vFilter)) },
  handler: async (ctx, { code, pair: asked, ...args }): Promise<SpanResult> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Sign in to ask");
    if (!(await rateLimiter.limit(ctx, "askCity", { key: identity.tokenIdentifier })).ok) return { status: "busy" };
    const wanted = code.trim().toUpperCase();
    const data = await ctx.runQuery(internal.city.countContext, { code: wanted });
    if (!data) return { status: "not-found", code: wanted };
    const { name } = data;
    if (!data.city) return { status: "not-city", code: data.code, name };
    if (!data.profile || data.profile.rowCount === 0) return { status: "not-live", code: data.code, name };
    const pairs = pairsFor(data.key);
    if (!pairs.length) return { status: "no-pair", code: data.code, name, files: FILES };
    const pair = asked ? pairs.find((p) => p.id === asked.trim()) : pairs.length === 1 ? pairs[0] : undefined;
    if (!pair) return { status: "choose-pair", code: data.code, name, pairs: pairs.map((p) => ({ id: p.id, name: p.name, from: p.from, to: p.to })) };
    const built = buildSpan(data.profile, pair, args, chicagoDay(Date.now()));
    if (!built.ok) {
      const { ok: _ok, ...refusal } = built;
      return { ...refusal, code: data.code, name };
    }
    try {
      const [groupRows, allRows] = await Promise.all([
        built.groupSql ? datastoreSql<Record<string, unknown>>(built.groupSql) : Promise.resolve(null),
        datastoreSql<Record<string, unknown>>(built.allSql),
      ]);
      const shaped = shapeSpan(groupRows, allRows[0], built.overlap, built.groupLabel === "year");
      const { familyKey: _k, file: _f, ...out } = pair;
      return { status: "ok", code: data.code, name, pair: out, groupBy: built.groupLabel, overlap: built.overlap, period: built.period, filters: built.filterLabels, coverage: built.coverage, columns: built.columns, ...shaped };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error(`City time span failed for ${data.code}: ${message}`);
      return { status: /Timed out/.test(message) ? "too-broad" : "unavailable", code: data.code, name };
    }
  },
});
```

Then regenerate the bindings so `api.spans` exists: `npx convex codegen`.

- [ ] **Step 4: Run them.** `npx vitest run tests/lib/spanShape.test.ts convex/spans.test.ts convex/city.test.ts && npx tsc --noEmit`. Expected: PASS, and no type errors.

- [ ] **Step 5: Commit.**

```bash
git add convex/lib/spanShape.ts convex/spans.ts convex/city.ts convex/_generated/api.d.ts tests/lib/spanShape.test.ts convex/spans.test.ts
git commit -m "feat: timeSpan measures an approved pair live, behind sign-in and the City allowance

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 5: Ask learns `timeSpan`

**Files:**
- Modify: `lib/ask/tools.ts` (type, params, backend method, tool entry)
- Modify: `lib/ask/backend.ts` (one line)
- Modify: `lib/ask/prompt.ts` (one rule)
- Modify: `lib/ask/model.ts` (the scripted "how long" question)
- Test: `tests/ui/askTools.test.ts` (append)

**Interfaces:**
- Consumes: from Task 4, `api.spans.timeSpan`. From Task 1, `SPAN_PAIRS`.
- Produces:
  - `type SpanResult = FunctionReturnType<typeof api.spans.timeSpan>`
  - `spanParams` (a zod object: `code`, `pair?`, `groupBy?`, `from?`, `to?`, `filters?`)
  - `"timeSpan"` in `AskToolName`
  - `AskBackend.span(a: z.infer<typeof spanParams>): Promise<SpanResult>`
  - `spanDescription(): string`

- [ ] **Step 1: Write the failing test.** Append to `tests/ui/askTools.test.ts`, and add `spanDescription` to its import from `../../lib/ask/tools`:

```ts
describe("timeSpan", () => {
  it("is offered, and its description names every approved file and pair id", () => {
    const tool = askTools(backend({})).find((t) => t.name === "timeSpan");
    expect(tool).toBeDefined();
    for (const id of ["complaint-close", "311-close", "permit-issue", "fire-dispatch", "fire-arrive", "fire-clear", "mfd-arrive"]) expect(spanDescription()).toContain(id);
    expect(spanDescription()).toContain("citizen complaints against the Police and Fire Departments");
  });
});
```

If the file's `backend()` helper builds an `AskBackend` object literal, add `span: async () => ({ status: "busy" }) as never` to it so it still type-checks.

- [ ] **Step 2: Run it.** `npx vitest run tests/ui/askTools.test.ts`. Expected: FAIL, `spanDescription` is not exported or `timeSpan` is undefined.

- [ ] **Step 3: Implement.** In `lib/ask/tools.ts`:
- Add `import { SPAN_PAIRS } from "../../convex/lib/spanPairs";`.
- Add `export type SpanResult = FunctionReturnType<typeof api.spans.timeSpan>;` beside the other result types.
- Add `| "timeSpan"` to `AskToolName`.
- Add `span(a: z.infer<typeof spanParams>): Promise<SpanResult>;` to `AskBackend`.
- After `countParams`, add:

```ts
// timeSpan's arguments; the span card reads the same ones for its follow-up questions.
export const spanParams = z.object({
  code,
  pair: z.string().max(40).optional().describe("A pair id from the list below, when the file has several"),
  groupBy: z.string().max(64).optional().describe('"year" or one of the file\'s columns (e.g. Department)'),
  from: z.string().optional().describe("YYYY-MM-DD, on the earlier date"),
  to: z.string().optional().describe("YYYY-MM-DD, on the earlier date"),
  filters: z.array(z.object({ column: z.string(), values: z.array(z.string()).max(10) })).max(4).optional(),
});

// Generated from the approved pairs, so Ask's list can't drift from what the tool measures.
export function spanDescription(): string {
  const files = [...new Set(SPAN_PAIRS.map((p) => p.file))].map((file) => {
    const ps = SPAN_PAIRS.filter((p) => p.file === file);
    return `${file}: ${ps.map((p) => `${p.name} (pair ${p.id}: ${p.from} → ${p.to})`).join("; ")}`;
  });
  return `Measure how long things take between two dates in a City of Milwaukee file: per group, the number of cases, the median (half took less) and the time 9 in 10 took less than, plus how many are still open or have unreadable dates. Only these files and pairs: ${files.join(". ")}. Find the file's code with searchCatalog first. Split by "year" or one of the file's columns; limit to a period with from/to. If it returns choose-pair or columns, pick and call again. If no-pair, tell the person this file has no from-and-to dates to measure and name the files that do. Never compute, average or estimate times yourself; the card shows them.`;
}
```

- In `askTools(b)`, after the `countRecords` entry, add:

```ts
    {
      name: "timeSpan",
      description: spanDescription(),
      parameters: spanParams,
      execute: (a: z.infer<typeof spanParams>) => b.span(a),
    },
```

In `lib/ask/backend.ts`, after the `count:` line, add `span: (a) => fetchAction(api.spans.timeSpan, a, { token }),`.

In `lib/ask/prompt.ts`, after the line that starts `- If countRecords says a dataset can't be counted live`, add:

```ts
- "How long", "how fast", "time to" and "wait" questions about City records use timeSpan, never countRecords: find the file first (searchCatalog), then call timeSpan with any split ("year" or a column) and period the person gave. The card carries every time; don't restate them. Add what matters for the question and the one caveat that matters (cases still open, unreadable dates). If timeSpan says no-pair, say the file has no from-and-to dates to measure and name the files that do.
```

In `lib/ask/model.ts`:
- Extend the comment line that lists the scripted keywords with `"how long" → searchCatalog "citizen complaints", then timeSpan on the complaints row by Department;`.
- Then, right after the `if (question.includes("thefts") && searched?.output) { … }` block, add:

```ts
      if (question.includes("how long") && searched?.output) {
        const v = searched.output.type === "json" ? searched.output.value : JSON.parse(String(searched.output.value));
        const rows = (v as { rows?: { code: string; name: string }[] }).rows ?? [];
        const code = rows.find((r) => /complaint/i.test(r.name))?.code ?? rows[0]?.code ?? "P24";
        return { stream: simulateReadableStream({ chunks: [{ type: "stream-start" as const, warnings: [] }, call("timeSpan", { code, groupBy: "Department" }), finish("tool-calls")] }) };
      }
```

- In the first-step chain, add `question.includes("how long") ? call("searchCatalog", { query: "citizen complaints against police and fire" }) :` as the first alternative (before `question.includes("thefts") || …`).

- [ ] **Step 4: Run it.** `npx vitest run tests/ui/askTools.test.ts tests/ui/ask.test.ts && npx tsc --noEmit`. Expected: PASS, and no type errors.

- [ ] **Step 5: Commit.**

```bash
git add lib/ask/tools.ts lib/ask/backend.ts lib/ask/prompt.ts lib/ask/model.ts tests/ui/askTools.test.ts
git commit -m "feat: Ask learns timeSpan for how-long questions

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 6: The card's words, export and follow-ups

**Files:**
- Create: `ui/lib/spanText.ts`
- Modify: `ui/lib/cardExport.ts` (append `spanExport`)
- Modify: `ui/lib/nextQuestions.ts` (append `spanFollowUps`)
- Modify: `ui/lib/refusalChoices.ts` (append `spanChoices`)
- Test: `tests/ui/spanText.test.ts`

**Interfaces:**
- Consumes: from Task 5, `SpanResult` and `spanParams`. From C1, `CardExport`, `Ctx`, `safeName`, `sourceNote` and `exported`. Also `FollowUp`.
- Produces:
  - `MIN_CASES = 10`
  - `durationText(v: number | null, unit: "days" | "minutes"): string`
  - `spanSummary(r: SpanOk): string`
  - `spanNotes(r: SpanOk): { warning: string | null; notes: string[] }`
  - `spanTitle(r: SpanOk): string`
  - `spanExport(r: SpanOk, ctx: Ctx): CardExport`
  - `spanFollowUps(args: SpanArgsIn, r: SpanOk): FollowUp[]`
  - `spanChoices(args: SpanArgsIn, r: SpanRefusal): FollowUp[]`
  - where `SpanOk = Extract<SpanResult, { status: "ok" }>` and `SpanArgsIn = z.infer<typeof spanParams>`.

- [ ] **Step 1: Write the failing test.** Create `tests/ui/spanText.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { spanExport } from "../../ui/lib/cardExport";
import { spanChoices } from "../../ui/lib/refusalChoices";
import { spanFollowUps } from "../../ui/lib/nextQuestions";
import { durationText, spanNotes, spanSummary, spanTitle } from "../../ui/lib/spanText";

const pair = { id: "complaint-close", name: "time to close", things: "complaints", toWhat: "to close", unit: "days" as const, missing: "{n} complaints aren't closed yet and aren't counted, so slow cases are under-counted.", caveat: "Dates are typed by hand in more than one format; a few can't be read.", from: "DateReported", to: "Date Closed" };
const r = {
  status: "ok" as const, code: "P24", name: "Citizen Complaints", pair, groupBy: "Department", overlap: false, period: "all records", filters: [], coverage: null, columns: ["Department", "Status"],
  groups: [
    { label: "Milwaukee Police Department", cases: 2437, median: 92, p90: 478.4, open: 105 },
    { label: "Milwaukee Fire Department", cases: 64, median: 22, p90: 86.7, open: 0 },
    { label: "Unknown", cases: 3, median: 0, p90: 14.4, open: 0 },
  ],
  other: 0, all: { label: "All", cases: 2731, median: 64, p90: 400, open: 105, unreadable: 12, backwards: 17 },
};
const ctx = { origin: "https://almanac.test", date: "October 12, 2026" };

describe("durations", () => {
  it("writes days and minutes the way a reporter would", () => {
    expect(durationText(92, "days")).toBe("92 days");
    expect(durationText(1478.4, "days")).toBe("1,478 days");
    expect(durationText(0.5, "days")).toBe("0.5 days");
    expect(durationText(1, "days")).toBe("1 day");
    expect(durationText(4.6037, "minutes")).toBe("4.6 minutes");
    expect(durationText(72.2, "minutes")).toBe("1 h 12 min");
    expect(durationText(null, "days")).toBe("too few to say");
  });
});

describe("the span card's words", () => {
  it("titles the card and says what was found, slowest and fastest among groups with enough cases", () => {
    expect(spanTitle(r)).toBe("Citizen Complaints · time to close · by Department");
    expect(spanSummary(r)).toBe("Overall, half of the complaints measured took 64 days or less to close. Slowest: Milwaukee Police Department (92 days); fastest: Milwaukee Fire Department (22 days).");
    expect(spanSummary({ ...r, groupBy: null, groups: [] })).toBe("Half of the complaints measured took 64 days or less to close; 9 in 10 took 400 days or less.");
  });
  it("notes open cases, unreadable and wrong-order dates, the caveat, and what too few means", () => {
    const { warning, notes } = spanNotes(r);
    expect(warning).toBeNull();
    expect(notes).toEqual([
      "105 complaints aren't closed yet and aren't counted, so slow cases are under-counted.",
      "12 dates couldn't be read and were left out.",
      "17 had the later date before the earlier one and were left out.",
      "Dates are typed by hand in more than one format; a few can't be read.",
      "Period: all records.",
      "“Too few to say” means fewer than 10 measured cases.",
    ]);
  });
  it("warns in bold when more than 1 in 5 dates couldn't be read, and says recent years look faster", () => {
    expect(spanNotes({ ...r, all: { ...r.all, unreadable: 900 } }).warning).toBe("More than 1 in 5 dates here couldn't be read, so treat these times with caution.");
    const byYear = { ...r, groupBy: "year", groups: [{ label: "2025", cases: 311, median: 52, p90: 167, open: 79 }, { label: "2024", cases: 524, median: 87, p90: 372.7, open: 21 }] };
    expect(spanNotes(byYear).notes).toContain("Recent years look faster than they are: their slowest cases aren't closed yet.");
  });
});

describe("span export", () => {
  it("has a row per group plus All, with unrounded times in the unit's heading", () => {
    const e = spanExport(r, ctx);
    expect(e.csv.head).toEqual(["Department", "Cases", "Median (days)", "9 in 10 within (days)", "Still open"]);
    expect(e.csv.rows[0]).toEqual(["Milwaukee Police Department", 2437, 92, 478.4, 105]);
    expect(e.csv.rows.at(-1)).toEqual(["All", 2731, 64, 400, 105]);
    expect(e.text.rows[2]).toEqual(["Unknown", "3", "too few to say", "too few to say", "0"]);
    expect(e.notes).toContain("Source: City of Milwaukee, P24 Citizen Complaints: https://almanac.test/d/P24");
    expect(e.filename).toBe("almanac_P24_complaint-close_Department");
  });
});

describe("span follow-ups and choices", () => {
  it("offers by year and another column, never the split already shown", () => {
    const f = spanFollowUps({ code: "P24", groupBy: "Department" }, r);
    expect(f.map((x) => x.label)).toEqual(["BY YEAR", "BY STATUS"]);
    expect(f[0].question).toBe("How long did complaints take to close in Citizen Complaints (P24), by year?");
  });
  it("turns a choose-pair refusal into one button per pair", () => {
    const c = spanChoices({ code: "P04" }, { status: "choose-pair", code: "P04", name: "Fire Incident Detail", pairs: [{ id: "fire-arrive", name: "time to arrive", from: "Date_Received", to: "Date_Arrived" }] });
    expect(c).toEqual([{ label: "time to arrive", question: "How long is the time to arrive in Fire Incident Detail (P04)? (pair fire-arrive)" }]);
  });
});
```

- [ ] **Step 2: Run it.** `npx vitest run tests/ui/spanText.test.ts`. Expected: FAIL, cannot resolve `../../ui/lib/spanText`.

- [ ] **Step 3: Implement.** Create `ui/lib/spanText.ts`:

```ts
import type { SpanResult } from "@/lib/ask/tools";

// The span card's words (spec 2026-10-12-time-spans-design.md §7), written by code from the server's numbers.
export type SpanOk = Extract<SpanResult, { status: "ok" }>;
export const MIN_CASES = 10;
const enough = (g: { cases: number; median: number | null }) => g.cases >= MIN_CASES && g.median !== null;

export function durationText(v: number | null, unit: "days" | "minutes"): string {
  if (v === null || !Number.isFinite(v)) return "too few to say";
  if (unit === "minutes") {
    if (v < 60) return `${(Math.round(v * 10) / 10).toFixed(1)} minutes`;
    const m = Math.round(v);
    return `${Math.floor(m / 60)} h ${m % 60} min`;
  }
  const d = v < 10 ? Math.round(v * 10) / 10 : Math.round(v);
  return `${d.toLocaleString("en-US")} ${d === 1 ? "day" : "days"}`;
}
// A group's median or 9-in-10, or "too few to say" under 10 cases.
export const cellTime = (g: { cases: number }, v: number | null, unit: "days" | "minutes") => (g.cases < MIN_CASES ? "too few to say" : durationText(v, unit));

export const spanTitle = (r: SpanOk) => [r.name, r.pair.name, ...(r.groupBy ? [`by ${r.groupBy === "year" ? "year" : r.groupBy}`] : [])].join(" · ");

export function spanSummary(r: SpanOk): string {
  const t = (v: number | null) => durationText(v, r.pair.unit);
  const head = `half of the ${r.pair.things} measured took ${t(r.all.median)} or less ${r.pair.toWhat}`;
  const ranked = r.groups.filter(enough).sort((a, b) => b.median! - a.median!);
  if (!r.groupBy || ranked.length < 2) return `${head[0].toUpperCase()}${head.slice(1)}; 9 in 10 took ${t(r.all.p90)} or less.`;
  const slow = ranked[0], fast = ranked.at(-1)!;
  return `Overall, ${head}. Slowest: ${slow.label} (${t(slow.median)}); fastest: ${fast.label} (${t(fast.median)}).`;
}

export function spanNotes(r: SpanOk): { warning: string | null; notes: string[] } {
  const a = r.all;
  const n = (x: number) => x.toLocaleString("en-US");
  const rows = a.cases + a.open + a.unreadable + a.backwards;
  const newest = r.groupBy === "year" ? r.groups[0] : undefined;
  return {
    warning: rows > 0 && a.unreadable * 5 > rows ? "More than 1 in 5 dates here couldn't be read, so treat these times with caution." : null,
    notes: [
      ...(a.open > 0 ? [r.pair.missing.replace("{n}", n(a.open))] : []),
      ...(a.unreadable > 0 ? [`${n(a.unreadable)} dates couldn't be read and were left out.`] : []),
      ...(a.backwards > 0 ? [`${n(a.backwards)} had the later date before the earlier one and were left out.`] : []),
      ...(r.overlap ? [`One of the ${r.pair.things} can count in more than one ${r.groupBy}.`] : []),
      ...(newest && newest.open > 0 ? ["Recent years look faster than they are: their slowest cases aren't closed yet."] : []),
      r.pair.caveat,
      ...(r.coverage ? [`The City's data here covers ${r.coverage}.`] : []),
      `Period: ${r.period}.`,
      ...(r.filters.length ? [`Only: ${r.filters.join(", ")}.`] : []),
      ...(r.groups.some((g) => g.cases < MIN_CASES) ? [`“Too few to say” means fewer than ${MIN_CASES} measured cases.`] : []),
    ],
  };
}
```

Append to `ui/lib/cardExport.ts`, with `import { cellTime, spanNotes, spanSummary, spanTitle, type SpanOk } from "./spanText";` at the top:

```ts
export function spanExport(r: SpanOk, ctx: Ctx): CardExport {
  const u = r.pair.unit;
  const rows = [...r.groups, ...(r.other > 0 ? [{ label: "Other", cases: r.other, median: null, p90: null, open: 0 }] : []), r.all];
  const { warning, notes } = spanNotes(r);
  return {
    title: spanTitle(r),
    lines: [...(warning ? [warning] : []), spanSummary(r)],
    csv: {
      head: [r.groupBy === "year" ? "Year" : r.groupBy ?? "Group", "Cases", `Median (${u})`, `9 in 10 within (${u})`, "Still open"],
      rows: rows.map((g) => [g.label, g.cases, g.median, g.p90, g.open]),
    },
    text: {
      head: [r.groupBy === "year" ? "Year" : r.groupBy ?? "", "Cases", "Median", "9 in 10 within", "Still open"],
      rows: rows.map((g) => [g.label, g.cases.toLocaleString("en-US"), g.label === "Other" ? "" : cellTime(g, g.median, u), g.label === "Other" ? "" : cellTime(g, g.p90, u), g.open.toLocaleString("en-US")]),
    },
    notes: [...notes, sourceNote("City of Milwaukee", r.code, r.name, ctx), exported(ctx)],
    filename: safeName([r.code, r.pair.id, ...(r.groupBy ? [r.groupBy] : [])]),
  };
}
```

Append to `ui/lib/nextQuestions.ts`, importing `type SpanOk` from `./spanText` and `type spanParams` from `@/lib/ask/tools`. Follow the file's existing `import type { … }` style and its `MAX` constant.

```ts
type SpanArgsIn = { code: string; groupBy?: string; from?: string; to?: string };
const spanBase = (r: SpanOk) => `How long did ${r.pair.things} take ${r.pair.toWhat} in ${r.name} (${r.code})`;
export function spanFollowUps(args: SpanArgsIn, r: SpanOk): FollowUp[] {
  const out: FollowUp[] = [];
  if (r.groupBy !== "year") out.push({ label: "BY YEAR", question: `${spanBase(r)}, by year?` });
  for (const c of r.columns.filter((c) => c !== r.groupBy).slice(0, 2)) out.push({ label: `BY ${c.replace(/_/g, " ").toUpperCase()}`, question: `${spanBase(r)}, by ${c}?` });
  return out.slice(0, MAX);
}
```

Then adjust the test's expectations if `MAX` is smaller than 3: the test expects `["BY YEAR", "BY STATUS"]`. With `columns: ["Department", "Status"]` and `groupBy: "Department"`, that is 2 items.

Append to `ui/lib/refusalChoices.ts`, following its `MAX` and `FollowUp` usage:

```ts
type SpanArgsIn = { code: string; groupBy?: string; from?: string; to?: string; pair?: string };
type SpanRefusal = { status: string; code?: string; name?: string; pairs?: { id: string; name: string }[]; columns?: string[]; column?: string; choices?: string[] };
export function spanChoices(args: SpanArgsIn, r: SpanRefusal): FollowUp[] {
  const where = `${r.name ?? "this file"} (${r.code ?? args.code})`;
  if (r.status === "choose-pair" && r.pairs) return r.pairs.slice(0, MAX).map((p) => ({ label: p.name, question: `How long is the ${p.name} in ${where}? (pair ${p.id})` }));
  if (r.status === "bad-column" && r.columns) return r.columns.slice(0, MAX).map((c) => ({ label: c, question: `How long does it take in ${where}, by ${c}?` }));
  if (r.status === "choose" && r.choices && r.column) return r.choices.slice(0, MAX).map((v) => ({ label: v, question: `How long does it take in ${where}, only ${r.column} ${v}?` }));
  return [];
}
```

- [ ] **Step 4: Run it.** `npx vitest run tests/ui/spanText.test.ts tests/ui/cardExport.test.ts tests/ui/nextQuestions.test.ts tests/ui/refusalChoices.test.ts && npx tsc --noEmit`. Expected: PASS, and no type errors.

- [ ] **Step 5: Commit.**

```bash
git add ui/lib/spanText.ts ui/lib/cardExport.ts ui/lib/nextQuestions.ts ui/lib/refusalChoices.ts tests/ui/spanText.test.ts
git commit -m "feat: the time-span card's words, export and follow-ups

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 7: Development push and the live check of all seven pairs

**Files:**
- Modify: `convex/spans.ts` (append `checkPairs`)
- Test: `convex/spans.test.ts` (append)

**Interfaces:**
- Consumes: from Tasks 1–4, `SPAN_PAIRS`, `buildSpan`, `shapeSpan` and `datastoreSql`. Also `internal`.
- Produces: `internal.spans.checkPairs`, an internal action with no arguments, returning `{ id: string; ok: boolean; error?: string; all?: SpanAll }[]`.

- [ ] **Step 1: Write the failing test.** Append to `convex/spans.test.ts`, and add `internal` to the `./_generated/api` import:

```ts
describe("checkPairs", () => {
  it("measures every approved pair that has a profile, and says which have none", async () => {
    const t = await seed();
    installFakeFetch({ citySql: () => all });
    const out = await t.action(internal.spans.checkPairs, {});
    expect(out.find((x) => x.id === "complaint-close")).toMatchObject({ ok: true, all: { cases: 2731 } });
    expect(out.find((x) => x.id === "311-close")).toMatchObject({ ok: false, error: "no profile" });
    expect(out).toHaveLength(7);
  });
});
```

- [ ] **Step 2: Run it.** `npx vitest run convex/spans.test.ts`. Expected: FAIL, `internal.spans.checkPairs` is undefined.

- [ ] **Step 3: Implement.** Append to `convex/spans.ts`, adding `internalAction` and `internalQuery` to the `./_generated/server` import:

```ts
export const profileFor = internalQuery({
  args: { familyKey: v.string() },
  handler: (ctx, { familyKey }) => ctx.db.query("cityProfiles").withIndex("by_family", (q) => q.eq("familyKey", familyKey)).first(),
});

// The live check before a release (spec §9): every approved pair, measured whole, against the City's server.
// Read-only. Run with `npx convex run spans:checkPairs` (add --prod for the live site).
export const checkPairs = internalAction({
  args: {},
  handler: async (ctx): Promise<{ id: string; ok: boolean; error?: string; all?: SpanAll }[]> => {
    const out: { id: string; ok: boolean; error?: string; all?: SpanAll }[] = [];
    for (const pair of SPAN_PAIRS) {
      const profile = await ctx.runQuery(internal.spans.profileFor, { familyKey: pair.familyKey });
      if (!profile) { out.push({ id: pair.id, ok: false, error: "no profile" }); continue; }
      const built = buildSpan(profile, pair, {}, chicagoDay(Date.now()));
      if (!built.ok) { out.push({ id: pair.id, ok: false, error: built.status }); continue; }
      try {
        const rows = await datastoreSql<Record<string, unknown>>(built.allSql);
        out.push({ id: pair.id, ok: true, all: shapeSpan(null, rows[0], false, false).all });
      } catch (e) {
        out.push({ id: pair.id, ok: false, error: e instanceof Error ? e.message : String(e) });
      }
    }
    return out;
  },
});
```

Run `npx convex codegen`.

- [ ] **Step 4: Run it.** `npx vitest run convex/spans.test.ts && npx tsc --noEmit`. Expected: PASS.

- [ ] **Step 5: Commit, then the development push and the live check.**

```bash
git add convex/spans.ts convex/spans.test.ts convex/_generated/api.d.ts
git commit -m "feat: checkPairs measures every approved pair live, for the release check

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

**STOP: ask Tarik before the next command.** It changes the shared development backend that the PR preview uses.

```bash
npx convex dev --once
npx convex run spans:checkPairs
```

Expected: 7 entries, all `ok: true`.
- `complaint-close` should read about 2,731 cases with a median near 64 days (the All row), and 105 open.
- `fire-arrive` should be in minutes, with a median near 6.
- Any `ok: false` with an HTML/403 error is a firewall pattern. Find it the way the spec §2.1 describes and fix `spanSql.ts` with a test.
- A `Timed out` is the MFD file (350,530 rows). Record it, because the card will say "try a shorter period".

Record the seven lines in the ledger.

### Task 8: The card in Ask

**Files:**
- Modify: `ui/components/AskCards.tsx` (a `SpanCard` and a `timeSpan` renderer)
- Test: `e2e/ask.spec.ts` (append)

**Interfaces:**
- Consumes: from Task 5, `spanParams` and `SpanResult`. From Task 6, `spanTitle`, `spanSummary`, `spanNotes`, `cellTime`, `spanExport`, `spanFollowUps` and `spanChoices`. From C1, `ExportBar`. Plus the existing `ProvenanceTag`, `OpenLink`, `FollowUps` and `parse`, and the `Busy`/`Failed` helpers in `AskCards.tsx`.
- Produces: `[data-card=span]`, with `[data-summary]`, a `table` and `[data-span-warning]`.

- [ ] **Step 1: Write the failing browser test.** Append inside `test.describe("signed in", …)` in `e2e/ask.spec.ts`, after the City count test:

```ts
  test("a how-long question draws a time-span card with medians, open cases and the export line", async ({ page }) => {
    test.skip(!(await page.request.get("https://data.milwaukee.gov/api/3/action/status_show").then((r) => r.ok()).catch(() => false)), "City API unreachable");
    await ask(page, "How long do complaints take to close, by department?");
    const card = page.locator("[data-card=span]:visible").first();
    await expect(card).toBeVisible({ timeout: 40_000 });
    await expect(card).toContainText("time to close · by Department");
    await expect(card.locator("[data-summary]")).toContainText(/half of the complaints measured took [\d,.]+ days? or less to close/);
    await expect(card.locator("tbody tr").first()).toContainText("Milwaukee Police Department");
    await expect(card).toContainText(/aren't closed yet/);
    await expect(card.getByTitle("From the City of Milwaukee's open data")).toBeVisible();
    await expect(card.locator("[data-export]").getByRole("button", { name: "CSV" })).toBeVisible();
  });
```

- [ ] **Step 2: Run it.** Start the production build on port 3100 (Global Constraints), then run `BASE_URL=http://localhost:3100 npx playwright test e2e/ask.spec.ts -g "how-long" --project=desktop`, with `.env.local` loaded. Expected: FAIL, with no `[data-card=span]`. The dev backend has `spans.timeSpan` since Task 7, but nothing draws it yet. The failure must be on the card, not on sign-in.

- [ ] **Step 3: Implement.** In `ui/components/AskCards.tsx`:
- Add imports: `spanParams` and `type SpanResult` from `@/lib/ask/tools`; `spanExport` from `@/ui/lib/cardExport`; `cellTime, spanNotes, spanSummary, spanTitle, type SpanOk` from `@/ui/lib/spanText`; `spanFollowUps` from `@/ui/lib/nextQuestions`; and `spanChoices` from `@/ui/lib/refusalChoices`.
- Add, beside `CountCard`:

```tsx
// How long things take between an approved pair's dates (spec 2026-10-12-time-spans-design.md §7): every time here
// comes from the City's server through code, never the AI.
function SpanCard({ r, onOpen }: { r: SpanOk; onOpen: Open }) {
  const { warning, notes } = spanNotes(r);
  const u = r.pair.unit;
  const rows = [...r.groups, ...(r.other > 0 ? [{ label: "Other", cases: r.other, median: null, p90: null, open: 0 }] : [])];
  return (
    <figure className={styles.excerpt} data-card="span">
      <figcaption className={styles.excerptTitle}>{spanTitle(r)} <ProvenanceTag source="CITY" /></figcaption>
      {warning && <p className={styles.failed} data-span-warning><b>{warning}</b></p>}
      <p className={styles.tractSummary} data-summary>{spanSummary(r)}</p>
      <table className={styles.excerptTable}>
        <thead>
          <tr><th scope="col">{r.groupBy === "year" ? "Year" : r.groupBy ?? ""}</th><th scope="col">Cases</th><th scope="col">Median</th><th scope="col">9 in 10 within</th></tr>
        </thead>
        <tbody>
          {rows.map((g) => (
            <tr key={g.label}><th scope="row">{g.label}</th><td>{g.cases.toLocaleString("en-US")}</td><td>{g.label === "Other" ? "" : cellTime(g, g.median, u)}</td><td>{g.label === "Other" ? "" : cellTime(g, g.p90, u)}</td></tr>
          ))}
          <tr><th scope="row">All</th><td>{r.all.cases.toLocaleString("en-US")}</td><td>{cellTime(r.all, r.all.median, u)}</td><td>{cellTime(r.all, r.all.p90, u)}</td></tr>
        </tbody>
      </table>
      {notes.map((n) => <p key={n} className={styles.source}>{n}</p>)}
      <OpenLink code={r.code} onOpen={onOpen} label="Open the data" />
      <ExportBar make={(ctx) => spanExport(r, ctx)} />
    </figure>
  );
}
```

- Inside `AskCards`, after the `countRecords` renderer, add:

```tsx
  useRenderTool({ name: "timeSpan", parameters: spanParams, render: (props) => {
    if (props.status !== "complete") return <Busy />;
    const r = parse<SpanResult>(props.result);
    if (!r) return <Failed />;
    if (r.status === "ok") return <><SpanCard r={r} onOpen={onOpen} /><FollowUps items={spanFollowUps(props.parameters as never, r)} id={props.toolCallId} /></>;
    if (r.status === "unavailable") return <p className={styles.failed}>The City&apos;s data didn&apos;t respond. Try again shortly.</p>;
    if (r.status === "too-broad") return <p className={styles.failed}>Too many {r.name} records to measure at once; try a shorter period.</p>;
    if (r.status === "busy") return <p className={styles.failed}>City questions are busy for your account; try again shortly.</p>;
    if (r.status === "outside-coverage") return <p className={styles.failed}>{r.name}: the City&apos;s data here covers {r.coverage}, so there is nothing to measure for that period. <OpenLink code={r.code} onOpen={onOpen} /></p>;
    // no-pair, not-found, not-city and not-live are said by the model; the rest offer their options to pick.
    return <FollowUps pick items={spanChoices(props.parameters as never, r as never)} id={props.toolCallId} />;
  } }, [onOpen]);
```

- [ ] **Step 4: Run it.** `npx tsc --noEmit && npx vitest run --no-file-parallelism` (expected: all pass). Then rebuild (`npx next build`), restart on port 3100, and run `BASE_URL=http://localhost:3100 npx playwright test e2e/ask.spec.ts -g "how-long|City count"` with `.env.local` loaded. Expected: PASS on desktop and phone.

- [ ] **Step 5: Commit.**

```bash
git add ui/components/AskCards.tsx e2e/ask.spec.ts
git commit -m "feat: Ask draws a time-span card with medians, notes, exports and follow-ups

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 9: Docs and the guide example

**Files:**
- Create: `docs/decisions/033-time-spans.md`
- Modify: `ui/components/HowItWorks.tsx` (a paragraph in "WHAT THE AI DOES", after the export paragraph)
- Modify: `lib/ask/examples.ts` (one journalist example)
- Modify: `DESIGN.md` (`### How long` after `### Export`)
- Test: `e2e/how.spec.ts` (append), `tests/ui/askExamples.test.ts` (existing; must stay green)

**Interfaces:** none.

- [ ] **Step 1: Write the failing test.** Append to `e2e/how.spec.ts`:

```ts
test("it explains how-long answers in plain words", async ({ page }) => {
  await page.goto("/how-it-works");
  await expect(page.getByText(/The median is the middle case: half took less time/)).toBeVisible();
});
```

- [ ] **Step 2: Run it.** `BASE_URL=http://localhost:3100 npx playwright test e2e/how.spec.ts -g "how-long" --project=desktop`, against a fresh build. Expected: FAIL, text not found.

- [ ] **Step 3: Implement.** In `ui/components/HowItWorks.tsx`, after the export paragraph, add:

```tsx
            <p>
              Ask can also say how long things take in a few City files, like complaints, 311 requests, permits and fire calls. The median is
              the middle case: half took less time. The &ldquo;9 in 10&rdquo; time is how long all but the slowest tenth took. Cases still
              open aren&apos;t counted, so the slowest ones are missing, and the card says how many.
            </p>
```

In `lib/ask/examples.ts`, add to `ASK_EXAMPLES`, after the first journalist example:

```ts
  { role: "journalist", question: "How long do citizen complaints take to close, by department?", tool: "timeSpan", expect: { groupBy: "Department" } },
```

Create `docs/decisions/033-time-spans.md`:

```markdown
# 033: How long things take, from chosen date pairs, measured live

**Decision:** Ask answers "how long" questions with a new tool that measures the time between two dates in seven hand-checked City pairs (complaints, 311, permits, fire response), live on the City's server, showing the median and the 9-in-10 per group.

**Why this came up:** A reporter asked how long complaints take to close and whether it varies by department. Ask found the right file but could only count records. Time to close, to issue or to arrive is a common accountability story, and the City publishes the dates.

**Options:**
1. **Chosen pairs, measured live** (chosen). A short list says which two dates in which file make a real span, in days or minutes, with its own caveat. Cost: a file is only measurable once someone adds it to the list.
2. **Any two date columns.** Cost: the AI could pair dates that don't mean a span (a license's start and expiry), and each file's quirks go unchecked.
3. **Work it out weekly and store it.** Cost: no custom periods or filters, and a week stale.

**What we chose and why (Tarik, 2026-10-12):** Chosen pairs, a median and a 9-in-10 rather than an average (a few years-long cases drag an average), split by one category or by year, measured live like City counts. A spike first proved the City's server could do it, and found its limits: it refuses some functions (FILTER, trim, extract), and its firewall refuses some query text, so the query is written around both.

**What we gave up:**
- Open cases aren't measured, so the slowest are missing and recent years look faster (the card says so).
- Unreadable or impossible dates are left out and counted, never guessed.
- Only seven pairs to start.
- The biggest file (Fire Department calls, 350,000 rows) may need a shorter period to answer in time.

**How we'll know if this was right:** Reporters' how-long questions get a card instead of "I can't". The complaints numbers match what the City reports when checked. No one finds a span that compares the wrong two dates.

**What actually happened:**
```

In `DESIGN.md`, after the `### Export` section, add:

```markdown
### How long
The time-span card (`[data-card=span]`):
- **Title:** "{file} · {pair name} · by {split}", with the CITY tag.
- **Above the table:** an optional bold warning (more than 1 in 5 dates unreadable), then the code-written summary sentence.
- **Table:** Group · Cases · Median · 9 in 10 within, plus an "Other" line (cases only) and the "All" row. Under 10 cases reads "too few to say".
- **Notes:** open cases (the pair's own wording), unreadable and wrong-order dates, overlap, "recent years look faster", the pair's caveat, coverage, period and filters.
- **Then:** the "Open the data" link, the export line and the follow-ups (BY YEAR, BY {column}).
- **Units:** minutes read "4.6 minutes" or "1 h 12 min"; days read "0.5 days" or "92 days". Pairs: `convex/lib/spanPairs.ts`. Decision 033.
```

- [ ] **Step 4: Run it.**
  - `npx vitest run tests/ui/askExamples.test.ts`. Expected: PASS. If it checks that each example's tool exists in `AskToolName`, `timeSpan` now does.
  - Then rebuild, restart on port 3100, and run `BASE_URL=http://localhost:3100 npx playwright test e2e/how.spec.ts`. Expected: PASS, all tests.

- [ ] **Step 5: Commit.**

```bash
git add docs/decisions/033-time-spans.md ui/components/HowItWorks.tsx lib/ask/examples.ts DESIGN.md e2e/how.spec.ts
git commit -m "docs: decision 033, How it works, the guide example and DESIGN.md on how-long answers

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```
