# Share Link to an Answer (C2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A reporter presses **Share link** under an Ask card and gets a permanent `/s/<id>` page that anyone can open. The page shows the card as it was that day.

**Architecture:**
- **The browser sends only the tool's name and arguments.** A Convex action, `shares:create`, re-runs that tool as the reporter and builds the card's export snapshot with the same builder the CSV, text and PNG use. It stores the snapshot in a new `shares` table.
- **The public page** reads the snapshot through a query that never returns who shared it.
- **The tract cards' title and summary code** moves out of the components into plain functions, so the server can build those cards too.

**Tech Stack:** Next.js 16 App Router, Convex (action, internalMutation, query, convex-test), `@convex-dev/rate-limiter`, CopilotKit `useRenderTool`, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-14-share-link-design.md`

## Global Constraints

- **No number or text from the browser reaches a stored page:** the share stores only what the server re-ran and built (spec §2).
- **The origin is a constant,** `https://www.creamcityalmanac.app`, never the browser's (spec §5 step 8).
- **The share date** is "Month D, YYYY" in America/Chicago (spec §5 step 8).
- **Stored per share:** the share id, the tool name, the snapshot, the time and the sharer's `tokenIdentifier`, nothing else. No arguments, no question, no reply (spec §6).
- **The public query never returns the sharer** (spec §6).
- **Shareable tools:** `getNumber`, `countRecords`, `timeSpan`, `rankTracts`, `compareYears`, `relateTracts`, `factSheet`, `countStops`, `countTurnout`, `readReport`. Never `findPlace`, `boundariesFor` or the dataset tools (spec §3).
- **Limit:** 30 shares a day per account (spec §5 step 4).
- **The shared page:**
  - has `robots: noindex` and its card title as the page title (spec §4);
  - shows "Shared from Cream City Almanac on <date>. Numbers are as of that day." (spec §4);
  - for an unknown id, shows "This shared answer isn't available." with a 404 status (spec §4);
  - works at phone width: 16px gutter, no sideways page scroll (spec §4).
- **Copy:**
  - the reporter's error is "Couldn't make a link. Ask again and retry.";
  - the button is "Share link";
  - while working it says "Making link…".
- **Never stage** `.superpowers/` or `clerk-creamcityalmanac.app.zone`.
- **Commit trailer:** `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- **Pushing functions to the dev Convex deployment needs Tarik's explicit OK** (Task 5).

## Planning rulings (deviations from the spec, decided here)

1. **Argument checking.** Spec §5 step 3 says arguments are checked with the tools' Zod parameters. Instead, the re-run goes through the Convex function's own argument validators, the same gate every Ask call passes. A validator error is caught and returns `"failed"`. The `"bad-args"` reason is dropped, because the reporter sees the same message either way. Cost if wrong: none for users; a reason code merges into `"failed"`.
2. **Map count cards.** Spec §3 says "A City count card drawn as a map … can't be shared". That's wrong: map count cards do export today (`AskCards.tsx` `CountCard`). Only the folded "Earlier count" copy (`noMap`) has no export bar. So map counts are shareable, and the "map → failed" rule in §5 step 7 is dropped.
3. **The id field** is stored as `shareId`, not `id`, so it can't be mistaken for Convex's `_id`.
4. **`withoutCells`** is not applied on the share path: the export never reads the map cells, and nothing but the export is stored.
5. **A report quote** stores every passage the re-run returns, each one formatted as `quoteText` and joined with a blank line, as `{ quote }`. Ask shows a report answer as several passages, and the share covers the whole answer. The Share link sits once under the passages.

## Review Focus

1. **The sharer never leaks.** `shares:get` must never return `by`, and the row must hold no tool arguments. Test: Task 3.
2. **A report re-run that finds nothing** (zero passages, or `busy`) must store nothing. Test: Task 2.
3. **Odd ids** (`/s/doesnotexist`, `/s/..%2F..`, a 500-character id) must give the 404 page, never a server error. Test: Task 5 (the id is checked against `^[0-9A-Za-z]{10}$` before Convex is asked).
4. **A wide table** (a 30-row tract rank with 6 columns) on a phone must scroll inside its box, with no sideways page scroll. Test: Task 5 phone run.
5. **A tool that refuses at re-run time** ("Turnout hasn't been built yet.") must give the reporter the error message and store nothing. Test: Task 3.

---

### Task 1: Tract card text becomes plain functions

**Files:**
- Create: `ui/lib/tractCardText.ts`
- Modify: `ui/components/TractCards.tsx` (RankCard ~lines 134–208, ChangeCard ~210–272, RelateCard ~274–347; the `STRENGTH` constant at line 31)
- Test: `tests/ui/tractCardText.test.ts`

**Interfaces:**
- Consumes: `rankSummary`, `changeSummary`, `relateSummary` and `fineText` from `ui/lib/tractSummary.ts`; `noMargin`, `mismatchVerdict` and `tooFew` from `ui/lib/tractFormat.ts`; `TractCardText` from `ui/lib/cardExport.ts` (`{ title: string; lines: string[]; fine: string }`); the types `RankDetail`, `ChangeAnswer`, `ChangeDetail`, `RelateAnswer` and `RelateDetail` from `convex/tracts.ts`.
- Produces:
  - `rankHead(r: RankDetail): { title: string; summary: string; bare: boolean; lines: string[] }`
  - `changeHead(r: ChangeAnswer): { title: string; summary: string; counts: string; bare: string | false | null; lines: string[] }`, where `bare` is whatever `noMargin` returns
  - `relateHead(r: RelateAnswer): { title: string; summary: string; verdict: string; lead: string | undefined; mismatch: boolean; gated: boolean; bare: ReturnType<typeof noMargin>; lines: string[] }`
  - `rankCardText(d: RankDetail): TractCardText`, `changeCardText(d: ChangeDetail): TractCardText` and `relateCardText(d: RelateDetail): TractCardText`
  - `BARE_RANK`, `TIES_INLINE` (moved from `TractCards.tsx`)

- [ ] **Step 1: Write the failing test.** It pins today's card text, computed by running the current summary functions on these inputs (2026-10-14).

```ts
// tests/ui/tractCardText.test.ts
import { describe, expect, it } from "vitest";
import type { ChangeDetail, Header, RankDetail, RelateDetail, TractRow } from "../../convex/tracts";
import { BARE_RANK, changeCardText, changeHead, rankCardText, rankHead, relateCardText, relateHead } from "../../ui/lib/tractCardText";

const pov: Header = { code: "E02", name: "Households Living in Poverty", column: "pov_rate", meaning: "Percentage of households with income below the poverty line", kind: "rate", place: "County", year: "2023", n: 210, leftOut: 0, confidence: "90% confidence (Census)", url: "https://x.test/0", caveats: ["Five-year estimates."] };
const inc: Header = { ...pov, column: "inc", name: "Median income", meaning: "Median household income in dollars", kind: "dollars" };
const row = (geoid: string, value: number): TractRow => ({ geoid, tract: geoid.slice(-4), city: [], dycu: [], value, lo: value - 2, hi: value + 2, unreliable: false });
const FINE = "Ranges are margins of error: 90% confidence (Census). Neighborhood: the City's official neighborhoods covering at least 10% of the tract, biggest first. DYCU area: the areas DYCU's reports group the tract into.";

const rank: RankDetail = { status: "ok", tool: "rank", header: pov, direction: "high", top: [row("55079186000", 41)], ties: [row("55079009300", 40)], tieCount: 1, unreliable: [row("55079000101", 39)], unreliableCount: 1, highlighted: [], key: "k" };

describe("tract card text (C2: shared by the card and the share link)", () => {
  it("writes the rank card's title, summary and fine print", () => {
    const t = rankHead(rank);
    expect(t.title).toBe("Highest pov_rate · County 2023");
    expect(t.summary).toBe("This is the census tract in Milwaukee County with the highest percentage of households with income below the poverty line (2023 data). 1 more is within the margin of error of #1, so read the top as a group, not an exact order. 1 tract is left out because its estimate is too uncertain.");
    expect(t.lines).toEqual([t.summary]);
    expect(rankCardText(rank)).toEqual({ title: t.title, lines: [t.summary], fine: FINE });
  });
  it("adds the no-margin line to a bare rank and zeroes its ties", () => {
    const t = rankHead({ ...rank, direction: "low", header: { ...pov, confidence: null } });
    expect(t.bare).toBe(true);
    expect(t.summary).toBe("This is the census tract in Milwaukee County with the lowest percentage of households with income below the poverty line (2023 data). There's no margin of error for this column, so tracts close in rank may really be tied.");
    expect(t.lines).toEqual([t.summary, BARE_RANK]);
  });
  it("writes the change card's title, summary and counts", () => {
    const d: ChangeDetail = { status: "ok", tool: "change", header: pov, note: null, from: "2022", to: "2023", increases: 2, decreases: 1, none: 7, unreliableCount: 3, changeCount: 3, changes: [], highlighted: [], key: "k" };
    const t = changeHead(d);
    expect(t.title).toBe("pov_rate · County 2022 → 2023");
    expect(t.summary).toBe("From 2022 to 2023 in Milwaukee County, the percentage of households with income below the poverty line clearly rose in 2 census tracts and clearly fell in 1. In the other 7 compared, the change is smaller than the survey's margin of error.");
    expect(t.counts).toBe("2 clear increases · 1 clear decreases · 7 no clear change · 3 not compared (too uncertain)");
    expect(changeCardText(d)).toEqual({ title: t.title, lines: [t.summary, t.counts], fine: FINE });
    expect(changeHead({ ...d, header: { ...pov, confidence: null } }).counts).toBe("Can't tell which tracts changed clearly: pov_rate has no margin of error.");
  });
  it("writes the relate card's verdict, cutoff lead and causal fine print", () => {
    const d = { status: "ok", tool: "relate", mode: "mismatch", a: pov, b: inc, n: 200, strength: "moderate", cutA: 20, cutB: 30000, aSide: "high", bSide: "high", fitsCount: 4, closeCount: 2, unreliableCount: 0, fits: [], close: [], points: [], highlighted: [], closeIds: [], key: "k" } as unknown as RelateDetail;
    const t = relateHead(d);
    expect(t.title).toBe("Households Living in Poverty vs. Median income");
    expect(t.summary).toBe("We looked for census tracts in Milwaukee County (2023 data) in the top third for the percentage of households with income below the poverty line and the top third for the median household income in dollars. 4 are clear matches, even at the edges of the margin of error, and 2 more are possible matches.");
    expect(t.verdict).toBe("4 clear matches; 2 possible matches.");
    expect(t.lead).toBe("Cutoffs: top third on pov_rate, top third on inc.");
    expect(relateCardText(d).fine).toBe("Cutoffs: top third on pov_rate, top third on inc. Ranges are margins of error: 90% confidence (Census). Related doesn't mean one causes the other. Neighborhood: the City's official neighborhoods covering at least 10% of the tract, biggest first. DYCU area: the areas DYCU's reports group the tract into.");
    const few = relateHead({ ...d, mode: "relate", strength: "too-few", n: 12, unreliableCount: 3 } as RelateDetail);
    expect(few.verdict).toBe("Too few tracts to say (fewer than 20 matched).");
    expect(few.lines.at(-1)).toBe("3 tracts are too uncertain to count (shown faint).");
  });
});
```

- [ ] **Step 2: Run it to verify it fails.**
Run: `npx vitest run tests/ui/tractCardText.test.ts`
Expected: FAIL, "Failed to resolve import ../../ui/lib/tractCardText".

- [ ] **Step 3: Write `ui/lib/tractCardText.ts`.** It moves the card logic verbatim.

```ts
import type { ChangeAnswer, ChangeDetail, RankDetail, RelateAnswer, RelateDetail } from "@/convex/tracts";
import type { TractCardText } from "./cardExport";
import { mismatchVerdict, noMargin, tooFew } from "./tractFormat";
import { changeSummary, fineText, rankSummary, relateSummary } from "./tractSummary";

// The three tract cards' title, summary and lines, written once: the card shows them, its export copies them, and a
// share link (spec 2026-10-14-share-link-design.md §5) builds them on the server from the same full answer.

export const TIES_INLINE = 5;
export const BARE_RANK = "No margin of error found for this column, so ranks may be ties.";
const STRENGTH = { little: "Little relationship", weak: "Weakly related", moderate: "Moderately related", strong: "Strongly related" } as const;

export function rankHead(r: RankDetail) {
  const h = r.header;
  const title = `${r.direction === "high" ? "Highest" : "Lowest"} ${h.column} · ${h.place} ${h.year}`;
  const bare = !h.confidence; // no ranges: no ties or unreliable tracts can be found (spec §5 rule 7)
  const summary = rankSummary({ header: h, direction: r.direction, top: r.top.length, tieCount: bare ? 0 : r.tieCount, unreliableCount: bare ? 0 : r.unreliableCount, inline: TIES_INLINE, area: r.area });
  return { title, summary, bare, lines: bare ? [summary, BARE_RANK] : [summary] };
}

export function changeHead(r: ChangeAnswer) {
  const h = r.header;
  const title = `${h.column} · ${h.place} ${r.from} → ${r.to}`;
  const bare = noMargin([h]);
  const summary = changeSummary({ header: h, from: r.from, to: r.to, increases: r.increases, decreases: r.decreases, none: r.none, area: r.area });
  const counts = bare
    ? `Can't tell which tracts changed clearly: ${bare}.`
    : `${r.increases} clear increases · ${r.decreases} clear decreases · ${r.none} no clear change${r.unreliableCount > 0 ? ` · ${r.unreliableCount} not compared (too uncertain)` : ""}`;
  return { title, summary, counts, bare, lines: [summary, counts] };
}

export function relateHead(r: RelateAnswer) {
  const { a, b } = r;
  const mismatch = r.mode === "mismatch";
  const gated = mismatch && r.cutA === undefined; // fewer than 20 reliable pairs: no cutoffs were drawn
  const side = (s?: "high" | "low") => (s === "low" ? "bottom" : "top");
  const bare = noMargin([a, b]);
  const summary = relateSummary(r);
  const verdict = mismatch ? mismatchVerdict({ fitsCount: r.fitsCount, closeCount: r.closeCount, n: r.n, gated, bare }) : r.strength === "too-few" ? tooFew(r.n) : STRENGTH[r.strength];
  const lead = mismatch && !gated ? `Cutoffs: ${side(r.aSide)} third on ${a.column}, ${side(r.bSide)} third on ${b.column}.` : undefined;
  const lines = [summary, verdict, ...(r.unreliableCount > 0 ? [`${r.unreliableCount} tracts are too uncertain to count (shown faint).`] : [])];
  return { title: `${a.name} vs. ${b.name}`, summary, verdict, lead, mismatch, gated, bare, lines };
}

export const rankCardText = (d: RankDetail): TractCardText => { const t = rankHead(d); return { title: t.title, lines: t.lines, fine: fineText([d.header]) }; };
export const changeCardText = (d: ChangeDetail): TractCardText => { const t = changeHead(d); return { title: t.title, lines: t.lines, fine: fineText([d.header]) }; };
export const relateCardText = (d: RelateDetail): TractCardText => { const t = relateHead(d); return { title: t.title, lines: t.lines, fine: fineText([d.a, d.b], { causal: true, lead: t.lead }) }; };
```

If `relateSummary`'s or `changeSummary`'s parameter type rejects `RelateAnswer` or `ChangeAnswer`, read their signatures in `ui/lib/tractSummary.ts` and pass the same object the card passed before (`{ ...r, a, b, area }`). Don't change those functions.

- [ ] **Step 4: Run the test.**
Run: `npx vitest run tests/ui/tractCardText.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Make the three cards use the functions.** In `ui/components/TractCards.tsx`:
  - Delete `TIES_INLINE`, `BARE_RANK` and `STRENGTH`, and import `{ BARE_RANK, TIES_INLINE, changeCardText, changeHead, rankCardText, rankHead, relateCardText, relateHead }` from `@/ui/lib/tractCardText`.
  - **RankCard:** replace the `title`, `bare` and `summary` lines with
    `const { title, summary, bare } = rankHead({ ...r, header: h, area });`
    and make its ExportBar `make={full && ((ctx) => rankExport(full, rankCardText(full), ctx))}`.
  - **ChangeCard:** replace `title`, `bare`, `summary` and `counts` with
    `const { title, summary, counts, bare } = changeHead({ ...r, header: h, area });`
    and make its export `changeExport(full, changeCardText(full), ctx)`.
  - **RelateCard:** replace `mismatch`, `gated`, `side`, `bare`, `title`, `summary`, `verdict` and `lead` with
    `const { title, summary, verdict, lead, mismatch, gated, bare } = relateHead({ ...r, a, b, area });`
    and make its export `relateExport(full, relateCardText(full), ctx)`.
  - Drop any import that is now unused (`rankSummary`, `changeSummary`, `relateSummary`, `mismatchVerdict`, `tooFew`; keep `noMargin` and `fineText` only if still used).

- [ ] **Step 6: Run the suites and typecheck.**
Run: `npx tsc --noEmit && npx vitest run tests/ui`
Expected: tsc exits 0; every tests/ui file passes, including `cardExport.test.ts` and `tractSummary.test.ts`.

- [ ] **Step 7: Commit.**

```bash
git add ui/lib/tractCardText.ts ui/components/TractCards.tsx tests/ui/tractCardText.test.ts
git commit -m "refactor: tract card title and summary move to plain functions the server can run

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Building a shared card from a tool result

**Files:**
- Create: `ui/lib/shareCard.ts`
- Test: `tests/ui/shareCard.test.ts`

**Interfaces:**
- Consumes: from Task 1, `rankCardText`, `changeCardText` and `relateCardText`. From `cardExport.ts`: `numberExport`, `countExport`, `measureExport`, `spanExport`, `rankExport`, `changeExport`, `relateExport`, `quoteText` and the types `CardExport` and `Ctx`. Also `factSheetExport` (`ui/lib/factText.ts`), `stopsExport` (`ui/lib/stopsText.ts`) and `turnoutExport` (`ui/lib/turnoutText.ts`).
- Produces:
  - `SHAREABLE` (the readonly tuple of 10 tool names) and `type ShareTool`
  - `isShareable(t: string): t is ShareTool`
  - `type Shared = { card: CardExport } | { quote: string }`
  - `SITE = "https://www.creamcityalmanac.app"`
  - `shareDate(ms: number): string`
  - `newShareId(): string`
  - `shareCard(tool: ShareTool, result: unknown, ctx: Ctx): Shared | null`. For the three tract tools, `result` is the full detail from `tractDetail`.
  - `type ShareResult = { ok: true; id: string } | { ok: false; reason: "signed-out" | "not-shareable" | "limit" | "failed" }`, which Task 3's action returns.
  - `shareMessage(r: ShareResult | null): string | null`, the reporter's message after pressing Share link. Task 4 uses it. It lives here because no React test library is installed, so the button's wording is tested as a plain function.

- [ ] **Step 1: Write the failing test.**

```ts
// tests/ui/shareCard.test.ts
import { describe, expect, it } from "vitest";
import { countExport, measureExport, quoteText, rankExport } from "../../ui/lib/cardExport";
import { isShareable, newShareId, SHAREABLE, shareCard, shareDate, shareMessage } from "../../ui/lib/shareCard";
import { rankCardText } from "../../ui/lib/tractCardText";
import { turnoutExport } from "../../ui/lib/turnoutText";
import type { RankDetail } from "../../convex/tracts";

const ctx = { origin: "https://www.creamcityalmanac.app", date: "October 14, 2026" };
const turnout = { status: "ok" as const, title: "Milwaukee voter turnout · 1 general election · 2020", groupBy: "election" as const, rows: [{ label: "November 2020 general election", type: "general" as const, registered: 315483, ballots: 247695, turnout: 78.5 }], notes: ["Registered voters is the City's count on election day."], source: "From the City of Milwaukee's election results files (2016–2022), read by the Almanac." };
const count = { status: "ok", code: "P32", name: "NIBRS crimes", count: 1234, groups: [], other: 0, otherLabel: null, overlap: false, period: "2025-10-01 to 2026-09-30", filters: [], futureExcluded: 0, caveat: null, dateColumn: "ReportedDate", coverage: "2005 to 2026", resourceName: "wibr", area: null, noLocation: 0 };

describe("shareable tools", () => {
  it("lists exactly the ten tools with an exported card, never place, boundary or dataset tools", () => {
    expect([...SHAREABLE].sort()).toEqual(["compareYears", "countRecords", "countStops", "countTurnout", "factSheet", "getNumber", "rankTracts", "readReport", "relateTracts", "timeSpan"]);
    for (const t of ["findPlace", "boundariesFor", "searchCatalog", "showDataset", "previewData", "nope"]) expect(isShareable(t)).toBe(false);
  });
});

describe("shareCard", () => {
  it("builds the same export the card's own CSV button builds", () => {
    expect(shareCard("countTurnout", turnout, ctx)).toEqual({ card: turnoutExport(turnout, ctx) });
    expect(shareCard("countRecords", count, ctx)).toEqual({ card: countExport(count as never, ctx) });
  });
  it("sends a measured count to the measure export", () => {
    const measured = { ...count, status: "measured" };
    expect(shareCard("countRecords", measured, ctx)).toEqual({ card: measureExport(measured as never, ctx) });
  });
  it("builds a tract card from its full detail and the moved card text", () => {
    const d = { status: "ok", tool: "rank", header: { code: "E02", name: "P", column: "pov_rate", meaning: "Percentage of households", kind: "rate", place: "County", year: "2023", n: 1, leftOut: 0, confidence: null, url: "u", caveats: [] }, direction: "high", top: [], ties: [], tieCount: 0, unreliable: [], unreliableCount: 0, highlighted: [], key: "k" } as unknown as RankDetail;
    expect(shareCard("rankTracts", d, ctx)).toEqual({ card: rankExport(d, rankCardText(d), ctx) });
    expect(shareCard("compareYears", d, ctx)).toBeNull(); // a rank detail is not a change answer
  });
  it("joins every report passage, and stores nothing for no passages or a busy search", () => {
    const p = (q: string) => ({ quote: q, section: "Housing", report: "Harambee 2023", code: "R05" });
    expect(shareCard("readReport", { status: "ok", passages: [p("A."), p("B.")] }, ctx)).toEqual({ quote: `${quoteText(p("A."), ctx)}\n\n${quoteText(p("B."), ctx)}` });
    expect(shareCard("readReport", { status: "ok", passages: [] }, ctx)).toBeNull();
    expect(shareCard("readReport", { status: "busy", passages: [] }, ctx)).toBeNull();
  });
  it("stores nothing for a refusal, a choice list or junk", () => {
    expect(shareCard("countTurnout", { status: "refused", reason: "Turnout hasn't been built yet." }, ctx)).toBeNull();
    expect(shareCard("countStops", { status: "choose", options: [] }, ctx)).toBeNull();
    expect(shareCard("getNumber", null, ctx)).toBeNull();
    expect(shareCard("timeSpan", "ok", ctx)).toBeNull();
  });
});

describe("ids and dates", () => {
  it("makes 10-character ids from 0-9A-Za-z with no clash in 10,000", () => {
    const ids = Array.from({ length: 10_000 }, newShareId);
    for (const id of ids.slice(0, 50)) expect(id).toMatch(/^[0-9A-Za-z]{10}$/);
    expect(new Set(ids).size).toBe(10_000);
  });
  it("writes the share date in Milwaukee's time zone", () => {
    expect(shareDate(Date.UTC(2026, 9, 15, 3, 0))).toBe("October 14, 2026"); // 10pm on the 14th in Chicago
  });
});

describe("the reporter's message", () => {
  it("is silent on success, names the daily limit, and otherwise says to retry", () => {
    expect(shareMessage({ ok: true, id: "k3Xp9qL2mT" })).toBeNull();
    expect(shareMessage({ ok: false, reason: "limit" })).toBe("You've made today's 30 links. Try again tomorrow.");
    for (const r of [{ ok: false as const, reason: "failed" as const }, { ok: false as const, reason: "signed-out" as const }, null]) {
      expect(shareMessage(r)).toBe("Couldn't make a link. Ask again and retry.");
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails.**
Run: `npx vitest run tests/ui/shareCard.test.ts`
Expected: FAIL, "Failed to resolve import ../../ui/lib/shareCard".

- [ ] **Step 3: Write `ui/lib/shareCard.ts`.**

```ts
import { changeExport, countExport, measureExport, numberExport, quoteText, rankExport, relateExport, spanExport, type CardExport, type Ctx } from "./cardExport";
import { factSheetExport } from "./factText";
import { stopsExport } from "./stopsText";
import { changeCardText, rankCardText, relateCardText } from "./tractCardText";
import { turnoutExport } from "./turnoutText";

// A share link's snapshot (spec 2026-10-14-share-link-design.md §5): the server re-runs the card's tool and builds
// the same export the card's CSV, text and PNG come from. Runs in Convex, so it imports only plain functions.

export const SHAREABLE = ["getNumber", "countRecords", "timeSpan", "rankTracts", "compareYears", "relateTracts", "factSheet", "countStops", "countTurnout", "readReport"] as const;
export type ShareTool = (typeof SHAREABLE)[number];
export const isShareable = (t: string): t is ShareTool => (SHAREABLE as readonly string[]).includes(t);

export type Shared = { card: CardExport } | { quote: string };
export type ShareResult = { ok: true; id: string } | { ok: false; reason: "signed-out" | "not-shareable" | "limit" | "failed" };

// What the reporter reads after pressing Share link; null when the link is shown instead.
export const shareMessage = (r: ShareResult | null) =>
  r?.ok ? null : r?.reason === "limit" ? "You've made today's 30 links. Try again tomorrow." : "Couldn't make a link. Ask again and retry.";

// The snapshot's dataset links point here, never at an address the browser supplied.
export const SITE = "https://www.creamcityalmanac.app";
export const shareDate = (ms: number) => new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "America/Chicago" }).format(ms);

const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
// ponytail: byte % 62 leans slightly toward the first 8 characters; ~59 bits either way, plenty for unguessable links.
export const newShareId = () => Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => ALPHABET[b % 62]).join("");

type Passage = { quote: string; section: string; report: string; code: string };

export function shareCard(tool: ShareTool, result: unknown, ctx: Ctx): Shared | null {
  if (!result || typeof result !== "object") return null;
  const r = result as { status?: string; tool?: string; passages?: Passage[] };
  const ok = r.status === "ok";
  const card = (c: CardExport) => ({ card: c });
  switch (tool) {
    case "getNumber": return ok ? card(numberExport(r as never, ctx)) : null;
    case "countRecords": return ok ? card(countExport(r as never, ctx)) : r.status === "measured" ? card(measureExport(r as never, ctx)) : null;
    case "timeSpan": return ok ? card(spanExport(r as never, ctx)) : null;
    case "factSheet": return ok ? card(factSheetExport(r as never, ctx)) : null;
    case "countStops": return ok ? card(stopsExport(r as never, ctx)) : null;
    case "countTurnout": return ok ? card(turnoutExport(r as never, ctx)) : null;
    case "rankTracts": return ok && r.tool === "rank" ? card(rankExport(r as never, rankCardText(r as never), ctx)) : null;
    case "compareYears": return ok && r.tool === "change" ? card(changeExport(r as never, changeCardText(r as never), ctx)) : null;
    case "relateTracts": return ok && r.tool === "relate" ? card(relateExport(r as never, relateCardText(r as never), ctx)) : null;
    case "readReport": return ok && r.passages?.length ? { quote: r.passages.map((p) => quoteText(p, ctx)).join("\n\n") } : null;
  }
}
```

- [ ] **Step 4: Run the test.**
Run: `npx vitest run tests/ui/shareCard.test.ts`
Expected: PASS, 9 tests. If an export builder's type rejects a fixture, the fixture is short of fields; widen it with `as never`. Don't change the builder.

- [ ] **Step 5: Commit.**

```bash
git add ui/lib/shareCard.ts tests/ui/shareCard.test.ts
git commit -m "feat: build a share link's snapshot from a tool result with the card's own export

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Storing and reading shares in Convex

**Files:**
- Create: `convex/shares.ts`, `convex/shares.test.ts`, `tests/helpers/citySeed.ts`
- Modify:
  - `convex/schema.ts`: add the `shares` table after `askSpend`;
  - `convex/limits.ts`: add `ASK_SHARES` and register `askShares`;
  - `convex/tsconfig.json`: add `baseUrl` and `paths`;
  - `convex/city.test.ts`: `seed` uses the moved helper.

**Interfaces:**
- Consumes: Task 2's `isShareable`, `shareCard`, `newShareId`, `SITE`, `shareDate` and `Shared`. The existing functions `api.ask.getNumber`, `api.factSheet.findSheet`, `api.stops.countStops`, `api.elections.countTurnout`, `api.city.countRecords`, `api.spans.timeSpan`, `api.ask.readReport`, `api.tracts.rankTracts`, `api.tracts.compareYears`, `api.tracts.relateTracts` and `api.tracts.tractDetail` (`{ key, now }`).
- Produces:
  - `api.shares.create({ tool: string, args: any }) → { ok: true; id: string } | { ok: false; reason: "signed-out" | "not-shareable" | "limit" | "failed" }`
  - `api.shares.get({ id: string }) → { kind: string; shared: Shared; createdAt: number } | null`
  - `internal.shares.store({ shareId, kind, card, by }) → boolean`, false on an id clash
  - `internal.shares.remove({ id: string }) → boolean`

- [ ] **Step 1: Move the City test seed into a helper.** `shares.test.ts` needs it too.
  - Create `tests/helpers/citySeed.ts`. It exports `RID`, `reader` and `seedNibrs(ctx: GenericMutationCtx<DataModel>)`, whose body is the **unchanged** body of the `t.run(async (ctx) => { … })` callback in `convex/city.test.ts`'s `seed()`. That callback inserts the `families`, `cards` and `cityProfiles` rows. Keep its `withProfile` flag as a second parameter, `seedNibrs(ctx, withProfile = true)`.
  - In `convex/city.test.ts`, delete its own `RID` and `reader` constants and import them from the helper. `seed()` becomes:

```ts
async function seed(withProfile = true) {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  await t.run((ctx) => seedNibrs(ctx, withProfile));
  return t;
}
```

  The helper's imports are `import type { GenericMutationCtx } from "convex/server"; import type { DataModel } from "../../convex/_generated/dataModel";`.

Run: `npx vitest run convex/city.test.ts`
Expected: PASS, the same number of tests as before the move.

- [ ] **Step 2: Write the failing tests.**

```ts
// convex/shares.test.ts
/// <reference types="vite/client" />
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { installFakeFetch } from "../tests/helpers/fakeFetch";
import { reader, seedNibrs } from "../tests/helpers/citySeed";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");
afterEach(() => vi.unstubAllGlobals());

async function setup() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  return t;
}
// One built election with two wards, enough for countTurnout to answer.
async function seedTurnout(t: Awaited<ReturnType<typeof setup>>) {
  await t.run(async (ctx) => {
    await ctx.db.insert("elections", { election: "2020-11", label: "November 2020 general election", type: "general", map: "2012", wards: 2, of: 327, partial: false, modified: "m", status: "read" });
    await ctx.db.insert("turnout", { election: "2020-11", ward: 1, registered: 1502, ballots: 1185 });
    await ctx.db.insert("turnout", { election: "2020-11", ward: 2, registered: 100, ballots: 60 });
  });
}
const rows = (t: Awaited<ReturnType<typeof setup>>) => t.run((ctx) => ctx.db.query("shares").collect());

describe("shares:create", () => {
  it("refuses when signed out", async () => {
    const t = await setup();
    expect(await t.action(api.shares.create, { tool: "countTurnout", args: {} })).toEqual({ ok: false, reason: "signed-out" });
  });
  it("refuses tools that can't be shared, storing nothing", async () => {
    const t = await setup();
    for (const tool of ["findPlace", "boundariesFor", "searchCatalog", "nope"]) {
      expect(await t.withIdentity(reader).action(api.shares.create, { tool, args: { address: "1 Main St" } })).toEqual({ ok: false, reason: "not-shareable" });
    }
    expect(await rows(t)).toEqual([]);
  });
  it("fails without storing when the arguments don't fit the tool", async () => {
    const t = await setup();
    await seedTurnout(t);
    expect(await t.withIdentity(reader).action(api.shares.create, { tool: "countTurnout", args: { from: "twenty" } })).toEqual({ ok: false, reason: "failed" });
    expect(await rows(t)).toEqual([]);
  });
  it("fails without storing when the tool refuses at share time", async () => {
    const t = await setup(); // no turnout rows: "Turnout hasn't been built yet."
    expect(await t.withIdentity(reader).action(api.shares.create, { tool: "countTurnout", args: {} })).toEqual({ ok: false, reason: "failed" });
    expect(await rows(t)).toEqual([]);
  });
  it("re-runs the tool, stores the card's snapshot and nothing of the question", async () => {
    const t = await setup();
    await seedTurnout(t);
    const r = await t.withIdentity(reader).action(api.shares.create, { tool: "countTurnout", args: { type: "general" } });
    expect(r).toMatchObject({ ok: true, id: expect.stringMatching(/^[0-9A-Za-z]{10}$/) });
    const [row] = await rows(t);
    expect(Object.keys(row).sort()).toEqual(["_creationTime", "_id", "by", "card", "createdAt", "kind", "shareId"]);
    expect(row).toMatchObject({ kind: "countTurnout", by: "test|u1" });
    const got = await t.query(api.shares.get, { id: (r as { id: string }).id });
    expect(got).not.toHaveProperty("by");
    expect(got?.kind).toBe("countTurnout");
    expect("card" in got!.shared && got!.shared.card.title).toMatch(/^Milwaukee voter turnout/);
    expect("card" in got!.shared && got!.shared.card.notes).toContain(`Exported from Cream City Almanac on ${new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "America/Chicago" }).format(Date.now())}.`);
  });
  it("re-runs a signed-in-only City count as the sharer", async () => {
    const t = await setup();
    await t.run((ctx) => seedNibrs(ctx));
    installFakeFetch({ citySql: (sql) => (sql.includes("> '") ? [{ n: "0" }] : [{ n: "256" }]) });
    // countRecords throws "Sign in to ask" without an identity, so a stored row proves the sharer's identity reached it.
    expect(await t.withIdentity(reader).action(api.shares.create, { tool: "countRecords", args: { code: "P01" } })).toMatchObject({ ok: true });
    const [row] = await rows(t);
    expect(JSON.parse(row.card).card.csv.rows[0]).toEqual(["Total", 256]);
  });
  it("stops at 30 shares a day per account", async () => {
    const t = await setup();
    await seedTurnout(t);
    for (let i = 0; i < 30; i++) expect(await t.withIdentity(reader).action(api.shares.create, { tool: "countTurnout", args: {} })).toMatchObject({ ok: true });
    expect(await t.withIdentity(reader).action(api.shares.create, { tool: "countTurnout", args: {} })).toEqual({ ok: false, reason: "limit" });
  });
});

describe("shares:get and shares:remove", () => {
  it("returns null for an unknown id, and nothing after removal", async () => {
    const t = await setup();
    await seedTurnout(t);
    expect(await t.query(api.shares.get, { id: "doesnotexi" })).toBeNull();
    const r = (await t.withIdentity(reader).action(api.shares.create, { tool: "countTurnout", args: {} })) as { id: string };
    expect(await t.mutation(internal.shares.remove, { id: r.id })).toBe(true);
    expect(await t.query(api.shares.get, { id: r.id })).toBeNull();
    expect(await t.mutation(internal.shares.remove, { id: r.id })).toBe(false);
  });
  it("won't overwrite an existing id", async () => {
    const t = await setup();
    expect(await t.mutation(internal.shares.store, { shareId: "AAAAAAAAAA", kind: "countTurnout", card: "{}", by: "x" })).toBe(true);
    expect(await t.mutation(internal.shares.store, { shareId: "AAAAAAAAAA", kind: "countTurnout", card: "{}", by: "y" })).toBe(false);
  });
});
```

- [ ] **Step 3: Run them to verify they fail.**
Run: `npx vitest run convex/shares.test.ts`
Expected: FAIL, because `api.shares` is undefined (no `convex/shares.ts` yet).

- [ ] **Step 4: Add the table, the limit and the import paths.**

In `convex/schema.ts`, after the `askSpend` line:

```ts
  // Share links (spec 2026-10-14-share-link-design.md §6): a server-built snapshot of one card. `by` traces a bad link;
  // the public query never returns it. No arguments, question or reply are stored.
  shares: defineTable({ shareId: v.string(), kind: v.string(), card: v.string(), createdAt: v.number(), by: v.string() }).index("by_shareId", ["shareId"]),
```

In `convex/limits.ts`, add `DAY` to the import (`import { DAY, HOUR, RateLimiter } from "@convex-dev/rate-limiter";`), then:

```ts
// Share links from Ask: each re-runs one tool and stores one snapshot, per account.
export const ASK_SHARES = { kind: "token bucket" as const, rate: 30, period: DAY, capacity: 30 };
```

Add `askShares: ASK_SHARES,` to the `RateLimiter` config.

In `convex/tsconfig.json` `compilerOptions`, add `"baseUrl": "."` and `"paths": { "@/*": ["../*"] }`. `ui/lib` files reached from Convex use `@/` in their type-only imports.

- [ ] **Step 5: Write `convex/shares.ts`.**

```ts
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import { action, internalMutation, query, type ActionCtx } from "./_generated/server";
import { rateLimiter } from "./limits";
import { isShareable, newShareId, shareCard, shareDate, SITE, type Shared, type ShareResult, type ShareTool } from "../ui/lib/shareCard";

// Share links (spec 2026-10-14-share-link-design.md). The browser sends only which tool made the card and its
// arguments; the server re-runs that tool as the sharer and stores the card's own export, so no number or word on a
// shared page ever came from the browser.

// The same Convex function Ask's tool calls, with the same argument validators and rate limits. A tract tool's
// answer is the model's slim copy; its full detail is what it just saved under its key.
async function rerun(ctx: ActionCtx, tool: ShareTool, args: never): Promise<unknown> {
  switch (tool) {
    case "getNumber": return ctx.runQuery(api.ask.getNumber, args);
    case "factSheet": return ctx.runQuery(api.factSheet.findSheet, args);
    case "countStops": return ctx.runQuery(api.stops.countStops, args);
    case "countTurnout": return ctx.runQuery(api.elections.countTurnout, args);
    case "countRecords": return ctx.runAction(api.city.countRecords, args);
    case "timeSpan": return ctx.runAction(api.spans.timeSpan, args);
    case "readReport": return ctx.runAction(api.ask.readReport, args);
    case "rankTracts":
    case "compareYears":
    case "relateTracts": {
      const fn = tool === "rankTracts" ? api.tracts.rankTracts : tool === "compareYears" ? api.tracts.compareYears : api.tracts.relateTracts;
      const r = (await ctx.runAction(fn, args)) as { status: string; key?: string };
      return r.status === "ok" && r.key ? ctx.runQuery(api.tracts.tractDetail, { key: r.key, now: Date.now() }) : r;
    }
  }
}

export const create = action({
  args: { tool: v.string(), args: v.any() },
  handler: async (ctx, a): Promise<ShareResult> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { ok: false, reason: "signed-out" };
    if (!isShareable(a.tool)) return { ok: false, reason: "not-shareable" };
    if (!(await rateLimiter.limit(ctx, "askShares", { key: identity.tokenIdentifier })).ok) return { ok: false, reason: "limit" };
    let shared: Shared | null = null;
    try {
      shared = shareCard(a.tool, await rerun(ctx, a.tool, a.args as never), { origin: SITE, date: shareDate(Date.now()) });
    } catch (e) {
      // Arguments that don't fit, or the source failing: no link. The arguments aren't logged (they can hold typed words).
      console.error(`share ${a.tool} failed:`, e instanceof Error ? e.message : String(e));
    }
    if (!shared) return { ok: false, reason: "failed" };
    const card = JSON.stringify(shared);
    for (let i = 0; i < 3; i++) {
      const shareId = newShareId();
      if (await ctx.runMutation(internal.shares.store, { shareId, kind: a.tool, card, by: identity.tokenIdentifier })) return { ok: true, id: shareId };
    }
    return { ok: false, reason: "failed" };
  },
});

export const store = internalMutation({
  args: { shareId: v.string(), kind: v.string(), card: v.string(), by: v.string() },
  handler: async (ctx, a): Promise<boolean> => {
    const clash = await ctx.db.query("shares").withIndex("by_shareId", (q) => q.eq("shareId", a.shareId)).first();
    if (clash) return false;
    await ctx.db.insert("shares", { ...a, createdAt: Date.now() });
    return true;
  },
});

// Anyone with the link: the snapshot and when it was shared, never who shared it.
export const get = query({
  args: { id: v.string() },
  handler: async (ctx, { id }): Promise<{ kind: string; shared: Shared; createdAt: number } | null> => {
    const row = await ctx.db.query("shares").withIndex("by_shareId", (q) => q.eq("shareId", id)).first();
    return row ? { kind: row.kind, shared: JSON.parse(row.card) as Shared, createdAt: row.createdAt } : null;
  },
});

// Taking a link down, by hand: npx convex run shares:remove '{"id":"…"}' --prod
export const remove = internalMutation({
  args: { id: v.string() },
  handler: async (ctx, { id }): Promise<boolean> => {
    const row = await ctx.db.query("shares").withIndex("by_shareId", (q) => q.eq("shareId", id)).first();
    if (!row) return false;
    await ctx.db.delete(row._id);
    return true;
  },
});
```

- [ ] **Step 6: Regenerate the API types and typecheck both projects.**
Run: `npx convex codegen && npx tsc --noEmit && npx tsc -p convex/tsconfig.json --noEmit`
Expected: all three exit 0. `convex codegen` only rewrites `convex/_generated` locally. It doesn't push anything. If it insists on a deployment, skip it and rely on the tests, which import from the source. The convex tsc run proves the `@/` paths resolve from `ui/lib`.

- [ ] **Step 7: Run the tests.**
Run: `npx vitest run convex/shares.test.ts convex/city.test.ts`
Expected: PASS, shares 9 tests, plus city unchanged.

If "re-runs a signed-in-only City count as the sharer" fails and the log shows a City SQL shape the fake didn't answer (e.g. the map grid query), copy the fake `citySql` from city.test.ts's "counts live, groups oldest to newest" test and drop `groupBy`. That's a test-fixture fix, not a code change.

If it fails with `reason: "failed"` and the log shows "Sign in to ask", then `ctx.runAction` did not carry the identity. **Stop and report it.** The spec's design depends on that, and the fallback (exporting the tools' handlers as helpers) is a design change.

- [ ] **Step 8: Commit.**

```bash
git add convex/shares.ts convex/shares.test.ts convex/schema.ts convex/limits.ts convex/tsconfig.json convex/city.test.ts convex/_generated tests/helpers/citySeed.ts
git commit -m "feat: shares table; the server re-runs a card's tool and stores its export snapshot

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: The Share link button in Ask

**Files:**
- Create: `ui/components/ShareLink.tsx`
- Modify:
  - `ui/components/ExportBar.tsx`: the `make` variant shows `ShareLink` when a share scope is present;
  - `ui/components/AskCards.tsx`: wrap the 10 tools' cards in `ShareScope`, and put one `ShareLink` under report passages;
  - `ui/components/ask.module.css`: one rule for the link.
- Test: none new in this task. No React component-testing library is installed, and none is added. The button's wording is `shareMessage` (tested in Task 2), and the click → link → open flow is Task 5's browser test.

**Interfaces:**
- Consumes: Task 3's `api.shares.create`; Task 2's `shareMessage`.
- Produces:
  - `ShareScope({ tool, args, children })`
  - `useShare(): { tool: string; args: unknown } | null`
  - `ShareLink({ tool, args })`, which renders `button[data-share]`, then `a[data-share-url]` with the full URL as both its href and its text.

- [ ] **Step 1: Write `ui/components/ShareLink.tsx`.**

```tsx
"use client";
import { useAction } from "convex/react";
import { createContext, type ReactNode, useContext, useState } from "react";
import { api } from "@/convex/_generated/api";
import { shareMessage } from "@/ui/lib/shareCard";
import styles from "./ask.module.css";

// Share link (spec 2026-10-14-share-link-design.md §4): the card's tool and arguments travel down to its export bar,
// which offers a link. Outside Ask (fact sheet pages, the shared page itself) there is no scope, so no button.
type Share = { tool: string; args: unknown };
const ShareContext = createContext<Share | null>(null);
export const ShareScope = ({ tool, args, children }: Share & { children: ReactNode }) => <ShareContext.Provider value={{ tool, args }}>{children}</ShareContext.Provider>;
export const useShare = () => useContext(ShareContext);


export function ShareLink({ tool, args }: Share) {
  const create = useAction(api.shares.create);
  const [state, setState] = useState<{ s: "idle" | "making" } | { s: "done"; url: string } | { s: "failed"; message: string }>({ s: "idle" });
  const [copied, setCopied] = useState(false);
  if (state.s === "making") return <span role="status">Making link…</span>;
  if (state.s === "done") {
    return (
      <span className={styles.shareLink} data-share>
        <a href={state.url} data-share-url>{state.url}</a>
        <button type="button" onClick={() => navigator.clipboard.writeText(state.url).then(() => setCopied(true), () => setCopied(false))}>{copied ? "Copied" : "Copy"}</button>
      </span>
    );
  }
  const share = async () => {
    setState({ s: "making" });
    const r = await create({ tool, args }).catch(() => null);
    setState(r?.ok ? { s: "done", url: `${window.location.origin}/s/${r.id}` } : { s: "failed", message: shareMessage(r) ?? "" });
  };
  return (
    <>
      <button type="button" data-share onClick={share}>Share link</button>
      {state.s === "failed" && <span role="status">{state.message}</span>}
    </>
  );
}
```

In `ui/components/ask.module.css`, add:

```css
.shareLink { display: inline-flex; flex-wrap: wrap; gap: 0.5rem; align-items: baseline; min-width: 0; }
.shareLink a { overflow-wrap: anywhere; }
```


- [ ] **Step 2: Show the button in the export bar.** In `ui/components/ExportBar.tsx`:
  - import `{ ShareLink, useShare } from "./ShareLink"`;
  - add `const share = useShare();` right after the `useState` line, before the first `return`, because hooks can't follow a conditional return;
  - in the `make` variant's final `<div>`, after the PNG button, add `{share && make && <ShareLink {...share} />}`.

  The expired state ("Ask again to export") gets no share button.

- [ ] **Step 3: Wrap the shareable cards in `ui/components/AskCards.tsx`.** Import `{ ShareLink, ShareScope } from "./ShareLink"`. Wrap only the card element, never the FollowUps:
  - **factSheet:** `<ShareScope tool="factSheet" args={props.parameters}><FactSheetCard r={r} /></ShareScope>`
  - **countStops:** `<ShareScope tool="countStops" args={props.parameters}><StopsCard r={r} /></ShareScope>`
  - **countTurnout:** `<ShareScope tool="countTurnout" args={props.parameters}><TurnoutCard r={r} /></ShareScope>`
  - **getNumber:** `<ShareScope tool="getNumber" args={props.parameters}><NumberCard … /></ShareScope>`
  - **countRecords:** wrap `<MeasureCard …/>` and `<CountOrEarlier …/>` each in `<ShareScope tool="countRecords" args={props.parameters}>`. The folded earlier copy (`noMap`) has no ExportBar, so it shows no button.
  - **timeSpan:** `<ShareScope tool="timeSpan" args={props.parameters}><SpanCard … /></ShareScope>`
  - **The tract tools:** give the `tractCard` helper a first parameter `tool: "rankTracts" | "compareYears" | "relateTracts"` and a `parameters: unknown` argument. Its ok branch becomes `<><ShareScope tool={tool} args={parameters}>{card(r)}</ShareScope><FollowUps … /></>`, and the three `useRenderTool` calls pass `"rankTracts", props.parameters` (and so on).
  - **readReport:** after the passages' `map`, add `{r.passages.length > 0 && <div className={styles.exportBar}><ShareLink tool="readReport" args={props.parameters} /></div>}`.

- [ ] **Step 4: Typecheck and run the UI suites.**
Run: `npx tsc --noEmit && npx vitest run tests/ui`
Expected: tsc exits 0, and all tests/ui files pass, including the AskCards stubs in `tests/ui/ask.test.ts` and `tests/ui/askTools.test.ts`. If a stub renders an export bar without a Convex provider, `useShare` returns null outside a scope, so nothing changes. If a test renders a scoped card and fails on `useAction`, mock `convex/react` the way that file already does.

- [ ] **Step 5: Commit.**

```bash
git add ui/components/ShareLink.tsx ui/components/ExportBar.tsx ui/components/AskCards.tsx ui/components/ask.module.css
git commit -m "feat: Share link button under every shareable Ask card

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: The shared page and its browser tests

**Files:**
- Create: `app/s/[id]/page.tsx`, `app/s/[id]/not-found.tsx`, `ui/components/SharedAnswer.tsx`, `ui/components/share.module.css`
- Modify: `e2e/ask.spec.ts`, adding two tests after "a turnout question draws the turnout card"

**Interfaces:**
- Consumes: Task 3's `api.shares.get`; Task 2's `Shared` and `shareDate`; `ExportBar` (`make` or `copy`); and `Masthead`, `SiteNav` and `CreditFooter` with `factSheet.module.css`'s `page`, `main` and `chrome` classes, as `ui/components/FactSheet.tsx` uses them.
- Produces: the route `/s/<id>`, and `[data-shared]`, `[data-as-of]` and `[data-export]` on that page.

- [ ] **Step 1: Write the failing browser tests.** Add them to `e2e/ask.spec.ts` inside the same `describe` as the turnout test.

```ts
  test("a shared turnout card opens for someone signed out", async ({ page, browser }) => {
    await ask(page, "Did turnout change between elections?");
    const card = page.locator("[data-card=turnout]:visible");
    await expect(card).toBeVisible({ timeout: 40_000 });
    await card.locator("button[data-share]").click();
    const link = card.locator("[data-share-url]");
    await expect(link).toBeVisible({ timeout: 30_000 });
    const url = await link.getAttribute("href");
    expect(url).toMatch(/\/s\/[0-9A-Za-z]{10}$/);
    const anon = await browser.newContext(); // no sign-in: anyone with the link
    const p = await anon.newPage();
    await p.setViewportSize(page.viewportSize() ?? { width: 1280, height: 800 });
    await p.goto(url!);
    const shared = p.locator("[data-shared]");
    await expect(shared).toContainText("Milwaukee voter turnout");
    await expect(shared).toContainText("November 2020 general election");
    await expect(p.locator("[data-as-of]")).toContainText("Numbers are as of that day.");
    await expect(p.locator("[data-export] button")).toHaveText(["CSV", "Copy text", "PNG"]);
    await expect(p.locator("button[data-share]")).toHaveCount(0);
    await expect(p.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    expect(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await anon.close();
  });

  test("a share link that doesn't exist says so", async ({ page }) => {
    for (const path of ["/s/doesnotexi", "/s/..%2F..", `/s/${"x".repeat(500)}`]) {
      const res = await page.goto(path);
      expect(res?.status()).toBe(404);
      await expect(page.getByText("This shared answer isn't available.")).toBeVisible();
    }
  });
```

- [ ] **Step 2: Write the page.** Create `app/s/[id]/page.tsx`:

```tsx
import { fetchQuery } from "convex/nextjs";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { api } from "@/convex/_generated/api";
import { SharedAnswer } from "@/ui/components/SharedAnswer";

type Props = { params: Promise<{ id: string }> };

// Only a well-formed id is looked up; anything else is simply not there.
const load = async (id: string) => (/^[0-9A-Za-z]{10}$/.test(id) ? fetchQuery(api.shares.get, { id }) : null);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const s = await load((await params).id);
  const title = `${s ? ("card" in s.shared ? s.shared.card.title : "A quote from a DYCU report") : "Shared answer"} · Cream City Almanac`;
  return { title, openGraph: { title }, robots: { index: false, follow: false } };
}

export default async function Page({ params }: Props) {
  const s = await load((await params).id);
  if (!s) notFound();
  return <SharedAnswer shared={s.shared} createdAt={s.createdAt} />;
}
```

Create `app/s/[id]/not-found.tsx`:

```tsx
import Link from "next/link";
import { CreditFooter } from "@/ui/components/CreditFooter";
import { Masthead } from "@/ui/components/Masthead";
import { SiteNav } from "@/ui/components/SiteNav";
import fs from "@/ui/components/factSheet.module.css";

export const metadata = { title: "Shared answer · Cream City Almanac", robots: { index: false, follow: false } };

export default function NotFound() {
  return (
    <div className={fs.page}>
      <Masthead side={null} showDate={false} nav={<SiteNav placement="masthead" current={null} />} />
      <main className={fs.main}>
        <p>This shared answer isn&apos;t available.</p>
        <p><Link href="/ask">Ask your own question →</Link></p>
      </main>
      <div className={fs.chrome}><CreditFooter /></div>
    </div>
  );
}
```

Create `ui/components/SharedAnswer.tsx`:

```tsx
"use client";
import Link from "next/link";
import type { CardExport } from "@/ui/lib/cardExport";
import { shareDate, type Shared } from "@/ui/lib/shareCard";
import { CreditFooter } from "./CreditFooter";
import { ExportBar } from "./ExportBar";
import { Masthead } from "./Masthead";
import { SiteNav } from "./SiteNav";
import fs from "./factSheet.module.css";
import styles from "./share.module.css";

// The shared page (spec 2026-10-14-share-link-design.md §4): the stored snapshot, drawn as the export's table, with
// the day it was shared. The snapshot's own "Exported from … on" line is left out here; the as-of line says it.
const EXPORTED = "Exported from Cream City Almanac on ";

function CardBody({ e }: { e: CardExport }) {
  return (
    <>
      <h1 className={styles.title}>{e.title}</h1>
      {e.lines.map((l) => <p key={l} className={styles.line}>{l}</p>)}
      <div className={styles.scroll}>
        <table className={styles.table}>
          <thead><tr>{e.text.head.map((h, i) => <th key={i} scope="col">{h}</th>)}</tr></thead>
          <tbody>{e.text.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
        </table>
      </div>
      <ul className={styles.notes}>{e.notes.filter((n) => !n.startsWith(EXPORTED)).map((n) => <li key={n}>{n}</li>)}</ul>
    </>
  );
}

export function SharedAnswer({ shared, createdAt }: { shared: Shared; createdAt: number }) {
  const quote = "quote" in shared ? shared.quote.split("\n").filter((l) => !l.startsWith(EXPORTED)).join("\n") : null;
  return (
    <div className={fs.page}>
      <Masthead side={null} showDate={false} nav={<SiteNav placement="masthead" current={null} />} />
      <main className={fs.main}>
        <article className={styles.shared} data-shared>
          {"card" in shared ? <CardBody e={shared.card} /> : <p className={styles.quote}>{quote}</p>}
          <p className={styles.asOf} data-as-of>Shared from Cream City Almanac on {shareDate(createdAt)}. Numbers are as of that day.</p>
          {"card" in shared ? <ExportBar make={() => shared.card} /> : <ExportBar copy={() => shared.quote} />}
          <p><Link href="/ask">Ask your own question →</Link></p>
        </article>
      </main>
      <div className={fs.chrome}><CreditFooter /></div>
    </div>
  );
}
```

Create `ui/components/share.module.css`. It uses the site's existing color tokens, so check `app/globals.css` for the names (`--ink`, `--rule`, `--muted` or whatever is defined there) and use those exact names:

```css
.shared { min-width: 0; max-width: 46rem; }
.title { font-size: 1.25rem; margin: 0 0 0.5rem; }
.line { margin: 0 0 0.5rem; }
.scroll { overflow-x: auto; max-width: 100%; margin: 0.75rem 0; }
.table { border-collapse: collapse; font-variant-numeric: tabular-nums; }
.table th, .table td { text-align: left; padding: 0.25rem 0.75rem 0.25rem 0; border-bottom: 1px solid var(--rule); white-space: nowrap; }
.notes { padding-left: 1.1rem; font-size: 0.9rem; }
.quote { white-space: pre-line; }
.asOf { font-size: 0.9rem; font-style: italic; }
```

- [ ] **Step 3: Typecheck, build and run unit suites.**
Run: `npx tsc --noEmit && npm run build && npx vitest run tests/ui`
Expected: all exit 0, and the build lists the route `/s/[id]`.

- [ ] **Step 4: Ask Tarik for the dev push, then run the browser tests locally.**
  - **Why the push:** locally and on PR previews, the site reads the **dev** Convex deployment, so `shares` must exist there. Ask: "OK to push the share functions and `shares` table to dev Convex (`npx convex dev --once`)?" Run it only on a yes.
  - **Then:**
    - start the app on :3100: `npx next dev -p 3100`, with `.env.local` loaded;
    - warm it by opening `/ask` once;
    - run `BASE_URL=http://localhost:3100 npx playwright test e2e/ask.spec.ts -g "share"`.
  - **Expected:** 4 passed (2 tests × desktop and phone).
  - **Without an OK:** skip the local run, ledger it, and rely on CI's preview e2e. CI's preview e2e also reads dev, so it needs the same push. Say so in the PR.

- [ ] **Step 5: Commit.**

```bash
git add "app/s/[id]/page.tsx" "app/s/[id]/not-found.tsx" ui/components/SharedAnswer.tsx ui/components/share.module.css e2e/ask.spec.ts
git commit -m "feat: /s/<id> shows a shared card to anyone, hidden from search, with the day it was shared

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Docs

**Files:**
- Create: `docs/decisions/043-share-link.md`
- Modify:
  - `ui/components/HowItWorks.tsx`: the export paragraph, around line 87;
  - `docs/research/2026-10-12-questions-by-audience.md`: lines 238 and 247.

- [ ] **Step 1: Write decision 043.**

```markdown
# 043: A share link shows one Ask card, as it was on the day it was shared, to anyone with the link

**Decision:** Every Ask card that can be exported gets a Share link. The server re-runs the card's question, stores a snapshot of the card, and publishes it at a permanent address (`/s/` and a random 10-character code) that anyone can open without an account. Search engines are told not to list it.

**Why this came up:** Reporters want to show an answer to an editor. Exports (decision 032) produce files to attach. An editor wants to click a link. A public page on the Almanac's own address reads as "the Almanac says this", so getting it wrong means the site vouching for a number it didn't produce, or putting something personal on a public page.

**Options:**
- **Trust the browser.** Store the card exactly as the reporter's browser sends it. Smallest build, but anyone signed in could publish a made-up card under the site's name.
- **Sign every answer.** Stamp each answer with a secret key as it is made, and store only stamped answers. Exact match to the screen, but it adds a secret and work to every question.
- **Re-run on the server (chosen).** The browser says only which question to share. The server asks it again and stores what it got.

**What we chose and why (Tarik, 2026-10-14, with Claude):**
- **Anyone with the link can open it,** so an editor without an account, or a reader of a published story, can see it. The code has about 59 bits of randomness, so links can't be guessed.
- **Permanent,** so a link in a story or an email keeps working. The page says the day it was shared and that the numbers are as of that day.
- **The card only.** What the reporter typed and the AI's reply are never stored or shown, because typed words can hold anything, including names and addresses. Address and boundary cards can't be shared at all.
- **The server re-runs the question** and builds the snapshot with the same code as the card's CSV, text and image exports, so all four agree and no number on a shared page came from a browser.

**What we gave up:**
- If the data changed between asking and sharing (the weekly build), the shared card shows the newer numbers, not the ones on the reporter's screen.
- No "my shared links" list. A link is taken down by hand, by the developer.
- Maps and the relate scatter chart aren't on the shared page: it shows the export's table, like the image export.
- Each share runs its question again, which costs one report search for a report quote.

**How we'll know if this was right:**
- Editors open links instead of asking for files.
- No shared page ever shows a figure that differs from what the server computes for the same question that day.
- No request to take down a link because it exposed something personal.

**What actually happened:**
```

- [ ] **Step 2: Update How it works.** In `ui/components/HowItWorks.tsx`, extend the export paragraph after "The AI doesn&apos;t write any of it." with:

```tsx
 A card can also be shared as a link anyone can open. It shows the card as it was the day it was shared; the server asks the question again to build it, so nothing on the page comes from the reporter&apos;s browser.
```

- [ ] **Step 3: Update the questions document.**
  - In `docs/research/2026-10-12-questions-by-audience.md`, change line 238 to `  - A link an editor can open: **Now** (C2, decision 043).`
  - Change line 247 to `4. **Share link to an answer.** Done (C2, decision 043): any exportable card can be shared as a permanent link that shows it as it was that day.`

- [ ] **Step 4: Run the full checks.**
Run: `npx tsc --noEmit && npx vitest run > /tmp/c2-vitest.log 2>&1; tail -5 /tmp/c2-vitest.log`
Expected: tsc exits 0, and the vitest summary shows all files passed. Under machine load, `convex/buildStore.test.ts` and `convex/search.test.ts` can time out. Re-run those two alone; they pass alone (known, see the K4 ledger).

- [ ] **Step 5: Commit.**

```bash
git add docs/decisions/043-share-link.md ui/components/HowItWorks.tsx docs/research/2026-10-12-questions-by-audience.md
git commit -m "docs: decision 043, How it works and the questions list for share links

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Going live (after "merge N")

- **Merging** deploys the code and the empty `shares` table to prod (`scripts/vercel-build.sh`).
- **No data step.**
- **Verify:**
  - the production deploy happened;
  - `npx convex run shares:get '{"id":"doesnotexi"}' --prod` prints `null`;
  - `https://www.creamcityalmanac.app/s/doesnotexi` gives 404 with the message.
