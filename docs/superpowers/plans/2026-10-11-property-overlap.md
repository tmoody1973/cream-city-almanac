# Property × Tract Overlap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ask answers property questions ("how many properties are assessed over $200,000", "do home values go with broadband") with counts by district, a tract map, and the existing tract cards: never an address or an owner.

**Architecture:**
- **Measures.** A pure module (`convex/lib/propertyMeasures.ts`) turns the City's Master Property File (H28, MPROP) into one exact value per census tract. The SQL is fixed text, validated numbers are the only inputs, and tract ids are padded to DYCU's GEOID.
- **Tract tools.** A thin Convex helper (`convex/property.ts`) recognises H28 in `rankTracts` and `relateTracts`, loads and caches the measure, and hands the existing honesty math `TractValue`s whose range kind is `"exact"`.
- **City counter.** `countRecords` gains over/under filters and per-file settings (`OVERRIDES`) for H28:
  - "current state" counting (no 12-month sale-date window);
  - the aldermanic district column;
  - number columns;
  - street columns dropped.

  For H28 it also returns a denominator and the ids of tracts where most properties pass the filter, which the count card draws on the tract map.

**Tech Stack:** Next.js 16 App Router, Convex (actions, internal queries, convex-test), AI SDK + zod tools, CopilotKit `useRenderTool`, MapLibre (via `CityMap`), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-11-property-overlap-design.md`. **Correction found while planning (2026-10-11):** the live file is the **2026** assessment: `YR_ASSMT` is 2026 on 159,555 rows and 2025 on 394. The year is therefore read from the profile (its most common `YR_ASSMT`), never hard-coded. Every "2025" in the spec reads "the file's current assessment year".

## Global Constraints

- MPROP CKAN resource id: `0a2c7f31-cd15-4151-8222-09dd57d5f16d` (constant `MPROP_RID`, defined once in `convex/lib/cityProfile.ts`).
- Homes = `C_A_CLASS IN ('1','5')` with numeric `C_A_TOTAL` > 0 in the current `YR_ASSMT`. Typical year built uses class `'1'` only and `YR_BUILT` ≥ 1800.
- A tract with fewer than **30** homes gets no property figure (`MIN_HOMES = 30`).
- Tract id = `"55079"` + `GEO_TRACT` padded to 6 digits. `"000000"` and anything that isn't 1–6 digits is dropped.
- Property range label: `exact (City records)` (constant `EXACT`).
- Measure ids: `median_value`, `share_over`, `share_under`, `owner_share`, `median_year_built`.
- `share_over` / `share_under` cutoff: integer dollars, 1,000 to 10,000,000.
- Property measure answers are cached in `mapCache` under `property:<rid>:<year>:<measure>:<cutoff>` for 24 hours.
- Never selected, filtered, grouped or returned: `OWNER_NAME_1/2/3`, `OWNER_MAIL_ADDR`, `OWNER_CITY_STATE`, `OWNER_ZIP`, `TAXKEY`, `HOUSE_NR_LO/HI/SFX`, `SDIR`, `STREET`, `STTYPE`.
- Nothing below tract or aldermanic-district level.
- Card words, verbatim:
  - "Assessed value is the City's figure for property taxes, not what a home would sell for."
  - "'Owner-occupied' means the owner's mailing address is the property's address; an owner who gets mail elsewhere isn't counted."
  - "Year built is the main building's year."
  - "A pattern across tracts doesn't tell you about any one home or family."
  - "Property figures cover the City of Milwaukee; tracts on the City line count only their City part."
- The City's SQL allows only what `scripts/city-sql-smoke.ts` proves. No NULLIF and no substr; casts only inside the `CASE WHEN … ~ '^-?[0-9]+(\.[0-9]+)?$' THEN …::float END` guard.
- Commit trailer on every commit: `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- Never stage `.superpowers/` or `clerk-creamcityalmanac.app.zone`.

## Review Focus

1. **The AI asks for an owner or street column by name** (`OWNER_NAME_1`, `STREET`) as a measure, a filter or a group. Expected: `choose-column` / `bad-column` with no owner or address text in the result. Pinned in Task 2 Step 1 and Task 3 Step 1.
2. **A count with no dates on H28.** Expected: every current-assessment property, not the last 12 months of sales. Pinned in Task 3 Step 1.
3. **A relate question asked at County level with a property side.** Expected: only City tracts pair; the DYCU side's left-out tracts read "no property figure", not "no data". Pinned in Task 2 Step 1.
4. **`share_over` asked without a cutoff, or with a silly one ($5).** Expected: `choose-column` with a reason naming the allowed range, never a guessed cutoff. Pinned in Task 2 Step 1.
5. **Property values on cards.** Expected:
   - typical year built prints "1925", never "1,925";
   - dollars print "$245,600";
   - an exact value shows no "(245,600–245,600)" range.

   Pinned in Task 4 Step 1.

---

### Task 1: Property measures (pure) and the exact range kind

**Files:**
- Create: `convex/lib/propertyMeasures.ts`
- Modify: `convex/lib/tractStats.ts:2` (RangeKind)
- Modify: `convex/lib/cityProfile.ts` (add `MPROP_RID` near the top)
- Modify: `convex/lib/citySql.ts:20` (export `num`)
- Test: `tests/propertyMeasures.test.ts`

**Interfaces:**
- Consumes: `num(column: string): string` from `convex/lib/citySql.ts`; `TractValue`, `isUnreliable`, `mismatch`, `rankValues` from `convex/lib/tractStats.ts`.
- Produces (later tasks rely on these exact names):
  - `MPROP_RID: string` (from `convex/lib/cityProfile.ts`)
  - `MIN_HOMES = 30`, `EXACT = "exact (City records)"`
  - `type MeasureId = "median_value" | "share_over" | "share_under" | "owner_share" | "median_year_built"`
  - `type Measure = { id: MeasureId; name: string; meaning: string; kind: "rate" | "value"; cutoff: boolean }`
  - `MEASURES: Measure[]`, `measureById(column: string): Measure | null`, `measureMenu(): { column: string; meaning: string; range: true }[]`
  - `measureMeaning(m: Measure, cutoff?: number): string`, `parseCutoff(c: unknown): number | null`
  - `assessmentYear(categories: { column: string; values: { value: string }[] }[]): string | null`
  - `measureSql(rid: string, m: Measure, year: string, cutoff?: number): string`
  - `tractGeoid(t: unknown): string | null`
  - `measureValues(rows: { t: unknown; v: unknown; n: unknown }[]): { values: TractValue[]; thin: number; noTract: number }`
  - `RangeKind` now includes `"exact"`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/propertyMeasures.test.ts
import { describe, expect, it } from "vitest";
import {
  assessmentYear, measureById, measureMeaning, measureMenu, measureSql, measureValues, MEASURES, MIN_HOMES, parseCutoff, tractGeoid,
} from "../convex/lib/propertyMeasures";
import { MPROP_RID } from "../convex/lib/cityProfile";
import { isUnreliable, mismatch, rankValues, type TractValue } from "../convex/lib/tractStats";

const exact = (geoid: string, value: number): TractValue => ({ geoid, value, lo: value, hi: value, kind: "exact" });

describe("property measures", () => {
  it("knows its five measures and offers them as a column menu", () => {
    expect(MEASURES.map((m) => m.id)).toEqual(["median_value", "share_over", "share_under", "owner_share", "median_year_built"]);
    expect(measureById(" Median_Value ")?.id).toBe("median_value");
    expect(measureById("OWNER_NAME_1")).toBeNull();
    expect(measureMenu().every((c) => c.range === true)).toBe(true);
    expect(JSON.stringify(measureMenu())).not.toMatch(/OWNER|TAXKEY|STREET/);
  });
  it("puts the cutoff into a share's meaning, in dollars", () => {
    expect(measureMeaning(measureById("share_over")!, 200000)).toBe("Percentage of homes (houses and condos) assessed over $200,000");
    expect(measureMeaning(measureById("median_value")!)).toBe("Median assessed value of homes (houses and condos)");
  });
  it("accepts only whole-dollar cutoffs from 1,000 to 10,000,000", () => {
    expect(parseCutoff(200000)).toBe(200000);
    expect(parseCutoff(5)).toBeNull();
    expect(parseCutoff(200000.5)).toBeNull();
    expect(parseCutoff(20_000_000)).toBeNull();
    expect(parseCutoff("200000")).toBeNull();
    expect(parseCutoff(undefined)).toBeNull();
  });
  it("reads the file's current assessment year from its profile (the most common YR_ASSMT)", () => {
    expect(assessmentYear([{ column: "YR_ASSMT", values: [{ value: "2026" }, { value: "2025" }] }])).toBe("2026");
    expect(assessmentYear([{ column: "STREET", values: [{ value: "15TH" }] }])).toBeNull();
    expect(assessmentYear([{ column: "YR_ASSMT", values: [{ value: "26'; DROP" }] }])).toBeNull();
  });
  it("builds each measure's SQL from fixed text: homes in the current year, grouped by tract", () => {
    const median = measureSql(MPROP_RID, measureById("median_value")!, "2026");
    expect(median).toContain(`FROM "${MPROP_RID}"`);
    expect(median).toContain(`"C_A_CLASS" IN ('1', '5')`);
    expect(median).toContain(`"YR_ASSMT" = '2026'`);
    expect(median).toContain("percentile_cont(0.5) WITHIN GROUP");
    expect(median).toContain(`GROUP BY "GEO_TRACT"`);
    expect(measureSql(MPROP_RID, measureById("share_over")!, "2026", 200000)).toMatch(/::float END\) > 200000 THEN 1/);
    expect(measureSql(MPROP_RID, measureById("share_under")!, "2026", 150000)).toMatch(/::float END\) < 150000 THEN 1/);
    expect(measureSql(MPROP_RID, measureById("owner_share")!, "2026")).toContain(`"OWN_OCPD" = 'O'`);
    const built = measureSql(MPROP_RID, measureById("median_year_built")!, "2026");
    expect(built).toContain(`"C_A_CLASS" = '1'`);
    expect(built).toContain(">= 1800");
  });
  it("refuses to build SQL from anything unvalidated", () => {
    expect(() => measureSql("not-a-rid", measureById("median_value")!, "2026")).toThrow();
    expect(() => measureSql(MPROP_RID, measureById("median_value")!, "2026' OR 1=1")).toThrow();
    expect(() => measureSql(MPROP_RID, measureById("share_over")!, "2026")).toThrow(/cutoff/);
  });
  it("pads the City's tract to DYCU's GEOID and drops what isn't a tract", () => {
    expect(tractGeoid("101")).toBe("55079000101");
    expect(tractGeoid("187000")).toBe("55079187000");
    expect(tractGeoid(" 1000 ")).toBe("55079001000");
    expect(tractGeoid("000000")).toBeNull();
    expect(tractGeoid("0")).toBeNull();
    expect(tractGeoid("1234567")).toBeNull();
    expect(tractGeoid(null)).toBeNull();
    expect(tractGeoid("12a")).toBeNull();
  });
  it("turns rows into exact values, leaving out thin tracts and rows with no tract", () => {
    const r = measureValues([
      { t: "101", v: "251850", n: "400" },
      { t: "1000", v: 141600, n: MIN_HOMES },
      { t: "1100", v: "99000", n: String(MIN_HOMES - 1) }, // too few homes
      { t: "000000", v: "50000", n: "900" }, // no tract
      { t: "1200", v: null, n: "300" }, // no value
    ]);
    expect(r.values).toEqual([exact("55079000101", 251850), exact("55079001000", 141600)]);
    expect(r.thin).toBe(2);
    expect(r.noTract).toBe(1);
  });
});

describe("exact ranges in the honesty rules", () => {
  it("are never unreliable, even at zero", () => {
    expect(isUnreliable(exact("1", 0))).toBe(false);
    expect(isUnreliable(exact("1", 250000))).toBe(false);
  });
  it("tie in a ranking only when the values are equal", () => {
    const vals = Array.from({ length: 12 }, (_, i) => exact(String(i), 100 - i));
    vals.push(exact("dup", 91)); // equal to #10 (value 91)
    const r = rankValues(vals, "high");
    expect(r.ties.map((v) => v.geoid)).toEqual(["dup"]);
  });
  it("let a mismatch's clearness depend only on the side with a margin", () => {
    const pairs = Array.from({ length: 30 }, (_, i) => ({
      geoid: String(i),
      a: exact(String(i), i), // property side: exact
      b: { geoid: String(i), value: 30 - i, lo: 30 - i - 0.5, hi: 30 - i + 0.5, kind: "moe90" as const },
    }));
    // A tract in the corner whose b range crosses b's cutoff (10, the bottom third) while staying reliable.
    pairs.push({ geoid: "wide", a: exact("wide", 29), b: { geoid: "wide", value: 10, lo: 8.8, hi: 11.2, kind: "moe90" } });
    const m = mismatch(pairs, "high", "low");
    expect(m.fits.length).toBeGreaterThan(0);
    expect(m.fits.some((p) => p.geoid === "wide")).toBe(false);
    expect(m.close.some((p) => p.geoid === "wide")).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run tests/propertyMeasures.test.ts`
Expected: FAIL, with "Failed to resolve import ../convex/lib/propertyMeasures".

- [ ] **Step 3: Write the implementation**

In `convex/lib/tractStats.ts` line 2:

```ts
export type RangeKind = "moe90" | "ci95" | "exact"; // exact: a full count of records (City files), no survey error
```

In `convex/lib/citySql.ts`, change line 20 from `const num = …` to:

```ts
export const num = (c: string) => `(CASE WHEN ${quoteId(c)} ~ ${lit(NUMERIC)} THEN ${quoteId(c)}::float END)`;
```

`lit` is declared further down (line 35). `num` is only called at run time, so that order is fine. Move `const lit` above `num` anyway, so a reader sees it first.

In `convex/lib/cityProfile.ts`, after the header comment block:

```ts
// The City's Master Property File (MPROP, catalog code H28 on the live site): the one City file joined to census tracts.
export const MPROP_RID = "0a2c7f31-cd15-4151-8222-09dd57d5f16d";
```

Create `convex/lib/propertyMeasures.ts`:

```ts
import { MPROP_RID } from "./cityProfile";
import { num } from "./citySql";
import type { TractValue } from "./tractStats";

// The City's Master Property File as one exact figure per census tract (docs/superpowers/specs/
// 2026-10-11-property-overlap-design.md §5). Pure: SQL text and row parsing. Only this file's fixed text, the profile's
// resource id and validated numbers enter the SQL; owner and address columns appear nowhere.
export { MPROP_RID };
export const MIN_HOMES = 30; // fewer homes than this and one house swings the tract's figure
export const EXACT = "exact (City records)";

export type MeasureId = "median_value" | "share_over" | "share_under" | "owner_share" | "median_year_built";
export type Measure = { id: MeasureId; name: string; meaning: string; kind: "rate" | "value"; cutoff: boolean };

export const MEASURES: Measure[] = [
  { id: "median_value", name: "Typical home value", meaning: "Median assessed value of homes (houses and condos)", kind: "value", cutoff: false },
  { id: "share_over", name: "Share of homes over a cutoff", meaning: "Percentage of homes (houses and condos) assessed over the cutoff", kind: "rate", cutoff: true },
  { id: "share_under", name: "Share of homes under a cutoff", meaning: "Percentage of homes (houses and condos) assessed under the cutoff", kind: "rate", cutoff: true },
  { id: "owner_share", name: "Owner-occupied share", meaning: "Percentage of homes (houses and condos) marked owner-occupied", kind: "rate", cutoff: false },
  { id: "median_year_built", name: "Typical year built", meaning: "Median year built of houses", kind: "value", cutoff: false },
];

export const measureById = (column: string): Measure | null => MEASURES.find((m) => m.id === column.trim().toLowerCase()) ?? null;

// What a choose-column refusal offers: the measures only, each marked as having a range (an exact one).
export const measureMenu = () =>
  MEASURES.map((m) => ({ column: m.id, meaning: m.cutoff ? `${m.meaning} (set cutoff, whole dollars)` : m.meaning, range: true as const }));

export const measureMeaning = (m: Measure, cutoff?: number) =>
  m.cutoff && cutoff ? m.meaning.replace("the cutoff", `$${cutoff.toLocaleString("en-US")}`) : m.meaning;

export const parseCutoff = (c: unknown): number | null =>
  typeof c === "number" && Number.isInteger(c) && c >= 1_000 && c <= 10_000_000 ? c : null;

const YEAR = /^\d{4}$/;
const RID = /^[0-9a-f-]{36}$/;

// The assessment year the file holds: its most common YR_ASSMT (a few retired parcels keep an older year).
export function assessmentYear(categories: { column: string; values: { value: string }[] }[]): string | null {
  const v = categories.find((c) => c.column === "YR_ASSMT")?.values[0]?.value ?? null;
  return v && YEAR.test(v) ? v : null;
}

export function measureSql(rid: string, m: Measure, year: string, cutoff?: number): string {
  if (!RID.test(rid)) throw new Error("Not a CKAN resource id");
  if (!YEAR.test(year)) throw new Error("Not an assessment year");
  const value = num("C_A_TOTAL");
  const from = `FROM "${rid}"`;
  const homes = `"C_A_CLASS" IN ('1', '5') AND ${value} > 0 AND "YR_ASSMT" = '${year}'`;
  const by = `GROUP BY "GEO_TRACT"`;
  const share = (when: string) => `SELECT "GEO_TRACT" AS t, 100.0 * SUM(CASE WHEN ${when} THEN 1 ELSE 0 END) / COUNT(*) AS v, COUNT(*) AS n ${from} WHERE ${homes} ${by}`;
  switch (m.id) {
    case "median_value":
      return `SELECT "GEO_TRACT" AS t, percentile_cont(0.5) WITHIN GROUP (ORDER BY ${value}) AS v, COUNT(*) AS n ${from} WHERE ${homes} ${by}`;
    case "share_over":
    case "share_under": {
      const c = parseCutoff(cutoff);
      if (c === null) throw new Error("A share needs a cutoff in whole dollars");
      return share(`${value} ${m.id === "share_over" ? ">" : "<"} ${c}`);
    }
    case "owner_share":
      return share(`"OWN_OCPD" = 'O'`);
    case "median_year_built": {
      const built = num("YR_BUILT"); // the City keeps year built for residential (class 1) parcels only
      return `SELECT "GEO_TRACT" AS t, percentile_disc(0.5) WITHIN GROUP (ORDER BY ${built}) AS v, COUNT(*) AS n ${from} WHERE "C_A_CLASS" = '1' AND ${value} > 0 AND "YR_ASSMT" = '${year}' AND ${built} >= 1800 ${by}`;
    }
  }
}

// GEO_TRACT holds the tract without leading zeros ("101" is 000101); DYCU's GEOID is Milwaukee County's 55079 + six digits.
export function tractGeoid(t: unknown): string | null {
  const s = String(t ?? "").trim();
  if (!/^\d{1,6}$/.test(s)) return null;
  const six = s.padStart(6, "0");
  return six === "000000" ? null : `55079${six}`;
}

export function measureValues(rows: { t: unknown; v: unknown; n: unknown }[]): { values: TractValue[]; thin: number; noTract: number } {
  const values: TractValue[] = [];
  let thin = 0, noTract = 0;
  for (const r of rows) {
    const geoid = tractGeoid(r.t);
    if (!geoid) { noTract++; continue; }
    const v = r.v === null || r.v === undefined || r.v === "" ? NaN : Number(r.v);
    if (!(Number(r.n) >= MIN_HOMES) || !Number.isFinite(v)) { thin++; continue; }
    values.push({ geoid, value: v, lo: v, hi: v, kind: "exact" });
  }
  return { values, thin, noTract };
}
```

- [ ] **Step 4: Run the tests and the whole suite**

Run: `npx vitest run tests/propertyMeasures.test.ts && npx tsc --noEmit -p . && npx vitest run --maxWorkers=4`
Expected: the new file passes, the typecheck is clean, and the full suite still passes. `RangeKind` widening must not break `YEAR_NOTE` in `convex/tracts.ts`, which is keyed by `RangeCols` kinds, not `RangeKind`.

- [ ] **Step 5: Prove the SQL against the real City datastore (free, read-only)**

Append to `scripts/city-sql-smoke.ts`:

```ts
// Property measures (H28, MPROP): every measure's SQL runs, and its tracts pad to DYCU GEOIDs.
import { MEASURES, measureSql, measureValues } from "../convex/lib/propertyMeasures";
import { MPROP_RID } from "../convex/lib/cityProfile";
for (const m of MEASURES) {
  const rows = await datastoreSql<{ t: unknown; v: unknown; n: unknown }>(measureSql(MPROP_RID, m, "2026", m.cutoff ? 200000 : undefined));
  const r = measureValues(rows);
  console.log("OK", m.id, rows.length, "tracts ·", r.values.length, "kept ·", r.thin, "thin ·", r.noTract, "no tract · e.g.", r.values[0]);
}
```

Move the two new `import` lines to the top of the file with the others. Run: `npx tsx scripts/city-sql-smoke.ts`
Expected: five `OK` lines, each with about 200 kept tracts and about 5 thin. If `percentile_disc` is refused, use `percentile_cont` for year built as well and round the value in `measureValues` (`Math.round`) only for `median_year_built`. Record the change in the commit message.

- [ ] **Step 6: Commit**

```bash
git add convex/lib/propertyMeasures.ts convex/lib/tractStats.ts convex/lib/cityProfile.ts convex/lib/citySql.ts scripts/city-sql-smoke.ts tests/propertyMeasures.test.ts
git commit -m "feat: property measures per census tract from the City's property file, as exact values

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: The tract tools accept a property side

**Files:**
- Create: `convex/property.ts`
- Modify: `convex/tracts.ts` (Header, Refusal, rankTracts, compareYears, relateTracts)
- Modify: `convex/lib/tractNames.ts` (add `latestDefYear`)
- Modify: `lib/ask/tools.ts:49-56` (rankParams, relateParams: `cutoff`; descriptions)
- Test: `convex/property.test.ts`

**Interfaces:**
- Consumes (Task 1): `MPROP_RID`, `EXACT`, `MIN_HOMES`, `Measure`, `measureById`, `measureMenu`, `measureMeaning`, `measureSql`, `measureValues`, `parseCutoff`, `assessmentYear`. Also, existing: `internal.city.countContext`, `internal.tracts.familyForTracts`, `internal.map.cached`, `internal.map.remember`, `datastoreSql`.
- Produces:
  - `Header` gains an optional `leftOutWhy?: string`.
  - The `Refusal` choose-column variant gains `reason?: string`.
  - `rankTracts` args gain `cutoff?: number`; `relateTracts` `a`/`b` gain `cutoff?: number`.
  - `convex/property.ts` exports:
    - `PropertySide`;
    - `propertySide(ctx, code, column, cutoff?) → Promise<PropertySide | Refusal | null>`;
    - `loadProperty(ctx, side, spend) → Promise<{ values: TractValue[]; leftOut: number } | "busy" | null>`;
    - `propertyHead(side, n, leftOut) → Header`;
    - `NO_PROPERTY = "no property figure: outside the City or fewer than 30 homes"`.
  - `latestDefYear(defs: DycuDef[]): number` (`convex/lib/tractNames.ts`).

- [ ] **Step 1: Write the failing test**

```ts
// convex/property.test.ts
/// <reference types="vite/client" />
import { afterEach, describe, expect, it, vi } from "vitest";
import { installFakeFetch } from "../tests/helpers/fakeFetch";
import { api } from "./_generated/api";
import { MPROP_RID } from "./lib/cityProfile";
import { EXACT } from "./lib/propertyMeasures";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");

const reader = { subject: "u1", issuer: "test", tokenIdentifier: "test|u1" };
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

const POV_FIELDS = [
  { name: "GEOID", type: "esriFieldTypeString" },
  { name: "pov_rate", type: "esriFieldTypeDouble" },
  { name: "pov_rate_moe", type: "esriFieldTypeDouble" },
];
// The same 25 tracts as tracts.test.ts's povertyRows (100000..102300, and 186000 = Harambee), as the City writes them.
const TRACTS = [...Array.from({ length: 24 }, (_, i) => String(100000 + i * 100)), "186000"];
const povertyRows = () => ({ features: TRACTS.map((t, i) => ({ attributes: { GEOID: `55079${t}`, pov_rate: t === "186000" ? 58 : 10 + i, pov_rate_moe: 1 } })) });
// Home values rise with the tract number; Harambee's are the lowest. A thin tract and a "no tract" row ride along.
const measureRows = () => [
  ...TRACTS.map((t, i) => ({ t, v: t === "186000" ? 60000 : 150000 + i * 10000, n: "120" })),
  { t: "999900", v: "500000", n: "12" },
  { t: "000000", v: "80000", n: "900" },
];

// Self-contained (importing tracts.test.ts would run its tests again): E02 City 2022, Harambee's DYCU definition, H28.
async function seed() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  await t.run(async (ctx) => {
    await ctx.db.insert("families", { key: "e02", code: "E02", name: "Households Living in Poverty", kind: "dataset", topic: "Economy", keywords: [], places: ["City"], years: [2022], latestModified: "2024-01-01", baseSearchText: "", searchText: "", dictionaryTab: null });
    await ctx.db.insert("members", { familyKey: "e02", hubId: "h1", title: "Poverty 2022", yearLabel: "2022", featureServerUrl: "https://services.arcgis.com/x/arcgis/rest/services/Poverty_2022/FeatureServer/0", kind: "dataset", landingPage: "", place: "City", years: [2022], modified: "2024-01-01", downloads: {}, description: "", keywords: [] });
    await ctx.db.insert("cards", { familyKey: "e02", inputHash: "h", explainer: "x", explainerProvenance: "AI", hubSummary: "", glossary: [{ field: "pov_rate", meaning: "Share of households below the poverty line.", provenance: "DYCU" }], caveats: ["Survey estimates pool five years."], storyAngles: [], basic: false, embedding: new Array(1536).fill(0) });
    await ctx.db.insert("neighborhoods", { definition: "dycu", name: "Harambee", matchKey: "harambee", tracts: [{ years: [2021, 2022, 2023, 2024], tracts: ["1860"] }] });
    await ctx.db.insert("families", { key: "city:master-property-file-mprop", code: "H28", name: "Master Property File (MPROP)", kind: "dataset", topic: "Housing", keywords: [], places: ["City"], years: [], latestModified: "2026-10-01", baseSearchText: "", searchText: "", dictionaryTab: null, source: "city", live: true });
    await ctx.db.insert("cards", { familyKey: "city:master-property-file-mprop", inputHash: "h", explainer: "x", explainerProvenance: "AI", hubSummary: "", glossary: [], caveats: ["Values are the City's assessments."], storyAngles: [], basic: false, embedding: new Array(1536).fill(0) });
    await ctx.db.insert("cityProfiles", { familyKey: "city:master-property-file-mprop", resourceId: MPROP_RID, columns: [], dateColumn: "CONVEY_DATE", districtColumns: [], categories: [{ column: "YR_ASSMT", values: [{ value: "2026", count: 159555 }, { value: "2025", count: 394 }] }, { column: "STREET", values: [{ value: "15TH", count: 1926 }] }], rowCount: 159949, minDate: "1900-01-01", maxDate: "2026-09-30", namesPeople: true, signature: "s", updatedAt: 0 });
  });
  return t;
}

const FORBIDDEN = /OWNER_|OWNER MAIL|TAXKEY|HOUSE_NR|"STREET"|15TH/;

describe("property measures in the tract tools", () => {
  it("ranks tracts on typical home value as exact City figures, named by DYCU's newest definitions", async () => {
    const t = await seed();
    installFakeFetch({ columns: POV_FIELDS, tractRows: povertyRows, citySql: () => measureRows() });
    const r = await t.withIdentity(reader).action(api.tracts.rankTracts, { code: "h28", column: "median_value", place: "County", year: "2023", direction: "low" });
    expect(r).toMatchObject({ status: "ok", tool: "rank", header: { code: "H28", column: "median_value", confidence: EXACT, place: "City", year: "2026 assessment", n: 25, leftOut: 2 } });
    if (r.status !== "ok") return;
    expect(r.top[0]).toMatchObject({ tract: "1860", neighborhood: "Harambee", value: 60000, lo: 60000, hi: 60000, unreliable: false });
    expect(r.unreliableCount).toBe(0);
    expect(JSON.stringify(r)).not.toMatch(FORBIDDEN);
  });
  it("offers only the measures when the column isn't one, including an owner or street column", async () => {
    const t = await seed();
    installFakeFetch({ citySql: () => { throw new Error("must not query the City"); } });
    for (const column of ["OWNER_NAME_1", "STREET", "C_A_TOTAL"]) {
      const r = await t.withIdentity(reader).action(api.tracts.rankTracts, { code: "H28", column, place: "City", year: "2023", direction: "high" });
      expect(r).toMatchObject({ status: "choose-column" });
      if (r.status !== "choose-column") return;
      expect(r.columns.map((c) => c.column)).toEqual(["median_value", "share_over", "share_under", "owner_share", "median_year_built"]);
      expect(JSON.stringify(r)).not.toMatch(FORBIDDEN);
    }
  });
  it("asks for a cutoff instead of guessing one", async () => {
    const t = await seed();
    installFakeFetch({ citySql: () => { throw new Error("must not query the City"); } });
    for (const cutoff of [undefined, 5, 200000.5]) {
      const r = await t.withIdentity(reader).action(api.tracts.rankTracts, { code: "H28", column: "share_over", place: "City", year: "2023", direction: "high", ...(cutoff === undefined ? {} : { cutoff }) });
      expect(r).toMatchObject({ status: "choose-column", reason: expect.stringContaining("cutoff") });
    }
  });
  it("lines home values up with a DYCU tract dataset, County asked: City tracts pair and the rest are named for what they are", async () => {
    const t = await seed();
    // County poverty adds a tract outside the City (no property figure).
    const county = () => ({ features: [...povertyRows().features, { attributes: { GEOID: "55079150100", pov_rate: 5, pov_rate_moe: 1 } }] });
    installFakeFetch({ columns: POV_FIELDS, tractRows: county, citySql: () => measureRows() });
    await t.run(async (ctx) => {
      const member = { kind: "dataset" as const, landingPage: "", place: "County", years: [2022], modified: "2024-01-01", downloads: {}, description: "", keywords: [] };
      await ctx.db.insert("members", { familyKey: "e02", hubId: "h9", title: "Poverty County 2022", yearLabel: "2022", featureServerUrl: "https://services.arcgis.com/x/arcgis/rest/services/PovCounty/FeatureServer/0", ...member });
    });
    const r = await t.withIdentity(reader).action(api.tracts.relateTracts, { a: { code: "H28", column: "median_value" }, b: { code: "E02", column: "pov_rate" }, place: "County", year: "2022", mode: "relate" });
    expect(r).toMatchObject({ status: "ok", a: { confidence: EXACT, year: "2026 assessment", n: 25 }, b: { confidence: "90% confidence (Census)", year: "2022", leftOut: 1, leftOutWhy: "no property figure: outside the City or fewer than 30 homes" } });
    expect(JSON.stringify(r)).not.toMatch(FORBIDDEN);
  });
  it("refuses change over time on a property measure, with the reason", async () => {
    const t = await seed();
    installFakeFetch({ citySql: () => { throw new Error("must not query the City"); } });
    const r = await t.withIdentity(reader).action(api.tracts.compareYears, { code: "H28", column: "median_value", place: "City", from: "2025", to: "2026" });
    expect(r).toMatchObject({ status: "choose-year", reason: expect.stringContaining("only the current assessment") });
  });
  it("asks the City once a day per measure, and says unavailable when the City fails", async () => {
    const t = await seed();
    let calls = 0;
    installFakeFetch({ columns: POV_FIELDS, tractRows: povertyRows, citySql: () => { calls++; return measureRows(); } });
    const args = { code: "H28", column: "median_value", place: "City" as const, year: "2023", direction: "high" as const };
    await t.withIdentity(reader).action(api.tracts.rankTracts, args);
    await t.withIdentity(reader).action(api.tracts.rankTracts, args);
    expect(calls).toBe(1);
    installFakeFetch({ citySql: () => { throw new Error("City down"); } });
    expect(await t.withIdentity(reader).action(api.tracts.rankTracts, { ...args, column: "owner_share" })).toEqual({ status: "unavailable" });
  });
});
```

If `installFakeFetch`'s `citySql` throws, the fake must turn that into a failed fetch, so `datastoreSql` rejects. Check `tests/helpers/fakeFetch.ts`. If a throw inside `citySql` doesn't already become a rejected request, wrap the `citySql(...)` call there in a `try` that returns `json(500, { success: false })`.

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run convex/property.test.ts`
Expected: FAIL. `rankTracts` returns `not-found` for H28: `familyForTracts` drops City families.

- [ ] **Step 3: Write the implementation**

`convex/lib/tractNames.ts`, append:

```ts
// The newest year DYCU's definitions cover: names for figures from a year DYCU hasn't defined (the City's current file).
export const latestDefYear = (defs: DycuDef[]) => Math.max(0, ...defs.flatMap((d) => (d.tracts ?? []).flatMap((e) => e.years)));
```

`convex/property.ts`:

```ts
import { internal } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";
import { datastoreSql } from "./lib/ckan";
import {
  assessmentYear, EXACT, measureById, measureMenu, measureMeaning, measureSql, measureValues, MPROP_RID, parseCutoff, type Measure,
} from "./lib/propertyMeasures";
import type { TractValue } from "./lib/tractStats";
import type { Fam, Header, Refusal, Spend } from "./tracts";

// The property side of a tract tool (spec 2026-10-11 §6): H28 turns into exact per-tract figures. Owner and address
// columns can't be named here: the only columns are the measures.
export type PropertySide = { code: string; name: string; caveats: string[]; measure: Measure; cutoff?: number; meaning: string; year: string; rid: string; shapesUrl: string };
export const NO_PROPERTY = "no property figure: outside the City or fewer than 30 homes";
const DAY_MS = 24 * 3_600_000;
const yearOf = (s: string) => Number(s.match(/\d{4}/)?.[0] ?? 0);

// The property file when `code` names it, else null (the DYCU path takes it). Database only: free.
export async function propertySide(ctx: ActionCtx, code: string, column: string, cutoff?: number): Promise<PropertySide | Refusal | null> {
  const data = await ctx.runQuery(internal.city.countContext, { code: code.trim().toUpperCase() });
  if (!data?.profile || data.profile.resourceId !== MPROP_RID) return null;
  const measure = measureById(column);
  if (!measure) return { status: "choose-column", columns: measureMenu() };
  const c = measure.cutoff ? parseCutoff(cutoff) : undefined;
  if (c === null) return { status: "choose-column", columns: measureMenu(), reason: `${measure.id} needs a cutoff in whole dollars, from 1,000 to 10,000,000` };
  const year = assessmentYear(data.profile.categories);
  if (!year) return { status: "unavailable" };
  // A count has no DYCU dataset of its own; tract outlines come from E02's newest County layer.
  const e02: Fam | null = await ctx.runQuery(internal.tracts.familyForTracts, { code: "E02" });
  const county = (e02?.members ?? []).filter((m) => m.place === "County").sort((x, y) => yearOf(y.year) - yearOf(x.year));
  return {
    code: data.code, name: data.name, caveats: data.caveat ? [data.caveat] : [], measure, ...(c ? { cutoff: c } : {}),
    meaning: measureMeaning(measure, c ?? undefined), year, rid: data.profile.resourceId, shapesUrl: county[0]?.url ?? "",
  };
}

// The measure's per-tract figures, from the cache or the City (spends the person's tract budget first).
export async function loadProperty(ctx: ActionCtx, s: PropertySide, spend: Spend): Promise<{ values: TractValue[]; leftOut: number } | "busy" | null> {
  if (!(await spend())) return "busy";
  const key = `property:${s.rid}:${s.year}:${s.measure.id}:${s.cutoff ?? ""}`;
  try {
    const hit: string | null = await ctx.runQuery(internal.map.cached, { key, now: Date.now() });
    if (hit) return JSON.parse(hit) as { values: TractValue[]; leftOut: number };
  } catch (e) {
    console.error(`Property cache read failed for ${key}: ${e instanceof Error ? e.message : String(e)}`);
  }
  let rows: { t: unknown; v: unknown; n: unknown }[];
  try {
    rows = await datastoreSql(measureSql(s.rid, s.measure, s.year, s.cutoff));
  } catch (e) {
    console.error(`Property measure failed for ${key}: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
  const m = measureValues(rows);
  const loaded = { values: m.values, leftOut: m.thin + m.noTract };
  try {
    await ctx.runMutation(internal.map.remember, { key, result: JSON.stringify(loaded), expiresAt: Date.now() + DAY_MS });
  } catch (e) {
    console.error(`Property cache write failed for ${key}: ${e instanceof Error ? e.message : String(e)}`);
  }
  return loaded;
}

// Property figures cover the City only, whatever place was asked; the url gives the card its tract outlines.
export const propertyHead = (s: PropertySide, n: number, leftOut: number): Header => ({
  code: s.code, name: s.name, column: s.measure.id, meaning: s.meaning, kind: s.measure.kind, place: "City", year: `${s.year} assessment`,
  n, leftOut, leftOutWhy: "fewer than 30 homes, or no tract", confidence: EXACT, url: s.shapesUrl, caveats: s.caveats,
});
```

`convex/tracts.ts` changes:

1. The type lines (18, 26):

```ts
export type Header = { code: string; name: string; column: string; meaning: string; kind: "rate" | "count" | "value"; place: string; year: string; n: number; leftOut: number; leftOutWhy?: string; confidence: string | null; url: string; caveats: string[] };
```
```ts
  | { status: "choose-column"; columns: { column: string; meaning: string; range: boolean }[]; reason?: string }
```

2. Imports: add `import { latestDefYear, neighborhoodFor, type DycuDef } from "./lib/tractNames";`, replacing the existing tractNames import. Add `import { loadProperty, NO_PROPERTY, propertyHead, propertySide, type PropertySide } from "./property";`.

3. A side resolver, under `header(...)`:

```ts
// One side of a tract tool, ready to pair: a DYCU dataset (resolved, rows loaded) or the property file. `year` is the
// DYCU year for naming tracts (null for a property side).
type Ready = { head: (place: string, n: number, leftOut: number) => Header; year: string | null; rows: Loaded; property: boolean };
async function ready(ctx: ActionCtx, picked: PropertySide | Looked, column: string, spend: Spend): Promise<Ready | Refusal> {
  if ("measure" in picked) {
    const rows = await loadProperty(ctx, picked, spend);
    if (rows === "busy") return { status: "busy" };
    if (!rows) return { status: "unavailable" };
    return { head: (_place, n, leftOut) => propertyHead(picked, n, leftOut), year: null, rows, property: true };
  }
  const r = await resolveLooked(ctx, picked, column, spend);
  if ("status" in r) return r;
  const rows = await loadValues(ctx, r);
  if (!rows) return { status: "unavailable" };
  return { head: (place, n, leftOut) => header(r, place, r.year, n, leftOut), year: r.year, rows, property: false };
}
```

4. `rankTracts`: args gain `cutoff: v.optional(v.number())`. Replace the handler body:

```ts
  handler: async (ctx, args): Promise<RankDetail | Refusal> => {
    const spend = await spender(ctx);
    const prop = await propertySide(ctx, args.code, args.column, args.cutoff);
    if (prop && "status" in prop) return prop;
    let picked: PropertySide | Looked;
    if (prop) picked = prop;
    else {
      const looked = pickMember(await ctx.runQuery(internal.tracts.familyForTracts, { code: args.code }), args.place, args.year);
      if ("status" in looked) return looked;
      picked = looked;
    }
    const side = await ready(ctx, picked, args.column, spend);
    if ("status" in side) return side;
    const defs = await ctx.runQuery(internal.tracts.dycuDefs, {});
    const nameYear = side.year ?? String(latestDefYear(defs));
    const ranked = rankValues(side.rows.values, args.direction);
    const head = side.head(args.place, side.rows.values.length, side.rows.leftOut);
    const { key, save } = await store(ctx, { tool: "rank", ...args, year: head.year, code: head.code, column: head.column });
    const detail: RankDetail = {
      status: "ok", tool: "rank", header: head, direction: args.direction,
      top: ranked.top.map((v) => toRow(v, nameYear, defs)),
      ties: ranked.ties.map((v) => toRow(v, nameYear, defs)), tieCount: ranked.ties.length,
      unreliable: ranked.unreliable.map((v) => toRow(v, nameYear, defs)), unreliableCount: ranked.unreliable.length,
      highlighted: ranked.top.map((v) => v.geoid), key,
    };
    await save(detail); // the card gets every tie and every unreliable tract; the model gets the first three of each, with the totals
    return { ...detail, ties: detail.ties.slice(0, 3), unreliable: detail.unreliable.slice(0, 3) };
  },
```

5. `compareYears`: right after `const spend = await spender(ctx);` add:

```ts
    if (await propertySide(ctx, args.code, args.column)) return { status: "choose-year", available: [], reason: "The City's property file holds only the current assessment, so it can't show change over time." };
```

`propertySide` returns a refusal for an unknown measure. That's non-null too, so every H28 request lands on this reason, which is what we want.

6. `relateTracts`: `vPick` becomes `v.object({ code: v.string(), column: v.string(), cutoff: v.optional(v.number()) })`. Replace the handler body up to `const defs = …` with:

```ts
    const spend = await spender(ctx); // one charge covers both datasets
    // Every database-only problem with either side comes back at once, before anything is spent or fetched.
    const [qa, qb] = await Promise.all([propertySide(ctx, args.a.code, args.a.column, args.a.cutoff), propertySide(ctx, args.b.code, args.b.column, args.b.cutoff)]);
    const [fa, fb]: (Fam | null)[] = await Promise.all([
      qa ? null : ctx.runQuery(internal.tracts.familyForTracts, { code: args.a.code }),
      qb ? null : ctx.runQuery(internal.tracts.familyForTracts, { code: args.b.code }),
    ]);
    const pa = qa ?? pickMember(fa, args.place, args.year);
    const pb = qb ?? pickMember(fb, args.place, args.year);
    if ("status" in pa || "status" in pb) {
      const found = [...("status" in pa ? [tag(pa, "a")] : []), ...("status" in pb ? [tag(pb, "b")] : [])];
      const hard = found.filter((r) => r.status !== "choose-year");
      if (hard.length) {
        const [first, ...rest] = [...hard, ...found.filter((r) => r.status === "choose-year")];
        return rest.length ? { ...first, also: rest } : first;
      }
      if (qa || qb) return found[0]; // a property side has no years to share: the DYCU side's years are the choice
      const sa = slotsOf(fa);
      return { status: "choose-year", available: { a: sa, b: slotsOf(fb) }, shared: sa.filter((x) => slotsOf(fb).some((y) => y.place === x.place && sameYear(y.year, x.year))) };
    }
    const [ra, rb] = await Promise.all([ready(ctx, pa, args.a.column, spend), ready(ctx, pb, args.b.column, spend)]);
    if ("status" in ra) return tag(ra, "a");
    if ("status" in rb) return tag(rb, "b");
    const va = ra.rows, vb = rb.rows;
```

Then, in the rest of the handler:
- After `const defs = …`, add `const nameYear = ra.year ?? rb.year ?? String(latestDefYear(defs));`.
- Replace every `ra.year` used for naming (`both`, `points`) with `nameYear`.
- `store(...)` becomes `store(ctx, { tool: "relate", ...args, year: nameYear })`.
- The two headers become:

```ts
      a: { ...ra.head(args.place, pairs.length, va.values.length + va.leftOut - pairs.length), ...(rb.property && !ra.property ? { leftOutWhy: NO_PROPERTY } : {}) },
      b: { ...rb.head(args.place, pairs.length, vb.values.length + vb.leftOut - pairs.length), ...(ra.property && !rb.property ? { leftOutWhy: NO_PROPERTY } : {}) },
```

`lib/ask/tools.ts`:

```ts
const cutoff = z.number().int().min(1_000).max(10_000_000).optional().describe("Only for H28 share_over / share_under: the cutoff in whole dollars, e.g. 200000");
export const rankParams = z.object({ code, column, place, year, direction: z.enum(["high", "low"]), cutoff });
export const relateParams = z.object({
  a: z.object({ code, column, cutoff }), b: z.object({ code, column, cutoff }), place, year,
  // mode, aSide, bSide unchanged
```

Append this to the `rankTracts` and `relateTracts` descriptions:

` The City's property file (H28) also works here, as one side: column median_value (typical home value), share_over or share_under (with cutoff in dollars), owner_share, or median_year_built. Its figures are exact City records for the current assessment and cover City tracts only.`

- [ ] **Step 4: Run the tests and the whole suite**

Run: `npx vitest run convex/property.test.ts convex/tracts.test.ts && npx tsc --noEmit -p . && npx vitest run --maxWorkers=4`
Expected: all pass. The existing tracts tests are unchanged and must stay green: the DYCU path's behaviour hasn't changed.

- [ ] **Step 5: Commit**

```bash
git add convex/property.ts convex/property.test.ts convex/tracts.ts convex/lib/tractNames.ts lib/ask/tools.ts tests/helpers/fakeFetch.ts
git commit -m "feat: rank and relate census tracts on City property measures, exact and cached for the day

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Counting property: over/under, the current assessment, districts, the tract map

**Files:**
- Modify: `convex/lib/cityProfile.ts` (CityProfile fields, `OVERRIDES`, `withOverrides`)
- Modify: `convex/lib/citySql.ts` (CountArgs filters, number filters, snapshot period, district groups, `ofSql`, `tractSql`; `groupLabelFor` for GEO_ALDER)
- Modify: `convex/city.ts` (apply overrides, `vFilter`, `of` and `tractMap` in CountResult)
- Modify: `lib/ask/tools.ts:36-43` (countParams filters)
- Test: `tests/lib/citySqlProperty.test.ts`, `convex/cityProperty.test.ts`

**Interfaces:**
- Consumes (Task 1): `MPROP_RID`, `tractGeoid`, `MIN_HOMES`. Existing: `buildCount`, `planCount`, `askCity`, `internal.tracts.familyForTracts`.
- Produces:
  - `CountArgs.filters: { column: string; values?: string[]; over?: number; under?: number }[]`.
  - `CityProfile` gains `snapshot?`, `numberColumns?`, `currentColumn?`, `tractColumn?`, `baseColumn?`.
  - `withOverrides<P extends CityProfile>(p: P): P`.
  - `Built` (ok) gains `ofSql: string | null`, `tractSql: string | null`.
  - `CountResult` (ok) gains `of?: { count: number; label: string }` and `tractMap?: { url: string; ids: string[]; total: number }`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/lib/citySqlProperty.test.ts
import { describe, expect, it } from "vitest";
import { MPROP_RID, withOverrides, type CityProfile } from "../../convex/lib/cityProfile";
import { buildCount } from "../../convex/lib/citySql";

const stored: CityProfile = {
  familyKey: "city:master-property-file-mprop", resourceId: MPROP_RID, columns: [], dateColumn: "CONVEY_DATE", districtColumns: [],
  categories: [
    { column: "YR_ASSMT", values: [{ value: "2026", count: 159555 }, { value: "2025", count: 394 }] },
    { column: "STREET", values: [{ value: "15TH", count: 1926 }] },
    { column: "SDIR", values: [{ value: "N", count: 74208 }] },
  ],
  rowCount: 159949, minDate: "1900-01-01", maxDate: "2026-09-30", namesPeople: true, signature: "s", updatedAt: 0,
};
const P = withOverrides(stored);
const today = "2026-10-11";

describe("counting the property file", () => {
  it("counts the current assessment, not the last 12 months of sales, when no dates are asked", () => {
    const b = buildCount(P, {}, today);
    if (!b.ok) throw new Error(JSON.stringify(b));
    expect(b.totalSql).toContain(`"YR_ASSMT" = '2026'`);
    expect(b.totalSql).not.toContain("CONVEY_DATE");
    expect(b.period).toBe("2026 assessment");
    expect(b.futureSql).toBeNull();
  });
  it("filters by last sale date only when dates are asked, and says so", () => {
    const b = buildCount(P, { from: "2025-01-01", to: "2025-12-31" }, today);
    if (!b.ok) throw new Error(JSON.stringify(b));
    expect(b.totalSql).toContain(`"CONVEY_DATE" >= '2025-01-01'`);
    expect(b.period).toMatch(/^last sold Jan 1, 2025 – Dec 31, 2025/);
  });
  it("counts over and under a number, with a plain label, the base count and per-tract shares", () => {
    const b = buildCount(P, { filters: [{ column: "c_a_total", over: 200000 }] }, today);
    if (!b.ok) throw new Error(JSON.stringify(b));
    expect(b.totalSql).toMatch(/"C_A_TOTAL"::float END\) > 200000/);
    expect(b.filterLabels).toEqual(["assessed over $200,000"]);
    expect(b.ofSql).toMatch(/"C_A_TOTAL"::float END\) > 0/);
    expect(b.ofSql).not.toContain("> 200000");
    expect(b.tractSql).toContain(`GROUP BY "GEO_TRACT"`);
    expect(b.tractSql).toContain("> 200000 THEN 1");
    const u = buildCount(P, { filters: [{ column: "BLDG_AREA", under: 1500 }] }, today);
    if (!u.ok) throw new Error(JSON.stringify(u));
    expect(u.filterLabels).toEqual(["building area under 1,500 sq ft"]);
  });
  it("groups by aldermanic district with plain labels", () => {
    const b = buildCount(P, { groupBy: "geo_alder" }, today);
    if (!b.ok) throw new Error(JSON.stringify(b));
    expect(b.groupSql).toContain(`"GEO_ALDER" AS g`);
    expect(b.groupLabel).toBe("GEO_ALDER");
  });
  it("never filters or groups on a street, an owner, or a column that isn't a number", () => {
    for (const args of [
      { filters: [{ column: "STREET", values: ["15TH"] }] },
      { groupBy: "SDIR" },
      { filters: [{ column: "OWNER_NAME_1", values: ["X"] }] },
      { filters: [{ column: "OWNER_ZIP", over: 1 }] },
      { filters: [{ column: "TAXKEY", over: 1 }] },
    ]) {
      const b = buildCount(P, args, today);
      expect(b).toMatchObject({ ok: false, status: "bad-column" });
      // The refusal echoes the asked column; what it offers must never include one.
      expect(JSON.stringify((b as { columns: string[] }).columns)).not.toMatch(/OWNER|TAXKEY|STREET|SDIR/);
    }
  });
  it("leaves other City files exactly as they were", () => {
    const crime = { ...stored, resourceId: "87843297-a6fa-46d4-ba5d-cb342fb2d3bb", dateColumn: "Incident_Date" };
    expect(withOverrides(crime)).toBe(crime);
  });
});
```

```ts
// convex/cityProperty.test.ts
/// <reference types="vite/client" />
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { installFakeFetch } from "../tests/helpers/fakeFetch";
import { api } from "./_generated/api";
import { MPROP_RID } from "./lib/cityProfile";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");
const reader = { subject: "u1", issuer: "test", tokenIdentifier: "test|u1" };
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

async function seed() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  await t.run(async (ctx) => {
    await ctx.db.insert("families", { key: "city:master-property-file-mprop", code: "H28", name: "Master Property File (MPROP)", kind: "dataset", topic: "Housing", keywords: [], places: ["City"], years: [], latestModified: "2026-10-01", baseSearchText: "", searchText: "", dictionaryTab: null, source: "city", live: true });
    await ctx.db.insert("cityProfiles", { familyKey: "city:master-property-file-mprop", resourceId: MPROP_RID, columns: [], dateColumn: "CONVEY_DATE", districtColumns: [], categories: [{ column: "YR_ASSMT", values: [{ value: "2026", count: 159555 }] }, { column: "STREET", values: [{ value: "15TH", count: 1926 }] }], rowCount: 159949, minDate: "1900-01-01", maxDate: "2026-09-30", namesPeople: true, signature: "s", updatedAt: 0 });
    await ctx.db.insert("families", { key: "e02", code: "E02", name: "Households Living in Poverty", kind: "dataset", topic: "Economy", keywords: [], places: ["County"], years: [2024], latestModified: "2024-01-01", baseSearchText: "", searchText: "", dictionaryTab: null });
    await ctx.db.insert("members", { familyKey: "e02", hubId: "h1", title: "Poverty County 2024", yearLabel: "2024", featureServerUrl: "https://services.arcgis.com/x/PovCounty2024/FeatureServer/0", kind: "dataset", landingPage: "", place: "County", years: [2024], modified: "2024-01-01", downloads: {}, description: "", keywords: [] });
  });
  return t;
}

// 60 tracts: the first 40 have most homes over the cutoff, the last 20 don't; one tract has too few properties to judge.
const tractRows = () => [
  ...Array.from({ length: 60 }, (_, i) => ({ t: String(100000 + i * 100), hit: i < 40 ? "80" : "10", n: "100" })),
  { t: "999900", hit: "5", n: "6" },
];

describe("countRecords on the property file", () => {
  it("counts properties over a cutoff by district, out of all assessed, with the tracts where most pass", async () => {
    const t = await seed();
    installFakeFetch({
      citySql: (sql) =>
        sql.includes(`GROUP BY "GEO_TRACT"`) ? tractRows()
          : sql.includes("AS g") ? [{ g: "6", n: "4200" }, { g: "3", n: "3900" }]
            : sql.includes("> 200000") ? [{ n: "83243" }]
              : [{ n: "151500" }],
    });
    const r = await t.withIdentity(reader).action(api.city.countRecords, { code: "H28", filters: [{ column: "C_A_TOTAL", over: 200000 }], groupBy: "GEO_ALDER" });
    expect(r).toMatchObject({
      status: "ok", count: 83243, period: "2026 assessment", filters: ["assessed over $200,000"],
      groups: [{ label: "Aldermanic district 6", count: 4200 }, { label: "Aldermanic district 3", count: 3900 }],
      of: { count: 151500, label: "with an assessed value" },
      tractMap: { url: "https://services.arcgis.com/x/PovCounty2024/FeatureServer/0", total: 40 },
    });
    if (r.status !== "ok" || !r.tractMap) return;
    expect(r.tractMap.ids).toHaveLength(40);
    expect(r.tractMap.ids[0]).toBe("55079100000");
    expect(JSON.stringify(r)).not.toMatch(/OWNER|TAXKEY|STREET|15TH/);
  });
  it("keeps the count when the tract query fails (the map is lost, never the count)", async () => {
    const t = await seed();
    installFakeFetch({ citySql: (sql) => { if (sql.includes(`GROUP BY "GEO_TRACT"`)) throw new Error("boom"); return sql.includes("> 200000") ? [{ n: "83243" }] : [{ n: "151500" }]; } });
    const r = await t.withIdentity(reader).action(api.city.countRecords, { code: "H28", filters: [{ column: "C_A_TOTAL", over: 200000 }] });
    expect(r).toMatchObject({ status: "ok", count: 83243 });
    if (r.status === "ok") expect(r.tractMap).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run tests/lib/citySqlProperty.test.ts convex/cityProperty.test.ts`
Expected: FAIL. `withOverrides` isn't exported, and countRecords rejects `over`.

- [ ] **Step 3: Write the implementation**

`convex/lib/cityProfile.ts`. Extend `CityProfile`:

```ts
  // Per-file settings (OVERRIDES) the profiler can't infer, applied when counting:
  snapshot?: boolean; // rows describe things as they are now (no default 12-month window; dates mean "last sold")
  numberColumns?: string[]; // text columns that hold numbers, for over/under filters
  currentColumn?: string | null; // a snapshot keeps only rows whose value here is this column's most common one
  tractColumn?: string | null; // the census tract, for the count card's tract map
  baseColumn?: string | null; // the column whose positive values make "the whole" for a number-filtered count
```

Then add below `MPROP_RID`:

```ts
type Override = Required<Pick<CityProfile, "snapshot" | "numberColumns" | "currentColumn" | "tractColumn" | "baseColumn">> & { districtColumns: string[]; keepCategories: string[] };
// One entry per file, keyed by the City's resource id (stable across catalog codes). Street names and every other
// category are dropped from the property file: counts go by aldermanic district, never by street.
const OVERRIDES: Record<string, Override> = {
  [MPROP_RID]: {
    snapshot: true, districtColumns: ["GEO_ALDER"], keepCategories: ["YR_ASSMT"], currentColumn: "YR_ASSMT", tractColumn: "GEO_TRACT", baseColumn: "C_A_TOTAL",
    numberColumns: ["C_A_TOTAL", "C_A_LAND", "C_A_IMPRV", "BLDG_AREA", "NR_UNITS", "YR_BUILT"],
  },
};

export function withOverrides<P extends CityProfile>(p: P): P {
  const o = OVERRIDES[p.resourceId];
  if (!o) return p;
  const { keepCategories, ...set } = o;
  return { ...p, ...set, categories: p.categories.filter((c) => keepCategories.includes(c.column)) } as P;
}
```

`convex/lib/citySql.ts`:

1. `CountArgs`:

```ts
export interface CountArgs { from?: string; to?: string; filters?: { column: string; values?: string[]; over?: number; under?: number }[]; groupBy?: string }
```

2. Labels, next to `groupLabelFor`:

```ts
// Number filters and district groups in words ("assessed over $200,000", "Aldermanic district 6").
const NUMBER_WORDS: Record<string, { name: string; unit: "$" | "sq ft" | "" }> = {
  C_A_TOTAL: { name: "assessed", unit: "$" }, C_A_LAND: { name: "land assessed", unit: "$" }, C_A_IMPRV: { name: "buildings assessed", unit: "$" },
  BLDG_AREA: { name: "building area", unit: "sq ft" }, NR_UNITS: { name: "units", unit: "" }, YR_BUILT: { name: "built", unit: "" },
};
const numberLabel = (column: string, op: "over" | "under", x: number) => {
  const w = NUMBER_WORDS[column] ?? { name: column, unit: "" as const };
  const n = column === "YR_BUILT" ? String(x) : x.toLocaleString("en-US");
  return w.unit === "$" ? `${w.name} ${op} $${n}` : `${w.name} ${op} ${n}${w.unit ? ` ${w.unit}` : ""}`;
};
```

and change `groupLabelFor`:

```ts
export const groupLabelFor = (column: string, value: string) =>
  isOffenseColumn(column) ? offenseName(value) : column === "GEO_ALDER" ? `Aldermanic district ${value}` : value;
```

3. In `buildCount`, inside the `for (const f of a.filters ?? [])` loop, first thing:

```ts
    if (f.over !== undefined || f.under !== undefined) {
      const col = (p.numberColumns ?? []).find((c) => c.toLowerCase() === f.column.toLowerCase());
      if (!col) return { ok: false, status: "bad-column", column: f.column, columns: [...(p.numberColumns ?? []), ...p.categories.map((c) => c.column)] };
      if (f.over !== undefined) { numberWhere.push(`${num(col)} > ${coord(f.over)}`); filterLabels.push(numberLabel(col, "over", f.over)); }
      if (f.under !== undefined) { numberWhere.push(`${num(col)} < ${coord(f.under)}`); filterLabels.push(numberLabel(col, "under", f.under)); }
      continue;
    }
    const values = f.values ?? [];
```

Declare `const numberWhere: string[] = [];` next to `where`. In the rest of the loop, use `values` where it used `f.values`.

`bad-column` for a column that's neither a number column nor a category must list only those two sets. The owner columns are in neither. Also add `"columns"` safety: `p.categories` is already override-filtered.

4. The current-assessment filter and the snapshot period. Replace `if (p.dateColumn) {` with:

```ts
  const current = p.snapshot && p.currentColumn ? p.categories.find((c) => c.column === p.currentColumn)?.values[0]?.value : undefined;
  if (current) where.push(`${quoteId(p.currentColumn!)} = ${lit(current)}`);
  const asked = !absent(a.from) || !absent(a.to);
  if (p.snapshot && !asked) period = current ? `${current} assessment` : "all records";
  if (p.dateColumn && (!p.snapshot || asked)) {
```

At the end of that block, for a snapshot, prefix the period and skip the future count:

```ts
    period = `${p.snapshot ? "last sold " : ""}${human(from)} – ${human(to)}${notes.length ? ` (${notes.join("; ")})` : ""}`;
    if (to === today && !p.snapshot) futureSql = …; // unchanged expression
```

5. Number filters go into the count, its groups and its base. Replace the line `const whereSql = where.length ? … : "";` with:

```ts
  // Number filters exist only for files with numberColumns (the property file: a snapshot with no locations), so the
  // future-date count, the neighborhood points and the grid never see them; the count and its groups always do.
  const all = [...where, ...numberWhere];
  const whereSql = all.length ? ` WHERE ${all.join(" AND ")}` : "";
  const base = p.baseColumn ? [...where, `${num(p.baseColumn)} > 0`] : null;
  const ofSql = numberWhere.length && base ? `SELECT COUNT(*) AS n FROM ${table} WHERE ${base.join(" AND ")}` : null;
  const tractSql = numberWhere.length && base && p.tractColumn
    ? `SELECT ${quoteId(p.tractColumn)} AS t, SUM(CASE WHEN ${numberWhere.join(" AND ")} THEN 1 ELSE 0 END) AS hit, COUNT(*) AS n FROM ${table} WHERE ${base.join(" AND ")} GROUP BY ${quoteId(p.tractColumn)}`
    : null;
```

`groupSql` already uses `whereSql`, so groups get the number filters. Leave `futureSql`, `points` and `gridSql` as they are.

6. Grouping by a district column that has no stored values (GEO_ALDER):

```ts
  } else if (a.groupBy) {
    const district = p.districtColumns.find((d) => d.toLowerCase() === a.groupBy!.toLowerCase());
    const cat = menu.get(a.groupBy.toLowerCase()) ?? (district ? { column: district, values: [] } : undefined);
```

The rest is unchanged. Its `bad-column` list must also include `...p.districtColumns`.

7. Return `ofSql` and `tractSql` in the ok object, and add them to the `Built` type.

`convex/city.ts`:

1. `const vFilter = v.object({ column: v.string(), values: v.optional(v.array(v.string())), over: v.optional(v.number()), under: v.optional(v.number()) });`
2. `CountInput.filters` uses the same shape.
3. In `countContext`, return the profile with the overrides applied: `profile: profile ? withOverrides(profile) : null`. Import `withOverrides` from `./lib/cityProfile`. `withOverrides` is generic over `CityProfile`; `Doc<"cityProfiles">` is assignable, so the type stays `Doc<"cityProfiles">`.
4. `CountResult` ok gains `of?: { count: number; label: string }; tractMap?: { url: string; ids: string[]; total: number };`.
5. In `askCity`, in the citywide path after `futureExcluded`:

```ts
    const of = built.ofSql ? { count: cityCount((await datastoreSql<{ n: string }>(built.ofSql))[0]), label: "with an assessed value" } : undefined;
    let tractMap: { url: string; ids: string[]; total: number } | undefined;
    if (built.tractSql) {
      // Its own try: a failed tract query loses the map, never the count.
      try {
        const rows = await datastoreSql<{ t: unknown; hit: unknown; n: unknown }>(built.tractSql);
        const most = rows
          .map((r) => ({ id: tractGeoid(r.t), hit: Number(r.hit), n: Number(r.n) }))
          .filter((r): r is { id: string; hit: number; n: number } => r.id !== null && r.n >= MIN_HOMES && r.hit / r.n > 0.5)
          .sort((x, y) => y.hit / y.n - x.hit / x.n);
        const e02: Fam | null = await ctx.runQuery(internal.tracts.familyForTracts, { code: "E02" });
        const url = (e02?.members ?? []).filter((m) => m.place === "County").sort((x, y) => Number(y.year.slice(0, 4)) - Number(x.year.slice(0, 4)))[0]?.url;
        if (url) tractMap = { url, ids: most.slice(0, MAX_TRACT_SHAPES).map((r) => r.id), total: most.length };
      } catch (e) {
        console.error(`City tract shares failed for ${data.code}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
```

`askCity` takes `Plan` only, not `ctx`. Change its signature to `askCity(ctx: ActionCtx, plan: Plan)` and update both callers: `runCount`, and `convex/map.ts` if it calls `askCity`. Use `grep -n "askCity(" convex`. Import `tractGeoid`, `MIN_HOMES` from `./lib/propertyMeasures`, `type Fam` from `./tracts`, and define `const MAX_TRACT_SHAPES = 50; // the tract cards' cap (ui/lib/tractShapes.ts)`. Add `...(of ? { of } : {}), ...(tractMap ? { tractMap } : {})` to the returned ok object.

`lib/ask/tools.ts` countParams:

```ts
  filters: z.array(z.object({
    column: z.string(),
    values: z.array(z.string()).max(10).optional(),
    over: z.number().optional().describe("Number columns only (e.g. H28 C_A_TOTAL, the assessed value in dollars): count records above this"),
    under: z.number().optional().describe("Number columns only: count records below this"),
  })).max(4).optional(),
```

Append to the countRecords description:

` For the City's property file (H28): filter number columns with over/under (C_A_TOTAL is the assessed value in dollars), group by GEO_ALDER (aldermanic district); with no dates it counts the current assessment, and dates mean when a property last sold. Never list properties or name owners.`

- [ ] **Step 4: Run the tests, the smoke script and the whole suite**

Run: `npx vitest run tests/lib/citySqlProperty.test.ts convex/cityProperty.test.ts convex/city.test.ts && npx tsc --noEmit -p . && npx vitest run --maxWorkers=4`
Expected: all pass. The existing `convex/city.test.ts` must not change behaviour, since crime files have no override.

Then add to `scripts/city-sql-smoke.ts`:

```ts
// The property file's counts: the current assessment, over a cutoff, by district, its base and tract shares.
import { withOverrides } from "../convex/lib/cityProfile";
const mprop = withOverrides({ familyKey: "x", resourceId: MPROP_RID, columns: [], dateColumn: "CONVEY_DATE", districtColumns: [], categories: [{ column: "YR_ASSMT", values: [{ value: "2026", count: 1 }] }], rowCount: 1, minDate: "1900-01-01", maxDate: today, namesPeople: true, signature: "", updatedAt: Date.now() });
const pc = buildCount(mprop, { filters: [{ column: "C_A_TOTAL", over: 200000 }], groupBy: "GEO_ALDER" }, today);
if (!pc.ok) throw new Error(JSON.stringify(pc));
for (const sql of [pc.totalSql, pc.groupSql, pc.ofSql, pc.tractSql].filter((s): s is string => !!s)) console.log("OK", (await datastoreSql(sql)).length, "rows ·", sql.slice(0, 100));
```

Hoist the import, then run `npx tsx scripts/city-sql-smoke.ts`. Expected: four more `OK` lines. The total is near 83,000.

- [ ] **Step 5: Commit**

```bash
git add convex/lib/cityProfile.ts convex/lib/citySql.ts convex/city.ts convex/map.ts lib/ask/tools.ts scripts/city-sql-smoke.ts tests/lib/citySqlProperty.test.ts convex/cityProperty.test.ts
git commit -m "feat: count the property file over/under a value, by aldermanic district, for the current assessment

Fixes a hidden default: a no-date property count was the last 12 months of sales.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: The cards say it plainly: units, years, property notes, the count card

**Files:**
- Modify: `ui/lib/tractFormat.ts` (Unit, unitOf, valueText/rangeText/changeText)
- Modify: `ui/lib/tractSummary.ts` (years in words, place for property sides, `propertyNotes`, `propertyCountSummary`)
- Modify: `ui/components/TractCards.tsx` (unitOf, Head `leftOutWhy`, Fine property notes, export `TractMapSlot`)
- Modify: `ui/components/TractScatter.tsx:42` (unitOf)
- Modify: `ui/components/AskCards.tsx` (CountCard: plain sentence, `of`, tract map)
- Test: `tests/ui/tractFormat.test.ts`, `tests/ui/tractSummary.test.ts`

**Interfaces:**
- Consumes: `Header.leftOutWhy`, `EXACT` text `"exact (City records)"`, `CountResult.of`, `CountResult.tractMap` (Tasks 2–3).
- Produces:
  - `type Unit = "percent" | "dollars" | "year" | "plain"` and `unitOf(meaning: string): Unit` (`ui/lib/tractFormat.ts`). `valueText(v, unit: Unit | boolean)`; `true` still means percent and `false` plain, so existing callers keep working.
  - `propertyNotes(heads: { column: string; confidence: string | null }[]): string[]` and `propertyCountSummary(r): string` (`ui/lib/tractSummary.ts`).
  - `TractMapSlot` exported from `ui/components/TractCards.tsx`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/ui/tractFormat.test.ts`. Add `unitOf` to the existing import from `../../ui/lib/tractFormat`.

```ts
describe("units from the column's meaning", () => {
  it("knows percents, dollars and years, and prints each plainly", () => {
    expect(unitOf("Percentage of homes (houses and condos) assessed over $200,000")).toBe("percent");
    expect(unitOf("Median assessed value of homes (houses and condos)")).toBe("dollars");
    expect(unitOf("Median year built of houses")).toBe("year");
    expect(unitOf("Number of households")).toBe("plain");
    expect(valueText(245600, "dollars")).toBe("$245,600");
    expect(valueText(1925, "year")).toBe("1925");
    expect(valueText(1925.5, "year")).toBe("1926");
    expect(valueText(63.157, "percent")).toBe("63.2%");
  });
  it("shows no range for an exact value", () => {
    expect(rangeText({ value: 245600, lo: 245600, hi: 245600 }, "dollars")).toEqual({ value: "$245,600", span: null });
    expect(rangeText({ value: 12, lo: 9, hi: 16 }, "dollars")).toEqual({ value: "$12", span: "($9–$16)" });
  });
});
```

Append to `tests/ui/tractSummary.test.ts`. Add `propertyCountSummary, propertyNotes` to its import.

```ts
const home = { code: "H28", name: "Master Property File (MPROP)", column: "median_value", meaning: "Median assessed value of homes (houses and condos)", place: "City", year: "2026 assessment", confidence: "exact (City records)" };
const broadband = { code: "H04", name: "Households with Broadband Internet", column: "per_broadband", meaning: "Estimate - percentage of households with a broadband internet subscription of any kind", place: "County", year: "2023", confidence: "90% confidence (Census)" };

describe("property sentences", () => {
  it("names both years and keeps to the City when one side is property", () => {
    expect(relateSummary({ mode: "relate", a: home, b: broadband, n: 180, strength: "moderate", direction: "higher", fitsCount: 0, closeCount: 0 })).toBe(
      "Across 180 census tracts with reliable figures in the City of Milwaukee (2026 assessment and 2023 survey), where the median assessed value of homes (houses and condos) is higher, the percentage of households with a broadband internet subscription of any kind tends to be higher too. The pattern is moderate. That doesn't mean one causes the other.",
    );
  });
  it("ranks property without calling the assessment 'data'", () => {
    expect(rankSummary({ header: home, direction: "high", top: 10, tieCount: 0, unreliableCount: 0 })).toBe(
      "These are the 10 census tracts in the City of Milwaukee with the highest median assessed value of homes (houses and condos) (2026 assessment).",
    );
  });
  it("adds the property notes a card needs, once each", () => {
    expect(propertyNotes([home, broadband])).toEqual([
      "Assessed value is the City's figure for property taxes, not what a home would sell for.",
      "Property figures cover the City of Milwaukee; tracts on the City line count only their City part.",
      "A pattern across tracts doesn't tell you about any one home or family.",
    ]);
    expect(propertyNotes([{ column: "owner_share", confidence: "exact (City records)" }])[0]).toBe(
      "'Owner-occupied' means the owner's mailing address is the property's address; an owner who gets mail elsewhere isn't counted.",
    );
    expect(propertyNotes([{ column: "median_year_built", confidence: "exact (City records)" }])[0]).toBe("Year built is the main building's year.");
    expect(propertyNotes([broadband])).toEqual([]);
  });
  it("says a property count in a sentence, with the whole it came from", () => {
    expect(propertyCountSummary({ count: 83243, filters: ["assessed over $200,000"], period: "2026 assessment", of: { count: 151500, label: "with an assessed value" } })).toBe(
      "83,243 properties in the City of Milwaukee are assessed over $200,000 (2026 assessment), out of 151,500 with an assessed value. Assessed value is the City's figure for property taxes, not what a home would sell for.",
    );
  });
});
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run tests/ui/tractFormat.test.ts tests/ui/tractSummary.test.ts`
Expected: FAIL. `unitOf`, `propertyNotes` and `propertyCountSummary` don't exist yet.

- [ ] **Step 3: Write the implementation**

`ui/lib/tractFormat.ts`. Replace lines 10–29 (isPercent through changeText) with:

```ts
export const isPercent = (meaning: string) => /percent/i.test(meaning); // also matches "percentage"

// How a column's figures print, from DYCU's (or the property file's) own words for it, never guessed from the numbers.
export type Unit = "percent" | "dollars" | "year" | "plain";
export const unitOf = (meaning: string): Unit =>
  isPercent(meaning) ? "percent" : /assessed value/i.test(meaning) ? "dollars" : /\byear built\b/i.test(meaning) ? "year" : "plain";
// true / false keep the older percent-or-not callers working.
const asUnit = (u: Unit | boolean): Unit => (u === true ? "percent" : u === false ? "plain" : u);

const plain = (v: number) => sign(Math.abs(v) >= 100 ? Math.round(v).toLocaleString("en-US") : String(Math.round(v * 10) / 10));
const fixed = (v: number) => sign((Math.round(v * 10) / 10).toFixed(1));
const num = (v: number, u: Unit) => (u === "percent" ? fixed(v) : u === "year" ? String(Math.round(v)) : plain(v));
const wrap = (s: string, u: Unit) => (u === "dollars" ? (s.startsWith(MINUS) ? `${MINUS}$${s.slice(1)}` : `$${s}`) : s);

export const valueText = (v: number, unit: Unit | boolean) => {
  const u = asUnit(unit);
  return `${wrap(num(v, u), u)}${u === "percent" ? "%" : ""}`;
};

// The % closes the range ("(64.2–82.8%)"), as it does the value; dollars mark both ends. An exact value has no range.
export function rangeText(r: { value: number; lo: number | null; hi: number | null }, unit: Unit | boolean) {
  const u = asUnit(unit);
  const exact = r.lo !== null && r.hi !== null && r.lo === r.value && r.hi === r.value;
  return {
    value: valueText(r.value, u),
    span: r.lo === null || r.hi === null || exact ? null : `(${wrap(num(r.lo, u), u)}–${wrap(num(r.hi, u), u)}${u === "percent" ? "%" : ""})`,
  };
}

export function changeText(change: number, direction: "increase" | "decrease", unit: Unit | boolean) {
  const u = asUnit(unit);
  const n = wrap(num(Math.abs(change), u), u);
  return `${change < 0 ? MINUS : "+"}${n}${u === "percent" ? " points" : ""} (clear ${direction})`;
}
```

`ui/lib/tractSummary.ts`:

1. Add a years helper and use it. Replace `const where = \`${placeName(r.a.place)} (${r.a.year} data)\`;` in `relateSummary` with:

```ts
  // A property side covers the City only, and its year is an assessment, not a survey.
  const place = r.a.place === "City" || r.b.place === "City" ? "City" : r.a.place;
  const where = `${placeName(place)} (${yearsIn(r.a, r.b)})`;
```

Add near `placeName`:

```ts
const isAssessment = (year: string) => /assessment/i.test(year);
const yearIn = (year: string) => (isAssessment(year) ? year : `${year} data`);
// "2023 data" when both sides share a year; otherwise each named: "2026 assessment and 2023 survey".
const yearsIn = (a: { year: string }, b: { year: string }) =>
  a.year === b.year ? yearIn(a.year) : [a, b].map((s) => (isAssessment(s.year) ? s.year : `${s.year} survey`)).join(" and ");
```

In `rankSummary`, change `(${h.year} data)` to `(${yearIn(h.year)})`, in both the lead and the empty-ranking sentence.

2. The property notes and count sentence, appended:

```ts
const EXACT = "exact (City records)";
const NOTE = {
  value: "Assessed value is the City's figure for property taxes, not what a home would sell for.",
  owner: "'Owner-occupied' means the owner's mailing address is the property's address; an owner who gets mail elsewhere isn't counted.",
  built: "Year built is the main building's year.",
  city: "Property figures cover the City of Milwaukee; tracts on the City line count only their City part.",
  pattern: "A pattern across tracts doesn't tell you about any one home or family.",
};
// The property file's caveats for a card, in order, each once; nothing for a card without a property side.
export function propertyNotes(heads: { column: string; confidence: string | null }[]): string[] {
  const cols = heads.filter((h) => h.confidence === EXACT).map((h) => h.column);
  if (!cols.length) return [];
  const own = cols.flatMap((c) => (c === "owner_share" ? [NOTE.owner] : c === "median_year_built" ? [NOTE.built] : [NOTE.value]));
  return [...new Set([...own, NOTE.city, NOTE.pattern])];
}

export const propertyCountSummary = (r: { count: number; filters: string[]; period: string; of: { count: number; label: string } }) =>
  `${r.count.toLocaleString("en-US")} ${r.count === 1 ? "property" : "properties"} in the City of Milwaukee ${r.count === 1 ? "is" : "are"} ${r.filters.join(", ")} (${r.period}), out of ${r.of.count.toLocaleString("en-US")} ${r.of.label}. ${NOTE.value}`;
```

`ui/components/TractCards.tsx`:
- Import `unitOf` instead of `isPercent` (also in `TractScatter.tsx`). Replace each `isPercent(x.meaning)` with `unitOf(x.meaning)`. The variables (`pct`, `pa`, `pb`) now hold a `Unit`, and the `range`/`changeText`/`valueText` calls take them as-is.
- `Head` meta: `{h.leftOut ? \`, ${h.leftOut} left out (${h.leftOutWhy ?? "no data"})\` : ""}`.
- `Fine`: the heads prop gets `column`, then append the notes after the causal line:

```tsx
function Fine({ heads, causal, lead, onOpen }: { heads: { code: string; column: string; confidence: string | null }[]; causal?: boolean; lead?: string; onOpen: Open }) {
  …
      {lead && `${lead} `}Ranges are margins of error: {levels.join("; ")}.{bare && " Without a margin of error, findings can't be separated from noise."}{causal && " Related doesn't mean one causes the other."}{propertyNotes(heads).map((n) => ` ${n}`).join("")} Caveats:{" "}
```

  The callers already pass headers, which have `column`.
- `export { MapSlot as TractMapSlot };` after `MapSlot`'s definition.

`ui/components/AskCards.tsx`, in `CountCard`: after the `figcaption`, add the property sentence. Replace `{!noMap && <CountMap … />}` with the tract map when there is one:

```tsx
      {r.of && <p className={styles.tractSummary} data-summary>{propertyCountSummary({ ...r, of: r.of })}</p>}
      …
      {r.tractMap ? (
        <>
          <p className={styles.source}>Census tracts where more than half of the properties are {r.filters.join(", ")}: {r.tractMap.total}{r.tractMap.total > r.tractMap.ids.length ? ` (the first ${r.tractMap.ids.length} are drawn)` : ""}.</p>
          <TractMapSlot url={r.tractMap.url} fits={r.tractMap.ids} />
        </>
      ) : (
        !noMap && <CountMap r={r} id={id} args={args} />
      )}
```

Import `propertyCountSummary` from `@/ui/lib/tractSummary` and `TractMapSlot` from `./TractCards`.

- [ ] **Step 4: Run the tests and the whole suite**

Run: `npx vitest run tests/ui && npx tsc --noEmit -p . && npx vitest run --maxWorkers=4 && npm run build`
Expected: all pass, and the build compiles. The existing `tractFormat` tests (true/false callers) still pass unchanged.

- [ ] **Step 5: Commit**

```bash
git add ui/lib/tractFormat.ts ui/lib/tractSummary.ts ui/components/TractCards.tsx ui/components/TractScatter.tsx ui/components/AskCards.tsx tests/ui/tractFormat.test.ts tests/ui/tractSummary.test.ts
git commit -m "feat: property cards in plain words: dollars and years, both years named, the City's caveats

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Ask knows how: instructions, the scripted model, browser tests, report card, guide

**Files:**
- Modify: `lib/ask/prompt.ts` (one rule)
- Modify: `lib/ask/model.ts` (two scripts, placed before "poverty")
- Modify: `e2e/ask.spec.ts` (two signed-in tests)
- Modify: `scripts/ask-questions.ts` (three questions; keep the replaced guide example)
- Modify: `lib/ask/examples.ts` (one property example in place of the citizen asthma-data one)
- Test: `tests/ui/ask.test.ts` (prompt rule), the e2e files, `tests/ui/askExamples.test.ts` (existing)

**Interfaces:**
- Consumes: tool params from Tasks 2–3 (`cutoff`, `over`), `data-summary`, `[data-card=count]`, `[data-card=tract-relate]`.
- Produces: nothing later tasks consume.

- [ ] **Step 1: Write the failing tests**

In `tests/ui/ask.test.ts`, next to the existing `ASK_PROMPT` assertions:

```ts
    expect(ASK_PROMPT).toMatch(/never list properties/i);
    expect(ASK_PROMPT).toContain("Address Search");
```

In `e2e/ask.spec.ts`, inside `test.describe("signed in", …)` after the mismatch test:

```ts
  const cityUp = (page: import("@playwright/test").Page) =>
    page.request.get("https://data.milwaukee.gov/api/3/action/status_show").then((r) => r.ok()).catch(() => false);

  test("a property count says it plainly, by district, with the tracts on the map and no addresses", async ({ page }) => {
    test.skip(!(await cityUp(page)), "City API unreachable");
    await ask(page, "how many properties over 200000");
    const card = page.locator("[data-card=count]:visible");
    await expect(card.locator("[data-summary]")).toContainText(/^[\d,]+ properties in the City of Milwaukee are assessed over \$200,000 \(\d{4} assessment\), out of [\d,]+ with an assessed value\./, { timeout: 60_000 });
    await expect(card).toContainText("Aldermanic district");
    await expect(card.locator("[data-map][data-tracts]")).toBeVisible({ timeout: 30_000 });
    await expect(card).not.toContainText(/OWNER|TAXKEY/);
  });

  test("home values line up with broadband as exact City figures", async ({ page }) => {
    test.skip(!(await cityUp(page)) || !(await dycuUp(page)), "City or DYCU unreachable");
    await ask(page, "do home values go with broadband");
    const card = page.locator("[data-card=tract-relate]:visible");
    await expect(card.locator("[data-summary]")).toContainText("assessment and 2023 survey", { timeout: 60_000 });
    await expect(card).toContainText("exact (City records)");
    await expect(card).toContainText("Assessed value is the City's figure for property taxes");
  });
```

- [ ] **Step 2: Run the unit test to make sure it fails**

Run: `npx vitest run tests/ui/ask.test.ts`
Expected: FAIL, because the prompt has no property rule yet.

- [ ] **Step 3: Write the implementation**

`lib/ask/prompt.ts`. Add this rule after the "For datasets that name private people…" line:

```
- The City's property file (H28) names owners. Never list properties, addresses or owners. Answer property questions with counts (countRecords: over/under on C_A_TOTAL, grouped by GEO_ALDER for aldermanic districts) or tract measures (rankTracts and relateTracts with code H28: median_value, share_over or share_under with a cutoff in dollars, owner_share, median_year_built), which line up with DYCU's tract datasets. For one property, point the person to the City's Address Search (linked on H28's sheet).
```

`lib/ask/model.ts`. Extend the script comment line with `"over 200000" → countRecords H28 over $200,000 by district; "home values" → relateTracts H28 median_value × H04 per_broadband (County 2023)`. In the tool-choice chain, insert before `question.includes("rank tracts")`:

```ts
                : question.includes("over 200000")
                ? call("countRecords", { code: "H28", filters: [{ column: "C_A_TOTAL", over: 200000 }], groupBy: "GEO_ALDER" })
                : question.includes("home values")
                ? call("relateTracts", { a: { code: "H28", column: "median_value" }, b: { code: "H04", column: "per_broadband" }, place: "County", year: "2023", mode: "relate" })
```

The chain starts with `question.includes("thefts") || …`, so these become its second and third branches. Make sure neither question contains an earlier keyword.

`scripts/ask-questions.ts`. Add after the Ask analyzes block:

```ts
  // Property (H28): counts and tract measures, never a list of properties.
  { q: "How many homes in Milwaukee are assessed over $200,000?", tool: "countRecords", expect: { code: "H28", filter: "assessed over $200,000" }, final: true },
  { q: "Do neighborhoods with higher home values have more broadband?", tool: "relateTracts", expect: { confidence: "exact (City records)", mode: "relate" }, final: true },
  { q: "Where are home values high but food insecurity is also high?", tool: "relateTracts", expect: { confidence: "exact (City records)", mode: "mismatch" }, final: true },
  // A guide example that made room for the property one, kept on the card.
  { q: "Is there data on asthma in Milwaukee?", tool: "searchCatalog", expect: { code: "W01" } },
```

The count's output has `filters: ["assessed over $200,000"]`, so the `filter` expectation is a substring match on that JSON. Keep the key name `filter`, as the existing Harambee question does.

`lib/ask/examples.ts`. Replace the citizen line `{ role: "citizen", question: "Is there data on asthma in Milwaukee?", … }` with:

```ts
  { role: "citizen", question: "Do neighborhoods with higher home values have more broadband?", tool: "relateTracts", expect: { confidence: "exact (City records)" } },
```

- [ ] **Step 4: Run the unit tests, then the browser tests locally where possible**

Run: `npx vitest run --maxWorkers=4 && npx tsc --noEmit -p .`
Expected: all pass. That includes `askExamples.test.ts`: still 4 citizen examples, and each guide question appears once on the card.

The signed-in e2e tests need the Clerk test user, which only CI has. They run on the PR's preview. Locally, confirm they're listed: `npx playwright test e2e/ask.spec.ts --list | grep -E "property count|home values"`.

- [ ] **Step 5: Commit**

```bash
git add lib/ask/prompt.ts lib/ask/model.ts e2e/ask.spec.ts scripts/ask-questions.ts lib/ask/examples.ts tests/ui/ask.test.ts
git commit -m "feat: Ask answers property questions with counts and tract measures, never a list

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: The record: decision 029, DESIGN.md, the spec's year

**Files:**
- Create: `docs/decisions/029-property-overlap.md`
- Modify: `DESIGN.md` ("Analysis cards" section: a "Property figures" item)
- Modify: `docs/superpowers/specs/2026-10-11-property-overlap-design.md` (the 2026 correction)

**Interfaces:**
- Consumes: the shipped behaviour of Tasks 1–5.
- Produces: none.

- [ ] **Step 1: Write decision 029.** Use the house format from `docs/decisions/028-plain-analysis-cards.md`:
  - **Decision**
  - **Why this came up:** the screenshot question, and what was at stake: privacy, and counting the wrong thing.
  - **Options:**
    - A. Join by the City's own tract field (chosen);
    - B. Point-in-polygon from parcel outlines: heavier, and address-level;
    - C. List properties with addresses: rejected on privacy.

    Each with its cost.
  - **What we chose and why:** Tarik's calls on 2026-10-11 (counts + tract map; counts and overlap together; four measures). The verified facts: 210/213 tracts match, the 2026 assessment, masked columns, 5 thin tracts.
  - **What we gave up:**
    - City tracts only;
    - no change over time;
    - owner-occupied is an address-match rule;
    - assessed isn't market value;
    - no street-level detail.
  - **How we'll know:** the three report-card questions pass; no tool result ever carries an owner or address.
  - **What live testing changed:**
    - the 2026 year;
    - the hidden 12-month sale-date default;
    - `STREET`/`SDIR` dropped.
  - **What actually happened:** left blank.

  Define every technical term in one clause on first use: median, census tract, assessment, cache.

- [ ] **Step 2: Update DESIGN.md.** Under "Analysis cards", after the "Sizes" item, add:

```markdown
- **Property figures (H28, the City's property file):** a property side's range reads "exact (City records)" and draws no error bar; its year reads "2026 assessment", and a card that pairs it with DYCU names both ("2026 assessment and 2023 survey"). Dollars print with a $ and years without a comma. The footer adds the City's caveats once each: assessed value isn't a sale price; owner-occupied is an address match; year built is the main building's; figures cover the City only; a pattern across tracts says nothing about one home. A property count card leads with its sentence ("N properties in the City of Milwaukee are assessed over $X (2026 assessment), out of M with an assessed value."), lists aldermanic districts, and hatches the tracts where more than half of the properties pass, at most 50. Never an address, a street or an owner.
```

- [ ] **Step 3: Correct the spec.**
  - In §2, replace "2025 assessment" with "the file's current assessment (2026 when checked; read from the profile's most common YR_ASSMT)".
  - In §3, replace `"2025 assessment × 2023 survey"` with `"2026 assessment and 2023 survey"`.
  - Add one line to §2: "`STREET` and `SDIR` were profiled as categories; the H28 override drops them."

- [ ] **Step 4: Commit**

```bash
git add docs/decisions/029-property-overlap.md DESIGN.md docs/superpowers/specs/2026-10-11-property-overlap-design.md
git commit -m "docs: decision 029, property figures on the cards, the spec's 2026 correction

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Self-review (done while writing)

- **Spec coverage:**

  | Spec section | Covered by |
  |---|---|
  | §5 measures | Task 1 |
  | §6 tract tools | Task 2 |
  | §7 count, snapshot, districts, tract map | Task 3 |
  | §3 words, cards | Task 4 |
  | §8 privacy | Tasks 1–3 tests, plus the Task 5 prompt rule |
  | §9 testing | every task, plus the Task 5 e2e and report card |
  | §10 docs | Task 6 |

  §4's "compareYears refuses" is in Task 2. §11 (out of scope) is respected.
- **Placeholders:** none. Task 6 Step 1 describes a document whose content is fixed by the listed facts. The house format file is named.
- **Types:**
  - `PropertySide`, `propertySide`, `loadProperty`, `propertyHead`, `NO_PROPERTY`, `latestDefYear`, `Ready` (internal) are used consistently in Task 2.
  - `withOverrides`, `ofSql`, `tractSql`, `of`, `tractMap` are consistent across Tasks 3–4.
  - `Unit`/`unitOf` are consistent in Task 4.
  - `EXACT` text is identical in `propertyMeasures.ts` and `tractSummary.ts`. The UI keeps its own copy of the string, because UI files don't import Convex lib modules.
- **Review Focus:** all five lines have tests:
  1. Task 2 test 2 and Task 3 test 5;
  2. Task 3 test 1;
  3. Task 2 test 4;
  4. Task 2 test 3;
  5. Task 4 test 1.
