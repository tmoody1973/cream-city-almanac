# Totals, Medians and Averages in City Counts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `countRecords` gains an optional `measure` argument. With it, Ask returns records, total, median and (on request) average of one approved money column per group, from six hand-checked City measures, on a new measure card.

**Architecture:**
- `convex/lib/cityMeasures.ts` lists the approved measures.
- `convex/lib/measureSql.ts` builds one firewall-safe query, reusing the count builder's checks and E's date reader.
- `convex/lib/measureShape.ts` turns the City's rows into numbers and hides small groups in files that name people.
- `convex/city.ts` routes `countRecords` calls that carry `measure` to a new `runMeasure`.
- `ui/lib/measureText.ts` writes the card's words.
- `MeasureCard` in `AskCards.tsx` draws it.

**Tech Stack:** Convex (actions, convex-test), Next.js 16 and React 19, CopilotKit v2, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-12-city-measures-design.md`

## Global Constraints

- **Reading money:**
  - Strip `$`, commas and spaces with `regexp_replace(col, '[$, ]', '', 'g')`.
  - Accept only `^-?[0-9]+([.][0-9]+)?$`.
  - Cast `::float` only inside that CASE guard.
- **City SQL never uses** `FILTER`, `trim`, `extract`, `left(`, a flag written as `= 1 AND`, or a function result compared to a text literal. The query shape below passed the live firewall on 2026-10-12 for all six measures.
- **Names-people files:** a group with fewer than **5** records is hidden. If exactly one group is hidden, the next-smallest visible group is hidden too. An "All other groups" line with fewer than 5 records is hidden.
- **The average** is computed always but shown only when `measure.average` is true, with the note when |average − median| > 25% of the median.
- **The hourly rate** has no total (`summable: false`): no Total column, and no total in the sentence.
- **Money format:**
  - Table: `$2,412,903` for 1,000 or more, `$80.71` under 1,000.
  - Hourly in the table: `$41.42`.
  - Sentence: `$2.4 million` / `$4.4 billion` at 1 million or more; otherwise the table form.
  - Hourly in a sentence: `$41.42 an hour`.
- **Measures are found by family key, never by dataset code.**
- **`neighborhood` with `measure` is refused with `no-locations`.**
- **Messages, verbatim:**
  - "fewer than 5 records"
  - "Some groups have fewer than 5 records, so their figures are hidden to protect individuals."
  - "A few large values pull the average away from the typical one; the median is the better guide."
- **A development Convex push** (`npx convex dev --once`) needs Tarik's explicit OK (Task 7).
- **Never stage** `.superpowers/` or `clerk-creamcityalmanac.app.zone`.
- **Commit trailer:** `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- **Local browser tests** run against `next start -p 3100` with `BASE_URL=http://localhost:3100` and `.env.local` sourced, never port 3000. Under heavy machine load, run Vitest with `--no-file-parallelism`.

## Review Focus

1. **One hidden group and the All row.** With two visible groups and one hidden, a reader can subtract. The next-smallest must also hide, and the "All other groups" line must hide under 5. Task 3 pins this.
2. **A blank group value** (an employee with no Department). It shows as "(blank)", never dropped. A year group with no readable year and no records is dropped. Task 3 pins this.
3. **Summing a rate.** The hourly rate must never show a total, in the table, the sentence or the export. Tasks 1 and 6 pin this.
4. **The property file is a snapshot.** Its totals use only the current assessment year (`YR_ASSMT` = the profile's most common value), like counts. Task 2 pins this.
5. **A period on a file with no date column** is refused (`bad-dates`), never silently ignored. Task 2 pins this.

---

### Task 1: The approved measures

**Files:**
- Create: `convex/lib/cityMeasures.ts`
- Test: `tests/lib/cityMeasures.test.ts`

**Interfaces:**
- Produces:
  - `type CityMeasure = { id: string; familyKey: string; file: string; column: string; name: string; things: string; unit: "dollars" | "dollars per hour"; summable: boolean; splits: string[]; date: string | null; namesPeople: boolean; skipZero: boolean; caveat: string }`
  - `CITY_MEASURES: CityMeasure[]`
  - `measuresFor(familyKey: string): CityMeasure[]`
  - `MEASURE_FILES: string[]`

- [ ] **Step 1: Write the failing test.** Create `tests/lib/cityMeasures.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { CITY_MEASURES, MEASURE_FILES, measuresFor } from "../../convex/lib/cityMeasures";

describe("approved City measures", () => {
  it("are well-formed, with unique ids and real units", () => {
    expect(CITY_MEASURES).toHaveLength(6);
    expect(new Set(CITY_MEASURES.map((m) => m.id)).size).toBe(6);
    for (const m of CITY_MEASURES) {
      expect(m.familyKey).toMatch(/^city:[a-z0-9-]+$/);
      expect(["dollars", "dollars per hour"]).toContain(m.unit);
      expect(m.splits.length).toBeGreaterThan(0);
      for (const s of [m.file, m.column, m.name, m.things, m.caveat]) expect(s.length).toBeGreaterThan(2);
    }
  });
  it("never sums a rate", () => {
    expect(CITY_MEASURES.find((m) => m.id === "hourly-rate")!.summable).toBe(false);
    expect(CITY_MEASURES.filter((m) => m.unit === "dollars").every((m) => m.summable)).toBe(true);
  });
  it("finds a file's measures by family key and names the files that have any", () => {
    expect(measuresFor("city:city-employee-salary-data").map((m) => m.id)).toEqual(["gross-pay", "hourly-rate"]);
    expect(measuresFor("city:nibrs-crime-data")).toEqual([]);
    expect(MEASURE_FILES).toContain("delinquent real estate tax accounts");
    expect(new Set(MEASURE_FILES).size).toBe(MEASURE_FILES.length);
  });
});
```

- [ ] **Step 2: Run it.** `npx vitest run tests/lib/cityMeasures.test.ts`. Expected: FAIL, cannot resolve `../../convex/lib/cityMeasures`.

- [ ] **Step 3: Implement.** Create `convex/lib/cityMeasures.ts`:

```ts
// The City money columns Ask may total, take the median of, or average (spec 2026-10-12-city-measures-design.md §4).
// Hand-checked: column, unit, splits that make sense, caveat, and whether the file names people. Found by family key,
// never by dataset code. A column not here is never totaled.
export type CityMeasure = {
  id: string; familyKey: string; file: string; column: string; name: string; things: string;
  unit: "dollars" | "dollars per hour"; summable: boolean; splits: string[]; date: string | null;
  namesPeople: boolean; skipZero: boolean; caveat: string;
};

const MAILING_ZIP = "ZIP in this file is the owner's mailing ZIP, not the property's";

export const CITY_MEASURES: CityMeasure[] = [
  { id: "tax-owed", familyKey: "city:delinquent-real-estate-tax-accounts", file: "delinquent real estate tax accounts", column: "Total Tax Principal", name: "back tax owed", things: "accounts", unit: "dollars", summable: true, splits: ["Ald Dist", "Levy Year"], date: null, namesPeople: true, skipZero: false, caveat: `${MAILING_ZIP}; aldermanic district is where the property is.` },
  { id: "pp-tax-owed", familyKey: "city:delinquent-personal-property-tax-accounts", file: "delinquent personal property tax accounts", column: "Total Tax Principal", name: "back personal property tax owed", things: "accounts", unit: "dollars", summable: true, splits: ["Levy Year"], date: null, namesPeople: true, skipZero: false, caveat: `${MAILING_ZIP}.` },
  { id: "gross-pay", familyKey: "city:city-employee-salary-data", file: "City employee pay", column: "Total Gross", name: "gross pay", things: "employees", unit: "dollars", summable: true, splits: ["Department", "Job Title", "Full/Part"], date: null, namesPeople: true, skipZero: true, caveat: "Gross pay is what each employee was paid in the file's period; part-time and partial-year employees are included unless filtered out." },
  { id: "hourly-rate", familyKey: "city:city-employee-salary-data", file: "City employee pay", column: "Hourly Rate", name: "hourly pay rate", things: "employees", unit: "dollars per hour", summable: false, splits: ["Department", "Job Title", "Full/Part"], date: null, namesPeople: true, skipZero: true, caveat: "Hourly rate is each employee's rate of pay, not their total earnings." },
  { id: "sale-price", familyKey: "city:property-sales-data", file: "property sales", column: "Sale_price", name: "sale price", things: "sales", unit: "dollars", summable: true, splits: ["District", "PropType"], date: "Sale_date", namesPeople: false, skipZero: true, caveat: "Sale prices cover the sales in the City's file; property type and district come from the City's records." },
  { id: "assessed-value", familyKey: "city:master-property-file-mprop", file: "Master Property File (assessed values)", column: "C_A_TOTAL", name: "total assessed value", things: "properties", unit: "dollars", summable: true, splits: ["GEO_ALDER"], date: null, namesPeople: false, skipZero: false, caveat: "Assessed value is the City's figure for property taxes, not what a property would sell for." },
];

export const measuresFor = (familyKey: string) => CITY_MEASURES.filter((m) => m.familyKey === familyKey);
export const MEASURE_FILES = [...new Set(CITY_MEASURES.map((m) => m.file))];
```

- [ ] **Step 4: Run it.** `npx vitest run tests/lib/cityMeasures.test.ts`. Expected: PASS, 3 tests.

- [ ] **Step 5: Commit.**

```bash
git add convex/lib/cityMeasures.ts tests/lib/cityMeasures.test.ts
git commit -m "feat: the approved City money columns Ask may total

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 2: The measure query

**Files:**
- Create: `convex/lib/measureSql.ts`
- Test: `tests/lib/measureSql.test.ts`

**Interfaces:**
- Consumes: from Task 1, `CityMeasure`. From `citySql.ts`: `RID`, `lit`, `isDay`, `addDays`, `human`, `valueFilter`, `MAX_GROUPS`. From `cityProfile.ts`: `quoteId`, `CityProfile`. From `spanSql.ts`: `readDate`.
- Produces:
  - `type MeasureArgs = { from?: string; to?: string; filters?: { column: string; values?: string[] }[]; groupBy?: string }`
  - `type MeasureBuilt = { ok: true; groupSql: string | null; allSql: string; period: string; filterLabels: string[]; groupLabel: string | null } | { ok: false; status: "bad-dates"; from: string; to: string } | { ok: false; status: "bad-column"; column: string; columns: string[] } | { ok: false; status: "choose"; column: string; asked: string; choices: string[] }`
  - `moneyValue(column: string): string`
  - `buildMeasure(p: CityProfile, m: CityMeasure, a: MeasureArgs, today: string): MeasureBuilt`

- [ ] **Step 1: Write the failing test.** Create `tests/lib/measureSql.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { CityProfile } from "../../convex/lib/cityProfile";
import { CITY_MEASURES } from "../../convex/lib/cityMeasures";
import { buildMeasure, moneyValue } from "../../convex/lib/measureSql";

const RID = "562e3c33-d7c0-4fa2-b7da-6aa31026ae53";
const by = (id: string) => CITY_MEASURES.find((m) => m.id === id)!;
const base = (over: Partial<CityProfile> = {}): CityProfile => ({
  familyKey: "city:city-employee-salary-data", resourceId: RID, columns: [], dateColumn: null, districtColumns: [],
  categories: [{ column: "Department", values: [{ value: "POLICE DEPARTMENT", count: 2569 }] }, { column: "Full/Part", values: [{ value: "Full Time", count: 8000 }, { value: "Part Time", count: 900 }] }],
  rowCount: 9057, minDate: null, maxDate: null, namesPeople: true, signature: "", updatedAt: 0, ...over,
});
const ok = (b: ReturnType<typeof buildMeasure>) => { if (!b.ok) throw new Error(`refused: ${b.status}`); return b; };
const TODAY = "2026-10-12";

describe("reading money", () => {
  it("strips $, commas and spaces, and casts only inside the number guard", () => {
    expect(moneyValue("Total Gross")).toBe(`CASE WHEN regexp_replace("Total Gross", '[$, ]', '', 'g') ~ '^-?[0-9]+([.][0-9]+)?$' THEN regexp_replace("Total Gross", '[$, ]', '', 'g')::float END`);
  });
});

describe("the measure query", () => {
  it("returns records, total, median, average, unreadable and zeros for the whole file", () => {
    const b = ok(buildMeasure(base(), by("gross-pay"), {}, TODAY));
    expect(b.groupSql).toBeNull();
    expect(b.allSql).toContain("SUM(CASE WHEN v IS NOT NULL AND v <> 0 THEN 1 ELSE 0 END) AS n");
    expect(b.allSql).toContain("SUM(CASE WHEN v IS NOT NULL AND v <> 0 THEN v END) AS total");
    expect(b.allSql).toContain("percentile_cont(0.5) WITHIN GROUP (ORDER BY CASE WHEN v IS NOT NULL AND v <> 0 THEN v END) AS median");
    expect(b.allSql).toContain("AVG(CASE WHEN v IS NOT NULL AND v <> 0 THEN v END) AS average");
    expect(b.allSql).toContain("SUM(CASE WHEN bad THEN 1 ELSE 0 END) AS unreadable");
    expect(b.allSql).toContain("SUM(CASE WHEN v = 0 THEN 1 ELSE 0 END) AS zeros");
    expect(b.allSql).toContain(`FROM "${RID}"`);
    expect(b.period).toBe("all records");
  });
  it("keeps zeros for a measure that doesn't skip them", () => {
    expect(ok(buildMeasure(base({ familyKey: "city:delinquent-real-estate-tax-accounts" }), by("tax-owed"), {}, TODAY)).allSql).toContain("SUM(CASE WHEN v IS NOT NULL THEN 1 ELSE 0 END) AS n");
  });
  it("groups by an allowed split, most records first, and filters by profiled values inside", () => {
    const b = ok(buildMeasure(base(), by("gross-pay"), { groupBy: "department", filters: [{ column: "Full/Part", values: ["full time"] }] }, TODAY));
    expect(b.groupSql).toContain(`"Department" AS g`);
    expect(b.groupSql).toContain("GROUP BY g ORDER BY n DESC LIMIT 24");
    expect(b.groupSql).toContain(`WHERE "Full/Part" IN ('Full Time')) s`);
    expect(b.groupLabel).toBe("Department");
    expect(b.filterLabels).toEqual(["Full Time"]);
  });
  it("refuses a split that isn't on the measure's list, offering the allowed ones", () => {
    expect(buildMeasure(base(), by("gross-pay"), { groupBy: "Name" }, TODAY)).toMatchObject({ ok: false, status: "bad-column", columns: ["Department", "Job Title", "Full/Part"] });
  });
  it("groups and filters by year through the date reader when the measure has a date column", () => {
    const sales = base({ familyKey: "city:property-sales-data", namesPeople: false, categories: [] });
    const b = ok(buildMeasure(sales, by("sale-price"), { groupBy: "year", from: "2025-01-01" }, TODAY));
    expect(b.groupSql).toContain(`to_char(d, 'YYYY') AS g`);
    expect(b.groupSql).toContain(`to_timestamp("Sale_date", 'MM/DD/YYYY')::timestamp END AS d`);
    expect(b.groupSql).toContain("ORDER BY g DESC");
    expect(b.allSql).toContain(") s WHERE d >= '2025-01-01'");
    expect(b.period).toBe("since Jan 1, 2025");
    expect(buildMeasure(sales, by("sale-price"), { groupBy: "Nope" }, TODAY)).toMatchObject({ ok: false, status: "bad-column", columns: ["District", "PropType", "year"] });
  });
  it("refuses a period when the measure has no date column", () => {
    expect(buildMeasure(base(), by("gross-pay"), { from: "2025-01-01" }, TODAY)).toMatchObject({ ok: false, status: "bad-dates" });
    expect(buildMeasure(base(), by("gross-pay"), { groupBy: "year" }, TODAY)).toMatchObject({ ok: false, status: "bad-column" });
  });
  it("keeps the property file to its current assessment, like counts", () => {
    const mprop = base({ familyKey: "city:master-property-file-mprop", namesPeople: false, snapshot: true, currentColumn: "YR_ASSMT", categories: [{ column: "YR_ASSMT", values: [{ value: "2026", count: 159949 }] }] });
    const b = ok(buildMeasure(mprop, by("assessed-value"), { groupBy: "GEO_ALDER" }, TODAY));
    expect(b.allSql).toContain(`WHERE "YR_ASSMT" = '2026'`);
    expect(b.period).toBe("2026 assessment");
  });
  it("never writes what the City's server or its firewall refuses", () => {
    const sales = base({ familyKey: "city:property-sales-data", namesPeople: false, categories: [] });
    const all = [buildMeasure(base(), by("gross-pay"), { groupBy: "Department" }, TODAY), buildMeasure(sales, by("sale-price"), { groupBy: "year", from: "2025-01-01" }, TODAY)]
      .map((b) => { const x = ok(b); return `${x.groupSql} ${x.allSql}`; }).join(" ");
    for (const banned of ["FILTER", "trim(", "extract(", "left(", "= 1 AND"]) expect(all).not.toContain(banned);
  });
});
```

- [ ] **Step 2: Run it.** `npx vitest run tests/lib/measureSql.test.ts`. Expected: FAIL, cannot resolve `../../convex/lib/measureSql`.

- [ ] **Step 3: Implement.** Create `convex/lib/measureSql.ts`:

```ts
import type { CityMeasure } from "./cityMeasures";
import type { CityProfile } from "./cityProfile";
import { quoteId } from "./cityProfile";
import { addDays, human, isDay, lit, MAX_GROUPS, RID, valueFilter } from "./citySql";
import { readDate } from "./spanSql";

// Totals, medians and averages of one approved money column (spec 2026-10-12-city-measures-design.md §5–6). Shape
// proven live on 2026-10-12 for all six measures: an inner SELECT reads the value once per row, the outer one groups
// and measures. Money is text ("128,459.22 "), so $, commas and spaces are stripped before the number check.
export type MeasureArgs = { from?: string; to?: string; filters?: { column: string; values?: string[] }[]; groupBy?: string };
export type MeasureBuilt =
  | { ok: true; groupSql: string | null; allSql: string; period: string; filterLabels: string[]; groupLabel: string | null }
  | { ok: false; status: "bad-dates"; from: string; to: string }
  | { ok: false; status: "bad-column"; column: string; columns: string[] }
  | { ok: false; status: "choose"; column: string; asked: string; choices: string[] };

const NUMBER = "^-?[0-9]+([.][0-9]+)?$";
const absent = (s: string | undefined) => !s || !s.trim();
const cleaned = (c: string) => `regexp_replace(${quoteId(c)}, '[$, ]', '', 'g')`;
export const moneyValue = (c: string) => `CASE WHEN ${cleaned(c)} ~ ${lit(NUMBER)} THEN ${cleaned(c)}::float END`;

export function buildMeasure(p: CityProfile, m: CityMeasure, a: MeasureArgs, today: string): MeasureBuilt {
  if (!RID.test(p.resourceId)) throw new Error("Not a CKAN resource id");
  const table = quoteId(p.resourceId);
  const askedFrom = absent(a.from) ? undefined : a.from!;
  const askedTo = absent(a.to) ? undefined : a.to!;
  if (askedFrom || askedTo) {
    // A period needs a date; a file without one refuses rather than quietly measuring everything.
    if (!m.date || (askedFrom && !isDay(askedFrom)) || (askedTo && !isDay(askedTo)) || (askedFrom && askedTo && askedFrom > askedTo)) {
      return { ok: false, status: "bad-dates", from: a.from ?? "", to: a.to ?? "" };
    }
  }

  const inner: string[] = [];
  const filterLabels: string[] = [];
  let period = askedFrom && askedTo ? `${human(askedFrom)} – ${human(askedTo)}` : askedFrom ? `since ${human(askedFrom)}` : askedTo ? `through ${human(askedTo)}` : "all records";
  // A snapshot file (the property file) keeps its current assessment only, as counts do.
  const current = p.snapshot && p.currentColumn ? p.categories.find((c) => c.column === p.currentColumn)?.values[0]?.value : undefined;
  if (current && p.currentColumn) {
    inner.push(`${quoteId(p.currentColumn)} = ${lit(current)}`);
    if (period === "all records") period = `${current} assessment`;
  }
  for (const f of a.filters ?? []) {
    const r = valueFilter(p, f);
    if (!r.ok) return r;
    inner.push(r.where);
    filterLabels.push(...r.labels);
  }

  const allowed = [...m.splits, ...(m.date ? ["year"] : [])];
  let g: string | null = null;
  let key: string | null = null;
  let groupLabel: string | null = null;
  if (a.groupBy?.trim()) {
    const asked = a.groupBy.trim().toLowerCase();
    const split = allowed.find((s) => s.toLowerCase() === asked);
    if (!split) return { ok: false, status: "bad-column", column: a.groupBy, columns: allowed };
    if (split === "year") { key = "to_char(d, 'YYYY')"; groupLabel = "year"; }
    else { g = quoteId(split); key = "g"; groupLabel = split; }
  }

  const v = moneyValue(m.column);
  const d = m.date ? `, ${readDate(m.date)} AS d` : "";
  const innerSql = (grouped: boolean) =>
    `SELECT ${v} AS v, (${cleaned(m.column)} !~ ${lit(NUMBER)}) AS bad${grouped && g ? `, ${g} AS g` : ""}${d} FROM ${table}${inner.length ? ` WHERE ${inner.join(" AND ")}` : ""}`;
  const keep = m.skipZero ? "v IS NOT NULL AND v <> 0" : "v IS NOT NULL";
  const measures = [
    `SUM(CASE WHEN ${keep} THEN 1 ELSE 0 END) AS n`,
    `SUM(CASE WHEN ${keep} THEN v END) AS total`,
    `percentile_cont(0.5) WITHIN GROUP (ORDER BY CASE WHEN ${keep} THEN v END) AS median`,
    `AVG(CASE WHEN ${keep} THEN v END) AS average`,
    "SUM(CASE WHEN bad THEN 1 ELSE 0 END) AS unreadable",
    "SUM(CASE WHEN v = 0 THEN 1 ELSE 0 END) AS zeros",
  ].join(", ");
  const outer: string[] = [];
  if (askedFrom) outer.push(`d >= ${lit(askedFrom)}`);
  if (askedTo) outer.push(`d < ${lit(addDays(askedTo, 1))}`);
  const where = outer.length ? ` WHERE ${outer.join(" AND ")}` : "";
  const allSql = `SELECT ${measures} FROM (${innerSql(false)}) s${where}`;
  const groupSql = key ? `SELECT ${key} AS g, ${measures} FROM (${innerSql(true)}) s${where} GROUP BY g ORDER BY ${groupLabel === "year" ? "g DESC" : "n DESC"} LIMIT ${MAX_GROUPS}` : null;
  void today; // ponytail: kept for parity with buildCount/buildSpan; measures have no "today" window yet
  return { ok: true, groupSql, allSql, period, filterLabels, groupLabel };
}
```

- [ ] **Step 4: Run it.** `npx vitest run tests/lib/measureSql.test.ts && npx tsc --noEmit`. Expected: PASS, 9 tests, and no type errors.

- [ ] **Step 5: Commit.**

```bash
git add convex/lib/measureSql.ts tests/lib/measureSql.test.ts
git commit -m "feat: build the firewall-safe total/median query for an approved City measure

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 3: Shaping and small-group hiding

**Files:**
- Create: `convex/lib/measureShape.ts`
- Test: `tests/lib/measureShape.test.ts`

**Interfaces:**
- Consumes: `MAX_GROUPS` from `citySql.ts`.
- Produces:
  - `type MeasureGroup = { label: string; n: number; total: number | null; median: number | null; average: number | null; hidden: boolean }`
  - `type MeasureAll = { n: number; total: number | null; median: number | null; average: number | null; unreadable: number; zeros: number }`
  - `type MeasureOther = { n: number; total: number | null; hidden: boolean }`
  - `MIN_GROUP = 5`
  - `shapeMeasure(groupRows: Record<string, unknown>[] | null, allRow: Record<string, unknown> | undefined, o: { namesPeople: boolean; byYear: boolean }): { groups: MeasureGroup[]; other: MeasureOther | null; all: MeasureAll }`

- [ ] **Step 1: Write the failing test.** Create `tests/lib/measureShape.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { shapeMeasure } from "../../convex/lib/measureShape";

const row = (g: string | null, n: number | string, total: unknown, extra: Record<string, unknown> = {}) => ({ g, n, total, median: total, average: total, unreadable: "0", zeros: "0", ...extra });
const people = { namesPeople: true, byYear: false };

describe("shaping a measure", () => {
  it("reads the City's text as numbers and keeps a missing figure null", () => {
    const s = shapeMeasure([row("POLICE DEPARTMENT", "2082", "199778163.7")], row(null, "2082", "199778163.7", { unreadable: "3", zeros: "2" }), { namesPeople: false, byYear: false });
    expect(s.groups[0]).toEqual({ label: "POLICE DEPARTMENT", n: 2082, total: 199778163.7, median: 199778163.7, average: 199778163.7, hidden: false });
    expect(s.all).toMatchObject({ n: 2082, unreadable: 3, zeros: 2 });
    expect(shapeMeasure(null, row(null, "0", null), people).all.total).toBeNull();
  });
  it("hides groups under 5 in files that name people, and the next-smallest when only one is hidden", () => {
    const s = shapeMeasure([row("A", "40", "100"), row("B", "12", "50"), row("C", "3", "9")], row(null, "55", "159"), people);
    expect(s.groups.map((g) => [g.label, g.hidden])).toEqual([["A", false], ["B", true], ["C", true]]);
    expect(s.groups[2]).toMatchObject({ total: null, median: null, average: null });
    expect(s.groups[0].total).toBe(100);
  });
  it("hides nothing when two groups are already small, and nothing at all in files without people", () => {
    const two = shapeMeasure([row("A", "40", "100"), row("B", "2", "5"), row("C", "3", "9")], row(null, "45", "114"), people);
    expect(two.groups.map((g) => g.hidden)).toEqual([false, true, true]);
    expect(shapeMeasure([row("A", "1", "5")], row(null, "1", "5"), { namesPeople: false, byYear: false }).groups[0].hidden).toBe(false);
  });
  it("shows a blank value as '(blank)' and drops a year group with no year and no records", () => {
    expect(shapeMeasure([row(null, "8", "40")], row(null, "8", "40"), { namesPeople: false, byYear: false }).groups[0].label).toBe("(blank)");
    expect(shapeMeasure([row(null, "0", null), row("2025", "5580", "1821970233")], row(null, "5580", "1821970233"), { namesPeople: false, byYear: true }).groups.map((g) => g.label)).toEqual(["2025"]);
  });
  it("sums the cut-off rest as one line, hidden under 5 in files that name people", () => {
    const full = Array.from({ length: 24 }, (_, i) => row(`G${i}`, "10", "100"));
    expect(shapeMeasure(full, row(null, "250", "2600"), { namesPeople: false, byYear: false }).other).toEqual({ n: 10, total: 200, hidden: false });
    expect(shapeMeasure(full, row(null, "243", "2450"), people).other).toEqual({ n: 3, total: null, hidden: true });
    expect(shapeMeasure(full.slice(0, 3), row(null, "300", "3000"), people).other).toBeNull();
  });
});
```

- [ ] **Step 2: Run it.** `npx vitest run tests/lib/measureShape.test.ts`. Expected: FAIL, cannot resolve `../../convex/lib/measureShape`.

- [ ] **Step 3: Implement.** Create `convex/lib/measureShape.ts`:

```ts
import { MAX_GROUPS } from "./citySql";

export type MeasureGroup = { label: string; n: number; total: number | null; median: number | null; average: number | null; hidden: boolean };
export type MeasureAll = { n: number; total: number | null; median: number | null; average: number | null; unreadable: number; zeros: number };
export type MeasureOther = { n: number; total: number | null; hidden: boolean };
export const MIN_GROUP = 5; // groups under this many records are hidden in files that name people

const count = (x: unknown) => { const n = Number(x); return Number.isFinite(n) ? n : 0; };
const amount = (x: unknown) => (x === null || x === undefined || x === "" || !Number.isFinite(Number(x)) ? null : Number(x));

// The City's rows as numbers. In a file that names people, a group under 5 records loses its figures; when that hides
// exactly one group, the next-smallest hides too, so the shown groups can't be subtracted from the All row to recover it.
export function shapeMeasure(groupRows: Record<string, unknown>[] | null, allRow: Record<string, unknown> | undefined, o: { namesPeople: boolean; byYear: boolean }) {
  const a = allRow ?? {};
  const all: MeasureAll = { n: count(a.n), total: amount(a.total), median: amount(a.median), average: amount(a.average), unreadable: count(a.unreadable), zeros: count(a.zeros) };
  const raw = (groupRows ?? [])
    .filter((r) => !(o.byYear && (r.g === null || r.g === undefined) && count(r.n) === 0))
    .map((r) => ({ label: r.g === null || r.g === undefined || r.g === "" ? "(blank)" : String(r.g), n: count(r.n), total: amount(r.total), median: amount(r.median), average: amount(r.average) }));
  const hide = new Set<number>();
  if (o.namesPeople) {
    raw.forEach((g, i) => { if (g.n < MIN_GROUP) hide.add(i); });
    if (hide.size === 1 && raw.length > 1) {
      const next = raw.map((g, i) => ({ g, i })).filter(({ i }) => !hide.has(i)).sort((x, y) => x.g.n - y.g.n)[0];
      if (next) hide.add(next.i);
    }
  }
  const groups: MeasureGroup[] = raw.map((g, i) => (hide.has(i) ? { ...g, total: null, median: null, average: null, hidden: true } : { ...g, hidden: false }));
  let other: MeasureOther | null = null;
  if ((groupRows ?? []).length >= MAX_GROUPS) {
    const n = all.n - raw.reduce((s, g) => s + g.n, 0);
    if (n > 0) {
      const hidden = o.namesPeople && n < MIN_GROUP;
      const total = all.total === null ? null : all.total - raw.reduce((s, g) => s + (g.total ?? 0), 0);
      other = { n, total: hidden ? null : total, hidden };
    }
  }
  return { groups, other, all };
}
```

- [ ] **Step 4: Run it.** `npx vitest run tests/lib/measureShape.test.ts`. Expected: PASS, 5 tests.

- [ ] **Step 5: Commit.**

```bash
git add convex/lib/measureShape.ts tests/lib/measureShape.test.ts
git commit -m "feat: shape City measures, hiding small groups in files that name people

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 4: `countRecords` with `measure`

**Files:**
- Modify: `convex/city.ts` (the args, a `CountResult` union extension, `runMeasure`, the handler branch)
- Test: `convex/cityMeasures.test.ts`

**Interfaces:**
- Consumes: Tasks 1–3, `countContext` (it returns `key`), `datastoreSql`, `chicagoDay` and `ELECTIONS_NOTE`.
- Produces:
  - **New `countRecords` args:** `measure: v.optional(v.object({ id: v.string(), average: v.optional(v.boolean()) }))`.
  - **New `CountResult` members:**
    - `{ status: "measured"; code; name; measure: { id; name; unit; caveat; column; things; summable; skipZero; namesPeople; date: string | null }; groupBy: string | null; period: string; filters: string[]; groups: MeasureGroup[]; other: MeasureOther | null; all: MeasureAll; averageAsked: boolean; splits: string[] }`
    - `{ status: "no-measure"; code; name; files: string[] }`
    - `{ status: "choose-measure"; code; name; measures: { id: string; name: string }[] }`
  - **Changed:** `too-broad`'s `area` becomes optional.

- [ ] **Step 1: Write the failing test.** Create `convex/cityMeasures.test.ts`:

```ts
/// <reference types="vite/client" />
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { installFakeFetch } from "../tests/helpers/fakeFetch";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");
const reader = { subject: "u1", issuer: "test", tokenIdentifier: "test|u1" };
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
const fam = (key: string, code: string, name: string, topic = "City Services") => ({ key, code, name, kind: "dataset" as const, topic, keywords: [], places: ["City"], years: [], latestModified: "2025-10-01", baseSearchText: "", searchText: "", dictionaryTab: null, source: "city" as const, live: true });
const prof = (familyKey: string, resourceId: string, categories: { column: string; values: { value: string; count: number }[] }[], namesPeople: boolean) => ({ familyKey, resourceId, columns: [], dateColumn: null, districtColumns: [], categories, rowCount: 100, minDate: null, maxDate: null, namesPeople, signature: "s", updatedAt: 0 });

async function seed() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  await t.run(async (ctx) => {
    await ctx.db.insert("families", fam("city:city-employee-salary-data", "X36", "City Employee Salary Data"));
    await ctx.db.insert("cityProfiles", prof("city:city-employee-salary-data", "562e3c33-d7c0-4fa2-b7da-6aa31026ae53", [{ column: "Department", values: [{ value: "POLICE DEPARTMENT", count: 2569 }] }], true));
    await ctx.db.insert("families", fam("city:nibrs-crime-data", "P08", "NIBRS Crime Data", "Public Safety"));
    await ctx.db.insert("cityProfiles", prof("city:nibrs-crime-data", "87843297-a6fa-46d4-ba5d-cb342fb2d3bb", [], false));
    await ctx.db.insert("families", fam("city:2020-spring-election-results", "B05", "2020 Spring Election Results", "Elections"));
    await ctx.db.insert("cityProfiles", prof("city:2020-spring-election-results", "3e78f0b1-c195-483d-99ac-22158369c72f", [], false));
  });
  return t;
}
const all = [{ n: "8000", total: "600000000", median: "70000", average: "75000", unreadable: "0", zeros: "48" }];

describe("countRecords with a measure", () => {
  it("returns totals and medians by department, hiding small groups in a file that names people", async () => {
    const t = await seed();
    installFakeFetch({ citySql: (sql) => sql.includes("GROUP BY g") ? [{ g: "POLICE DEPARTMENT", n: "2082", total: "199778163.7", median: "99671.1", average: "95954.9", unreadable: "0", zeros: "0" }, { g: "ASSESSOR", n: "40", total: "3000000", median: "70000", average: "75000", unreadable: "0", zeros: "0" }, { g: "TINY", n: "2", total: "150000", median: "75000", average: "75000", unreadable: "0", zeros: "0" }] : all });
    const r = await t.withIdentity(reader).action(api.city.countRecords, { code: "x36", measure: { id: "gross-pay" }, groupBy: "Department" });
    expect(r).toMatchObject({ status: "measured", code: "X36", groupBy: "Department", averageAsked: false, measure: { id: "gross-pay", unit: "dollars", summable: true }, all: { n: 8000, zeros: 48 } });
    if (r.status !== "measured") throw new Error("expected measured");
    expect(r.groups.map((g) => [g.label, g.hidden])).toEqual([["POLICE DEPARTMENT", false], ["ASSESSOR", true], ["TINY", true]]);
  });
  it("names the files that have measures when this one has none, without asking the City", async () => {
    const t = await seed();
    const fake = installFakeFetch({ citySql: () => all });
    const r = await t.withIdentity(reader).action(api.city.countRecords, { code: "P08", measure: { id: "gross-pay" } });
    expect(r).toMatchObject({ status: "no-measure", code: "P08" });
    if (r.status !== "no-measure") throw new Error("expected no-measure");
    expect(r.files).toContain("City employee pay");
    expect(fake.calls.length).toBe(0);
  });
  it("offers the file's measures for a wrong id, and refuses a neighborhood", async () => {
    const t = await seed();
    installFakeFetch({ citySql: () => all });
    expect(await t.withIdentity(reader).action(api.city.countRecords, { code: "X36", measure: { id: "tax-owed" } })).toMatchObject({ status: "choose-measure", measures: [{ id: "gross-pay" }, { id: "hourly-rate" }] });
    expect(await t.withIdentity(reader).action(api.city.countRecords, { code: "X36", measure: { id: "gross-pay" }, neighborhood: "Harambee" })).toMatchObject({ status: "no-locations" });
  });
  it("still refuses election files", async () => {
    const t = await seed();
    installFakeFetch({ citySql: () => all });
    expect(await t.withIdentity(reader).action(api.city.countRecords, { code: "B05", measure: { id: "gross-pay" } })).toMatchObject({ status: "not-live", note: expect.stringContaining("Election results") });
  });
  it("says unavailable when the City fails, and too-broad when it times out", async () => {
    const t = await seed();
    installFakeFetch({ cityStatus: 403 });
    expect(await t.withIdentity(reader).action(api.city.countRecords, { code: "X36", measure: { id: "gross-pay" } })).toMatchObject({ status: "unavailable" });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("Timed out after 10s: https://data.milwaukee.gov/…"); }));
    expect(await t.withIdentity(reader).action(api.city.countRecords, { code: "X36", measure: { id: "gross-pay" } })).toMatchObject({ status: "too-broad" });
  });
});
```

- [ ] **Step 2: Run it.** `npx vitest run convex/cityMeasures.test.ts`. Expected: FAIL. The validator rejects the `measure` argument ("Object contains extra field `measure`"), or the status is `ok`.

- [ ] **Step 3: Implement.** In `convex/city.ts`:
- **Imports:**
  - `import { MEASURE_FILES, measuresFor } from "./lib/cityMeasures";`
  - `import { buildMeasure } from "./lib/measureSql";`
  - `import { shapeMeasure, type MeasureAll, type MeasureGroup, type MeasureOther } from "./lib/measureShape";`
- **`CountResult` union:**
  - change `| { status: "too-broad"; code: string; name: string; area: string }` to `area?: string`;
  - add these three members:

```ts
  | {
      status: "measured"; code: string; name: string;
      measure: { id: string; name: string; unit: "dollars" | "dollars per hour"; caveat: string; column: string; things: string; summable: boolean; skipZero: boolean; namesPeople: boolean; date: string | null };
      groupBy: string | null; period: string; filters: string[]; groups: MeasureGroup[]; other: MeasureOther | null; all: MeasureAll; averageAsked: boolean; splits: string[];
    }
  | { status: "no-measure"; code: string; name: string; files: string[] }
  | { status: "choose-measure"; code: string; name: string; measures: { id: string; name: string }[] }
```

- **Args:** add `measure: v.optional(v.object({ id: v.string(), average: v.optional(v.boolean()) }))` to `countRecords`' args.
- **Handler:** after the rate-limit line, add `if (args.measure) return runMeasure(ctx, { ...args, measure: args.measure });`.
- **The new function,** after `runCount`:

```ts
// A total / median / average of one approved money column (spec 2026-10-12-city-measures-design.md §6). Same gate and
// file lookup as counts; never rows, and small groups hidden in files that name people.
export async function runMeasure(ctx: ActionCtx, { code, neighborhood, measure, ...args }: CountInput & { measure: { id: string; average?: boolean } }): Promise<CountResult> {
  const wanted = code.trim().toUpperCase();
  const data: CountContext = await ctx.runQuery(internal.city.countContext, { code: wanted });
  if (!data) return { status: "not-found" as const, code: wanted };
  const { name, profile } = data;
  if (!data.city) return { status: "not-city" as const, code: data.code, name };
  if (data.topic === "Elections") return { status: "not-live" as const, code: data.code, name, note: ELECTIONS_NOTE };
  if (!profile || profile.rowCount === 0) return { status: "not-live" as const, code: data.code, name };
  const options = measuresFor(data.key);
  if (!options.length) return { status: "no-measure" as const, code: data.code, name, files: MEASURE_FILES };
  const m = options.find((x) => x.id === measure.id.trim());
  if (!m) return { status: "choose-measure" as const, code: data.code, name, measures: options.map(({ id, name: label }) => ({ id, name: label })) };
  if (neighborhood?.trim()) return { status: "no-locations" as const, code: data.code, name };
  const built = buildMeasure(profile, m, { ...args, filters: args.filters?.map(({ column, values }) => ({ column, values })) }, chicagoDay(Date.now()));
  if (!built.ok) {
    const { ok: _ok, ...refusal } = built;
    return { ...refusal, code: data.code, name };
  }
  try {
    const [groupRows, allRows] = await Promise.all([
      built.groupSql ? datastoreSql<Record<string, unknown>>(built.groupSql) : Promise.resolve(null),
      datastoreSql<Record<string, unknown>>(built.allSql),
    ]);
    const shaped = shapeMeasure(groupRows, allRows[0], { namesPeople: m.namesPeople, byYear: built.groupLabel === "year" });
    return {
      status: "measured" as const, code: data.code, name,
      measure: { id: m.id, name: m.name, unit: m.unit, caveat: m.caveat, column: m.column, things: m.things, summable: m.summable, skipZero: m.skipZero, namesPeople: m.namesPeople, date: m.date },
      groupBy: built.groupLabel, period: built.period, filters: built.filterLabels, ...shaped,
      averageAsked: Boolean(measure.average), splits: [...m.splits, ...(m.date ? ["year"] : [])],
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`City measure failed for ${data.code}: ${message}`);
    return /Timed out/.test(message) ? { status: "too-broad" as const, code: data.code, name } : { status: "unavailable" as const, code: data.code, name };
  }
}
```

If `main` already has `EMPTY_FILE_NOTE` from PR #28 when this task runs (rebase first), split the `rowCount === 0` check in `runMeasure` the same way and pass `note: EMPTY_FILE_NOTE`. Then run `npx convex codegen`. If `tsc` reports that a `too-broad` consumer reads `r.area` as a required string (`ui/components/AskCards.tsx`), make that consumer handle `undefined`. Task 8 owns the card text; for now, change only the type use the compiler names.

- [ ] **Step 4: Run it.** `npx vitest run convex/cityMeasures.test.ts convex/city.test.ts --no-file-parallelism && npx tsc --noEmit`. Expected: PASS (the new tests, plus the old count tests unchanged), and no type errors.

- [ ] **Step 5: Commit.**

```bash
git add convex/city.ts convex/cityMeasures.test.ts convex/_generated/api.d.ts ui/components/AskCards.tsx
git commit -m "feat: countRecords totals an approved City measure, behind the same gate as counts

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 5: Ask learns `measure`

**Files:**
- Modify: `lib/ask/tools.ts` (`countParams.measure`, the `AskBackend.count` type, the description)
- Modify: `lib/ask/prompt.ts` (one rule)
- Modify: `lib/ask/model.ts` (the scripted "how much" question)
- Test: `tests/ui/askTools.test.ts` (append)

**Interfaces:**
- Consumes: Task 1's `CITY_MEASURES`; Task 4's `measure` arg.
- Produces: `countParams.measure`, a zod `{ id: string; average?: boolean }` (optional), and `measureSentence(): string`.

- [ ] **Step 1: Write the failing test.** Append to `tests/ui/askTools.test.ts`, and add `measureSentence` to its import from `../../lib/ask/tools`:

```ts
describe("City measures", () => {
  it("lets countRecords take a measure, and its description lists every approved measure", () => {
    const tool = askTools(backend({})).find((t) => t.name === "countRecords")!;
    const shape = (tool.parameters as { shape: Record<string, unknown> }).shape;
    expect(shape.measure).toBeDefined();
    for (const id of ["tax-owed", "pp-tax-owed", "gross-pay", "hourly-rate", "sale-price", "assessed-value"]) expect(tool.description).toContain(id);
    expect(measureSentence()).toContain("Never sum");
  });
});
```

- [ ] **Step 2: Run it.** `npx vitest run tests/ui/askTools.test.ts`. Expected: FAIL, `measureSentence` is not exported or `shape.measure` is undefined.

- [ ] **Step 3: Implement.** In `lib/ask/tools.ts`:
- Add `import { CITY_MEASURES } from "../../convex/lib/cityMeasures";`.
- In `countParams`, after `neighborhood`, add:

```ts
  measure: z.object({
    id: z.string().max(40).describe("An approved measure id from the list in this tool's description"),
    average: z.boolean().optional().describe("Only when the person asks for an average"),
  }).optional().describe("Total, median (and average if asked) of one approved money column instead of a count"),
```

- In `AskBackend`, change the `count` argument type to `z.infer<typeof countParams>`. This replaces the inline object type, so `measure` flows through. If `withoutCells`' call site needs a cast, use `as Parameters<AskBackend["count"]>[0]`, as the existing `execute` does.
- After `spanDescription`, add:

```ts
// Generated from the approved measures, so Ask's list can't drift from what the tool totals.
export function measureSentence(): string {
  const list = CITY_MEASURES.map((m) => `${m.file}: ${m.name} (measure ${m.id}${m.summable ? "" : ", median and average only"}; split by ${[...m.splits, ...(m.date ? ["year"] : [])].join(", ")})`);
  return ` For "how much", "total", "median", "average", "pay" or "owed" questions, pass measure with one of these approved measures instead of counting: ${list.join("; ")}. Set average only when the person asks for an average. Never sum or average any other column yourself; if it returns no-measure, say the file's numbers aren't set up to be totaled.`;
}
```

- Append ` + measureSentence()` to the end of the `countRecords` tool's `description` string.

In `lib/ask/prompt.ts`, after the line that starts `- If countRecords says a dataset can't be counted live`, add:

```ts
- "How much", "total", "median", "average", "typical", "pay", "earn", "owed" and "sale price" questions about City files use countRecords with measure (an approved measure id), never a plain count: back property tax owed, City employee pay, property sale prices, total assessed value. The card carries every figure; don't restate them. Ask for the average only when the person did. Groups with fewer than 5 records are hidden in files that name people; never try to work out a hidden figure.
```

In `lib/ask/model.ts`:
- Extend the keyword comment with `"how much" → searchCatalog "delinquent real estate tax", then countRecords with measure tax-owed by "Ald Dist";`.
- After the `"how long"` block, add:

```ts
      if (question.includes("how much") && searched?.output) {
        const v = searched.output.type === "json" ? searched.output.value : JSON.parse(String(searched.output.value));
        const rows = (v as { rows?: { code: string; name: string }[] }).rows ?? [];
        const code = rows.find((r) => /delinquent real estate/i.test(r.name))?.code ?? rows[0]?.code ?? "H19";
        return { stream: simulateReadableStream({ chunks: [{ type: "stream-start" as const, warnings: [] }, call("countRecords", { code, measure: { id: "tax-owed" }, groupBy: "Ald Dist" }), finish("tool-calls")] }) };
      }
```

- Add `question.includes("how much") ? call("searchCatalog", { query: "delinquent real estate tax accounts" }) :` as the first alternative in the first-step chain (before `question.includes("how long")`).

- [ ] **Step 4: Run it.** `npx vitest run tests/ui/askTools.test.ts tests/ui/ask.test.ts tests/ui/askPrompt.test.ts && npx tsc --noEmit`. Expected: PASS, and no type errors.

- [ ] **Step 5: Commit.**

```bash
git add lib/ask/tools.ts lib/ask/prompt.ts lib/ask/model.ts tests/ui/askTools.test.ts
git commit -m "feat: Ask learns to total approved City measures for how-much questions

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 6: The card's words, export, follow-ups and choices

**Files:**
- Create: `ui/lib/measureText.ts`
- Modify: `ui/lib/cardExport.ts` (append `measureExport`), `ui/lib/nextQuestions.ts` (append `measureFollowUps`), `ui/lib/refusalChoices.ts` (append `measureChoices`)
- Test: `tests/ui/measureText.test.ts`

**Interfaces:**
- Consumes: Task 4's `measured` result (as `MeasureOk = Extract<CountResult, { status: "measured" }>`, with `CountResult` from `@/lib/ask/tools`); C1's `CardExport`, `Ctx`, `safeName`, `sourceNote` and `exported`.
- Produces:
  - `money(v: number | null, unit, style: "table" | "sentence"): string`
  - `measureTitle(r): string`
  - `measureSummary(r): string`
  - `measureNotes(r): string[]`
  - `MEASURE_HIDDEN = "fewer than 5 records"`
  - `measureExport(r, ctx): CardExport`
  - `measureFollowUps(r): FollowUp[]`
  - `measureChoices(r): FollowUp[]`

- [ ] **Step 1: Write the failing test.** Create `tests/ui/measureText.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { measureExport } from "../../ui/lib/cardExport";
import { measureFollowUps } from "../../ui/lib/nextQuestions";
import { measureChoices } from "../../ui/lib/refusalChoices";
import { measureNotes, measureSummary, measureTitle, money } from "../../ui/lib/measureText";

const base = {
  status: "measured" as const, code: "H19", name: "Delinquent Real Estate Tax Accounts", groupBy: "Ald Dist", period: "all records", filters: [], averageAsked: false, splits: ["Ald Dist", "Levy Year"],
  measure: { id: "tax-owed", name: "back tax owed", unit: "dollars" as const, caveat: "ZIP in this file is the owner's mailing ZIP, not the property's; aldermanic district is where the property is.", column: "Total Tax Principal", things: "accounts", summable: true, skipZero: false, namesPeople: true, date: null },
  groups: [
    { label: "15", n: 3407, total: 10230710.4, median: 2228.9, average: 3002.9, hidden: false },
    { label: "6", n: 3123, total: 9908916.4, median: 2295.4, average: 3172.9, hidden: false },
    { label: "99", n: 3, total: null, median: null, average: null, hidden: true },
  ],
  other: null, all: { n: 17500, total: 52000000, median: 2400, average: 3100, unreadable: 0, zeros: 0 },
};
const ctx = { origin: "https://almanac.test", date: "October 12, 2026" };

describe("money", () => {
  it("writes dollars and hourly rates the way a reporter would", () => {
    expect(money(10230710.4, "dollars", "table")).toBe("$10,230,710");
    expect(money(10230710.4, "dollars", "sentence")).toBe("$10.2 million");
    expect(money(4434889421, "dollars", "sentence")).toBe("$4.4 billion");
    expect(money(80.71, "dollars", "table")).toBe("$80.71");
    expect(money(41.418125, "dollars per hour", "table")).toBe("$41.42");
    expect(money(41.418125, "dollars per hour", "sentence")).toBe("$41.42 an hour");
    expect(money(null, "dollars", "table")).toBe("—");
  });
});

describe("the measure card's words", () => {
  it("titles the card and states the total and median, naming no hidden group", () => {
    expect(measureTitle(base)).toBe("Delinquent Real Estate Tax Accounts · back tax owed · by Ald Dist");
    expect(measureSummary(base)).toBe("17,500 accounts total $52.0 million; the median is $2,400. The largest total is 15 ($10.2 million); the highest median is 6 ($2,295).");
  });
  it("never states a total for a rate", () => {
    const rate = { ...base, groupBy: null, groups: [], measure: { ...base.measure, id: "hourly-rate", name: "hourly pay rate", unit: "dollars per hour" as const, things: "employees", summable: false }, all: { ...base.all, n: 8000, total: 330000, median: 34.5 } };
    expect(measureSummary(rate)).toBe("Across 8,000 employees, the median is $34.50 an hour.");
  });
  it("notes the caveat, hidden groups and a far-off average when asked", () => {
    expect(measureNotes(base)).toEqual([base.measure.caveat, "Some groups have fewer than 5 records, so their figures are hidden to protect individuals.", "Period: all records."]);
    const skewed = { ...base, averageAsked: true, all: { ...base.all, median: 2000, average: 3100, zeros: 4, unreadable: 2 }, measure: { ...base.measure, skipZero: true } };
    expect(measureNotes(skewed)).toEqual([
      base.measure.caveat,
      "2 records had no readable amount and were left out.",
      "4 records with $0 were left out.",
      "Some groups have fewer than 5 records, so their figures are hidden to protect individuals.",
      "A few large values pull the average away from the typical one; the median is the better guide.",
      "Period: all records.",
    ]);
  });
});

describe("measure export, follow-ups and choices", () => {
  it("exports unrounded figures, hidden groups as empty cells, and no Total column for a rate", () => {
    const e = measureExport(base, ctx);
    expect(e.csv.head).toEqual(["Ald Dist", "Records", "Total (dollars)", "Median (dollars)"]);
    expect(e.csv.rows[0]).toEqual(["15", 3407, 10230710.4, 2228.9]);
    expect(e.csv.rows[2]).toEqual(["99 (fewer than 5 records)", 3, null, null]);
    expect(e.csv.rows.at(-1)).toEqual(["All", 17500, 52000000, 2400]);
    expect(e.notes).toContain("Source: City of Milwaukee, H19 Delinquent Real Estate Tax Accounts: https://almanac.test/d/H19");
    const rate = measureExport({ ...base, measure: { ...base.measure, summable: false, unit: "dollars per hour" as const } }, ctx);
    expect(rate.csv.head).toEqual(["Ald Dist", "Records", "Median (dollars per hour)"]);
  });
  it("offers another split and the average, and turns choose-measure into buttons", () => {
    expect(measureFollowUps(base).map((f) => f.label)).toEqual(["BY LEVY YEAR", "SHOW THE AVERAGE"]);
    expect(measureFollowUps(base)[0].question).toBe("How much back tax owed in Delinquent Real Estate Tax Accounts (H19), by Levy Year?");
    expect(measureChoices({ status: "choose-measure", code: "X36", name: "City Employee Salary Data", measures: [{ id: "gross-pay", name: "gross pay" }] })).toEqual([{ label: "gross pay", question: "How much gross pay in City Employee Salary Data (X36)? (measure gross-pay)" }]);
  });
});
```

- [ ] **Step 2: Run it.** `npx vitest run tests/ui/measureText.test.ts`. Expected: FAIL, cannot resolve `../../ui/lib/measureText`.

- [ ] **Step 3: Implement.** Create `ui/lib/measureText.ts`:

```ts
import type { CountResult } from "@/lib/ask/tools";

// The measure card's words (spec 2026-10-12-city-measures-design.md §7), written by code from the server's numbers.
export type MeasureOk = Extract<CountResult, { status: "measured" }>;
type Unit = MeasureOk["measure"]["unit"];
export const MEASURE_HIDDEN = "fewer than 5 records";

export function money(v: number | null, unit: Unit, style: "table" | "sentence"): string {
  if (v === null || !Number.isFinite(v)) return "—";
  if (unit === "dollars per hour") return `$${v.toFixed(2)}${style === "sentence" ? " an hour" : ""}`;
  const a = Math.abs(v);
  if (style === "sentence" && a >= 1e9) return `$${(v / 1e9).toFixed(1)} billion`;
  if (style === "sentence" && a >= 1e6) return `$${(v / 1e6).toFixed(1)} million`;
  return a >= 1000 ? `$${Math.round(v).toLocaleString("en-US")}` : `$${v.toFixed(2)}`;
}

export const measureTitle = (r: MeasureOk) => [r.name, r.measure.name, ...(r.groupBy ? [`by ${r.groupBy}`] : [])].join(" · ");

export function measureSummary(r: MeasureOk): string {
  const m = r.measure;
  const s = (v: number | null) => money(v, m.unit, "sentence");
  const n = r.all.n.toLocaleString("en-US");
  const head = m.summable ? `${n} ${m.things} total ${s(r.all.total)}; the median is ${s(r.all.median)}.` : `Across ${n} ${m.things}, the median is ${s(r.all.median)}.`;
  const shown = r.groups.filter((g) => !g.hidden);
  if (!r.groupBy || shown.length < 2) return head;
  const top = (k: "total" | "median") => [...shown].sort((a, b) => (b[k] ?? -Infinity) - (a[k] ?? -Infinity))[0];
  const med = top("median");
  const parts = [...(m.summable ? [`The largest total is ${top("total").label} (${s(top("total").total)})`] : []), `the highest median is ${med.label} (${s(med.median)})`];
  const sentence = parts.join("; ");
  return `${head} ${sentence[0].toUpperCase()}${sentence.slice(1)}.`;
}

export function measureNotes(r: MeasureOk): string[] {
  const a = r.all;
  const n = (x: number) => x.toLocaleString("en-US");
  const far = r.averageAsked && a.average !== null && a.median !== null && a.median !== 0 && Math.abs(a.average - a.median) > 0.25 * Math.abs(a.median);
  return [
    r.measure.caveat,
    ...(a.unreadable > 0 ? [`${n(a.unreadable)} records had no readable amount and were left out.`] : []),
    ...(r.measure.skipZero && a.zeros > 0 ? [`${n(a.zeros)} records with $0 were left out.`] : []),
    ...(r.groups.some((g) => g.hidden) || r.other?.hidden ? ["Some groups have fewer than 5 records, so their figures are hidden to protect individuals."] : []),
    ...(far ? ["A few large values pull the average away from the typical one; the median is the better guide."] : []),
    `Period: ${r.period}.`,
    ...(r.filters.length ? [`Only: ${r.filters.join(", ")}.`] : []),
  ];
}
```

Append to `ui/lib/cardExport.ts`, with `import { MEASURE_HIDDEN, measureNotes, measureSummary, measureTitle, money, type MeasureOk } from "./measureText";` at the top:

```ts
export function measureExport(r: MeasureOk, ctx: Ctx): CardExport {
  const m = r.measure, u = m.unit, avg = r.averageAsked;
  type Row = { label: string; n: number; total: number | null; median: number | null; average: number | null; hidden: boolean };
  const rows: Row[] = [
    ...r.groups,
    ...(r.other ? [{ label: "All other groups", n: r.other.n, total: r.other.total, median: null, average: null, hidden: r.other.hidden }] : []),
    { label: "All", n: r.all.n, total: r.all.total, median: r.all.median, average: r.all.average, hidden: false },
  ];
  const label = (g: Row) => (g.hidden ? `${g.label} (${MEASURE_HIDDEN})` : g.label);
  const t = (v: number | null, hidden: boolean) => (hidden ? MEASURE_HIDDEN : money(v, u, "table"));
  return {
    title: measureTitle(r),
    lines: [measureSummary(r)],
    csv: {
      head: [r.groupBy ?? "Group", "Records", ...(m.summable ? [`Total (${u})`] : []), `Median (${u})`, ...(avg ? [`Average (${u})`] : [])],
      rows: rows.map((g) => [label(g), g.n, ...(m.summable ? [g.total] : []), g.median, ...(avg ? [g.average] : [])]),
    },
    text: {
      head: [r.groupBy ?? "", "Records", ...(m.summable ? ["Total"] : []), "Median", ...(avg ? ["Average"] : [])],
      rows: rows.map((g) => [g.label, g.n.toLocaleString("en-US"), ...(m.summable ? [t(g.total, g.hidden)] : []), g.label === "All other groups" ? "" : t(g.median, g.hidden), ...(avg ? [g.label === "All other groups" ? "" : t(g.average, g.hidden)] : [])]),
    },
    notes: [...measureNotes(r), sourceNote("City of Milwaukee", r.code, r.name, ctx), exported(ctx)],
    filename: safeName([r.code, m.id, ...(r.groupBy ? [r.groupBy] : [])]),
  };
}
```

Append to `ui/lib/nextQuestions.ts`, with `import type { MeasureOk } from "./measureText";`:

```ts
const measureBase = (r: MeasureOk) => `How much ${r.measure.name} in ${r.name} (${r.code})`;
export function measureFollowUps(r: MeasureOk): FollowUp[] {
  const out: FollowUp[] = r.splits.filter((s) => s !== r.groupBy).slice(0, 2).map((s) => ({ label: `BY ${s.replace(/_/g, " ").toUpperCase()}`, question: `${measureBase(r)}, by ${s}?` }));
  if (!r.averageAsked) out.push({ label: "SHOW THE AVERAGE", question: `What is the average ${r.measure.name} in ${r.name} (${r.code})${r.groupBy ? `, by ${r.groupBy}` : ""}?` });
  return out.slice(0, MAX);
}
```

Append to `ui/lib/refusalChoices.ts`:

```ts
type MeasureRefusal = { status: string; code?: string; name?: string; measures?: { id: string; name: string }[]; columns?: string[] };
export function measureChoices(r: MeasureRefusal): FollowUp[] {
  const where = `${r.name ?? "this file"} (${r.code ?? ""})`;
  if (r.status === "choose-measure" && r.measures) return r.measures.slice(0, MAX).map((m) => ({ label: m.name, question: `How much ${m.name} in ${where}? (measure ${m.id})` }));
  if (r.status === "bad-column" && r.columns) return r.columns.slice(0, MAX).map((c) => ({ label: c, question: `How much in ${where}, by ${c}?` }));
  return [];
}
```

- [ ] **Step 4: Run it.** `npx vitest run tests/ui/measureText.test.ts tests/ui/cardExport.test.ts tests/ui/nextQuestions.test.ts tests/ui/refusalChoices.test.ts && npx tsc --noEmit`. Expected: PASS, and no type errors. If the summary test differs only in the "highest median" pick, check the fixture. Group "6" ($2,295.4) beats "15" ($2,228.9), so the expected sentence names 6.

- [ ] **Step 5: Commit.**

```bash
git add ui/lib/measureText.ts ui/lib/cardExport.ts ui/lib/nextQuestions.ts ui/lib/refusalChoices.ts tests/ui/measureText.test.ts
git commit -m "feat: the measure card's words, export, follow-ups and choices

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 7: The live check, then the development push

**Files:**
- Modify: `convex/city.ts` (append `checkMeasures`)
- Test: `convex/cityMeasures.test.ts` (append)

**Interfaces:**
- Consumes: Tasks 1–3, plus `internal.spans.profileFor`.
- Produces: `internal.city.checkMeasures`, an internal action returning `{ id: string; ok: boolean; error?: string; all?: MeasureAll }[]`.

- [ ] **Step 1: Write the failing test.** Append to `convex/cityMeasures.test.ts`, and add `internal` to its `./_generated/api` import:

```ts
describe("checkMeasures", () => {
  it("measures every approved entry that has a profile, and says which have none", async () => {
    const t = await seed();
    installFakeFetch({ citySql: () => all });
    const out = await t.action(internal.city.checkMeasures, {});
    expect(out).toHaveLength(6);
    expect(out.find((x) => x.id === "gross-pay")).toMatchObject({ ok: true, all: { n: 8000 } });
    expect(out.find((x) => x.id === "tax-owed")).toMatchObject({ ok: false, error: "no profile" });
  });
});
```

- [ ] **Step 2: Run it.** `npx vitest run convex/cityMeasures.test.ts`. Expected: FAIL, `internal.city.checkMeasures` is undefined.

- [ ] **Step 3: Implement.** In `convex/city.ts`, add `internalAction` to the `./_generated/server` import and `import { CITY_MEASURES } from "./lib/cityMeasures";` (merged into the existing import). Then append:

```ts
// The live check before a release: every approved measure, whole file, against the City's server. Read-only.
// Run with `npx convex run city:checkMeasures` (add --prod for the live site).
export const checkMeasures = internalAction({
  args: {},
  handler: async (ctx): Promise<{ id: string; ok: boolean; error?: string; all?: MeasureAll }[]> => {
    const out: { id: string; ok: boolean; error?: string; all?: MeasureAll }[] = [];
    for (const m of CITY_MEASURES) {
      const raw = await ctx.runQuery(internal.spans.profileFor, { familyKey: m.familyKey });
      if (!raw) { out.push({ id: m.id, ok: false, error: "no profile" }); continue; }
      const built = buildMeasure(withOverrides(raw), m, {}, chicagoDay(Date.now()));
      if (!built.ok) { out.push({ id: m.id, ok: false, error: built.status }); continue; }
      try {
        const rows = await datastoreSql<Record<string, unknown>>(built.allSql);
        out.push({ id: m.id, ok: true, all: shapeMeasure(null, rows[0], { namesPeople: m.namesPeople, byYear: false }).all });
      } catch (e) {
        out.push({ id: m.id, ok: false, error: e instanceof Error ? e.message : String(e) });
      }
    }
    return out;
  },
});
```

Run `npx convex codegen`.

- [ ] **Step 4: Run it.** `npx vitest run convex/cityMeasures.test.ts && npx tsc --noEmit`. Expected: PASS.

- [ ] **Step 5: Commit, then the development push and the live check.**

```bash
git add convex/city.ts convex/cityMeasures.test.ts convex/_generated/api.d.ts
git commit -m "feat: checkMeasures totals every approved City measure live, for the release check

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

**STOP: ask Tarik before the next command.** It changes the shared development backend.

```bash
npx convex dev --once
npx convex run city:checkMeasures
```

Expected: 6 entries, all `ok: true`, with the same order of magnitude as the planning probe:
- `tax-owed`: about 17,500 records, a total in the tens of millions;
- `gross-pay`: a median in the tens of thousands;
- `sale-price`: about 5,580 records, median near $240,000;
- `assessed-value`: a total in the tens of billions.

Record the six lines in the ledger. Any HTML/403 error is a firewall pattern: find it the way spec 2026-10-12-time-spans §2.1 did, and fix it with a test.

### Task 8: The card in Ask

**Files:**
- Modify: `ui/components/AskCards.tsx` (`MeasureCard`, the `countRecords` renderer branches, `too-broad` wording)
- Test: `e2e/ask.spec.ts` (append)

**Interfaces:**
- Consumes: Task 6's text, export, follow-ups and choices; C1's `ExportBar`; the existing `ProvenanceTag`, `OpenLink`, `FollowUps` and `styles.tractScroll`.
- Produces: `[data-card=measure]`, with `[data-summary]` and a scroll region labelled "…, scroll sideways for more".

- [ ] **Step 1: Write the failing browser test.** Append inside `test.describe("signed in", …)` in `e2e/ask.spec.ts`, after the time-span test:

```ts
  test("a how-much question draws a measure card with records, total and median", async ({ page }) => {
    test.skip(!(await page.request.get("https://data.milwaukee.gov/api/3/action/status_show").then((r) => r.ok()).catch(() => false)), "City API unreachable");
    await ask(page, "How much back property tax is owed, by aldermanic district?");
    const card = page.locator("[data-card=measure]:visible").first();
    await expect(card).toBeVisible({ timeout: 40_000 });
    await expect(card).toContainText("back tax owed · by Ald Dist");
    await expect(card.locator("thead")).toContainText("Records");
    await expect(card.locator("thead")).toContainText("Total");
    await expect(card.locator("thead")).toContainText("Median");
    await expect(card.locator("[data-summary]")).toContainText(/accounts total \$[\d.,]+ (million|billion)?/);
    await expect(card).toContainText("owner's mailing ZIP");
    await expect(card.getByRole("region", { name: /scroll sideways/ })).toBeVisible();
    await expect(card.locator("[data-export]").getByRole("button", { name: "CSV" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
```

- [ ] **Step 2: Run it.** Build and start on port 3100, then run `BASE_URL=http://localhost:3100 npx playwright test e2e/ask.spec.ts -g "how-much" --project=desktop` with `.env.local` sourced. Expected: FAIL, with no `[data-card=measure]`. The development backend has `measure` since Task 7; nothing draws it yet. Check that the failure is on the card, not on sign-in.

- [ ] **Step 3: Implement.** In `ui/components/AskCards.tsx`:
- **Imports:**
  - `measureExport` (`@/ui/lib/cardExport`);
  - `MEASURE_HIDDEN`, `measureNotes`, `measureSummary`, `measureTitle`, `money`, `type MeasureOk` (`@/ui/lib/measureText`);
  - `measureFollowUps` (`@/ui/lib/nextQuestions`);
  - `measureChoices` (`@/ui/lib/refusalChoices`).
- **Add, beside `CountCard`:**

```tsx
// A total / median of an approved City money column (spec 2026-10-12-city-measures-design.md §7): every figure comes
// from the City's server through code, never the AI; small groups are hidden in files that name people.
function MeasureCard({ r, onOpen }: { r: MeasureOk; onOpen: Open }) {
  const m = r.measure, avg = r.averageAsked;
  const cell = (v: number | null, hidden: boolean) => (hidden ? MEASURE_HIDDEN : money(v, m.unit, "table"));
  const rows = [
    ...r.groups.map((g) => ({ ...g, rest: false })),
    ...(r.other ? [{ label: "All other groups", n: r.other.n, total: r.other.total, median: null, average: null, hidden: r.other.hidden, rest: true }] : []),
  ];
  return (
    <figure className={styles.excerpt} data-card="measure">
      <figcaption className={styles.excerptTitle}>{measureTitle(r)} <ProvenanceTag source="CITY" /></figcaption>
      <p className={styles.tractSummary} data-summary>{measureSummary(r)}</p>
      <div className={styles.tractScroll} tabIndex={0} role="region" aria-label={`${measureTitle(r)}, scroll sideways for more`}>
        <table className={styles.excerptTable}>
          <thead>
            <tr>
              <th scope="col">{r.groupBy ?? ""}</th><th scope="col">Records</th>
              {m.summable && <th scope="col">Total</th>}<th scope="col">Median</th>{avg && <th scope="col">Average</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((g, i) => (
              <tr key={i}>
                <th scope="row">{g.label}</th><td>{g.n.toLocaleString("en-US")}</td>
                {m.summable && <td>{cell(g.total, g.hidden)}</td>}
                <td>{g.rest ? "" : cell(g.median, g.hidden)}</td>
                {avg && <td>{g.rest ? "" : cell(g.average, g.hidden)}</td>}
              </tr>
            ))}
            <tr>
              <th scope="row">All</th><td>{r.all.n.toLocaleString("en-US")}</td>
              {m.summable && <td>{money(r.all.total, m.unit, "table")}</td>}
              <td>{money(r.all.median, m.unit, "table")}</td>{avg && <td>{money(r.all.average, m.unit, "table")}</td>}
            </tr>
          </tbody>
        </table>
      </div>
      {measureNotes(r).map((n) => <p key={n} className={styles.source}>{n}</p>)}
      <OpenLink code={r.code} onOpen={onOpen} label="Open the data" />
      <ExportBar make={(ctx) => measureExport(r, ctx)} />
    </figure>
  );
}
```

- **In the `countRecords` renderer:**
  - Right after `if (!r) return <Failed />;`, add `if (r.status === "measured") return <><MeasureCard r={r} onOpen={onOpen} /><FollowUps items={measureFollowUps(r)} id={props.toolCallId} /></>;`.
  - Then add `if (r.status === "choose-measure") return <FollowUps pick items={measureChoices(r)} id={props.toolCallId} />;`.
  - Change the count `too-broad` line to `Too many {r.name} records{r.area ? ` in ${r.area}` : ""} to count at once; try a shorter period or a filter.`.
  - A `bad-column` from a measure falls through to the existing `countChoices` path. `no-measure` is said by the model.

- [ ] **Step 4: Run it.**
  - `npx tsc --noEmit && npx vitest run --no-file-parallelism`. Expected: all pass.
  - Rebuild, restart on port 3100, then run `BASE_URL=http://localhost:3100 npx playwright test e2e/ask.spec.ts -g "how-much|City count|how-long"` with `.env.local` sourced. Expected: PASS on desktop and phone.
  - Then screenshot the card on both (a throwaway spec, deleted after), look at it, and fix what you see before committing.

- [ ] **Step 5: Commit.**

```bash
git add ui/components/AskCards.tsx e2e/ask.spec.ts
git commit -m "feat: Ask draws a measure card with records, total, median and hidden small groups

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 9: Docs

**Files:**
- Create: `docs/decisions/034-city-measures.md`
- Modify: `ui/components/HowItWorks.tsx` (after the how-long paragraph)
- Modify: `DESIGN.md` (`### Totals` after `### How long`)
- Test: `e2e/how.spec.ts` (append)

**Interfaces:** none.

- [ ] **Step 1: Write the failing test.** Append to `e2e/how.spec.ts`:

```ts
test("it explains totals and hidden small groups", async ({ page }) => {
  await page.goto("/how-it-works");
  await expect(page.getByText(/groups of fewer than 5 records are hidden/)).toBeVisible();
});
```

- [ ] **Step 2: Run it.** Against a fresh build on port 3100: `BASE_URL=http://localhost:3100 npx playwright test e2e/how.spec.ts -g "totals" --project=desktop`. Expected: FAIL, text not found.

- [ ] **Step 3: Implement.** In `ui/components/HowItWorks.tsx`, after the how-long paragraph, add:

```tsx
            <p>
              Ask can also add up a few City money columns, like back property tax owed, City employee pay and property sale prices. It
              shows the total and the median (the middle value), and the average only when you ask for it. In files that name people,
              groups of fewer than 5 records are hidden so no one&apos;s figure can be singled out.
            </p>
```

Create `docs/decisions/034-city-measures.md`:

```markdown
# 034: Totals and medians from an approved list of City money columns

**Decision:** Ask can total, take the median of, and (when asked) average six hand-checked City money columns: back tax owed (real estate and personal property), City employee pay (gross and hourly), property sale prices, and total assessed value. Groups are hidden when they hold fewer than 5 records in files that name people.

**Why this came up:** "How much" questions (tax owed, what City employees earn, what homes sell for) are some of the most common accountability questions, and Ask could only count records. The money sits in text columns written three different ways, and some number-like columns (ZIPs, years, turnout percentages) must never be added up.

**Options:**
1. **An approved list** (chosen). Each entry names the column, its unit, the splits that make sense, its caveat, and whether the file names people. Cost: a new money question needs a list entry first.
2. **Any number-like column.** Cost: confident cards totaling ZIP codes, years or percentages.
3. **Elections in the same project.** Cost: every election file has different candidate columns; that work moved to the files-by-period project.

**What we chose and why (Tarik, 2026-10-12):** The list, with total and median on every card and the average only on request, because a few very large values pull an average away from what's typical. Groups under 5 records are hidden in files that name people. If that hides exactly one group, the next-smallest hides too, so no one can subtract the visible groups from the total to recover it. The hourly rate never shows a total.

**What we gave up:**
- Only six measures to start.
- No election results yet.
- Some detail is hidden for privacy (single-person job titles).
- The tax files' ZIP is the owner's mailing ZIP, so those files split by aldermanic district instead.

**How we'll know if this was right:** How-much questions get a card instead of "I can't". The totals match the City's own reports when checked. No card exposes one person's figure.

**What actually happened:**
```

In `DESIGN.md`, after the `### How long` section, add:

```markdown
### Totals
The measure card (`[data-card=measure]`) is a variant of the count card:
- **Title:** "{file} · {measure} · by {split}", with the CITY tag.
- **Summary sentence** written by code ("17,500 accounts total $52.0 million; the median is $2,400").
- **Table:** Group · Records · Total · Median (Average when asked) in a sideways-scroll region, then "All other groups" and All. The hourly rate has no Total column.
- **Hidden groups** read "fewer than 5 records" in files that name people.
- **Notes:** the measure's caveat, unreadable and $0 records, hidden groups, the average note, period and filters.
- **Then:** "Open the data", the export line, and follow-ups (BY {split}, SHOW THE AVERAGE).
- **Money:** "$10,230,710" in tables; "$10.2 million" in sentences; "$41.42 an hour".

Measures: `convex/lib/cityMeasures.ts`. Decision 034.
```

- [ ] **Step 4: Run it.** Rebuild, restart on port 3100, then run `BASE_URL=http://localhost:3100 npx playwright test e2e/how.spec.ts`. Expected: PASS, all tests.

- [ ] **Step 5: Commit.**

```bash
git add docs/decisions/034-city-measures.md ui/components/HowItWorks.tsx DESIGN.md e2e/how.spec.ts
git commit -m "docs: decision 034, How it works and DESIGN.md on City totals and medians

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```
