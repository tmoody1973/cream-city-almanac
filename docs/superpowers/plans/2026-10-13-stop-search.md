# MPD Stop and Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ask counts the people MPD stopped, 2019 Q1–Q2 through 2024 Q4, by stop type, race/ethnicity, sex, year or quarter. Field interviews also get frisk, search and found rates.

**Architecture:**
- **A refresh step** (`stops:refreshStops`, also run at the end of the weekly build) reads each quarterly package once and stores only counts in `stopCounts`:
  - **queryable quarters:** grouped SQL on the City's database;
  - **ZIP quarters:** download, unpack the three person CSVs with `fflate`, count in code.
- **A public query** (`stops:countStops`) filters and groups those counts. Pure math lives in `convex/lib/stopMath.ts`.
- **A new Ask tool and card** show the result.

**Tech Stack:** Convex (query, internalAction, internalMutation, convex-test), fflate, TypeScript, Vitest, Playwright, Zod, Next.js 16.

**Spec:** `docs/superpowers/specs/2026-10-13-stop-search-design.md`

## Global Constraints

- **Store counts only.** Never a person's row, date of birth, ID, `MasterPersonId` or narrative text.
- **Race/ethnicity is one group:** "Hispanic" when race is "H"/"HISPANIC" or ethnicity starts "HISPANIC". Otherwise:
  - Black, White, Asian or Pacific Islander (traffic "A", "ASIAN", "NATIVE HAWAIIAN OR OTHER PACIFIC ISLANDER");
  - American Indian or Alaska Native;
  - Unknown.
- **Blank, "NULL" and missing values** become Unknown (or `unknown` for yes/no).
- **Periods:** `2019-Q1Q2` (label "2019 Q1–Q2") and `YYYY-Qn`. `from`/`to` accept "YYYY" or "YYYY-Qn".
- **Rates are shown only with a denominator of 10 or more**; otherwise "too few to say".
- **Card text, verbatim:**
  - "People per stop as MPD recorded them: a person stopped twice counts twice."
  - "Race and ethnicity are one group here: Hispanic when either MPD field says so."
  - "These are counts, not rates per resident."
  - Source: "From MPD's quarterly stop-and-search data (<first> to <last>), counted by the Almanac from the City's files."
- **ZIP downloads:** only `https://data.milwaukee.gov/` links, 30-second timeout.
- **Git and data rules:**
  - Commit trailer: `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
  - Never stage `.superpowers/` or `clerk-creamcityalmanac.app.zone`.
  - Each dev Convex push or dev data run needs Tarik's explicit OK.
  - Prod data jobs are Tarik's.
- **Local Playwright:** port 3000 is another app (Hairline). Run this app with `npx next dev -p 3100` and set `BASE_URL=http://localhost:3100`.

**Planning rulings:**
- The spec says `build:refreshStops`; the plan uses `stops:refreshStops`, following `cityFigures:refreshCityFigures`. The go-live command becomes `npx convex run stops:refreshStops --prod`. The spec is corrected in Task 7.
- The spec's "a neighborhood or district is refused" is met by the tool having no neighborhood argument: the tool's schema can't carry one, and its description says the counts have no locations.

## Review Focus

1. **The City refuses one package's request mid-run** (403, ZIP timeout). That period is marked failed with a note and its earlier counts are kept; the other periods continue; the next run retries it (a failed period is not skipped). *Pinned in Task 3.*
2. **A table whose columns can't be found** (an undetected header variant). The period fails naming the missing column; zero counts are never stored as if real. *Pinned in Tasks 1 and 3.*
3. **Filter values in another case** ("black", "male"). Matched case-insensitively to the stored values; an unknown value offers the stored choices. *Pinned in Task 2.*
4. **A period asked where the build failed** (no stored rows). The card names it ("The City's file for 2023 Q2 couldn't be read."). *Pinned in Task 2.*
5. **Very small groups.** Rates under 10 people show "too few to say", never 0% or 100% from 1–2 people. *Pinned in Task 2.*

---

## File map

| File | Role |
|---|---|
| `convex/lib/stops.ts` (new) | titles → periods, table and column matching, value normalizing, tally, grouped SQL, CSV reading |
| `convex/lib/stopMath.ts` (new) | periods, filters, groups, shares, rates, notes for `countStops` |
| `convex/stops.ts` (new) | `stopPackages`, `stopStatus`, `replacePeriod`, `markFailed`, `refreshStops`, `countStops` |
| `convex/validators.ts`, `convex/schema.ts` | `vStopRow`; tables `stopCounts`, `stopPeriods` |
| `convex/build.ts` | the weekly build's finish calls `stops:refreshStops` |
| `convex/lib/cityFamilies.ts` | `cityNote` line for stop packages |
| `tests/helpers/fakeFetch.ts` | `cityDownloads` option (bytes for a City download link) |
| `lib/ask/tools.ts`, `lib/ask/backend.ts`, `scripts/ask-report-card.ts`, `tests/ui/askTools.test.ts` | the `countStops` tool |
| `ui/lib/stopsText.ts` (new), `ui/components/StopsCard.tsx` (new), `ui/components/AskCards.tsx` | card, export, follow-ups |
| `lib/ask/prompt.ts`, `lib/ask/model.ts`, `scripts/ask-questions.ts`, `e2e/ask.spec.ts` | Ask instructions, scripted model, graded question, browser test |
| Docs | decision 041, How it works, questions list, spec go-live command |

---

### Task 1: Reading MPD's packages (pure)

**Files:**
- Create: `convex/lib/stops.ts`
- Test: `tests/lib/stops.test.ts`

**Interfaces:**
- Produces:
  - `type StopKind = "traffic" | "field-interview" | "no-action"`
  - `type YesNo = "yes" | "no" | "unknown"`
  - `type StopRow = { kind: StopKind; race: string; sex: string; frisked: YesNo | null; searched: YesNo | null; found: string | null; n: number }`
  - `KINDS: StopKind[]`
  - `periodOf(title): { period: string; year: number } | null`
  - `kindOfTable(name): StopKind | null`
  - `columnsFor(kind, headers): { ok: true; cols: Partial<Record<Field, string>> } | { ok: false; missing: string }`
  - `tally(kind, raw: Raw[]): StopRow[]`
  - `groupSql(kind, resourceId, cols): string`
  - `parseCsv(text): string[][]`
  - `countCsv(kind, text): { ok: true; rows: StopRow[] } | { ok: false; missing: string }`
  - `stopTables(files): { kind: StopKind; resourceId: string }[]`
  - `dataZip(files): string | null`

- [ ] **Step 1: Write the failing tests**

`tests/lib/stops.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { countCsv, dataZip, groupSql, kindOfTable, parseCsv, periodOf, stopTables, tally } from "../../convex/lib/stops";

describe("periodOf (K3)", () => {
  it("reads a quarter, the 2019 half-year, and nothing else", () => {
    expect(periodOf("2021 4th Quarter - MPD Stop and Search Data")).toEqual({ period: "2021-Q4", year: 2021 });
    expect(periodOf("2019 1st & 2nd Quarters - MPD Stop and Search Data")).toEqual({ period: "2019-Q1Q2", year: 2019 });
    expect(periodOf("Stop and Search Visualizations")).toBeNull();
  });
});

describe("kindOfTable (K3)", () => {
  it("knows every spelling seen live, and not the contact summary", () => {
    for (const n of ["Tracs Individual", "Tracs Individuals", "Tracs_Individual.csv", "Tracs_Individual_REMCOL.csv"]) expect(kindOfTable(n)).toBe("traffic");
    for (const n of ["Inform Field Interview Person Redacted", "Inform Field Interview Person - Redacted", "Inform_FieldInterviewPerson REDACTED TO POST 1.csv", "Inform_FieldInterviewPerson_REDACTED_REMCOL.csv", "Inform_FieldInterviewPerson_REMCOL_REDACTED.csv"]) expect(kindOfTable(n)).toBe("field-interview");
    for (const n of ["Inform No Action Encounter Person Redacted", "Inform_NoActionEncounterPerson.csv", "Inform_NoActionEncounterPerson_REDACTED.csv"]) expect(kindOfTable(n)).toBe("no-action");
    expect(kindOfTable("Tracs Contact Summary Individual")).toBeNull();
    expect(kindOfTable("Inform_FieldInterview_Joined.csv")).toBeNull();
  });
});

describe("tally (K3)", () => {
  it("maps MPD's values to the Almanac's groups and adds up what merges", () => {
    expect(tally("traffic", [{ race: "B", sex: "M", n: "10" }, { race: "H", sex: "F", n: 3 }, { race: "NULL", sex: "", n: "2" }, { race: "A", sex: "M", n: "1" }])).toEqual([
      { kind: "traffic", race: "Black", sex: "Male", frisked: null, searched: null, found: null, n: 10 },
      { kind: "traffic", race: "Hispanic", sex: "Female", frisked: null, searched: null, found: null, n: 3 },
      { kind: "traffic", race: "Unknown", sex: "Unknown", frisked: null, searched: null, found: null, n: 2 },
      { kind: "traffic", race: "Asian or Pacific Islander", sex: "Male", frisked: null, searched: null, found: null, n: 1 },
    ]);
    expect(tally("field-interview", [
      { race: "WHITE", eth: "HISPANIC/LATINO", sex: "M", frisked: "Yes", searched: "Yes", found: "WEAPON/NON-FIREARM", n: 1 },
      { race: "H", eth: "UNKNOWN", sex: "M", frisked: "Yes", searched: "Yes", found: "WEAPON/NON-FIREARM", n: 2 },
      { race: "NATIVE HAWAIIAN OR OTHER PACIFIC ISLANDER", eth: "NOT HISPANIC/LATINO", sex: "U", frisked: "NULL", searched: null, found: "NONE", n: 1 },
    ])).toEqual([
      { kind: "field-interview", race: "Hispanic", sex: "Male", frisked: "yes", searched: "yes", found: "Weapon/Non-Firearm", n: 3 },
      { kind: "field-interview", race: "Asian or Pacific Islander", sex: "Unknown", frisked: "unknown", searched: "unknown", found: "None", n: 1 },
    ]);
  });
});

describe("groupSql (K3)", () => {
  it("groups by the columns found, under fixed names, on a checked id", () => {
    expect(groupSql("traffic", "dcbc4a9d-5e48-4f24-bf71-e9a450065461", { race: "Race", sex: "sex" }))
      .toBe(`SELECT "Race" AS race, "sex" AS sex, COUNT(*) AS n FROM "dcbc4a9d-5e48-4f24-bf71-e9a450065461" GROUP BY 1, 2`);
    expect(() => groupSql("traffic", "x'; drop", { race: "Race", sex: "sex" })).toThrow("Not a CKAN resource id");
  });
});

describe("CSV (K3)", () => {
  it("reads quoted commas, doubled quotes and line breaks", () => {
    expect(parseCsv('a,b,c\r\n1,"two, ""quoted""\nline",3\n')).toEqual([["a", "b", "c"], ["1", 'two, "quoted"\nline', "3"]]);
  });
  it("counts a field-interview CSV, skipping the 2023 placeholder header and spaced column names", () => {
    const csv = [
      "Column1,Column2,Column3,Column4,Column5,Column6,Column7",
      "Id,race Description,ethnicity Description,sex Code,Pat Down Description,Search Performed Description,Search Results Description",
      'x1,BLACK/AFRICAN AMERICAN,NOT HISPANIC/LATINO,M,Yes,Yes,FIREARM',
      'x2,"BLACK/AFRICAN AMERICAN",NOT HISPANIC/LATINO,M,Yes,Yes,FIREARM',
    ].join("\n");
    expect(countCsv("field-interview", csv)).toEqual({ ok: true, rows: [{ kind: "field-interview", race: "Black", sex: "Male", frisked: "yes", searched: "yes", found: "Firearm", n: 2 }] });
  });
  it("names the missing column instead of counting nothing (review focus 2)", () => {
    expect(countCsv("field-interview", "Id,race_Description,sex_Code\nx,WHITE,F\n")).toEqual({ ok: false, missing: "patdowndescription" });
  });
});

describe("package files (K3)", () => {
  const link = (rid: string, f: string) => `https://data.milwaukee.gov/dataset/p/resource/${rid}/download/${f}`;
  it("finds the three person tables by name, and the data ZIP (not the lookup ZIP)", () => {
    const files = [
      { name: "Tracs_Individual_REMCOL.csv", format: "CSV", url: link("11111111-1111-1111-1111-111111111111", "t.csv") },
      { name: "Inform_FieldInterviewPerson_REDACTED_REMCOL.csv", format: "CSV", url: link("22222222-2222-2222-2222-222222222222", "f.csv") },
      { name: "Inform_NoActionEncounterPerson_REDACTED.csv", format: "CSV", url: link("33333333-3333-3333-3333-333333333333", "n.csv") },
      { name: "2021 Q4 - Tracs lookup files - CSV.zip", format: "ZIP", url: link("44444444-4444-4444-4444-444444444444", "l.zip") },
    ];
    expect(stopTables(files)).toEqual([
      { kind: "traffic", resourceId: "11111111-1111-1111-1111-111111111111" },
      { kind: "field-interview", resourceId: "22222222-2222-2222-2222-222222222222" },
      { kind: "no-action", resourceId: "33333333-3333-3333-3333-333333333333" },
    ]);
    expect(dataZip(files)).toBeNull(); // only a lookup ZIP
    expect(dataZip([{ name: "MPD SC Datasets 2023 Q4.zip", format: "ZIP", url: link("55555555-5555-5555-5555-555555555555", "d.zip") }])).toBe(link("55555555-5555-5555-5555-555555555555", "d.zip"));
    expect(dataZip([{ name: "MPD SC Datasets 2023 Q4.zip", format: "ZIP", url: "https://example.com/d.zip" }])).toBeNull();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/lib/stops.test.ts`
Expected: FAIL — cannot find module `../../convex/lib/stops`.

- [ ] **Step 3: Implement `convex/lib/stops.ts`**

```ts
import { quoteId } from "./cityProfile";
import { RID } from "./citySql";

// MPD stop-and-search packages (spec 2026-10-13-stop-search-design §2, §4): titles → periods, which tables hold
// people, which columns, and how MPD's values become the Almanac's groups. Pure: no I/O. Only coded fields are read;
// narrative text, dates of birth and IDs never are.
export type StopKind = "traffic" | "field-interview" | "no-action";
export type YesNo = "yes" | "no" | "unknown";
export type StopRow = { kind: StopKind; race: string; sex: string; frisked: YesNo | null; searched: YesNo | null; found: string | null; n: number };
type Field = "race" | "eth" | "sex" | "frisked" | "searched" | "found";
export type Raw = Partial<Record<Field, unknown>> & { n: unknown };
export const KINDS: StopKind[] = ["traffic", "field-interview", "no-action"];

const ORD: Record<string, number> = { "1st": 1, "2nd": 2, "3rd": 3, "4th": 4 };
// "2021 4th Quarter - MPD Stop and Search Data" → 2021-Q4; the first package covers two quarters: 2019-Q1Q2.
export function periodOf(title: string): { period: string; year: number } | null {
  const m = /^(\d{4}) (1st|2nd|3rd|4th)(?: & (1st|2nd|3rd|4th))? Quarters? - MPD Stop and Search Data$/i.exec(title.trim());
  if (!m) return null;
  const qs = [m[2], m[3]].filter((q): q is string => Boolean(q)).map((q) => `Q${ORD[q.toLowerCase()]}`);
  return { period: `${m[1]}-${qs.join("")}`, year: Number(m[1]) };
}

// Table names change every few quarters ("Tracs Individual", "Tracs_Individual_REMCOL.csv", "…REDACTED TO POST 1.csv"):
// compare letters only, without the City's redaction and file-type words.
const squash = (s: string) => s.toLowerCase().replace(/\.csv$/, "").replace(/[^a-z]/g, "").replace(/redacted|remcol|topost/g, "");
const TABLES: Record<string, StopKind> = { tracsindividual: "traffic", tracsindividuals: "traffic", informfieldinterviewperson: "field-interview", informnoactionencounterperson: "no-action" };
export const kindOfTable = (name: string): StopKind | null => TABLES[squash(name)] ?? null;

const WANT: Record<StopKind, Partial<Record<Field, string>>> = {
  traffic: { race: "race", sex: "sex" },
  "field-interview": { race: "racedescription", eth: "ethnicitydescription", sex: "sexcode", frisked: "patdowndescription", searched: "searchperformeddescription", found: "searchresultsdescription" },
  "no-action": { race: "racedescription", eth: "ethnicitydescription", sex: "sexcode" },
};
const letters = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
// Each fact's column in this table ("race Description" or "race_Description"). Ethnicity is optional; any other
// missing column fails the table, naming it, so a renamed column never counts as nobody.
export function columnsFor(kind: StopKind, headers: string[]): { ok: true; cols: Partial<Record<Field, string>> } | { ok: false; missing: string } {
  const cols: Partial<Record<Field, string>> = {};
  for (const [f, want] of Object.entries(WANT[kind]) as [Field, string][]) {
    const h = headers.find((x) => letters(x) === want);
    if (h) cols[f] = h;
    else if (f !== "eth") return { ok: false, missing: want };
  }
  return { ok: true, cols };
}

const clean = (v: unknown) => { const s = String(v ?? "").trim(); return s.toUpperCase() === "NULL" ? "" : s; };
const TRAFFIC_RACE: Record<string, string> = { B: "Black", W: "White", H: "Hispanic", A: "Asian or Pacific Islander", I: "American Indian or Alaska Native" };
const RACE: Record<string, string> = {
  "BLACK/AFRICAN AMERICAN": "Black", WHITE: "White", H: "Hispanic", HISPANIC: "Hispanic", ASIAN: "Asian or Pacific Islander",
  "NATIVE HAWAIIAN OR OTHER PACIFIC ISLANDER": "Asian or Pacific Islander", "AMERICAN INDIAN OR ALASKAN NATIVE": "American Indian or Alaska Native",
};
// One race/ethnicity group (spec §3): Hispanic when either field says so, else the recorded race.
const raceOf = (kind: StopKind, race: unknown, eth: unknown) =>
  clean(eth).toUpperCase().startsWith("HISPANIC") ? "Hispanic" : ((kind === "traffic" ? TRAFFIC_RACE : RACE)[clean(race).toUpperCase()] ?? "Unknown");
const sexOf = (v: unknown) => ({ M: "Male", F: "Female" } as Record<string, string>)[clean(v).toUpperCase()] ?? "Unknown";
const yesNo = (v: unknown): YesNo => ({ YES: "yes", NO: "no" } as Record<string, YesNo>)[clean(v).toUpperCase()] ?? "unknown";
const foundOf = (v: unknown) => {
  const s = clean(v);
  if (!s) return "Unknown";
  if (s.toUpperCase() === "NONE") return "None";
  return s.toLowerCase().replace(/(^|[\s/-])([a-z])/g, (_, p: string, c: string) => p + c.toUpperCase());
};

// Raw groups (from the City's SQL or one CSV line each) → the Almanac's groups, added up where they merge.
export function tally(kind: StopKind, raw: Raw[]): StopRow[] {
  const fi = kind === "field-interview";
  const by = new Map<string, StopRow>();
  for (const r of raw) {
    const n = Number(r.n);
    if (!Number.isFinite(n) || n <= 0) continue;
    const row: StopRow = { kind, race: raceOf(kind, r.race, r.eth), sex: sexOf(r.sex), frisked: fi ? yesNo(r.frisked) : null, searched: fi ? yesNo(r.searched) : null, found: fi ? foundOf(r.found) : null, n };
    const key = [row.race, row.sex, row.frisked, row.searched, row.found].join("|");
    const old = by.get(key);
    by.set(key, old ? { ...old, n: old.n + n } : row);
  }
  return [...by.values()];
}

// One grouped count per queryable table: only the found columns, under fixed names, on a checked id.
export function groupSql(kind: StopKind, resourceId: string, cols: Partial<Record<Field, string>>): string {
  if (!RID.test(resourceId)) throw new Error("Not a CKAN resource id");
  const picked = Object.entries(cols) as [Field, string][];
  return `SELECT ${picked.map(([f, c]) => `${quoteId(c)} AS ${f}`).join(", ")}, COUNT(*) AS n FROM ${quoteId(resourceId)} GROUP BY ${picked.map((_, i) => i + 1).join(", ")}`;
}

// A CSV reader for MPD's files: quoted fields hold commas, doubled quotes and line breaks (narratives).
export function parseCsv(text: string): string[][] {
  const s = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

// One person table from a ZIP: its header (below a "Column1, Column2, …" placeholder row, as in 2023 Q4), then one
// person per line.
export function countCsv(kind: StopKind, text: string): { ok: true; rows: StopRow[] } | { ok: false; missing: string } {
  let rows = parseCsv(text).filter((r) => r.some((c) => c.trim() !== ""));
  if (rows[0]?.every((c) => /^Column\d+$/.test(c.trim()))) rows = rows.slice(1);
  const [headers = [], ...body] = rows;
  const c = columnsFor(kind, headers);
  if (!c.ok) return c;
  const at = (Object.entries(c.cols) as [Field, string][]).map(([f, h]) => [f, headers.indexOf(h)] as const);
  return { ok: true, rows: tally(kind, body.map((r) => ({ ...Object.fromEntries(at.map(([f, i]) => [f, r[i]])), n: 1 }))) };
}

const RESOURCE = /\/resource\/([0-9a-f-]{36})\//;
// The queryable person tables in a package (one per kind), from the catalog's file names and links.
export function stopTables(files: { name: string; url: string }[]): { kind: StopKind; resourceId: string }[] {
  const out: { kind: StopKind; resourceId: string }[] = [];
  for (const f of files) {
    const kind = kindOfTable(f.name);
    const id = RESOURCE.exec(f.url)?.[1];
    if (kind && id && !out.some((t) => t.kind === kind)) out.push({ kind, resourceId: id });
  }
  return out;
}

// The package's data ZIP: its one ZIP that isn't a lookup or dictionary bundle, on the City's own site.
export function dataZip(files: { name: string; format: string; url: string }[]): string | null {
  const zips = files.filter((f) => /^zip$/i.test(f.format) && !/lookup|dictionar/i.test(f.name));
  return zips.length === 1 && zips[0].url.startsWith("https://data.milwaukee.gov/") ? zips[0].url : null;
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/lib/stops.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add convex/lib/stops.ts tests/lib/stops.test.ts
git commit -m "feat: read MPD's stop-and-search packages: periods, person tables, columns, values

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: The counts math (pure)

**Files:**
- Create: `convex/lib/stopMath.ts`
- Test: `tests/lib/stopMath.test.ts`

**Interfaces:**
- Consumes: `StopKind`, `StopRow` (Task 1).
- Produces:
  - `type StoredRow = StopRow & { period: string; year: number }`
  - `type GroupBy = "year" | "quarter" | "race" | "sex" | "kind" | "found"`
  - `type StopsArgs`, `type StopGroup`, `type StopsResult` (shapes below)
  - `periodLabel(period): string`
  - `summarize(rows: StoredRow[], periods: { period: string; status: string }[], a: StopsArgs): StopsResult`
  - constants `PEOPLE_NOTE`, `RACE_NOTE`, `NOT_RATES`, `RATE_FLOOR = 10`

- [ ] **Step 1: Write the failing tests**

`tests/lib/stopMath.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { periodLabel, summarize, type StoredRow } from "../../convex/lib/stopMath";

const t = (period: string, race: string, n: number, sex = "Male"): StoredRow => ({ period, year: Number(period.slice(0, 4)), kind: "traffic", race, sex, frisked: null, searched: null, found: null, n });
const fi = (period: string, race: string, frisked: "yes" | "no", searched: "yes" | "no", found: string, n: number): StoredRow =>
  ({ period, year: Number(period.slice(0, 4)), kind: "field-interview", race, sex: "Male", frisked, searched, found, n });
const ROWS: StoredRow[] = [
  t("2019-Q1Q2", "Black", 100), t("2019-Q3", "Black", 60), t("2019-Q3", "White", 40), t("2024-Q4", "Black", 50), t("2024-Q4", "Hispanic", 30, "Female"),
  fi("2021-Q4", "Black", "yes", "yes", "Firearm", 12), fi("2021-Q4", "Black", "no", "yes", "None", 8), fi("2021-Q4", "Black", "no", "no", "None", 20),
  fi("2021-Q4", "White", "yes", "yes", "None", 3),
];
const DONE = ["2019-Q1Q2", "2019-Q3", "2021-Q4", "2024-Q4"].map((period) => ({ period, status: "counted" }));
const ok = (r: ReturnType<typeof summarize>) => { if (r.status !== "ok") throw new Error(JSON.stringify(r)); return r; };

describe("periodLabel (K3)", () => {
  it("writes the half-year and quarters for people", () => {
    expect(periodLabel("2019-Q1Q2")).toBe("2019 Q1–Q2");
    expect(periodLabel("2021-Q4")).toBe("2021 Q4");
  });
});

describe("summarize (K3)", () => {
  it("adds a year's quarters, the 2019 half-year included, oldest year first", () => {
    const r = ok(summarize(ROWS, DONE, { kind: "traffic", groupBy: "year" }));
    expect(r.groups.map((g) => [g.label, g.n])).toEqual([["2019", 200], ["2024", 80]]);
    expect(r).toMatchObject({ total: 280, period: "2019 Q1–Q2 – 2024 Q4", source: "From MPD's quarterly stop-and-search data (2019 Q1–Q2 to 2024 Q4), counted by the Almanac from the City's files." });
  });
  it("gives each group its share, largest first, and the three notes", () => {
    const r = ok(summarize(ROWS, DONE, { kind: "traffic", groupBy: "race" }));
    expect(r.groups).toEqual([{ label: "Black", n: 210, share: 75 }, { label: "White", n: 40, share: 14.3 }, { label: "Hispanic", n: 30, share: 10.7 }]);
    expect(r.notes).toEqual([
      "People per stop as MPD recorded them: a person stopped twice counts twice.",
      "Race and ethnicity are one group here: Hispanic when either MPD field says so.",
      "These are counts, not rates per resident.",
    ]);
    expect(r.rates).toBe(false);
  });
  it("gives field-interview rates per race, and too few to say under 10 people (review focus 5)", () => {
    const r = ok(summarize(ROWS, DONE, { kind: "field-interview", groupBy: "race" }));
    expect(r.rates).toBe(true);
    expect(r.groups[0]).toEqual({ label: "Black", n: 40, share: 93, frisked: 30, searched: 50, found: 60 });
    expect(r.groups[1]).toEqual({ label: "White", n: 3, share: 7, frisked: null, searched: null, found: null });
  });
  it("narrows by quarter or year, and filters in any case (review focus 3)", () => {
    expect(ok(summarize(ROWS, DONE, { kind: "traffic", from: "2019-Q3", to: "2019" })).total).toBe(100);
    expect(ok(summarize(ROWS, DONE, { kind: "traffic", from: "2019-Q2", to: "2019-Q2" })).total).toBe(100); // the half-year holds Q2
    const r = ok(summarize(ROWS, DONE, { kind: "traffic", filters: { race: ["black"], sex: ["MALE"] } }));
    expect(r).toMatchObject({ total: 210, filters: ["Black", "Male"] });
    expect(summarize(ROWS, DONE, { filters: { race: ["Purple"] } })).toEqual({ status: "choose", column: "race", asked: "Purple", choices: ["Black", "Hispanic", "White"] });
  });
  it("refuses frisk, search and found outside field interviews, bad periods, and no data yet", () => {
    expect(summarize(ROWS, DONE, { kind: "traffic", filters: { frisked: "yes" } })).toEqual({ status: "refused", reason: "Frisk, search and found are recorded for field interviews only." });
    expect(summarize(ROWS, DONE, { groupBy: "found" })).toMatchObject({ status: "refused" });
    const range = 'Periods are years ("2021") or quarters ("2021-Q3"); the data covers 2019 Q1–Q2 to 2024 Q4.';
    for (const a of [{ from: "21" }, { from: "2024", to: "2019" }, { from: "2030" }]) expect(summarize(ROWS, DONE, a)).toEqual({ status: "refused", reason: range });
    expect(summarize([], [], {})).toEqual({ status: "refused", reason: "Stop counts haven't been built yet." });
  });
  it("names a period in range that couldn't be read (review focus 4)", () => {
    const r = ok(summarize(ROWS, [...DONE, { period: "2023-Q2", status: "failed" }], { kind: "traffic" }));
    expect(r.notes).toContain("The City's file for 2023 Q2 couldn't be read.");
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/lib/stopMath.test.ts`
Expected: FAIL — cannot find module `../../convex/lib/stopMath`.

- [ ] **Step 3: Implement `convex/lib/stopMath.ts`**

```ts
import type { StopKind, StopRow } from "./stops";

// The stop counts Ask shows (spec 2026-10-13-stop-search-design §5): periods, filters, groups, shares and field-
// interview rates, all from the stored counts. Pure. The AI never computes any of these.
export type StoredRow = StopRow & { period: string; year: number };
export type GroupBy = "year" | "quarter" | "race" | "sex" | "kind" | "found";
export type StopsArgs = {
  kind?: StopKind | "all"; from?: string; to?: string; groupBy?: GroupBy;
  filters?: { race?: string[]; sex?: string[]; frisked?: "yes" | "no"; searched?: "yes" | "no"; found?: string[] };
};
export type StopGroup = { label: string; n: number; share: number; frisked?: number | null; searched?: number | null; found?: number | null };
export type StopsResult =
  | { status: "ok"; kind: StopKind | "all"; period: string; total: number; groupBy: GroupBy | null; groups: StopGroup[]; rates: boolean; filters: string[]; source: string; notes: string[] }
  | { status: "refused"; reason: string }
  | { status: "choose"; column: "race" | "sex" | "found"; asked: string; choices: string[] };

export const RATE_FLOOR = 10;
export const PEOPLE_NOTE = "People per stop as MPD recorded them: a person stopped twice counts twice.";
export const RACE_NOTE = "Race and ethnicity are one group here: Hispanic when either MPD field says so.";
export const NOT_RATES = "These are counts, not rates per resident.";
const FI_ONLY = "Frisk, search and found are recorded for field interviews only.";
const KIND_LABEL: Record<StopKind, string> = { traffic: "Traffic stops", "field-interview": "Field interviews", "no-action": "No-action encounters" };

const quarters = (p: string) => [...p.slice(5).matchAll(/Q(\d)/g)].map((m) => Number(m[1]));
// A period's first or last quarter as year × 10 + quarter (2019-Q1Q2 → 20191 … 20192).
const at = (p: string, end: boolean) => { const q = quarters(p); return Number(p.slice(0, 4)) * 10 + (end ? q[q.length - 1] : q[0]); };
export const periodLabel = (p: string) => { const q = quarters(p); return `${p.slice(0, 4)} ${q.length > 1 ? `Q${q[0]}–Q${q[q.length - 1]}` : `Q${q[0]}`}`; };
// "2021" or "2021-Q3" as a quarter number; a year starts at Q1 and ends at Q4.
const bound = (s: string, end: boolean): number | null => {
  const m = /^(\d{4})(?:-Q([1-4]))?$/.exec(s.trim());
  return m ? Number(m[1]) * 10 + (m[2] ? Number(m[2]) : end ? 4 : 1) : null;
};
const round1 = (x: number) => Math.round(x * 10) / 10;
const rate = (num: number, den: number) => (den >= RATE_FLOOR ? round1((100 * num) / den) : null);
const sum = (rs: StoredRow[], p: (r: StoredRow) => boolean = () => true) => rs.filter(p).reduce((s, r) => s + r.n, 0);

export function summarize(rows: StoredRow[], periods: { period: string; status: string }[], a: StopsArgs): StopsResult {
  if (!rows.length) return { status: "refused", reason: "Stop counts haven't been built yet." };
  const kind = a.kind ?? "all";
  const f = a.filters ?? {};
  if (kind !== "field-interview" && (f.frisked || f.searched || f.found?.length || a.groupBy === "found")) return { status: "refused", reason: FI_ONLY };

  const stored = [...new Set(rows.map((r) => r.period))].sort((x, y) => at(x, false) - at(y, false));
  const help = `Periods are years ("2021") or quarters ("2021-Q3"); the data covers ${periodLabel(stored[0])} to ${periodLabel(stored[stored.length - 1])}.`;
  const lo = a.from ? bound(a.from, false) : at(stored[0], false);
  const hi = a.to ? bound(a.to, true) : at(stored[stored.length - 1], true);
  if (lo === null || hi === null || lo > hi) return { status: "refused", reason: help };
  const overlaps = (p: string) => at(p, true) >= lo && at(p, false) <= hi;
  const inRange = stored.filter(overlaps);
  if (!inRange.length) return { status: "refused", reason: help };

  // Values: only stored ones, in any case; an unknown one offers the stored choices.
  const want: Partial<Record<"race" | "sex" | "found", Set<string>>> = {};
  for (const [col, asked] of [["race", f.race], ["sex", f.sex], ["found", f.found]] as const) {
    if (!asked?.length) continue;
    const known = [...new Set(rows.map((r) => r[col]).filter((v): v is string => v !== null))].sort();
    const set = new Set<string>();
    for (const x of asked) {
      const hit = known.find((k) => k.toLowerCase() === x.trim().toLowerCase());
      if (!hit) return { status: "choose", column: col, asked: x, choices: known };
      set.add(hit);
    }
    want[col] = set;
  }
  const keep = rows.filter((r) => inRange.includes(r.period) && (kind === "all" || r.kind === kind)
    && (!want.race || want.race.has(r.race)) && (!want.sex || want.sex.has(r.sex)) && (!want.found || (r.found !== null && want.found.has(r.found)))
    && (!f.frisked || r.frisked === f.frisked) && (!f.searched || r.searched === f.searched));
  const total = sum(keep);

  const g = a.groupBy ?? null;
  const rates = kind === "field-interview" && (g === "race" || g === "sex");
  const keyOf = (r: StoredRow) => (g === "year" ? String(r.year) : g === "quarter" ? r.period : g === "kind" ? r.kind : g ? String(r[g] ?? "Unknown") : "");
  const byKey = new Map<string, StoredRow[]>();
  if (g) for (const r of keep) byKey.set(keyOf(r), [...(byKey.get(keyOf(r)) ?? []), r]);
  const keys = [...byKey.keys()].sort((x, y) => (g === "year" ? Number(x) - Number(y) : g === "quarter" ? at(x, false) - at(y, false) : sum(byKey.get(y)!) - sum(byKey.get(x)!)));
  const groups: StopGroup[] = keys.map((k) => {
    const rs = byKey.get(k)!;
    const n = sum(rs);
    const searched = sum(rs, (r) => r.searched === "yes");
    return {
      label: g === "quarter" ? periodLabel(k) : g === "kind" ? KIND_LABEL[k as StopKind] : k,
      n, share: total ? round1((100 * n) / total) : 0,
      ...(rates ? {
        frisked: rate(sum(rs, (r) => r.frisked === "yes"), sum(rs, (r) => r.frisked === "yes" || r.frisked === "no")),
        searched: rate(searched, sum(rs, (r) => r.searched === "yes" || r.searched === "no")),
        found: rate(sum(rs, (r) => r.searched === "yes" && r.found !== null && r.found !== "None" && r.found !== "Unknown"), searched),
      } : {}),
    };
  });

  const first = periodLabel(inRange[0]), last = periodLabel(inRange[inRange.length - 1]);
  const failed = periods.filter((p) => p.status === "failed" && !stored.includes(p.period) && overlaps(p.period));
  return {
    status: "ok", kind, total, groupBy: g, groups, rates,
    period: first === last ? first : `${first} – ${last}`,
    filters: [
      ...(want.race ?? []), ...(want.sex ?? []),
      ...(f.frisked ? [f.frisked === "yes" ? "frisked" : "not frisked"] : []),
      ...(f.searched ? [f.searched === "yes" ? "searched" : "not searched"] : []),
      ...[...(want.found ?? [])].map((x) => `found: ${x}`),
    ],
    source: `From MPD's quarterly stop-and-search data (${first} to ${last}), counted by the Almanac from the City's files.`,
    notes: [PEOPLE_NOTE, RACE_NOTE, ...failed.map((p) => `The City's file for ${periodLabel(p.period)} couldn't be read.`), NOT_RATES],
  };
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/lib/stopMath.test.ts`
Expected: PASS. Check the rate test by hand if it fails: Black field interviews total 40; frisked 12 of 40 = 30%; searched 20 of 40 = 50%; found 12 of 20 = 60%; share 40/43 = 93.0%. White has 3 people, under the floor, so every rate is null.

- [ ] **Step 5: Commit**

```bash
git add convex/lib/stopMath.ts tests/lib/stopMath.test.ts
git commit -m "feat: stop counts by period, race, sex or kind, with field-interview rates and notes

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Storing counts, the refresh, and the query

**Files:**
- Create: `convex/stops.ts`
- Modify: `convex/validators.ts` (add `vStopRow`), `convex/schema.ts` (two tables), `convex/build.ts` (finish step), `convex/lib/cityFamilies.ts` (`cityNote`), `tests/helpers/fakeFetch.ts` (`cityDownloads`)
- Test: `convex/stops.test.ts`, `tests/lib/cityFamilies.test.ts`

**Interfaces:**
- Consumes: Task 1 (`periodOf`, `stopTables`, `dataZip`, `kindOfTable`, `columnsFor`, `groupSql`, `tally`, `countCsv`, `KINDS`); Task 2 (`summarize`, `StopsResult`).
- Produces:
  - `internal.stops.refreshStops({}) → string[]` (notes)
  - `api.stops.countStops(args: StopsArgs) → StopsResult` (public query)
  - tables `stopCounts`, `stopPeriods`
  - `cityNote("city:<…>-mpd-stop-and-search-data")` → "Ask can count people stopped across all quarters, 2019–2024."

- [ ] **Step 1: The fake download option**

In `tests/helpers/fakeFetch.ts`, add to `FakeOptions`:

```ts
  cityDownloads?: Record<string, Uint8Array | number>; // a City download link → its bytes, or an HTTP status for a failure
```

And in the handler, before the `datastore_search_sql` branch:

```ts
    if (url.startsWith("https://data.milwaukee.gov/dataset/") && url.includes("/download/") && opts.cityDownloads) {
      const d = opts.cityDownloads[url];
      if (d === undefined) return new Response("not found", { status: 404 });
      return typeof d === "number" ? new Response("down", { status: d }) : new Response(new Uint8Array(d), { status: 200 });
    }
```

- [ ] **Step 2: Write the failing tests**

`convex/stops.test.ts`:

```ts
/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { strToU8, zipSync } from "fflate";
import { afterEach, describe, expect, it, vi } from "vitest";
import { installFakeFetch } from "../tests/helpers/fakeFetch";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");
afterEach(() => vi.unstubAllGlobals());

const link = (pkg: string, rid: string, file: string) => `https://data.milwaukee.gov/dataset/${pkg}/resource/${rid}/download/${file}`;
const T21 = "11111111-1111-1111-1111-111111111111", F21 = "22222222-2222-2222-2222-222222222222", N21 = "33333333-3333-3333-3333-333333333333";
const ZIP23 = link("p23", "55555555-5555-5555-5555-555555555555", "final-mpd-sc-datasets-2023-q4.zip");
const PKG21 = [
  { name: "Tracs_Individual_REMCOL.csv", format: "CSV", url: link("p21", T21, "t.csv") },
  { name: "Inform_FieldInterviewPerson_REDACTED_REMCOL.csv", format: "CSV", url: link("p21", F21, "f.csv") },
  { name: "Inform_NoActionEncounterPerson_REDACTED.csv", format: "CSV", url: link("p21", N21, "n.csv") },
  { name: "2021 Q4 - Tracs lookup files - CSV.zip", format: "ZIP", url: link("p21", "44444444-4444-4444-4444-444444444444", "l.zip") },
];
const PKG23 = [{ name: "MPD SC Datasets 2023 Q4.zip", format: "ZIP", url: ZIP23 }];

async function seed(t: TestConvex<typeof schema>, modified21 = "2025-02-14T20:49:36", modified23 = "2024-09-11T16:39:29") {
  await t.run(async (ctx) => {
    for (const [key, code, title, modified, files] of [
      ["city:2021-4th-quarter-mpd-stop-and-search-data", "X17", "2021 4th Quarter - MPD Stop and Search Data", modified21, PKG21],
      ["city:2023-4th-quarter-mpd-stop-and-search-data", "X27", "2023 4th Quarter - MPD Stop and Search Data", modified23, PKG23],
    ] as const) {
      await ctx.db.insert("families", { key, code, name: title, kind: "dataset", topic: "Public Safety", keywords: [], places: ["City"], years: [], latestModified: modified, baseSearchText: "", searchText: "", dictionaryTab: null, source: "city", live: false });
      await ctx.db.insert("members", { familyKey: key, hubId: key, title, yearLabel: "", featureServerUrl: "", kind: "dataset", landingPage: "", place: "City", years: [], modified, downloads: {}, description: "", keywords: [], files: [...files] });
    }
  });
}

const FIELDS: Record<string, { id: string; type: string }[]> = {
  [T21]: ["CollKey", "Race", "sex", "entityType"].map((id) => ({ id, type: "text" })),
  [F21]: ["Id", "age_code", "sex_Code", "race_Description", "ethnicity_Description", "Pat_Down_Description", "Search_Performed_Description", "Search_Results_Description", "stop_Justification"].map((id) => ({ id, type: "text" })),
  [N21]: ["Id", "NAE_Id", "sex_Code", "race_Description", "ethnicity_Description"].map((id) => ({ id, type: "text" })),
};
const SQL = (sql: string) =>
  sql.includes(T21) ? [{ race: "B", sex: "M", n: "10" }, { race: "H", sex: "F", n: "3" }]
    : sql.includes(F21) ? [{ race: "BLACK/AFRICAN AMERICAN", eth: "NOT HISPANIC/LATINO", sex: "M", frisked: "Yes", searched: "Yes", found: "FIREARM", n: "4" }]
    : [{ race: "WHITE", eth: "HISPANIC/LATINO", sex: "F", n: "1" }];
const zip23 = () => zipSync({
  "FINAL - MPD SC Datasets 2023 Q4/Tracs_Individual_REMCOL.csv": strToU8("CollKey,Race,sex,entityType\nc1,B,M,I\nc2,W,F,I\n"),
  "FINAL - MPD SC Datasets 2023 Q4/Inform_FieldInterviewPerson_REMCOL_REDACTED.csv": strToU8("Column1,Column2,Column3,Column4,Column5,Column6,Column7\nId,sex_Code,race_Description,ethnicity_Description,Pat_Down_Description,Search_Performed_Description,Search_Results_Description\nx,M,WHITE,NOT HISPANIC/LATINO,No,No,NONE\n"),
  "FINAL - MPD SC Datasets 2023 Q4/Inform_NoActionEncounterPerson_REDACTED.csv": strToU8('Id,NAE_Id,sex_Code,race_Description,ethnicity_Description,stop_Justification\ny,z,M,BLACK/AFRICAN AMERICAN,UNKNOWN,"Narrative, with a comma"\n'),
});
const countsOf = (t: TestConvex<typeof schema>, period: string) => t.run((ctx) => ctx.db.query("stopCounts").withIndex("by_period", (q) => q.eq("period", period)).collect());

describe("refreshStops (K3)", () => {
  it("counts a queryable quarter with grouped SQL and a ZIP quarter from its CSVs, storing counts only", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    installFakeFetch({ cityFieldsFor: (rid) => FIELDS[rid], citySql: SQL, cityDownloads: { [ZIP23]: zip23() } });
    expect(await t.action(internal.stops.refreshStops, {})).toEqual([]);
    const q4 = await countsOf(t, "2021-Q4");
    expect(q4.map(({ kind, race, sex, n }) => [kind, race, sex, n])).toEqual(expect.arrayContaining([["traffic", "Black", "Male", 10], ["traffic", "Hispanic", "Female", 3], ["field-interview", "Black", "Male", 4], ["no-action", "Hispanic", "Female", 1]]));
    const z = await countsOf(t, "2023-Q4");
    expect(z.map(({ kind, race, n }) => [kind, race, n])).toEqual(expect.arrayContaining([["traffic", "Black", 1], ["traffic", "White", 1], ["field-interview", "White", 1], ["no-action", "Black", 1]]));
    // Only counts are stored: no narrative, IDs or keys from MPD's rows (record ids left out of the check).
    expect(JSON.stringify([...q4, ...z].map(({ kind, race, sex, frisked, searched, found, n }) => ({ kind, race, sex, frisked, searched, found, n })))).not.toMatch(/Narrative|CollKey|"c1"|"x"|"y"/);
  });
  it("skips a quarter already counted from the same catalog version (no City request)", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    installFakeFetch({ cityFieldsFor: (rid) => FIELDS[rid], citySql: SQL, cityDownloads: { [ZIP23]: zip23() } });
    await t.action(internal.stops.refreshStops, {});
    const f = installFakeFetch({ cityFieldsFor: (rid) => FIELDS[rid], citySql: SQL, cityDownloads: { [ZIP23]: zip23() } });
    expect(await t.action(internal.stops.refreshStops, {})).toEqual([]);
    expect(f.calls).toHaveLength(0);
  });
  it("marks a refused quarter failed, keeps its earlier counts, and retries it next time (review focus 1)", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    installFakeFetch({ cityFieldsFor: (rid) => FIELDS[rid], citySql: SQL, cityDownloads: { [ZIP23]: zip23() } });
    await t.action(internal.stops.refreshStops, {});
    await t.run(async (ctx) => { for (const m of await ctx.db.query("members").collect()) await ctx.db.patch(m._id, { modified: "2026-01-01T00:00:00" }); });
    installFakeFetch({ cityFieldsFor: (rid) => FIELDS[rid], citySql: SQL, cityDownloads: { [ZIP23]: 403 } });
    const notes = await t.action(internal.stops.refreshStops, {});
    expect(notes).toEqual(["Stops 2023-Q4: ZIP download failed: 403; kept any earlier counts"]);
    expect((await countsOf(t, "2023-Q4")).length).toBeGreaterThan(0);
    const f = installFakeFetch({ cityFieldsFor: (rid) => FIELDS[rid], citySql: SQL, cityDownloads: { [ZIP23]: zip23() } });
    expect(await t.action(internal.stops.refreshStops, {})).toEqual([]);
    expect(f.count("/download/")).toBe(1); // the failed quarter was retried; the counted one wasn't
  });
  it("fails a quarter whose table lacks a column, naming it (review focus 2)", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    installFakeFetch({ cityFieldsFor: (rid) => (rid === F21 ? FIELDS[F21].filter((f) => f.id !== "Pat_Down_Description") : FIELDS[rid]), citySql: SQL, cityDownloads: { [ZIP23]: zip23() } });
    expect(await t.action(internal.stops.refreshStops, {})).toEqual(["Stops 2021-Q4: field-interview table has no patdowndescription column; kept any earlier counts"]);
    expect(await countsOf(t, "2021-Q4")).toHaveLength(0);
  });
});

describe("countStops (K3)", () => {
  it("answers from the stored counts", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    installFakeFetch({ cityFieldsFor: (rid) => FIELDS[rid], citySql: SQL, cityDownloads: { [ZIP23]: zip23() } });
    await t.action(internal.stops.refreshStops, {});
    const r = await t.query(api.stops.countStops, { kind: "traffic", groupBy: "year" });
    expect(r).toMatchObject({ status: "ok", total: 15, period: "2021 Q4 – 2023 Q4", groups: [{ label: "2021", n: 13 }, { label: "2023", n: 2 }] });
  });
});
```

Add to `tests/lib/cityFamilies.test.ts`:

```ts
describe("stop-and-search pages (K3)", () => {
  it("say Ask counts across quarters", () => {
    expect(cityNote("city:2023-4th-quarter-mpd-stop-and-search-data")).toBe("Ask can count people stopped across all quarters, 2019–2024.");
  });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `npx vitest run convex/stops.test.ts tests/lib/cityFamilies.test.ts`
Expected: FAIL. `internal.stops` doesn't exist (a module or type error), and the cityNote test gets `null`.

- [ ] **Step 4: Validators and schema**

`convex/validators.ts`, at the end:

```ts
const vYesNo = v.union(v.literal("yes"), v.literal("no"), v.literal("unknown"));
// One stored stop count (spec 2026-10-13-stop-search-design §4): people per combination, never a person.
export const vStopRow = v.object({
  kind: v.union(v.literal("traffic"), v.literal("field-interview"), v.literal("no-action")),
  race: v.string(), sex: v.string(), frisked: v.union(vYesNo, v.null()), searched: v.union(vYesNo, v.null()), found: v.union(v.string(), v.null()), n: v.number(),
});
```

`convex/schema.ts`: add `vStopRow` to the validators import, and these tables beside `cityFigures`:

```ts
  stopCounts: defineTable({ period: v.string(), year: v.number(), ...vStopRow.fields }).index("by_period", ["period"]),
  stopPeriods: defineTable({ period: v.string(), familyKey: v.string(), modified: v.string(), status: v.union(v.literal("counted"), v.literal("failed")), note: v.optional(v.string()) }).index("by_period", ["period"]),
```

- [ ] **Step 5: `convex/stops.ts`**

```ts
import { v } from "convex/values";
import { strFromU8, unzipSync } from "fflate";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery, query, type MutationCtx } from "./_generated/server";
import { datastoreFields, datastoreSql } from "./lib/ckan";
import { fetchWithTimeout } from "./lib/http";
import { summarize, type StopsResult } from "./lib/stopMath";
import { columnsFor, countCsv, dataZip, groupSql, KINDS, kindOfTable, periodOf, stopTables, tally, type Raw, type StopRow } from "./lib/stops";
import { vStopRow } from "./validators";

// MPD's quarterly stop-and-search data as stored counts (spec 2026-10-13-stop-search-design §4–5).
const ZIP_TIMEOUT_MS = 30_000;
const STOP_FAMILY = /-mpd-stop-and-search-data$/;
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export const stopPackages = internalQuery({
  args: {},
  handler: async (ctx) => {
    const out: { familyKey: string; title: string; modified: string; files: { name: string; format: string; url: string }[] }[] = [];
    for (const f of (await ctx.db.query("families").collect()).filter((x) => STOP_FAMILY.test(x.key))) {
      const m = await ctx.db.query("members").withIndex("by_family", (q) => q.eq("familyKey", f.key)).first();
      if (m) out.push({ familyKey: f.key, title: m.title, modified: m.modified, files: (m.files ?? []).map(({ name, format, url }) => ({ name, format, url })) });
    }
    return out;
  },
});

export const stopStatus = internalQuery({
  args: {},
  handler: async (ctx) => (await ctx.db.query("stopPeriods").collect()).map(({ period, modified, status }) => ({ period, modified, status })),
});

async function setPeriod(ctx: MutationCtx, p: { period: string; familyKey: string; modified: string; status: "counted" | "failed"; note?: string }) {
  const old = await ctx.db.query("stopPeriods").withIndex("by_period", (q) => q.eq("period", p.period)).first();
  if (old) await ctx.db.replace(old._id, p);
  else await ctx.db.insert("stopPeriods", p);
}

// A period's counts replaced in one transaction, so a reader never sees half a quarter.
export const replacePeriod = internalMutation({
  args: { period: v.string(), year: v.number(), familyKey: v.string(), modified: v.string(), rows: v.array(vStopRow) },
  handler: async (ctx, { period, year, familyKey, modified, rows }) => {
    for (const old of await ctx.db.query("stopCounts").withIndex("by_period", (q) => q.eq("period", period)).collect()) await ctx.db.delete(old._id);
    for (const r of rows) await ctx.db.insert("stopCounts", { ...r, period, year });
    await setPeriod(ctx, { period, familyKey, modified, status: "counted" });
  },
});

// A failed package keeps whatever counts it had; its status says failed, so the next run retries it.
export const markFailed = internalMutation({
  args: { period: v.string(), familyKey: v.string(), modified: v.string(), note: v.string() },
  handler: async (ctx, p) => setPeriod(ctx, { ...p, status: "failed" }),
});

// The three person tables' counts: grouped SQL when the City's database has them, else the package's data ZIP.
async function countPackage(files: { name: string; format: string; url: string }[]): Promise<StopRow[]> {
  const tables = stopTables(files);
  const out: StopRow[] = [];
  if (KINDS.every((k) => tables.some((t) => t.kind === k))) {
    for (const t of tables) {
      const c = columnsFor(t.kind, (await datastoreFields(t.resourceId)).map((f) => f.id));
      if (!c.ok) throw new Error(`${t.kind} table has no ${c.missing} column`);
      out.push(...tally(t.kind, await datastoreSql<Raw>(groupSql(t.kind, t.resourceId, c.cols))));
    }
    return out;
  }
  const url = dataZip(files);
  if (!url) throw new Error("no person tables or data ZIP in the package");
  const res = await fetchWithTimeout(url, {}, ZIP_TIMEOUT_MS);
  if (!res.ok) throw new Error(`ZIP download failed: ${res.status}`);
  const base = (n: string) => n.split("/").pop() ?? "";
  const entries = unzipSync(new Uint8Array(await res.arrayBuffer()), { filter: (f) => kindOfTable(base(f.name)) !== null });
  for (const kind of KINDS) {
    const name = Object.keys(entries).find((n) => kindOfTable(base(n)) === kind);
    if (!name) throw new Error(`${kind} table missing from the ZIP`);
    const c = countCsv(kind, strFromU8(entries[name]));
    if (!c.ok) throw new Error(`${kind} table has no ${c.missing} column`);
    out.push(...c.rows);
  }
  return out;
}

// Weekly (build.finish) or alone: `npx convex run stops:refreshStops`. Notes, never throws. Published quarters don't
// change, so a package already counted from the same catalog version is skipped; a failed one is retried.
export const refreshStops = internalAction({
  args: {},
  handler: async (ctx): Promise<string[]> => {
    const notes: string[] = [];
    const done = new Map((await ctx.runQuery(internal.stops.stopStatus, {})).map((s) => [s.period, s]));
    for (const pkg of await ctx.runQuery(internal.stops.stopPackages, {})) {
      const p = periodOf(pkg.title);
      if (!p) { notes.push(`Stops: "${pkg.title}" isn't a quarter title; skipped`); continue; }
      const prev = done.get(p.period);
      if (prev?.status === "counted" && prev.modified === pkg.modified) continue;
      try {
        const rows = await countPackage(pkg.files);
        await ctx.runMutation(internal.stops.replacePeriod, { period: p.period, year: p.year, familyKey: pkg.familyKey, modified: pkg.modified, rows });
      } catch (e) {
        notes.push(`Stops ${p.period}: ${message(e)}; kept any earlier counts`);
        await ctx.runMutation(internal.stops.markFailed, { period: p.period, familyKey: pkg.familyKey, modified: pkg.modified, note: message(e) });
      }
    }
    return notes;
  },
});

const vYesNoAsk = v.union(v.literal("yes"), v.literal("no"));
// Ask's countStops: the stored counts, filtered and grouped by code. Public: counts of people, no City request.
export const countStops = query({
  args: {
    kind: v.optional(v.union(v.literal("traffic"), v.literal("field-interview"), v.literal("no-action"), v.literal("all"))),
    from: v.optional(v.string()), to: v.optional(v.string()),
    filters: v.optional(v.object({ race: v.optional(v.array(v.string())), sex: v.optional(v.array(v.string())), frisked: v.optional(vYesNoAsk), searched: v.optional(vYesNoAsk), found: v.optional(v.array(v.string())) })),
    groupBy: v.optional(v.union(v.literal("year"), v.literal("quarter"), v.literal("race"), v.literal("sex"), v.literal("kind"), v.literal("found"))),
  },
  handler: async (ctx, args): Promise<StopsResult> => {
    const rows = (await ctx.db.query("stopCounts").collect()).map(({ _id, _creationTime, ...r }) => r);
    const periods = (await ctx.db.query("stopPeriods").collect()).map(({ period, status }) => ({ period, status }));
    return summarize(rows, periods, args);
  },
});
```

- [ ] **Step 6: Weekly build and dataset page**

`convex/build.ts`, in the finish handler after the `cityNotes` block:

```ts
    let stopNotes: string[];
    try {
      stopNotes = await ctx.runAction(internal.stops.refreshStops, {});
    } catch (e) {
      stopNotes = [`Stop counts refresh failed: ${message(e)}`];
    }
```

And change the `completeBuild` call's notes to `[...neighborhoodNotes, ...boundaryNotes, ...cityNotes, ...stopNotes]`.

`convex/lib/cityFamilies.ts`, in `cityNote` before the `YEARLY` return:

```ts
  if (/-mpd-stop-and-search-data$/.test(familyKey)) return "Ask can count people stopped across all quarters, 2019–2024.";
```

- [ ] **Step 7: Run the tests**

Run: `npx vitest run convex/stops.test.ts tests/lib/cityFamilies.test.ts convex/build.test.ts`
Expected: PASS.

If the skip test sees calls, check that `stopStatus` returns `modified` exactly as `stopPackages` does. Both read the member's `modified` string.

- [ ] **Step 8: Typecheck and commit**

Run: `npx tsc --noEmit`
Expected: no output.

```bash
git add convex/stops.ts convex/validators.ts convex/schema.ts convex/build.ts convex/lib/cityFamilies.ts tests/helpers/fakeFetch.ts convex/stops.test.ts tests/lib/cityFamilies.test.ts
git commit -m "feat: count MPD stop packages into stored counts (SQL or ZIP), weekly; countStops reads them

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: The Ask tool

**Files:**
- Modify: `lib/ask/tools.ts`, `lib/ask/backend.ts`, `scripts/ask-report-card.ts`, `tests/ui/askTools.test.ts`

**Interfaces:**
- Consumes: `api.stops.countStops` (Task 3).
- Produces:
  - `stopsParams` (zod)
  - `type StopsAnswer = FunctionReturnType<typeof api.stops.countStops>`
  - `AskBackend.stops(a)`
  - tool name `"countStops"`

- [ ] **Step 1: Write the failing test**

In `tests/ui/askTools.test.ts`, add `stops: async () => ({ status: "refused", reason: "" }) as never,` to the stub backend object (beside `factSheet`). Then add:

```ts
  it("offers countStops for who MPD stops, with field-interview rates, and no location argument (K3)", () => {
    const tool = askTools(backend({})).find((t) => t.name === "countStops")!;
    expect(tool.description).toMatch(/field interview/i);
    expect(Object.keys(tool.parameters.shape).sort()).toEqual(["filters", "from", "groupBy", "kind", "to"]);
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/ui/askTools.test.ts`
Expected: FAIL — `tool` is undefined.

- [ ] **Step 3: Implement**

`lib/ask/tools.ts`:
- Add `| "countStops"` to `AskToolName`.
- Add `export type StopsAnswer = FunctionReturnType<typeof api.stops.countStops>;` beside `SpanResult`.
- Add `stops(a: z.infer<typeof stopsParams>): Promise<StopsAnswer>;` to `AskBackend`.
- After `spanParams`:

```ts
// countStops' arguments; the stops card reads the same ones for its follow-up questions.
export const stopsParams = z.object({
  kind: z.enum(["traffic", "field-interview", "no-action", "all"]).optional().describe("Which stops; default all"),
  from: z.string().max(7).optional().describe('"YYYY" or "YYYY-Qn", e.g. "2021" or "2021-Q3"'),
  to: z.string().max(7).optional().describe('"YYYY" or "YYYY-Qn"'),
  filters: z.object({
    race: z.array(z.string()).max(6).optional(), sex: z.array(z.string()).max(3).optional(),
    frisked: z.enum(["yes", "no"]).optional(), searched: z.enum(["yes", "no"]).optional(), found: z.array(z.string()).max(6).optional(),
  }).optional().describe("frisked, searched and found exist for field interviews only"),
  groupBy: z.enum(["year", "quarter", "race", "sex", "kind", "found"]).optional(),
});
```

- In the tool list, after `timeSpan`:

```ts
    {
      name: "countStops",
      description: "Count the people MPD stopped, 2019–2024, from MPD's quarterly stop-and-search data: traffic stops, field interviews (stops of people on foot or in vehicles that MPD documents, with frisks and searches) and no-action encounters. Group by year, quarter, race (race and ethnicity as one group), sex, kind or found. For field interviews grouped by race or sex it also gives the share frisked, the share searched, and how often a search found something. Counts people per stop, not residents; the files record no locations, so it can't count by neighborhood or district. If it returns choose, pick from the choices and call again; if refused, tell the person why. The card carries every figure; don't restate them.",
      parameters: stopsParams,
      execute: (a: z.infer<typeof stopsParams>) => b.stops(a),
    },
```

`lib/ask/backend.ts`: add `stops: (a) => fetchQuery(api.stops.countStops, a),` beside `factSheet`.

`scripts/ask-report-card.ts`: add `stops: async (a) => run("stops:countStops", a),` beside `factSheet`.

- [ ] **Step 4: Run the tests and typecheck**

Run: `npx vitest run tests/ui/askTools.test.ts && npx tsc --noEmit`
Expected: PASS, no type errors. If `tsc` reports that `FunctionReturnType<typeof api.stops.countStops>` is missing, run `npx convex codegen` (it regenerates `convex/_generated/api.d.ts` locally without pushing). Commit the regenerated file with this task.

- [ ] **Step 5: Commit**

```bash
git add lib/ask/tools.ts lib/ask/backend.ts scripts/ask-report-card.ts tests/ui/askTools.test.ts convex/_generated/api.d.ts
git commit -m "feat: Ask's countStops tool

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: The stops card

**Files:**
- Create: `ui/lib/stopsText.ts`, `ui/components/StopsCard.tsx`
- Modify: `ui/components/AskCards.tsx`
- Test: `tests/ui/stopsText.test.ts`

**Interfaces:**
- Consumes: `StopsAnswer`, `stopsParams` (Task 4); `exported`, `safeName`, `CardExport`, `Ctx` from `ui/lib/cardExport.ts`.
- Produces: `stopsTitle(r)`, `stopsExport(r, ctx)`, `stopsFollowUps(r)`, `stopsChoices(r)`, `RATE_HEADS`; `<StopsCard r>`; the `countStops` render in AskCards.

- [ ] **Step 1: Write the failing tests**

`tests/ui/stopsText.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { stopsChoices, stopsExport, stopsFollowUps, stopsTitle } from "../../ui/lib/stopsText";

const r = {
  status: "ok" as const, kind: "field-interview" as const, period: "2019 Q1–Q2 – 2024 Q4", total: 43, groupBy: "race" as const, rates: true, filters: [],
  groups: [{ label: "Black", n: 40, share: 93, frisked: 30, searched: 50, found: 60 }, { label: "White", n: 3, share: 7, frisked: null, searched: null, found: null }],
  source: "From MPD's quarterly stop-and-search data (2019 Q1–Q2 to 2024 Q4), counted by the Almanac from the City's files.",
  notes: ["People per stop as MPD recorded them: a person stopped twice counts twice.", "These are counts, not rates per resident."],
};
const ctx = { origin: "https://almanac.test", date: "October 13, 2026" };

describe("stops card text (K3)", () => {
  it("titles the card with kind, period and group", () => {
    expect(stopsTitle(r)).toBe("MPD stops · Field interviews · 2019 Q1–Q2 – 2024 Q4 · by race");
  });
  it("exports the rows, rates as too few to say, the notes and the source", () => {
    const e = stopsExport(r, ctx);
    expect(e.csv.head).toEqual(["race", "People", "Share (%)", "Frisked (%)", "Searched (%)", "Found something (of searched) (%)"]);
    expect(e.csv.rows[1]).toEqual(["White", 3, 7, null, null, null]);
    expect(e.text.rows[1]).toEqual(["White", "3", "7%", "too few to say", "too few to say", "too few to say"]);
    expect(e.notes).toEqual([...r.notes, r.source, "Exported from Cream City Almanac on October 13, 2026."]);
    expect(e.filename).toBe("almanac_MPD-stops_field-interview_race");
  });
  it("offers the next questions that keep the period, and the stored choices on a pick", () => {
    expect(stopsFollowUps(r).map((f) => f.label)).toEqual(["BY YEAR"]);
    expect(stopsFollowUps({ ...r, kind: "traffic", groupBy: "year", rates: false }).map((f) => f.label)).toEqual(["BY RACE", "FIELD INTERVIEWS: FRISKS AND SEARCHES BY RACE"]);
    expect(stopsFollowUps({ ...r, groupBy: null }).find((f) => f.label === "BY RACE")?.question).toBe("Who did MPD stop in field interviews, 2019 Q1–Q2 – 2024 Q4, by race?");
    expect(stopsChoices({ column: "race", choices: ["Black", "White"] })).toEqual([{ label: "Black", question: "MPD stops where race is Black." }, { label: "White", question: "MPD stops where race is White." }]);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/ui/stopsText.test.ts`
Expected: FAIL — cannot find module `../../ui/lib/stopsText`.

- [ ] **Step 3: Implement**

`ui/lib/stopsText.ts`:

```ts
import type { StopsAnswer } from "@/lib/ask/tools";
import type { FollowUp } from "@/ui/components/FollowUps";
import { exported, safeName, type CardExport, type Ctx } from "./cardExport";

// The stops card's words and export (spec 2026-10-13-stop-search-design §6), written by code from the stored counts.
export type StopsOk = Extract<StopsAnswer, { status: "ok" }>;
export const RATE_HEADS = ["Frisked", "Searched", "Found something (of searched)"];
const KIND_WORDS = { all: "All stops", traffic: "Traffic stops", "field-interview": "Field interviews", "no-action": "No-action encounters" } as const;
export const rateText = (x: number | null | undefined) => (x === null || x === undefined ? "too few to say" : `${x}%`);

export const stopsTitle = (r: StopsOk) => ["MPD stops", KIND_WORDS[r.kind], r.period, ...r.filters, ...(r.groupBy ? [`by ${r.groupBy}`] : [])].join(" · ");

export function stopsExport(r: StopsOk, ctx: Ctx): CardExport {
  const rows = r.groups.length ? r.groups : [{ label: "Total", n: r.total, share: 100 }];
  return {
    title: stopsTitle(r),
    lines: [],
    csv: { head: [r.groupBy ?? "", "People", "Share (%)", ...(r.rates ? RATE_HEADS.map((h) => `${h} (%)`) : [])], rows: rows.map((g) => [g.label, g.n, g.share, ...(r.rates ? [g.frisked ?? null, g.searched ?? null, g.found ?? null] : [])]) },
    text: { head: [r.groupBy ?? "", "People", "Share", ...(r.rates ? RATE_HEADS : [])], rows: rows.map((g) => [g.label, g.n.toLocaleString("en-US"), `${g.share}%`, ...(r.rates ? [rateText(g.frisked), rateText(g.searched), rateText(g.found)] : [])]) },
    notes: [...r.notes, r.source, exported(ctx)],
    filename: safeName(["MPD-stops", r.kind, r.groupBy ?? "total"]),
  };
}

// Next questions keep the card's kind, period and filters.
export function stopsFollowUps(r: StopsOk): FollowUp[] {
  const kind = r.kind === "all" ? "" : ` in ${KIND_WORDS[r.kind].toLowerCase()}`;
  const scope = `${r.filters.length ? ` (${r.filters.join(", ")})` : ""}, ${r.period}`;
  const out: FollowUp[] = [];
  if (r.groupBy !== "race") out.push({ label: "BY RACE", question: `Who did MPD stop${kind}${scope}, by race?` });
  if (r.groupBy !== "year") out.push({ label: "BY YEAR", question: `How many people did MPD stop${kind}${scope}, by year?` });
  if (r.kind !== "field-interview") out.push({ label: "FIELD INTERVIEWS: FRISKS AND SEARCHES BY RACE", question: `In MPD field interviews, ${r.period}, who was frisked and searched, by race?` });
  return out.slice(0, 3);
}

export const stopsChoices = (r: { column: string; choices: string[] }): FollowUp[] =>
  r.choices.slice(0, 8).map((c) => ({ label: c, question: `MPD stops where ${r.column} is ${c}.` }));
```

`ui/components/StopsCard.tsx`:

```tsx
"use client";

import { RATE_HEADS, rateText, stopsExport, stopsTitle, type StopsOk } from "@/ui/lib/stopsText";
import { ExportBar } from "./ExportBar";
import { ProvenanceTag } from "./ProvenanceTag";
import styles from "./ask.module.css";

// People MPD stopped, from the Almanac's counts of the City's quarterly files (spec 2026-10-13-stop-search-design §6).
export function StopsCard({ r }: { r: StopsOk }) {
  return (
    <figure className={styles.excerpt} data-card="stops">
      <figcaption className={styles.excerptTitle}>{stopsTitle(r)} <ProvenanceTag source="CITY" /></figcaption>
      <p className={styles.countFigure} data-count>{r.total.toLocaleString("en-US")} people</p>
      {r.groups.length > 0 && (
        <div className={styles.tractScroll} tabIndex={0} role="region" aria-label={`${stopsTitle(r)}, scroll sideways for more`}>
          <table className={styles.excerptTable}>
            <thead>
              <tr><th scope="col">{r.groupBy}</th><th scope="col">People</th><th scope="col">Share</th>{r.rates && RATE_HEADS.map((h) => <th key={h} scope="col">{h}</th>)}</tr>
            </thead>
            <tbody>
              {r.groups.map((g) => (
                <tr key={g.label}>
                  <th scope="row">{g.label}</th><td>{g.n.toLocaleString("en-US")}</td><td>{g.share}%</td>
                  {r.rates && <><td>{rateText(g.frisked)}</td><td>{rateText(g.searched)}</td><td>{rateText(g.found)}</td></>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {r.notes.map((n) => <p key={n} className={styles.source}>{n}</p>)}
      <p className={styles.source} data-source>{r.source}</p>
      <ExportBar make={(ctx) => stopsExport(r, ctx)} />
    </figure>
  );
}
```

`ui/components/AskCards.tsx`:
- Add `stopsParams` and `type StopsAnswer` to the `@/lib/ask/tools` import.
- Add the imports `import { StopsCard } from "./StopsCard";` and `import { stopsChoices, stopsFollowUps } from "@/ui/lib/stopsText";`.
- After the `factSheet` render, add:

```tsx
  useRenderTool({ name: "countStops", parameters: stopsParams, render: (props) => {
    if (props.status !== "complete") return <Busy />;
    const r = parse<StopsAnswer>(props.result);
    if (!r) return <Failed />;
    if (r.status === "choose") return <FollowUps pick items={stopsChoices(r)} id={props.toolCallId} />;
    if (r.status === "refused") return <p className={styles.failed} data-card="stops-refusal">{r.reason}</p>;
    return <><StopsCard r={r} /><FollowUps items={stopsFollowUps(r)} id={props.toolCallId} /></>;
  } }, []);
```

- [ ] **Step 4: Run the tests and typecheck**

Run: `npx vitest run tests/ui && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add ui/lib/stopsText.ts ui/components/StopsCard.tsx ui/components/AskCards.tsx tests/ui/stopsText.test.ts
git commit -m "feat: the MPD stops card: counts, shares, field-interview rates, notes, export, next questions

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Ask uses it; live check; browser and graded tests

**Files:**
- Modify: `lib/ask/prompt.ts`, `lib/ask/model.ts`, `scripts/ask-questions.ts`, `e2e/ask.spec.ts`

- [ ] **Step 1: Prompt line**

In `lib/ask/prompt.ts`, after the Master Property File line:

```
- For who MPD stops, frisks or searches (2019–2024), use countStops. It counts people per stop by race/ethnicity, sex, year or quarter; frisk, search and found rates exist for field interviews only. It has no locations, so it can't count by neighborhood or district.
```

- [ ] **Step 2: Scripted model**

In `lib/ask/model.ts`'s first-step ternary, before the `"fact sheet"` branch:

```ts
                : question.includes("who gets stopped")
                ? call("countStops", { kind: "field-interview", groupBy: "race" })
```

Add to the header comment: `"who gets stopped" → countStops field interviews by race;`.

- [ ] **Step 3: Graded question and browser test**

`scripts/ask-questions.ts`, after the property-since-2005 line:

```ts
  { q: "Who gets stopped in MPD field interviews, by race, from 2019 to 2024?", tool: "countStops", expect: { status: "ok", kind: "field-interview", race: "Black" }, final: true },
```

`e2e/ask.spec.ts`, inside `signed in`, after the property test:

```ts
  test("a stop-and-search question draws the stops card with field-interview rates", async ({ page }) => {
    await ask(page, "Who gets stopped by MPD, by race?");
    const card = page.locator("[data-card=stops]:visible");
    await expect(card).toBeVisible({ timeout: 40_000 });
    await expect(card).toContainText("Found something (of searched)");
    await expect(card.locator("[data-source]")).toContainText("From MPD's quarterly stop-and-search data");
  });
```

- [ ] **Step 4: Suite, typecheck, commit**

Run: `npx vitest run` (redirect output to the workspace and read the tail) and `npx tsc --noEmit`.
Expected: all pass, no type errors.

```bash
git add lib/ask/prompt.ts lib/ask/model.ts scripts/ask-questions.ts e2e/ask.spec.ts
git commit -m "feat: Ask asks MPD stops through countStops; scripted, browser and graded checks

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 5: Live check on dev (needs Tarik's OK)**

After the OK:

```bash
npx convex dev --once
npx convex run stops:refreshStops
```

Expected: `[]`, or notes naming the quarters that failed and why. Time the run.

Then read back, through `npx convex run` or `npx convex data stopCounts`:
- The number of periods: 23 expected (`2019-Q1Q2` … `2024-Q4`).
- **2023 Q4 traffic people = 15,472** (counted from the ZIP during exploration).
- **2021 Q4 field-interview people = 765**, and 2021 Q4 no-action = 9.
- People per kind per year (record them).
- One `countStops` answer: `{ kind: "field-interview", groupBy: "race" }`. Record its groups and rates.

Any failed quarter: read its note, fix the cause test-first if it's a format variant, re-run, and ledger it.

- [ ] **Step 6: Browser test locally**

Start this app with `npx next dev -p 3100` (in the background), then:
`set -a; . ./.env.local; set +a; BASE_URL=http://localhost:3100 npx playwright test e2e/ask.spec.ts -g "stop-and-search"`
Expected: PASS on desktop and phone. Stop the server afterwards.

- [ ] **Step 7: Graded real-AI question (needs Tarik's OK; about $0.10)**

Find the question's number: `npx tsx -e "import { ASK_QUESTIONS } from './scripts/ask-questions'; console.log(ASK_QUESTIONS.findIndex((q) => q.q.includes('MPD field interviews')) + 1)"`.
Then: `set -a; . ./.env.local; set +a; CONVEX_URL=${CONVEX_URL:-$NEXT_PUBLIC_CONVEX_URL} npx tsx scripts/ask-report-card.ts --only=<n>`.
Expected: PASS.

---

### Task 7: Docs

**Files:**
- Create: `docs/decisions/041-stop-search.md`
- Modify:
  - `ui/components/HowItWorks.tsx` (one sentence after the property sentence);
  - `e2e/how.spec.ts`;
  - `docs/research/2026-10-12-questions-by-audience.md`;
  - `docs/superpowers/specs/2026-10-13-stop-search-design.md` (§9 command, §4 action name).

- [ ] **Step 1: Failing browser test**

`e2e/how.spec.ts`:

```ts
test("it says Ask counts MPD stops across every quarter", async ({ page }) => {
  await page.goto("/how-it-works");
  await expect(page.getByText(/Stop-and-search questions count the people MPD stopped/)).toBeVisible();
});
```

Run (this app on :3100): `BASE_URL=http://localhost:3100 npx playwright test e2e/how.spec.ts -g "MPD stops" --project=desktop`
Expected: FAIL (text not found).

- [ ] **Step 2: The sentence**

In `ui/components/HowItWorks.tsx`, after the "Property questions can compare…" paragraph, add a paragraph:

"Stop-and-search questions count the people MPD stopped from 2019 to 2024, by race, sex and quarter. The Almanac reads the City's quarterly files once, stores only the counts, and shows frisk and search rates for field interviews."

Run the same command. Expected: PASS. Then run all of `e2e/how.spec.ts` against :3100 and record the results.

- [ ] **Step 3: Decision 041**

`docs/decisions/041-stop-search.md`, in the decision format (Decision / Why this came up / Options / What we chose and why / What we gave up / How we'll know / What actually happened, left blank):
- **Decision:** count the people in MPD's quarterly stop-and-search data, 2019 Q1–Q2 to 2024 Q4, at build time, and store counts only.
- **Options:**
  - build-time counts for every quarter (chosen);
  - live queries on the 2019–21 tables only (stops at 2021);
  - skip.
- **Why build time:** 2022–24 exist only as ZIP files (a compressed bundle of files), and published quarters don't change.
- **Counts only:** no person's row, birth date, ID or narrative is ever stored.
- **People per stop, not stops:** the person tables are where race and sex live.
- **Race and ethnicity as one group** (Claude's proposal, approved by Tarik with the spec): traffic stops record Hispanic as a race code, while field interviews record it as ethnicity. Counting race alone would undercount Hispanic people in field interviews.
- **No location:** the person tables carry none.
- **Given up:**
  - stop locations;
  - officer, dispatch and use-of-force tables;
  - rates per resident;
  - only the fixed breakdowns can be asked.
- **How we'll know:**
  - 2023 Q4 traffic people matches the City's file (15,472);
  - every quarter counts or is named on the card;
  - the graded question passes.

Define "field interview" and "frisk" inline on first use.

- [ ] **Step 4: Questions document and spec**

`docs/research/2026-10-12-questions-by-audience.md`:
- Change the "Who gets stopped by MPD, over five years?" row's status to `**Now** (people stopped by race, sex and quarter, 2019–2024; frisk and search rates for field interviews)`.
- In gap 6: stop-and-search is done (K3, decision 041), and only elections remain (K4).

Spec: replace `build:refreshStops` with `stops:refreshStops` in §4 and §9.

- [ ] **Step 5: Commit**

```bash
git add docs/decisions/041-stop-search.md ui/components/HowItWorks.tsx e2e/how.spec.ts docs/research/2026-10-12-questions-by-audience.md docs/superpowers/specs/2026-10-13-stop-search-design.md
git commit -m "docs: decision 041, How it works and the questions list for stop and search

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```
