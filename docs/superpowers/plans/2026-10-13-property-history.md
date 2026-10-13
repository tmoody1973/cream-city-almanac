# Property History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ask counts and measures the City's property file by assessment year, 2005 through today's file (2026), citywide and by aldermanic district.

**Architecture:**
- **The build** reads the yearly files from the "MPROP Historical" package. It recognizes each one's column layout and stores `years: { year, resourceId, layout }[]` on the property profile.
- **A new `years` argument** on `countRecords` (counts and the `assessed-value` measure) goes to new builders in `convex/lib/propertyYears.ts`. They read the chosen years as one `UNION ALL` table, renamed to the classic column names. Questions without `years` keep running today's code untouched.
- **Spans of several years** are grouped by year, and headline figures cover the newest year.

**Tech Stack:** Convex (actions, internalQuery, convex-test), TypeScript, Vitest, Playwright, Zod (Ask tools), Next.js 16.

**Spec:** `docs/superpowers/specs/2026-10-13-property-history-design.md` (amended 2026-10-13 while planning: multi-year grouping, newest-year headline, missing-year note).

## Global Constraints

- **Years:** 2005 through today's file. Today's file is the year its `YR_ASSMT` mostly holds (2026). `YEARLY` `from: 2005`.
- **A year is the City's file year** (the "MPROP <year>" name), never the `YR_ASSMT` field inside historical files.
- **Only these four facts carry across years:**
  - value `C_A_TOTAL`;
  - district `GEO_ALDER`;
  - owner-occupied `OWN_OCPD` (normalized to `'O'`);
  - class `C_A_CLASS` (only values `1` residential and `5` condominiums are offered; "homes" = both).
- **Card text, verbatim:**
  - YEARLY note: "Years are the City's file years; in a few files the City's own assessment-year field reads a year later."
  - District note: "District lines are redrawn after each census, so a district number can cover a different area in different years."
- **Year-span City queries use a 25-second timeout** (`YEAR_TIMEOUT_MS = 25_000`); everything else keeps 10 seconds.
- **No owner, address or tax-key columns ever enter SQL or results.** Only counts and totals come back. Only fixed text, validated resource ids (`RID`) and validated integer years enter SQL.
- **Without `years`, every existing property query is byte-identical** to today's.
- **Git and data rules:**
  - Commit trailer: `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
  - Never stage `.superpowers/` or `clerk-creamcityalmanac.app.zone`.
  - Each dev Convex push or dev data run needs Tarik's explicit OK.
  - Prod data jobs are Tarik's.

## Review Focus

1. **The City refuses some of the build's 21 column reads** (bursts get 403s). Each refused year is skipped with a build note naming the year; the others are stored. *Pinned in Task 2.*
2. **A year missing inside an asked span** (skipped by the build). The card names it ("The City has no usable file for 2022"); it is never silently absent. *Pinned in Task 3.*
3. **Non-integer or reversed years** (`2005.5`, `from > to`). Refused as bad dates, never queried. *Pinned in Task 3.*
4. **Years past today's file** (`to: 2030`). Clamped to the stored range with "(clamped to the files' range)"; fully outside is refused with the range. *Pinned in Task 3.*
5. **Value text the number check can't read** (commas or `$` in a new-layout file). Counts would leave those parcels out. *Checked by the live dev step in Task 6* (2025 over-$200k must be 75,204; owner-occupied 2021/2022 must be 93,220/93,369).

---

## File map

| File | Role |
|---|---|
| `convex/lib/propertyYears.ts` (new) | Layouts, year-file parsing, the year source, `buildYearCount`, `buildYearMeasure` |
| `convex/lib/cityFamilies.ts` | `YEARLY` entry; `cityNote` falls back to its page line |
| `convex/lib/cityProfile.ts` | `CityProfile.years` |
| `convex/validators.ts` | `vCityProfile.years` |
| `convex/buildStore.ts` | `familyFiles` internalQuery |
| `convex/build.ts` | `withYears` in `profileCity` |
| `convex/lib/citySql.ts` | `Built` gains `source`, `latestYear`, `timeoutMs`; bad-dates `reason`; export `numberLabel` |
| `convex/lib/measureSql.ts` | export `measureColumns`; `MeasureBuilt` gains the same optional fields |
| `convex/lib/ckan.ts` | optional timeout on `datastoreSql`/`datastoreSqlPage` |
| `convex/city.ts` | `years` arg; dispatch to year builders; timeouts; result fields |
| `lib/ask/tools.ts` | `years` in `countParams` |
| `ui/lib/askCount.ts`, `ui/components/AskCards.tsx`, `ui/lib/measureText.ts`, `ui/lib/cardExport.ts` | source line, newest-year headline, no "All" row across years |
| `lib/ask/prompt.ts`, `lib/ask/model.ts`, `scripts/ask-questions.ts`, `e2e/ask.spec.ts` | Ask instructions, scripted model, graded question, browser test |
| Docs | decision 040, How it works, questions list |

---

### Task 1: Layouts, year files and the YEARLY entry

**Files:**
- Create: `convex/lib/propertyYears.ts`
- Modify: `convex/lib/cityFamilies.ts:25-36`
- Test: `tests/lib/propertyYears.test.ts` (create), `tests/lib/cityFamilies.test.ts`

**Interfaces:**
- Produces:
  - `type Layout = "classic" | "short" | "long"`
  - `type YearFile = { year: number; resourceId: string; layout: Layout }`
  - `layoutOf(fields: { id: string }[]): Layout | null`
  - `yearFiles(files: { name: string; url: string }[], from: number): { year: number; resourceId: string }[]` (sorted by year)
  - `YEARLY: Record<string, { history: string; from: number; note: string; page: string }>` in cityFamilies
  - `LAYOUTS` (internal to propertyYears)

- [ ] **Step 1: Write the failing tests**

`tests/lib/propertyYears.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { layoutOf, yearFiles } from "../../convex/lib/propertyYears";

const ids = (...names: string[]) => names.map((id) => ({ id }));
const link = (rid: string, file: string) => `https://data.milwaukee.gov/dataset/79e9d55a-c1ed-457c-ab63-cb8e36235ba8/resource/${rid}/download/${file}`;

describe("layoutOf (K2)", () => {
  it("recognizes each layout by its columns", () => {
    expect(layoutOf(ids("TAXKEY", "C_A_TOTAL", "GEO_ALDER", "OWN_OCPD", "C_A_CLASS"))).toBe("classic");
    expect(layoutOf(ids("Taxkey", "AssessValu", "DistrictNa", "IsOwnerOcc", "PrevNonExemptClass"))).toBe("short");
    expect(layoutOf(ids("Taxkey", "TotalAssessedValue", "DistrictName", "IsOwnerOccupied", "PrevNonExemptClass"))).toBe("long");
  });
  it("gives no layout when a carried column is missing or nothing matches", () => {
    expect(layoutOf(ids("C_A_TOTAL", "GEO_ALDER", "OWN_OCPD"))).toBeNull(); // no class column
    expect(layoutOf(ids("CATOTAL", "GEOALDER", "OWNOCPD", "CACLASS"))).toBeNull(); // the 1990s layout isn't read
  });
});

describe("yearFiles (K2)", () => {
  it("takes each 'MPROP <year>' file from 2005 on, with the id from its link, sorted by year", () => {
    expect(yearFiles([
      { name: "Parcel Tax - MPROP 2025", url: link("9e512b1d-2c64-448f-9e7a-5c2022d5948a", "parcel-tax-mprop-2025.csv") },
      { name: "MPROP 2021", url: link("d1b65182-fff9-4400-9476-0aff30a6e0ea", "mprop-2021.csv") },
      { name: "MPROP 1995", url: link("bd5f561d-d5e6-42f4-b4d9-87f287867e7c", "mprop-1995.csv") },
      { name: "MPROP Reference 2009-now", url: link("c88986d6-5624-4154-860a-13f901c90905", "ref.pdf") },
      { name: "MPROP 2010", url: "https://data.milwaukee.gov/x/no-id.csv" },
    ], 2005)).toEqual([
      { year: 2021, resourceId: "d1b65182-fff9-4400-9476-0aff30a6e0ea" },
      { year: 2025, resourceId: "9e512b1d-2c64-448f-9e7a-5c2022d5948a" },
    ]);
  });
});
```

Add to `tests/lib/cityFamilies.test.ts` (inside its top-level `describe`, or a new one):

```ts
import { cityNote, YEARLY } from "../../convex/lib/cityFamilies";

describe("YEARLY (K2)", () => {
  it("names the property file's history and its start", () => {
    expect(YEARLY["city:master-property-file-mprop"]).toMatchObject({ history: "city:master-property-list-mprop-historical", from: 2005 });
  });
  it("gives the property dataset page its line", () => {
    expect(cityNote("city:master-property-file-mprop")).toBe("Yearly assessments from 2005 are read for change over time.");
  });
});
```

(If `cityNote` is already imported in that file, merge the import.)

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/lib/propertyYears.test.ts tests/lib/cityFamilies.test.ts`
Expected: FAIL — "Failed to resolve import ../../convex/lib/propertyYears" and `YEARLY` undefined.

- [ ] **Step 3: Write the implementation**

`convex/lib/propertyYears.ts`:

```ts
// The City's yearly property files (spec 2026-10-13-property-history-design §4–5): which columns each layout uses for
// the four facts that carry across years. A layout is recognized only when all four of its columns are there.
export type Layout = "classic" | "short" | "long";
export type YearFile = { year: number; resourceId: string; layout: Layout };

export const LAYOUTS: Record<Layout, { value: string; district: string; owner: string; ownerYes: string; cls: string }> = {
  classic: { value: "C_A_TOTAL", district: "GEO_ALDER", owner: "OWN_OCPD", ownerYes: "O", cls: "C_A_CLASS" },
  short: { value: "AssessValu", district: "DistrictNa", owner: "IsOwnerOcc", ownerYes: "1", cls: "PrevNonExemptClass" }, // 2022–23: names cut to 10 letters
  long: { value: "TotalAssessedValue", district: "DistrictName", owner: "IsOwnerOccupied", ownerYes: "1", cls: "PrevNonExemptClass" },
};

export function layoutOf(fields: { id: string }[]): Layout | null {
  const have = new Set(fields.map((f) => f.id));
  return (Object.keys(LAYOUTS) as Layout[]).find((l) => {
    const c = LAYOUTS[l];
    return [c.value, c.district, c.owner, c.cls].every((x) => have.has(x));
  }) ?? null;
}

const YEAR_NAME = /MPROP (\d{4})$/;
const RESOURCE = /\/resource\/([0-9a-f-]{36})\//;
// The catalog keeps each file's name and download link; the link carries the file's id.
// ponytail: a second file with the same year is ignored (first wins); the City has never published two.
export function yearFiles(files: { name: string; url: string }[], from: number): { year: number; resourceId: string }[] {
  const byYear = new Map<number, string>();
  for (const f of files) {
    const y = YEAR_NAME.exec(f.name.trim())?.[1];
    const id = RESOURCE.exec(f.url)?.[1];
    if (!y || !id || Number(y) < from || byYear.has(Number(y))) continue;
    byYear.set(Number(y), id);
  }
  return [...byYear].map(([year, resourceId]) => ({ year, resourceId })).sort((a, b) => a.year - b.year);
}
```

In `convex/lib/cityFamilies.ts`, after the `ARCHIVES` block (before `cityNote`):

```ts
// Families whose history is one file per year in another package (spec 2026-10-13-property-history-design §4).
export const YEARLY: Record<string, { history: string; from: number; note: string; page: string }> = {
  "city:master-property-file-mprop": {
    history: "city:master-property-list-mprop-historical", from: 2005,
    note: "Years are the City's file years; in a few files the City's own assessment-year field reads a year later.",
    page: "Yearly assessments from 2005 are read for change over time.",
  },
};
```

And change `cityNote`'s last line:

```ts
export function cityNote(familyKey: string): string | null {
  if (Object.hasOwn(CITY_NOTES, familyKey)) return CITY_NOTES[familyKey];
  const a = ARCHIVES[familyKey];
  if (a && !a.join) return a.note;
  return YEARLY[familyKey]?.page ?? null;
}
```

- [ ] **Step 4: Run them to verify they pass**

Run: `npx vitest run tests/lib/propertyYears.test.ts tests/lib/cityFamilies.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add convex/lib/propertyYears.ts convex/lib/cityFamilies.ts tests/lib/propertyYears.test.ts tests/lib/cityFamilies.test.ts
git commit -m "feat: the property file's yearly layouts and files, and its YEARLY entry

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: The build stores the year list

**Files:**
- Modify: `convex/lib/cityProfile.ts:66-79` (`CityProfile`), `convex/validators.ts:130`, `convex/buildStore.ts` (new query after `familyContext`), `convex/build.ts` (imports, `profileCity`, new `withYears`)
- Modify: `tests/helpers/cityFixtures.ts`
- Test: `convex/build.test.ts` (new `describe("property history (K2)")`)

**Interfaces:**
- Consumes: `layoutOf`, `yearFiles`, `YearFile` (Task 1); `YEARLY` (Task 1); `assessmentYear(categories)` from `convex/lib/propertyMeasures.ts`.
- Produces:
  - `CityProfile.years?: YearFile[] | null`;
  - `internal.buildStore.familyFiles({ familyKey }) → { name: string; url: string }[]`;
  - the stored property profile has `years` sorted by year, with today's file last as `{ year: 2026, resourceId: MPROP_RID, layout: "classic" }`.

- [ ] **Step 1: Add the fixtures**

Append to `tests/helpers/cityFixtures.ts`:

```ts
import { MPROP_RID } from "../../convex/lib/cityProfile";

// The property file and its yearly history, shaped like the City's catalog (links carry each file's id).
export const YEAR_RIDS = { 1995: "bd5f561d-d5e6-42f4-b4d9-87f287867e7c", 2005: "6370d019-f21b-4957-aa86-d38f5e82e138", 2022: "a368cfd5-5504-4311-b394-df850da76367", 2025: "9e512b1d-2c64-448f-9e7a-5c2022d5948a" } as const;
const yearLink = (rid: string) => `https://data.milwaukee.gov/dataset/79e9d55a-c1ed-457c-ab63-cb8e36235ba8/resource/${rid}/download/mprop.csv`;
export function propertyPackages() {
  const pkg = (id: string, name: string, title: string, resources: unknown[]) => ({
    id, name, title, notes: `<p>${title} from the City of Milwaukee.</p>`, metadata_modified: "2026-10-13T09:00:00.000000", metadata_created: "2018-01-01T00:00:00.000000",
    tags: [{ name: "property" }], groups: [{ title: "Housing" }], organization: { title: "Assessor's Office" }, resources,
  });
  return [
    pkg("p1", "mprop", "Master Property File (MPROP)", [{ id: MPROP_RID, name: "CSV", format: "CSV", url: `https://data.milwaukee.gov/dataset/p1/resource/${MPROP_RID}/download/mprop.csv`, datastore_active: true }]),
    pkg("p2", "historical-master-property-file", "Master Property List (MPROP) Historical", [
      { id: YEAR_RIDS[2025], name: "Parcel Tax - MPROP 2025", format: "CSV", url: yearLink(YEAR_RIDS[2025]), datastore_active: true },
      { id: YEAR_RIDS[2022], name: "Parcel Tax - MPROP 2022", format: "CSV", url: yearLink(YEAR_RIDS[2022]), datastore_active: true },
      { id: YEAR_RIDS[2005], name: "MPROP 2005", format: "CSV", url: yearLink(YEAR_RIDS[2005]), datastore_active: true },
      { id: YEAR_RIDS[1995], name: "MPROP 1995", format: "CSV", url: yearLink(YEAR_RIDS[1995]), datastore_active: true },
      { id: "c88986d6-5624-4154-860a-13f901c90905", name: "MPROP Reference 2009-now", format: "PDF", url: yearLink("c88986d6-5624-4154-860a-13f901c90905"), datastore_active: false },
    ]),
  ];
}
```

- [ ] **Step 2: Write the failing tests**

Add to `convex/build.test.ts`. Extend the import of `cityFixtures` to `import { cityPackages, CRIME_CURRENT_RID, propertyPackages, YEAR_RIDS } from "../tests/helpers/cityFixtures";` and add `import { MPROP_RID } from "./lib/cityProfile";` if not already imported. Then at the end of the file:

```ts
describe("property history (K2)", () => {
  const MPROP = "city:master-property-file-mprop";
  const CLASSIC = ["TAXKEY", "YR_ASSMT", "C_A_TOTAL", "GEO_ALDER", "GEO_TRACT", "OWN_OCPD", "C_A_CLASS", "CONVEY_DATE"].map((id) => ({ id, type: "text" }));
  const SHORT = ["Taxkey", "AssessValu", "DistrictNa", "IsOwnerOcc", "PrevNonExemptClass"].map((id) => ({ id, type: "text" }));
  const LONG = ["Taxkey", "TotalAssessedValue", "DistrictName", "IsOwnerOccupied", "PrevNonExemptClass"].map((id) => ({ id, type: "text" }));
  const fieldsFor = (overrides: Partial<Record<string, { id: string; type: string }[] | "throw">> = {}) => (rid: string) => {
    const o = overrides[rid];
    if (o === "throw") throw new Error("403 Forbidden");
    if (o) return o;
    return rid === YEAR_RIDS[2022] ? SHORT : rid === YEAR_RIDS[2025] ? LONG : CLASSIC;
  };
  const propertySql = (sql: string) =>
    sql.startsWith("SELECT COUNT(*)") ? [{ n: "159950" }]
      : sql.includes("MIN(") ? [{ lo: "1900-01-01T00:00:00", hi: "2026-09-30T00:00:00" }]
      : sql.includes('"YR_ASSMT" AS v') ? [{ v: "2026", n: "159556" }, { v: "2025", n: "394" }]
      : [{ v: "1", n: "500" }];
  const profileOf = (t: TestConvex<typeof schema>) => t.run((ctx) => ctx.db.query("cityProfiles").withIndex("by_family", (q) => q.eq("familyKey", MPROP)).first());

  it("stores each year from 2005 with its layout, and today's file as its assessment year", async () => {
    const t = convexTest(schema, modules);
    await seedCity(t, [...cityPackages(), ...propertyPackages()]);
    installFakeFetch({ cityFields: CLASSIC, cityFieldsFor: fieldsFor(), citySql: propertySql });
    expect(await t.action(internal.build.reprofileCity, { familyKey: MPROP })).toEqual([]);
    expect((await profileOf(t))?.years).toEqual([
      { year: 2005, resourceId: YEAR_RIDS[2005], layout: "classic" },
      { year: 2022, resourceId: YEAR_RIDS[2022], layout: "short" },
      { year: 2025, resourceId: YEAR_RIDS[2025], layout: "long" },
      { year: 2026, resourceId: MPROP_RID, layout: "classic" },
    ]);
  });
  it("skips a year whose columns match no layout, and says so", async () => {
    const t = convexTest(schema, modules);
    await seedCity(t, [...cityPackages(), ...propertyPackages()]);
    installFakeFetch({ cityFields: CLASSIC, cityFieldsFor: fieldsFor({ [YEAR_RIDS[2022]]: [{ id: "Weird", type: "text" }] }), citySql: propertySql });
    expect(await t.action(internal.build.reprofileCity, { familyKey: MPROP })).toEqual([`${MPROP}: 2022 file's columns match no known layout; skipped`]);
    expect((await profileOf(t))?.years?.map((y) => y.year)).toEqual([2005, 2025, 2026]);
  });
  it("skips a year the City refuses to describe, and keeps the others (review focus 1)", async () => {
    const t = convexTest(schema, modules);
    await seedCity(t, [...cityPackages(), ...propertyPackages()]);
    installFakeFetch({ cityFields: CLASSIC, cityFieldsFor: fieldsFor({ [YEAR_RIDS[2025]]: "throw" }), citySql: propertySql });
    const notes = await t.action(internal.build.reprofileCity, { familyKey: MPROP });
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatch(new RegExp(`^${MPROP}: 2025 file unavailable; skipped`));
    expect((await profileOf(t))?.years?.map((y) => y.year)).toEqual([2005, 2022, 2026]);
  });
  it("stores no years, and says why, when the history package isn't in the catalog", async () => {
    const t = convexTest(schema, modules);
    await seedCity(t, [...cityPackages(), propertyPackages()[0]]);
    installFakeFetch({ cityFields: CLASSIC, citySql: propertySql });
    expect(await t.action(internal.build.reprofileCity, { familyKey: MPROP })).toEqual([`${MPROP}: no yearly property files found`]);
    expect((await profileOf(t))?.years ?? null).toBeNull();
  });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `npx vitest run convex/build.test.ts -t "property history"`
Expected: FAIL. The first test gets `years` undefined. The second and third return `[]` notes.

`CLASSIC` has at most six category candidates (`MAX_CATEGORIES = 6`; `TAXKEY` is excluded as a key), so `YR_ASSMT` is profiled as a category and `assessmentYear` reads 2026 from it. If a test shows today's file missing, check that first.

If `seedCity` produces different family keys than `city:master-property-file-mprop` / `city:master-property-list-mprop-historical`, print them with `t.run((ctx) => ctx.db.query("families").collect())`, and fix the fixture titles (not the code) until they match the dev catalog's keys.

- [ ] **Step 4: Implement**

`convex/lib/cityProfile.ts`: add an import and the field.

```ts
import type { YearFile } from "./propertyYears";
```

In `interface CityProfile`, after the `archive?` line:

```ts
  years?: YearFile[] | null; // the property file's yearly files, oldest first, today's file last (YEARLY)
```

`convex/validators.ts`, after the `archive:` line of `vCityProfile`:

```ts
  years: v.optional(v.union(v.array(v.object({ year: v.number(), resourceId: v.string(), layout: v.union(v.literal("classic"), v.literal("short"), v.literal("long")) })), v.null())),
```

`convex/buildStore.ts`, after `familyContext`:

```ts
// A family's files as the catalog lists them (name and download link), for the property file's yearly history.
// Kept out of familyContext so card inputs, and the hash that decides whether the AI rewrites a card, don't change.
export const familyFiles = internalQuery({
  args: { familyKey: v.string() },
  handler: async (ctx, { familyKey }) => {
    const members = await ctx.db.query("members").withIndex("by_family", (q) => q.eq("familyKey", familyKey)).collect();
    return members.flatMap((m) => (m.files ?? []).map((f) => ({ name: f.name, url: f.url })));
  },
});
```

`convex/build.ts`: change the `cityFamilies` import to `import { ARCHIVES, cityRepresentative, groupCityItems, YEARLY } from "./lib/cityFamilies";`, and add:

```ts
import { assessmentYear } from "./lib/propertyMeasures";
import { layoutOf, yearFiles, type YearFile } from "./lib/propertyYears";
```

Add `withYears` after `withArchive`:

```ts
// The property file's yearly history (spec 2026-10-13-property-history-design §4): each year's file and layout, read
// one request at a time. A year whose columns can't be read or match no layout is skipped, and the build says which.
// ponytail: no pause between the ~21 requests; a year the City refuses (403) is skipped until next week's build.
async function withYears<P extends CityProfile>(ctx: ActionCtx, familyKey: string, profile: P, notes: string[]): Promise<P> {
  const entry = YEARLY[familyKey];
  if (!entry) return profile;
  const files = yearFiles(await ctx.runQuery(internal.buildStore.familyFiles, { familyKey: entry.history }), entry.from);
  const current = Number(assessmentYear(profile.categories));
  const years: YearFile[] = [];
  for (const f of files.filter((x) => x.year !== current)) {
    try {
      const layout = layoutOf(await datastoreFields(f.resourceId));
      if (layout) years.push({ ...f, layout });
      else notes.push(`${familyKey}: ${f.year} file's columns match no known layout; skipped`);
    } catch (e) {
      notes.push(`${familyKey}: ${f.year} file unavailable; skipped (${message(e)})`);
    }
  }
  if (!years.length) { notes.push(`${familyKey}: no yearly property files found`); return profile; }
  const own = layoutOf(profile.columns.map((c) => ({ id: c.name })));
  if (current && own === "classic") years.push({ year: current, resourceId: profile.resourceId, layout: "classic" });
  else notes.push(`${familyKey}: today's file can't join the years (no assessment year or unknown columns)`);
  return { ...profile, years: years.sort((a, b) => a.year - b.year) };
}
```

In `profileCity`, change the line that builds `profile`:

```ts
    const profile = await withYears(ctx, familyKey, await withArchive(familyKey, { ...assembleProfile(familyKey, rid, fields, plan, count, range, tops, Date.now(), points), resourceName }, archiveRid, notes), notes);
```

(`withYears`'s requests run inside the same `try` as the profile's counting queries. A failed `familyFiles` query keeps last week's profile and adds the "profile not updated" note, as other profiling failures do.)

- [ ] **Step 5: Run the tests**

Run: `npx vitest run convex/build.test.ts`
Expected: PASS, including the four new tests and every existing build test.

- [ ] **Step 6: Typecheck and commit**

Run: `npx tsc --noEmit`
Expected: no output.

```bash
git add convex/lib/cityProfile.ts convex/validators.ts convex/buildStore.ts convex/build.ts convex/build.test.ts tests/helpers/cityFixtures.ts
git commit -m "feat: the build stores the property file's yearly files and layouts from 2005

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: The year queries

**Files:**
- Modify: `convex/lib/propertyYears.ts` (add the source and builders), `convex/lib/citySql.ts:26-33,62` (`Built` fields, bad-dates `reason`, export `numberLabel`), `convex/lib/measureSql.ts:11-15,64-75` (`measureColumns`, `MeasureBuilt` fields), `convex/lib/ckan.ts:76-83`
- Test: `tests/lib/propertyYears.test.ts`, `tests/lib/measureSql.test.ts` (existing; must stay green unchanged)

**Interfaces:**
- Consumes: `YearFile`, `LAYOUTS` (Task 1); `CityProfile.years` (Task 2); `YEARLY` (Task 1).
- Produces:
  - `type YearArgs = { years: { from: number; to: number }; from?: string; to?: string; filters?: { column: string; values?: string[]; over?: number; under?: number }[]; groupBy?: string }`
  - `yearSource(p: CityProfile, picked: YearFile[]): string`
  - `buildYearCount(p: CityProfile, a: YearArgs): Built`
  - `buildYearMeasure(p: CityProfile, m: CityMeasure, a: YearArgs): MeasureBuilt`
  - `YEAR_TIMEOUT_MS = 25_000`
  - `Built` ok gains `source?: string; latestYear?: string; timeoutMs?: number`; bad-dates gains `reason?: string`.
  - `MeasureBuilt` ok gains `source?: string; note?: string; latestYear?: string; timeoutMs?: number`.
  - `datastoreSqlPage(sql, timeoutMs?)`, `datastoreSql(sql, timeoutMs?)`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/lib/propertyYears.test.ts`:

```ts
import { buildYearCount, buildYearMeasure, yearSource } from "../../convex/lib/propertyYears";
import { MPROP_RID, type CityProfile } from "../../convex/lib/cityProfile";
import { CITY_MEASURES } from "../../convex/lib/cityMeasures";
import { num } from "../../convex/lib/citySql";

const R05 = "6370d019-f21b-4957-aa86-d38f5e82e138", R21 = "d1b65182-fff9-4400-9476-0aff30a6e0ea", R22 = "a368cfd5-5504-4311-b394-df850da76367", R25 = "9e512b1d-2c64-448f-9e7a-5c2022d5948a";
const P: CityProfile = {
  familyKey: "city:master-property-file-mprop", resourceId: MPROP_RID, columns: [], dateColumn: "CONVEY_DATE", districtColumns: ["GEO_ALDER"],
  categories: [{ column: "YR_ASSMT", values: [{ value: "2026", count: 159556 }] }], rowCount: 159950, minDate: "1900-01-01", maxDate: "2026-09-30",
  namesPeople: true, signature: "s", updatedAt: 0, snapshot: true, currentColumn: "YR_ASSMT", baseColumn: "C_A_TOTAL", tractColumn: "GEO_TRACT",
  numberColumns: ["C_A_TOTAL", "C_A_LAND", "C_A_IMPRV", "BLDG_AREA", "NR_UNITS", "YR_BUILT"],
  years: [
    { year: 2005, resourceId: R05, layout: "classic" }, { year: 2021, resourceId: R21, layout: "classic" },
    { year: 2022, resourceId: R22, layout: "short" }, { year: 2025, resourceId: R25, layout: "long" },
    { year: 2026, resourceId: MPROP_RID, layout: "classic" },
  ],
};
const S22 = `(SELECT '2022' AS "yr", "AssessValu" AS "C_A_TOTAL", "DistrictNa" AS "GEO_ALDER", CASE WHEN "IsOwnerOcc" = '1' THEN 'O' ELSE '' END AS "OWN_OCPD", "PrevNonExemptClass" AS "C_A_CLASS" FROM "${R22}") AS t`;
const V = num("C_A_TOTAL");
const NOTE = "Years are the City's file years; in a few files the City's own assessment-year field reads a year later.";
const DISTRICT = "District lines are redrawn after each census, so a district number can cover a different area in different years.";
const ok = <T extends { ok: boolean }>(b: T) => { if (!b.ok) throw new Error(`expected ok, got ${JSON.stringify(b)}`); return b as Extract<T, { ok: true }>; };

describe("yearSource (K2)", () => {
  it("reads one year's file, renamed to the classic columns", () => {
    expect(yearSource(P, [P.years![2]])).toBe(S22);
  });
  it("reads several years as one table, each tagged, today's file kept to its assessment", () => {
    const s = yearSource(P, P.years!.slice(2));
    expect(s.split(" UNION ALL ")).toHaveLength(3);
    expect(s).toContain(`SELECT '2025' AS "yr", "TotalAssessedValue" AS "C_A_TOTAL", "DistrictName" AS "GEO_ALDER", CASE WHEN "IsOwnerOccupied" = '1' THEN 'O' ELSE '' END AS "OWN_OCPD", "PrevNonExemptClass" AS "C_A_CLASS" FROM "${R25}"`);
    expect(s).toContain(`SELECT '2026' AS "yr", "C_A_TOTAL" AS "C_A_TOTAL", "GEO_ALDER" AS "GEO_ALDER", CASE WHEN "OWN_OCPD" = 'O' THEN 'O' ELSE '' END AS "OWN_OCPD", "C_A_CLASS" AS "C_A_CLASS" FROM "${MPROP_RID}" WHERE "YR_ASSMT" = '2026'`);
  });
  it("refuses a file id that isn't one", () => {
    expect(() => yearSource(P, [{ year: 2022, resourceId: "x'; DROP", layout: "short" }])).toThrow("Not a CKAN resource id");
  });
});

describe("buildYearCount (K2)", () => {
  it("counts one year over a cutoff, out of all assessed, with the file named", () => {
    const b = ok(buildYearCount(P, { years: { from: 2022, to: 2022 }, filters: [{ column: "C_A_TOTAL", over: 200000 }] }));
    expect(b.totalSql).toBe(`SELECT COUNT(*) AS n FROM ${S22} WHERE ${V} > 0 AND ${V} > 200000`);
    expect(b.ofSql).toBe(`SELECT COUNT(*) AS n FROM ${S22} WHERE ${V} > 0`);
    expect(b).toMatchObject({ period: "2022 assessment", filterLabels: ["assessed over $200,000"], source: "From the City's 2022 property file.", note: NOTE, groupLabel: null, timeoutMs: 25_000, tractSql: null, gridSql: null, points: null });
    expect(b.latestYear).toBeUndefined();
  });
  it("groups a span by year, with the headline on the newest year", () => {
    const b = ok(buildYearCount(P, { years: { from: 2021, to: 2026 }, filters: [{ column: "OWN_OCPD", values: ["O"] }] }));
    expect(b.groupLabel).toBe("year");
    expect(b.groupSql).toMatch(/^SELECT "yr" AS g, COUNT\(\*\) AS n FROM \(.+\) AS t WHERE "OWN_OCPD" IN \('O'\) GROUP BY g ORDER BY g DESC LIMIT 24$/);
    expect(b.totalSql).toMatch(/WHERE "OWN_OCPD" IN \('O'\) AND "yr" = '2026'$/);
    expect(b).toMatchObject({ period: "2021 – 2026 assessments", filterLabels: ["owner-occupied"], latestYear: "2026", source: "From the City's yearly property files (2021–2025) and its current file (2026)." });
  });
  it("filters homes by class, and a district across years with the district note", () => {
    const b = ok(buildYearCount(P, { years: { from: 2005, to: 2026 }, filters: [{ column: "C_A_CLASS", values: ["1", "5"] }, { column: "GEO_ALDER", values: ["6"] }] }));
    expect(b.groupSql).toContain(`WHERE "C_A_CLASS" IN ('1', '5') AND "GEO_ALDER" IN ('6')`);
    expect(b.filterLabels).toEqual(["residential", "condominiums", "Aldermanic district 6"]);
    expect(b.note!.startsWith(NOTE)).toBe(true); // the fixture lacks 2006–2020, so the missing-years sentence sits between
    expect(b.note!.endsWith(DISTRICT)).toBe(true);
  });
  it("groups one year by district, and refuses district groups across years", () => {
    expect(ok(buildYearCount(P, { years: { from: 2025, to: 2025 }, groupBy: "GEO_ALDER" })).groupSql).toMatch(/^SELECT "GEO_ALDER" AS g, COUNT\(\*\) AS n FROM .+ GROUP BY g ORDER BY n DESC LIMIT 24$/);
    expect(buildYearCount(P, { years: { from: 2005, to: 2025 }, groupBy: "GEO_ALDER" })).toEqual({ ok: false, status: "bad-column", column: "GEO_ALDER", columns: ["year"] });
  });
  it("names a year missing inside the span (review focus 2)", () => {
    expect(ok(buildYearCount(P, { years: { from: 2005, to: 2021 } })).note).toBe(`${NOTE} The City has no usable file for 2006, 2007, 2008, 2009, 2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020.`);
  });
  it("refuses other columns, values and amounts with the supported list", () => {
    const columns = ["C_A_TOTAL", "GEO_ALDER", "OWN_OCPD", "C_A_CLASS"];
    expect(buildYearCount(P, { years: { from: 2025, to: 2025 }, filters: [{ column: "BLDG_AREA", over: 1000 }] })).toEqual({ ok: false, status: "bad-column", column: "BLDG_AREA", columns });
    expect(buildYearCount(P, { years: { from: 2025, to: 2025 }, filters: [{ column: "LAND_USE", values: ["8810"] }] })).toEqual({ ok: false, status: "bad-column", column: "LAND_USE", columns });
    expect(buildYearCount(P, { years: { from: 2025, to: 2025 }, filters: [{ column: "C_A_CLASS", values: ["7"] }] })).toEqual({ ok: false, status: "choose", column: "C_A_CLASS", asked: "7", choices: ["1", "5"] });
    expect(buildYearCount(P, { years: { from: 2025, to: 2025 }, groupBy: "LAND_USE" })).toEqual({ ok: false, status: "bad-column", column: "LAND_USE", columns: ["year", "GEO_ALDER"] });
  });
  it("refuses bad years, dates with years, and years on a file without them (review focus 3)", () => {
    const bad = (years: { from: number; to: number }, reason?: string) => ({ ok: false, status: "bad-dates", from: String(years.from), to: String(years.to), ...(reason ? { reason } : {}) });
    expect(buildYearCount(P, { years: { from: 2005.5, to: 2010 } })).toEqual(bad({ from: 2005.5, to: 2010 }));
    expect(buildYearCount(P, { years: { from: 2020, to: 2010 } })).toEqual(bad({ from: 2020, to: 2010 }));
    expect(buildYearCount(P, { years: { from: 2010, to: 2020 }, from: "2015-01-01" })).toEqual(bad({ from: 2010, to: 2020 }, "Use years for assessment years; from and to are sale dates."));
    expect(buildYearCount({ ...P, years: null }, { years: { from: 2010, to: 2020 } })).toEqual(bad({ from: 2010, to: 2020 }, "Years apply to the City's property file only."));
  });
  it("clamps a span past today's file, and refuses one wholly outside (review focus 4)", () => {
    expect(ok(buildYearCount(P, { years: { from: 2025, to: 2030 } })).period).toBe("2025 – 2026 assessments (clamped to the files' range)");
    expect(buildYearCount(P, { years: { from: 1990, to: 1999 } })).toEqual({ ok: false, status: "outside-coverage", coverage: "2005 – 2026 assessments", note: "Earlier yearly files use different column layouts, and some years are missing or incomplete." });
  });
});

describe("buildYearMeasure (K2)", () => {
  const m = CITY_MEASURES.find((x) => x.id === "assessed-value")!;
  it("gives the typical home value by year, with the summary row on the newest year", () => {
    const b = ok(buildYearMeasure(P, m, { years: { from: 2005, to: 2026 }, filters: [{ column: "C_A_CLASS", values: ["1", "5"] }] }));
    expect(b.groupLabel).toBe("year");
    expect(b.groupSql).toMatch(/^SELECT y AS g, .+percentile_cont\(0\.5\).+ FROM \(SELECT CASE WHEN .+ AS v, "yr" AS y, "GEO_ALDER" AS d FROM \(.+\) AS t WHERE "C_A_CLASS" IN \('1', '5'\)\) s GROUP BY g ORDER BY g DESC LIMIT 24$/);
    expect(b.allSql).toMatch(/\) s WHERE y = '2026'$/);
    expect(b).toMatchObject({ period: "2005 – 2026 assessments", filterLabels: ["residential", "condominiums"], latestYear: "2026", timeoutMs: 25_000 });
  });
  it("refuses a measure other than assessed value", () => {
    expect(buildYearMeasure(P, CITY_MEASURES.find((x) => x.id === "sale-price")!, { years: { from: 2020, to: 2021 } })).toMatchObject({ ok: false, status: "bad-dates", reason: "Years apply to the City's property file only." });
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/lib/propertyYears.test.ts`
Expected: FAIL — `yearSource`, `buildYearCount`, `buildYearMeasure` are not exported.

- [ ] **Step 3: Small shared changes**

`convex/lib/ckan.ts`:

```ts
export async function datastoreSqlPage<T>(sql: string, timeoutMs = QUERY_TIMEOUT_MS): Promise<{ records: T[]; truncated: boolean }> {
  const r = await action<{ records: T[]; records_truncated?: boolean }>("datastore_search_sql", { sql }, timeoutMs);
  return { records: r.records, truncated: r.records_truncated === true };
}

export async function datastoreSql<T>(sql: string, timeoutMs?: number): Promise<T[]> {
  return (await datastoreSqlPage<T>(sql, timeoutMs)).records;
}
```

`convex/lib/citySql.ts`:
- Change `const numberLabel =` to `export const numberLabel =`.
- In `Built`, append `; source?: string; latestYear?: string; timeoutMs?: number` inside the ok member's braces (after `note: string | null`).
- Change the bad-dates member to `| { ok: false; status: "bad-dates"; from: string; to: string; reason?: string }`.

`convex/lib/measureSql.ts`:
- `MeasureBuilt` ok member becomes:
  `| { ok: true; groupSql: string | null; allSql: string; period: string; filterLabels: string[]; groupLabel: string | null; source?: string; note?: string; latestYear?: string; timeoutMs?: number }`
- Extract the measures list (no change to the SQL it makes):

```ts
// Count, total, median and average of `v` from an inner SELECT; blank, unreadable and (when skipped) $0 values kept apart.
export function measureColumns(skipZero: boolean): string {
  const keep = skipZero ? "v IS NOT NULL AND v <> 0" : "v IS NOT NULL";
  return [
    `SUM(CASE WHEN ${keep} THEN 1 ELSE 0 END) AS n`,
    `SUM(CASE WHEN ${keep} THEN v END) AS total`,
    `percentile_cont(0.5) WITHIN GROUP (ORDER BY CASE WHEN ${keep} THEN v END) AS median`,
    `AVG(CASE WHEN ${keep} THEN v END) AS average`,
    "SUM(CASE WHEN v IS NULL THEN 1 ELSE 0 END) AS unreadable", // blank or unreadable: counted, never dropped
    "SUM(CASE WHEN v = 0 THEN 1 ELSE 0 END) AS zeros",
  ].join(", ");
}
```

  In `buildMeasure`, delete the local `keep` and `measures` declarations and use `const measures = measureColumns(m.skipZero);` in their place.

Run: `npx vitest run tests/lib/measureSql.test.ts`
Expected: PASS, unchanged (the SQL is byte-identical).

- [ ] **Step 4: Implement the source and builders**

Append to `convex/lib/propertyYears.ts`, adding at the top:

```ts
import type { CityMeasure } from "./cityMeasures";
import { YEARLY } from "./cityFamilies";
import { quoteId, type CityProfile } from "./cityProfile";
import { groupLabelFor, lit, MAX_GROUPS, num, numberLabel, RID, type Built } from "./citySql"; // Built: buildYearCount's return type
import { measureColumns, moneyValue, type MeasureBuilt } from "./measureSql";
```

Then:

```ts
export const YEAR_TIMEOUT_MS = 25_000; // the full 2005–2026 span took 7.4 s on 2026-10-13; the default 10 s is too close
export type YearArgs = { years: { from: number; to: number }; from?: string; to?: string; filters?: { column: string; values?: string[]; over?: number; under?: number }[]; groupBy?: string };

const YEAR_COLUMNS = ["C_A_TOTAL", "GEO_ALDER", "OWN_OCPD", "C_A_CLASS"];
const DISTRICT_NOTE = "District lines are redrawn after each census, so a district number can cover a different area in different years.";
const EARLIER = "Earlier yearly files use different column layouts, and some years are missing or incomplete.";
const YEARS_ONLY = "Years apply to the City's property file only.";
const NOT_DATES = "Use years for assessment years; from and to are sale dates.";
// The values each carried fact offers, and how the card names them.
const VALUES: Record<string, { values: string[]; label: (v: string) => string }> = {
  GEO_ALDER: { values: Array.from({ length: 15 }, (_, i) => String(i + 1)), label: (v) => groupLabelFor("GEO_ALDER", v) },
  OWN_OCPD: { values: ["O"], label: () => "owner-occupied" },
  C_A_CLASS: { values: ["1", "5"], label: (v) => (v === "1" ? "residential" : "condominiums") },
};

// One table of the chosen years' files, the four facts under the classic names (spec §5). Today's file keeps only its
// current assessment, as counts without years do. Only fixed text, checked ids and integer years enter the SQL.
export function yearSource(p: CityProfile, picked: YearFile[]): string {
  if (!picked.length) throw new Error("No property files for those years");
  return `(${picked.map((y) => {
    if (!RID.test(y.resourceId)) throw new Error("Not a CKAN resource id");
    if (!Number.isInteger(y.year)) throw new Error("Not an assessment year");
    const c = LAYOUTS[y.layout];
    if (!c) throw new Error("Unknown layout");
    const year = lit(String(y.year));
    const own = `CASE WHEN ${quoteId(c.owner)} = ${lit(c.ownerYes)} THEN 'O' ELSE '' END`;
    const current = y.resourceId === p.resourceId ? ` WHERE "YR_ASSMT" = ${year}` : "";
    return `SELECT ${year} AS "yr", ${quoteId(c.value)} AS "C_A_TOTAL", ${quoteId(c.district)} AS "GEO_ALDER", ${own} AS "OWN_OCPD", ${quoteId(c.cls)} AS "C_A_CLASS" FROM ${quoteId(y.resourceId)}${current}`;
  }).join(" UNION ALL ")}) AS t`;
}

type Scope = { picked: YearFile[]; period: string; source: string | undefined; latest: string | undefined; notes: string[] };
// Refusals shared by counts (Built) and measures (MeasureBuilt); each helper returns only the kinds both can carry.
type BadDates = { ok: false; status: "bad-dates"; from: string; to: string; reason?: string };
type Outside = { ok: false; status: "outside-coverage"; coverage: string; note?: string };
type BadColumn = { ok: false; status: "bad-column"; column: string; columns: string[] };
type Choose = { ok: false; status: "choose"; column: string; asked: string; choices: string[] };

// The years asked, checked and clamped to the stored files; the card's period, source line and notes.
function scope(p: CityProfile, a: YearArgs): Scope | BadDates | Outside {
  const { from, to } = a.years;
  const bad = (reason?: string): BadDates => ({ ok: false, status: "bad-dates", from: String(from), to: String(to), ...(reason ? { reason } : {}) });
  const files = p.years ?? [];
  if (!files.length) return bad(YEARS_ONLY);
  if ((a.from && a.from.trim()) || (a.to && a.to.trim())) return bad(NOT_DATES);
  if (!Number.isInteger(from) || !Number.isInteger(to) || from > to) return bad();
  const lo = files[0].year, hi = files[files.length - 1].year;
  if (to < lo || from > hi) return { ok: false, status: "outside-coverage", coverage: `${lo} – ${hi} assessments`, ...(to < lo ? { note: EARLIER } : {}) };
  const [f, t] = [Math.max(from, lo), Math.min(to, hi)];
  const picked = files.filter((y) => y.year >= f && y.year <= t);
  const clamped = f !== from || t !== to ? " (clamped to the files' range)" : "";
  const period = f === t ? `${f} assessment${clamped}` : `${f} – ${t} assessments${clamped}`;
  const past = picked.filter((y) => y.resourceId !== p.resourceId).map((y) => y.year);
  const now = picked.find((y) => y.resourceId === p.resourceId)?.year;
  const span = past.length ? (past[0] === past[past.length - 1] ? `${past[0]}` : `${past[0]}–${past[past.length - 1]}`) : "";
  const source = !past.length ? undefined
    : past.length === 1 && now === undefined ? `From the City's ${past[0]} property file.`
    : `From the City's yearly property files (${span})${now !== undefined ? ` and its current file (${now})` : ""}.`;
  const have = new Set(picked.map((y) => y.year));
  const missing = Array.from({ length: t - f + 1 }, (_, i) => f + i).filter((y) => !have.has(y));
  const notes = [YEARLY[p.familyKey]?.note ?? "", ...(missing.length ? [`The City has no usable file for ${missing.join(", ")}.`] : [])].filter(Boolean);
  return { picked, period, source, latest: picked.length > 1 ? String(picked[picked.length - 1].year) : undefined, notes };
}

// A values filter on a carried fact: only the values that fact offers get in.
function yearFilter(f: { column: string; values?: string[] }): { ok: true; where: string; labels: string[] } | BadColumn | Choose {
  const col = YEAR_COLUMNS.find((c) => c.toLowerCase() === f.column.toLowerCase());
  const fact = col ? VALUES[col] : undefined;
  if (!col || !fact) return { ok: false, status: "bad-column", column: f.column, columns: YEAR_COLUMNS };
  const asked = (f.values ?? []).map((v) => v.trim());
  const wrong = asked.find((v) => !fact.values.includes(v));
  if (!asked.length || wrong !== undefined) return { ok: false, status: "choose", column: col, asked: wrong ?? "", choices: fact.values.slice(0, 8) };
  const uniq = [...new Set(asked)];
  return { ok: true, where: `${quoteId(col)} IN (${uniq.map(lit).join(", ")})`, labels: uniq.map(fact.label) };
}

function filtersFor(a: YearArgs): { where: string[]; numbers: string[]; labels: string[]; district: boolean } | BadColumn | Choose {
  const where: string[] = [], numbers: string[] = [], labels: string[] = [];
  let district = false;
  for (const f of a.filters ?? []) {
    if (f.over !== undefined || f.under !== undefined) {
      if (f.column.toLowerCase() !== "c_a_total") return { ok: false, status: "bad-column", column: f.column, columns: YEAR_COLUMNS };
      for (const [op, x] of [[">", f.over], ["<", f.under]] as const) {
        if (x === undefined) continue;
        if (!Number.isFinite(x)) return { ok: false, status: "bad-column", column: f.column, columns: YEAR_COLUMNS };
        numbers.push(`${num("C_A_TOTAL")} ${op} ${x}`);
        labels.push(numberLabel("C_A_TOTAL", op === ">" ? "over" : "under", x));
      }
      continue;
    }
    const r = yearFilter(f);
    if (!r.ok) return r;
    where.push(r.where);
    labels.push(...r.labels);
    if (r.where.startsWith('"GEO_ALDER"')) district = true;
  }
  return { where, numbers, labels, district };
}

// The group: a span is always by year (adding years would count each parcel once per year); district for one year only.
function groupFor(a: YearArgs, multi: boolean): { key: '"yr"' | '"GEO_ALDER"' | null; label: "year" | "GEO_ALDER" | null } | BadColumn {
  const asked = a.groupBy?.trim().toLowerCase();
  if (!asked) return multi ? { key: '"yr"', label: "year" } : { key: null, label: null };
  if (asked === "year") return { key: '"yr"', label: "year" };
  if (asked === "geo_alder") return multi ? { ok: false, status: "bad-column", column: a.groupBy!, columns: ["year"] } : { key: '"GEO_ALDER"', label: "GEO_ALDER" };
  return { ok: false, status: "bad-column", column: a.groupBy!, columns: ["year", "GEO_ALDER"] };
}

const where = (parts: string[]) => (parts.length ? ` WHERE ${parts.join(" AND ")}` : "");

export function buildYearCount(p: CityProfile, a: YearArgs): Built {
  const s = scope(p, a);
  if ("ok" in s) return s;
  const fl = filtersFor(a);
  if ("ok" in fl) return fl;
  const multi = s.picked.length > 1;
  const g = groupFor(a, multi);
  if ("ok" in g) return g;
  const table = yearSource(p, s.picked);
  const value = fl.numbers.length ? [`${num("C_A_TOTAL")} > 0`, ...fl.numbers] : [];
  const newest = s.latest ? [`"yr" = ${lit(s.latest)}`] : [];
  const notes = [...s.notes, ...(fl.district && multi ? [DISTRICT_NOTE] : [])];
  return {
    ok: true,
    totalSql: `SELECT COUNT(*) AS n FROM ${table}${where([...fl.where, ...value, ...newest])}`,
    groupSql: g.key ? `SELECT ${g.key} AS g, COUNT(*) AS n FROM ${table}${where([...fl.where, ...value])} GROUP BY g ORDER BY ${g.label === "year" ? "g DESC" : "n DESC"} LIMIT ${MAX_GROUPS}` : null,
    futureSql: null, period: s.period, filterLabels: fl.labels, groupLabel: g.label, overlap: false, dateColumn: null, coverage: null,
    points: null, gridSql: null, tractSql: null, files: "only",
    ofSql: fl.numbers.length ? `SELECT COUNT(*) AS n FROM ${table}${where([...fl.where, `${num("C_A_TOTAL")} > 0`, ...newest])}` : null,
    note: notes.join(" ") || null, timeoutMs: YEAR_TIMEOUT_MS,
    ...(s.source ? { source: s.source } : {}), ...(s.latest ? { latestYear: s.latest } : {}),
  };
}

// The assessed-value measure by year (or by district for one year); its summary row is the newest year (spec §5).
export function buildYearMeasure(p: CityProfile, m: CityMeasure, a: YearArgs): MeasureBuilt {
  const bad = (): MeasureBuilt => ({ ok: false, status: "bad-dates", from: String(a.years.from), to: String(a.years.to), reason: YEARS_ONLY });
  if (m.column !== "C_A_TOTAL") return bad();
  const s = scope(p, a);
  if ("ok" in s) return s.status === "outside-coverage" ? { ok: false, status: "bad-dates", from: String(a.years.from), to: String(a.years.to), reason: `The City's property files here cover ${s.coverage}.${s.note ? ` ${s.note}` : ""}` } : s;
  const fl = filtersFor({ ...a, filters: a.filters?.map(({ column, values }) => ({ column, values })) });
  if ("ok" in fl) return fl;
  const multi = s.picked.length > 1;
  const g = groupFor(a, multi);
  if ("ok" in g) return g;
  const inner = `SELECT ${moneyValue("C_A_TOTAL")} AS v, "yr" AS y, "GEO_ALDER" AS d FROM ${yearSource(p, s.picked)}${where(fl.where)}`;
  const measures = measureColumns(m.skipZero);
  const key = g.label === "year" ? "y" : g.label ? "d" : null;
  const notes = [...s.notes, ...(fl.district && multi ? [DISTRICT_NOTE] : [])];
  return {
    ok: true, period: s.period, filterLabels: fl.labels, groupLabel: g.label,
    allSql: `SELECT ${measures} FROM (${inner}) s${s.latest ? ` WHERE y = ${lit(s.latest)}` : ""}`,
    groupSql: key ? `SELECT ${key} AS g, ${measures} FROM (${inner}) s GROUP BY g ORDER BY ${key === "y" ? "g DESC" : "n DESC"} LIMIT ${MAX_GROUPS}` : null,
    note: notes.join(" "), timeoutMs: YEAR_TIMEOUT_MS,
    ...(s.source ? { source: s.source } : {}), ...(s.latest ? { latestYear: s.latest } : {}),
  };
}
```

Notes for the implementer:
- `"ok" in s` separates a refusal (has `ok: false`) from a `Scope` (no `ok` key). Keep `Scope` free of an `ok` field.
- An outside-coverage measure becomes `bad-dates` with a reason, because `MeasureBuilt` has no outside-coverage member and the measure card already renders bad-dates reasons.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/lib/propertyYears.test.ts tests/lib/measureSql.test.ts tests/lib/citySql.test.ts`
Expected: PASS.

- [ ] **Step 6: Typecheck and commit**

Run: `npx tsc --noEmit`
Expected: no output.

```bash
git add convex/lib/propertyYears.ts convex/lib/citySql.ts convex/lib/measureSql.ts convex/lib/ckan.ts tests/lib/propertyYears.test.ts
git commit -m "feat: property counts and assessed-value measures over assessment years, as one query

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: countRecords takes `years`

**Files:**
- Modify: `convex/city.ts` (imports; `CountResult`; `CountInput`; `countRecords` args; `runMeasure`; `planCount`; `askCity`), `lib/ask/tools.ts:47-62`
- Test: `convex/cityProperty.test.ts`

**Interfaces:**
- Consumes: `buildYearCount`, `buildYearMeasure`, `YearArgs` (Task 3); `datastoreSql(sql, timeoutMs?)` (Task 3); `CityProfile.years` (Task 2).
- Produces:
  - `api.city.countRecords` accepts `years?: { from: number; to: number }`;
  - `CountResult` ok gains `source?: string; latestYear?: string`;
  - `measured` gains `source?: string; note?: string; latestYear?: string`;
  - `countParams.years` in Ask's tool.

- [ ] **Step 1: Write the failing tests**

In `convex/cityProperty.test.ts`, add a `seedYears` helper and a new `describe` at the end:

```ts
const R05 = "6370d019-f21b-4957-aa86-d38f5e82e138", R25 = "9e512b1d-2c64-448f-9e7a-5c2022d5948a";
async function seedYears() {
  const t = await seed();
  await t.run(async (ctx) => {
    const p = await ctx.db.query("cityProfiles").withIndex("by_family", (q) => q.eq("familyKey", "city:master-property-file-mprop")).first();
    await ctx.db.patch(p!._id, { years: [{ year: 2005, resourceId: R05, layout: "classic" }, { year: 2025, resourceId: R25, layout: "long" }, { year: 2026, resourceId: MPROP_RID, layout: "classic" }] });
  });
  return t;
}

describe("countRecords over assessment years (K2)", () => {
  it("counts owner-occupied homes by year, headline on the newest year, with the source line", async () => {
    const t = await seedYears();
    const seen: string[] = [];
    installFakeFetch({ citySql: (sql) => { seen.push(sql); return sql.includes("AS g") ? [{ g: "2026", n: "97471" }, { g: "2025", n: "97185" }, { g: "2005", n: "111877" }] : [{ n: "97471" }]; } });
    const r = await t.withIdentity(reader).action(api.city.countRecords, { code: "H28", years: { from: 2005, to: 2026 }, filters: [{ column: "OWN_OCPD", values: ["O"] }] });
    expect(r).toMatchObject({
      status: "ok", count: 97471, latestYear: "2026", period: "2005 – 2026 assessments", filters: ["owner-occupied"],
      groups: [{ label: "2005", count: 111877 }, { label: "2025", count: 97185 }, { label: "2026", count: 97471 }],
      source: "From the City's yearly property files (2005–2025) and its current file (2026).",
    });
    expect(seen.every((s) => s.includes(" UNION ALL "))).toBe(true);
    expect(JSON.stringify(r)).not.toMatch(/OWNER|TAXKEY|STREET|15TH/);
  });
  it("gives the typical home value by year as a measure", async () => {
    const t = await seedYears();
    const row = (g: string, median: number) => ({ g, n: "137000", total: String(median * 137000), median: String(median), average: String(median), unreadable: "0", zeros: "0" });
    installFakeFetch({ citySql: (sql) => (sql.includes("AS g") ? [row("2026", 205000), row("2025", 191900), row("2005", 110300)] : [{ n: "137000", total: "1", median: "205000", average: "1", unreadable: "0", zeros: "0" }]) });
    const r = await t.withIdentity(reader).action(api.city.countRecords, { code: "H28", years: { from: 2005, to: 2026 }, measure: { id: "assessed-value" }, filters: [{ column: "C_A_CLASS", values: ["1", "5"] }] });
    expect(r).toMatchObject({ status: "measured", groupBy: "year", period: "2005 – 2026 assessments", filters: ["residential", "condominiums"], latestYear: "2026" });
    if (r.status === "measured") expect(r.splits).toContain("year");
  });
  it("refuses years with a neighborhood", async () => {
    const t = await seedYears();
    installFakeFetch({});
    expect(await t.withIdentity(reader).action(api.city.countRecords, { code: "H28", years: { from: 2005, to: 2026 }, neighborhood: "Harambee" })).toMatchObject({ status: "no-locations" });
  });
  it("leaves a count without years exactly as before", async () => {
    const t = await seedYears();
    const seen: string[] = [];
    installFakeFetch({ citySql: (sql) => { seen.push(sql); return [{ n: "83243" }]; } });
    const r = await t.withIdentity(reader).action(api.city.countRecords, { code: "H28", filters: [{ column: "C_A_TOTAL", over: 200000 }] });
    expect(r).toMatchObject({ status: "ok", count: 83243, period: "2026 assessment" });
    expect(seen.some((s) => s.includes("UNION ALL"))).toBe(false);
    if (r.status === "ok") expect(r.source).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run convex/cityProperty.test.ts -t "K2"`
Expected: FAIL. The first three fail with an argument validation error (`years` is not an allowed field). The fourth passes already, since it pins today's behavior.

- [ ] **Step 3: Implement in `convex/city.ts`**

Imports:

```ts
import { buildYearCount, buildYearMeasure } from "./lib/propertyYears";
```

`CountResult` ok member: after `note?: string | null;` add `source?: string; latestYear?: string;`.
`measured` member: after `splits: string[];` add ` source?: string; note?: string; latestYear?: string;`.

`CountInput`:

```ts
export type CountInput = { code: string; neighborhood?: string; from?: string; to?: string; filters?: { column: string; values?: string[]; over?: number; under?: number }[]; groupBy?: string; years?: { from: number; to: number } };
```

`countRecords` args: add `years: v.optional(v.object({ from: v.number(), to: v.number() })),` beside `groupBy`.

`runMeasure`: replace the `buildMeasure` line with

```ts
  const filters = args.filters?.map(({ column, values }) => ({ column, values }));
  const built = args.years ? buildYearMeasure(profile, m, { ...args, years: args.years, filters }) : buildMeasure(profile, m, { ...args, filters }, chicagoDay(Date.now()));
```

In its `try`, pass the timeout: `datastoreSql<Record<string, unknown>>(built.groupSql, built.timeoutMs)` and `datastoreSql<Record<string, unknown>>(built.allSql, built.timeoutMs)`. In the returned object, change `splits:` to `splits: [...m.splits, ...(m.date || args.years ? ["year"] : [])],` and add after it:

```ts
      ...(built.source ? { source: built.source } : {}), ...(built.note ? { note: built.note } : {}), ...(built.latestYear ? { latestYear: built.latestYear } : {}),
```

`planCount`: after the `rowCount === 0` check and before the neighborhood lookup, add:

```ts
  // Assessment years (spec 2026-10-13-property-history-design §5): their own builder; no neighborhoods or maps.
  if (args.years) {
    if (neighborhood?.trim()) return { status: "no-locations" as const, code: data.code, name };
    const built = buildYearCount(profile, { ...args, years: args.years });
    if (!built.ok) {
      const { ok: _ok, ...refusal } = built;
      return { ...refusal, code: data.code, name };
    }
    return { data, profile, found: null, built };
  }
```

`askCity`, citywide path:
- Pass `built.timeoutMs` as the second argument to `datastoreSql` for `built.totalSql`, `built.groupSql` and `built.ofSql`.
- In the returned ok object, after `note: built.note,` add:

```ts
      ...(built.source ? { source: built.source } : {}), ...(built.latestYear ? { latestYear: built.latestYear } : {}),
```

- [ ] **Step 4: Ask's tool argument**

`lib/ask/tools.ts`, in `countParams` after `groupBy`:

```ts
  years: z.object({ from: z.number().int(), to: z.number().int() }).optional()
    .describe("City Master Property File (MPROP) only: assessment years, e.g. {from: 2005, to: 2026}. Not dates; from/to on that file are sale dates. Several years are grouped by year."),
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run convex/cityProperty.test.ts convex/city.test.ts convex/cityMeasures.test.ts tests/lib`
Expected: PASS.

- [ ] **Step 6: Typecheck and commit**

Run: `npx tsc --noEmit`
Expected: no output.

```bash
git add convex/city.ts lib/ask/tools.ts convex/cityProperty.test.ts
git commit -m "feat: countRecords takes assessment years for the property file

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: The cards

**Files:**
- Modify: `ui/lib/askCount.ts:2-11`, `ui/components/AskCards.tsx` (CountCard figure and summary; MeasureCard "All" row), `ui/lib/measureText.ts` (summary, notes), `ui/lib/cardExport.ts` (count "Total" label; measure "All" row)
- Test: `tests/ui/ask.test.ts`, `tests/ui/cardExport.test.ts`, and the file that tests `measureText` (find it with `grep -rln "measureSummary" tests`)

**Interfaces:**
- Consumes: `CountResult` ok `source?`, `latestYear?`; `measured` `source?`, `note?`, `latestYear?` (Task 4).
- Produces: card wording only.

- [ ] **Step 1: Write the failing tests**

In `tests/ui/ask.test.ts` (inside the `countCoverage` describe):

```ts
  it("uses the year source line when there is one (K2)", () => {
    expect(countCoverage({ dateColumn: null, coverage: null, resourceName: null, source: "From the City's 2015 property file." })).toBe("From the City's 2015 property file.");
  });
```

In the measureText tests file:

```ts
  it("starts the summary with the newest year and adds the source and note lines across years (K2)", () => {
    const r = { ...base, period: "2005 – 2026 assessments", groupBy: "year", latestYear: "2026", source: "From the City's yearly property files (2005–2025) and its current file (2026).", note: "Years are the City's file years; in a few files the City's own assessment-year field reads a year later." } as MeasureOk;
    expect(measureSummary(r).startsWith("In 2026, ")).toBe(true);
    expect(measureNotes(r)).toEqual(expect.arrayContaining([r.source, r.note]));
  });
```

`base` is whatever measured fixture that file already uses. Build `r` from it.

In `tests/ui/cardExport.test.ts`:

```ts
  it("labels a year span's total with its newest year and drops the measure's All row (K2)", () => {
    // count: use the file's existing count fixture with latestYear "2026"
    expect(countExport({ ...countFixture, latestYear: "2026" } as never, ctx).rows[0][0]).toBe("Total (2026)");
    // measure: no "All" row across years
    expect(measureExport({ ...measureFixture, latestYear: "2026" } as never, ctx).rows.some((row) => row[0] === "All")).toBe(false);
  });
```

Use that file's existing fixture names and `ctx`, and the real name of the count export function (the one building `["Total", r.count]` at `ui/lib/cardExport.ts:202`).

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/ui`
Expected: the new tests FAIL: the source is ignored, the summary has no year, and the label is "Total".

- [ ] **Step 3: Implement**

`ui/lib/askCount.ts`:

```ts
export function countCoverage(r: { dateColumn: string | null; coverage: string | null; resourceName: string | null; files?: "only" | "current" | "archive" | "both"; source?: string }): string | null {
  if (r.source) return [r.dateColumn ? `Counted by ${r.dateColumn}.` : null, r.source].filter(Boolean).join(" ");
  // …the existing body, unchanged…
```

`ui/components/AskCards.tsx`, CountCard:

```tsx
      {r.of && <p className={styles.tractSummary} data-summary>{propertyCountSummary({ ...r, of: r.of, period: r.latestYear ? `${r.latestYear} assessment` : r.period })}</p>}
      <p className={styles.countFigure} data-count>{r.count.toLocaleString("en-US")}{r.latestYear ? ` in ${r.latestYear}` : ""}</p>
```

MeasureCard: wrap the "All" `<tr>` as `{!r.latestYear && (<tr>…existing All row…</tr>)}`.

`ui/lib/measureText.ts`:
- In `measureSummary`, change the `head` line's start: `const lead = r.latestYear ? \`In ${r.latestYear}, \` : "";` and prefix both branches of `head` with `${lead}`.
- In `measureNotes`, after the `Period:` line: `...(r.source ? [r.source] : []), ...(r.note ? [r.note] : []),`.

`ui/lib/cardExport.ts`:
- Count rows: `[r.latestYear ? \`Total (${r.latestYear})\` : "Total", r.count]`.
- Measure rows: make the "All" row `...(r.latestYear ? [] : [{ label: "All", … }])`.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/ui`
Expected: PASS.

- [ ] **Step 5: Typecheck and commit**

Run: `npx tsc --noEmit`
Expected: no output.

```bash
git add ui/lib/askCount.ts ui/components/AskCards.tsx ui/lib/measureText.ts ui/lib/cardExport.ts tests/ui
git commit -m "feat: year cards name their files, put the headline on the newest year, and drop the summed All row

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Ask uses years; live check; browser and graded tests

**Files:**
- Modify: `lib/ask/prompt.ts` (one line near the K1 crime line), `lib/ask/model.ts` (scripted branch and header comment), `scripts/ask-questions.ts`, `e2e/ask.spec.ts`
- Test: `tests/lib/ask*.test.ts` if a prompt snapshot exists (`grep -rln "City crime counts reach back" tests`); otherwise none.

**Interfaces:**
- Consumes: `countParams.years` (Task 4); measure card (Task 5).

- [ ] **Step 1: Prompt line**

In `lib/ask/prompt.ts`, after the line beginning "- City crime counts reach back to 2005":

```
- The City's Master Property File (MPROP) has yearly assessments 2005–2026. For change over time, make one countRecords call with years {from, to} (assessment years, not from/to, which are sale dates); several years come back by year. Typical home value is measure assessed-value with C_A_CLASS 1 and 5 (residential and condominiums); owner-occupied is OWN_OCPD O. Districts across several years: filter one district and group by year.
```

If a test pins the prompt text (found with the grep above), update it in the same step and run it.

- [ ] **Step 2: Scripted model branch**

In `lib/ask/model.ts`:
- Change `const property = question.includes("over 200000") || question.includes("home values");` to also include `|| question.includes("since 2005")`.
- Change the `next` ternary to:

```ts
        const next = question.includes("over 200000")
          ? call("countRecords", { code, filters: [{ column: "C_A_TOTAL", over: 200000 }], groupBy: "GEO_ALDER" })
          : question.includes("since 2005")
          ? call("countRecords", { code, years: { from: 2005, to: 2026 }, measure: { id: "assessed-value" }, filters: [{ column: "C_A_CLASS", values: ["1", "5"] }] })
          : call("relateTracts", { a: { code, column: "median_value" }, b: { code: "H04", column: "per_broadband" }, place: "County", year: "2023", mode: "relate" });
```

Add to the header comment: `"since 2005" → the same search, then countRecords assessed-value by year 2005–2026, residential and condominiums;`.

- [ ] **Step 3: Graded question and browser test**

`scripts/ask-questions.ts`, after the robberies-by-year line:

```ts
  { q: "How has the typical home value in Milwaukee changed each year since 2005?", tool: "countRecords", expect: { status: "measured", year: "2005", homes: "condominiums" }, final: true },
```

`e2e/ask.spec.ts`, inside `signed in`, after the crime-across-years test:

```ts
  test("a property question across years reads the yearly files", async ({ page }) => {
    test.skip(!(await page.request.get("https://data.milwaukee.gov/api/3/action/status_show").then((r) => r.ok()).catch(() => false)), "City API unreachable");
    await ask(page, "How has the typical home value changed each year since 2005?");
    const card = page.locator("[data-card=measure]:visible");
    await expect(card).toBeVisible({ timeout: 60_000 });
    await expect(card.getByRole("rowheader", { name: "2005", exact: true })).toBeVisible();
    await expect(card).toContainText("From the City's yearly property files (2005–2025) and its current file (2026).");
  });
```

- [ ] **Step 4: Unit suite, typecheck, commit**

Run: `npx vitest run > /tmp/k2-suite.txt 2>&1; tail -5 /tmp/k2-suite.txt` (use the workspace path the executing skill gives instead of /tmp).
Expected: all files pass.
Run: `npx tsc --noEmit`
Expected: no output.

```bash
git add lib/ask/prompt.ts lib/ask/model.ts scripts/ask-questions.ts e2e/ask.spec.ts
git commit -m "feat: Ask asks the property file by assessment year; scripted, browser and graded checks

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 5: Live check on dev (needs Tarik's OK before the push)**

Ask Tarik before pushing to dev Convex. After the OK:

```bash
npx convex dev --once
npx convex run build:reprofileCity '{"familyKey":"city:master-property-file-mprop"}'
```

Expected: `[]`, or notes naming only years the City refused. Then read the stored years:

```bash
npx convex data cityProfiles --limit 300 --format jsonLines | python3 -c "import sys,json; [print([y['year'] for y in d.get('years') or []]) for d in map(json.loads, sys.stdin) if d.get('familyKey')=='city:master-property-file-mprop']"
```

Expected: 2005 through 2026, 22 years.

Then run the checks through the City directly with the builder's SQL. Use `scripts/` with tsx: build the SQL with `buildYearCount`/`buildYearMeasure` on the stored profile, fetch it, and print it. Expected values, from the City on 2026-10-13:
- **Owner-occupied:** 2021 = 93,220; 2022 = 93,369.
- **Over $200k:** 2025 = 75,204.
- **Median of all parcels with a value** (no class filter): 2005 ≈ 110,300; 2015 ≈ 89,600; 2025 ≈ 191,900. `skipZero` drops $0 parcels, so medians may differ slightly from the exploration's, which kept zeros. Record both.
- **Typical home value** (class 1 and 5) by year: record it, and check there's no jump at 2021→2022 that the revaluation doesn't explain.
- **Timing:** the full span, for the count and for the measure.

Record the numbers in the ledger.

- [ ] **Step 6: e2e locally, if the Clerk test user signs in; otherwise rely on CI**

Run: `set -a; . ./.env.local; set +a; npx playwright test e2e/ask.spec.ts -g "property question across years"`
Expected: PASS on desktop and phone, or the known local Clerk sign-in hang (then CI on the preview is the check).

- [ ] **Step 7: Graded real-AI question (needs Tarik's OK; about $0.10)**

Run: find the question's number with `npx tsx -e "import { QUESTIONS } from './scripts/ask-questions'; console.log(QUESTIONS.findIndex(q => q.q.includes('since 2005')) + 1)"` (use the export's real name), then run the report card with `--only=<n>`.
Expected: pass.

---

### Task 7: Docs

**Files:**
- Create: `docs/decisions/040-property-history.md`
- Modify: `ui/components/HowItWorks.tsx` (one sentence after the crime sentence), `e2e/how.spec.ts`, `docs/research/2026-10-12-questions-by-audience.md`

- [ ] **Step 1: Failing browser test**

`e2e/how.spec.ts`:

```ts
test("it says property questions compare yearly assessments from 2005", async ({ page }) => {
  await page.goto("/how-it-works");
  await expect(page.getByText(/Property questions can compare the City's yearly assessments from 2005/)).toBeVisible();
});
```

Run: `npx playwright test e2e/how.spec.ts -g "yearly assessments"`
Expected: FAIL (text not found).

- [ ] **Step 2: The sentence**

In `ui/components/HowItWorks.tsx`, after the sentence "Crime counts reach back to 2005…", add (in the same paragraph style):

"Property questions can compare the City's yearly assessments from 2005, citywide and by aldermanic district, by reading one property file per year."

Run: `npx playwright test e2e/how.spec.ts`
Expected: PASS.

- [ ] **Step 3: Decision 040**

`docs/decisions/040-property-history.md`, in the decision format (Decision / Why this came up / Options / What we chose and why / What we gave up / How we'll know / What actually happened, left blank). Content, from the spec:
- **Decision:** read the City's yearly property files 2005–2026 as one query, by file year, citywide and by district.
- **Options:**
  - one query over the years (chosen);
  - one request per year (City blocks bursts);
  - precomputed yearly figures (instant but fixed).
- **File year over the City's year field:** the field repeats four years and skips four. The file names run in order and peak in 2008, matching the housing crash. Called by Tarik and Claude jointly.
- **2005 start:** before 2005, two other layouts alternate; 1994 doesn't answer, 1981 is missing, and 1989 has 1,750 rows.
- **No neighborhoods:** 2022–2025 have no tract, and tract numbers change in 2010 and 2020.
- **Across years, grouped by year and headline on the newest year:** adding years would count parcels once per year.
- **Given up:**
  - neighborhoods over time;
  - pre-2005 history;
  - columns beyond four;
  - about 7 seconds per full-span question.
- **How we'll know:** owner-occupied counts are continuous across the 2021/2022 layout switch (93,220 → 93,369), and the graded question passes.

Define "assessment", "layout" and "UNION ALL" inline on first use.

- [ ] **Step 4: Questions document**

In `docs/research/2026-10-12-questions-by-audience.md`:
- In the Housing table, add the row: `| How has the typical home value changed since 2005? | Master Property File (yearly files) | **Now** (by year, citywide or one district) |`.
- In gap 6, replace "the property file by year (K2–K4)" wording so it says the property file by year is done (K2, 2005 onward, citywide and by district, decision 040), and that stop-and-search and elections remain (K3–K4).

- [ ] **Step 5: Commit**

```bash
git add docs/decisions/040-property-history.md ui/components/HowItWorks.tsx e2e/how.spec.ts docs/research/2026-10-12-questions-by-audience.md
git commit -m "docs: decision 040, How it works and the questions list for property history

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```
