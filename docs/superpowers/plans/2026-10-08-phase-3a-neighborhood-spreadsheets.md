# Phase 3a: Neighborhood Spreadsheets — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Read all 99 Neighborhood Portrait spreadsheets in the weekly build, store their tables, show any neighborhood's tables (Estimate ± margin of error, with DYCU-file problems flagged) on the N03 sheet on phone and laptop, and make them searchable down to the exact table.

**Architecture:** A pure reader (`convex/lib/portrait.ts`) turns one `.xlsx` into tidy tables, built on the existing `readWorkbook` (`convex/lib/xlsx.ts`). A new weekly-build step (`processPortrait`) downloads each changed file, stores one `portraitTables` row per tab, and writes one search passage per tab into `docChunks`. `catalog.familySheet` gains a `portraits` index (neighborhoods → files, plus the newest file's tables for server rendering); a client component on the sheet loads other files with `catalog.portraitTables`. Search snippets from these passages carry a `focus` (place, year, topic) so a result opens that exact table.

**Tech Stack:** Convex 1.46 (actions, mutations, vector index), Next.js 16.4 App Router, React 19, CSS Modules, Vitest 5 (`edge-runtime` env, `convex-test`), Playwright 1.63 + axe, Impeccable comp-led gates. **No new dependencies** (`fflate` is already installed and used by `readWorkbook`).

**Spec:** `docs/superpowers/specs/2026-10-08-neighborhood-spreadsheets-design.md` (and `docs/decisions/015-neighborhood-spreadsheets.md`).

## What the planning research settled (2026-10-08)

- **All 99 files read** with a full scan: 20 files for 2021 have 15 tabs; 79 files for 2022–2024 have 16. Every tab has a `TABLE ID`/`VINTAGE` header block and one header row containing `Estimate` (found by that column, not by the word "Variable": 2021's Rent Paid header cell is `c..GROSS.RENT...RP_v`). 2021 files store text as inline strings.
- **Column groups:** simple tabs are `Estimate | % | MOE | SE | CV` (2021: `Estimate | Percent | MOE | SE | CV....`). Grouped tabs either prefix names in the header (`Total Estimate`, `Male.Estimate`, `Labor.Force.Estimate`) or repeat bare `Estimate | MOE | SE | CV` with **group titles one row above**, in merged cells starting at each group's Estimate column (e.g. 2023 Employment Status by Sex: `Total`, `Labor Force Participation Rate`, `Employment/Population Ratio`, `Unemployment Rate (% of Labor)`). Extra derived columns (`Labor Force #`, rates) are ignored.
- **Problems:** about 45,000 error cells across the 99 files, **all in derived columns** (%, CV, rates); Estimate and MOE columns are clean. In 2022–2024 files the SE column is 0 and CV is `#DIV/0!`, so **only Estimate and MOE are stored and shown** (the spec's "SE kept but not shown" is dropped: the values are broken). 81 column groups are all zeros (e.g. 2023 Walker's Point, Sex and Age, the Total group, while Male and Female hold real numbers), so zero-checks run per group.
- **Table IDs** are sometimes phrases: `B08301 and B08303 (and S0801 if only one census tract)`; IDs are pulled out with a pattern. Types are B, S and DP tables.
- **Census link:** `https://data.census.gov/table?q=<ID>` (returns 200 for B25063, DP04, S2301; works for every table type).
- **Reuse:** `readWorkbook(bytes): Sheet[]` (`{ name, rows: string[][], links }`, dense 0-indexed rows) already reads shared, rich, inline, numeric and error cells. `pdfUrl(hubId)` (`convex/lib/arcgis.ts`) is the file URL. `reportDelays` spaces downloads. Fixtures are stored as base64 JSON because Convex tests run in `edge-runtime` (pattern: `tests/fixtures/dycu-inventory.xlsx.json` + `inventoryBytes()`).
- **Test catalog:** `tests/fixtures/hub-catalog.json` has all 99 spreadsheet items in family `document:neighborhood-portrait-spreadsheet` (N03); N02 is `document:neighborhood-portrait`.

## Global Constraints

- **Numbers exactly as DYCU published:** show Estimate and MOE as written in DYCU's file; never compute, fill or "fix" a number. %, SE, CV and rate columns are not shown.
- **No AI in this phase's data path:** parsing, problems and topic explanations are code and fixed text; embeddings only for search.
- **Problems are shown, never hidden:** every issue the reader records appears above its table in plain words.
- **Provenance:** numbers carry the **DYCU** tag; each Census table link carries **SOURCE**. Margin-of-error line, verbatim: "Margin of error: the range the true number likely falls in, at the Census Bureau's 90% confidence level."
- **Census link format:** `https://data.census.gov/table?q=<ID>`.
- **Address params:** `place` (neighborhood key), `year`, `topic` (topic slug), on `/d/N03` and on `/` with `open=N03`.
- **Laptop query unchanged:** `(min-width: 1100px) and (orientation: landscape)` (`LAPTOP_QUERY` in `ui/lib/selection.ts`).
- **Design:** one Impeccable comp round (phone + laptop) before UI code; Tarik picks; red is grease pencil only; no shadows, radii or cards.
- **Workflow:** branch `feat/neighborhood-spreadsheets`; ship through a PR (CI `check` required); Conventional Commits; **no** `Co-Authored-By` trailers; never run `prettier` on whole files.

## Review Focus

1. **A neighborhood named in a different order across years** ("Silver City, Burnham Park, and Layton Park" vs "…Layton Park, and Burnham Park") → one picker entry holding all its years. Pinned by Task 1 (`placeKey` test) and Task 3 (`portraits.neighborhoods` test).
2. **A topic missing from the chosen year** (Commute Method and Time in 2021) → the topic list says "not in this year's file" and no other year's table shows. Pinned by Task 6, test "a topic missing from the 2021 layout says so".
3. **Switching neighborhoods quickly** → the table and caption show only the last choice. Pinned by Task 6, test "switching neighborhoods quickly shows only the last choice".
4. **An address naming an unknown neighborhood, year or topic** → newest file, first topic. Pinned by Task 6 unit test `resolvePortraitFocus` and e2e "an unknown address falls back to the newest file".
5. **Text or error cells in Estimate/MOE** ("N/A", "#NUM!") → shown as written with an issue, never as 0. Pinned by Task 1 synthetic-sheet test.

---

## File Structure

```
convex/lib/portrait.ts              reader: one .xlsx -> PortraitTable[]; TOPICS; placeKey; tableIdsOf; topicFor; portraitPassage (new)
convex/validators.ts                vPortraitTable (modify)
convex/schema.ts                    portraitTables table (modify)
convex/lib/families.ts              isSpreadsheetFamily (modify)
convex/buildStore.ts                portraitContext, portraitIndexed, replacePortrait (modify)
convex/build.ts                     processPortrait + scheduling (modify)
convex/catalog.ts                   familySheet.portraits, portraitTables query (modify)
convex/lib/types.ts                 Snippet.focus (modify)
convex/search.ts                    resolveVectorHits focus (modify)
convex/lib/evalQuestions.ts         two neighborhood questions (modify)
ui/lib/portrait.ts                  formatPortraitNumber, resolvePortraitFocus, portraitFocusQuery (new)
ui/components/PortraitTables.tsx    the "What's in each spreadsheet" section (new)
ui/components/SheetBody.tsx, SearchHome.tsx, FamilyPreview.tsx, ResultRow.tsx, sheet.module.css (modify)
tests/fixtures/portrait-2021.xlsx.json, portrait-2023.xlsx.json; tests/helpers/fixtures.ts, fakeFetch.ts (new/modify)
tests/lib/portrait.test.ts, tests/ui/portrait.test.ts, convex/portrait.test.ts (new)
e2e/portraits.spec.ts (new); e2e/a11y.spec.ts (modify)
docs/decisions/015-neighborhood-spreadsheets.md (exists), DESIGN.md (Task 8)
```

---

### Task 1: The portrait reader

**Files:**
- Create: `convex/lib/portrait.ts`, `tests/fixtures/portrait-2021.xlsx.json`, `tests/fixtures/portrait-2023.xlsx.json`, `tests/lib/portrait.test.ts`
- Modify: `tests/helpers/fixtures.ts`

**Interfaces:**
- Consumes: `readWorkbook(bytes: Uint8Array): Sheet[]`, `Sheet { name: string; rows: string[][]; links }` from `convex/lib/xlsx.ts`.
- Produces:
  - `interface PortraitValue { estimate: string; moe: string | null }`
  - `interface PortraitRow { label: string; heading: boolean; values: (PortraitValue | null)[] }`
  - `interface PortraitTable { slug: string; topic: string; tab: string; order: number; tableIds: string[]; tableIdText: string; vintage: string | null; groups: string[]; rows: PortraitRow[]; issues: string[] }`
  - `const TOPICS: { slug: string; topic: string; about: string; aliases?: string[] }[]`
  - `parsePortrait(bytes: Uint8Array): PortraitTable[]`, `readPortraitSheet(sheet: Sheet, order: number): PortraitTable`
  - `placeKey(place: string): string`, `tableIdsOf(text: string): string[]`, `topicFor(tab: string): { slug: string; topic: string; known: boolean }`
  - `portraitPassage(place: string, year: number | null, t: PortraitTable): string`
  - test helper `portraitBytes(year: 2021 | 2023): Uint8Array`

- [ ] **Step 0: Branch and fixtures**

```bash
git switch -c feat/neighborhood-spreadsheets
mkdir -p tests/fixtures
D=$(mktemp -d)
curl -sL -o "$D/2021.xlsx" "https://www.arcgis.com/sharing/rest/content/items/e5ce8816493a4bc0934d850f2b0c0e23/data"
curl -sL -o "$D/2023.xlsx" "https://www.arcgis.com/sharing/rest/content/items/64034b71b9cd4e19b3f901b9ae813678/data"
for y in 2021 2023; do python3 -c "import base64,json,sys; json.dump({'base64': base64.b64encode(open(sys.argv[1],'rb').read()).decode()}, open(sys.argv[2],'w'))" "$D/$y.xlsx" "tests/fixtures/portrait-$y.xlsx.json"; done
ls -la tests/fixtures/portrait-*.xlsx.json
```

Expected: two JSON files of about 48–51 KB. (2021: "Silver City, Burnham Park, and Layton Park"; 2023: "Walker's Point". Both are public DYCU files.)

Append to `tests/helpers/fixtures.ts`:

```ts
import portrait2021 from "../fixtures/portrait-2021.xlsx.json";
import portrait2023 from "../fixtures/portrait-2023.xlsx.json";

// Real DYCU Neighborhood Portrait spreadsheets: 2021 layout (Silver City group) and 2022+ layout (Walker's Point, 2023).
export function portraitBytes(year: 2021 | 2023): Uint8Array {
  const b64 = (year === 2021 ? portrait2021 : portrait2023).base64;
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}
```

(Put the two `import` lines with the file's other imports at the top.)

- [ ] **Step 1: Write the failing tests** — `tests/lib/portrait.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { parsePortrait, placeKey, portraitPassage, readPortraitSheet, tableIdsOf, topicFor } from "../../convex/lib/portrait";
import { portraitBytes } from "../helpers/fixtures";

const bySlug = (tables: ReturnType<typeof parsePortrait>, slug: string) => tables.find((t) => t.slug === slug)!;
const row = (t: ReturnType<typeof parsePortrait>[number], label: string) => t.rows.find((r) => r.label === label)!;

describe("the 2021 layout (Silver City, Burnham Park, and Layton Park)", () => {
  const tables = parsePortrait(portraitBytes(2021));
  it("reads 15 topics, with no commute tab and Bedroom mapped to Bedrooms", () => {
    expect(tables).toHaveLength(15);
    expect(tables.map((t) => t.slug)).not.toContain("commute-method-and-time");
    expect(bySlug(tables, "bedrooms-and-year").tab).toBe("Bedroom and Year");
  });
  it("reads labels, estimates and margins exactly as written", () => {
    const race = bySlug(tables, "race-and-ethnicity");
    expect(race.tableIds).toEqual(["B03002"]);
    expect(race.vintage).toBe("2021");
    expect(row(race, "Total Population").values[0]).toEqual({ estimate: "28133", moe: "1694.69348260976" });
  });
  it("finds the header by its Estimate column and keeps section rows as headings", () => {
    const rent = bySlug(tables, "rent-paid");
    expect(rent.rows[0]).toEqual({ label: "GROSS RENT", heading: true, values: [null] });
    expect(row(rent, "Less than $500").values[0]).toEqual({ estimate: "288", moe: "105.853672586264" });
  });
});

describe("the 2022+ layout (Walker's Point, 2023)", () => {
  const tables = parsePortrait(portraitBytes(2023));
  it("reads 16 topics", () => {
    expect(tables).toHaveLength(16);
  });
  it("drops the broken % column and says why", () => {
    const race = bySlug(tables, "race-and-ethnicity");
    expect(row(race, "Total:").values[0]).toEqual({ estimate: "7668", moe: "789.722103021056" });
    expect(race.issues).toContain("Percentages and precision columns have formula errors in DYCU's file, so they aren't shown.");
  });
  it("names header-prefixed groups and flags a group that is all zeros", () => {
    const age = bySlug(tables, "sex-and-age");
    expect(age.groups).toEqual(["Total", "Male", "Female"]);
    expect(row(age, "Total").values[1]).toEqual({ estimate: "4185", moe: "503.322957950459" });
    expect(age.issues).toContain("The Total columns are 0 for every row in DYCU's file; this may be missing data.");
  });
  it("names groups from the merged titles above the header", () => {
    expect(bySlug(tables, "employment-status-by-sex").groups).toEqual([
      "Total",
      "Labor Force Participation Rate",
      "Employment/Population Ratio",
      "Unemployment Rate (% of Labor)",
    ]);
    expect(bySlug(tables, "units-in-structure").groups).toEqual([
      "Occupied Housing Units",
      "Owner-Occupied Housing Units",
      "Renter-Occupied Housing Units",
    ]);
  });
});

describe("cells and names", () => {
  const sheet = (rows: string[][]) => ({ name: "Rent Paid", rows, links: [] });
  it("keeps text and error cells as written, and flags them", () => {
    const t = readPortraitSheet(
      sheet([
        ["TABLE ID:", "DP04"],
        [],
        ["Variable", "Estimate", "%", "MOE"],
        ["Median rent", "N/A", "", "#NUM!"],
        ["Units", "12", "", "4"],
      ]),
      0,
    );
    expect(t.rows[0].values[0]).toEqual({ estimate: "N/A", moe: "#NUM!" });
    expect(t.issues).toContain("Some estimates or margins have errors in DYCU's file; they're shown as written.");
  });
  it("matches a neighborhood whatever order its names are in", () => {
    expect(placeKey("Silver City, Burnham Park, and Layton Park")).toBe("burnham-park-layton-park-silver-city");
    expect(placeKey("Silver City, Layton Park, and Burnham Park")).toBe("burnham-park-layton-park-silver-city");
    expect(placeKey("Walker's Point")).toBe("walkers-point");
  });
  it("pulls every Census table ID out of a phrase", () => {
    expect(tableIdsOf("B08301 and B08303 (and S0801 if only one census tract)")).toEqual(["B08301", "B08303", "S0801"]);
    expect(tableIdsOf("B01001, (S1101 for avg size)")).toEqual(["B01001", "S1101"]);
  });
  it("knows the topics, and marks a tab it hasn't seen", () => {
    expect(topicFor("Bedroom and Year")).toEqual({ slug: "bedrooms-and-year", topic: "Bedrooms and Year", known: true });
    expect(topicFor("Something New").known).toBe(false);
  });
  it("writes a search passage that leads with the place and topic", () => {
    const race = bySlug(parsePortrait(portraitBytes(2023)), "race-and-ethnicity");
    const text = portraitPassage("Walker's Point", 2023, race);
    expect(text.startsWith("Walker's Point 2023 · Race and Ethnicity (B03002)")).toBe(true);
    expect(text).toContain("Total:: 7668 ± 789.722103021056");
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/lib/portrait.test.ts`
Expected: FAIL — `Cannot find module '../../convex/lib/portrait'`.

- [ ] **Step 3: Write `convex/lib/portrait.ts`**

```ts
import { readWorkbook, type Sheet } from "./xlsx";

// One DYCU Neighborhood Portrait spreadsheet tab, tidied. Numbers stay exactly as written in DYCU's file.
export interface PortraitValue {
  estimate: string;
  moe: string | null;
}
export interface PortraitRow {
  label: string;
  heading: boolean;
  values: (PortraitValue | null)[];
}
export interface PortraitTable {
  slug: string;
  topic: string;
  tab: string;
  order: number;
  tableIds: string[];
  tableIdText: string;
  vintage: string | null;
  groups: string[];
  rows: PortraitRow[];
  issues: string[];
}

// The 16 topics, in DYCU's tab order. `about` is fixed text (Tarik reviews it in Task 5), never AI-written.
export const TOPICS: { slug: string; topic: string; about: string; aliases?: string[] }[] = [
  { slug: "race-and-ethnicity", topic: "Race and Ethnicity", about: "How many residents identify with each race, and whether they are Hispanic or Latino." },
  { slug: "sex-and-age", topic: "Sex and Age", about: "Residents by age group, for everyone and for males and females." },
  { slug: "poverty-status-by-age", topic: "Poverty Status by Age", about: "How many residents live below the federal poverty line, by age." },
  { slug: "household-characteristics", topic: "Household Characteristics", about: "How households are made up, such as families, people living alone, and household size." },
  { slug: "vehicles-per-household", topic: "Vehicles per Household", about: "How many vehicles households have, including households with none." },
  { slug: "employment-status-by-sex", topic: "Employment Status by Sex", about: "Whether working-age residents are employed, unemployed or not in the labor force, by sex." },
  { slug: "commute-method-and-time", topic: "Commute Method and Time", about: "How workers get to work and how long the trip takes." },
  { slug: "employment-sector", topic: "Employment Sector", about: "The kinds of industries employed residents work in." },
  { slug: "educational-attainment", topic: "Educational Attainment", about: "The highest level of school adults have finished." },
  { slug: "occupancy-and-tenure", topic: "Occupancy and Tenure", about: "How many homes are occupied or vacant, and whether they are owned or rented." },
  { slug: "units-in-structure", topic: "Units in Structure", about: "Homes by building type, from single-family houses to large apartment buildings." },
  { slug: "bedrooms-and-year", topic: "Bedrooms and Year", about: "Homes by number of bedrooms and the year the building was built.", aliases: ["Bedroom and Year"] },
  { slug: "rent-paid", topic: "Rent Paid", about: "What renters pay each month, including utilities (gross rent)." },
  { slug: "mortgage-status-and-cost", topic: "Mortgage Status and Cost (SMOC)", about: "Homeowners' monthly costs, with and without a mortgage (selected monthly owner costs)." },
  { slug: "owner-costs-share-of-income", topic: "Mortgage Status (SMOCAPI)", about: "Homeowners' monthly costs as a share of household income." },
  { slug: "household-income", topic: "Household Income", about: "Households by yearly income range." },
];

const ESTIMATE = /Estimate$/;
const MOE = /(^|[\s.])MOE$/;
const DERIVED = /(%|Percent|(^|[\s.])SE$|(^|[\s.])CV)/;
const TABLE_ID = /\b(?:B|C|S|DP)\d{4,5}[A-Z]?\b/g;

const norm = (s: string) => s.trim().toLowerCase();

export function topicFor(tab: string): { slug: string; topic: string; known: boolean } {
  const t = TOPICS.find((x) => norm(x.topic) === norm(tab) || (x.aliases ?? []).some((a) => norm(a) === norm(tab)));
  if (t) return { slug: t.slug, topic: t.topic, known: true };
  return { slug: norm(tab).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""), topic: tab.trim(), known: false };
}

export function tableIdsOf(text: string): string[] {
  return [...new Set([...text.matchAll(TABLE_ID)].map((m) => m[0]))];
}

// Neighborhood groups are listed in different orders across years; sorted parts make one key.
export function placeKey(place: string): string {
  return place
    .toLowerCase()
    .replace(/[’']/g, "")
    .split(/,|\band\b/)
    .map((p) => p.trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""))
    .filter(Boolean)
    .sort()
    .join("-");
}

export function parsePortrait(bytes: Uint8Array): PortraitTable[] {
  return readWorkbook(bytes).map((sheet, i) => readPortraitSheet(sheet, i));
}

export function readPortraitSheet(sheet: Sheet, order: number): PortraitTable {
  const { slug, topic, known } = topicFor(sheet.name);
  const issues: string[] = known ? [] : ["This tab isn't one we've seen before, so it's shown as found."];
  const cells = sheet.rows.map((r) => r.map((c) => (c ?? "").trim()));
  const h = cells.findIndex((r) => r.slice(1).some((c) => ESTIMATE.test(c)));
  const base = { slug, topic, tab: sheet.name, order, tableIds: [] as string[], tableIdText: "", vintage: null as string | null };
  if (h < 0) return { ...base, groups: [], rows: [], issues: [...issues, "No table header was found in DYCU's file."] };

  const meta = new Map(
    cells.slice(0, h).filter((r) => r[0]).map((r) => [r[0].replace(/:\s*$/, "").toUpperCase(), r[1] ?? ""] as const),
  );
  const header = cells[h];
  // Merged group titles sit one row above the header, starting at each group's Estimate column.
  const titles = h > 0 && !cells[h - 1][0] ? cells[h - 1] : [];
  const starts = header.flatMap((c, i) => (i > 0 && ESTIMATE.test(c) ? [i] : []));
  const groups = starts.map((s, g) => {
    const end = starts[g + 1] ?? header.length;
    const moe = header.findIndex((c, i) => i > s && i < end && MOE.test(c));
    const prefix = header[s].replace(ESTIMATE, "").replace(/[.\s]+$/, "").replace(/\./g, " ").trim();
    return { name: prefix || titles[s] || "", estimate: s, moe: moe < 0 ? null : moe };
  });
  const names = groups.map((g, i) => g.name || (groups.length > 1 ? (i === 0 ? "All" : `Group ${i + 1}`) : ""));

  const body = cells.slice(h + 1).filter((r) => r[0]);
  const rows: PortraitRow[] = body.map((r) => {
    const values = groups.map((g) => {
      const estimate = r[g.estimate] ?? "";
      return estimate === "" ? null : { estimate, moe: g.moe === null ? null : r[g.moe] || null };
    });
    return { label: r[0], heading: values.every((v) => v === null), values };
  });

  const derived = header.flatMap((c, i) => (i > 0 && DERIVED.test(c) ? [i] : []));
  if (body.some((r) => derived.some((i) => (r[i] ?? "").startsWith("#")))) {
    issues.push("Percentages and precision columns have formula errors in DYCU's file, so they aren't shown.");
  }
  names.forEach((name, i) => {
    const estimates = rows.filter((r) => !r.heading).flatMap((r) => (r.values[i] ? [r.values[i]!.estimate] : []));
    if (estimates.length && estimates.every((e) => Number(e) === 0)) {
      issues.push(
        name
          ? `The ${name} columns are 0 for every row in DYCU's file; this may be missing data.`
          : "Every estimate is 0 in DYCU's file; this may be missing data.",
      );
    }
  });
  if (rows.some((r) => r.values.some((v) => v && (v.estimate.startsWith("#") || (v.moe ?? "").startsWith("#"))))) {
    issues.push("Some estimates or margins have errors in DYCU's file; they're shown as written.");
  }

  const tableIdText = meta.get("TABLE ID") ?? "";
  return { ...base, tableIds: tableIdsOf(tableIdText), tableIdText, vintage: meta.get("VINTAGE") || null, groups: names, rows, issues };
}

const MAX_PASSAGE_CHARS = 1500;

// One search passage per neighborhood x year x topic. It leads with the place so a search for it ranks.
export function portraitPassage(place: string, year: number | null, t: PortraitTable): string {
  const lines = t.rows
    .filter((r) => !r.heading)
    .map((r) => {
      const parts = r.values.flatMap((v, i) =>
        v ? [`${t.groups[i] ? `${t.groups[i]} ` : ""}${v.estimate}${v.moe ? ` ± ${v.moe}` : ""}`] : [],
      );
      return `${r.label}: ${parts.join("; ")}`;
    });
  const head = `${place}${year ? ` ${year}` : ""} · ${t.topic}${t.tableIdText ? ` (${t.tableIdText})` : ""}`;
  return [head, ...lines].join("\n").slice(0, MAX_PASSAGE_CHARS);
}
```

- [ ] **Step 4: Run the tests and typecheck**

Run: `npx vitest run tests/lib && npm run typecheck && npx tsc --noEmit -p convex`
Expected: PASS (all `tests/lib` files, including the existing `xlsx.test.ts`); both typechecks clean. If a fixture expectation fails, print the table (`console.log(JSON.stringify(table, null, 1))` in a scratch test) and compare with the "planning research" section; fix the reader, not the expectation, unless DYCU's file truly differs (ledger a ruling).

- [ ] **Step 5: Commit**

```bash
git add convex/lib/portrait.ts tests/fixtures/portrait-2021.xlsx.json tests/fixtures/portrait-2023.xlsx.json tests/helpers/fixtures.ts tests/lib/portrait.test.ts
git commit -m "feat: read DYCU's neighborhood portrait spreadsheets into tidy tables"
```

---

### Task 2: Store the tables in the weekly build

**Files:**
- Modify: `convex/validators.ts`, `convex/schema.ts`, `convex/lib/families.ts`, `convex/buildStore.ts`, `convex/build.ts`, `tests/helpers/fakeFetch.ts`, `convex/orchestrator.test.ts`
- Create: `convex/portrait.test.ts`

**Interfaces:**
- Consumes: Task 1 (`parsePortrait`, `portraitPassage`, `placeKey`, `PortraitTable`), `pdfUrl`, `embed`, `reportDelays`, `retryOnConflict`, `markDone`, `settleSpend`.
- Produces: table `portraitTables` (fields of `PortraitTable` + `hubId`, `modified`; index `by_hubId`); `isSpreadsheetFamily(f): boolean`; `internal.build.processPortrait({ buildId, hubId })`; `internal.buildStore.portraitContext`, `portraitIndexed`, `replacePortrait`. Portrait passages live in `docChunks` with `section = table.topic`.

- [ ] **Step 1: Write the failing tests**

`tests/helpers/fakeFetch.ts` — add two options to `FakeOptions` and a route (place the route before the final fallback in `installFakeFetch`):

```ts
  portraitBytes?: Uint8Array;
  portraitStatus?: number;
```

```ts
    if (url.startsWith("https://www.arcgis.com/sharing/rest/content/items/") && url.endsWith("/data")) {
      const status = opts.portraitStatus ?? 200;
      return new Response(status === 200 ? (opts.portraitBytes ?? portraitBytes(2023)) : "down", { status });
    }
```

(and `import { portraitBytes } from "./fixtures";`).

`convex/portrait.test.ts`:

```ts
/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installFakeFetch } from "../tests/helpers/fakeFetch";
import { fixtureFamilies } from "../tests/helpers/fixtures";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { toFamilyInput } from "./lib/families";
import schema from "./schema";
import { DEFAULT_SETTINGS } from "./settings";

const modules = import.meta.glob("./**/*.*s");
const SPREADSHEETS = "document:neighborhood-portrait-spreadsheet";

beforeEach(() => vi.stubEnv("AI_GATEWAY_API_KEY", "test-key"));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function seed(t: TestConvex<typeof schema>) {
  await t.run((ctx) => ctx.db.insert("settings", { ...DEFAULT_SETTINGS }));
  const buildId = await t.mutation(internal.buildStore.beginBuild, {});
  await t.mutation(internal.buildStore.swapCatalog, { buildId, families: fixtureFamilies().map((f) => toFamilyInput(f, null)), dictionaries: [] });
  await t.mutation(internal.buildStore.setPending, {
    buildId,
    pending: 10,
    hubCounts: { rawData: 93, reports: 282, visualizations: 7 },
    pdfReports: 180,
    notes: [],
    mismatch: { unlinkedTabs: [], suspectLinks: [], unmatchedHomeTitles: [], typoFixes: [] },
  });
  const hubId = fixtureFamilies().find((f) => f.key === SPREADSHEETS)!.members[0].hubId;
  return { buildId, hubId };
}

const tablesOf = (t: TestConvex<typeof schema>, hubId: string) =>
  t.run((ctx) => ctx.db.query("portraitTables").withIndex("by_hubId", (q) => q.eq("hubId", hubId)).collect());
const chunksOf = (t: TestConvex<typeof schema>, hubId: string) =>
  t.run((ctx) => ctx.db.query("docChunks").withIndex("by_hubId", (q) => q.eq("hubId", hubId)).collect());
const buildOf = (t: TestConvex<typeof schema>, id: Id<"builds">) => t.run((ctx) => ctx.db.get(id));

describe("processPortrait", () => {
  it("stores one table and one search passage per tab", async () => {
    const t = convexTest(schema, modules);
    installFakeFetch();
    const { buildId, hubId } = await seed(t);
    await t.action(internal.build.processPortrait, { buildId, hubId });
    const tables = await tablesOf(t, hubId);
    expect(tables).toHaveLength(16);
    expect(tables.find((x) => x.slug === "race-and-ethnicity")!.tableIds).toEqual(["B03002"]);
    const chunks = await chunksOf(t, hubId);
    expect(chunks).toHaveLength(16);
    expect(chunks.map((c) => c.section)).toContain("Race and Ethnicity");
  });

  it("skips a file that hasn't changed", async () => {
    const t = convexTest(schema, modules);
    const calls = installFakeFetch();
    const { buildId, hubId } = await seed(t);
    await t.action(internal.build.processPortrait, { buildId, hubId });
    const before = calls.filter((c) => c.url.endsWith("/data")).length;
    await t.action(internal.build.processPortrait, { buildId, hubId });
    expect(calls.filter((c) => c.url.endsWith("/data")).length).toBe(before);
  });

  it("keeps last week's tables when a file fails, and names it in the build", async () => {
    const t = convexTest(schema, modules);
    installFakeFetch();
    const { buildId, hubId } = await seed(t);
    await t.action(internal.build.processPortrait, { buildId, hubId });
    await t.run(async (ctx) => {
      const m = (await ctx.db.query("members").withIndex("by_hubId", (q) => q.eq("hubId", hubId)).first())!;
      await ctx.db.patch(m._id, { modified: "2099-01-01T00:00:00.000Z" });
    });
    installFakeFetch({ portraitStatus: 500 });
    await t.action(internal.build.processPortrait, { buildId, hubId });
    expect(await tablesOf(t, hubId)).toHaveLength(16);
    expect((await buildOf(t, buildId))!.notes.join(" ")).toContain(`spreadsheet ${hubId}`);
  });
});
```

(If `installFakeFetch` does not return its `calls` array, return it at the end of the function: `return calls;`.)

In `convex/orchestrator.test.ts`, change `expect(build.pending).toBe(49 + 180);` to:

```ts
      expect(build.pending).toBe(49 + 180 + 99);
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run convex/portrait.test.ts convex/orchestrator.test.ts`
Expected: FAIL — `internal.build.processPortrait` doesn't exist; pending is 229.

- [ ] **Step 3: Validator, schema, family predicate**

`convex/validators.ts` (append):

```ts
export const vPortraitTable = v.object({
  slug: v.string(),
  topic: v.string(),
  tab: v.string(),
  order: v.number(),
  tableIds: v.array(v.string()),
  tableIdText: v.string(),
  vintage: v.union(v.string(), v.null()),
  groups: v.array(v.string()),
  rows: v.array(
    v.object({
      label: v.string(),
      heading: v.boolean(),
      values: v.array(v.union(v.null(), v.object({ estimate: v.string(), moe: v.union(v.string(), v.null()) }))),
    }),
  ),
  issues: v.array(v.string()),
});
```

`convex/schema.ts` (new table; import `vPortraitTable` with the other validators):

```ts
  portraitTables: defineTable({ hubId: v.string(), modified: v.string(), ...vPortraitTable.fields }).index("by_hubId", ["hubId"]),
```

`convex/lib/families.ts` (beside `isPdfFamily`):

```ts
export function isSpreadsheetFamily(f: Pick<Family, "key" | "kind">): boolean {
  return f.kind === "document" && f.key.endsWith("-spreadsheet");
}
```

- [ ] **Step 4: Store functions** — `convex/buildStore.ts` (append; import `vPortraitTable`):

```ts
export const portraitContext = internalQuery({
  args: { hubId: v.string() },
  handler: async (ctx, { hubId }) => {
    const member = await ctx.db.query("members").withIndex("by_hubId", (q) => q.eq("hubId", hubId)).first();
    if (!member) return null;
    const stored = await ctx.db.query("portraitTables").withIndex("by_hubId", (q) => q.eq("hubId", hubId)).first();
    return {
      member: { hubId, place: member.place ?? member.title, year: member.years[0] ?? null, modified: member.modified },
      indexedModified: stored?.modified ?? null,
      settings: await readSettings(ctx),
    };
  },
});

export const portraitIndexed = internalQuery({
  args: { hubIds: v.array(v.string()) },
  handler: async (ctx, { hubIds }) => {
    const out: { hubId: string; modified: string }[] = [];
    for (const hubId of hubIds) {
      const t = await ctx.db.query("portraitTables").withIndex("by_hubId", (q) => q.eq("hubId", hubId)).first();
      if (t) out.push({ hubId, modified: t.modified });
    }
    return out;
  },
});

export const replacePortrait = internalMutation({
  args: {
    hubId: v.string(),
    modified: v.string(),
    tables: v.array(vPortraitTable),
    chunks: v.array(v.object({ section: v.string(), text: v.string(), embedding: v.array(v.float64()) })),
  },
  handler: async (ctx, { hubId, modified, tables, chunks }) => {
    for (const old of await ctx.db.query("portraitTables").withIndex("by_hubId", (q) => q.eq("hubId", hubId)).collect()) {
      await ctx.db.delete(old._id);
    }
    for (const old of await ctx.db.query("docChunks").withIndex("by_hubId", (q) => q.eq("hubId", hubId)).collect()) {
      await ctx.db.delete(old._id);
    }
    for (const table of tables) await ctx.db.insert("portraitTables", { hubId, modified, ...table });
    for (const c of chunks) await ctx.db.insert("docChunks", { hubId, modified, ...c });
  },
});
```

(`member.place` and `member.years` are existing member fields; confirm with `grep -n "place\|years" convex/validators.ts`.)

- [ ] **Step 5: The build step** — `convex/build.ts`

Import `isSpreadsheetFamily` and `parsePortrait, portraitPassage` (from `./lib/portrait`) and `pdfUrl` if not already imported. Add the action and its helper next to `processReport`:

```ts
const PORTRAIT_SPACING_MS = 1500;

export const processPortrait = internalAction({
  args: { buildId: v.id("builds"), hubId: v.string() },
  handler: async (ctx, { buildId, hubId }) => {
    let result: Result;
    try {
      result = await storePortrait(ctx, buildId, hubId);
    } catch (e) {
      result = { outcome: "failed", note: `spreadsheet ${hubId}: ${message(e)}` };
    }
    await retryOnConflict(() =>
      ctx.runMutation(internal.buildStore.markDone, { buildId, outcome: result.outcome, note: result.note }),
    );
  },
});

async function storePortrait(ctx: ActionCtx, buildId: Id<"builds">, hubId: string): Promise<Result> {
  const data = await ctx.runQuery(internal.buildStore.portraitContext, { hubId });
  if (!data) return { outcome: "skipped", note: `spreadsheet ${hubId}: no longer in catalog` };
  if (data.indexedModified === data.member.modified) return { outcome: "skipped" };
  const res = await fetchOk(pdfUrl(hubId), `spreadsheet ${hubId}`);
  const tables = parsePortrait(new Uint8Array(await res.arrayBuffer()));
  if (tables.length === 0) return { outcome: "failed", note: `spreadsheet ${hubId}: no tabs found` };
  const passages = tables.map((t) => portraitPassage(data.member.place, data.member.year, t));
  const { vectors, tokens } = await embed(passages, data.settings.embedModel, gatewayKey());
  await ctx.runMutation(internal.buildStore.settleSpend, { buildId, usd: tokens * data.settings.embedUsdPerToken });
  await ctx.runMutation(internal.buildStore.replacePortrait, {
    hubId,
    modified: data.member.modified,
    tables,
    chunks: tables.map((t, i) => ({ section: t.topic, text: passages[i], embedding: vectors[i] })),
  });
  const unknown = tables.filter((t) => t.issues.some((x) => x.startsWith("This tab isn't one we've seen")));
  return unknown.length
    ? { outcome: "done", note: `spreadsheet ${hubId}: unrecognized tabs ${unknown.map((t) => t.tab).join(", ")}` }
    : { outcome: "done" };
}
```

In the build orchestration (where `reports` and `delays` are computed), add the portraits and include them in `pending` and scheduling:

```ts
  const portraits = families.filter(isSpreadsheetFamily).flatMap((f) => f.members.map((m) => ({ hubId: m.hubId, modified: m.modified })));
  const portraitStored: { hubId: string; modified: string }[] = await ctx.runQuery(internal.buildStore.portraitIndexed, {
    hubIds: portraits.map((p) => p.hubId),
  });
  const portraitDelays = reportDelays(portraits, new Map(portraitStored.map((p) => [p.hubId, p.modified])), PORTRAIT_SPACING_MS);
  const pending = families.length + reports.length + portraits.length;
```

(replace the existing `const pending = families.length + reports.length;`), and after the report scheduling loop:

```ts
  for (const { hubId, delayMs } of portraitDelays) {
    await ctx.scheduler.runAfter(delayMs, internal.build.processPortrait, { buildId, hubId });
  }
```

If `markDone` only records a note when the outcome is `"failed"`, make it record `note` whenever one is present (check `markDone` in `convex/buildStore.ts`; the unrecognized-tab note must reach the build report).

- [ ] **Step 6: Run the tests, regenerate, typecheck**

```bash
npx convex codegen
npx vitest run
npm run typecheck && npx tsc --noEmit -p convex
```

Expected: all pass, including `convex/portrait.test.ts` (3 tests) and the orchestrator's new pending count of 328.

- [ ] **Step 7: Run it for real on dev, over all 99 files**

```bash
npx convex dev --once
npx convex run build:start
```

Wait for the build to finish (poll `npx convex run search:catalogStatus` until `"running": false`, about 3–5 minutes). Then:

```bash
npx convex data portraitTables --limit 2000 --format jsonLines | python3 -c "
import sys,json,collections
rows=[json.loads(l) for l in sys.stdin if l.strip()]
files={r['hubId'] for r in rows}
unknown=[r['tab'] for r in rows if any(i.startswith(\"This tab isn't\") for i in r['issues'])]
nohdr=[r['tab'] for r in rows if not r['rows']]
print('files', len(files), 'tables', len(rows), 'unknown tabs', unknown, 'empty', nohdr)"
```

Expected: `files 99 tables 1564 unknown tabs [] empty []` (20 × 15 + 79 × 16 = 1564). Any unknown or empty tab is a layout the scan missed: fix the reader with a new fixture-backed test before moving on.

- [ ] **Step 8: Commit**

```bash
git add convex tests
git commit -m "feat: read the neighborhood spreadsheets in the weekly build"
```

---

### Task 3: Serve the tables to the sheet

**Files:**
- Modify: `convex/catalog.ts`
- Test: `convex/catalog.test.ts`

**Interfaces:**
- Consumes: Task 2 (`portraitTables`, `isSpreadsheetFamily`), Task 1 (`placeKey`).
- Produces:
  - `familySheet(...)` gains `portraits: PortraitIndex | null`, where `PortraitIndex = { neighborhoods: { key: string; label: string; files: { hubId: string; year: number | null }[] }[]; initial: { hubId: string; tables: PortraitTableView[] } | null }`
  - `PortraitTableView` = the `PortraitTable` fields (no `_id`, `hubId`, `modified`).
  - public query `api.catalog.portraitTables({ hubId: string }): PortraitTableView[]` (sorted by `order`).

- [ ] **Step 1: Write the failing tests** — append to `convex/catalog.test.ts` (reuse that file's existing seeding helper for families; insert portrait tables directly):

```ts
describe("neighborhood spreadsheets", () => {
  it("groups files into neighborhoods whatever their name order, newest first", async () => {
    const t = convexTest(schema, modules);
    await seedCatalog(t); // the file's existing helper that swaps in fixtureFamilies()
    const sheet = (await t.query(api.catalog.familySheet, { code: "N03" }))!;
    const silver = sheet.portraits!.neighborhoods.find((n) => n.key === "burnham-park-layton-park-silver-city")!;
    expect(silver.files.map((f) => f.year)).toEqual([2024, 2023, 2022, 2021]);
    expect(sheet.portraits!.neighborhoods.length).toBeGreaterThan(20);
    const other = (await t.query(api.catalog.familySheet, { code: "F02" }))!;
    expect(other.portraits).toBeNull();
  });

  it("returns a file's tables in tab order", async () => {
    const t = convexTest(schema, modules);
    await seedCatalog(t);
    await t.run(async (ctx) => {
      for (const [order, slug] of [[1, "sex-and-age"], [0, "race-and-ethnicity"]] as const) {
        await ctx.db.insert("portraitTables", {
          hubId: "h1", modified: "m", slug, topic: slug, tab: slug, order, tableIds: [], tableIdText: "", vintage: null, groups: [""], rows: [], issues: [],
        });
      }
    });
    expect((await t.query(api.catalog.portraitTables, { hubId: "h1" })).map((x) => x.slug)).toEqual(["race-and-ethnicity", "sex-and-age"]);
  });
});
```

(If `catalog.test.ts` names its seeding helper differently, use that name; the helper must call `swapCatalog` with `fixtureFamilies()`. The Silver City expectation holds if the fixture has that group in all four years; if the fixture lacks a year, assert the years it does have, newest first.)

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run convex/catalog.test.ts`
Expected: FAIL — `portraits` undefined; `api.catalog.portraitTables` missing.

- [ ] **Step 3: Implement** — `convex/catalog.ts`

```ts
import { isSpreadsheetFamily } from "./lib/families";
import { placeKey } from "./lib/portrait";

type MemberDoc = Doc<"members">;

const tableView = ({ _id, _creationTime, hubId, modified, ...rest }: Doc<"portraitTables">) => rest;

async function tablesFor(ctx: QueryCtx, hubId: string) {
  return (await ctx.db.query("portraitTables").withIndex("by_hubId", (q) => q.eq("hubId", hubId)).collect())
    .sort((a, b) => a.order - b.order)
    .map(tableView);
}

// Neighborhoods for the spreadsheet pickers; members arrive newest first.
async function portraitIndex(ctx: QueryCtx, members: MemberDoc[]) {
  const byKey = new Map<string, { key: string; label: string; files: { hubId: string; year: number | null }[] }>();
  for (const m of members) {
    const place = m.place ?? m.title;
    const key = placeKey(place);
    const entry = byKey.get(key) ?? { key, label: place, files: [] };
    entry.files.push({ hubId: m.hubId, year: m.years[0] ?? null });
    byKey.set(key, entry);
  }
  const neighborhoods = [...byKey.values()].sort((a, b) => a.label.localeCompare(b.label));
  const newest = members[0];
  return { neighborhoods, initial: newest ? { hubId: newest.hubId, tables: await tablesFor(ctx, newest.hubId) } : null };
}

export const portraitTables = query({
  args: { hubId: v.string() },
  handler: (ctx, { hubId }) => tablesFor(ctx, hubId),
});
```

In `familySheet`'s return object add:

```ts
      portraits: isSpreadsheetFamily(family) ? await portraitIndex(ctx, members) : null,
```

(`Doc`/`QueryCtx` come from `./_generated/dataModel` and `./_generated/server`; `familyMembers` already returns members newest first via `newestFirst`.)

- [ ] **Step 4: Run tests, regenerate, typecheck**

Run: `npx convex codegen && npx vitest run && npm run typecheck`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add convex
git commit -m "feat: serve neighborhood spreadsheet tables to the dataset sheet"
```

---

### Task 4: Display helpers

**Files:**
- Create: `ui/lib/portrait.ts`, `tests/ui/portrait.test.ts`

**Interfaces:**
- Consumes: Task 3 (`PortraitIndex` shape, via `SheetData["portraits"]`).
- Produces: `formatPortraitNumber(s: string): string`; `resolvePortraitFocus(index: PortraitIndex, params: URLSearchParams, topics: string[]): { place: string; hubId: string; topic: string }`; `portraitFocusQuery(focus?: { place: string; year: number | null; topic: string } | null): string`; `censusTableUrl(id: string): string`.

- [ ] **Step 1: Write the failing tests** — `tests/ui/portrait.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { censusTableUrl, formatPortraitNumber, portraitFocusQuery, resolvePortraitFocus } from "../../ui/lib/portrait";

const index = {
  neighborhoods: [
    { key: "walkers-point", label: "Walker's Point", files: [{ hubId: "wp23", year: 2023 }, { hubId: "wp22", year: 2022 }] },
    { key: "amani", label: "Amani", files: [{ hubId: "am24", year: 2024 }] },
  ],
  initial: { hubId: "am24", tables: [] },
};
const TOPICS = ["race-and-ethnicity", "sex-and-age"];

describe("formatPortraitNumber", () => {
  it("rounds estimates and margins to whole numbers with commas", () => {
    expect(formatPortraitNumber("28133")).toBe("28,133");
    expect(formatPortraitNumber("1694.69348260976")).toBe("1,695");
  });
  it("keeps rates readable and text exactly as written", () => {
    expect(formatPortraitNumber("0.745902875254698")).toBe("0.746");
    expect(formatPortraitNumber("6.0%")).toBe("6.0%");
    expect(formatPortraitNumber("N/A")).toBe("N/A");
    expect(formatPortraitNumber("#NUM!")).toBe("#NUM!");
  });
});

describe("resolvePortraitFocus", () => {
  it("reads place, year and topic from the address", () => {
    expect(resolvePortraitFocus(index, new URLSearchParams("place=walkers-point&year=2022&topic=sex-and-age"), TOPICS)).toEqual({
      place: "walkers-point",
      hubId: "wp22",
      topic: "sex-and-age",
    });
  });
  it("falls back to the newest file and its first topic", () => {
    expect(resolvePortraitFocus(index, new URLSearchParams("place=nowhere&year=1999&topic=zzz"), TOPICS)).toEqual({
      place: "amani",
      hubId: "am24",
      topic: "race-and-ethnicity",
    });
    expect(resolvePortraitFocus(index, new URLSearchParams("place=walkers-point&year=1999"), TOPICS).hubId).toBe("wp23");
  });
});

describe("links", () => {
  it("builds a focus query and a Census table link", () => {
    expect(portraitFocusQuery({ place: "walkers-point", year: 2023, topic: "rent-paid" })).toBe("?place=walkers-point&year=2023&topic=rent-paid");
    expect(portraitFocusQuery(null)).toBe("");
    expect(censusTableUrl("B25063")).toBe("https://data.census.gov/table?q=B25063");
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/ui/portrait.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** — `ui/lib/portrait.ts`

```ts
export interface PortraitIndex {
  neighborhoods: { key: string; label: string; files: { hubId: string; year: number | null }[] }[];
  initial: { hubId: string; tables: unknown[] } | null;
}
export interface PortraitFocus {
  place: string;
  year: number | null;
  topic: string;
}

// Estimates and margins as whole numbers with commas; rates (between 0 and 1) to 3 places; anything else as written.
export function formatPortraitNumber(s: string): string {
  const t = s.trim();
  if (!/^-?\d+(\.\d+)?$/.test(t)) return s;
  const n = Number(t);
  if (n !== 0 && Math.abs(n) < 1) return n.toFixed(3);
  return Math.round(n).toLocaleString("en-US");
}

export function resolvePortraitFocus(index: PortraitIndex, params: URLSearchParams, topics: string[]) {
  const initialPlace = index.neighborhoods.find((n) => n.files.some((f) => f.hubId === index.initial?.hubId)) ?? index.neighborhoods[0];
  const place = index.neighborhoods.find((n) => n.key === params.get("place")) ?? initialPlace;
  const wantYear = Number(params.get("year"));
  const file = place.files.find((f) => f.year === wantYear) ?? (place === initialPlace && index.initial ? place.files.find((f) => f.hubId === index.initial!.hubId) : undefined) ?? place.files[0];
  const topic = topics.includes(params.get("topic") ?? "") ? params.get("topic")! : topics[0];
  return { place: place.key, hubId: file.hubId, topic };
}

export function portraitFocusQuery(focus?: PortraitFocus | null): string {
  if (!focus) return "";
  const p = new URLSearchParams({ place: focus.place, ...(focus.year ? { year: String(focus.year) } : {}), topic: focus.topic });
  return `?${p}`;
}

export const censusTableUrl = (id: string): string => `https://data.census.gov/table?q=${encodeURIComponent(id)}`;
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run tests/ui && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add ui/lib/portrait.ts tests/ui/portrait.test.ts
git commit -m "feat: number formatting and address handling for neighborhood tables"
```

---

### Task 5 (HUMAN checkpoint): Comps and topic copy

**Files:** `.impeccable/mocks/portraits-*.webp` (+ sidecars), `.impeccable/surfaces/portrait-tables.md`

- [ ] **Step 1: Capture the reference.** With Tasks 1–4 on the dev deployment, capture the current N03 sheet as the comp anchor: laptop `/?open=N03` at 1536×1024 and phone `/d/N03` at 1024×1536 (the comp sizes used in Phase 2.5), into `.impeccable/review/n03-laptop-before.png` and `n03-phone-before.png`.

- [ ] **Step 2: Generate two directions × two devices (4 images, under $1; Tarik already approved this spend in the spec).** Per Impeccable's `visualize.md` comp discipline, pass the capture as the reference image (`impeccable generate-image --ref <capture> --prompt-file <prompt> --out .impeccable/mocks/portraits-<a|b>-<laptop|phone>.webp`). The prompt leads with the new section's structure: heading "WHAT'S IN EACH SPREADSHEET"; a one-line lead with a DYCU tag; two native dropdowns (Neighborhood, Year); a ruled list of the 16 topics with Census table IDs (one marked "not in this year's file"); an issue line in tag style above the table; a ruled table "Variable | Estimate | ± Margin" with grouped columns for Total / Male / Female; the margin-of-error line. Name DESIGN.md's palette, type and rules. Direction A: topic list beside the table on laptop. Direction B: topic list as a compact strip above the table.

- [ ] **Step 3 (HUMAN): Tarik picks one direction** and reviews the 16 `about` lines in `convex/lib/portrait.ts` `TOPICS`. Edits to `about` text go in as a one-line commit. Record the pick in the comps' sidecars (`approved: true`) and in `.impeccable/surfaces/portrait-tables.md` (scope, audience, the comps, and a direction contract matching the spec §5).

- [ ] **Step 4: Commit**

```bash
git add .impeccable convex/lib/portrait.ts
git commit -m "design: approve the neighborhood spreadsheet section comps"
```

---

### Task 6: The "What's in each spreadsheet" section

**Files:**
- Create: `ui/components/PortraitTables.tsx`, `e2e/portraits.spec.ts`
- Modify: `ui/components/SheetBody.tsx`, `ui/components/sheet.module.css`, `e2e/a11y.spec.ts`

**Interfaces:**
- Consumes: Task 3 (`SheetData["portraits"]`, `api.catalog.portraitTables`), Task 4 helpers, Task 1 `TOPICS` (import the list into the client: `import { TOPICS } from "@/convex/lib/portrait"` is safe: it is plain data plus pure functions, no Convex server imports).
- Produces: `PortraitTables({ index }: { index: NonNullable<SheetData["portraits"]> })`.

- [ ] **Step 1: Write the failing tests** — `e2e/portraits.spec.ts` (runs on phone and desktop; dev data from Task 2 Step 7)

```ts
import { expect, test } from "./fixtures";

const open = (page: import("@playwright/test").Page, project: string, query = "") =>
  page.goto(project === "desktop" ? `/?open=N03${query ? `&${query}` : ""}` : `/d/N03${query ? `?${query}` : ""}`);
const section = (page: import("@playwright/test").Page) => page.getByRole("region", { name: "What's in each spreadsheet" });

test("shows a neighborhood's table with margins of error, and puts it in the address", async ({ page }, info) => {
  await open(page, info.project.name);
  const s = section(page);
  await s.getByLabel("Neighborhood").selectOption({ label: "Walker's Point" });
  await s.getByLabel("Year").selectOption({ label: "2023" });
  await s.getByRole("button", { name: /Race and Ethnicity/ }).click();
  const table = s.getByRole("table", { name: /Walker's Point, 2023: Race and Ethnicity/ });
  await expect(table).toContainText("7,668");
  await expect(table).toContainText("±790");
  await expect(page).toHaveURL(/place=walkers-point/);
  await expect(page).toHaveURL(/year=2023/);
  await expect(page).toHaveURL(/topic=race-and-ethnicity/);
  await expect(s.getByRole("link", { name: "B03002" })).toHaveAttribute("href", "https://data.census.gov/table?q=B03002");
});

test("DYCU's file problems are shown above the table", async ({ page }, info) => {
  await open(page, info.project.name, "place=walkers-point&year=2023&topic=sex-and-age");
  await expect(section(page).getByText("The Total columns are 0 for every row in DYCU's file")).toBeVisible();
});

test("a topic missing from the 2021 layout says so", async ({ page }, info) => {
  await open(page, info.project.name, "place=burnham-park-layton-park-silver-city&year=2021");
  await expect(section(page).getByText(/Commute Method and Time.*not in this year's file/)).toBeVisible();
});

test("an unknown address falls back to the newest file", async ({ page }, info) => {
  await open(page, info.project.name, "place=nowhere&year=1999&topic=zzz");
  await expect(section(page).getByRole("table").first()).toBeVisible();
});

test("the address restores the table after a reload", async ({ page }, info) => {
  await open(page, info.project.name, "place=walkers-point&year=2023&topic=rent-paid");
  await page.reload();
  await expect(section(page).getByRole("table", { name: /Walker's Point, 2023: Rent Paid/ })).toBeVisible();
});

test("switching neighborhoods quickly shows only the last choice", async ({ page }, info) => {
  await open(page, info.project.name);
  const pick = section(page).getByLabel("Neighborhood");
  await pick.selectOption({ label: "Walker's Point" });
  await pick.selectOption({ index: 0 });
  const label = await pick.locator("option").first().textContent();
  await expect(section(page).getByRole("table").first()).toHaveAccessibleName(new RegExp(`^${label!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}, `));
});
```

In `e2e/a11y.spec.ts`, add `"/d/N03"` to `PAGES`.

- [ ] **Step 2: Run them to see them fail**

Run: `npm run e2e -- e2e/portraits.spec.ts`
Expected: FAIL — no "What's in each spreadsheet" region.

- [ ] **Step 3: Write `ui/components/PortraitTables.tsx`** (lay it out to the approved comp; this is the behavior and markup contract)

```tsx
"use client";
import { useQuery } from "convex/react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { api } from "@/convex/_generated/api";
import { TOPICS } from "@/convex/lib/portrait";
import { censusTableUrl, formatPortraitNumber, resolvePortraitFocus } from "@/ui/lib/portrait";
import { ProvenanceTag } from "./ProvenanceTag";
import type { SheetData } from "./SheetBody";
import styles from "./sheet.module.css";

type Index = NonNullable<SheetData["portraits"]>;
const SLUGS = TOPICS.map((t) => t.slug);
const ABOUT = new Map(TOPICS.map((t) => [t.slug, t.about]));

export function PortraitTables({ index }: { index: Index }) {
  const [focus, setFocus] = useState(() => resolvePortraitFocus(index, new URLSearchParams(), SLUGS));
  useEffect(() => setFocus(resolvePortraitFocus(index, new URLSearchParams(window.location.search), SLUGS)), [index]);

  const place = index.neighborhoods.find((n) => n.key === focus.place) ?? index.neighborhoods[0];
  const file = place.files.find((f) => f.hubId === focus.hubId) ?? place.files[0];
  const loaded = useQuery(api.catalog.portraitTables, file.hubId === index.initial?.hubId ? "skip" : { hubId: file.hubId });
  const tables = file.hubId === index.initial?.hubId ? index.initial.tables : loaded;
  const table = useMemo(() => tables?.find((t) => t.slug === focus.topic) ?? tables?.[0], [tables, focus.topic]);

  const go = (next: { place: string; hubId: string; topic: string }) => {
    setFocus(next);
    const p = new URLSearchParams(window.location.search);
    const n = index.neighborhoods.find((x) => x.key === next.place)!;
    const year = n.files.find((f) => f.hubId === next.hubId)?.year;
    p.set("place", next.place);
    if (year) p.set("year", String(year));
    else p.delete("year");
    p.set("topic", next.topic);
    window.history.replaceState(null, "", `${window.location.pathname}?${p}`);
  };

  const present = new Set(tables?.map((t) => t.slug) ?? []);
  const caption = `${place.label}, ${file.year ?? ""}: ${table?.topic ?? ""}`;

  return (
    <section className={styles.section} aria-labelledby="portrait-heading">
      <h3 id="portrait-heading" className={styles.heading}>WHAT&apos;S IN EACH SPREADSHEET</h3>
      <p>
        Each file is one neighborhood&apos;s numbers from the Census Bureau&apos;s American Community Survey (5-year estimates), as DYCU
        published them. <ProvenanceTag source="DYCU" />
      </p>
      <div className={styles.portraitPickers}>
        <label>
          Neighborhood
          <select value={place.key} onChange={(e) => {
            const n = index.neighborhoods.find((x) => x.key === e.target.value)!;
            go({ place: n.key, hubId: n.files[0].hubId, topic: focus.topic });
          }}>
            {index.neighborhoods.map((n) => <option key={n.key} value={n.key}>{n.label}</option>)}
          </select>
        </label>
        <label>
          Year
          <select value={file.hubId} onChange={(e) => go({ place: place.key, hubId: e.target.value, topic: focus.topic })}>
            {place.files.map((f) => <option key={f.hubId} value={f.hubId}>{f.year ?? "Undated"}</option>)}
          </select>
        </label>
      </div>
      <ol className={styles.portraitTopics}>
        {TOPICS.map((t) =>
          present.has(t.slug) || !tables ? (
            <li key={t.slug}>
              <button type="button" aria-pressed={table?.slug === t.slug} onClick={() => go({ place: place.key, hubId: file.hubId, topic: t.slug })}>
                {t.topic}
              </button>
            </li>
          ) : (
            <li key={t.slug} className={styles.portraitMissing}>{t.topic}: not in this year&apos;s file</li>
          ),
        )}
      </ol>
      {tables === undefined ? (
        <p role="status" aria-busy="true">Loading…</p>
      ) : !table ? (
        <p role="status">No tables were read from this file.</p>
      ) : (
        <>
          {table.issues.map((i) => <p key={i} className={styles.portraitIssue}>{i}</p>)}
          <p>
            {ABOUT.get(table.slug)}{" "}
            {table.tableIds.map((id) => <a key={id} href={censusTableUrl(id)}>{id}</a>).reduce<ReactNode[]>((acc, a, i) => (i ? [...acc, ", ", a] : [a]), [])}{" "}
            {table.tableIds.length > 0 && <ProvenanceTag source="SOURCE_SITE" />}
          </p>
          <div className={styles.portraitScroll} role="region" aria-label="Table, scroll sideways for more columns" tabIndex={0}>
            <table className={styles.portraitTable} aria-label={caption}>
              <thead>
                {table.groups.length > 1 && (
                  <tr>
                    <td />
                    {table.groups.map((g) => <th key={g} scope="colgroup" colSpan={2}>{g}</th>)}
                  </tr>
                )}
                <tr>
                  <th scope="col">Variable</th>
                  {table.groups.flatMap((g) => [
                    <th key={`${g}e`} scope="col">Estimate</th>,
                    <th key={`${g}m`} scope="col">± Margin</th>,
                  ])}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((r, i) =>
                  r.heading ? (
                    <tr key={i}><th scope="rowgroup" colSpan={1 + table.groups.length * 2}>{r.label}</th></tr>
                  ) : (
                    <tr key={i}>
                      <th scope="row">{r.label}</th>
                      {r.values.flatMap((v, j) => [
                        <td key={`${j}e`}>{v ? formatPortraitNumber(v.estimate) : ""}</td>,
                        <td key={`${j}m`}>{v?.moe ? `±${formatPortraitNumber(v.moe)}` : ""}</td>,
                      ])}
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
          <p className={styles.portraitNote}>
            Margin of error: the range the true number likely falls in, at the Census Bureau&apos;s 90% confidence level.
          </p>
        </>
      )}
    </section>
  );
}
```

`ui/components/SheetBody.tsx`: import `PortraitTables` and render it right after the WHAT IT MEASURES block (inside the `lead` wrapper's parent, so it sits under the grid/explainer pair):

```tsx
      {sheet.portraits && <PortraitTables index={sheet.portraits} />}
```

`ui/components/sheet.module.css` (first pass; Task 8's gates tune it to the comp):

```css
.portraitPickers { display: flex; flex-wrap: wrap; gap: 12px 24px; margin: 12px 0; }
.portraitPickers label { display: grid; gap: 4px; font-family: var(--font-caps); font-weight: 700; font-size: var(--fs-label); }
.portraitPickers select { min-height: 44px; padding: 0 10px; border: var(--hair); background: var(--paper); font: inherit; font-family: var(--font-body); font-weight: 400; font-size: var(--fs-body); }
.portraitTopics { list-style: none; margin: 12px 0; padding: 0; border-top: var(--hair); }
.portraitTopics li { border-bottom: var(--hair); }
.portraitTopics button { width: 100%; min-height: 44px; padding: 8px 4px; border: 0; background: none; text-align: left; font: inherit; cursor: pointer; }
.portraitTopics button[aria-pressed="true"] { background: var(--band); font-weight: 700; }
.portraitMissing { padding: 8px 4px; color: var(--muted); }
.portraitIssue { padding: 6px 10px; border: var(--hair); font-size: var(--fs-small); }
.portraitScroll { overflow-x: auto; border: var(--hair); }
.portraitTable { border-collapse: collapse; font-variant-numeric: tabular-nums; }
.portraitTable th, .portraitTable td { padding: 6px 10px; border-bottom: var(--hair); text-align: right; white-space: nowrap; }
.portraitTable th[scope="row"], .portraitTable th[scope="rowgroup"], .portraitTable thead th:first-child { text-align: left; white-space: normal; }
.portraitTable th[scope="rowgroup"] { background: var(--band); font-family: var(--font-caps); }
.portraitNote { font-size: var(--fs-small); color: var(--muted); }
```

- [ ] **Step 4: Run every test**

Run: `npm run e2e && npx vitest run && npm run typecheck && npx next build`
Expected: all pass, including the 6 portrait tests on both projects and the axe scan of `/d/N03`.

- [ ] **Step 5: Commit**

```bash
git add ui e2e
git commit -m "feat: show what's in each neighborhood spreadsheet on the N03 sheet"
```

---

### Task 7: Search lands on the table

**Files:**
- Modify: `convex/lib/types.ts`, `convex/search.ts`, `convex/lib/evalQuestions.ts`, `ui/components/SearchHome.tsx`, `ui/components/ResultRow.tsx`, `ui/components/FamilyPreview.tsx`
- Test: `convex/search.test.ts`, `e2e/portraits.spec.ts`

**Interfaces:**
- Consumes: Task 1 (`placeKey`, `topicFor`), Task 4 (`portraitFocusQuery`).
- Produces: `Snippet.focus?: { place: string; year: number | null; topic: string }`.

- [ ] **Step 1: Write the failing tests**

`convex/search.test.ts` (append; use the file's existing seeding and fake-fetch setup):

```ts
it("a spreadsheet passage carries the neighborhood, year and topic it came from", async () => {
  const t = convexTest(schema, modules);
  installFakeFetch();
  await seedCatalog(t); // the file's existing helper
  const hubId = fixtureFamilies().find((f) => f.key === "document:neighborhood-portrait-spreadsheet")!.members[0].hubId;
  await t.run((ctx) =>
    ctx.db.insert("docChunks", { hubId, modified: "m", section: "Rent Paid", text: "Walkers rent", embedding: fakeEmbedding("Walkers rent") }),
  );
  const res = await t.action(api.search.searchCatalog, { query: "Walkers rent" });
  const row = res.results.find((r) => r.code === "N03")!;
  expect(row.snippet?.focus).toMatchObject({ topic: "rent-paid" });
  expect(row.snippet?.focus?.place).toMatch(/[a-z-]+/);
});
```

`e2e/portraits.spec.ts` (append):

```ts
test("a neighborhood search opens that table", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "laptop pane");
  await page.goto("/?q=" + encodeURIComponent("Walker's Point race and ethnicity 2023"));
  await page.locator("li[data-code='N03'] button").click();
  await expect(page).toHaveURL(/open=N03/);
  await expect(page).toHaveURL(/topic=race-and-ethnicity/);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run convex/search.test.ts && npm run e2e -- e2e/portraits.spec.ts -g "opens that table"`
Expected: FAIL — `snippet.focus` undefined; URL lacks `topic=`.

- [ ] **Step 3: Implement**

`convex/lib/types.ts` — add to `Snippet`:

```ts
  focus?: { place: string; year: number | null; topic: string };
```

`convex/search.ts` — in `resolveVectorHits`, where `chunks.push({...})` builds the snippet:

```ts
      const spreadsheet = member.familyKey.endsWith("-spreadsheet");
      chunks.push({
        familyKey: member.familyKey,
        snippet: {
          hubId: chunk.hubId,
          title: member.title,
          section: chunk.section,
          text: chunk.text.slice(0, 280),
          ...(spreadsheet
            ? { focus: { place: placeKey(member.place ?? member.title), year: member.years[0] ?? null, topic: topicFor(chunk.section).slug } }
            : {}),
        },
      });
```

(import `placeKey, topicFor` from `./lib/portrait`; if `Snippet` has a Convex validator in `convex/validators.ts`, add `focus: v.optional(v.object({ place: v.string(), year: v.union(v.number(), v.null()), topic: v.string() }))` there too.)

`ui/components/SearchHome.tsx` — in `select`, append the row's focus to the address:

```ts
    const focus = rows.find((r) => r.code === code)?.snippet?.focus;
    const url = `${window.location.pathname}${selectionSearch({ q: query, open: code })}${focus ? `&${portraitFocusQuery(focus).slice(1)}` : ""}`;
```

(import `portraitFocusQuery` from `@/ui/lib/portrait`; keep the existing replace-vs-push logic.)

`ui/components/ResultRow.tsx` — pass `focus={row.snippet?.focus}` to `<FamilyPreview …/>`; `ui/components/FamilyPreview.tsx` — accept `focus?: PortraitFocus | null` and use `href={`/d/${preview.code}${portraitFocusQuery(focus)}`}` on the Open sheet link.

`convex/lib/evalQuestions.ts` — add two questions:

```ts
  { question: "rent paid in Walker's Point", expect: ["document:neighborhood-portrait-spreadsheet", "document:neighborhood-portrait"] },
  { question: "how many people in Harambee live in poverty", expect: ["document:neighborhood-portrait-spreadsheet", "document:neighborhood-portrait"] },
```

- [ ] **Step 4: Run every test, then the search report card on dev**

```bash
npx vitest run && npm run typecheck && npm run e2e
npx convex run evals:searchReportCard
```

Expected: all pass; the report card's `rate` stays ≥ 0.8 with the two new questions included (`passed/total` printed). If a new question misses, read its top results and adjust the passage format (Task 1 `portraitPassage`), never the expectation.

- [ ] **Step 5: Commit**

```bash
git add convex ui e2e tests
git commit -m "feat: neighborhood searches open the matching spreadsheet table"
```

---

### Task 8: Design gates, finish review, DESIGN.md

**Files:** `.impeccable/build/*` (archive the previous surface's record first, as in Phase 2.5), `ui/components/sheet.module.css`, `e2e/capture.spec.ts`, `DESIGN.md`, `.impeccable/design.json`

- [ ] **Step 1:** Archive `.impeccable/build/{state.json,spec.json,regions.json,scaffold,crops,font-match,comp-grid.png}` into `.impeccable/build/archive/how-it-works/`, then `impeccable build-phase start --comp .impeccable/mocks/<approved laptop comp> --breakpoint 1536x1024`.
- [ ] **Step 2:** Spec the comp (`comp-spec --grid`, regions for heading, lead, pickers, topic list, issue line, table, MOE note), measure type, plates (none expected), then capture `/?open=N03&place=walkers-point&year=2023&topic=sex-and-age` at 1536×1024 (add a `@capture` test like Phase 2.5's) and pass the hero gate (≥72%); tune `sheet.module.css` only.
- [ ] **Step 3:** Sections, motion (none), responsive (390/1024/1440 no overflow; phone capture vs the phone comp by eye).
- [ ] **Step 4:** Fresh finish reviewer (as in Phase 2.5: `reference/degraded/finish-reviewer.md` packet with the surface brief, comps, captures, diff dirs); at most two fix rounds; leftovers go to Tarik.
- [ ] **Step 5:** Documenter updates DESIGN.md and `.impeccable/design.json` (the spreadsheet section, the issue-line style, numbers as written).
- [ ] **Step 6: Commit**

```bash
git add .impeccable DESIGN.md ui e2e
git commit -m "feat: build the neighborhood spreadsheet section to its comp"
```

---

### Task 9 (HUMAN checkpoint, then ship): Preview review and merge

- [ ] **Step 1:** Push the branch and open a PR (`gh pr create --title "Neighborhood spreadsheets on the N03 sheet" --body-file …`); `gh pr checks --watch` until `check` and `e2e` pass.
- [ ] **Step 2 (HUMAN):** Tarik opens the Vercel preview on a laptop and a phone: picks three neighborhoods and years, opens five topics, checks one table against DYCU's downloaded file, and searches "rent paid in Walker's Point". Merge only on his go-ahead.
- [ ] **Step 3:** `gh pr merge --merge --delete-branch`, wait for the production deploy, then `npx convex run --prod build:start`. When it completes, verify `npx convex data portraitTables --prod` shows 99 files and 1564 tables with no unrecognized tabs, and `https://cream-city-almanac.vercel.app/d/N03` shows the section. First-run cost: embeddings for about 1,564 passages (well under $0.05).
- [ ] **Step 4:** Leave decision 015's "What actually happened" blank for Tarik.
