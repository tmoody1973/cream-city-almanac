# Ask Answers Read Plainly (Part 2) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ask's replies follow the answer-first shape:
- the card states the answer;
- the AI adds what it means, one caveat and at most one plain next question, in three sentences or fewer;
- the AI uses no codes or column names;
- lookup cards (catalog search results, dataset sheets) fold away whenever an answer reaches an analysis card.

**Architecture:**
- **The fold** is pure code: `lookupIds(messages)` in `ui/lib/askNotes.ts` picks the calls to fold. The Ask panel provides them through a `Lookups` context, the way it provides `EarlierCounts`. The `searchCatalog` and `showDataset` renders wrap their cards in a `Lookup` component.
- **The AI's shape** comes from a rewritten reply rule with two worked examples in `lib/ask/prompt.ts`, and from tool descriptions that no longer send the AI to dataset sheets first.
- **The checks:** `replyProblems` gains "code" and "column name", and the report card counts any reply problem as a MISS.

**Tech Stack:** Next.js 16 / React 19, CopilotKit `useRenderTool`, Vitest (edge-runtime, no DOM), Playwright. No Convex changes.

**Spec:** `docs/superpowers/specs/2026-10-15-plain-replies-design.md`

## Global Constraints

- **Analysis tools** (an answer with any of these folds its lookups): `countRecords`, `timeSpan`, `rankTracts`, `compareYears`, `relateTracts`, `getNumber`, `factSheet`, `zipProfile`, `zipHealth`, `fireHistory`, `countStops`, `countTurnout`, `findPlace`, `boundariesFor`, `readReport`.
- **Folded:** `searchCatalog` renders nothing; `showDataset` renders the one line "Dataset used: {name}" with an "Open the sheet" link. **Never folded:** `previewData`.
- **A folded sheet never auto-opens the side column** and shows no follow-up buttons.
- **Reply rule text:** verbatim from spec §4, with both worked examples verbatim.
- **Codes:** a dataset code is `\b[A-Z]\d{2}\b`; a column name is `\b[a-z]+(?:_[a-z0-9]+)+\b`; text inside quotation marks is skipped.
- **Follow-up buttons are unchanged.**
- **Permissions:**
  - the real-AI regrade (~$6–8) needs Tarik's OK at the time;
  - no dev Convex push is needed (nothing in `convex/` changes);
  - never stage `.superpowers/` or `clerk-creamcityalmanac.app.zone`.
- **Commit trailer:** `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- **Decision 051:** "What actually happened" stays blank.

## Review Focus

1. **A search-only answer** ("Is there data on asthma?") must still show its results. Pinned in Task 1 (unit and browser).
2. **Each answer is judged on its own.** A lookup in one answer must not fold because a later answer had a count. Pinned in Task 1 (unit).
3. **A folded sheet must not take over the laptop's side column**, which `SheetCard`'s `useOpenOnce` would do. Pinned in Task 1: the folded line is its own component with no `useOpenOnce`, and the browser test checks the relate card stays visible.
4. **Quoted labels** ("Under 5 years", "PM2.5", "S1501") must not count as codes. Pinned in Task 2.
5. **The prompt keeps every rule that isn't being replaced** (count rules, ZIP rules, people-file rules). Pinned in Task 3: tests assert the old lines that must survive.

---

### Task 1: Fold the lookups

**Files:**
- Modify: `ui/lib/askNotes.ts` (`lookupIds`), `ui/components/AskCards.tsx` (`Lookups`, `Lookup`, `DatasetUsed`, the two renders), `ui/components/AskPanel.tsx` (provider), `e2e/ask.spec.ts`, `tests/ui/askNotes.test.ts`

**Interfaces:**
- Produces:
  - `lookupIds(messages: CallMsg[]): Set<string>` (`ui/lib/askNotes.ts`);
  - `Lookups: React.Context<Set<string>>` (`ui/components/AskCards.tsx`).

- [ ] **Step 1: Write the failing test.** Append to `tests/ui/askNotes.test.ts` (and add `lookupIds` to its import from `../../ui/lib/askNotes`):

```ts
describe("lookups fold when an answer reaches an analysis card (plain replies §3)", () => {
  const calls = (id: string, ...named: [string, string][]) => ({ id, role: "assistant", content: "", toolCalls: named.map(([cid, name]) => ({ id: cid, function: { name } })) });
  it("folds the answer's searches and sheets once it has an analysis call", () => {
    const m = [u("1"), calls("a", ["s1", "searchCatalog"], ["d1", "showDataset"]), calls("b", ["r1", "relateTracts"])];
    expect([...lookupIds(m as never)].sort()).toEqual(["d1", "s1"]);
  });
  it("leaves a search-only answer alone (review focus 1)", () => {
    expect(lookupIds([u("1"), calls("a", ["s1", "searchCatalog"])] as never).size).toBe(0);
  });
  it("never folds a preview", () => {
    expect([...lookupIds([u("1"), calls("a", ["p1", "previewData"], ["c1", "countRecords"])] as never)]).toEqual([]);
  });
  it("judges each answer on its own (review focus 2)", () => {
    const m = [u("1"), calls("a", ["s1", "searchCatalog"]), u("2"), calls("b", ["s2", "searchCatalog"], ["c2", "countRecords"])];
    expect([...lookupIds(m as never)]).toEqual(["s2"]);
  });
});
```

- [ ] **Step 2: Run it to watch it fail**

Run: `npx vitest run tests/ui/askNotes.test.ts`
Expected: FAIL. `lookupIds` isn't exported.

- [ ] **Step 3: Write `lookupIds`** in `ui/lib/askNotes.ts`, after `newestTurnCallIds`:

```ts
// When an answer reaches an analysis card, its catalog searches and dataset sheets were lookups on the way there: they
// fold (spec 2026-10-15-plain-replies §3). A preview never folds: live rows or a chart can be the answer itself.
const ANALYSIS = new Set(["countRecords", "timeSpan", "rankTracts", "compareYears", "relateTracts", "getNumber", "factSheet", "zipProfile", "zipHealth", "fireHistory", "countStops", "countTurnout", "findPlace", "boundariesFor", "readReport"]);
const LOOKUPS = new Set(["searchCatalog", "showDataset"]);

export function lookupIds(messages: CallMsg[]): Set<string> {
  const folded = new Set<string>();
  let lookups: string[] = [];
  let analysed = false;
  const close = () => {
    if (analysed) lookups.forEach((id) => folded.add(id));
    lookups = [];
    analysed = false;
  };
  for (const m of messages) {
    if (m.role === "user") close();
    for (const c of m.toolCalls ?? []) {
      const name = c.function?.name ?? "";
      if (LOOKUPS.has(name)) lookups.push(c.id);
      if (ANALYSIS.has(name)) analysed = true;
    }
  }
  close();
  return folded;
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/ui/askNotes.test.ts`
Expected: PASS.

- [ ] **Step 5: Fold in the cards.** In `ui/components/AskCards.tsx`:
  - after the `EarlierSheets` context and `Once`, add:

```tsx
// Lookups on the way to an answer (ui/lib/askNotes.ts lookupIds); the Ask panel provides them. A folded search draws
// nothing; a folded sheet draws one line, and never opens the side column (the analysis card keeps it).
export const Lookups = createContext<Set<string>>(new Set());
function Lookup({ id, folded = null, children }: { id?: string; folded?: ReactNode; children: ReactNode }) {
  const lookups = useContext(Lookups);
  return id && lookups.has(id) ? folded : children;
}
const DatasetUsed = ({ code, name, onOpen }: { code: string; name: string; onOpen: Open }) => (
  <p className={styles.source} data-card="dataset-used">Dataset used: {name} <OpenLink code={code} onOpen={onOpen} label="Open the sheet" /></p>
);
```

  - In the `searchCatalog` render, wrap the returned `<ol …>…</ol>` as `<Lookup id={props.toolCallId}>` … `</Lookup>`.
  - In the `showDataset` render, wrap the returned fragment as `<Lookup id={props.toolCallId} folded={<DatasetUsed code={r.code} name={r.name} onOpen={onOpen} />}>` … `</Lookup>`.

  (`ReactNode`, `createContext` and `useContext` are already imported in that file; if `ReactNode` isn't, add it to the `react` import.)

  In `ui/components/AskPanel.tsx`:
  - import `lookupIds` with the other `askNotes` names;
  - import `Lookups` with the other `AskCards` names;
  - wrap the `EarlierSheets.Provider` element's child: `<Lookups.Provider value={lookupIds(messages as never)}>` around `<CopilotChatToolCallsView … />`.

- [ ] **Step 6: Browser checks.** In `e2e/ask.spec.ts`:
  - in the test "home values line up with broadband as exact City figures", after its last `expect`, add:

```ts
    // The catalog search on the way to the comparison folds away (plain replies §3).
    await expect(page.locator("[data-card=datasets]:visible")).toHaveCount(0);
```

  - add a new test after "a dataset opened twice in one answer shows one card":

```ts
  test("a search-only answer still shows its results (plain replies §3)", async ({ page }) => {
    await ask(page, "Is there data on asthma?");
    await expect(page.locator("[data-card=datasets]:visible")).toBeVisible({ timeout: 30_000 });
  });
```

  (The scripted model sends "Is there data on asthma?" to `searchCatalog` only.)

Run: `npx playwright test --list e2e/ask.spec.ts | grep -c "search-only answer"`
Expected: `2`.

- [ ] **Step 7: Typecheck, UI tests and build**

Run: `npx tsc --noEmit -p . && npx vitest run tests/ui && npm run build > /tmp/plain-build.log 2>&1; echo build=$?`
Expected: PASS and `build=0`. The `tests/ui/effects.test.ts` guard stays green.

- [ ] **Step 8: Commit**

```bash
git add ui/lib/askNotes.ts ui/components/AskCards.tsx ui/components/AskPanel.tsx e2e/ask.spec.ts tests/ui/askNotes.test.ts
git commit -m "feat: lookups on the way to an answer fold: catalog results hide, dataset sheets become one 'Dataset used' line

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: The reply checks

**Files:**
- Modify: `ui/lib/askProse.ts` (`replyProblems`), `tests/ui/askBlocks.test.ts`, `scripts/ask-report-card.ts`

- [ ] **Step 1: Write the failing test.** In `tests/ui/askBlocks.test.ts`:
  - change the existing expectation `replyProblems("The F02 sheet is open. It covers 2022 and 2023.\n- Who is hungriest\n- What changed\n- Where help is")` to use `"The food insecurity sheet is open. It covers 2022 and 2023.\n- Who is hungriest\n- What changed\n- Where help is"` (codes are no longer fine; spec §4);
  - add, inside `describe("replyProblems", …)`:

```ts
  it("flags dataset codes and column names, but not quoted labels (plain replies §5; review focus 4)", () => {
    expect(replyProblems("Compare E02 with the food sheet.")).toEqual(["code"]);
    expect(replyProblems("The pov_rate column is the one.")).toEqual(["column name"]);
    expect(replyProblems('The row "Under 5 years" and "S1501" and "PM2.5" are quoted.')).toEqual([]);
    expect(replyProblems('The label "E02 pov_rate" is quoted.')).toEqual([]);
  });
```

- [ ] **Step 2: Run it to watch it fail**

Run: `npx vitest run tests/ui/askBlocks.test.ts`
Expected: FAIL on the new test.

- [ ] **Step 3: Implement.** In `ui/lib/askProse.ts`'s `replyProblems`, before `return problems;`:

```ts
  // Names, not codes (spec 2026-10-15-plain-replies §4): a dataset code or a column name outside quotation marks.
  const unquoted = text.replace(/[“"][^”"]*[”"]/g, " ");
  if (/\b[A-Z]\d{2}\b/.test(unquoted)) problems.push("code");
  if (/\b[a-z]+(?:_[a-z0-9]+)+\b/.test(unquoted)) problems.push("column name");
```

  Also update the comment above the function to: `What breaks the reply rules in lib/ask/prompt.ts (one to three sentences, at most three "- " angles, no headings, numbered points, dataset codes or column names). The report card counts any of them as a miss; the app shows replies as written.`

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/ui/askBlocks.test.ts tests/ui/ask.test.ts`
Expected: PASS.

- [ ] **Step 5: The report card counts shape as a MISS.** In `scripts/ask-report-card.ts`:
  - replace the two comment lines above `const shape = replyProblems(r.text);` with `// Reply shape (lib/ask/prompt.ts) is part of passing since 2026-10-15 (decision 051, reversing 2026-10-10's "track it, don't fail on it").`;
  - change `const ok = fieldsOk && unverified === 0 && !mapMismatch;` to `const ok = fieldsOk && unverified === 0 && !mapMismatch && shape.length === 0;`;
  - in the console line, change the label `shape warning` to `shape`.

Run: `npx tsc --noEmit -p . && grep -n "shape.length === 0" scripts/ask-report-card.ts`
Expected: no type errors and one line found.

- [ ] **Step 6: Commit**

```bash
git add ui/lib/askProse.ts tests/ui/askBlocks.test.ts scripts/ask-report-card.ts
git commit -m "feat: reply checks flag dataset codes and column names; the report card fails a reply that breaks the shape

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: How the AI writes

**Files:**
- Modify: `lib/ask/prompt.ts`, `lib/ask/tools.ts`, `tests/ui/askTools.test.ts`

- [ ] **Step 1: Write the failing test.** Add to `tests/ui/askTools.test.ts`:

```ts
describe("plain replies (spec 2026-10-15-plain-replies §4)", () => {
  it("asks for meaning, one caveat and an optional next question, with two worked examples and no codes", () => {
    expect(ASK_PROMPT).toContain("The card already states the answer and carries every figure, place and source.");
    expect(ASK_PROMPT).toContain("Name datasets by their names, never by code or column name.");
    expect(ASK_PROMPT).toContain("That means the ZIPs with the most poverty mostly also report the most food hardship");
    expect(ASK_PROMPT).toContain("The highest-poverty areas sit close together");
    expect(ASK_PROMPT).not.toContain("dataset codes (like N03) are fine");
    expect(ASK_PROMPT).not.toContain("by code (H05, W01)");
    expect(ASK_PROMPT).not.toContain("Find the datasets first, read the column guide");
  });
  it("keeps the rules it doesn't replace (review focus 5)", () => {
    for (const kept of ["Never write a number, percentage, count or amount in your own words.", "For datasets that name private people", "use zipHealth, by ZIP code, from Health Compass Milwaukee", "Never name or single out an employee"]) expect(ASK_PROMPT).toContain(kept);
  });
  it("no longer sends the tract tools to dataset sheets first", () => {
    for (const name of ["rankTracts", "compareYears", "relateTracts"]) {
      const d = askTools(backend({})).find((t) => t.name === name)!.description;
      expect(d).not.toContain("column guide (showDataset) first");
      expect(d).toContain("if you don't know the column, call without a valid one and choose from the list it returns");
    }
  });
});
```

- [ ] **Step 2: Run it to watch it fail**

Run: `npx vitest run tests/ui/askTools.test.ts`
Expected: FAIL on the three new tests.

- [ ] **Step 3: Rewrite the rules.** In `lib/ask/prompt.ts`:
  - in the first rule, change `Years and dataset codes (like N03) are fine.` to `Years are fine.`;
  - in the story-angle paragraph, change `Name the datasets each angle draws on by code (H05, W01)` to `Name the datasets each angle draws on by name`;
  - in the tract line, change `Find the datasets first, read the column guide (showDataset), and pick a rate over a count.` to `Pick a rate over a count.`;
  - replace the whole line that begins `- Always end with one to three short sentences` with:

```
- The card already states the answer and carries every figure, place and source. Your reply adds, in plain sentences: one sentence on what it means for the person's question, one caveat that matters, and, if useful, one plain next question they could ask. At most three sentences. Never restate the card's answer, its places or its figures; never offer to do more ("I can also…", "If you want…"); no headings, no bold, no numbered points. Name datasets by their names, never by code or column name. The only list allowed is up to three suggested story angles, after a blank line, one per line starting with "- ".
- Two replies in the right shape (neither contains a figure):
  After a ZIP health "low despite high" card: "That means the ZIPs with the most poverty mostly also report the most food hardship; only one comes close to being an exception. The food figures come from a survey, so ZIPs where few people answered have wide ranges. You could ask how that ZIP compares with the county on child food insecurity."
  After a tract ranking card: "The highest-poverty areas sit close together, which matters if you're choosing where to focus outreach. Small Census areas have wide margins, so neighbors in the list may not truly differ. You could ask which neighborhoods those areas fall in."
```

  In `lib/ask/tools.ts`, replace all three occurrences of `Read the dataset's column guide (showDataset) first and pick a rate over a count.` with `Pick a rate over a count; if you don't know the column, call without a valid one and choose from the list it returns.`

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/ui/askTools.test.ts tests/ui && npx tsc --noEmit -p .`
Expected: PASS. If an older test asserted the removed phrases, it was pinning the old rule. Change it to the new wording, and note it in the ledger.

- [ ] **Step 5: Commit**

```bash
git add lib/ask/prompt.ts lib/ask/tools.ts tests/ui/askTools.test.ts
git commit -m "feat: Ask's reply rule: meaning, one caveat, an optional plain next question, three sentences, names not codes; tract tools stop opening sheets first

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Docs and the whole suite

**Files:**
- Create: `docs/decisions/051-plain-replies.md`
- Modify: `DESIGN.md`

- [ ] **Step 1: Decision 051**, in 050's format:
  - **Decision:** Ask's replies follow the answer-first shape (meaning, one caveat, an optional plain next question, three sentences, names not codes). Lookup cards fold when an answer reaches an analysis card. The report card fails a reply that breaks the shape.
  - **Why:** the 2026-10-15 graded run (every reply 6–10 sentences); Tarik's tract example (11 dataset links, codes and column names in prose).
  - **Options:**
    - fold in code, plus rewritten rules (chosen);
    - rules only (the dump persists);
    - trim replies in code (could cut a caveat).
  - **Chose:** Tarik, 2026-10-15. **This reverses his 2026-10-10 call** that reply length is tracked, not failed.
  - **Gave up:**
    - lookup cards aren't visible by default when an analysis follows (one line remains for sheets);
    - the AI can still run long, and a stricter grader makes the pass rate drop until the rules take;
    - follow-up buttons keep their codes.
  - **How we'll know:**
    - every question that passed on tools and fields still does;
    - at least 9 in 10 replies pass the shape;
    - no catalog list appears above an analysis card.
  - **What actually happened:** blank.

- [ ] **Step 2: DESIGN.md.** In the Ask section, after the "Follow-up buttons (Ask)" section, add:

```markdown
### Lookups (Ask)
When an answer reaches an analysis card, the catalog searches and dataset sheets the AI opened on the way fold: search results draw nothing, and each sheet becomes one line, "Dataset used: {name}" with an "Open the sheet" link, that never takes over the side column. Answers that are only a search or a sheet show in full; data previews never fold.
```

- [ ] **Step 3: Whole suite, typecheck and build**

Run: `uptime; npx vitest run > /tmp/plain-suite.log 2>&1; grep -E "Test Files|Tests " /tmp/plain-suite.log; npx tsc --noEmit -p . && npx tsc -p convex/tsconfig.json --noEmit && npm run build > /tmp/plain-build.log 2>&1; echo build=$?`
Expected: all pass and `build=0`. If the load average is over 20 and only `convex/buildStore.test.ts` times out, rerun that file alone and record both runs.

- [ ] **Step 4: Commit**

```bash
git add docs/decisions/051-plain-replies.md DESIGN.md
git commit -m "docs: decision 051 and DESIGN.md lookups for plain replies

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Real-AI regrade (needs Tarik's OK)

- [ ] **Step 1: Ask Tarik** to approve a full regrade of every graded question (about 60 at about $0.10–0.13 each, so $6–8) with the new rules and the stricter report card. No dev push is needed: the prompt and tools run from this branch locally, and the data tools read dev.

- [ ] **Step 2 (with OK):**

Run: `npm run ask:card -- --cap=9 > /tmp/plain-grade.log 2>&1; grep -E "^(PASS|MISS)|passed ·" /tmp/plain-grade.log`
Expected:
- every question whose tools and fields passed before still reaches them;
- at least 9 in 10 replies pass the shape.

Record the MISS lines and their reasons for the final report.
