# Crime History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** City crime counts reach back to 2005 by reading the City's Historical and Current crime files as one table, while 311 stays on its Current file and says why.

**Architecture:**
- A hand-kept `ARCHIVES` list names the file pairs.
- When crime's Current file is profiled, the build checks that its Historical file has the same columns, then stores `archive: { resourceId, before }` on the profile and moves `minDate` to 2005-01-01.
- `buildCount` settles the period first, then picks its source: Current, Historical, or `(Historical before the seam UNION ALL Current) AS t`. Every SQL string it builds uses that source.

**Tech Stack:** Convex (actions, convex-test), CKAN `datastore_search_sql` (PostgreSQL), Next.js 16, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-12-crime-history-design.md`

## Global Constraints

**`ARCHIVES` entries, verbatim:**
- crime: `{ join: true, from: "2005-01-01", note: "The City's crime records are complete from 2005; earlier years hold only a few stray records." }`
- 311: `{ join: false, note: "The City's earlier 311 file (2020–2025) is missing most requests after November 2020, so counts here start in 2026." }`

**Joining:**
- An archive is joined only when its sorted column names equal the Current profile's `signature`. Otherwise the build note reads "<familyKey>: Historical file's columns differ; counting the Current file only".
- `archive.before` is Current's own first date (its `minDate` before the move). Historical rows count only when `"<date column>" < '<before>'`. Dates are ISO text, compared as text, the same as `buildCount`'s period filter.

**Scope:**
- `buildMeasure` and `buildSpan` never read an archive.
- A profile without `archive` builds byte-identical SQL to today.
- The crime note appears only when the profile has an archive. The 311 note appears whenever a count's period reaches before its file's start.

**Card wording:** `countCoverage` says "from the City's Historical and Current files" for both files and "from the City's Historical file" for the archive alone. The Current file alone keeps "from the City's '<resourceName>' file".

**Project rules:**
- Every dev Convex push and every dev data run needs Tarik's explicit OK.
- Never stage `.superpowers/` or `clerk-creamcityalmanac.app.zone`.
- Commit trailer: `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

**Plan rulings on the spec's open details:**
1. Build notes name the family by its key ("city:nibrs-crime-data: …"); the profiling step doesn't carry the display name.
2. Coverage wording uses a new `files` field on the count result, not a made-up `resourceName`. The card's existing sentence takes a file *name*.

## Review Focus

1. **A count across the seam with a neighborhood:** the points SQL and the "no location" SQL must both read the combined source, so Harambee 2019–2025 includes 2019. (Test: Task 1.)
2. **A record that appears in both files** (the City re-publishing 2024 rows in Historical later) is counted once, through the seam filter. (Test: Task 1 checks the filter's presence; the reviewer checks there's no other path.)
3. **The City changes one file's columns:** no join, a note, Current-only counts. Never a mixed-layout UNION, which the City's PostgreSQL would reject at query time with a confusing error. (Test: Task 2.)
4. **A 311 count with no dates** keeps today's numbers and gains the note, never a silently different window. (Test: Task 1.)
5. **A crime count with no dates** stays the last 12 months and Current-only, with no note and no Historical read. (Test: Task 1.)

---

### Task 1: Pick the source (pure)

**Files:**
- Modify: `convex/lib/cityFamilies.ts` (add `ARCHIVES`, `cityNote`)
- Modify: `convex/lib/cityProfile.ts` (`CityProfile.archive`)
- Modify: `convex/lib/citySql.ts` (`Files`, `sourceFor`, `buildCount` uses it; `files` on the result; `note` on outside-coverage)
- Test: `tests/lib/citySql.test.ts`, `tests/lib/cityFamilies.test.ts`, `tests/lib/measureSql.test.ts`, `tests/lib/spanSql.test.ts` (append)

**Interfaces:**
- Produces:
  - `ARCHIVES: Record<string, { join: true; from: string; note: string } | { join: false; note: string }>`
  - `cityNote(familyKey: string): string | null`, which gives `CITY_NOTES` first, else a `join: false` entry's note
  - `CityProfile.archive?: { resourceId: string; before: string } | null`
  - `type Files = "current" | "archive" | "both"`
  - `sourceFor(p: CityProfile, from: string, to: string): { table: string; files: Files }`
  - `Built`'s ok member gains `files: Files`; its `outside-coverage` member gains `note?: string`

- [ ] **Step 1: Write the failing tests**

Append to `tests/lib/citySql.test.ts` (add `sourceFor` to its import from `citySql`):

```ts
describe("crime history (K1)", () => {
  const HIST = "11111111-2222-3333-4444-555555555555";
  const A: CityProfile = { ...P, minDate: "2005-01-01", archive: { resourceId: HIST, before: "2024-01-01" } };
  const BOTH = `(SELECT * FROM "${HIST}" WHERE "Incident_Date" < '2024-01-01' UNION ALL SELECT * FROM "${RID}") AS t`;
  const NOTE = "The City's crime records are complete from 2005; earlier years hold only a few stray records.";
  it("reads only the Current file after the seam, exactly as before", () => {
    const b = buildCount(A, { from: "2025-01-01", to: "2025-12-31" }, TODAY);
    if (!b.ok) throw new Error("expected ok");
    expect(b.totalSql).toBe(`SELECT COUNT(*) AS n FROM "${RID}" WHERE "Incident_Date" >= '2025-01-01' AND "Incident_Date" < '2026-01-01'`);
    expect(b.files).toBe("current");
  });
  it("reads only the Historical file before the seam", () => {
    const b = buildCount(A, { from: "2019-01-01", to: "2019-12-31" }, TODAY);
    if (!b.ok) throw new Error("expected ok");
    expect(b.totalSql).toBe(`SELECT COUNT(*) AS n FROM "${HIST}" WHERE "Incident_Date" >= '2019-01-01' AND "Incident_Date" < '2020-01-01'`);
    expect(b.files).toBe("archive");
  });
  it("reads both as one table across the seam, Historical rows only before Current's first date", () => {
    const b = buildCount(A, { from: "2019-01-01", to: "2024-12-31", groupBy: "year" }, TODAY);
    if (!b.ok) throw new Error("expected ok");
    expect(b.totalSql).toBe(`SELECT COUNT(*) AS n FROM ${BOTH} WHERE "Incident_Date" >= '2019-01-01' AND "Incident_Date" < '2025-01-01'`);
    expect(b.groupSql).toContain(`FROM ${BOTH} WHERE`);
    expect(b.files).toBe("both");
    expect(b.coverage).toBe("Jan 1, 2005 – Oct 9, 2026"); // a live file's range runs to today, as in the existing tests
  });
  it("puts a neighborhood's points, its unplaced count and the citywide grid on the same source", () => {
    const L: CityProfile = { ...A, latColumn: "Address_Latitude", lonColumn: "Address_Longitude" };
    const b = buildCount(L, { from: "2019-01-01", to: "2025-06-30" }, TODAY, { minLat: 43.06, maxLat: 43.08, minLon: -87.95, maxLon: -87.93 });
    if (!b.ok) throw new Error("expected ok");
    expect(b.points?.sql).toContain(`FROM ${BOTH} WHERE`);
    expect(b.points?.missingSql).toContain(`FROM ${BOTH} WHERE`);
    expect(b.gridSql).toContain(`FROM ${BOTH} WHERE`);
  });
  it("clamps a request before 2005 with the note, and refuses one entirely before 2005 with it", () => {
    const b = buildCount(A, { from: "1995-01-01", to: "2006-12-31" }, TODAY);
    if (!b.ok) throw new Error("expected ok");
    expect(b.totalSql).toContain(`"Incident_Date" >= '2005-01-01'`);
    expect(b.period).toBe(`Jan 1, 2005 – Dec 31, 2006 (clamped to the data's range; ${NOTE})`);
    expect(buildCount(A, { from: "1995-01-01", to: "1999-12-31" }, TODAY)).toEqual({ ok: false, status: "outside-coverage", coverage: "Jan 1, 2005 – Oct 9, 2026", note: NOTE });
  });
  it("keeps a crime count with no dates on the last 12 months of the Current file, with no note", () => {
    const b = buildCount(A, {}, TODAY);
    if (!b.ok) throw new Error("expected ok");
    expect(b.files).toBe("current");
    expect(b.period).toBe("Oct 9, 2025 – Oct 9, 2026 (last 12 months)");
  });
  it("gives no crime note before the profile has its archive", () => {
    expect(buildCount(P, { from: "2019-01-01", to: "2020-01-01" }, TODAY)).toEqual({ ok: false, status: "outside-coverage", coverage: "Jan 1, 2024 – Oct 9, 2026" });
  });
  it("adds the 311 note when a count reaches before its file's start, without changing the window", () => {
    const C: CityProfile = { ...P, familyKey: "city:call-center-data", dateColumn: "CREATIONDATE", minDate: "2026-01-01", maxDate: "2026-10-08", categories: [] };
    const b = buildCount(C, {}, TODAY);
    if (!b.ok) throw new Error("expected ok");
    expect(b.files).toBe("current");
    expect(b.totalSql).toContain(`"CREATIONDATE" >= '2026-01-01'`);
    expect(b.period).toContain("The City's earlier 311 file (2020–2025) is missing most requests after November 2020, so counts here start in 2026.");
  });
  it("sourceFor leaves a profile without an archive on its own file", () => {
    expect(sourceFor(P, "2019-01-01", "2025-01-01")).toEqual({ table: `"${RID}"`, files: "current" });
  });
});
```

Append to `tests/lib/cityFamilies.test.ts` (add `cityNote` to its import from `../../convex/lib/cityFamilies`):

```ts
describe("City dataset notes", () => {
  it("keeps the hand-written note first, and falls back to the 311 archive note", () => {
    expect(cityNote("city:nibrs-crime-data")).toMatch(/WIBR/);
    expect(cityNote("city:call-center-data")).toBe("The City's earlier 311 file (2020–2025) is missing most requests after November 2020, so counts here start in 2026.");
    expect(cityNote("city:vacant-buildings")).toBeNull();
  });
});
```

Append to `tests/lib/measureSql.test.ts`:

```ts
describe("archives (K1)", () => {
  it("never reads an archive", () => {
    const m = CITY_MEASURES.find((x) => x.familyKey === base().familyKey)!;
    const b = buildMeasure(base({ archive: { resourceId: "11111111-2222-3333-4444-555555555555", before: "2024-01-01" } }), m, {}, TODAY);
    expect(JSON.stringify(b)).not.toContain("11111111-2222-3333-4444-555555555555");
  });
});
```

Append to `tests/lib/spanSql.test.ts`:

```ts
describe("archives (K1)", () => {
  it("never reads an archive", () => {
    const b = buildSpan({ ...FIRE, archive: { resourceId: "11111111-2222-3333-4444-555555555555", before: "2021-06-01" } }, arrive, {}, TODAY);
    expect(JSON.stringify(b)).not.toContain("11111111-2222-3333-4444-555555555555");
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/lib/citySql.test.ts tests/lib/cityFamilies.test.ts tests/lib/measureSql.test.ts tests/lib/spanSql.test.ts`
Expected: FAIL: `sourceFor` and `cityNote` aren't exported; `files` is undefined. TypeScript may flag `archive` as an unknown property, but Vitest doesn't type-check, so the run shows the assertion failures. The measure and span tests already pass: they pin behavior that must not change. Note that in the ledger.

- [ ] **Step 3: Implement**

In `convex/lib/cityFamilies.ts`, after `CITY_NOTES`:

```ts
// City datasets split into a "(Current)" and a "(Historical)" file (spec 2026-10-12-crime-history-design §4). `join`
// reads both as one table from `from`; otherwise the note says why the older file isn't counted.
// ponytail: hand-kept; add a pair only after checking by hand that its columns and codes match and from when the
// archive is complete.
export const ARCHIVES: Record<string, { join: true; from: string; note: string } | { join: false; note: string }> = {
  "city:nibrs-crime-data": { join: true, from: "2005-01-01", note: "The City's crime records are complete from 2005; earlier years hold only a few stray records." },
  "city:call-center-data": { join: false, note: "The City's earlier 311 file (2020–2025) is missing most requests after November 2020, so counts here start in 2026." },
};

// The line a dataset's page shows under its name: the hand-written note, else why an older file isn't counted.
export function cityNote(familyKey: string): string | null {
  if (Object.hasOwn(CITY_NOTES, familyKey)) return CITY_NOTES[familyKey];
  const a = ARCHIVES[familyKey];
  return a && !a.join ? a.note : null;
}
```

In `convex/lib/cityProfile.ts`'s `CityProfile`, after `resourceName?`:

```ts
  archive?: { resourceId: string; before: string } | null; // an older file read with this one for rows dated before `before` (ARCHIVES)
```

In `convex/lib/citySql.ts`:
- add `import { ARCHIVES } from "./cityFamilies";`;
- extend the `Built` type: in the ok member add `files: Files;` after `tractSql: string | null`, and change `| { ok: false; status: "outside-coverage"; coverage: string }` to `| { ok: false; status: "outside-coverage"; coverage: string; note?: string }`;
- add, above `buildCount`:

```ts
export type Files = "current" | "archive" | "both";
// The table a count reads (spec 2026-10-12-crime-history-design §5): the profiled file, its archive, or both as one,
// with the archive's rows only before the profiled file's first date so nothing is counted twice.
export function sourceFor(p: CityProfile, from: string, to: string): { table: string; files: Files } {
  const a = p.archive;
  if (!a || !p.dateColumn || from >= a.before) return { table: quoteId(p.resourceId), files: "current" };
  if (!RID.test(a.resourceId)) throw new Error("Not a CKAN resource id");
  if (to < a.before) return { table: quoteId(a.resourceId), files: "archive" };
  return { table: `(SELECT * FROM ${quoteId(a.resourceId)} WHERE ${quoteId(p.dateColumn)} < ${lit(a.before)} UNION ALL SELECT * FROM ${quoteId(p.resourceId)}) AS t`, files: "both" };
}

// Why a count stops at its data's start: crime's note only once the archive is read, 311's always.
function startNote(p: CityProfile): string | null {
  const a = ARCHIVES[p.familyKey];
  if (!a) return null;
  return a.join ? (p.archive ? a.note : null) : a.note;
}
```

- in `buildCount`, change `const table = quoteId(p.resourceId);` to:

```ts
  let { table, files } = { table: quoteId(p.resourceId), files: "current" as Files };
```

- in the coverage block, replace

```ts
      if (to < span.min || from > span.max) return { ok: false, status: "outside-coverage", coverage };
      if (from < span.min || to > span.max) {
        from = from < span.min ? span.min : from;
        to = to > span.max ? span.max : to;
        notes.push("clamped to the data's range");
      }
```

with

```ts
      const note = startNote(p);
      if (to < span.min) return { ok: false, status: "outside-coverage", coverage, ...(note ? { note } : {}) };
      if (from > span.max) return { ok: false, status: "outside-coverage", coverage };
      if (from < span.min || to > span.max) {
        const early = from < span.min;
        from = early ? span.min : from;
        to = to > span.max ? span.max : to;
        notes.push("clamped to the data's range");
        if (early && note) notes.push(note);
      }
```

- directly after that `if (span) { … }` block closes, and before `const d = quoteId(p.dateColumn);`, add:

```ts
    ({ table, files } = sourceFor(p, from, to));
```

- in the final `return { ok: true, … }`, add `files` after `tractSql`.

- [ ] **Step 4: Run them to verify they pass**

Run: `npx vitest run tests/lib/citySql.test.ts tests/lib/cityFamilies.test.ts tests/lib/measureSql.test.ts tests/lib/spanSql.test.ts tests/lib/citySqlProperty.test.ts`
Expected: PASS, including every existing citySql test, unchanged (the byte-identical promise for profiles without an archive).

- [ ] **Step 5: Type-check and commit**

Run: `npx tsc --noEmit`
Expected: clean. If `convex/city.ts` passes `built` somewhere typed without `files`, add `files` at the use site in Task 3, and record a ruling now only if tsc fails.

```bash
git add convex/lib/cityFamilies.ts convex/lib/cityProfile.ts convex/lib/citySql.ts tests/lib/citySql.test.ts tests/lib/cityFamilies.test.ts tests/lib/measureSql.test.ts tests/lib/spanSql.test.ts
git commit -m "feat: a crime count reads the Historical and Current files as one table across their seam

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Store the archive on crime's profile

**Files:**
- Modify: `convex/validators.ts` (`vCityProfile.archive`)
- Modify: `convex/build.ts` (`historicalOf`, `withArchive`, `profileCity` and `writeCard` take `archiveRid` and `notes`, `processFamily` merges notes, new `reprofileCity`)
- Modify: `convex/catalog.ts` (`cityInfo` uses `cityNote`)
- Modify: `tests/helpers/fakeFetch.ts` (`cityFieldsFor`)
- Test: `convex/build.test.ts` (append)

**Interfaces:**
- Consumes (Task 1): `ARCHIVES`, `cityNote`, `CityProfile.archive`
- Produces:
  - `internal.build.reprofileCity({ familyKey }) → string[]` (notes)
  - the profile row's `archive` and `minDate`
  - fakeFetch option `cityFieldsFor?: (rid: string) => { id: string; type: string }[] | undefined`

- [ ] **Step 1: Let the fake City describe each file's own columns**

In `tests/helpers/fakeFetch.ts`, add to `FakeOptions` after `cityFields?`:

```ts
  cityFieldsFor?: (rid: string) => { id: string; type: string }[] | undefined; // one file's columns, when files differ
```

and change the `datastore_search` branch to:

```ts
    if (url.includes("data.milwaukee.gov/api/3/action/datastore_search")) {
      const rid = new URL(url).searchParams.get("resource_id") ?? "";
      return json(opts.cityStatus ?? 200, { success: true, result: { fields: [{ id: "_id", type: "int" }, ...(opts.cityFieldsFor?.(rid) ?? opts.cityFields ?? [])], records: [] } });
    }
```

- [ ] **Step 2: Write the failing database tests**

Append to `convex/build.test.ts`:

```ts
describe("crime history (K1)", () => {
  const HIST = "11111111-2222-3333-4444-555555555555";
  const FIELDS = [{ id: "Incident_Date", type: "text" }, { id: "Police_District", type: "text" }, { id: "Offense_All", type: "text" }];
  const profileOf = (t: TestConvex<typeof schema>) => t.run((ctx) => ctx.db.query("cityProfiles").withIndex("by_family", (q) => q.eq("familyKey", CRIME)).first());

  it("reads crime's Historical file with Current from 2005 when their columns match", async () => {
    const t = convexTest(schema, modules);
    await seedCity(t);
    crimeFake();
    expect(await t.action(internal.build.reprofileCity, { familyKey: CRIME })).toEqual([]);
    expect(await profileOf(t)).toMatchObject({ resourceId: CRIME_CURRENT_RID, minDate: "2005-01-01", archive: { resourceId: HIST, before: "2024-01-01" } });
  });
  it("counts Current alone, and says why, when the Historical file's columns differ", async () => {
    const t = convexTest(schema, modules);
    await seedCity(t);
    installFakeFetch({ cityFields: FIELDS, cityFieldsFor: (rid) => (rid === HIST ? [{ id: "Incident_Date", type: "text" }] : undefined), citySql: crimeSql });
    expect(await t.action(internal.build.reprofileCity, { familyKey: CRIME })).toEqual([`${CRIME}: Historical file's columns differ; counting the Current file only`]);
    const p = await profileOf(t);
    expect(p?.archive ?? null).toBeNull();
    expect(p?.minDate).toBe("2024-01-01");
  });
  it("re-profiles without asking the AI for a card", async () => {
    const t = convexTest(schema, modules);
    await seedCity(t);
    const f = crimeFake();
    await t.action(internal.build.reprofileCity, { familyKey: CRIME });
    expect(f.count("/v1/chat/completions")).toBe(0);
  });
  it("the weekly build stores the archive too, and a mismatch reaches the build's notes", async () => {
    const t = convexTest(schema, modules);
    const buildId = await seedCity(t);
    installFakeFetch({ cityFields: FIELDS, cityFieldsFor: (rid) => (rid === HIST ? [{ id: "Incident_Date", type: "text" }] : undefined), citySql: crimeSql });
    await t.action(internal.build.processFamily, { buildId, familyKey: CRIME });
    expect((await buildOf(t, buildId))!.notes.join(" ")).toContain("Historical file's columns differ");
  });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `npx vitest run convex/build.test.ts -t "crime history"`
Expected: FAIL, `internal.build.reprofileCity` is undefined.

- [ ] **Step 4: Implement**

In `convex/validators.ts`'s `vCityProfile`, after `resourceName`:

```ts
  archive: v.optional(v.union(v.object({ resourceId: v.string(), before: v.string() }), v.null())),
```

In `convex/build.ts`:
- import `ARCHIVES` with `cityRepresentative, groupCityItems` from `./lib/cityFamilies`;
- import `type CityProfile` from `./lib/cityProfile` alongside `assembleProfile`.

Add above `profileCity`:

```ts
// A City family's "(Historical)" file, when it has a live one.
const historicalOf = (members: { title: string; datastoreId?: string | null }[]) =>
  members.find((m) => /\(historical\)/i.test(m.title) && m.datastoreId)?.datastoreId ?? null;

// Crime's Historical file, read with Current from ARCHIVES' date (spec 2026-10-12-crime-history-design §4). Joined
// only when its columns match Current's exactly; otherwise the profile counts Current alone and the build says why.
async function withArchive<P extends CityProfile>(familyKey: string, profile: P, archiveRid: string | null, notes: string[]): Promise<P> {
  const entry = ARCHIVES[familyKey];
  if (!entry?.join) return profile;
  if (!archiveRid) { notes.push(`${familyKey}: no Historical file to read with Current`); return profile; }
  if (!profile.minDate || !profile.dateColumn) { notes.push(`${familyKey}: Current file has no dates; counting it alone`); return profile; }
  let fields: { id: string; type: string }[];
  try {
    fields = await datastoreFields(archiveRid);
  } catch (e) {
    notes.push(`${familyKey}: Historical file unavailable; counting the Current file only (${message(e)})`);
    return profile;
  }
  if (fields.map((f) => f.id).sort().join(",") !== profile.signature) {
    notes.push(`${familyKey}: Historical file's columns differ; counting the Current file only`);
    return profile;
  }
  return { ...profile, minDate: entry.from, archive: { resourceId: archiveRid, before: profile.minDate } };
}
```

Change `profileCity`'s signature to

```ts
async function profileCity(ctx: ActionCtx, familyKey: string, rid: string, resourceName: string | null, archiveRid: string | null, notes: string[]): Promise<Column[]> {
```

and its profile line to

```ts
    const profile = await withArchive(familyKey, { ...assembleProfile(familyKey, rid, fields, plan, count, range, tops, Date.now(), points), resourceName }, archiveRid, notes);
```

Change `writeCard(ctx, buildId, familyKey)` to `writeCard(ctx, buildId, familyKey, notes: string[])`, and its `profileCity` call to

```ts
    ? await profileCity(ctx, familyKey, cityRep.datastoreId, cityRep.datastoreName ?? null, historicalOf(members), notes)
```

In `processFamily`'s handler:

```ts
    let result: Result;
    const notes: string[] = [];
    try {
      result = await writeCard(ctx, buildId, familyKey, notes);
    } catch (e) {
      result = { outcome: "failed", note: `${familyKey}: ${message(e)}` };
    }
    const note = [result.note, ...notes].filter(Boolean).join("; ") || undefined;
    await retryOnConflict(() =>
      ctx.runMutation(internal.buildStore.markDone, { buildId, outcome: result.outcome, note }),
    );
```

After `processFamily`, add:

```ts
// One City family's profile, rebuilt without touching its AI-written card: for going live and for dev checks
// (spec 2026-10-12-crime-history-design §4). Returns the build notes.
export const reprofileCity = internalAction({
  args: { familyKey: v.string() },
  handler: async (ctx, { familyKey }): Promise<string[]> => {
    const data = await ctx.runQuery(internal.buildStore.familyContext, { familyKey });
    if (!data) return [`${familyKey}: not in the catalog`];
    const rep = cityRepresentative(data.members);
    if (!rep?.datastoreId) return [`${familyKey}: no live City file`];
    const notes: string[] = [];
    await profileCity(ctx, familyKey, rep.datastoreId, rep.datastoreName ?? null, historicalOf(data.members), notes);
    return notes;
  },
});
```

In `convex/catalog.ts`'s `cityInfo`:
- replace `note: Object.hasOwn(CITY_NOTES, familyKey) ? CITY_NOTES[familyKey] : null,` with `note: cityNote(familyKey),`;
- import `cityNote` from `./lib/cityFamilies`, and drop `CITY_NOTES` from that import if nothing else in the file uses it.

- [ ] **Step 5: Run the tests and the type check**

Run: `npx convex codegen && npx tsc --noEmit && npx vitest run convex/build.test.ts convex/catalog.test.ts`
Expected: PASS, the existing City profile tests included.

- [ ] **Step 6: Commit**

```bash
git add convex/validators.ts convex/build.ts convex/catalog.ts tests/helpers/fakeFetch.ts convex/build.test.ts convex/_generated
git commit -m "feat: crime's profile reads its Historical file from 2005 when the columns match; reprofileCity

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: The count card and Ask

**Files:**
- Modify: `convex/city.ts` (carry `files`; the outside-coverage `note`)
- Modify: `ui/lib/askCount.ts` (`countCoverage` and `outsideCoverage` wording)
- Modify: `lib/ask/prompt.ts`, `lib/ask/model.ts`, `scripts/ask-questions.ts`
- Test: `tests/ui/ask.test.ts` (append), `e2e/ask.spec.ts` (append)

**Interfaces:**
- Consumes (Task 1): `Built.files`, `outside-coverage`'s `note`
- Produces:
  - `CountResult`'s ok member gains `files?: Files`; its `outside-coverage` member gains `note?: string`
  - `countCoverage(r: { dateColumn; coverage; resourceName; files? })`
  - `outsideCoverage(r: { name; coverage; note? })`

- [ ] **Step 1: Write the failing wording tests**

Append to `tests/ui/ask.test.ts`:

```ts
describe("crime history wording (K1)", () => {
  it("names the files a count read", () => {
    expect(countCoverage({ dateColumn: "Incident_Date", coverage: "Jan 1, 2005 – Oct 8, 2026", resourceName: "wibr.csv", files: "both" })).toBe("Counted by Incident_Date. The City's data here covers Jan 1, 2005 – Oct 8, 2026, from the City's Historical and Current files.");
    expect(countCoverage({ dateColumn: "Incident_Date", coverage: "Jan 1, 2005 – Oct 8, 2026", resourceName: "wibr.csv", files: "archive" })).toBe("Counted by Incident_Date. The City's data here covers Jan 1, 2005 – Oct 8, 2026, from the City's Historical file.");
    expect(countCoverage({ dateColumn: "Incident_Date", coverage: "Jan 1, 2005 – Oct 8, 2026", resourceName: "wibr.csv", files: "current" })).toBe("Counted by Incident_Date. The City's data here covers Jan 1, 2005 – Oct 8, 2026, from the City's 'wibr.csv' file.");
  });
  it("says why a period before 2005 has nothing to count", () => {
    expect(outsideCoverage({ name: "NIBRS Crime Data", coverage: "Jan 1, 2005 – Oct 8, 2026", note: "The City's crime records are complete from 2005; earlier years hold only a few stray records." }))
      .toBe("NIBRS Crime Data: the City's data here covers Jan 1, 2005 – Oct 8, 2026, so there is nothing to count for that period. The City's crime records are complete from 2005; earlier years hold only a few stray records.");
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/ui/ask.test.ts -t "crime history"`
Expected: FAIL on the "both" and "archive" strings and on the note.

- [ ] **Step 3: Implement the wording and carry the fields**

Replace `ui/lib/askCount.ts`'s two functions with:

```ts
// What a City count covers, in words for its card: the date it's counted by, the data's range, and the file(s).
export function countCoverage(r: { dateColumn: string | null; coverage: string | null; resourceName: string | null; files?: "current" | "archive" | "both" }): string | null {
  const file = r.files === "both" ? "the City's Historical and Current files"
    : r.files === "archive" ? "the City's Historical file"
    : r.resourceName ? `the City's '${r.resourceName}' file` : null;
  const parts = [
    r.dateColumn ? `Counted by ${r.dateColumn}.` : null,
    r.coverage ? `The City's data here covers ${r.coverage}${file ? `, from ${file}` : ""}.` : file ? `From ${file}.` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" ") : null;
}

export const outsideCoverage = (r: { name: string; coverage: string; note?: string }) =>
  `${r.name}: the City's data here covers ${r.coverage}, so there is nothing to count for that period.${r.note ? ` ${r.note}` : ""}`;
```

In `convex/city.ts`:
- in `CountResult`, add `files?: "current" | "archive" | "both";` to the ok member (after `resourceName: string | null;`), and change `{ status: "outside-coverage"; code: string; name: string; coverage: string }` to `{ status: "outside-coverage"; code: string; name: string; coverage: string; note?: string }`;
- in `askCity`, at each `resourceName: profile.resourceName ?? null,` inside a result built from `buildCount`'s `built`, add `files: built.files,` right after it. The refusal spread in `planCount` already carries `note`.
- if `runMeasure` builds a result with `resourceName` from `buildMeasure`, leave it without `files`; `countCoverage` then reads it as the Current file.

- [ ] **Step 4: Run them to verify they pass**

Run: `npx tsc --noEmit && npx vitest run tests/ui/ask.test.ts convex/city.test.ts`
Expected: PASS.

- [ ] **Step 5: The prompt line, scripted model and graded question**

In `lib/ask/prompt.ts`, after the line that starts `- For City records in a neighborhood`, add:

```
- City crime counts reach back to 2005. For change over several years ("each year since 2019", "2019 vs 2024"), make one countRecords call with from/to covering the years and groupBy year.
```

In `lib/ask/model.ts`, directly before `if (question.includes("robberies") && searched?.output) {`, add:

```ts
      if (question.includes("each year from 2019") && searched?.output) {
        const v = searched.output.type === "json" ? searched.output.value : JSON.parse(String(searched.output.value));
        const code = (v as { rows?: { code: string }[] }).rows?.[0]?.code ?? "P01";
        const stream = [call("countRecords", { code, filters: [{ column: "Offense_All", values: ["robbery"] }], from: "2019-01-01", to: "2024-12-31", groupBy: "year" }), finish("tool-calls")];
        return { stream: simulateReadableStream({ chunks: [{ type: "stream-start" as const, warnings: [] }, ...stream] }) };
      }
```

and add `"each year from 2019" → searchCatalog, then countRecords robbery citywide 2019–2024 by year;` to the keyword comment above `fakeAskModel`.

In `scripts/ask-questions.ts`, after the `boundariesFor` entries:

```ts
  { q: "How many robberies were there in Milwaukee each year from 2019 to 2024?", tool: "countRecords", expect: { status: "ok", label: "2019" }, final: true },
```

Append to `e2e/ask.spec.ts`, inside the describe that holds "a neighborhood count names the City boundary it used":

```ts
  test("a crime count across years reads the Historical and Current files", async ({ page }) => {
    test.skip(!(await page.request.get("https://data.milwaukee.gov/api/3/action/status_show").then((r) => r.ok()).catch(() => false)), "City API unreachable");
    await ask(page, "How many robberies were there in Milwaukee each year from 2019 to 2024?");
    const card = page.locator("[data-card=count]:visible");
    await expect(card).toBeVisible({ timeout: 40_000 });
    await expect(card.locator("[data-coverage]")).toContainText("from the City's Historical and Current files");
    await expect(card.locator("[data-coverage]")).toContainText("Jan 1, 2005");
    await expect(card).toContainText("2019");
  });
```

- [ ] **Step 6: Dev push, re-profile crime on dev, live checks (needs Tarik's OK)**

With Tarik's explicit OK for a dev push and one dev data run:

Run: `npx convex dev --once && npx convex run build:reprofileCity '{"familyKey":"city:nibrs-crime-data"}'`
Expected: `[]`. Then:

Run: `npx convex data cityProfiles --limit 200 --format jsonLines | grep nibrs-crime | python3 -c "import sys,json; p=json.loads(sys.stdin.read()); print(p['minDate'], p['archive'])"`
Expected: `2005-01-01 {'resourceId': '<historical id>', 'before': '2024-01-01'}`.

Live checks, recorded in the ledger. The dev count goes through the signed-in action, so it is called with a test identity:
- Citywide robberies by year, 2019–2024, to confirm six non-zero years: `time npx convex run city:countRecords '{"code":"<crime code>","filters":[{"column":"Offense_All","values":["robbery"]}],"from":"2019-01-01","to":"2024-12-31","groupBy":"year"}' --identity '{"subject":"u1","issuer":"test","tokenIdentifier":"test|u1"}'`. Look the crime code up first with `npx convex data families --limit 300 --format jsonLines | grep nibrs-crime`.
- A Harambee robbery count, 2019–2025, returns a map or a "too-broad" refusal. Either is acceptable; record which.
- A citywide count over 2005–2026 with no filters: record how long it takes.

- [ ] **Step 7: Build and run the browser test**

Run: `npx next build > .superpowers/sdd/2026-10-12-crime-history/build-t3.log 2>&1; echo $?`, serve with `npx next start -p 3100` (in the background), then `(set -a; . ./.env.local; set +a; BASE_URL=http://localhost:3100 npx playwright test e2e/ask.spec.ts -g "crime count across years|neighborhood count names")`
Expected: build 0; both pass on desktop and iPhone 13.

- [ ] **Step 8: The graded real-AI question (needs Tarik's OK, about $0.05)**

Run: `(set -a; . ./.env.local; set +a; npx tsx scripts/ask-report-card.ts --only=<n> --verbose)`, where `<n>` is the new question's 1-based position in `ASK_QUESTIONS`. Count it with `grep -n "q: " scripts/ask-questions.ts` and **check the printed question text before reading the result.**
Expected: PASS, reaching `countRecords` with `from` in 2019 and a "2019" group.

- [ ] **Step 9: Full suite and commit**

Run: `npx vitest run --no-file-parallelism > .superpowers/sdd/2026-10-12-crime-history/suite-t3.log 2>&1; tail -5 .superpowers/sdd/2026-10-12-crime-history/suite-t3.log`
Expected: all pass.

```bash
git add convex/city.ts ui/lib/askCount.ts lib/ask/prompt.ts lib/ask/model.ts scripts/ask-questions.ts tests/ui/ask.test.ts e2e/ask.spec.ts
git commit -m "feat: crime count cards name the files they read; Ask counts change over years in one call

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Docs

**Files:**
- Create: `docs/decisions/039-crime-history.md`
- Modify: `ui/components/HowItWorks.tsx`, `docs/research/2026-10-12-questions-by-audience.md`
- Test: `e2e/how.spec.ts` (append)

- [ ] **Step 1: Write the failing browser test**

```ts
test("it says crime counts reach back to 2005", async ({ page }) => {
  await page.goto("/how-it-works");
  await expect(page.getByText(/Crime counts reach back to 2005/)).toBeVisible();
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `BASE_URL=http://localhost:3100 npx playwright test e2e/how.spec.ts -g "back to 2005" --project=desktop`
Expected: FAIL, the element is not found.

- [ ] **Step 3: Write the docs**

**`ui/components/HowItWorks.tsx`:** directly after the boundaries paragraph (the one containing `map server once a week`), add:

```tsx
            <p>
              Crime counts reach back to 2005: the City publishes its crime records in two files, one from 2024 on and an older
              one, and a count that spans both reads them as one. Earlier years are left out because the City&apos;s older file
              holds only a few stray records before 2005.
            </p>
```

**`docs/research/2026-10-12-questions-by-audience.md`:** replace the gap 6 line

`6. **Files split by period.** Stop-and-search comes as 28 quarterly files and elections as one file per election. Questions across time need them combined.`

with

`6. **Files split by period.** Crime's Current and Historical files are now read together, so crime counts reach back to 2005 (K1, decision 039). Still split: stop-and-search (quarterly packages), elections (one dataset per election) and the property file by year (K2–K4). 311's older file isn't joined, because it is missing most requests from December 2020 to 2025.`

**`docs/decisions/039-crime-history.md`:**

```markdown
# 039: Crime counts read the City's Historical and Current files as one, from 2005; 311's older file isn't joined

**Decision:** When a crime count's period reaches before 2024, the Almanac reads the City's Historical crime file together with its Current one, as a single table in the City's own database, and counts from Jan 1, 2005. The City's 311 files are not joined: counts stay on the 2026 file, with a note saying why.

**Why this came up:** The City publishes crime in two files: "Current" from Jan 1, 2024 and "Historical" before it. Ask only ever read Current, so "robberies in 2019" was refused and "robberies 2022–2024" quietly counted only 2024. Change over time is one of the most common questions about crime. Getting it wrong costs credibility: a count that silently drops years, or one that mixes incomplete years, produces a false trend.

**Options:**
- **One query over both files (chosen).** The City's database reads the two files as one (`UNION ALL`, which it accepts), so totals, breakdowns and maps stay exact. The cost: every count query has to name "the files for this period" instead of one file.
- **Count each file and add in code.** Simple for totals, but medians and "how long" answers can't be added across files, so they'd be wrong or refused across the seam.
- **One file per question.** Smallest, but "2019–2024" would be refused, and comparing years would take two counts.

**What we chose and why (Tarik, 2026-10-12):**
- **Read both files as one,** for crime only.
- **Start at 2005.** The Historical file holds 2 to 140 stray records a year for 1991–2004, then 39,000–75,000 a year. "Crimes in 1995: 6" would be technically true and practically false.
- **Don't join 311.** Its older file holds about 20,000 requests a month in mid-2020, then about 300 a month from December 2020 through 2025, against about 2,900 a month in 2026. Joining it would make a gap in the City's file look like a 90% drop in requests.

**What we gave up:**
- **Crime before 2005,** even the records that exist.
- **311 history** until the City fills its older file.
- **The other split datasets** (stop-and-search quarters, elections, the property file by year) wait for their own projects.

**How we'll know if this was right:**
- A count of robberies by year from 2019 shows every year with a plausible number.
- The 2023/2024 seam shows no jump that isn't in the City's own data.
- A note in the build report flags it if the City ever changes one file's columns.

**What actually happened:**
```

- [ ] **Step 4: Rebuild and run it to verify it passes**

Run: `npx next build > .superpowers/sdd/2026-10-12-crime-history/build-t4.log 2>&1; echo $?`, restart `npx next start -p 3100`, then `BASE_URL=http://localhost:3100 npx playwright test e2e/how.spec.ts`
Expected: build 0; all pass.

- [ ] **Step 5: Commit**

```bash
git add docs/decisions/039-crime-history.md ui/components/HowItWorks.tsx docs/research/2026-10-12-questions-by-audience.md e2e/how.spec.ts
git commit -m "docs: decision 039, How it works and the questions list for crime history

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```
