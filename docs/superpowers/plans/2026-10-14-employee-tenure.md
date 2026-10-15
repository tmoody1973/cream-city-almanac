# City Employee Tenure (L4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ask answers "how long have City employees worked here" and "how long had people worked when they left", and never sends a small group's times anywhere for a file that names people.

**Architecture:**
- **The privacy rule:** the "how long" tool's shaping step (`convex/lib/spanShape.ts`) nulls the median and 9-in-10 time of any group or All row under `MIN_CASES` (10) when the file's profile says it names people. That one change covers the AI's tool result, the card, the CSV and share links.
- **Two entries** in `SPAN_PAIRS` add tenure on the City employee pay file. One is an age to the file's update day; the other is a between pair, start to termination, with a new optional `verb`.
- **Times of a year or more** read as years on every day-measured card.

**Tech Stack:** Convex (action, convex-test), Next.js and CopilotKit, Zod, Vitest and Playwright.

**Spec:** `docs/superpowers/specs/2026-10-14-employee-tenure-design.md`

## Global Constraints

- **Never name, list or single out an employee.** Counts and medians only.
- **On a file whose profile has `namesPeople: true`,** a group or All row with `cases < 10` carries `median: null` and `p90: null` everywhere: the tool result, the card, the CSV, text, PNG and share links. Counts stay.
- **Files without `namesPeople`** are unchanged.
- **Entry texts, verbatim:**
  - START caveat: "Start Date is as the City records it; it may be when someone began their current job rather than their first day with the City."
  - `tenure-current` asOfNote: "As of {date}, when the City last updated this file: employees on its 2025 payroll with no termination date."
  - `tenure-left` missing: "{n} employees are still with the City and aren't counted here."
- **Years rule:** `durationText(v, "days")` shows `v >= 365` as `${(Math.round((v / 365) * 10) / 10).toFixed(1)} years`.
- **Permissions:** each dev Convex push or dev data run needs Tarik's explicit OK. Never stage `.superpowers/` or `clerk-creamcityalmanac.app.zone`.
- **Commit trailer:** `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- **Decision 048:** "What actually happened" stays blank.

## Review Focus

1. **A filter that narrows a people-file's All row below 10** (e.g. one department plus one job title). The All row's times must be null, and the card's summary must say "Too few…", not print a number. Pinned in Task 1.
2. **The pay measures** (`countRecords` measure on the same file) must keep their own rule, unchanged. Pinned by the existing measure tests in the Task 1 suite run.
3. **A between pair's "too few" sentence with `verb`**: "how long they had worked before leaving", not "took". Pinned in Task 2.
4. **Every existing day-measured card's long times now read in years** (complaint p90 400 days → "1.1 years"), and short ones stay in days. Pinned in Task 2.
5. **`checkPairs` on the live file** must also apply the rule. The live check prints only All rows, which are large, but the code path must pass `namesPeople`. Pinned in Task 1.

---

### Task 1: The server-side privacy rule

**Files:**
- Modify: `convex/lib/spanShape.ts` (`MIN_CASES`, `namesPeople` argument)
- Modify: `ui/lib/spanText.ts` (re-export `MIN_CASES` instead of defining it)
- Modify: `convex/spans.ts` (pass `profile.namesPeople` in `timeSpan` and `checkPairs`)
- Test: `tests/lib/spanShape.test.ts`, `convex/spans.test.ts`

**Interfaces:**
- Produces:
  - `export const MIN_CASES = 10` in `convex/lib/spanShape.ts`
  - `shapeSpan(groupRows, allRow, overlap, byYear, namesPeople = false)`

- [ ] **Step 1: Write the failing tests.** Append to `tests/lib/spanShape.test.ts`:

```ts
describe("files that name people (L4)", () => {
  it("withholds times for groups and the All row under 10 cases, only when the file names people", () => {
    const groups = [row("Small Dept", "9", "1200"), row("Big Dept", "10", "3000")];
    const people = shapeSpan(groups, row(null, "9", "1500"), false, false, true);
    expect(people.groups.map((g) => [g.label, g.cases, g.median, g.p90])).toEqual([["Small Dept", 9, null, null], ["Big Dept", 10, 3000, 3000]]);
    expect(people.all).toMatchObject({ cases: 9, median: null, p90: null });
    const plain = shapeSpan(groups, row(null, "9", "1500"), false, false);
    expect(plain.groups[0].median).toBe(1200);
    expect(plain.all.median).toBe(1500);
  });
});
```

Append to `convex/spans.test.ts`, inside `describe("timeSpan", …)`:

```ts
  it("never sends a small group's times for a file that names people (L4)", async () => {
    const t = await seed();
    await t.run(async (ctx) => {
      const p = await ctx.db.query("cityProfiles").withIndex("by_family", (q) => q.eq("familyKey", KEY)).first();
      await ctx.db.patch(p!._id, { namesPeople: true });
    });
    installFakeFetch({ citySql: (sql) => sql.includes("GROUP BY k") ? [{ k: "TINY", label: "Tiny", cases: "3", median: "800", p90: "900", open: "0", unreadable: "0", backwards: "0" }] : all });
    const r = await t.withIdentity(reader).action(api.spans.timeSpan, { code: "P24", pair: "complaint-close", groupBy: "Department" });
    expect(r).toMatchObject({ status: "ok", groups: [{ label: "Tiny", cases: 3, median: null, p90: null }], all: { cases: 2731, median: 64 } });
  });
```

- [ ] **Step 2: Run them to watch them fail**

Run: `npx vitest run tests/lib/spanShape.test.ts convex/spans.test.ts`
Expected: FAIL. The small group's median comes back 1200 and 800.

- [ ] **Step 3: Change `convex/lib/spanShape.ts`.** Add, above `shapeSpan`:

```ts
// Under this many cases a group's times aren't shown (spec 2026-10-14-employee-tenure §6). In a file that names people
// they aren't even sent: the AI, the card, the CSV and share links all get null, so no one's tenure leaks.
export const MIN_CASES = 10;
```

Change the signature to `shapeSpan(groupRows, allRow, overlap: boolean, byYear: boolean, namesPeople = false)`. Inside, after building `groups` and `all`:

```ts
  const withheld = <G extends { cases: number; median: number | null; p90: number | null }>(g: G): G => (namesPeople && g.cases < MIN_CASES ? { ...g, median: null, p90: null } : g);
```

Return `groups.map(withheld)` and `withheld(all)`; compute `other` from the unwithheld `all.cases`, which is unchanged.

- [ ] **Step 4: One number for server and card.** In `ui/lib/spanText.ts`, replace `export const MIN_CASES = 10;` with:

```ts
import { MIN_CASES } from "../../convex/lib/spanShape";
export { MIN_CASES };
```

(Keep the import at the top with the other imports.)

- [ ] **Step 5: Pass the flag.** In `convex/spans.ts`:
  - in `timeSpan`: `shapeSpan(groupRows, allRows[0], built.overlap, built.groupLabel === "year", data.profile.namesPeople)`;
  - in `checkPairs`: `shapeSpan(null, rows[0], false, false, profile.namesPeople)`.

- [ ] **Step 6: Run the tests**

Run: `npx vitest run tests/lib/spanShape.test.ts convex/spans.test.ts tests/ui/spanText.test.ts tests/lib/measureShape.test.ts convex/cityMeasures.test.ts`
Expected: PASS. The measure tests confirm the pay rule is untouched (review focus 2). If `tests/lib/measureShape.test.ts` doesn't exist, run `npx vitest run tests convex -t measure` instead.

- [ ] **Step 7: Typecheck and commit**

Run: `npx tsc --noEmit -p . && npx tsc --noEmit -p convex`

```bash
git add convex/lib/spanShape.ts ui/lib/spanText.ts convex/spans.ts tests/lib/spanShape.test.ts convex/spans.test.ts
git commit -m "fix: how-long answers never send a small group's times for files that name people (L4)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Tenure entries, `verb`, and years

**Files:**
- Modify: `convex/lib/spanPairs.ts` (`verb?` on between pairs, two entries)
- Modify: `ui/lib/spanText.ts` (years in `durationText`, `ageText` as an alias, `verb` in the summary)
- Test: `tests/lib/spanPairs.test.ts`, `tests/ui/spanText.test.ts`, `convex/spans.test.ts` (pair count)

**Interfaces:**
- Consumes: `MIN_CASES` (Task 1).
- Produces:
  - `BetweenPair.verb?: string`
  - entries `tenure-current` (age) and `tenure-left` (between) with familyKey `city:city-employee-salary-data`

- [ ] **Step 1: Write the failing tests.**

In `tests/lib/spanPairs.test.ts`:
- change `expect(SPAN_PAIRS).toHaveLength(11);` to `toHaveLength(13)`;
- append:

```ts
describe("City employee tenure (L4)", () => {
  it("lists tenure so far and time worked before leaving on the employee pay file", () => {
    const ps = pairsFor("city:city-employee-salary-data");
    expect(ps.map((p) => [p.id, p.kind, p.from, p.kind === "between" ? p.to : p.openWhen])).toEqual([
      ["tenure-current", "age", "Start Date", "Termination Date"],
      ["tenure-left", "between", "Start Date", "Termination Date"],
    ]);
    const current = ps[0];
    if (current.kind !== "age") throw new Error("age");
    expect(current.asOf).toBe("file");
    expect(current.asOfNote).toBe("As of {date}, when the City last updated this file: employees on its 2025 payroll with no termination date.");
    const left = ps[1];
    if (left.kind !== "between") throw new Error("between");
    expect(left).toMatchObject({ verb: "had worked", toWhat: "before leaving", things: "employees who left", missing: "{n} employees are still with the City and aren't counted here." });
    expect(left.caveat).toBe("Start Date is as the City records it; it may be when someone began their current job rather than their first day with the City.");
  });
});
```

(Add `pairsFor` to that file's import if it isn't there.)

In `convex/spans.test.ts`, change the `checkPairs` expectation `toHaveLength(11)` to `toHaveLength(13)`, with the comment updated to say "L1, L2 and L4 added two each".

In `tests/ui/spanText.test.ts`:
- change `expect(durationText(1478.4, "days")).toBe("1,478 days");` to `.toBe("4.1 years")`;
- in the summary at line 35, change `9 in 10 took 400 days or less.` to `9 in 10 took 1.1 years or less.`;
- append:

```ts
describe("long times and the verb (L4)", () => {
  it("shows 365 days or more as years everywhere, shorter as days (review focus 4)", () => {
    expect(durationText(364, "days")).toBe("364 days");
    expect(durationText(365, "days")).toBe("1.0 years");
    expect(durationText(3065, "days")).toBe("8.4 years");
  });
  it("words a between pair with its verb, including the too-few sentence (review focus 3)", () => {
    const left = { ...r, groupBy: null, groups: [], pair: { ...r.pair, things: "employees who left", toWhat: "before leaving", verb: "had worked" }, all: { ...r.all, median: 1241, p90: 4400 } };
    expect(spanSummary(left as never)).toBe("Half of the employees who left measured had worked 3.4 years or less before leaving; 9 in 10 had worked 12.1 years or less.");
    expect(spanSummary({ ...left, all: { ...left.all, cases: 4 } } as never)).toBe("Too few employees who left were measured to say how long they had worked before leaving (4 measured).");
  });
  it("says too few, never a number, when a people-file's All row is withheld (review focus 1)", () => {
    expect(spanSummary({ ...r, groupBy: null, groups: [], all: { ...r.all, cases: 6, median: null, p90: null } } as never)).toMatch(/^Too few complaints were measured/);
  });
});
```

(`r` is the test file's existing complaints fixture.)

- [ ] **Step 2: Run them to watch them fail**

Run: `npx vitest run tests/lib/spanPairs.test.ts tests/ui/spanText.test.ts convex/spans.test.ts`
Expected: FAIL. There are 11 pairs, "1,478 days", and the verb is not used.

- [ ] **Step 3: Change `convex/lib/spanPairs.ts`**

- `BetweenPair` becomes `PairText & { kind: "between"; to: string; unit: "days" | "minutes"; missing: string; verb?: string }`, with a comment: `// verb: the summary's verb ("took" when unset), e.g. "had worked".`
- Add constants after `FIRE_2021`:

```ts
const EMPLOYEES = "city:city-employee-salary-data";
const START = "Start Date is as the City records it; it may be when someone began their current job rather than their first day with the City.";
```

- Append to `SPAN_PAIRS`, after `complaint-open-age`:

```ts
  { kind: "age", id: "tenure-current", familyKey: EMPLOYEES, file: "City employee pay records", from: "Start Date", openWhen: "Termination Date", asOf: "file", name: "time worked so far", things: "current employees", toWhat: "with the City", unit: "days", caveat: START, asOfNote: "As of {date}, when the City last updated this file: employees on its 2025 payroll with no termination date." },
  { kind: "between", id: "tenure-left", familyKey: EMPLOYEES, file: "City employee pay records", from: "Start Date", to: "Termination Date", name: "time worked before leaving", things: "employees who left", toWhat: "before leaving", verb: "had worked", unit: "days", missing: "{n} employees are still with the City and aren't counted here.", caveat: START },
```

- [ ] **Step 4: Change `ui/lib/spanText.ts`**

- In `durationText`, before the days branch's `const d = …`:

```ts
  if (v >= 365) return `${(Math.round((v / 365) * 10) / 10).toFixed(1)} years`; // a year or more reads in years
```

- Replace the `ageText` definition with `export const ageText = (v: number | null) => durationText(v, "days");`, keeping its comment.
- In `spanSummary`'s between branch, read `const verb = r.pair.kind === "between" ? r.pair.verb ?? "took" : "took";` and use it in three places:
  - the too-few sentence: `` `…to say how long they ${verb} ${r.pair.toWhat} (…measured).` ``
  - the head: `` `half of the ${r.pair.things} measured ${verb} ${t(r.all.median)} or less ${r.pair.toWhat}` ``
  - the 9-in-10 clause: `` `; 9 in 10 ${verb} ${t(r.all.p90)} or less.` ``

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/lib/spanPairs.test.ts tests/ui/spanText.test.ts convex/spans.test.ts tests/ui tests/lib`
Expected: PASS. If another existing expectation used a 365+ day time in days, update it to years per spec §5 and ledger the exact test name as a ruling.

- [ ] **Step 6: Typecheck and commit**

Run: `npx tsc --noEmit -p . && npx tsc --noEmit -p convex`

```bash
git add convex/lib/spanPairs.ts ui/lib/spanText.ts tests/lib/spanPairs.test.ts tests/ui/spanText.test.ts convex/spans.test.ts
git commit -m "feat: City employee tenure so far and before leaving; long times read in years (L4)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Ask

**Files:**
- Modify: `lib/ask/tools.ts` (`spanDescription` sentence), `lib/ask/prompt.ts` (how-long line), `lib/ask/model.ts` (scripted branch), `scripts/ask-questions.ts` (graded question)
- Test: `tests/ui/askTools.test.ts`

- [ ] **Step 1: Write the failing test.** Append to `tests/ui/askTools.test.ts`:

```ts
describe("employee tenure (L4)", () => {
  it("lists the tenure entries and tells the model small groups show no times", () => {
    const d = spanDescription();
    expect(d).toContain("tenure-current");
    expect(d).toContain("tenure-left");
    expect(d).toMatch(/groups under 10 show no times/i);
    expect(ASK_PROMPT).toMatch(/City employees/);
  });
});
```

- [ ] **Step 2: Run it to watch it fail**

Run: `npx vitest run tests/ui/askTools.test.ts`
Expected: FAIL on "groups under 10 show no times". The entries are listed already, from Task 2.

- [ ] **Step 3: Implement**

- `lib/ask/tools.ts` `spanDescription()`: append to the returned text the sentence `" On files that name people, groups under 10 show no times; say there are too few to report, never guess."`
- `lib/ask/prompt.ts`: after the age-entry line (the one starting `- "How long has something been open, vacant or waiting"`), add:

```
- How long City employees have worked there uses timeSpan on the City employee pay file: tenure-current for current employees, tenure-left for people who left. Never name or single out an employee.
```

- `lib/ask/model.ts`:
  - after the `vacant` answered branch:

```ts
      if (question.includes("city employees worked") && searched?.output) {
        const v = searched.output.type === "json" ? searched.output.value : JSON.parse(String(searched.output.value));
        const rows = (v as { rows?: { code: string; name: string }[] }).rows ?? [];
        const code = rows.find((r) => /employee/i.test(r.name))?.code ?? rows[0]?.code ?? "C01";
        return { stream: simulateReadableStream({ chunks: [{ type: "stream-start" as const, warnings: [] }, call("timeSpan", { code, pair: "tenure-current", groupBy: "Department" }), finish("tool-calls")] }) };
      }
```

  - in the first-step chain, just before `question.includes("vacant")`:

```ts
                : question.includes("city employees worked")
                ? call("searchCatalog", { query: "employee salary" })
```

  - add `"city employees worked" → searchCatalog "employee salary", then timeSpan tenure-current by Department;` to the doc comment.

- `scripts/ask-questions.ts`, after the vacant question:

```ts
  { q: "How long have City of Milwaukee employees worked for the City?", tool: "timeSpan", expect: { pair: "tenure-current" }, final: true },
```

- [ ] **Step 4: Run the tests and typecheck**

Run: `npx vitest run tests/ui && npx tsc --noEmit -p .`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/ask scripts/ask-questions.ts tests/ui/askTools.test.ts
git commit -m "feat: Ask answers City employee tenure questions; scripted and graded checks (L4)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Browser test and docs

**Files:**
- Modify: `e2e/ask.spec.ts`, `ui/components/HowItWorks.tsx`, `docs/research/2026-10-12-questions-by-audience.md`
- Create: `docs/decisions/048-employee-tenure.md`

- [ ] **Step 1: Browser test**, after the vacant-buildings test:

```ts
  test("a City-employee tenure question draws a so-far card in years (L4)", async ({ page }) => {
    test.skip(!(await page.request.get("https://data.milwaukee.gov/api/3/action/status_show").then((r) => r.ok()).catch(() => false)), "City API unreachable");
    await ask(page, "How long have city employees worked here, by department?");
    const card = page.locator("[data-card=span]:visible");
    await expect(card).toBeVisible({ timeout: 40_000 });
    await expect(card).toContainText("time worked so far");
    await expect(card).toContainText("years");
  });
```

The scripted model keys on "city employees worked"; the question above contains it. (A by-department card shows the 24 largest departments; the nine under 10 people rank 53rd–61st and fold into "all other groups", so the withheld case is checked by a filter in Task 5, not here.)

- [ ] **Step 2: Decision 048** (`docs/decisions/048-employee-tenure.md`), in 047's format. Define "median" inline.
  - **Decision:** two tenure measures on the City employee pay file, plus a server rule that a people-file's group under 10 sends no times.
  - **Why:**
    - a common question;
    - the file names everyone;
    - the "how long" tool hid small groups only on screen, while their exact numbers still reached the AI, CSV and share links;
    - departments of 1–4 people exist.
  - **Options:**
    - a separate tenure tool;
    - entries in the existing list plus the server rule (chosen);
    - entries without a server rule (rejected: a one-person group's tenure leaks).
  - **Chose:** Tarik, 2026-10-14, both measures, the threshold 10 (matches what the card already said).
  - **Gave up:**
    - tenure for small groups;
    - first-day-with-the-City accuracy (Start Date may be the current job's);
    - earlier years' files;
    - re-hires.
  - **How we'll know:**
    - the graded question passes;
    - on live data, a filter to a 2-person department returns a count and no times;
    - no CSV or share from a people-file ever contains a small group's time.
  - **What actually happened:** blank.

- [ ] **Step 3: How it works.** Extend the "how long" paragraph in `ui/components/HowItWorks.tsx` (the one ending "measured to the day the data is as of.") with:

```tsx
              {" "}It also says how long City employees have worked there. In files that name people, a group of fewer than 10 shows no
              times at all, so no one&apos;s tenure can be picked out.
```

- [ ] **Step 4: Questions doc.** In `docs/research/2026-10-12-questions-by-audience.md`, after the fire rows:

```
| How long have City employees worked for the City? | City Employee Salary Data | **Now** (tenure so far, L4) |
| How long had City employees worked when they left? | City Employee Salary Data | **Now** (time worked before leaving, L4) |
```

- [ ] **Step 5: Run the whole suite, typecheck and build**

Run: `W=.superpowers/sdd/2026-10-14-employee-tenure; npx vitest run > $W/suite.log 2>&1; grep -E "Test Files|Tests " $W/suite.log; npx tsc --noEmit -p . && npm run build > $W/build.log 2>&1; echo build=$?`
Expected: all pass, `build=0`. If the machine is loaded (check `uptime`; load over 20), rerun with `--testTimeout=120000 --maxWorkers=2` and record both runs in the ledger.

- [ ] **Step 6: Commit**

```bash
git add e2e/ask.spec.ts docs/decisions/048-employee-tenure.md ui/components/HowItWorks.tsx docs/research/2026-10-12-questions-by-audience.md
git commit -m "docs: decision 048, How it works and the questions list for employee tenure; browser check (L4)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Live checks (each needs Tarik's OK)

- [ ] **Step 1: Ask Tarik** which to run:
  - **Dev push + live check:** changes the dev deployment.
  - **Graded real-AI question:** about $0.05.
  - **Local browser tests:** about 4 minutes, on the shared test account.

- [ ] **Step 2 (with OK): dev push and checks**

Run:

```bash
npx convex dev --once
npx convex run spans:checkPairs | python3 -c "import json,sys; [print(r['id'], r['ok'], (r.get('all') or {}).get('cases'), (r.get('all') or {}).get('median')) for r in json.load(sys.stdin)]"
npx convex run spans:timeSpan '{"code":"<employee file code>","pair":"tenure-current","groupBy":"Department"}' --identity '{"subject":"check","issuer":"cli","tokenIdentifier":"cli|check"}'
npx convex run spans:timeSpan '{"code":"<employee file code>","pair":"tenure-current","filters":[{"column":"Department","values":["DPW-STREETCAR OPERATIONS"]}]}' --identity '{"subject":"check","issuer":"cli","tokenIdentifier":"cli|check"}'
```

(Find the employee file's code with `npx convex run search:searchCatalog '{"query":"employee salary"}'`.)

Expected:
- all 13 entries `ok`;
- `tenure-current` about 8,066 cases, median a few years;
- `tenure-left` about 991 cases;
- in the by-department call, the 24 largest departments carry medians and any group with `cases < 10` has `median: null`;
- the filtered call to the 2-person "DPW-STREETCAR OPERATIONS" department returns `all: { cases: 2, median: null, p90: null }`, the privacy rule on live data.

- [ ] **Step 3 (with OK): graded question**

Run: `N=$(npx tsx -e 'import("./scripts/ask-questions.ts").then((m) => console.log(m.ASK_QUESTIONS.findIndex((q) => q.q.includes("employees worked for the City")) + 1))') && npx tsx scripts/ask-report-card.ts --only=$N --cap=0.25 --verbose`
Expected: PASS on `timeSpan` with `tenure-current`.
