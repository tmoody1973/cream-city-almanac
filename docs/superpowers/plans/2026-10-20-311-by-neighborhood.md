# 311 Requests by Neighborhood Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ask answers "pothole requests in Arlington Heights this year, next to the city" from stored 311 counts per City neighborhood, Census tract, request type and year, built weekly by geocoding the City's 311 addresses and never storing them.

**Architecture:** The weekly build calls `refresh311`. It schedules one chunk action per 5,000 rows of each 311 file; the scheduled arguments carry offsets only, never addresses. Each chunk:
1. Reads its rows from the City.
2. Geocodes them in one Census batch request.
3. Places each point in a City neighborhood.
4. Upserts tallies into rows tagged with the run's ID.
5. Schedules the next chunk.

The last chunk flips a per-file pointer to the new run in one mutation, so readers switch atomically. The old run's rows are deleted afterward. `count311` reads the live runs.

**Deviation from spec §4 steps 7–8:** spec §4 stages tallies, then swaps one mutation per year. A year can hold more than 15,000 place × type rows (about 190 neighborhoods plus about 300 tracts, times up to about 150 types), and a delete-plus-insert swap of that size passes Convex's per-mutation write limit. Run-tagged rows plus a pointer flip keep the spec's guarantee (readers never see half a year) inside the limit.

**Tech Stack:** Convex (actions, scheduler, convex-test), TypeScript, Vitest, Census geocoder batch API, CKAN datastore SQL, Next.js and CopilotKit Ask cards, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-20-311-by-neighborhood-design.md` (decision 057)

## Global Constraints

- **Never stored:** addresses, points, the `CASECLOSUREREASONDESCRIPTION` column (never selected), per-request rows. Scheduled-function arguments are stored by Convex, so they carry offsets and IDs only.
- **Files:**
  - current: package `callcenterdatacurrent`, resource `bf2b508a-5bfa-49da-8846-d87ffeee020a`
  - historical: package `callcenterdatahistorical`, resource `abdfe983-e856-40cd-bee2-85e78454344a`
- **Columns read:** `_id`, `CREATIONDATE`, `CLOSEDDATETIME`, `OBJECTDESC`, `TITLE`.
- **Geocoder:**
  - Endpoint: `https://geocoding.geo.census.gov/geocoder/geographies/addressbatch`, multipart field `addressFile`, `benchmark=Public_AR_Current`, `vintage=Current_Current`.
  - At most 10,000 addresses per request. We send at most 5,000 distinct addresses.
  - Only one request in flight at a time.
- **Failure rules:**
  - A geocode HTTP failure retries once; a second failure fails the run, and the live counts stay.
  - A chunk whose match rate is below 80% (of rows with a usable address) fails the run.
- **Type groups** (exact `TITLE`s):
  - `potholes` = "Potholes", "Pothole in Alley"
  - `streetlights` = "Street Light Out", "Area Dark"
  - `dumping` = "Large Items Discarded on Private Property", "Scattered Litter and Debris on Private Property"
- **Card caveat, verbatim:** "311 dates have no time of day, so a request closed the same day counts as 0 days."
- **Place lookup** never guesses: `matchName` gives `choose` or `none`. An unknown place never falls back to citywide.
- **Citywide** totals include unplaced rows.
- **Prod:** after merge Tarik runs `npx convex run requests311:refresh311 --prod`. Dev runs need Tarik's explicit OK.

## Review Focus

1. **A year in both files.** At January rollover, the current file may still hold last year while the historical file gains it. Expected: each year is counted from exactly one file. The current file counts only years greater than the historical live run's newest year. Test in Task 5.
2. **The current file is replaced mid-run.** The City refreshes it daily, so offsets shift. Expected: the run compares `resourceModified` at start and at finish; if it changed, the run is marked failed and the old counts stay. Test in Task 4.
3. **Bad dates.** A close date before the creation date, or text that won't parse. Expected: the request counts in `requests`; it counts in `closed` only with a parseable close date; it goes into the days histogram only when days ≥ 0. Test in Task 1.
4. **"Milwaukee" as a street name** ("N MILWAUKEE ST") and addresses with units. Expected: the street part is kept, the unit dropped, and city, state and ZIP taken from the last three parts. Test in Task 1.
5. **A DYCU area name typed as a City neighborhood** ("united community" vs "Arlington Heights"). Expected: a DYCU name answers from its newest tracts and is labeled as a DYCU area. A City name answers from `hood` rows. A name that's both resolves to the City neighborhood, with the DYCU area named in a note. Test in Task 5.

---

## File Structure

| File | Responsibility |
|---|---|
| `convex/lib/requests311.ts` (create) | Pure: address cleaning, batch CSV in and out, dates and days, histograms and medians, type groups |
| `convex/lib/requests311.test.ts` (create) | Its unit tests |
| `convex/lib/censusBatch.ts` (create) | One HTTP call to the batch geocoder, with one retry |
| `convex/schema.ts` (modify) | Tables `requests311`, `requests311Runs` |
| `convex/requests311.ts` (create) | Store mutations, `refresh311`, `countChunk`, shapes page query, `count311` query |
| `convex/requests311.test.ts` (create) | convex-test with stubbed `fetch` (pattern: `convex/health.test.ts`) |
| `convex/build.ts` (modify ~line 404) | Call `refresh311` next to `refreshFire` |
| `lib/ask/tools.ts`, `lib/ask/backend.ts`, `lib/ask/prompt.ts`, `lib/ask/model.ts` (modify) | The `count311` Ask tool |
| `ui/lib/requests311Text.ts`, `ui/components/Requests311Card.tsx` (create) | Card text, export and follow-ups; the card |
| `ui/components/AskCards.tsx`, `ui/lib/shareCard.ts`, `ui/lib/askNotes.ts` (modify) | Register the card, make it shareable, mark it as analysis |
| `e2e/ask.spec.ts` (modify) | Scripted Ask question draws the card |

---

### Task 1: Pure 311 helpers

**Files:**
- Create: `convex/lib/requests311.ts`
- Test: `convex/lib/requests311.test.ts`

**Interfaces:**
- Produces:
  - `type Row311 = { id: number; created: string | null; closed: string | null; address: string | null; type: string | null }`
  - `cleanAddress(raw: string | null): { street: string; city: string; state: string; zip: string } | null`
  - `toBatchCsv(items: { key: string; street: string; city: string; state: string; zip: string }[]): string`
  - `parseBatchReply(csv: string): Map<string, { lat: number; lon: number; geoid: string } | null>`, keyed by the batch row's unique ID
  - `daysToClose(created: string | null, closed: string | null): { closed: boolean; days: number | null }`
  - `yearOf(created: string | null): number | null`
  - `type Hist = Record<string, number>`
  - `addDays(h: Hist, days: number): Hist`
  - `mergeHist(a: Hist, b: Hist): Hist`
  - `medianOf(h: Hist): number | null`
  - `TYPE_GROUPS: Record<"potholes" | "streetlights" | "dumping", string[]>`
  - `resolveTypes(asked: string | undefined, known: string[]): { types: string[] } | { choices: string[] }`

- [ ] **Step 1: Write failing tests**

```ts
it("cleans an address, dropping a unit and keeping Milwaukee as a street", () => {
  expect(cleanAddress("2613 W CAPITOL DR, 3, MILWAUKEE, WI, 53206-1413")).toEqual({ street: "2613 W CAPITOL DR", city: "MILWAUKEE", state: "WI", zip: "53206" });
  expect(cleanAddress("1 N MILWAUKEE ST, MILWAUKEE, WI, 53202-0000")).toEqual({ street: "1 N MILWAUKEE ST", city: "MILWAUKEE", state: "WI", zip: "53202" });
  expect(cleanAddress("3814 W KAUL AV")).toBeNull();          // no city/state/zip
  expect(cleanAddress("W WELLS ST, MILWAUKEE, WI, 53202")).toBeNull(); // no street number
  expect(cleanAddress(null)).toBeNull();
});
it("round-trips a batch: CSV out, Census reply in", () => {
  expect(toBatchCsv([{ key: "a1", street: "200 E WELLS ST", city: "MILWAUKEE", state: "WI", zip: "53202" }])).toBe('"a1","200 E WELLS ST","MILWAUKEE","WI","53202"\n');
  const reply = '"a1","200 E WELLS ST, MILWAUKEE, WI, 53202","Match","Exact","200 E WELLS ST, MILWAUKEE, WI, 53202","-87.909,43.041","1","L","55","079","187000","1000"\n"a2","9 NOWHERE, MILWAUKEE, WI, 53202","No_Match"\n';
  expect(parseBatchReply(reply)).toEqual(new Map([["a1", { lat: 43.041, lon: -87.909, geoid: "55079187000" }], ["a2", null]]));
});
it("counts days only for readable, non-negative spans", () => {
  expect(daysToClose("2026-01-01 00:00:00", "2026-01-04 00:00:00")).toEqual({ closed: true, days: 3 });
  expect(daysToClose("2026-01-04 00:00:00", "2026-01-01 00:00:00")).toEqual({ closed: true, days: null });
  expect(daysToClose("2026-01-01 00:00:00", null)).toEqual({ closed: false, days: null });
  expect(daysToClose("2026-01-01 00:00:00", "soon")).toEqual({ closed: false, days: null });
  expect(yearOf("2026-10-19 00:00:00")).toBe(2026);
  expect(yearOf("")).toBeNull();
});
it("merges histograms exactly and takes the middle", () => {
  const h = mergeHist(addDays(addDays({}, 0), 2), { "2": 1, "10": 1 }); // 0, 2, 2, 10
  expect(h).toEqual({ "0": 1, "2": 2, "10": 1 });
  expect(medianOf(h)).toBe(2);
  expect(medianOf({ "1": 1, "4": 1 })).toBe(2.5);
  expect(medianOf({})).toBeNull();
});
it("resolves type words and groups, or offers choices", () => {
  const known = ["Potholes", "Pothole in Alley", "Street Light Out", "Area Dark", "Dead Animal"];
  expect(resolveTypes("potholes", known)).toEqual({ types: ["Potholes", "Pothole in Alley"] });
  expect(resolveTypes("streetlights", known)).toEqual({ types: ["Street Light Out", "Area Dark"] });
  expect(resolveTypes("dead animal", known)).toEqual({ types: ["Dead Animal"] });
  expect(resolveTypes(undefined, known)).toEqual({ types: known });
  expect(resolveTypes("snow", known)).toMatchObject({ choices: expect.any(Array) });
});
```

- [ ] **Step 2: Run:** `npx vitest run convex/lib/requests311.test.ts`. **Expected:** FAIL, module not found.
- [ ] **Step 3: Implement** in `convex/lib/requests311.ts`.
  - `parseBatchReply` splits the GEOID from columns 9–11 (state, county, tract).
  - A word match in `resolveTypes` is whole-word and case-insensitive against `known`. Groups are filtered to the titles present in `known`.
  - `choices` is up to 8 of `known`, closest by edit distance; reuse `editDistance` if `convex/lib/neighborhoodNames.ts` exports it, otherwise export it from there.
- [ ] **Step 4: Run** the same command. **Expected:** PASS.
- [ ] **Step 5: Commit:** `git commit -m "feat(311): pure helpers for addresses, batch replies, days and type groups"`

### Task 2: Census batch call

**Files:**
- Create: `convex/lib/censusBatch.ts`
- Test: `convex/lib/requests311.test.ts` (append)

**Interfaces:**
- Consumes: `toBatchCsv`, `parseBatchReply` (Task 1)
- Produces: `geocodeBatch(csv: string): Promise<string>`. It POSTs `FormData` (`addressFile` as a Blob named `batch.csv`, `benchmark`, `vintage`) and returns the reply text. On a non-2xx status or a network error it retries once after 2 s, then throws `Error("Census geocoder failed: <status or message>")`.

- [ ] **Step 1: Failing tests**, with `vi.stubGlobal("fetch", …)`:
  - "retries once, then succeeds": first call 503, second 200 "ok" → resolves "ok", fetch called 2×.
  - "throws after two failures": both 500 → rejects with /Census geocoder failed: 500/.
  - Use fake timers.
- [ ] **Step 2: Run** `npx vitest run convex/lib/requests311.test.ts`. **Expected:** FAIL.
- [ ] **Step 3: Implement** `geocodeBatch`.
- [ ] **Step 4: Run.** **Expected:** PASS.
- [ ] **Step 5: Commit:** `git commit -m "feat(311): Census batch geocoder call with one retry"`

### Task 3: Tables and store mutations

**Files:**
- Modify: `convex/schema.ts`
- Create: `convex/requests311.ts` (store part)
- Test: `convex/requests311.test.ts`

**Interfaces:**
- Produces:
  - **Table `requests311`:**
    - Fields: `{ runId: string, kind: "city" | "hood" | "tract" | "unplaced", place: string, year: number, type: string, requests: number, closed: number, days: Record<string, number> }`
    - `place` is `"city"`, a neighborhood name, a tract GEOID, or for `unplaced` one of `"noAddress" | "noMatch" | "outside"`.
    - Indexes: `by_run_key` [runId, kind, place, year, type]; `by_run_kind_place` [runId, kind, place]; `by_run` [runId].
  - **Table `requests311Runs`:**
    - Fields: `{ file: "current" | "historical", runId: string, status: "running" | "live" | "failed" | "retired", modified: string | null, started: number, finished: number | null, note: string | null, matched: number, noMatch: number, noAddress: number }`
    - Indexes: `by_file` [file]; `by_runId` [runId].
  - `internal.requests311.startRun({ file, modified }) → runId`, where runId = `${file}-${Date.now()}`.
  - `internal.requests311.addTallies({ runId, tallies: Tally[] })`, with `Tally = Omit<requests311 row, "runId">`. It upserts through `by_run_key`, adding `requests` and `closed` and merging `days` with `mergeHist`, plus increments to the run's `matched`, `noMatch` and `noAddress`. A caller sends at most 1,000 tallies per call.
  - `internal.requests311.finishRun({ runId })`: sets this run to live, sets the file's previous live run to retired, sets finished, then schedules `deleteRetired`.
  - `internal.requests311.failRun({ runId, note })`: marks it failed and schedules deletion of its rows.
  - `internal.requests311.deleteRetired({ runId })`: deletes 4,000 rows per call, rescheduling itself until none remain.
  - `liveRuns(ctx): Promise<{ current: Doc | null; historical: Doc | null }>`, an exported helper.

- [ ] **Step 1: Failing tests** (convex-test):
  - "upserts tallies across calls": two `addTallies` for the same key → requests summed, days merged.
  - "readers see the old run until finish": live run A has 5 potholes; run B gets 7 but isn't finished → `liveRuns` gives A. After `finishRun(B)` → B. After the scheduled deletes, A's rows are gone (`t.finishAllScheduledFunctions(vi.runAllTimers)`).
  - "a failed run never goes live and its rows are deleted."
- [ ] **Step 2: Run** `npx vitest run convex/requests311.test.ts`. **Expected:** FAIL.
- [ ] **Step 3: Implement** the schema and mutations.
- [ ] **Step 4: Run.** **Expected:** PASS. Also `npx tsc --noEmit -p convex` is clean.
- [ ] **Step 5: Commit:** `git commit -m "feat(311): run-tagged count tables with an atomic live switch"`

### Task 4: The refresh pipeline

**Files:**
- Modify: `convex/requests311.ts`, `convex/build.ts:404`
- Test: `convex/requests311.test.ts`

**Interfaces:**
- Consumes: Tasks 1–3, plus these existing functions:
  - `datastoreSql` and `resourceModified` from `convex/lib/ckan.ts`
  - `inShape`, `inBbox` and `Geometry` from `convex/lib/geo.ts`
  - the `neighborhoods` rows where `definition` is "city" (they carry `geometry` as a JSON string and `bbox`)
- Produces:
  - `FILES = { current: "bf2b508a-5bfa-49da-8846-d87ffeee020a", historical: "abdfe983-e856-40cd-bee2-85e78454344a" }` and `CHUNK = 5000`, exported constants.
  - `internal.requests311.hoodShapes({ cursor: string | null }) → { page: { name, bbox, geometry }[], cursor, done }`: a paginated query of 20 rows per page.
  - `internal.requests311.refresh311({}) → string[]`, the build's notes. Steps:
    1. For each file, read `resourceModified`.
    2. Skip historical when its live run's `modified` is the same.
    3. Read `SELECT COUNT(*)`.
    4. `startRun`, then schedule `countChunk({ runId, file, offset: 0, total })`.
    5. Return notes like `"311 current: started, 33,349 rows"`.
  - `internal.requests311.countChunk({ runId, file, offset, total })`, an internal action. Steps:
    1. Query `SELECT "_id","CREATIONDATE","CLOSEDDATETIME","OBJECTDESC","TITLE" FROM "<res>" ORDER BY "_id" LIMIT 5000 OFFSET <offset>`.
    2. Clean the addresses, dedupe them, and geocode once.
    3. Fail the run if the match rate is below 80%.
    4. Place each point: bbox check, then `inShape` over all hood shapes, loaded via `hoodShapes` pages.
    5. Tally `city`, `hood`, `tract` and `unplaced` rows.
    6. Call `addTallies` in slices of 1,000.
    7. If `offset + 5000 < total`, schedule the next chunk at 0 ms. Otherwise compare `resourceModified` with the run's `modified`: if it changed, `failRun` with "City file changed during the count"; else `finishRun`.
    8. Any thrown error → `failRun` with the message.
  - `build.ts` calls `refresh311` inside try/catch next to `refreshFire`, adding `threeOneOneNotes` to the notes.

- [ ] **Step 1: Failing tests**, with `fetch` stubbed by URL (`datastore_search_sql` / `resource_show` / `geocoder`). Seed two city neighborhoods with square geometries.
  - "counts a small file end to end":
    - 5 rows: 2 inside hood A, 1 matched but outside every hood, 1 no address, 1 no match.
    - After `refresh311` + scheduled functions: `city` potholes 2026 requests = 5; `hood` A = 2; `unplaced` outside = 1, noAddress = 1, noMatch = 1.
    - The run is live, with matched 2, noMatch 1, noAddress 1.
    - No `requests311` field contains the address string (assert `JSON.stringify(rows)` doesn't include "WELLS").
  - "skips the historical file when unchanged."
  - "fails, keeping old counts, when the City file changes mid-run."
  - "fails below an 80% match rate."
  - "fails, keeping old counts, when the geocoder is down twice."
  - "fails naming the column when the City drops one": the SQL reply's records lack `TITLE` → the run fails with a note containing "TITLE", and no zero counts are stored.
- [ ] **Step 2: Run.** **Expected:** FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** **Expected:** PASS. Also run `npx vitest run convex/build.test.ts`, which must still pass.
- [ ] **Step 5: Commit:** `git commit -m "feat(311): weekly refresh geocodes in chunks and keeps only counts"`

### Task 5: `count311` query

**Files:**
- Modify: `convex/requests311.ts`
- Test: `convex/requests311.test.ts`

**Interfaces:**
- Consumes:
  - `liveRuns` (Task 3)
  - `resolveTypes`, `mergeHist` and `medianOf` (Task 1)
  - `matchName` and `nameKey` (`convex/lib/neighborhoodNames.ts`)
  - `placeKey` (`convex/lib/portrait.ts`)
  - `tractGeoid` (`convex/lib/factSheet.ts`)
- Produces: `api.requests311.count311`, a public query.
  - **Args:** `{ place?: string, type?: string, from?: number, to?: number, groupBy?: "type" | "year" }`
  - **Returns** a union. `Fig = { requests: number; closed: number; medianDays: number | null }`.
    - `{ status: "ok", place: { name: string; kind: "city" | "hood" | "dycu"; tracts: string[]; dycuNote: string | null }, types: string[], from: number, to: number, total: Fig, city: Fig, rows: { label: string; fig: Fig }[], unplaced: { noAddress: number; noMatch: number; outside: number }, counted: number, caveat: string }`
    - `{ status: "choose", asked, choices: string[] }`
    - `{ status: "no-place", asked, nearest: string[] }`
    - `{ status: "no-type", asked, choices: string[] }`
    - `{ status: "empty" }`, when there's no live run.
  - **Year ownership:** a year comes from historical if `year <= max year in historical live run`, else from current.
  - **Defaults:** `from`/`to` default to the newest year. `rows` is empty unless `groupBy` is set.

- [ ] **Step 1: Failing tests:**
  - A neighborhood answer with a city comparison and median.
  - A DYCU area summed from its newest tracts; `kind` is "dycu".
  - A City name that's also inside a DYCU area keeps `kind` "hood", with a `dycuNote`.
  - An unknown place returns `no-place` with nearest names; never citywide.
  - "potholes" sums both pothole titles.
  - A year present in both live runs is counted once, from historical.
  - No live run returns `empty`.
- [ ] **Step 2: Run.** **Expected:** FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** **Expected:** PASS.
- [ ] **Step 5: Commit:** `git commit -m "feat(311): count311 answers a place, a type group and years next to the city"`

### Task 6: Ask tool, card and e2e

**Files:**
- Modify:
  - `lib/ask/tools.ts`: add the `count311` name to `AskToolName`, the `requests311Params` zod schema matching Task 5's args, the backend method `requests311`, and the tool entry.
  - `lib/ask/backend.ts`: `requests311: (a) => fetchQuery(api.requests311.count311, a)`
  - `lib/ask/prompt.ts`: add this rule after the fire line, verbatim: "- For City 311 service requests (potholes, streetlights, dumping, any request type) in a neighborhood, a DYCU area or citywide, 2020 to now, use count311. It compares the place with the city and says how many requests couldn't be placed; don't restate its figures."
  - `lib/ask/model.ts`: scripted line `"potholes in arlington heights" → count311 { place: "Arlington Heights", type: "potholes" }`, following the `fireHistory` pattern at line 149, and its mention in the line-65 comment.
  - `ui/components/AskCards.tsx`, `ui/lib/shareCard.ts` (add "count311" to `SHAREABLE` and the export case), `ui/lib/askNotes.ts` (add "count311" to `ANALYSIS`).
- Create:
  - `ui/lib/requests311Text.ts`: `requests311Export(r, ctx): CardExport` and `requests311FollowUps(r): FollowUp[]`, following `ui/lib/fireText.ts`.
  - `ui/components/Requests311Card.tsx`: `data-card="requests-311"`. Shows place vs city: requests, closed, median days. Shows the "couldn't be placed" line when non-zero, the verbatim caveat, and the counted date. Shows the dycuNote when present.
- Test: `e2e/ask.spec.ts`

**Interfaces:**
- Consumes: Task 5's return union.
- Produces: `type Requests311Answer = FunctionReturnType<typeof api.requests311.count311>`, exported from `lib/ask/tools.ts`.

- [ ] **Step 1: Failing e2e**, after the fire test at `e2e/ask.spec.ts:266`:
  - `test("a 311 question draws the place-vs-city card", …)`
  - `ask(page, "potholes in arlington heights")`
  - Assert that `[data-card=requests-311]:visible` contains "Arlington Heights", "City", and the caveat text.
  - It needs dev counts, so it runs after Task 7's dev run. Until then, mark it `test.fixme` with a comment naming Task 7.
- [ ] **Step 2: Unit tests** for `requests311Export` and `requests311FollowUps` in `ui/lib/requests311Text.test.ts`:
  - The export header is `["", "<place>", "City"]` with rows Requests, Closed and Median days to close.
  - Follow-ups offer "by year" and the other two type groups.
  - **Run:** FAIL.
- [ ] **Step 3: Implement** the tool, card, text, and the share and notes registration.
- [ ] **Step 4: Run** `npx vitest run ui/lib/requests311Text.test.ts && npx tsc --noEmit -p . && npx tsc --noEmit -p convex`. **Expected:** PASS and clean.
- [ ] **Step 5: Commit:** `git commit -m "feat(311): Ask's count311 tool and place-vs-city card"`

### Task 7: Dev run, real-data check, docs

Each dev step here needs Tarik's explicit OK. Ask before running it.

- [ ] **Step 1:** Push to dev with `npx convex dev --once`, then run `npx convex run requests311:refresh311`. This takes about 70 minutes, chained. Watch `requests311Runs` until both files are `live` or `failed`.
- [ ] **Step 2, check:** each year's `city` total over all types equals the City's `SELECT COUNT(*) … WHERE "CREATIONDATE" LIKE '<year>%'` for that file. **Expected:** equal for every year.
- [ ] **Step 3, check:** report the unplaced share per file. Then spot-check Arlington Heights potholes for 2026: geocode that year's pothole rows ad hoc in a scratch script (not stored), count the ones inside the Arlington Heights shape, and compare with `count311`. **Expected:** equal.
- [ ] **Step 4:** Remove the `test.fixme` from Task 6's e2e and run `BASE_URL=http://localhost:3100 npx playwright test e2e/ask.spec.ts -g "311"`. **Expected:** pass on desktop and phone.
- [ ] **Step 5, docs:** add 311 by neighborhood to the How it works page's data list, if it lists Ask's sources (check `ui/components/HowItWorks.tsx`). Record the real-data numbers in the PR body.
- [ ] **Step 6, commit:** `git commit -m "test(311): dev real-data check; e2e on"`
