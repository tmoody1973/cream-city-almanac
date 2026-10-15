# Fire Department History (L3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ask answers "how many Fire Department calls each year" and "has time to dispatch or arrive changed since 2015" from a stored yearly summary covering 2015 to today.

**Architecture:**
- A hand-kept source list (`convex/lib/fireYears.ts`) says how to read each of the City's nine 2015–2023 Fire Incident Detail files and the newer MFD calls file. It covers columns, date shape, and the SQL that groups a year on the City's server.
- `fire:refreshFire` stores per-year rows (all / EMS / other: calls and dispatch/arrive medians) and per-year call types, in the stop-and-search pattern.
- A public query, `fire:fireHistory`, summarizes the stored rows (`convex/lib/fireHistory.ts`) for Ask's new `fireHistory` tool and a `FireHistoryCard`.

**Tech Stack:**
- Convex (internalAction, internalMutation, query, convex-test);
- City CKAN `datastore_search_sql`;
- Next.js and CopilotKit `useRenderTool`;
- Zod, Vitest and Playwright.

**Spec:** `docs/superpowers/specs/2026-10-14-fire-history-design.md`

## Global Constraints

- **Counts and medians only.** Never addresses, case numbers or single calls.
- **The AI writes no numbers.** Code computes every figure, and the card carries them.
- **2015–2023 files never change:** a counted year is skipped unless `force: true`. MFD years (2024 to the current year) are re-read every run.
- **A failed year keeps its last good rows,** and `fireRefresh` records `failed`. The refresh returns notes and never throws.
- **Timeouts:** each City query uses `SPAN_QUERY_TIMEOUT_MS` (25 s).
- **City firewall:** no `trim`, `extract` or `FILTER`, and no `left()` in WHERE. Use `LIKE '2025-%'` and `upper(x) = 'EMS'`.
- **Note texts, verbatim:**
  - SYSTEM: "From 2024 the City publishes calls from a new system (MFD Calls for Service); years before and after are close but not identical."
  - GAP: "Jan 1 – Feb 19, 2024 isn't in either file, so 2024 is short."
  - MINUTE: "2015–2017, 2019 and 2020 record times to the minute, so their medians are whole minutes."
  - TYPES: "Call types end in 2023; the new system has only broad types."
- **Source line:** "City of Milwaukee: Fire Incident Detail (2015–2023) and MFD Calls for Service Detail (2024 on)."
- **Permissions:** each dev Convex push or dev data run needs Tarik's explicit OK. Tarik runs prod data jobs. Never stage `.superpowers/` or `clerk-creamcityalmanac.app.zone`.
- **Commit trailer:** `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- **Decision 047:** "What actually happened" stays blank.

## Review Focus

1. **A year that failed or was never counted, inside the asked range.** The card must say which years are missing, not show a silent gap. Pinned in Task 3.
2. **A call type in another case or with spaces** ("auto fire ", "ems"). It must match the stored type. Pinned in Task 3.
3. **A range outside the data** (from 2010; from 2030). Clamp a partly-outside range, and refuse a fully-outside one with the data's span. Pinned in Task 3.
4. **Partial years.** 2024 is labeled "from Feb 20" and the current year "so far", in the card rows and the CSV. Pinned in Tasks 1 and 5.
5. **A type question with `group: "ems"`, or a time measure with `type`.** Type counts ignore the group; a time measure with a type is refused with the spec's reason. Pinned in Task 3.

---

### Task 1: Sources, date readers and year SQL (pure)

**Files:**
- Create: `convex/lib/fireYears.ts`
- Test: `tests/lib/fireYears.test.ts`

**Interfaces:**
- Produces:
  - `DateShape`, `FireCols`, `IncidentSource`, `YearQuery = { table: string; cols: FireCols; shape: DateShape; where: string[] }`
  - `INCIDENT_YEARS`, `MFD_FAMILY`, `MFD_COLS`, `LAST_TYPE_YEAR = 2023`
  - `readAt(col, shape): string`
  - `yearQuery(s: IncidentSource): YearQuery`
  - `mfdQuery(resourceId: string, year: number): YearQuery`
  - `groupSql(y)`, `allSql(y)`, `typesSql(y): string`
  - `FireGroup = "all" | "ems" | "other"`, `Span = { median: number; p90: number; n: number }`
  - `FireStats = { group: FireGroup; calls: number; dispatch: Span | null; arrive: Span | null; unreadable: number; backwards: number }`
  - `parseStats(r: Record<string, unknown>): FireStats`
  - `mergeTypes(rows: Record<string, unknown>[]): { type: string; calls: number }[]`
  - `mfdYears(current: number): number[]`
  - `partialNote(year: number, current: number): string | null`

- [ ] **Step 1: Write the failing tests** in `tests/lib/fireYears.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { allSql, groupSql, INCIDENT_YEARS, mergeTypes, mfdQuery, mfdYears, parseStats, partialNote, readAt, typesSql, yearQuery } from "../../convex/lib/fireYears";

describe("fire sources (L3)", () => {
  it("lists 2015–2023, with the 2020 column rename and the three date shapes", () => {
    expect(INCIDENT_YEARS.map((s) => s.year)).toEqual([2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023]);
    expect(INCIDENT_YEARS.find((s) => s.year === 2019)!.cols.received).toBe("Date Received");
    expect(INCIDENT_YEARS.find((s) => s.year === 2020)!.cols.received).toBe("Date_Received");
    expect(INCIDENT_YEARS.filter((s) => s.toMinute).map((s) => s.year)).toEqual([2015, 2016, 2017, 2019, 2020]);
    expect(INCIDENT_YEARS.find((s) => s.year === 2020)!.shape).toBe("mdy2-ampm");
  });
  it("reads each date shape by its pattern, never casting text that doesn't match", () => {
    expect(readAt("Date Received", "mdy4-minute")).toMatch(/^CASE WHEN "Date Received" ~ '.*' THEN to_timestamp\("Date Received", 'MM\/DD\/YYYY HH24:MI'\)::timestamp END$/);
    expect(readAt("Date_Received", "mdy2-ampm")).toContain("to_timestamp(\"Date_Received\", 'MM/DD/YY HH12:MI AM')");
    expect(readAt("Date_Received", "iso")).toContain("\"Date_Received\"::timestamp");
    // the patterns themselves: what each shape's regex accepts
    const rx = (shape: Parameters<typeof readAt>[1]) => new RegExp(readAt("x", shape).match(/~ '([^']+)'/)![1]);
    expect(rx("mdy4-minute").test("1/1/2015 8:07")).toBe(true);
    expect(rx("mdy4-minute").test("13/1/2015 8:07")).toBe(false);
    expect(rx("mdy2-ampm").test("01/01/20 12:08 AM")).toBe(true);
    expect(rx("mdy2-ampm").test("NULL")).toBe(false);
    expect(rx("iso").test("2021-01-01 00:00:33.533")).toBe(true);
  });
  it("groups a year into EMS and other, with medians in minutes, on the City's server", () => {
    const y = yearQuery(INCIDENT_YEARS[0]);
    const g = groupSql(y);
    expect(g).toContain('FROM "97509bea-dfa4-435e-aa75-5499adf7bbe0"');
    expect(g).toContain("CASE WHEN upper(\"Final Call for Service Type\") = 'EMS' THEN 'ems' ELSE 'other' END AS g");
    expect(g).toContain("percentile_cont(0.5) WITHIN GROUP (ORDER BY CASE WHEN d >= r THEN date_part('epoch', d - r) / 60 END) AS dmed");
    expect(g).toMatch(/GROUP BY g$/);
    expect(allSql(y)).toMatch(/^SELECT 'all' AS g, /);
    expect(allSql(y)).not.toContain("GROUP BY");
    expect(typesSql(y)).toBe('SELECT "Final Call for Service Type" AS t, COUNT(*) AS n FROM "97509bea-dfa4-435e-aa75-5499adf7bbe0" GROUP BY "Final Call for Service Type"');
  });
  it("reads one MFD year with LIKE and drops its Test calls", () => {
    const y = mfdQuery("cdf51c45-5fe3-415e-a08c-14ed134dcb64", 2025);
    expect(groupSql(y)).toContain(`WHERE "IncidentStarted" LIKE '2025-%' AND ("IncidentType" IS NULL OR "IncidentType" <> 'Test')`);
    expect(groupSql(y)).toContain('"IncidentStarted"::timestamp');
    expect(() => mfdQuery("not-a-resource", 2025)).toThrow();
  });
  it("parses the City's text numbers; a group with nothing measured has no span", () => {
    expect(parseStats({ g: "ems", calls: "100", dmed: "1.5", dp90: "3", dn: "98", amed: "5.9", ap90: "9", an: "95", unreadable: "1", backwards: "2" }))
      .toEqual({ group: "ems", calls: 100, dispatch: { median: 1.5, p90: 3, n: 98 }, arrive: { median: 5.9, p90: 9, n: 95 }, unreadable: 1, backwards: 2 });
    expect(parseStats({ g: "all", calls: "3", dmed: null, dp90: null, dn: "0", amed: null, ap90: null, an: "0", unreadable: "3", backwards: "0" }).dispatch).toBeNull();
  });
  it("merges type spellings, keeping the spelling with the most calls", () => {
    expect(mergeTypes([{ t: "EMS", n: "90" }, { t: "ems ", n: "10" }, { t: "Auto Fire", n: "5" }, { t: null, n: "3" }, { t: "", n: "1" }]))
      .toEqual([{ type: "EMS", calls: 100 }, { type: "Auto Fire", calls: 5 }]);
  });
  it("names MFD years and partial years (review focus 4)", () => {
    expect(mfdYears(2026)).toEqual([2024, 2025, 2026]);
    expect(partialNote(2024, 2026)).toBe("from Feb 20");
    expect(partialNote(2026, 2026)).toBe("so far");
    expect(partialNote(2025, 2026)).toBeNull();
  });
});
```

- [ ] **Step 2: Run them to watch them fail**

Run: `npx vitest run tests/lib/fireYears.test.ts`
Expected: FAIL, because `convex/lib/fireYears` doesn't exist.

- [ ] **Step 3: Write `convex/lib/fireYears.ts`**

```ts
import { quoteId } from "./cityProfile";
import { lit, RID } from "./citySql";

// Fire Department calls by year (spec 2026-10-14-fire-history §4). Hand-kept: the City's 2015–2023 yearly Fire
// Incident Detail files never change; their columns were renamed in 2020 and their dates come in three shapes.
// 2024 on is the MFD Calls for Service file (a newer system), read from its stored profile.
export type DateShape = "iso" | "mdy4-minute" | "mdy2-ampm";
export type FireCols = { received: string; dispatched: string; arrived: string; type: string };
export type IncidentSource = { year: number; resourceId: string; cols: FireCols; shape: DateShape; toMinute: boolean };
export type YearQuery = { table: string; cols: FireCols; shape: DateShape; where: string[] };

const SPACED: FireCols = { received: "Date Received", dispatched: "Date Dispatched", arrived: "Date Arrived", type: "Final Call for Service Type" };
const UNDERSCORED: FireCols = { received: "Date_Received", dispatched: "Date_Dispatched", arrived: "Date_Arrived", type: "Final_Call_for_Service_Type" };
export const INCIDENT_YEARS: IncidentSource[] = [
  { year: 2015, resourceId: "97509bea-dfa4-435e-aa75-5499adf7bbe0", cols: SPACED, shape: "mdy4-minute", toMinute: true },
  { year: 2016, resourceId: "5d2d6ce8-e4f6-4c41-a800-31e4eface37f", cols: SPACED, shape: "mdy4-minute", toMinute: true },
  { year: 2017, resourceId: "25a3fb9e-161c-416e-82da-6837c704b643", cols: SPACED, shape: "mdy4-minute", toMinute: true },
  { year: 2018, resourceId: "18d887be-4254-4386-b9b4-f1a8c016db38", cols: SPACED, shape: "iso", toMinute: false },
  { year: 2019, resourceId: "99b49b76-50e6-4b13-b61d-20e94078b310", cols: SPACED, shape: "mdy4-minute", toMinute: true },
  { year: 2020, resourceId: "8aae2885-b3ac-4ba9-a1e3-daab4464c835", cols: UNDERSCORED, shape: "mdy2-ampm", toMinute: true },
  { year: 2021, resourceId: "d1068a0d-b118-4a29-99c3-ee56c9c6f461", cols: UNDERSCORED, shape: "iso", toMinute: false },
  { year: 2022, resourceId: "b184f543-ce98-429d-99a4-3a2dddda3d98", cols: UNDERSCORED, shape: "iso", toMinute: false },
  { year: 2023, resourceId: "d18ef942-9630-4b82-b5a1-61fad0af422a", cols: UNDERSCORED, shape: "iso", toMinute: false },
];
export const MFD_FAMILY = "city:mfd-calls-for-service-detail";
export const MFD_COLS: FireCols = { received: "IncidentStarted", dispatched: "FirstUnitDispatched", arrived: "FirstUnitArrived", type: "IncidentType" };
const MFD_FROM = 2024; // its first record is 2024-02-20 05:46:50; Jan 1 – Feb 19, 2024 is in neither file
export const LAST_TYPE_YEAR = 2023;

// Each shape's pattern; text that doesn't match (blank, "NULL", another shape) is NULL, never cast.
// ponytail: a matched but impossible date (Feb 30) would fail the year's query; none seen in the nine files.
const ISO = "^(19|20)[0-9]{2}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01]) [0-9]{2}:[0-9]{2}(:[0-9]{2}([.][0-9]+)?)?$";
const MDY4 = "^(0?[1-9]|1[0-2])/(0?[1-9]|[12][0-9]|3[01])/(19|20)[0-9]{2} [0-9]{1,2}:[0-5][0-9]$";
const MDY2 = "^(0[1-9]|1[0-2])/(0[1-9]|[12][0-9]|3[01])/[0-9]{2} (0[1-9]|1[0-2]):[0-5][0-9] [AP]M$";
export function readAt(col: string, shape: DateShape): string {
  const q = quoteId(col);
  if (shape === "iso") return `CASE WHEN ${q} ~ ${lit(ISO)} THEN ${q}::timestamp END`;
  if (shape === "mdy4-minute") return `CASE WHEN ${q} ~ ${lit(MDY4)} THEN to_timestamp(${q}, 'MM/DD/YYYY HH24:MI')::timestamp END`;
  return `CASE WHEN ${q} ~ ${lit(MDY2)} THEN to_timestamp(${q}, 'MM/DD/YY HH12:MI AM')::timestamp END`;
}

const checked = (rid: string) => { if (!RID.test(rid)) throw new Error("Not a CKAN resource id"); return rid; };
export const yearQuery = (s: IncidentSource): YearQuery => ({ table: checked(s.resourceId), cols: s.cols, shape: s.shape, where: [] });
export const mfdQuery = (resourceId: string, year: number): YearQuery => ({
  table: checked(resourceId), cols: MFD_COLS, shape: "iso",
  where: [`${quoteId(MFD_COLS.received)} LIKE ${lit(`${year}-%`)}`, `(${quoteId(MFD_COLS.type)} IS NULL OR ${quoteId(MFD_COLS.type)} <> 'Test')`],
});

const present = (c: string) => { const q = quoteId(c); return `(${q} IS NOT NULL AND ${q} <> '' AND upper(${q}) <> 'NULL')`; };
const where = (y: YearQuery) => (y.where.length ? ` WHERE ${y.where.join(" AND ")}` : "");
const inner = (y: YearQuery) =>
  `SELECT ${readAt(y.cols.received, y.shape)} AS r, ${readAt(y.cols.dispatched, y.shape)} AS d, ${readAt(y.cols.arrived, y.shape)} AS a, ${present(y.cols.received)} AS hr, CASE WHEN upper(${quoteId(y.cols.type)}) = 'EMS' THEN 'ems' ELSE 'other' END AS g FROM ${quoteId(y.table)}${where(y)}`;
const mins = (t: "d" | "a") => `CASE WHEN ${t} >= r THEN date_part('epoch', ${t} - r) / 60 END`;
const MEASURES = [
  "COUNT(*) AS calls",
  `percentile_cont(0.5) WITHIN GROUP (ORDER BY ${mins("d")}) AS dmed`,
  `percentile_cont(0.9) WITHIN GROUP (ORDER BY ${mins("d")}) AS dp90`,
  "SUM(CASE WHEN d >= r THEN 1 ELSE 0 END) AS dn",
  `percentile_cont(0.5) WITHIN GROUP (ORDER BY ${mins("a")}) AS amed`,
  `percentile_cont(0.9) WITHIN GROUP (ORDER BY ${mins("a")}) AS ap90`,
  "SUM(CASE WHEN a >= r THEN 1 ELSE 0 END) AS an",
  "SUM(CASE WHEN hr AND r IS NULL THEN 1 ELSE 0 END) AS unreadable",
  "SUM(CASE WHEN d < r OR a < r THEN 1 ELSE 0 END) AS backwards",
].join(", ");
// The "all" row is its own query, so its medians are true medians, not a blend of the two groups'.
export const groupSql = (y: YearQuery) => `SELECT g, ${MEASURES} FROM (${inner(y)}) s GROUP BY g`;
export const allSql = (y: YearQuery) => `SELECT 'all' AS g, ${MEASURES} FROM (${inner(y)}) s`;
export const typesSql = (y: YearQuery) => `SELECT ${quoteId(y.cols.type)} AS t, COUNT(*) AS n FROM ${quoteId(y.table)}${where(y)} GROUP BY ${quoteId(y.cols.type)}`;

export type FireGroup = "all" | "ems" | "other";
export type Span = { median: number; p90: number; n: number };
export type FireStats = { group: FireGroup; calls: number; dispatch: Span | null; arrive: Span | null; unreadable: number; backwards: number };
const num = (x: unknown) => (x === null || x === undefined || x === "" ? null : Number(x));
const spanOf = (med: unknown, p90: unknown, n: unknown): Span | null => {
  const c = num(n) ?? 0, m = num(med), p = num(p90);
  return c > 0 && m !== null && p !== null ? { median: m, p90: p, n: c } : null;
};
export function parseStats(r: Record<string, unknown>): FireStats {
  return {
    group: r.g as FireGroup, calls: num(r.calls) ?? 0,
    dispatch: spanOf(r.dmed, r.dp90, r.dn), arrive: spanOf(r.amed, r.ap90, r.an),
    unreadable: num(r.unreadable) ?? 0, backwards: num(r.backwards) ?? 0,
  };
}

// "ems" and "EMS" are one type; the label is the spelling with the most calls. Blank types aren't a type.
export function mergeTypes(rows: Record<string, unknown>[]): { type: string; calls: number }[] {
  const by = new Map<string, { calls: number; spellings: Map<string, number> }>();
  for (const r of rows) {
    const t = typeof r.t === "string" ? r.t.trim() : "";
    if (!t) continue;
    const n = num(r.n) ?? 0;
    const e = by.get(t.toUpperCase()) ?? { calls: 0, spellings: new Map<string, number>() };
    e.calls += n;
    e.spellings.set(t, (e.spellings.get(t) ?? 0) + n);
    by.set(t.toUpperCase(), e);
  }
  return [...by.values()].map((e) => ({ type: [...e.spellings].sort((a, b) => b[1] - a[1])[0][0], calls: e.calls })).sort((a, b) => b.calls - a.calls);
}

export const mfdYears = (current: number) => Array.from({ length: Math.max(0, current - MFD_FROM + 1) }, (_, i) => MFD_FROM + i);
export const partialNote = (year: number, current: number) => (year === MFD_FROM ? "from Feb 20" : year === current ? "so far" : null);
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/lib/fireYears.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add convex/lib/fireYears.ts tests/lib/fireYears.test.ts
git commit -m "feat: Fire Department yearly sources, date readers and year SQL (L3)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Tables and the refresh

**Files:**
- Modify: `convex/validators.ts` (fire validators), `convex/schema.ts` (three tables)
- Create: `convex/fire.ts` (`fireStatus`, `mfdResource`, `replaceYear`, `markFireFailed`, `refreshFire`)
- Modify: `convex/build.ts` (weekly build calls `refreshFire` after `refreshTurnout`)
- Test: `convex/fire.test.ts`

**Interfaces:**
- Consumes: everything Task 1 produces.
- Produces:
  - `vFireRow`, `vFireType`, `vFireGroup`, `vFireSpan` in `convex/validators.ts`
  - tables `fireYears`, `fireTypes`, `fireRefresh` (each indexed `by_year`)
  - `internal.fire.refreshFire({ force?: boolean }): string[]`

- [ ] **Step 1: Write the failing tests** in `convex/fire.test.ts`:

```ts
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installFakeFetch } from "../tests/helpers/fakeFetch";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");
const MFD = "cdf51c45-5fe3-415e-a08c-14ed134dcb64";
const Y2018 = "18d887be-4254-4386-b9b4-f1a8c016db38";
beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-14T17:00:00Z")); });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

const stat = (g: string, calls: number) => ({ g, calls: String(calls), dmed: "1.5", dp90: "3", dn: String(calls - 2), amed: "5.9", ap90: "9", an: String(calls - 5), unreadable: "1", backwards: "2" });
// The City, faked: answers each of a year's three queries; `fail` makes the City refuse matching SQL.
function city(seen: string[], fail: (sql: string) => boolean = () => false) {
  return (sql: string) => {
    seen.push(sql);
    if (fail(sql)) throw new Error("refused");
    if (sql.includes(" AS t, ")) return [{ t: "EMS", n: "90" }, { t: "ems", n: "10" }, { t: "Auto Fire", n: "5" }];
    if (sql.includes("GROUP BY g")) return [stat("ems", 100), stat("other", 20)];
    return [stat("all", 120)];
  };
}
async function seed(withMfd = true) {
  const t = convexTest(schema, modules);
  if (withMfd) await t.run(async (ctx) => {
    await ctx.db.insert("cityProfiles", { familyKey: "city:mfd-calls-for-service-detail", resourceId: MFD, columns: [], dateColumn: null, districtColumns: [], categories: [], rowCount: 350530, minDate: null, maxDate: null, namesPeople: false, signature: "s", updatedAt: 0 });
  });
  return t;
}
const yearsIn = (t: Awaited<ReturnType<typeof seed>>) => t.run(async (ctx) => ({ rows: await ctx.db.query("fireYears").collect(), types: await ctx.db.query("fireTypes").collect(), status: await ctx.db.query("fireRefresh").collect() }));

describe("refreshFire (L3)", () => {
  it("stores 2015–2023 and the MFD years 2024–2026: three groups a year, types for the incident years", async () => {
    const t = await seed();
    const seen: string[] = [];
    installFakeFetch({ citySql: city(seen) });
    expect(await t.action(internal.fire.refreshFire, {})).toEqual([]);
    const { rows, types, status } = await yearsIn(t);
    expect([...new Set(rows.map((r) => r.year))].sort()).toEqual([2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026]);
    expect(rows.filter((r) => r.year === 2015).map((r) => r.group).sort()).toEqual(["all", "ems", "other"]);
    expect(rows.find((r) => r.year === 2015 && r.group === "all")).toMatchObject({ calls: 120, dispatch: { median: 1.5, p90: 3, n: 118 }, source: "incident", toMinute: true, partial: null });
    expect(rows.find((r) => r.year === 2024 && r.group === "all")).toMatchObject({ source: "mfd", partial: "from Feb 20", toMinute: false });
    expect(rows.find((r) => r.year === 2026 && r.group === "all")!.partial).toBe("so far");
    expect(types.filter((x) => x.year === 2015).map((x) => [x.type, x.calls])).toEqual([["EMS", 100], ["Auto Fire", 5]]);
    expect(types.some((x) => x.year >= 2024)).toBe(false);
    expect(status.every((s) => s.status === "counted")).toBe(true);
    expect(seen.some((s) => s.includes(`LIKE '2025-%'`))).toBe(true);
  });
  it("skips counted 2015–2023 years on the next run but re-reads the MFD years; force re-reads all", async () => {
    const t = await seed();
    installFakeFetch({ citySql: city([]) });
    await t.action(internal.fire.refreshFire, {});
    const again: string[] = [];
    installFakeFetch({ citySql: city(again) });
    await t.action(internal.fire.refreshFire, {});
    expect(again.some((s) => s.includes(Y2018))).toBe(false);
    expect(again.filter((s) => s.includes(MFD))).toHaveLength(6); // 3 MFD years × (group + all)
    const forced: string[] = [];
    installFakeFetch({ citySql: city(forced) });
    await t.action(internal.fire.refreshFire, { force: true });
    expect(forced.some((s) => s.includes(Y2018))).toBe(true);
  });
  it("keeps a failed year's last good figures and records the failure", async () => {
    const t = await seed();
    installFakeFetch({ citySql: city([]) });
    await t.action(internal.fire.refreshFire, {});
    installFakeFetch({ citySql: city([], (sql) => sql.includes(Y2018)) });
    const notes = await t.action(internal.fire.refreshFire, { force: true });
    expect(notes).toEqual([expect.stringMatching(/^Fire 2018: .*; kept any earlier figures$/)]);
    const { rows, status } = await yearsIn(t);
    expect(rows.filter((r) => r.year === 2018)).toHaveLength(3);
    expect(status.find((s) => s.year === 2018)!.status).toBe("failed");
  });
  it("notes when the MFD file isn't profiled, and still counts 2015–2023", async () => {
    const t = await seed(false);
    installFakeFetch({ citySql: city([]) });
    expect(await t.action(internal.fire.refreshFire, {})).toEqual(["Fire: the MFD calls file isn't profiled; 2024 on not counted"]);
    expect((await yearsIn(t)).rows.some((r) => r.year === 2023)).toBe(true);
  });
  it("treats a year with no calls as failed, not as zero", async () => {
    const t = await seed(false);
    installFakeFetch({ citySql: (sql: string) => (sql.includes(" AS t, ") ? [] : sql.includes("GROUP BY g") ? [] : [stat("all", 0)]) });
    const notes = await t.action(internal.fire.refreshFire, {});
    expect(notes.filter((n) => /no calls/.test(n))).toHaveLength(9);
    expect((await yearsIn(t)).rows).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run them to watch them fail**

Run: `npx vitest run convex/fire.test.ts`
Expected: FAIL, because `internal.fire` doesn't exist.

- [ ] **Step 3: Add the validators** to `convex/validators.ts`, after `vStopRow`:

```ts
// Fire Department history (spec 2026-10-14-fire-history §5).
export const vFireSpan = v.union(v.object({ median: v.number(), p90: v.number(), n: v.number() }), v.null());
export const vFireGroup = v.union(v.literal("all"), v.literal("ems"), v.literal("other"));
export const vFireRow = v.object({
  year: v.number(), group: vFireGroup, calls: v.number(), dispatch: vFireSpan, arrive: vFireSpan, unreadable: v.number(), backwards: v.number(),
  source: v.union(v.literal("incident"), v.literal("mfd")), partial: v.union(v.string(), v.null()), toMinute: v.boolean(),
});
export const vFireType = v.object({ type: v.string(), calls: v.number() });
```

- [ ] **Step 4: Add the tables** to `convex/schema.ts`, after `stopPeriods`, importing `vFireRow` and `vFireType`:

```ts
  fireYears: defineTable(vFireRow).index("by_year", ["year"]),
  fireTypes: defineTable({ year: v.number(), ...vFireType.fields }).index("by_year", ["year"]),
  fireRefresh: defineTable({ year: v.number(), status: v.union(v.literal("counted"), v.literal("failed")), note: v.optional(v.string()), counted: v.number() }).index("by_year", ["year"]),
```

- [ ] **Step 5: Write `convex/fire.ts`**

```ts
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery, type MutationCtx } from "./_generated/server";
import { chicagoDay } from "./lib/ask";
import { datastoreSql } from "./lib/ckan";
import { allSql, groupSql, INCIDENT_YEARS, MFD_FAMILY, mergeTypes, mfdQuery, mfdYears, parseStats, partialNote, typesSql, yearQuery, type YearQuery } from "./lib/fireYears";
import { SPAN_QUERY_TIMEOUT_MS } from "./lib/spanSql";
import { vFireRow, vFireType } from "./validators";

// Fire Department calls and response times by year, as stored totals (spec 2026-10-14-fire-history §5).
type Raw = Record<string, unknown>;
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export const fireStatus = internalQuery({
  args: {},
  handler: async (ctx) => (await ctx.db.query("fireRefresh").collect()).map(({ year, status }) => ({ year, status })),
});

export const mfdResource = internalQuery({
  args: {},
  handler: async (ctx) => (await ctx.db.query("cityProfiles").withIndex("by_family", (q) => q.eq("familyKey", MFD_FAMILY)).first())?.resourceId ?? null,
});

async function setRefresh(ctx: MutationCtx, p: { year: number; status: "counted" | "failed"; note?: string; counted: number }) {
  const old = await ctx.db.query("fireRefresh").withIndex("by_year", (q) => q.eq("year", p.year)).first();
  if (old) await ctx.db.replace(old._id, p);
  else await ctx.db.insert("fireRefresh", p);
}

// A year's rows replaced in one transaction, so a reader never sees half a year.
export const replaceYear = internalMutation({
  args: { year: v.number(), rows: v.array(vFireRow), types: v.array(vFireType) },
  handler: async (ctx, { year, rows, types }) => {
    for (const old of await ctx.db.query("fireYears").withIndex("by_year", (q) => q.eq("year", year)).collect()) await ctx.db.delete(old._id);
    for (const old of await ctx.db.query("fireTypes").withIndex("by_year", (q) => q.eq("year", year)).collect()) await ctx.db.delete(old._id);
    for (const r of rows) await ctx.db.insert("fireYears", r);
    for (const x of types) await ctx.db.insert("fireTypes", { year, ...x });
    await setRefresh(ctx, { year, status: "counted", counted: Date.now() });
  },
});

// A failed year keeps its rows; its status says failed, so the next run retries it.
export const markFireFailed = internalMutation({
  args: { year: v.number(), note: v.string() },
  handler: async (ctx, { year, note }) => {
    const old = await ctx.db.query("fireRefresh").withIndex("by_year", (q) => q.eq("year", year)).first();
    await setRefresh(ctx, { year, status: "failed", note, counted: old?.counted ?? 0 });
  },
});

async function countYear(y: YearQuery, withTypes: boolean) {
  const [groups, all, types] = await Promise.all([
    datastoreSql<Raw>(groupSql(y), SPAN_QUERY_TIMEOUT_MS),
    datastoreSql<Raw>(allSql(y), SPAN_QUERY_TIMEOUT_MS),
    withTypes ? datastoreSql<Raw>(typesSql(y), SPAN_QUERY_TIMEOUT_MS) : Promise.resolve([] as Raw[]),
  ]);
  const stats = [...all, ...groups].map(parseStats);
  if (!stats.find((s) => s.group === "all")?.calls) throw new Error("no calls in the City's file");
  return { stats, types: mergeTypes(types) };
}

// Weekly (build.finish) or alone: `npx convex run fire:refreshFire` (`'{"force":true}'` re-reads 2015–2023). Notes,
// never throws. Years go one at a time, so the City's server sees at most three queries at once.
export const refreshFire = internalAction({
  args: { force: v.optional(v.boolean()) },
  handler: async (ctx, { force }): Promise<string[]> => {
    const notes: string[] = [];
    const done = new Map((await ctx.runQuery(internal.fire.fireStatus, {})).map((s) => [s.year, s.status]));
    const current = Number(chicagoDay(Date.now()).slice(0, 4));
    const jobs: { year: number; query: YearQuery; source: "incident" | "mfd"; toMinute: boolean; types: boolean }[] = INCIDENT_YEARS
      .filter((s) => force || done.get(s.year) !== "counted")
      .map((s) => ({ year: s.year, query: yearQuery(s), source: "incident", toMinute: s.toMinute, types: true }));
    const mfd = await ctx.runQuery(internal.fire.mfdResource, {});
    if (!mfd) notes.push("Fire: the MFD calls file isn't profiled; 2024 on not counted");
    else for (const year of mfdYears(current)) jobs.push({ year, query: mfdQuery(mfd, year), source: "mfd", toMinute: false, types: false });
    for (const j of jobs) {
      try {
        const { stats, types } = await countYear(j.query, j.types);
        const rows = stats.map((s) => ({ ...s, year: j.year, source: j.source, partial: partialNote(j.year, current), toMinute: j.toMinute }));
        await ctx.runMutation(internal.fire.replaceYear, { year: j.year, rows, types });
      } catch (e) {
        notes.push(`Fire ${j.year}: ${message(e)}; kept any earlier figures`);
        await ctx.runMutation(internal.fire.markFireFailed, { year: j.year, note: message(e) });
      }
    }
    return notes;
  },
});
```

- [ ] **Step 6: Wire the weekly build.** In `convex/build.ts`, after the `turnoutNotes` block:

```ts
    let fireNotes: string[];
    try {
      fireNotes = await ctx.runAction(internal.fire.refreshFire, {});
    } catch (e) {
      fireNotes = [`Fire history refresh failed: ${message(e)}`];
    }
```

Add `...fireNotes` to the `completeBuild` notes array.

- [ ] **Step 7: Run the tests and the build tests**

Run: `npx convex codegen && npx vitest run convex/fire.test.ts convex/build.test.ts tests/lib/fireYears.test.ts`
Expected: PASS. `npx convex codegen` only rewrites local type files; it is not a dev push.

- [ ] **Step 8: Typecheck and commit**

Run: `npx tsc --noEmit -p . && npx tsc --noEmit -p convex`

```bash
git add convex/validators.ts convex/schema.ts convex/fire.ts convex/fire.test.ts convex/build.ts convex/_generated/api.d.ts
git commit -m "feat: refreshFire stores Fire Department calls and response times by year, 2015 to now (L3)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: The summary and the `fireHistory` query

**Files:**
- Create: `convex/lib/fireHistory.ts`
- Modify: `convex/fire.ts` (add the public `fireHistory` query)
- Test: `tests/lib/fireHistory.test.ts`, `convex/fire.test.ts`

**Interfaces:**
- Consumes: `FireGroup`, `Span`, `LAST_TYPE_YEAR` (Task 1); `vFireGroup` and the `fireYears`/`fireTypes` tables (Task 2).
- Produces:
  - `FireArgs = { measure: "calls" | "dispatch" | "arrive"; group?: FireGroup; type?: string; from?: number; to?: number }`
  - `FireOut = { year: number; calls: number; median: number | null; p90: number | null; n: number | null; partial: string | null }`
  - `FireResult`:
    - `{ status: "ok"; title; measure; group; type: string | null; rows: FireOut[]; notes: string[]; source: string; types: string[] }`
    - `| { status: "choose"; asked: string; choices: string[] }`
    - `| { status: "refused"; reason: string }`
  - `summarize(rows, types, a): FireResult`
  - `FIRE_SOURCE`
  - `api.fire.fireHistory(FireArgs): FireResult`

- [ ] **Step 1: Write the failing tests** in `tests/lib/fireHistory.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { summarize, type StoredRow } from "../../convex/lib/fireHistory";

const span = (median: number) => ({ median, p90: median * 2, n: 100 });
const row = (year: number, group: "all" | "ems" | "other", over: Partial<StoredRow> = {}): StoredRow => ({
  year, group, calls: group === "all" ? 120 : group === "ems" ? 100 : 20, dispatch: span(1.5), arrive: span(5.9), unreadable: 1, backwards: 2,
  source: year >= 2024 ? "mfd" : "incident", partial: year === 2024 ? "from Feb 20" : year === 2026 ? "so far" : null, toMinute: [2015, 2016, 2017, 2019, 2020].includes(year), ...over,
});
const YEARS = [2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026];
const rows = YEARS.flatMap((y) => [row(y, "all"), row(y, "ems"), row(y, "other")]);
const types = YEARS.filter((y) => y <= 2023).flatMap((year) => [{ year, type: year === 2015 ? "ems" : "EMS", calls: 100 }, { year, type: "Auto Fire", calls: 5 }]);

describe("fireHistory summary (L3)", () => {
  it("refuses before the first refresh", () => {
    expect(summarize([], [], { measure: "calls" })).toEqual({ status: "refused", reason: "Fire Department history hasn't been built yet." });
  });
  it("gives calls per year 2015 to now, with the system-change, gap and so-far notes", () => {
    const r = summarize(rows, types, { measure: "calls" });
    if (r.status !== "ok") throw new Error(r.status);
    expect(r.title).toBe("Milwaukee Fire Department · calls · 2015–2026");
    expect(r.rows).toHaveLength(12);
    expect(r.rows[0]).toEqual({ year: 2015, calls: 120, median: null, p90: null, n: null, partial: null });
    expect(r.rows.find((x) => x.year === 2024)!.partial).toBe("from Feb 20");
    expect(r.notes).toEqual([
      "From 2024 the City publishes calls from a new system (MFD Calls for Service); years before and after are close but not identical.",
      "Jan 1 – Feb 19, 2024 isn't in either file, so 2024 is short.",
      "2026 so far.",
    ]);
    expect(r.types).toEqual(["EMS", "Auto Fire"]);
  });
  it("gives a time measure for EMS with the minute note and the unmeasured count", () => {
    const r = summarize(rows, types, { measure: "arrive", group: "ems", from: 2015, to: 2018 });
    if (r.status !== "ok") throw new Error(r.status);
    expect(r.title).toBe("Milwaukee Fire Department · time to arrive · EMS · 2015–2018");
    expect(r.rows[0]).toEqual({ year: 2015, calls: 100, median: 5.9, p90: 11.8, n: 100, partial: null });
    expect(r.notes).toEqual(["2015–2017, 2019 and 2020 record times to the minute, so their medians are whole minutes.", "12 records had unreadable times or times that run backwards and weren't measured."]);
  });
  it("matches a call type in any case and cuts the range at 2023 (review focus 2, 5)", () => {
    const r = summarize(rows, types, { measure: "calls", type: " auto fire ", group: "ems" });
    if (r.status !== "ok") throw new Error(r.status);
    expect(r.type).toBe("Auto Fire");
    expect(r.group).toBe("all");
    expect(r.title).toBe("Milwaukee Fire Department · Auto Fire calls · 2015–2023");
    expect(r.rows.map((x) => x.calls)).toEqual(Array(9).fill(5));
    expect(r.notes).toContain("Call types end in 2023; the new system has only broad types.");
    const ems = summarize(rows, types, { measure: "calls", type: "EMS", from: 2015, to: 2016 });
    if (ems.status !== "ok") throw new Error(ems.status);
    expect(ems.rows.map((x) => x.calls)).toEqual([100, 100]);
  });
  it("offers the top types for an unknown type, and refuses a time measure by type (review focus 5)", () => {
    expect(summarize(rows, types, { measure: "calls", type: "Dragon" })).toEqual({ status: "choose", asked: "Dragon", choices: ["EMS", "Auto Fire"] });
    expect(summarize(rows, types, { measure: "dispatch", type: "Auto Fire" })).toEqual({ status: "refused", reason: "Response times are by EMS versus other calls, not by call type." });
  });
  it("clamps a range that runs past the data, and refuses one entirely outside it (review focus 3)", () => {
    const r = summarize(rows, types, { measure: "calls", from: 2010, to: 2016 });
    if (r.status !== "ok") throw new Error(r.status);
    expect(r.rows.map((x) => x.year)).toEqual([2015, 2016]);
    expect(summarize(rows, types, { measure: "calls", from: 2030 })).toEqual({ status: "refused", reason: "No Fire Department years in that range; the data runs 2015–2026." });
  });
  it("says which years in the range have no stored figures (review focus 1)", () => {
    const r = summarize(rows.filter((x) => x.year !== 2018), types, { measure: "calls", from: 2015, to: 2020 });
    if (r.status !== "ok") throw new Error(r.status);
    expect(r.rows.map((x) => x.year)).toEqual([2015, 2016, 2017, 2019, 2020]);
    expect(r.notes).toContain("No figures are stored for 2018.");
  });
});
```

Append to `convex/fire.test.ts` (add `api` to the `_generated/api` import):

```ts
describe("fireHistory query (L3)", () => {
  it("summarizes what refreshFire stored", async () => {
    const t = await seed();
    installFakeFetch({ citySql: city([]) });
    await t.action(internal.fire.refreshFire, {});
    expect(await t.query(api.fire.fireHistory, { measure: "dispatch", from: 2021, to: 2021 })).toMatchObject({ status: "ok", rows: [{ year: 2021, calls: 120, median: 1.5, p90: 3, n: 118 }] });
  });
});
```

- [ ] **Step 2: Run them to watch them fail**

Run: `npx vitest run tests/lib/fireHistory.test.ts convex/fire.test.ts`
Expected: FAIL, because `convex/lib/fireHistory` doesn't exist and `api.fire.fireHistory` is undefined.

- [ ] **Step 3: Write `convex/lib/fireHistory.ts`**

```ts
import { LAST_TYPE_YEAR, type FireGroup, type Span } from "./fireYears";

// fireHistory's summary of the stored years (spec 2026-10-14-fire-history §6): code computes every figure.
export type StoredRow = { year: number; group: FireGroup; calls: number; dispatch: Span | null; arrive: Span | null; unreadable: number; backwards: number; source: "incident" | "mfd"; partial: string | null; toMinute: boolean };
export type StoredType = { year: number; type: string; calls: number };
export type FireArgs = { measure: "calls" | "dispatch" | "arrive"; group?: FireGroup; type?: string; from?: number; to?: number };
export type FireOut = { year: number; calls: number; median: number | null; p90: number | null; n: number | null; partial: string | null };
export type FireResult =
  | { status: "ok"; title: string; measure: FireArgs["measure"]; group: FireGroup; type: string | null; rows: FireOut[]; notes: string[]; source: string; types: string[] }
  | { status: "choose"; asked: string; choices: string[] }
  | { status: "refused"; reason: string };

export const FIRE_SOURCE = "City of Milwaukee: Fire Incident Detail (2015–2023) and MFD Calls for Service Detail (2024 on).";
const SYSTEM = "From 2024 the City publishes calls from a new system (MFD Calls for Service); years before and after are close but not identical.";
const GAP = "Jan 1 – Feb 19, 2024 isn't in either file, so 2024 is short.";
const MINUTE = "2015–2017, 2019 and 2020 record times to the minute, so their medians are whole minutes.";
const TYPES = "Call types end in 2023; the new system has only broad types.";
const NAME = { calls: "calls", dispatch: "time to dispatch", arrive: "time to arrive" } as const;
const GROUP_TAG = { all: "", ems: " · EMS", other: " · non-EMS calls" } as const;
const refused = (reason: string): FireResult => ({ status: "refused", reason });
const key = (s: string) => s.trim().toUpperCase();

// Types across all years, merged by spelling ("ems" = "EMS"), most calls first; the label is the commonest spelling.
function typeTotals(types: StoredType[]): { type: string; calls: number }[] {
  const by = new Map<string, { calls: number; spellings: Map<string, number> }>();
  for (const t of types) {
    const e = by.get(key(t.type)) ?? { calls: 0, spellings: new Map<string, number>() };
    e.calls += t.calls;
    e.spellings.set(t.type, (e.spellings.get(t.type) ?? 0) + t.calls);
    by.set(key(t.type), e);
  }
  return [...by.values()].sort((a, b) => b.calls - a.calls).map((e) => ({ type: [...e.spellings].sort((x, y) => y[1] - x[1])[0][0], calls: e.calls }));
}

export function summarize(rows: StoredRow[], types: StoredType[], a: FireArgs): FireResult {
  if (!rows.length) return refused("Fire Department history hasn't been built yet.");
  if (a.type?.trim() && a.measure !== "calls") return refused("Response times are by EMS versus other calls, not by call type.");
  const totals = typeTotals(types);
  let type: string | null = null;
  if (a.type?.trim()) {
    const hit = totals.find((t) => key(t.type) === key(a.type!));
    if (!hit) return { status: "choose", asked: a.type, choices: totals.slice(0, 12).map((t) => t.type) };
    type = hit.type;
  }
  const group: FireGroup = type ? "all" : a.group ?? "all";
  const years = [...new Set(rows.map((r) => r.year))].sort((x, y) => x - y);
  const first = years[0], last = years[years.length - 1];
  const lo = Math.max(a.from ?? first, first);
  let hi = Math.min(a.to ?? last, last);
  const notes: string[] = [];
  if (type && hi > LAST_TYPE_YEAR) { hi = LAST_TYPE_YEAR; notes.push(TYPES); }
  const picked = rows.filter((r) => r.group === group && r.year >= lo && r.year <= hi).sort((x, y) => x.year - y.year);
  if (!picked.length) return refused(`No Fire Department years in that range; the data runs ${first}–${last}.`);
  const out: FireOut[] = picked.map((r) => {
    if (type) return { year: r.year, calls: types.filter((t) => t.year === r.year && key(t.type) === key(type!)).reduce((s, t) => s + t.calls, 0), median: null, p90: null, n: null, partial: r.partial };
    const s = a.measure === "calls" ? null : r[a.measure];
    return { year: r.year, calls: r.calls, median: s?.median ?? null, p90: s?.p90 ?? null, n: a.measure === "calls" ? null : s?.n ?? 0, partial: r.partial };
  });
  const ys = out.map((r) => r.year);
  const missing = [];
  for (let y = ys[0]; y <= ys[ys.length - 1]; y++) if (!ys.includes(y)) missing.push(y);
  if (missing.length) notes.push(`No figures are stored for ${missing.join(", ")}.`);
  if (ys.some((y) => y >= 2024) && ys.some((y) => y <= 2023)) notes.push(SYSTEM);
  if (ys.includes(2024)) notes.push(GAP);
  if (a.measure !== "calls") {
    if (picked.some((r) => r.toMinute)) notes.push(MINUTE);
    const bad = picked.reduce((s, r) => s + r.unreadable + r.backwards, 0);
    if (bad) notes.push(`${bad.toLocaleString("en-US")} records had unreadable times or times that run backwards and weren't measured.`);
  }
  const soFar = picked.find((r) => r.partial === "so far");
  if (soFar) notes.push(`${soFar.year} so far.`);
  const title = `Milwaukee Fire Department · ${type ? `${type} calls` : NAME[a.measure]}${type ? "" : GROUP_TAG[group]} · ${ys[0]}–${ys[ys.length - 1]}`;
  return { status: "ok", title, measure: a.measure, group, type, rows: out, notes, source: FIRE_SOURCE, types: totals.slice(0, 12).map((t) => t.type) };
}
```

Note: in the "calls" test, `notes` must not include the missing-years note (none missing). Its order is missing, SYSTEM, GAP, MINUTE, unmeasured, so-far, and the expected arrays above follow that order.

- [ ] **Step 4: Add the query** to `convex/fire.ts`:

```ts
import { query } from "./_generated/server"; // join the existing server import
import { summarize, type FireResult } from "./lib/fireHistory";
import { vFireGroup } from "./validators"; // join the existing validators import

// Ask's fireHistory: the stored years, filtered and labeled by code. Public: yearly totals, no City request.
export const fireHistory = query({
  args: { measure: v.union(v.literal("calls"), v.literal("dispatch"), v.literal("arrive")), group: v.optional(vFireGroup), type: v.optional(v.string()), from: v.optional(v.number()), to: v.optional(v.number()) },
  handler: async (ctx, a): Promise<FireResult> => {
    const rows = (await ctx.db.query("fireYears").collect()).map(({ _id, _creationTime, ...r }) => r);
    const types = (await ctx.db.query("fireTypes").collect()).map(({ _id, _creationTime, ...t }) => t);
    return summarize(rows, types, a);
  },
});
```

- [ ] **Step 5: Run the tests**

Run: `npx convex codegen && npx vitest run tests/lib/fireHistory.test.ts convex/fire.test.ts`
Expected: PASS (7 + 6 tests).

- [ ] **Step 6: Typecheck and commit**

Run: `npx tsc --noEmit -p . && npx tsc --noEmit -p convex`

```bash
git add convex/lib/fireHistory.ts convex/fire.ts tests/lib/fireHistory.test.ts convex/fire.test.ts convex/_generated/api.d.ts
git commit -m "feat: fireHistory summarizes the stored years: calls, times, types and their notes (L3)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Ask uses `fireHistory`

**Files:**
- Modify: `lib/ask/tools.ts`, `lib/ask/backend.ts`, `scripts/ask-report-card.ts`, `lib/ask/prompt.ts`, `lib/ask/model.ts`, `scripts/ask-questions.ts`
- Modify the test backends: `tests/ui/ask.test.ts`, `tests/ui/askTools.test.ts`
- Test: `tests/ui/askTools.test.ts`

**Interfaces:**
- Consumes: `api.fire.fireHistory` (Task 3).
- Produces:
  - `export type FireAnswer = FunctionReturnType<typeof api.fire.fireHistory>`
  - `export const fireParams`
  - `"fireHistory"` in `AskToolName`
  - `AskBackend.fire(a: z.infer<typeof fireParams>): Promise<FireAnswer>`

- [ ] **Step 1: Write the failing test.** In `tests/ui/askTools.test.ts`:
  - add `fire: async () => ({ status: "refused", reason: "" }) as never,` to `backend()` next to `zip:`;
  - add the same line to the backend stub in `tests/ui/ask.test.ts`;
  - append:

```ts
describe("fireHistory (L3)", () => {
  it("offers fireHistory for Fire Department years, passing the asked measure", async () => {
    let asked: unknown;
    const tool = askTools({ ...backend({}), fire: async (a) => { asked = a; return { status: "refused", reason: "" } as never; } }).find((t) => t.name === "fireHistory")!;
    expect(tool.description).toMatch(/2015/);
    expect(tool.description).toMatch(/types run 2015–2023 only/i);
    await tool.execute({ measure: "arrive", group: "ems" } as never);
    expect(asked).toEqual({ measure: "arrive", group: "ems" });
    expect(ASK_PROMPT).toMatch(/fireHistory/);
  });
});
```

- [ ] **Step 2: Run it to watch it fail**

Run: `npx vitest run tests/ui/askTools.test.ts`
Expected: FAIL with "Cannot read properties of undefined (reading 'description')".

- [ ] **Step 3: Change `lib/ask/tools.ts`**

- `export type FireAnswer = FunctionReturnType<typeof api.fire.fireHistory>;` next to `ZipAnswer`.
- `| "fireHistory"` in `AskToolName`.
- In `AskBackend`: `fire(a: z.infer<typeof fireParams>): Promise<FireAnswer>;`
- Next to `zipParams`:

```ts
export const fireParams = z.object({
  measure: z.enum(["calls", "dispatch", "arrive"]).describe("calls, time to dispatch, or time to arrive"),
  group: z.enum(["all", "ems", "other"]).optional().describe("EMS calls, other calls, or all (default)"),
  type: z.string().max(80).optional().describe("A call type such as Auto Fire, for calls only"),
  from: z.number().int().optional(),
  to: z.number().int().optional(),
});
```

- After the `zipProfile` tool:

```ts
    {
      name: "fireHistory",
      description: "Milwaukee Fire Department calls and response times by year, 2015 to now, from stored yearly totals: calls per year (all, EMS, or other; or one call type), and median time to dispatch or time to arrive. Call types run 2015–2023 only. One year's details, by ZIP, place or type, stay with countRecords and timeSpan. If it returns choose, pick a type from its choices and call again; if refused, tell the person why. The card carries every figure and note; don't restate them.",
      parameters: fireParams,
      execute: (a: z.infer<typeof fireParams>) => b.fire(a),
    },
```

- [ ] **Step 4: Wire the backends**

- `lib/ask/backend.ts`: `fire: (a) => fetchQuery(api.fire.fireHistory, a),`
- `scripts/ask-report-card.ts`: `fire: async (a) => run("fire:fireHistory", a),`

- [ ] **Step 5: Prompt, scripted model, graded question**

- `lib/ask/prompt.ts`, after the zipProfile line:

```
- Fire Department calls or response times across years (2015 to now) go to fireHistory; one year's details, by ZIP or place, stay with countRecords and timeSpan.
```

- `lib/ask/model.ts`: add, as the **first** tool-call branch of the chain (before any other `question.includes(...)` call branch, so no earlier keyword catches it):

```ts
                question.includes("fire calls each year")
                ? call("fireHistory", { measure: "calls" })
                :
```

  Add `"fire calls each year" → fireHistory calls;` to the doc comment's keyword list.

- `scripts/ask-questions.ts`, after the ZIP question:

```ts
  { q: "Has the Fire Department's time to arrive changed since 2015?", tool: "fireHistory", expect: { status: "ok", measure: "arrive" }, final: true },
```

- [ ] **Step 6: Run the tests and typecheck**

Run: `npx vitest run tests/ui && npx tsc --noEmit -p .`
Expected: PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add lib/ask scripts/ask-report-card.ts scripts/ask-questions.ts tests/ui/ask.test.ts tests/ui/askTools.test.ts
git commit -m "feat: Ask answers Fire Department questions across years with fireHistory (L3)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: The card, follow-ups and share link

**Files:**
- Create: `ui/lib/fireText.ts`, `ui/components/FireHistoryCard.tsx`
- Modify: `ui/components/AskCards.tsx` (renderer), `ui/lib/shareCard.ts` and `convex/shares.ts` (share), `tests/ui/shareCard.test.ts` (SHAREABLE list)
- Test: `tests/ui/fireText.test.ts`

**Interfaces:**
- Consumes: `FireAnswer`, `fireParams` (Task 4); `durationText` from `ui/lib/spanText.ts`.
- Produces:
  - `FireOk`
  - `yearLabel(r)`
  - `fireHead(r)`, `fireCells(r, x)`
  - `fireExport(r, ctx): CardExport`
  - `fireFollowUps(r): FollowUp[]`
  - `fireChoices(r): FollowUp[]`

- [ ] **Step 1: Write the failing tests** in `tests/ui/fireText.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { fireCells, fireChoices, fireExport, fireFollowUps, fireHead, yearLabel, type FireOk } from "../../ui/lib/fireText";

const base: FireOk = {
  status: "ok", title: "Milwaukee Fire Department · time to arrive · 2023–2024", measure: "arrive", group: "all", type: null,
  rows: [{ year: 2023, calls: 121073, median: 5.93, p90: 9.1, n: 118000, partial: null }, { year: 2024, calls: 119483, median: 6.1, p90: 9.4, n: 117000, partial: "from Feb 20" }],
  notes: ["Jan 1 – Feb 19, 2024 isn't in either file, so 2024 is short."], source: "City of Milwaukee: Fire Incident Detail (2015–2023) and MFD Calls for Service Detail (2024 on).", types: ["EMS", "Alarm Sounding"],
};
const ctx = { origin: "https://x", date: "October 14, 2026" };

describe("Fire history card words (L3)", () => {
  it("labels partial years (review focus 4)", () => {
    expect(yearLabel(base.rows[1])).toBe("2024 (from Feb 20)");
    expect(yearLabel(base.rows[0])).toBe("2023");
  });
  it("shows times as minutes and calls as counts", () => {
    expect(fireHead(base)).toEqual(["Year", "Calls measured", "Median", "9 in 10"]);
    expect(fireCells(base, base.rows[0])).toEqual(["2023", "118,000", "5.9 minutes", "9.1 minutes"]);
    const calls = { ...base, measure: "calls" as const };
    expect(fireHead(calls)).toEqual(["Year", "Calls"]);
    expect(fireCells(calls, base.rows[1])).toEqual(["2024 (from Feb 20)", "119,483"]);
  });
  it("exports raw values with the partial-year column, the notes and the source", () => {
    const e = fireExport(base, ctx);
    expect(e.csv.head).toEqual(["Year", "Partial year", "Calls", "Calls measured", "Median (minutes)", "9 in 10 (minutes)"]);
    expect(e.csv.rows[1]).toEqual([2024, "from Feb 20", 119483, 117000, 6.1, 9.4]);
    expect(e.notes).toEqual([...base.notes, base.source, "Exported from Cream City Almanac on October 14, 2026."]);
    expect(e.filename).toBe("almanac_fire_arrive_all");
  });
  it("offers EMS only and the other time; calls offer a call type", () => {
    expect(fireFollowUps(base).map((f) => f.label)).toEqual(["EMS ONLY", "TIME TO DISPATCH"]);
    expect(fireFollowUps({ ...base, group: "ems" })[0].label).toBe("ALL CALLS");
    const calls = fireFollowUps({ ...base, measure: "calls" });
    expect(calls.map((f) => f.label)).toEqual(["BY CALL TYPE", "TIME TO ARRIVE"]);
    expect(calls[0].question).toBe("How many Alarm Sounding calls did the Fire Department get each year, 2015 to 2023?");
  });
  it("turns choose into pick-one buttons", () => {
    expect(fireChoices({ status: "choose", asked: "Dragon", choices: ["EMS", "Auto Fire"] })[1]).toEqual({ label: "AUTO FIRE", question: "How many Auto Fire calls did the Fire Department get each year, 2015 to 2023?" });
  });
});
```

- [ ] **Step 2: Run them to watch them fail**

Run: `npx vitest run tests/ui/fireText.test.ts`
Expected: FAIL, because the module doesn't exist.

- [ ] **Step 3: Write `ui/lib/fireText.ts`.** First check how `durationText` renders `null` (`ui/lib/spanText.ts:8`). The table uses whatever it returns.

```ts
import type { FireAnswer } from "@/lib/ask/tools";
import type { FollowUp } from "@/ui/components/FollowUps";
import { exported, safeName, type CardExport, type Ctx } from "./cardExport";
import { durationText } from "./spanText";

// The fire-history card's words and export (spec 2026-10-14-fire-history §7), from the stored yearly totals.
export type FireOk = Extract<FireAnswer, { status: "ok" }>;
type Row = FireOk["rows"][number];
const NAME = { dispatch: "time to dispatch", arrive: "time to arrive" } as const;
const count = (v: number | null) => (v === null ? "—" : v.toLocaleString("en-US"));
const isTime = (r: Pick<FireOk, "measure">) => r.measure !== "calls";
const typeQuestion = (t: string) => `How many ${t} calls did the Fire Department get each year, 2015 to 2023?`;

export const yearLabel = (x: Pick<Row, "year" | "partial">) => (x.partial ? `${x.year} (${x.partial})` : String(x.year));
export const fireHead = (r: FireOk) => (isTime(r) ? ["Year", "Calls measured", "Median", "9 in 10"] : ["Year", "Calls"]);
export const fireCells = (r: FireOk, x: Row) =>
  isTime(r) ? [yearLabel(x), count(x.n), durationText(x.median, "minutes"), durationText(x.p90, "minutes")] : [yearLabel(x), count(x.calls)];

export function fireExport(r: FireOk, ctx: Ctx): CardExport {
  const time = isTime(r);
  return {
    title: r.title,
    lines: [],
    csv: {
      head: time ? ["Year", "Partial year", "Calls", "Calls measured", "Median (minutes)", "9 in 10 (minutes)"] : ["Year", "Partial year", "Calls"],
      rows: r.rows.map((x) => (time ? [x.year, x.partial ?? "", x.calls, x.n, x.median, x.p90] : [x.year, x.partial ?? "", x.calls])),
    },
    text: { head: fireHead(r), rows: r.rows.map((x) => fireCells(r, x)) },
    notes: [...r.notes, r.source, exported(ctx)],
    filename: safeName(["fire", r.type ?? r.measure, r.group]),
  };
}

export function fireFollowUps(r: FireOk): FollowUp[] {
  if (r.measure === "calls") {
    const out: FollowUp[] = [];
    const t = r.type ? null : r.types.find((x) => x.toUpperCase() !== "EMS");
    if (t) out.push({ label: "BY CALL TYPE", question: typeQuestion(t) });
    out.push({ label: "TIME TO ARRIVE", question: "How has the Fire Department's time to arrive changed each year?" });
    return out;
  }
  const other = r.measure === "dispatch" ? "arrive" : "dispatch";
  return [
    r.group === "ems"
      ? { label: "ALL CALLS", question: `How has the Fire Department's ${NAME[r.measure]} changed each year?` }
      : { label: "EMS ONLY", question: `How has the Fire Department's ${NAME[r.measure]} for EMS calls changed each year?` },
    { label: other === "arrive" ? "TIME TO ARRIVE" : "TIME TO DISPATCH", question: `How has the Fire Department's ${NAME[other]} changed each year?` },
  ];
}

export const fireChoices = (r: Extract<FireAnswer, { status: "choose" }>): FollowUp[] => r.choices.map((c) => ({ label: c.toUpperCase(), question: typeQuestion(c) }));
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/ui/fireText.test.ts`
Expected: PASS (5 tests). If `durationText(5.93, "minutes")` doesn't render "5.9 minutes", read `ui/lib/spanText.ts:8-15` and fix the test's expectation to match the existing function. Ledger it as a ruling, because the card must read like L1's.

- [ ] **Step 5: Write `ui/components/FireHistoryCard.tsx`**

```tsx
"use client";

import { fireCells, fireExport, fireHead, type FireOk } from "@/ui/lib/fireText";
import { ExportBar } from "./ExportBar";
import { ProvenanceTag } from "./ProvenanceTag";
import styles from "./ask.module.css";

// Fire Department calls and response times by year, from stored totals (spec 2026-10-14-fire-history §7).
export function FireHistoryCard({ r }: { r: FireOk }) {
  return (
    <figure className={styles.excerpt} data-card="fire-history">
      <figcaption className={styles.excerptTitle}>{r.title} <ProvenanceTag source="CITY" /></figcaption>
      <div className={styles.tractScroll} tabIndex={0} role="region" aria-label={`${r.title}, scroll sideways for more`}>
        <table className={styles.excerptTable}>
          <thead><tr>{fireHead(r).map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
          <tbody>
            {r.rows.map((x) => {
              const [label, ...cells] = fireCells(r, x);
              return <tr key={x.year}><th scope="row">{label}</th>{cells.map((c, i) => <td key={i}>{c}</td>)}</tr>;
            })}
          </tbody>
        </table>
      </div>
      {r.notes.map((n) => <p key={n} className={styles.source}>{n}</p>)}
      <p className={styles.source} data-source>{r.source}</p>
      <ExportBar make={(ctx) => fireExport(r, ctx)} />
    </figure>
  );
}
```

- [ ] **Step 6: Register the renderer** in `ui/components/AskCards.tsx`:
  - add `fireParams` and `type FireAnswer` to the `@/lib/ask/tools` import;
  - import `FireHistoryCard` from `./FireHistoryCard` and `fireChoices, fireFollowUps` from `@/ui/lib/fireText`;
  - after the `zipProfile` renderer:

```tsx
  useRenderTool({ name: "fireHistory", parameters: fireParams, render: (props) => {
    if (props.status !== "complete") return <Busy />;
    const r = parse<FireAnswer>(props.result);
    if (!r) return <Failed />;
    if (r.status === "choose") return <FollowUps pick items={fireChoices(r)} id={props.toolCallId} />;
    if (r.status === "refused") return <p className={styles.failed} data-card="fire-refusal">{r.reason}</p>;
    return <><ShareScope tool="fireHistory" args={props.parameters}><FireHistoryCard r={r} /></ShareScope><FollowUps items={fireFollowUps(r)} id={props.toolCallId} /></>;
  } }, []);
```

- [ ] **Step 7: Share link.**
  - `ui/lib/shareCard.ts`:
    - add `"fireHistory"` to `SHAREABLE` (after `"countTurnout"`);
    - import `fireExport` from `./fireText`;
    - add `case "fireHistory": return ok ? card(fireExport(r as never, ctx)) : null;`
  - `convex/shares.ts` `rerun`: `case "fireHistory": return ctx.runQuery(api.fire.fireHistory, args);`
  - In `tests/ui/shareCard.test.ts`, update the expected SHAREABLE list to include `"fireHistory"` in sorted order (between `"countTurnout"` and `"getNumber"`).

- [ ] **Step 8: Run the tests, typecheck and build**

Run: `npx vitest run tests/ui convex/shares.test.ts && npx tsc --noEmit -p . && npx tsc --noEmit -p convex`
Expected: PASS, no type errors.

- [ ] **Step 9: Commit**

```bash
git add ui/lib/fireText.ts ui/components/FireHistoryCard.tsx ui/components/AskCards.tsx ui/lib/shareCard.ts convex/shares.ts tests/ui/fireText.test.ts tests/ui/shareCard.test.ts
git commit -m "feat: the fire-history card with notes, export, follow-ups and a share link (L3)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Browser test and docs

**Files:**
- Modify: `e2e/ask.spec.ts`, `ui/components/HowItWorks.tsx`, `docs/research/2026-10-12-questions-by-audience.md`
- Create: `docs/decisions/047-fire-history.md`

- [ ] **Step 1: Browser test.** In `e2e/ask.spec.ts`, after the ZIP test:

```ts
  test("a fire-history question draws the yearly card with the system-change note (L3)", async ({ page }) => {
    await ask(page, "Show me fire calls each year");
    const card = page.locator("[data-card=fire-history]:visible");
    await expect(card).toBeVisible({ timeout: 40_000 });
    await expect(card).toContainText("Milwaukee Fire Department · calls · 2015–");
    await expect(card.locator("tbody tr").first()).toContainText("2015");
    await expect(card).toContainText("new system (MFD Calls for Service)");
    await expect(card.getByTitle("From the City of Milwaukee's open data")).toBeVisible();
  });
```

It needs dev's stored fire years, filled in Task 7, before CI's e2e can pass.

- [ ] **Step 2: Decision 047** (`docs/decisions/047-fire-history.md`), in 046's format. Define "median" inline.
  - **Decision:** stored yearly Fire Department totals 2015 to now, from nine yearly files and the newer MFD file.
  - **Why:** Ask read only 2021.
  - **Options:**
    - live reads across files (any filter, but 1.4M rows, four date shapes and likely timeouts);
    - a stored summary (chosen);
    - 2015–2023 only (no 2024 system change).
  - **Chose:** Tarik, 2026-10-14, all three scopes, approach A.
  - **Gave up:**
    - filters beyond year, EMS-versus-other and type;
    - call types after 2023;
    - Jan 1 – Feb 19, 2024;
    - seconds in five years' times;
    - one live-data run after merge.
  - **How we'll know:**
    - 2021's stored medians match L1's live ones;
    - the graded question passes;
    - weekly builds note no failed years.
  - **What actually happened:** blank.

- [ ] **Step 3: How it works.** In `ui/components/HowItWorks.tsx`, after the ZIP paragraph:

```tsx
            <p>
              Ask can also show the Fire Department&apos;s calls and response times year by year, 2015 to now. The City&apos;s yearly files are
              counted once a week into stored totals; from 2024 the City publishes from a new system, and the card says where the years
              don&apos;t line up exactly.
            </p>
```

- [ ] **Step 4: Questions doc.** In `docs/research/2026-10-12-questions-by-audience.md`, after the ZIP row:

```
| How many Fire Department calls were there each year? | Fire Incident Detail + MFD Calls for Service | **Now** (stored yearly totals, L3) |
| Has the Fire Department's time to arrive changed since 2015? | Fire Incident Detail + MFD Calls for Service | **Now** (stored yearly medians, L3) |
```

- [ ] **Step 5: Run the whole suite, typecheck and build**

Run: `W=.superpowers/sdd/2026-10-14-fire-history; npx vitest run > $W/suite.log 2>&1; grep -E "Test Files|Tests " $W/suite.log; npx tsc --noEmit -p . && npm run build > $W/build.log 2>&1; echo build=$?`
Expected: all pass, `build=0`.

- [ ] **Step 6: Commit**

```bash
git add e2e/ask.spec.ts docs/decisions/047-fire-history.md ui/components/HowItWorks.tsx docs/research/2026-10-12-questions-by-audience.md
git commit -m "docs: decision 047, How it works and the questions list for fire history; browser check (L3)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Live checks (each needs Tarik's OK)

- [ ] **Step 1: Ask Tarik** which to run. Offer:
  - **Dev push + one full dev refresh:** changes the dev deployment. CI's e2e needs it.
  - **Local browser tests:** about 4 minutes, on the shared test account.
  - **The graded real-AI question:** about $0.05.

- [ ] **Step 2 (with OK): dev push and refresh**

Run: `npx convex dev --once && npx convex run fire:refreshFire`
Expected: notes `[]`, or only notes the ledger explains. Then check:

```bash
npx convex run fire:fireHistory '{"measure":"calls"}' | python3 -c "import json,sys; r=json.load(sys.stdin); print(r['title']); [print(x['year'], x['calls'], x['partial']) for x in r['rows']]; print(r['notes'])"
npx convex run fire:fireHistory '{"measure":"dispatch","from":2021,"to":2021}'
npx convex run fire:fireHistory '{"measure":"arrive","from":2021,"to":2021}'
```

Expected:
- calls per year close to the spec §2 table, MFD years a little under the raw rows (Test calls dropped);
- 2021 dispatch median about 1.6 and arrive about 5.9, matching L1;
- 2015–2017, 2019 and 2020 medians whole minutes.

Record everything in the ledger.

- [ ] **Step 3 (with OK): graded question**

Run: `N=$(npx tsx -e 'import("./scripts/ask-questions.ts").then((m) => console.log(m.ASK_QUESTIONS.findIndex((q) => q.q.includes("time to arrive changed since 2015")) + 1))') && npx tsx scripts/ask-report-card.ts --only=$N --cap=0.25 --verbose`
Expected: PASS on `fireHistory` with `arrive`.

- [ ] **Step 4 (with OK): local browser tests.** Run the app on :3100.

Run: `BASE_URL=http://localhost:3100 npx playwright test e2e/ask.spec.ts -g "fire-history"`
Expected: pass on desktop and phone.
