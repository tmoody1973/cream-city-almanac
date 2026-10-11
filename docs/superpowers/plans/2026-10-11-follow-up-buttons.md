# Follow-up Buttons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Under the newest Ask answer, code-built buttons fill the question box with a ready-worded next question, or with one of the options Ask's tool offered when it couldn't tell what was meant. They never send.

**Architecture:**
- **Two pure rule files.** `ui/lib/nextQuestions.ts` covers next-question ideas per card; `ui/lib/refusalChoices.ts` covers "Pick one:" options per refusal. Each turns a tool's settings and result into `{ label, question }` pairs.
- **One display piece.** `ui/components/FollowUps.tsx` shows the buttons only on the newest answer's tool calls. A click calls `fill(question)`.
- **Filling reuses the existing path.** It's the same path the guide's `?prompt=` links use (the chat view's `onInputChange`), moved to `ui/components/askFill.ts` so cards and the panel can share it without an import cycle.
- **Front end only.** No server, data or schema changes.

**Tech Stack:** Next.js 16, React, CopilotKit v2 (`useRenderTool`, `CopilotChat` chat view), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-11-follow-up-buttons-design.md`

## Global Constraints

- **A click fills the question box and never sends.** No code path calls the agent, `runAgent`, or a send button.
- **Caps:** at most **3** next-question buttons per card and **8** choices per refusal.
- **Newest answer only:** buttons render only for tool calls in the newest turn (after the last user message).
- **Every question names its dataset code and column**, as `({code} {column})`, wherever it refers to a tract column.
- **No numbers of our own in a question.** Every digit run in a question must appear in the tool's settings or result: years, cutoffs, dates, codes and tract labels come from there.
- **Labels:**
  - next-question labels in caps, exactly as in the spec table;
  - choice labels are the choice itself;
  - a column's plain meaning is cut at 60 characters with "…", followed by ` ({column})`.
- **Buttons:**
  - real `<button type="button">`, at least 44px tall, in the existing `.expand` style;
  - the row has an `aria-label`, either "Next questions. Each fills the question box" or "Pick one. Each fills the question box";
  - "Pick one:" is shown as visible text before choices.
- **Commit trailer:** `Co-Authored-By: <the model you are> <noreply@anthropic.com>`.
- **Never stage** `.superpowers/` or `clerk-creamcityalmanac.app.zone`.

## Review Focus

1. **Text the AI typed with odd casing or spacing** (column "POV_RATE", code "e02"). Questions must use the resolved names from the tool result where the result has them (headers), not the raw settings. Pinned in Task 2 Step 1 (rank uses `header.column`).
2. **A refusal whose list is empty or huge.** No row for an empty list; at most 8 for a long one. Pinned in Task 3 Step 1.
3. **A relate year refusal with no shared year.** No choices, since nothing can work; never offer one side's year that the other side lacks. Pinned in Task 3 Step 1.
4. **Feb 29 in "same period a year earlier".** It becomes Feb 28, never an impossible date. Pinned in Task 2 Step 1.
5. **Clicking a button twice, or a different button after the first.** The box gets the latest question each time and nothing is sent. Pinned in Task 4 (e2e clicks two buttons in a row).

---

### Task 1: The shared fill path, newest-turn helper, and the FollowUps row

**Files:**
- Create: `ui/components/askFill.ts`
- Create: `ui/components/FollowUps.tsx`
- Modify: `ui/components/AskPanel.tsx` (PromptFill moves to askFill.ts; context gains `fill`; Note provides `NewestTurn`)
- Modify: `ui/lib/askNotes.ts` (add `newestTurnCallIds`)
- Modify: `ui/components/ask.module.css` (`.followUps`, `.pickLabel`)
- Test: `tests/ui/askNotes.test.ts` (existing file if present, else create)

**Interfaces:**
- Produces:
  - `type FollowUp = { label: string; question: string }` (exported from `ui/components/FollowUps.tsx`);
  - `FollowUps({ items, id, pick }: { items: FollowUp[]; id?: string; pick?: boolean }): ReactElement | null`;
  - `PromptFill` context `{ prompt: string; placed: () => void; fill: (text: string) => void }` and `NewestTurn` context `Set<string>` (both from `ui/components/askFill.ts`);
  - `newestTurnCallIds(messages): Set<string>` (from `ui/lib/askNotes.ts`).

- [ ] **Step 1: Write the failing test** for `newestTurnCallIds`. Check whether `tests/ui/askNotes.test.ts` exists (`ls tests/ui | grep -i notes`) and add to it, or create it.

```ts
import { describe, expect, it } from "vitest";
import { newestTurnCallIds } from "../../ui/lib/askNotes";

describe("newestTurnCallIds", () => {
  const call = (id: string, name = "rankTracts") => ({ id, function: { name } });
  it("returns the tool calls after the last question, never an earlier answer's", () => {
    const messages = [
      { id: "u1", role: "user" },
      { id: "a1", role: "assistant", toolCalls: [call("c1"), call("c2", "countRecords")] },
      { id: "u2", role: "user" },
      { id: "a2", role: "assistant", toolCalls: [call("c3")] },
      { id: "a3", role: "assistant", toolCalls: [call("c4", "showDataset")] },
    ];
    expect([...newestTurnCallIds(messages)]).toEqual(["c3", "c4"]);
  });
  it("is empty before any tool call and right after a new question", () => {
    expect(newestTurnCallIds([]).size).toBe(0);
    expect(newestTurnCallIds([{ id: "u1", role: "user" }, { id: "a1", role: "assistant", toolCalls: [call("c1")] }, { id: "u2", role: "user" }]).size).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run tests/ui/askNotes.test.ts`
Expected: FAIL, because `newestTurnCallIds` is not exported.

- [ ] **Step 3: Write the implementation**

Append to `ui/lib/askNotes.ts`:

```ts
// The newest answer's tool calls (after the last question): only these get follow-up buttons, so the conversation
// never fills with stale ones.
export function newestTurnCallIds(messages: CallMsg[]): Set<string> {
  let turn = new Set<string>();
  for (const m of messages) {
    if (m.role === "user") turn = new Set();
    for (const c of m.toolCalls ?? []) turn.add(c.id);
  }
  return turn;
}
```

Create `ui/components/askFill.ts`:

```ts
"use client";
import { createContext } from "react";

// The question box's one way in besides typing: the guide's ?prompt= links and the follow-up buttons both set
// `prompt`; the chat view types it in (as if the person had) and focuses the box. Nothing here ever sends.
export const PromptFill = createContext<{ prompt: string; placed: () => void; fill: (text: string) => void }>({
  prompt: "", placed: () => {}, fill: () => {},
});

// The newest answer's tool-call ids (ui/lib/askNotes.ts newestTurnCallIds); FollowUps render only for these.
export const NewestTurn = createContext<Set<string>>(new Set());
```

In `ui/components/AskPanel.tsx`:
- Delete the local `const PromptFill = createContext<…>(…)` line, and import `{ NewestTurn, PromptFill }` from `./askFill`.
- Import `newestTurnCallIds` from `@/ui/lib/askNotes`.
- In `PrefillChatView`'s effect, after focusing, scroll the box into view on small screens:

```ts
    requestAnimationFrame(() => {
      const box = document.querySelector<HTMLTextAreaElement>('section[aria-label="Ask"] textarea');
      box?.focus();
      box?.scrollIntoView({ block: "nearest" });
    });
```

  (This replaces the existing one-line `requestAnimationFrame(() => …focus())`.)
- In `AskPanel`, the provider value becomes `{ prompt, placed, fill: setPrompt }`:

```tsx
        <PromptFill.Provider value={{ prompt, placed, fill: setPrompt }}>
```

- In `Note`, wrap the existing `<NewestCount.Provider …>` with `<NewestTurn.Provider value={newestTurnCallIds(messages as never)}>` … `</NewestTurn.Provider>`.

Create `ui/components/FollowUps.tsx`:

```tsx
"use client";
import { useContext } from "react";
import { NewestTurn, PromptFill } from "./askFill";
import styles from "./ask.module.css";

export type FollowUp = { label: string; question: string };

// Next-question ideas (under a card) or "Pick one:" options (under a refusal). Code-built (ui/lib/nextQuestions.ts,
// ui/lib/refusalChoices.ts); a click fills the question box and never sends. Newest answer only.
export function FollowUps({ items, id, pick }: { items: FollowUp[]; id?: string; pick?: boolean }) {
  const newest = useContext(NewestTurn);
  const { fill } = useContext(PromptFill);
  if (!items.length || !id || !newest.has(id)) return null;
  return (
    <div className={styles.followUps} role="group" aria-label={pick ? "Pick one. Each fills the question box" : "Next questions. Each fills the question box"} data-follow-ups={pick ? "pick" : "next"}>
      {pick && <span className={styles.pickLabel}>Pick one:</span>}
      {items.map((f) => (
        <button key={f.label + f.question} type="button" className={styles.expand} onClick={() => fill(f.question)}>
          {f.label}
        </button>
      ))}
    </div>
  );
}
```

Append to `ui/components/ask.module.css`:

```css
/* Follow-up buttons under the newest answer: ruled caps buttons (the EXPAND style), wrapping on phones. */
.followUps { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 10px 0 0; }
.pickLabel { font-family: var(--font-caps); font-weight: 700; text-transform: uppercase; }
```

- [ ] **Step 4: Run the tests, typecheck and the full suite**

Run: `npx vitest run tests/ui/askNotes.test.ts && npx tsc --noEmit -p . && npx vitest run --maxWorkers=4`
Expected: PASS. Nothing renders `FollowUps` yet; the existing prefill behaviour is unchanged.

- [ ] **Step 5: Commit**

```bash
git add ui/components/askFill.ts ui/components/FollowUps.tsx ui/components/AskPanel.tsx ui/lib/askNotes.ts ui/components/ask.module.css tests/ui/askNotes.test.ts
git commit -m "feat: a shared fill path and a follow-up button row for the newest answer (fills, never sends)"
```

---

### Task 2: Next-question rules (`ui/lib/nextQuestions.ts`)

**Files:**
- Create: `ui/lib/nextQuestions.ts`
- Test: `tests/ui/nextQuestions.test.ts`

**Interfaces:**
- Consumes: `subject`, `placeName`, `EXACT` from `ui/lib/tractSummary.ts`; `FollowUp` type from `ui/components/FollowUps.tsx`. Import it with `import type`, a type-only import.
- Produces:
  - `rankFollowUps(h: Col, direction: "high" | "low"): FollowUp[]`
  - `changeFollowUps(h: Col, to: string): FollowUp[]`
  - `relateFollowUps(r: RelateIn): FollowUp[]`
  - `countFollowUps(args: CountArgsIn, r: CountIn): FollowUp[]`
  - `numberFollowUps(r: { topic: string; label: string }): FollowUp[]`
  - `datasetFollowUps(r: { code: string; name: string; storyAngles?: string[] }): FollowUp[]`
  - `previewFollowUps(r: { code: string; name: string; fields: string[] }): FollowUp[]`
  - exported types `Col`, `RelateIn`, `CountArgsIn`, `CountIn`, as defined in the code below.

- [ ] **Step 1: Write the failing test**

```ts
// tests/ui/nextQuestions.test.ts
import { describe, expect, it } from "vitest";
import { changeFollowUps, countFollowUps, datasetFollowUps, numberFollowUps, previewFollowUps, rankFollowUps, relateFollowUps } from "../../ui/lib/nextQuestions";

const pov = { code: "E02", name: "Households Living in Poverty", column: "pov_rate", meaning: "Estimate - Percentage of households with income below the poverty line Calculation: x", place: "County", year: "2024", confidence: "90% confidence (Census)" };
const home = { code: "H28", name: "Master Property File (MPROP)", column: "median_value", meaning: "Median assessed value of homes (houses and condos)", place: "City", year: "2026 assessment", confidence: "exact (City records)" };
const food = { code: "F02", name: "Food Insecurity Prevalence", column: "per_insecure", meaning: "Estimate - percentage of adults food insecure", place: "County", year: "2023", confidence: "95% confidence (CDC)" };

// No figure of our own: every digit run in a question appears in what it was built from.
const digitsOk = (q: string, ...from: unknown[]) => (q.match(/\d+/g) ?? []).every((d) => JSON.stringify(from).includes(d));

describe("ranking", () => {
  it("offers the other end, where it changed, and what goes with it, naming code and column", () => {
    const f = rankFollowUps(pov, "high");
    expect(f.map((x) => x.label)).toEqual(["SHOW THE LOWEST", "WHERE DID IT CHANGE?", "WHAT GOES WITH IT?"]);
    expect(f[0].question).toBe("Rank census tracts by percentage of households with income below the poverty line, lowest first, Milwaukee County 2024 (E02 pov_rate).");
    expect(f[1].question).toBe("Where did percentage of households with income below the poverty line change most in Milwaukee County, from an earlier year to 2024? (E02 pov_rate)");
    for (const x of f) expect(digitsOk(x.question, pov)).toBe(true);
    expect(rankFollowUps(pov, "low")[0].label).toBe("SHOW THE HIGHEST");
  });
  it("never offers change over time for exact City figures", () => {
    expect(rankFollowUps(home, "high").map((x) => x.label)).toEqual(["SHOW THE LOWEST", "WHAT GOES WITH IT?"]);
  });
});

describe("change", () => {
  it("ranks by the later year and asks what goes with it", () => {
    const f = changeFollowUps({ ...pov, year: "2022–2023" }, "2023");
    expect(f.map((x) => x.label)).toEqual(["RANK BY THIS", "WHAT GOES WITH IT?"]);
    expect(f[0].question).toContain("highest first, Milwaukee County 2023 (E02 pov_rate)");
  });
});

describe("relate and mismatch", () => {
  const base = { a: pov, b: food, place: "County", year: "2023", strength: "strong" as const };
  it("relate offers both mismatches", () => {
    const f = relateFollowUps({ ...base, mode: "relate" });
    expect(f.map((x) => x.label)).toEqual(["ONE HIGH, THE OTHER LOW", "THE OTHER WAY ROUND"]);
    expect(f[0].question).toContain("high percentage of households with income below the poverty line (E02 pov_rate) but low");
    expect(f[0].question).toContain("(F02 per_insecure)");
  });
  it("relate with too few tracts offers nothing", () => {
    expect(relateFollowUps({ ...base, mode: "relate", strength: "too-few" })).toEqual([]);
  });
  it("mismatch offers the relationship and the flipped sides", () => {
    const f = relateFollowUps({ ...base, mode: "mismatch", aSide: "high", bSide: "low" });
    expect(f.map((x) => x.label)).toEqual(["DO THEY GO TOGETHER?", "FLIP THE SIDES"]);
    expect(f[1].question).toContain("low percentage of households with income below the poverty line (E02 pov_rate) but high");
  });
});

describe("City counts", () => {
  const r = { code: "P01", name: "NIBRS Crime Data", filters: ["Robbery"], period: "Jan 1, 2026 – Oct 11, 2026", dateColumn: "Incident_Date", map: {}, of: undefined };
  it("by month, a year earlier with explicit dates, and in a neighborhood", () => {
    const f = countFollowUps({ code: "P01", from: "2026-01-01", to: "2026-10-11", filters: [{ column: "Offense_All", values: ["robbery"] }] }, r);
    expect(f.map((x) => x.label)).toEqual(["BY MONTH", "SAME PERIOD A YEAR EARLIER", "IN A NEIGHBORHOOD"]);
    expect(f[0].question).toBe("Count P01 NIBRS Crime Data (Robbery), Jan 1, 2026 – Oct 11, 2026, by month.");
    expect(f[1].question).toBe("Count P01 NIBRS Crime Data (Robbery), from 2025-01-01 to 2025-10-11.");
    expect(f[2].question).toBe("Count P01 NIBRS Crime Data (Robbery), Jan 1, 2026 – Oct 11, 2026, in ");
  });
  it("skips what doesn't apply: grouped already, no explicit dates, already in a neighborhood, no locations", () => {
    expect(countFollowUps({ code: "P01", groupBy: "month", neighborhood: "Harambee" }, r).map((x) => x.label)).toEqual([]);
    expect(countFollowUps({ code: "P01" }, { ...r, map: null, dateColumn: null })).toEqual([]);
  });
  it("moves Feb 29 to Feb 28 a year earlier", () => {
    expect(countFollowUps({ code: "P01", from: "2024-02-29", to: "2024-03-31" }, r)[1].question).toContain("from 2023-02-28 to 2023-03-31");
  });
  it("property counts offer typical home value by tract and by district, never by month", () => {
    const p = { code: "H28", name: "Master Property File (MPROP)", filters: ["assessed over $200,000"], period: "2026 assessment", dateColumn: "CONVEY_DATE", map: null, of: { count: 1, label: "x" } };
    const f = countFollowUps({ code: "H28", filters: [{ column: "C_A_TOTAL", over: 200000 }] }, p);
    expect(f.map((x) => x.label)).toEqual(["TYPICAL HOME VALUE BY TRACT", "BY DISTRICT"]);
    expect(f[1].question).toBe("Count H28 Master Property File (MPROP) (assessed over $200,000), 2026 assessment, by aldermanic district.");
    expect(countFollowUps({ code: "H28", groupBy: "GEO_ALDER" }, p).map((x) => x.label)).toEqual(["TYPICAL HOME VALUE BY TRACT"]);
  });
});

describe("tables, datasets, previews", () => {
  it("N03 row: another neighborhood, with the cursor at the end", () => {
    expect(numberFollowUps({ topic: "Poverty Status by Age", label: "Under 5 years" })).toEqual([{ label: "ANOTHER NEIGHBORHOOD", question: 'Poverty Status by Age: "Under 5 years" in ' }]);
  });
  it("dataset: story angles only when the sheet has some, and the caveats", () => {
    expect(datasetFollowUps({ code: "H05", name: "Housing Built Before 1950", storyAngles: ["x"] }).map((x) => x.label)).toEqual(["STORY ANGLES", "WHAT ARE THE CAVEATS?"]);
    expect(datasetFollowUps({ code: "H05", name: "Housing Built Before 1950" }).map((x) => x.label)).toEqual(["WHAT ARE THE CAVEATS?"]);
  });
  it("preview: rank tracts only for tract datasets", () => {
    expect(previewFollowUps({ code: "E02", name: "Households Living in Poverty", fields: ["OBJECTID", "geoid", "pov_rate"] })[0]).toEqual({ label: "RANK TRACTS ON THIS", question: "Which census tracts rank highest on E02 Households Living in Poverty?" });
    expect(previewFollowUps({ code: "V02", name: "Daily Air Quality", fields: ["date", "aqi"] }).map((x) => x.label)).toEqual(["WHAT ARE THE CAVEATS?"]);
  });
  it("never more than three", () => {
    for (const f of [rankFollowUps(pov, "high"), datasetFollowUps({ code: "X", name: "Y", storyAngles: ["a"] })]) expect(f.length).toBeLessThanOrEqual(3);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run tests/ui/nextQuestions.test.ts`
Expected: FAIL, because the module doesn't exist.

- [ ] **Step 3: Write the implementation**

```ts
// ui/lib/nextQuestions.ts
// Next-question ideas under a card (docs/superpowers/specs/2026-10-11-follow-up-buttons-design.md §4). Code-built
// from the card's own settings and result: a button appears only when the card holds what it needs, and its question
// names the dataset code and column so Ask asks for exactly what the button meant. No figures of our own.
import type { FollowUp } from "@/ui/components/FollowUps";
import { EXACT, placeName, subject } from "./tractSummary";

const MAX = 3;
export type Col = { code: string; name: string; column: string; meaning: string; place: string; year: string; confidence: string | null };
const ref = (h: Pick<Col, "code" | "column">) => `(${h.code} ${h.column})`;
const end = (d: "high" | "low") => (d === "high" ? "highest" : "lowest");
const rankQ = (h: Col, d: "high" | "low", year = h.year) => `Rank census tracts by ${subject(h)}, ${end(d)} first, ${placeName(h.place)} ${year} ${ref(h)}.`;
const goesWith = (h: Col, year: string) => `What else goes with ${subject(h)} across ${placeName(h.place)} census tracts in ${year}? ${ref(h)}`;

export function rankFollowUps(h: Col, direction: "high" | "low"): FollowUp[] {
  const out: FollowUp[] = [{ label: direction === "high" ? "SHOW THE LOWEST" : "SHOW THE HIGHEST", question: rankQ(h, direction === "high" ? "low" : "high") }];
  // Exact City figures hold one assessment: no change over time.
  if (h.confidence !== EXACT) out.push({ label: "WHERE DID IT CHANGE?", question: `Where did ${subject(h)} change most in ${placeName(h.place)}, from an earlier year to ${h.year}? ${ref(h)}` });
  out.push({ label: "WHAT GOES WITH IT?", question: goesWith(h, h.year) });
  return out.slice(0, MAX);
}

export function changeFollowUps(h: Col, to: string): FollowUp[] {
  return [{ label: "RANK BY THIS", question: rankQ(h, "high", to) }, { label: "WHAT GOES WITH IT?", question: goesWith(h, to) }];
}

export type RelateIn = { mode: "relate" | "mismatch"; a: Col; b: Col; place: string; year: string; strength: "too-few" | "little" | "weak" | "moderate" | "strong"; aSide?: "high" | "low"; bSide?: "high" | "low" };
const side = (h: Col) => `${subject(h)} ${ref(h)}`;
const mismatchQ = (r: RelateIn, aSide: "high" | "low", bSide: "high" | "low") =>
  `Which census tracts in ${placeName(r.place)} (${r.year}) have ${aSide} ${side(r.a)} but ${bSide} ${side(r.b)}?`;

export function relateFollowUps(r: RelateIn): FollowUp[] {
  if (r.mode === "relate") {
    if (r.strength === "too-few") return [];
    return [{ label: "ONE HIGH, THE OTHER LOW", question: mismatchQ(r, "high", "low") }, { label: "THE OTHER WAY ROUND", question: mismatchQ(r, "low", "high") }];
  }
  const a = r.aSide ?? "high", b = r.bSide ?? "low";
  return [
    { label: "DO THEY GO TOGETHER?", question: `Does ${side(r.a)} go together with ${side(r.b)} across ${placeName(r.place)} census tracts in ${r.year}?` },
    { label: "FLIP THE SIDES", question: mismatchQ(r, a === "high" ? "low" : "high", b === "high" ? "low" : "high") },
  ];
}

export type CountArgsIn = { code: string; from?: string; to?: string; filters?: { column: string; values?: string[]; over?: number; under?: number }[]; groupBy?: string; neighborhood?: string };
export type CountIn = { code: string; name: string; filters: string[]; period: string; dateColumn: string | null; map: unknown | null; of?: unknown };
const countBase = (r: CountIn) => `Count ${r.code} ${r.name}${r.filters.length ? ` (${r.filters.join(", ")})` : ""}`;
// A year earlier; Feb 29 becomes Feb 28 (the year before has none).
const yearEarlier = (iso: string) => `${Number(iso.slice(0, 4)) - 1}${iso.slice(4, 10) === "-02-29" ? "-02-28" : iso.slice(4)}`;

export function countFollowUps(args: CountArgsIn, r: CountIn): FollowUp[] {
  const where = args.neighborhood ? ` in ${args.neighborhood}` : "";
  if (r.of) {
    const out: FollowUp[] = [{ label: "TYPICAL HOME VALUE BY TRACT", question: `Which census tracts have the highest typical home value in the City's Master Property File (${r.code})?` }];
    if (!args.groupBy) out.push({ label: "BY DISTRICT", question: `${countBase(r)}, ${r.period}, by aldermanic district.` });
    return out;
  }
  const out: FollowUp[] = [];
  if (r.dateColumn && !args.groupBy) out.push({ label: "BY MONTH", question: `${countBase(r)}${where}, ${r.period}, by month.` });
  if (args.from && args.to) out.push({ label: "SAME PERIOD A YEAR EARLIER", question: `${countBase(r)}${where}, from ${yearEarlier(args.from)} to ${yearEarlier(args.to)}.` });
  if (r.map && !args.neighborhood) out.push({ label: "IN A NEIGHBORHOOD", question: `${countBase(r)}, ${r.period}, in ` });
  return out.slice(0, MAX);
}

export const numberFollowUps = (r: { topic: string; label: string }): FollowUp[] => [{ label: "ANOTHER NEIGHBORHOOD", question: `${r.topic}: "${r.label}" in ` }];

const caveats = (r: { code: string; name: string }): FollowUp => ({ label: "WHAT ARE THE CAVEATS?", question: `What are the caveats on ${r.code} ${r.name}?` });

export function datasetFollowUps(r: { code: string; name: string; storyAngles?: string[] }): FollowUp[] {
  return [...(r.storyAngles?.length ? [{ label: "STORY ANGLES", question: `Give me story angles using ${r.code} ${r.name}.` }] : []), caveats(r)];
}

export function previewFollowUps(r: { code: string; name: string; fields: string[] }): FollowUp[] {
  const tract = r.fields.some((f) => f.toUpperCase() === "GEOID");
  return [...(tract ? [{ label: "RANK TRACTS ON THIS", question: `Which census tracts rank highest on ${r.code} ${r.name}?` }] : []), caveats(r)];
}
```

- [ ] **Step 4: Run the tests and the typecheck**

Run: `npx vitest run tests/ui/nextQuestions.test.ts && npx tsc --noEmit -p .`
Expected: PASS. If an expected sentence differs only because `subject()` words a meaning differently, check `subject` in `ui/lib/tractSummary.ts`: it strips "Estimate - " and the formula and lowercases a common lead word. Fix the test's expected text to what `subject` returns. Never change `subject`.

- [ ] **Step 5: Commit**

```bash
git add ui/lib/nextQuestions.ts tests/ui/nextQuestions.test.ts
git commit -m "feat: next-question rules per card, built from the card's own settings and result"
```

---

### Task 3: "Pick one:" choices (`ui/lib/refusalChoices.ts`)

**Files:**
- Create: `ui/lib/refusalChoices.ts`
- Test: `tests/ui/refusalChoices.test.ts`

**Interfaces:**
- Consumes: `plainMeaning` from `ui/lib/tractFormat.ts`; `placeName` from `ui/lib/tractSummary.ts`; the `FollowUp` type (with `import type`).
- Produces:
  - `rankChoices(args: { code: string; column: string; place: string; year: string; direction: "high" | "low"; cutoff?: number }, r: TractRefusal): FollowUp[]`
  - `changeChoices(args: { code: string; column: string; place: string; from: string; to: string }, r: TractRefusal): FollowUp[]`
  - `relateChoices(args: RelateArgs, r: TractRefusal): FollowUp[]`
  - `countChoices(args: CountArgsIn, r: CountRefusal): FollowUp[]` (`CountArgsIn` from `ui/lib/nextQuestions.ts`)
  - `numberChoices(args: { neighborhood: string; topic: string; year?: number; row: string }, r: NumberRefusal): FollowUp[]`
  - exported types `TractRefusal`, `RelateArgs`, `CountRefusal`, `NumberRefusal`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/ui/refusalChoices.test.ts
import { describe, expect, it } from "vitest";
import { changeChoices, countChoices, numberChoices, rankChoices, relateChoices } from "../../ui/lib/refusalChoices";

const rankArgs = { code: "E02", column: "nope", place: "County", year: "2023", direction: "high" as const };
const columns = [
  { column: "households", meaning: "Estimate - total number of households", range: true },
  { column: "pov_rate", meaning: "Estimate - Percentage of households with income below the poverty line Calculation: (poverty / households) x 100", range: true },
  { column: "share", meaning: "", range: false },
];

describe("tract tool choices", () => {
  it("choose-column: the server's columns, those with margins first, plain meaning cut with the column name", () => {
    const c = rankChoices(rankArgs, { status: "choose-column", columns: [columns[2], ...columns.slice(0, 2)] });
    expect(c.map((x) => x.label)).toEqual(["total number of households (households)", "Percentage of households with income below the poverty line (pov_rate)", "share"]);
    expect(c[1].question).toBe("Rank census tracts by Percentage of households with income below the poverty line, highest first, Milwaukee County 2023 (E02 pov_rate).");
  });
  it("cuts a long meaning at 60 characters", () => {
    const long = { column: "x", meaning: "A".repeat(80), range: true };
    expect(rankChoices(rankArgs, { status: "choose-column", columns: [long] })[0].label).toBe(`${"A".repeat(59)}… (x)`);
  });
  it("choose-year: the offered places and years", () => {
    const c = rankChoices({ ...rankArgs, column: "pov_rate" }, { status: "choose-year", available: [{ place: "City", year: "2022" }, { place: "County", year: "2024" }] });
    expect(c.map((x) => x.label)).toEqual(["City 2022", "County 2024"]);
    expect(c[1].question).toContain("Milwaukee County 2024 (E02 pov_rate)");
  });
  it("change: a wrong second year swaps 'to', otherwise 'from', same place only", () => {
    const args = { code: "E02", column: "pov_rate", place: "County", from: "2021", to: "2030" };
    const c = changeChoices(args, { status: "choose-year", year: "2030", available: [{ place: "County", year: "2024" }, { place: "City", year: "2023" }] });
    expect(c).toEqual([{ label: "2024", question: "Where did pov_rate change most in Milwaukee County from 2021 to 2024? (E02 pov_rate)" }]);
  });
  it("relate: swaps only the refused side's column; years offered are the shared ones only", () => {
    const args = { a: { code: "E02", column: "pov_rate" }, b: { code: "F02", column: "nope" }, place: "County", year: "2023", mode: "relate" as const };
    const c = relateChoices(args, { status: "choose-column", dataset: "b", columns: [{ column: "per_insecure", meaning: "Estimate - percentage of adults food insecure", range: true }] });
    expect(c[0].question).toBe("Does E02 pov_rate go together with percentage of adults food insecure (F02 per_insecure) across Milwaukee County census tracts in 2023?");
    expect(relateChoices(args, { status: "choose-year", available: { a: [], b: [] }, shared: [] })).toEqual([]);
    expect(relateChoices(args, { status: "choose-year", available: { a: [], b: [] }, shared: [{ place: "County", year: "2023" }] })[0].label).toBe("County 2023");
  });
  it("never more than eight, and nothing for an empty list", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ column: `c${i}`, meaning: "", range: true }));
    expect(rankChoices(rankArgs, { status: "choose-column", columns: many })).toHaveLength(8);
    expect(rankChoices(rankArgs, { status: "choose-column", columns: [] })).toEqual([]);
  });
});

describe("City count choices", () => {
  const args = { code: "P01", from: "2026-01-01", filters: [{ column: "Offense_All", values: ["theft"] }] };
  it("choose: swaps the asked filter's value (or the neighborhood)", () => {
    const c = countChoices(args, { status: "choose", name: "NIBRS Crime Data", column: "Offense_All", choices: ["Shoplifting", "Theft From Building"] });
    expect(c.map((x) => x.label)).toEqual(["Shoplifting", "Theft From Building"]);
    expect(c[0].question).toBe("Count P01 NIBRS Crime Data where Offense_All is Shoplifting, from 2026-01-01.");
    expect(countChoices({ code: "P01" }, { status: "choose", name: "NIBRS Crime Data", column: "neighborhood", choices: ["Harambee"] })[0].question).toBe("Count P01 NIBRS Crime Data in Harambee.");
  });
  it("bad-column: swaps the group or the filter's column", () => {
    expect(countChoices({ code: "P01", groupBy: "District" }, { status: "bad-column", name: "NIBRS Crime Data", column: "District", columns: ["Police_District"] })[0].question).toBe("Count P01 NIBRS Crime Data, by Police_District.");
  });
  it("no-neighborhood: the nearest names", () => {
    expect(countChoices({ code: "P01", neighborhood: "Harambe" }, { status: "no-neighborhood", name: "NIBRS Crime Data", nearest: ["Harambee"] })[0].question).toBe("Count P01 NIBRS Crime Data in Harambee.");
  });
});

describe("N03 table choices", () => {
  const args = { neighborhood: "Harambe", topic: "Poverty Status by Age", row: "Under 5 years", year: 2024 };
  it("neighborhoods, topics and rows each swap one part", () => {
    expect(numberChoices(args, { status: "no-neighborhood", neighborhoods: ["Harambee"] })[0].question).toBe('Poverty Status by Age: "Under 5 years" in Harambee (2024).');
    expect(numberChoices(args, { status: "no-topic", topics: ["Poverty Status"] })[0].question).toBe('Poverty Status: "Under 5 years" in Harambe (2024).');
    expect(numberChoices({ ...args, year: undefined }, { status: "choose-row", rows: ["5 to 17 years"] })[0].question).toBe('Poverty Status by Age: "5 to 17 years" in Harambe.');
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run tests/ui/refusalChoices.test.ts`
Expected: FAIL, because the module doesn't exist.

- [ ] **Step 3: Write the implementation**

```ts
// ui/lib/refusalChoices.ts
// "Pick one:" options when Ask's tool couldn't tell what was meant (spec §5): only the options the server listed,
// each turning the original request into a full question with that one choice swapped in. At most eight.
import type { FollowUp } from "@/ui/components/FollowUps";
import type { CountArgsIn } from "./nextQuestions";
import { plainMeaning } from "./tractFormat";
import { placeName } from "./tractSummary";

const MAX = 8;
const CUT = 60;
type Slot = { place: string; year: string };
export type TractRefusal =
  | { status: "choose-column"; columns: { column: string; meaning: string; range: boolean }[]; dataset?: "a" | "b" }
  | { status: "choose-year"; available: Slot[] | { a: Slot[]; b: Slot[] }; shared?: Slot[]; year?: string; dataset?: "a" | "b" }
  | { status: string };

const clean = (meaning: string) => plainMeaning(meaning).replace(/^estimate\s*-\s*/i, "").trim();
const cut = (s: string) => (s.length > CUT ? `${s.slice(0, CUT - 1).trimEnd()}…` : s);
const columnLabel = (c: { column: string; meaning: string }) => (clean(c.meaning) ? `${cut(clean(c.meaning))} (${c.column})` : c.column);
const byMargin = <T extends { range: boolean }>(cols: T[]) => [...cols.filter((c) => c.range), ...cols.filter((c) => !c.range)];
const slots = (a: TractRefusal) => ("available" in a && Array.isArray(a.available) ? a.available : []);
const end = (d: "high" | "low") => (d === "high" ? "highest" : "lowest");

type RankArgs = { code: string; column: string; place: string; year: string; direction: "high" | "low"; cutoff?: number };
const rankQ = (a: RankArgs, column: string, words: string) =>
  `Rank census tracts by ${words}, ${end(a.direction)} first, ${placeName(a.place)} ${a.year} (${a.code} ${column}).`;

export function rankChoices(args: RankArgs, r: TractRefusal): FollowUp[] {
  if (r.status === "choose-column" && "columns" in r)
    return byMargin(r.columns).slice(0, MAX).map((c) => ({ label: columnLabel(c), question: rankQ(args, c.column, clean(c.meaning) || c.column) }));
  if (r.status === "choose-year")
    return slots(r).slice(0, MAX).map((s) => ({ label: `${s.place} ${s.year}`, question: rankQ({ ...args, place: s.place, year: s.year }, args.column, args.column) }));
  return [];
}

type ChangeArgs = { code: string; column: string; place: string; from: string; to: string };
const changeQ = (a: ChangeArgs, column: string, words: string) =>
  `Where did ${words} change most in ${placeName(a.place)} from ${a.from} to ${a.to}? (${a.code} ${column})`;

export function changeChoices(args: ChangeArgs, r: TractRefusal): FollowUp[] {
  if (r.status === "choose-column" && "columns" in r)
    return byMargin(r.columns).slice(0, MAX).map((c) => ({ label: columnLabel(c), question: changeQ(args, c.column, clean(c.meaning) || c.column) }));
  if (r.status === "choose-year") {
    // compareYears tags a refused second year with `year`; otherwise the first year is the one to change.
    const second = "year" in r && Boolean(r.year);
    return slots(r).filter((s) => s.place === args.place).slice(0, MAX)
      .map((s) => ({ label: s.year, question: changeQ(second ? { ...args, to: s.year } : { ...args, from: s.year }, args.column, args.column) }));
  }
  return [];
}

export type RelateArgs = { a: { code: string; column: string; cutoff?: number }; b: { code: string; column: string; cutoff?: number }; place: string; year: string; mode: "relate" | "mismatch"; aSide?: "high" | "low"; bSide?: "high" | "low" };
const sideText = (s: { code: string; column: string }, words?: string) => (words ? `${words} (${s.code} ${s.column})` : `${s.code} ${s.column}`);
function relateQ(a: RelateArgs, aWords?: string, bWords?: string) {
  const A = sideText(a.a, aWords), B = sideText(a.b, bWords);
  return a.mode === "mismatch"
    ? `Which census tracts in ${placeName(a.place)} (${a.year}) have ${a.aSide ?? "high"} ${A} but ${a.bSide ?? "low"} ${B}?`
    : `Does ${A} go together with ${B} across ${placeName(a.place)} census tracts in ${a.year}?`;
}

export function relateChoices(args: RelateArgs, r: TractRefusal): FollowUp[] {
  if (r.status === "choose-column" && "columns" in r) {
    const which = r.dataset ?? "a";
    return byMargin(r.columns).slice(0, MAX).map((c) => {
      const next = { ...args, [which]: { ...args[which], column: c.column } } as RelateArgs;
      const words = clean(c.meaning) || undefined;
      return { label: columnLabel(c), question: which === "a" ? relateQ(next, words) : relateQ(next, undefined, words) };
    });
  }
  // Two datasets: only a place and year both have can work.
  if (r.status === "choose-year" && "shared" in r)
    return (r.shared ?? []).slice(0, MAX).map((s) => ({ label: `${s.place} ${s.year}`, question: relateQ({ ...args, place: s.place, year: s.year }) }));
  return [];
}

export type CountRefusal =
  | { status: "choose"; name: string; column: string; choices: string[] }
  | { status: "bad-column"; name: string; column: string; columns: string[] }
  | { status: "no-neighborhood"; name: string; nearest: string[] }
  | { status: string; name?: string };

function countQ(a: CountArgsIn, name: string) {
  const filters = (a.filters ?? []).map((f) =>
    f.values?.length ? `${f.column} is ${f.values.join(" or ")}` : [f.over !== undefined && `${f.column} over ${f.over}`, f.under !== undefined && `${f.column} under ${f.under}`].filter(Boolean).join(" and "));
  const parts = [
    filters.length ? ` where ${filters.join(" and ")}` : "",
    a.neighborhood ? ` in ${a.neighborhood}` : "",
    a.from || a.to ? `, ${a.from ? `from ${a.from}` : ""}${a.from && a.to ? " " : ""}${a.to ? `to ${a.to}` : ""}` : "",
    a.groupBy ? `, by ${a.groupBy}` : "",
  ];
  return `Count ${a.code} ${name}${parts.join("")}.`;
}

export function countChoices(args: CountArgsIn, r: CountRefusal): FollowUp[] {
  if (r.status === "choose" && "choices" in r) {
    return r.choices.slice(0, MAX).map((v) => ({
      label: v,
      question: countQ(r.column === "neighborhood"
        ? { ...args, neighborhood: v }
        : { ...args, filters: [...(args.filters ?? []).filter((f) => f.column !== r.column), { column: r.column, values: [v] }] }, r.name),
    }));
  }
  if (r.status === "bad-column" && "columns" in r) {
    return r.columns.slice(0, MAX).map((c) => ({
      label: c,
      question: countQ(args.groupBy === r.column
        ? { ...args, groupBy: c }
        : { ...args, filters: (args.filters ?? []).map((f) => (f.column === r.column ? { ...f, column: c } : f)) }, r.name),
    }));
  }
  if (r.status === "no-neighborhood" && "nearest" in r) return r.nearest.slice(0, MAX).map((n) => ({ label: n, question: countQ({ ...args, neighborhood: n }, r.name) }));
  return [];
}

export type NumberRefusal = { status: "no-neighborhood"; neighborhoods: string[] } | { status: "no-topic"; topics: string[] } | { status: "choose-row"; rows: string[] } | { status: string };
type NumberArgs = { neighborhood: string; topic: string; year?: number; row: string };
const numberQ = (a: NumberArgs) => `${a.topic}: "${a.row}" in ${a.neighborhood}${a.year ? ` (${a.year})` : ""}.`;

export function numberChoices(args: NumberArgs, r: NumberRefusal): FollowUp[] {
  const pick = (list: string[], set: (v: string) => NumberArgs) => list.slice(0, MAX).map((v) => ({ label: v, question: numberQ(set(v)) }));
  if (r.status === "no-neighborhood" && "neighborhoods" in r) return pick(r.neighborhoods, (v) => ({ ...args, neighborhood: v }));
  if (r.status === "no-topic" && "topics" in r) return pick(r.topics, (v) => ({ ...args, topic: v }));
  if (r.status === "choose-row" && "rows" in r) return pick(r.rows, (v) => ({ ...args, row: v }));
  return [];
}
```

- [ ] **Step 4: Run the tests and the typecheck**

Run: `npx vitest run tests/ui/refusalChoices.test.ts && npx tsc --noEmit -p .`
Expected: PASS. If `plainMeaning` keeps a capital that the test expects in lowercase, the test's expectation is the thing to fix. The label shows the meaning as DYCU wrote it, minus "Estimate - " and the formula.

- [ ] **Step 5: Commit**

```bash
git add ui/lib/refusalChoices.ts tests/ui/refusalChoices.test.ts
git commit -m "feat: 'Pick one:' choices from the server's own lists, each a full question with one choice swapped in"
```

---

### Task 4: Wire the buttons into Ask's cards, plus the scripted model and browser tests

**Files:**
- Modify: `ui/components/AskCards.tsx` (renderers for showDataset, previewData, getNumber, countRecords, rankTracts, compareYears, relateTracts)
- Modify: `lib/ask/model.ts` (scripted question "wrong column")
- Modify: `e2e/ask.spec.ts` (signed-in tests)

**Interfaces:**
- Consumes:
  - `FollowUps` and `FollowUp` (Task 1);
  - every `*FollowUps` function (Task 2) and every `*Choices` function (Task 3);
  - `props.parameters`, `props.result` and `props.toolCallId` from `useRenderTool`.

- [ ] **Step 1: Write the failing browser tests.** In `e2e/ask.spec.ts`, inside `test.describe("signed in", …)`, after the mismatch test:

```ts
  test("next-question buttons fill the box, never send, and only the newest answer has them", async ({ page }) => {
    test.skip(!(await dycuUp(page)), "DYCU unreachable");
    await ask(page, "rank tracts by poverty");
    const card = page.locator("[data-card=tract-rank]:visible");
    await expect(card.locator("tbody tr").first()).toBeVisible({ timeout: 60_000 });
    const left = await page.getByText(/of \d+ questions left today/).first().textContent();
    const row = page.locator("[data-follow-ups=next]").filter({ visible: true });
    await row.getByRole("button", { name: "SHOW THE LOWEST" }).click();
    const box = page.getByPlaceholder("Ask about Milwaukee data");
    await expect(box).toHaveValue(/lowest first.*\(E02 pov_rate\)/);
    await expect(box).toBeFocused();
    // A second button replaces the text; still nothing sent.
    await row.getByRole("button", { name: "WHAT GOES WITH IT?" }).click();
    await expect(box).toHaveValue(/^What else goes with .*\(E02 pov_rate\)$/);
    await expect(page.getByText(/of \d+ questions left today/).first()).toHaveText(left ?? "");
    // A newer question takes the buttons with it.
    await box.fill("");
    await ask(page, "What has the air been like?");
    await expect(page.locator("[data-card=preview]")).toContainText("Daily Air Quality", { timeout: 30_000 });
    await expect(card.locator("[data-follow-ups]")).toHaveCount(0);
  });

  test("a wrong column offers the server's columns as 'Pick one:' buttons", async ({ page }) => {
    test.skip(!(await dycuUp(page)), "DYCU unreachable");
    await ask(page, "wrong column");
    const pick = page.locator("[data-follow-ups=pick]").filter({ visible: true });
    await expect(pick).toContainText("Pick one:", { timeout: 60_000 });
    await expect(pick.getByRole("button", { name: /\(pov_rate\)/ })).toBeVisible();
    await pick.getByRole("button", { name: /\(pov_rate\)/ }).click();
    await expect(page.getByPlaceholder("Ask about Milwaukee data")).toHaveValue(/^Rank census tracts by .*\(E02 pov_rate\)\.$/);
  });
```

`card.locator("[data-follow-ups]")` only checks rows inside the card. Rows render as siblings of the card, so after the newer question, also assert `await expect(page.locator("[data-follow-ups=next]").filter({ visible: true })).toHaveCount(1)`: only the newest answer's row is left. Add that line to the first test, after the preview card appears.

- [ ] **Step 2: Add the scripted question.** In `lib/ask/model.ts`'s tool-choice chain, before `question.includes("rank tracts")`:

```ts
                : question.includes("wrong column")
                ? call("rankTracts", { code: "E02", column: "nope", place: "County", year: "2023", direction: "high" })
```

Extend the script comment line with `"wrong column" → rankTracts E02 with a column that doesn't exist (choose-column)`.

- [ ] **Step 3: Wire the renderers.** In `ui/components/AskCards.tsx`, import `{ FollowUps }` from `./FollowUps`, the seven `*FollowUps` functions from `@/ui/lib/nextQuestions`, and the five `*Choices` functions from `@/ui/lib/refusalChoices`. Then:

- `showDataset`:
  - parse the result with `storyAngles?: string[]` included in the type;
  - render `<>` the existing `<Once …>` card, then `<FollowUps items={datasetFollowUps(r)} id={props.toolCallId} /></>`.
- `previewData`: the same, with `previewFollowUps({ code: r.code, name: r.name, fields: r.fields })`.
- `getNumber`:
  - on `ok`: `<><NumberCard …/><FollowUps items={numberFollowUps({ topic: r.topic, label: r.label })} id={props.toolCallId} /></>`;
  - otherwise, replace `return null` with `return <FollowUps pick items={numberChoices(props.parameters as never, r as never)} id={props.toolCallId} />;`.
- `countRecords`:
  - on `ok`: `<><CountOrEarlier …/><FollowUps items={countFollowUps(props.parameters as never, r)} id={props.toolCallId} /></>`;
  - for the final `return null` (choose / bad-column / bad-dates / not-found / not-city): `return <FollowUps pick items={countChoices(props.parameters as never, r as never)} id={props.toolCallId} />;`.
  - The existing `no-neighborhood` line stays, and gains the choices after it: `<><p …>…</p><FollowUps pick items={countChoices(props.parameters as never, r as never)} id={props.toolCallId} /></>`.
- The tract tools. Change `tractCard` to take the follow-ups and choices:

```tsx
  const tractCard = <T extends { status: string }>(result: unknown, id: string | undefined, card: (r: Extract<T, { status: "ok" }>) => ReactElement, next: (r: Extract<T, { status: "ok" }>) => FollowUp[], choices: (r: T) => FollowUp[]): ReactElement | null => {
    const r = parse<T>(result);
    if (!r) return <Failed />;
    if (r.status === "unavailable") return <p className={styles.source}>DYCU&apos;s data didn&apos;t respond. Try again shortly.</p>;
    if (r.status === "busy") return <p className={styles.failed}>Tract analyses are busy for your account; try again shortly.</p>;
    if (r.status === "ok") return <>{card(r as Extract<T, { status: "ok" }>)}<FollowUps items={next(r as Extract<T, { status: "ok" }>)} id={id} /></>;
    return <FollowUps pick items={choices(r)} id={id} />;
  };
```

  The three registrations become:

```tsx
  useRenderTool({ name: "rankTracts", parameters: rankParams, render: (props) => props.status !== "complete" ? <Busy /> : tractCard<RankResult>(props.result, props.toolCallId, (r) => <RankCard r={r} onOpen={onOpen} />, (r) => rankFollowUps(r.header, r.direction), (r) => rankChoices(props.parameters as never, r as never)) }, [onOpen]);
  useRenderTool({ name: "compareYears", parameters: changeParams, render: (props) => props.status !== "complete" ? <Busy /> : tractCard<ChangeResult>(props.result, props.toolCallId, (r) => <ChangeCard r={r} onOpen={onOpen} />, (r) => changeFollowUps(r.header, r.to), (r) => changeChoices(props.parameters as never, r as never)) }, [onOpen]);
  useRenderTool({ name: "relateTracts", parameters: relateParams, render: (props) => props.status !== "complete" ? <Busy /> : tractCard<RelateResult>(props.result, props.toolCallId, (r) => <RelateCard r={r} onOpen={onOpen} />, (r) => relateFollowUps({ mode: r.mode, a: r.a, b: r.b, place: (props.parameters as { place: string }).place, year: (props.parameters as { year: string }).year, strength: r.strength, aSide: r.aSide, bSide: r.bSide }), (r) => relateChoices(props.parameters as never, r as never)) }, [onOpen]);
```

  Import `type FollowUp` from `./FollowUps`.

  `r.header` and `r.a`/`r.b` are the slim headers (no url or caveats). They carry `code, name, column, meaning, place, year, confidence`, which is everything `Col` needs.

- [ ] **Step 4: Run the checks**

Run: `npx tsc --noEmit -p . && npx vitest run --maxWorkers=4 && npm run build && npx playwright test e2e/ask.spec.ts --list | grep -E "next-question|wrong column"`
Expected:
- typecheck, full suite and build pass;
- both new e2e tests are listed on phone and desktop. They run on CI's preview, since they need the Clerk test user.

The rule files' unit tests already cover every rule. Here the e2e is the evidence that the wiring works.

- [ ] **Step 5: Commit**

```bash
git add ui/components/AskCards.tsx lib/ask/model.ts e2e/ask.spec.ts
git commit -m "feat: follow-up buttons under Ask's newest answer, and 'Pick one:' choices when Ask can't tell what was meant"
```

---

### Task 5: Records: decision 030, DESIGN.md, the Ask guide line

**Files:**
- Create: `docs/decisions/030-follow-up-buttons.md`
- Modify: `DESIGN.md` (an Ask item "Follow-up buttons")
- Modify: `ui/components/AskGuide.tsx:66` (one sentence)
- Test: `e2e/` guide test, if one pins that paragraph. Check `grep -rn "Nothing is sent until you press send" e2e tests`.

- [ ] **Step 1: The guide line.** In `ui/components/AskGuide.tsx`, the `howTo` paragraph becomes:

```tsx
          <p className={styles.howTo}>Pick a question: it opens Ask with the question typed in. Nothing is sent until you press send. Buttons under Ask&apos;s answers work the same way: they fill the box with a next question.</p>
```

  If a test asserts the old text exactly, update it to the new sentence.

- [ ] **Step 2: DESIGN.md.** Under Ask's section (search for "Analysis cards" and add before it), add:

```markdown
### Follow-up buttons (Ask)
Under the newest answer only: up to three next-question buttons under a card, and a "Pick one:" row of up to eight when Ask's tool listed options it couldn't choose between. Ruled caps buttons in the EXPAND style, at least 44px tall, wrapping on phones; the row is labeled for screen readers ("Next questions. Each fills the question box"). A click fills the question box with a full, ready-worded question that names the dataset code and column, and puts the cursor there; it never sends, so nothing is spent from the daily limit until the person presses send. Code builds every button from the card's own settings and result (ui/lib/nextQuestions.ts, ui/lib/refusalChoices.ts); the AI never writes one.
```

- [ ] **Step 3: Decision 030.** Write `docs/decisions/030-follow-up-buttons.md` in the house format of `docs/decisions/028-plain-analysis-cards.md`:
  - **Decision.**
  - **Why this came up:** dead ends at "which did you mean?", and no path onward. The patterns came from CopilotKit's OpenIntelligentUI, adopted without its AI-written UI.
  - **Options:**
    - code-built (chosen);
    - AI-suggested (cost; can suggest unanswerable questions; untestable);
    - code-built then AI-worded (cost; drift).
  - **What we chose and why:** Tarik chose code-built, fill-don't-send, on four card types, 2026-10-11.
  - **What we gave up:**
    - fixed, plain phrasing;
    - no "same row, another year" for N03 (its answer lists one year);
    - one extra tap to send;
    - "where did it change?" may still meet a year refusal, which brings its own choices.
  - **How we'll know:**
    - fewer typed follow-ups after a refusal;
    - no reader reports a button question the data couldn't answer.
  - **What actually happened:** left blank.

  Define any technical term in one clause on first use.

- [ ] **Step 4: Run the checks**

Run: `npx tsc --noEmit -p . && npx vitest run --maxWorkers=4 && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add docs/decisions/030-follow-up-buttons.md DESIGN.md ui/components/AskGuide.tsx
git commit -m "docs: decision 030, DESIGN.md follow-up buttons, the Ask guide line"
```

(Add any guide test file you updated.)

---

## Self-review (done while writing)

- **Spec coverage:**

  | Spec | Plan |
  |---|---|
  | §3 what readers see | Tasks 1 and 4 |
  | §4 rules | Task 2 |
  | §5 choices | Task 3 |
  | §6 build: fill path, FollowUps, newest-only, no server change | Tasks 1 and 4 |
  | §7 tests | Tasks 1–4; e2e in Task 4 |
  | §8 records | Task 5 |
  | §9 out of scope | respected |

- **Placeholders:** none. Task 5's decision is described by fixed facts and the house format file.
- **Types:**
  - `FollowUp` is defined once (FollowUps.tsx) and imported as a type by both rule files.
  - `CountArgsIn` is defined in nextQuestions.ts and reused by refusalChoices.ts.
  - `Col` matches the slim tract header fields.
- **Review Focus:** all five lines have tests:
  1. Task 2 (rank uses `header.column`);
  2. Task 3 (empty and 20 columns);
  3. Task 3 (no shared year);
  4. Task 2 (Feb 29);
  5. Task 4 (two clicks).
