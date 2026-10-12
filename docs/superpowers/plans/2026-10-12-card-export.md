# Export a Card (CSV, Copy Text, PNG) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Under each of Ask's number cards, add CSV, Copy text and PNG exports, plus Copy text under report quotes. Every export carries the card's own title, figures, fine print, caveats and source.

**Architecture:** Pure functions in `ui/lib/cardExport.ts` turn each card's data into one `CardExport`. CSV and text are written from that same object, so the formats can't disagree. `ui/lib/pngLayout.ts` lays the export out without drawing anything, which keeps it testable, and `ui/lib/cardPng.ts` paints that layout on the browser's canvas. `ui/components/ExportBar.tsx` holds the buttons. Tract cards export from the full answer (`tractDetail`), never the trimmed 10-row copy. No server, schema or tool changes.

**Tech Stack:** Next.js 16, React 19, TypeScript, Vitest (edge-runtime environment, pure functions only), Playwright (desktop Chrome and iPhone 13 WebKit).

**Spec:** `docs/superpowers/specs/2026-10-12-card-export-design.md`

## Global Constraints

- **An export copies the card; it never rewrites it.** Every number and sentence comes from the card's data or the card's own wording functions. Nothing is written by the model at export time.
- **No new npm dependency.** The PNG uses the browser's built-in canvas.
- **CSV layout:** a UTF-8 byte-order mark (`﻿`) first; header row; data rows; one blank row; then title, lines and notes, one per row in the first column. Lines end in `\r\n`.
- **CSV values:** numbers are the stored values, unrounded, with the unit in the heading ("pov_rate (percent)"). Text cells starting with `=`, `+`, `-`, `@`, tab or carriage return get a leading `'`. Number cells are never guarded.
- **Text and PNG values** use the card's rounding (`rangeText`, `changeText`, `formatPortraitNumber`, `formatPortraitMargin`).
- **PNG:** 1,200 px wide, white background, at most 15 table rows, then "{N} more rows in the CSV". No map. The relate card's PNG is its table.
- **Messages, verbatim:** "Copied", "Couldn't copy. Use CSV instead." (report quotes: "Couldn't copy."), "Couldn't make the image.", "Loading…", "Ask again to export".
- **Button labels, verbatim:** "CSV", "Copy text", "PNG".
- **File names:** `almanac_` followed by parts joined with `_`. Any run of characters outside `A–Z a–z 0–9 _ -` becomes `-`.
- **Last note line:** "Exported from Cream City Almanac on {date}.", with the date written as `toLocaleDateString("en-US", { dateStyle: "long" })`.
- **Source line:** "Source: DYCU, {code} {name}: {origin}/d/{code}", or "Source: City of Milwaukee, …" when the side is City data (`confidence === EXACT`, or a City count).
- **Never stage** `.superpowers/` or `clerk-creamcityalmanac.app.zone`.
- **Commit trailer:** `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

## Review Focus

1. **The full answer arrives after the first render.** `useDetail` returns `null` first. The bar must show "Loading…" with disabled buttons, never export the trimmed copy. Task 2 pins this with an `exportState` test.
2. **Exact City figures (property side) have no margin.** CSV "Low"/"High" are the same number as the value, and the text shows no range. The fine print still names the property notes. Task 3's relate test pins this.
3. **Census text cells in the neighborhood figure** ("-", "**", "(X)"). These stay text in the CSV and are guarded when they start with `-`, so a spreadsheet never reads them as a formula. Task 4 pins this.
4. **Long names and long notes in the PNG.** Cells are cut with "…" to fit their column, and notes wrap. Nothing is drawn past the right edge. Task 5 pins this.
5. **A City count folded away as an earlier count gets no export line.** Task 6 places the bar only when `!noMap`, which is the unfolded card, and the browser test checks the visible card's bar.

---

### Task 1: The fine-print sentence as a function

**Files:**
- Modify: `ui/lib/tractSummary.ts` (add `KIND` and `fineText`, after `propertyNotes`)
- Modify: `ui/components/TractCards.tsx:30` (drop the local `KIND`, import it) and `:72-86` (`Fine` calls `fineText`)
- Test: `tests/ui/tractSummary.test.ts`

**Interfaces:**
- Produces: `KIND: { rate: "a rate"; count: "a count"; value: "a value" }`; `fineText(heads: { column: string; confidence: string | null }[], o?: { causal?: boolean; lead?: string }): string`. The result can start with a space when there are no margin levels; callers outside the card trim it.

- [ ] **Step 1: Write the failing test.** Append to `tests/ui/tractSummary.test.ts`, and add `fineText, AREA_NOTE, EXACT` to its import from `../../ui/lib/tractSummary`:

```ts
describe("fine print", () => {
  const poverty = { column: "pov_rate", confidence: "90% confidence (Census)" };
  it("names the margin's confidence, then the area note", () => {
    expect(fineText([poverty])).toBe(`Ranges are margins of error: 90% confidence (Census). ${AREA_NOTE}`);
  });
  it("adds the cutoffs, exact City figures, 'related isn't caused' and the property notes, in the card's order", () => {
    expect(fineText([poverty, { column: "median_assessed", confidence: EXACT }], { causal: true, lead: "Cutoffs: top third on pov_rate, bottom third on median_assessed." })).toBe(
      "Cutoffs: top third on pov_rate, bottom third on median_assessed. Ranges are margins of error: 90% confidence (Census). Property figures are exact (City records). Related doesn't mean one causes the other. Assessed value is the City's figure for property taxes, not what a home would sell for. Property figures cover the City of Milwaukee; tracts on the City line count only their City part. A pattern across tracts doesn't tell you about any one home or family. " + AREA_NOTE,
    );
  });
  it("says when a column has no margin of error", () => {
    expect(fineText([{ column: "x", confidence: null }])).toBe(`Ranges are margins of error: no margin of error found for this column. Without a margin of error, findings can't be separated from noise. ${AREA_NOTE}`);
  });
});
```

- [ ] **Step 2: Run it.** `npx vitest run tests/ui/tractSummary.test.ts`. Expected: FAIL, `fineText` is not exported.

- [ ] **Step 3: Implement.** In `ui/lib/tractSummary.ts`, after `propertyNotes`:

```ts
export const KIND = { rate: "a rate", count: "a count", value: "a value" } as const;

// The tract cards' fine print, in the card's order; the card adds its links after it, and an export copies it.
export function fineText(heads: { column: string; confidence: string | null }[], o: { causal?: boolean; lead?: string } = {}): string {
  // Exact City figures have no margin, so only the survey sides are listed as ranges.
  const levels = [...new Set(heads.filter((h) => h.confidence !== EXACT).map((h) => h.confidence ?? "no margin of error found for this column"))];
  const exact = heads.some((h) => h.confidence === EXACT);
  const bare = heads.some((h) => !h.confidence); // spec §5 rule 7
  return `${o.lead ? `${o.lead} ` : ""}${levels.length > 0 ? `Ranges are margins of error: ${levels.join("; ")}.` : ""}${exact ? " Property figures are exact (City records)." : ""}${bare ? " Without a margin of error, findings can't be separated from noise." : ""}${o.causal ? " Related doesn't mean one causes the other." : ""}${propertyNotes(heads).map((n) => ` ${n}`).join("")} ${AREA_NOTE}`;
}
```

In `ui/components/TractCards.tsx`:
- Delete the line `const KIND = { rate: "a rate", count: "a count", value: "a value" } as const;`.
- Add `fineText, KIND` to the `@/ui/lib/tractSummary` import.
- Replace the body of `Fine` with:

```tsx
function Fine({ heads, causal, lead, onOpen }: { heads: { code: string; column: string; confidence: string | null }[]; causal?: boolean; lead?: string; onOpen: Open }) {
  return (
    <p className={styles.tractFine}>
      {fineText(heads, { causal, lead })}{" "}
      {/* A new tab, so the conversation stays where it is. */}
      <a href={NEIGHBORHOODS_HELP} target="_blank" rel="noopener">How neighborhoods work</a>. Caveats:{" "}
      {heads.map((h, i) => <span key={h.code}>{i > 0 && " · "}<OpenLink code={h.code} onOpen={onOpen} label={h.code} /></span>)}
    </p>
  );
}
```

Then remove any imports `TractCards.tsx` no longer uses (`propertyNotes`, `AREA_NOTE` if unused). Run `npx tsc --noEmit` to find them.

- [ ] **Step 4: Run it.** `npx vitest run tests/ui/tractSummary.test.ts && npx tsc --noEmit`. Expected: PASS and no type errors.

- [ ] **Step 5: Commit.**

```bash
git add ui/lib/tractSummary.ts ui/components/TractCards.tsx tests/ui/tractSummary.test.ts
git commit -m "refactor: the tract cards' fine print is a function an export can reuse

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 2: The export object, CSV, text, file names and state

**Files:**
- Create: `ui/lib/cardExport.ts`
- Test: `tests/ui/cardExport.test.ts`

**Interfaces:**
- Produces:
  - `type Cell = string | number | null`
  - `type CardExport = { title: string; lines: string[]; csv: { head: string[]; rows: Cell[][] }; text: { head: string[]; rows: string[][] }; notes: string[]; filename: string }`
  - `type Ctx = { origin: string; date: string }`
  - `csvCell(c: Cell): string`, `toCsv(e: CardExport): string`, `toText(e: CardExport): string`
  - `safeName(parts: string[]): string`, `exported(ctx: Ctx): string`
  - `sourceNote(who: "DYCU" | "City of Milwaukee", code: string, name: string | null, ctx: Ctx): string`
  - `exportState(ready: boolean, expired: boolean): "ready" | "loading" | "expired"`

- [ ] **Step 1: Write the failing test.** Create `tests/ui/cardExport.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { csvCell, exportState, exported, safeName, sourceNote, toCsv, toText, type CardExport } from "../../ui/lib/cardExport";

const ctx = { origin: "https://almanac.test", date: "October 12, 2026" };
const e: CardExport = {
  title: "Highest pov_rate · County 2023",
  lines: ["One line."],
  csv: { head: ["Tract", "pov_rate (percent)", "Change"], rows: [["1860", 41.25, -3.75], ["93", null, 0]] },
  text: { head: ["Tract", "pov_rate"], rows: [["1860", "41.3%"]] },
  notes: ["A note, with a comma.", "Source: DYCU, E02: https://almanac.test/d/E02"],
  filename: "almanac_x",
};

describe("CSV cells", () => {
  it("quotes commas, quotes and line breaks", () => {
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("two\nlines")).toBe('"two\nlines"');
  });
  it("guards text a spreadsheet would run as a formula, never a number", () => {
    expect(csvCell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell("-")).toBe("'-");
    expect(csvCell("@x")).toBe("'@x");
    expect(csvCell(-3.75)).toBe("-3.75");
    expect(csvCell(null)).toBe("");
    expect(csvCell(Number.NaN)).toBe("");
  });
});

describe("CSV", () => {
  it("starts with the byte-order mark, then the table, a blank row, then title, lines and notes", () => {
    const csv = toCsv(e);
    expect(csv.startsWith("﻿Tract,pov_rate (percent),Change\r\n1860,41.25,-3.75\r\n93,,0\r\n\r\n")).toBe(true);
    expect(csv).toContain("\r\nHighest pov_rate · County 2023\r\nOne line.\r\n\"A note, with a comma.\"\r\n\"Source: DYCU, E02: https://almanac.test/d/E02\"\r\n");
  });
});

describe("text", () => {
  it("is the title and lines, the table with ' · ' between cells, then the notes", () => {
    expect(toText(e)).toBe("Highest pov_rate · County 2023\nOne line.\n\nTract · pov_rate\n1860 · 41.3%\n\nA note, with a comma.\nSource: DYCU, E02: https://almanac.test/d/E02");
  });
});

describe("names and notes", () => {
  it("makes a safe file name", () => {
    expect(safeName(["E02-pov_rate", "County-2023", "rank"])).toBe("almanac_E02-pov_rate_County-2023_rank");
    expect(safeName(["N03", "Lindsay Heights/2023?"])).toBe("almanac_N03_Lindsay-Heights-2023-");
  });
  it("writes the source and the export date", () => {
    expect(sourceNote("DYCU", "E02", "Households Living in Poverty", ctx)).toBe("Source: DYCU, E02 Households Living in Poverty: https://almanac.test/d/E02");
    expect(sourceNote("City of Milwaukee", "P32", null, ctx)).toBe("Source: City of Milwaukee, P32: https://almanac.test/d/P32");
    expect(exported(ctx)).toBe("Exported from Cream City Almanac on October 12, 2026.");
  });
});

describe("export state", () => {
  it("is ready once the full answer is here, expired only without it, else loading", () => {
    expect(exportState(true, false)).toBe("ready");
    expect(exportState(true, true)).toBe("ready");
    expect(exportState(false, true)).toBe("expired");
    expect(exportState(false, false)).toBe("loading");
  });
});
```

- [ ] **Step 2: Run it.** `npx vitest run tests/ui/cardExport.test.ts`. Expected: FAIL, cannot resolve `../../ui/lib/cardExport`.

- [ ] **Step 3: Implement.** Create `ui/lib/cardExport.ts`:

```ts
// One export per card (spec 2026-10-12-card-export-design.md): CSV, text and PNG are all written from it, so they
// never disagree. It copies the card: its figures, its title and lines, its fine print, caveats and source.

export type Cell = string | number | null;
export type CardExport = {
  title: string;
  lines: string[]; // the card's lines under its title: dataset line, summary, verdict
  csv: { head: string[]; rows: Cell[][] }; // stored values, unrounded
  text: { head: string[]; rows: string[][] }; // the card's rounding, for text and PNG
  notes: string[];
  filename: string; // without the extension
};
export type Ctx = { origin: string; date: string };

const RISKY = /^[=+\-@\t\r]/; // a spreadsheet runs a cell starting with these as a formula

export function csvCell(c: Cell): string {
  if (c === null) return "";
  if (typeof c === "number") return Number.isFinite(c) ? String(c) : "";
  const s = RISKY.test(c) ? `'${c}` : c;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// The table, one blank row, then the words; the byte-order mark lets Excel read "±" and "—".
export function toCsv(e: CardExport): string {
  const line = (cells: Cell[]) => cells.map(csvCell).join(",");
  const words = [e.title, ...e.lines, ...e.notes].map((w) => line([w]));
  return `﻿${[line(e.csv.head), ...e.csv.rows.map(line), "", ...words].join("\r\n")}\r\n`;
}

export const toText = (e: CardExport): string =>
  [e.title, ...e.lines, "", e.text.head.join(" · "), ...e.text.rows.map((r) => r.join(" · ")), "", ...e.notes].join("\n");

export const safeName = (parts: string[]) => `almanac_${parts.map((p) => p.replace(/[^A-Za-z0-9_-]+/g, "-")).join("_")}`;

export const exported = (ctx: Ctx) => `Exported from Cream City Almanac on ${ctx.date}.`;

export const sourceNote = (who: "DYCU" | "City of Milwaukee", code: string, name: string | null, ctx: Ctx) =>
  `Source: ${who}, ${code}${name ? ` ${name}` : ""}: ${ctx.origin}/d/${code}`;

// A tract card exports from its full answer only; the trimmed copy it shows first would mislead under the full title.
export const exportState = (ready: boolean, expired: boolean): "ready" | "loading" | "expired" =>
  ready ? "ready" : expired ? "expired" : "loading";
```

- [ ] **Step 4: Run it.** `npx vitest run tests/ui/cardExport.test.ts`. Expected: PASS, 8 tests.

- [ ] **Step 5: Commit.**

```bash
git add ui/lib/cardExport.ts tests/ui/cardExport.test.ts
git commit -m "feat: one export per card, written as CSV or text

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 3: Tract card exports (rank, change, relate)

**Files:**
- Modify: `ui/lib/cardExport.ts` (append)
- Test: `tests/ui/cardExport.test.ts` (append)

**Interfaces:**
- Consumes: from Task 2, `CardExport`, `Ctx`, `safeName`, `sourceNote`, `exported`. From Task 1, `KIND`. Also `RankDetail`, `ChangeDetail`, `RelateDetail`, `Header` and `TractRow` from `@/convex/tracts`, `CityShare` from `@/convex/lib/tractPlaces`, `rangeText`, `changeText`, `plainMeaning`, `unitOf` and `Unit` from `./tractFormat`, `cityList` and `dycuText` from `./placeNames`, and `EXACT` from `./tractSummary`.
- Produces:
  - `type TractCardText = { title: string; lines: string[]; fine: string }`
  - `rankExport(d: RankDetail, card: TractCardText, ctx: Ctx): CardExport`
  - `changeExport(d: ChangeDetail, card: TractCardText, ctx: Ctx): CardExport`
  - `relateExport(d: RelateDetail, card: TractCardText, ctx: Ctx): CardExport`
  - `metaLine(h: Header, withCount?: boolean): string`

- [ ] **Step 1: Write the failing test.** Append to `tests/ui/cardExport.test.ts`, and add `changeExport, rankExport, relateExport` to the import from `../../ui/lib/cardExport`:

```ts
import type { ChangeDetail, Header, RankDetail, RelateDetail, TractRow } from "../../convex/tracts";
import { EXACT } from "../../ui/lib/tractSummary";

const pov: Header = { code: "E02", name: "Households Living in Poverty", column: "pov_rate", meaning: "Percentage of households with income below the poverty line", kind: "rate", place: "County", year: "2023", n: 210, leftOut: 0, confidence: "90% confidence (Census)", url: "https://x.test/0", caveats: ["Five-year estimates."] };
const tractRow = (geoid: string, tract: string, value: number, extra: Partial<TractRow> = {}): TractRow => ({ geoid, tract, city: [], dycu: [], value, lo: value - 2, hi: value + 2, unreliable: false, ...extra });
const hillside = tractRow("55079186000", "1860", 41.25, { city: [{ name: "Hillside", share: 51 }, { name: "Halyard Park", share: 27 }, { name: "Triangle North", share: 13 }], dycu: ["Harambee", "Hillside", "Lindsay Heights"] });
const card = { title: "Highest pov_rate · County 2023", lines: ["Summary sentence."], fine: " Ranges are margins of error: 90% confidence (Census)." };

describe("rank export", () => {
  const d: RankDetail = {
    status: "ok", tool: "rank", header: pov, direction: "high", top: [hillside],
    ties: [tractRow("55079009300", "93", 40, { city: [{ name: "Uptown", share: 50 }, { name: "Washington Heights", share: 50 }] })], tieCount: 1,
    unreliable: [tractRow("55079000101", "1.01", 39, { unreliable: true, lo: 10, hi: 68 })], unreliableCount: 1, highlighted: [], key: "k",
  };
  const e = rankExport(d, card, ctx);
  it("lists every ranked, tied and too-uncertain tract with stored values", () => {
    expect(e.csv.head).toEqual(["Rank", "Tract", "GEOID", "City neighborhoods", "DYCU areas", "pov_rate (percent)", "Low", "High", "Status"]);
    expect(e.csv.rows).toEqual([
      [1, "1860", "55079186000", "Hillside 51%; Halyard Park 27%; Triangle North 13%", "Harambee, Hillside, Lindsay Heights", 41.25, 39.25, 43.25, "ranked"],
      [null, "93", "55079009300", "Uptown 50%; Washington Heights 50%", "", 40, 38, 42, "tied"],
      [null, "1.01", "55079000101", "", "", 39, 10, 68, "too uncertain"],
    ]);
  });
  it("shows the card's rounding in text, with = for a tie and – for too uncertain", () => {
    expect(e.text.head).toEqual(["#", "Tract", "Neighborhood", "DYCU area", "pov_rate", "Status"]);
    expect(e.text.rows[0]).toEqual(["1", "1860", "Hillside 51% · Halyard Park 27% · Triangle North 13%", "Harambee, Hillside, Lindsay Heights", "41.3% (39.3–43.3%)", "ranked"]);
    expect(e.text.rows[1][0]).toBe("=");
    expect(e.text.rows[2][0]).toBe("–");
    expect(e.text.rows[2][2]).toBe("—");
  });
  it("carries the card's title, its dataset line, summary, fine print, caveats and source", () => {
    expect(e.title).toBe("Highest pov_rate · County 2023");
    expect(e.lines).toEqual(["E02 pov_rate (Percentage of households with income below the poverty line, a rate) · County 2023 · 210 census tracts", "Summary sentence."]);
    expect(e.notes).toEqual([
      "Ranges are margins of error: 90% confidence (Census).",
      "Caveat (E02): Five-year estimates.",
      "Source: DYCU, E02 Households Living in Poverty: https://almanac.test/d/E02",
      "Exported from Cream City Almanac on October 12, 2026.",
    ]);
    expect(e.filename).toBe("almanac_E02-pov_rate_County-2023_rank");
  });
});

describe("change export", () => {
  const d: ChangeDetail = {
    status: "ok", tool: "change", header: pov, note: "Neighboring releases share four years of responses.", from: "2022", to: "2023",
    increases: 0, decreases: 1, none: 5, unreliableCount: 0, changeCount: 1, highlighted: [], key: "c",
    changes: [{ geoid: "55079186000", tract: "1860", city: hillside.city, dycu: hillside.dycu, from: tractRow("55079186000", "1860", 45), to: hillside, change: -3.75, direction: "decrease" }],
  };
  const e = changeExport(d, { ...card, title: "pov_rate · County 2022 → 2023" }, ctx);
  it("gives both years' values and ranges, the change and its direction", () => {
    expect(e.csv.head).toEqual(["Tract", "GEOID", "City neighborhoods", "DYCU areas", "2022 pov_rate (percent)", "2022 low", "2022 high", "2023 pov_rate (percent)", "2023 low", "2023 high", "Change", "Direction"]);
    expect(e.csv.rows[0]).toEqual(["1860", "55079186000", "Hillside 51%; Halyard Park 27%; Triangle North 13%", "Harambee, Hillside, Lindsay Heights", 45, 43, 47, 41.25, 39.25, 43.25, -3.75, "decrease"]);
    expect(toCsv(e)).toContain(",-3.75,decrease\r\n");
    expect(e.text.rows[0][5]).toContain("3.8 points (clear decrease)");
  });
  it("keeps the card's note on years and names the file by both years", () => {
    expect(e.notes).toContain("Neighboring releases share four years of responses.");
    expect(e.filename).toBe("almanac_E02-pov_rate_County-2022-2023_change");
  });
});

describe("relate export", () => {
  const value: Header = { code: "H28", name: "Master Property File", column: "median_assessed", meaning: "Median assessed value", kind: "value", place: "County", year: "2023", n: 200, leftOut: 0, confidence: EXACT, url: "u", caveats: [] };
  const point = (geoid: string, tract: string, a: number, b: number, mark: "fits" | "close" | null, unreliable = false) =>
    ({ geoid, tract, city: geoid === hillside.geoid ? hillside.city : [], dycu: geoid === hillside.geoid ? hillside.dycu : [], a: [a, a - 5, a + 5] as [number, number, number], b: [b, b, b] as [number, number, number], unreliable, mark });
  const d: RelateDetail = {
    status: "ok", tool: "relate", mode: "mismatch", a: pov, b: value, n: 3, unreliableCount: 1, rho: 0.1, strength: "weak", direction: "higher",
    aSide: "high", bSide: "high", cutA: 30, cutB: 80000, fits: [], fitsCount: 1, close: [], closeCount: 1,
    points: [point("55079000101", "1.01", 30, 90000, null), point("55079186000", "1860", 41.25, 60000, "fits"), point("55079009300", "93", 40, 70000, "close", true)],
    highlighted: [], closeIds: [], key: "r",
  };
  const e = relateExport(d, { ...card, title: "Households Living in Poverty vs. Master Property File" }, ctx);
  it("lists clear matches, then possible ones, then the rest, with both sides", () => {
    expect(e.csv.head).toEqual(["Tract", "GEOID", "City neighborhoods", "DYCU areas", "E02 pov_rate (percent)", "E02 low", "E02 high", "H28 median_assessed (dollars)", "H28 low", "H28 high", "Match", "Status"]);
    expect(e.csv.rows.map((r) => r[0])).toEqual(["1860", "93", "1.01"]);
    expect(e.csv.rows[1].slice(-2)).toEqual(["possible match", "too uncertain"]);
  });
  it("shows an exact City figure without a range, and names both sources", () => {
    expect(e.text.rows[0][4]).toBe("$60,000");
    expect(e.text.rows[1][5]).toBe("possible match (too uncertain)");
    expect(e.lines[1]).toBe("H28 median_assessed (Median assessed value, a value) · County 2023");
    expect(e.notes).toContain("Source: City of Milwaukee, H28 Master Property File: https://almanac.test/d/H28");
    expect(e.notes).toContain("Source: DYCU, E02 Households Living in Poverty: https://almanac.test/d/E02");
    expect(e.filename).toBe("almanac_E02-pov_rate_H28-median_assessed_County-2023_relate");
  });
});
```

- [ ] **Step 2: Run it.** `npx vitest run tests/ui/cardExport.test.ts`. Expected: FAIL, `rankExport` is not exported.

- [ ] **Step 3: Implement.** Append to `ui/lib/cardExport.ts`, and put these imports at the top of the file:

```ts
import type { CityShare } from "@/convex/lib/tractPlaces";
import type { ChangeDetail, Header, RankDetail, RelateDetail } from "@/convex/tracts";
import { cityList, dycuText } from "./placeNames";
import { changeText, plainMeaning, rangeText, unitOf, type Unit } from "./tractFormat";
import { EXACT, KIND } from "./tractSummary";
```

```ts
// What the tract card itself says, passed in so the export never rewords it.
export type TractCardText = { title: string; lines: string[]; fine: string };

const UNIT_HEAD: Record<Unit, string> = { percent: " (percent)", dollars: " (dollars)", year: " (year)", plain: "" };
const colHead = (h: Header) => `${h.column}${UNIT_HEAD[unitOf(h.meaning)]}`;
const cityCell = (city: CityShare[]) => city.map((c) => `${c.name} ${c.share}%`).join("; ");
const places = (city: CityShare[]) => (city.length ? cityList(city) : "—");
const shown = (r: { value: number; lo: number | null; hi: number | null }, u: Unit) => {
  const t = rangeText(r, u);
  return t.span ? `${t.value} ${t.span}` : t.value;
};
const who = (h: Header) => (h.confidence === EXACT ? "City of Milwaukee" : "DYCU");

// The card's dataset line, as Head shows it.
export const metaLine = (h: Header, withCount = true) =>
  `${h.code} ${h.column} (${plainMeaning(h.meaning) || "no definition in the column guide"}, ${KIND[h.kind]}) · ${h.place} ${h.year}${withCount ? ` · ${h.n} census tracts${h.leftOut ? `, ${h.leftOut} left out (${h.leftOutWhy ?? "no data"})` : ""}` : ""}`;

// Fine print, each dataset's caveats, each source once, then the export date.
function tractNotes(heads: Header[], fine: string, ctx: Ctx, extra: string[] = []): string[] {
  const once = heads.filter((h, i) => heads.findIndex((x) => x.code === h.code) === i);
  return [
    fine.trim(),
    ...extra,
    ...once.flatMap((h) => h.caveats.map((c) => `Caveat (${h.code}): ${c}`)),
    ...once.map((h) => sourceNote(who(h), h.code, h.name, ctx)),
    exported(ctx),
  ];
}

export function rankExport(d: RankDetail, card: TractCardText, ctx: Ctx): CardExport {
  const h = d.header, u = unitOf(h.meaning);
  const all = [
    ...d.top.map((t, i) => ({ t, rank: i + 1 as number | null, status: "ranked" })),
    ...d.ties.map((t) => ({ t, rank: null, status: "tied" })),
    ...d.unreliable.map((t) => ({ t, rank: null, status: "too uncertain" })),
  ];
  return {
    title: card.title,
    lines: [metaLine(h), ...card.lines],
    csv: {
      head: ["Rank", "Tract", "GEOID", "City neighborhoods", "DYCU areas", colHead(h), "Low", "High", "Status"],
      rows: all.map(({ t, rank, status }) => [rank, t.tract, t.geoid, cityCell(t.city), t.dycu.join(", "), t.value, t.lo, t.hi, status]),
    },
    text: {
      head: ["#", "Tract", "Neighborhood", "DYCU area", h.column, "Status"],
      rows: all.map(({ t, rank, status }) => [rank !== null ? String(rank) : status === "tied" ? "=" : "–", t.tract, places(t.city), dycuText(t.dycu), shown(t, u), status]),
    },
    notes: tractNotes([h], card.fine, ctx),
    filename: safeName([`${h.code}-${h.column}`, `${h.place}-${h.year}`, "rank"]),
  };
}

export function changeExport(d: ChangeDetail, card: TractCardText, ctx: Ctx): CardExport {
  const h = d.header, u = unitOf(h.meaning);
  const year = (y: string) => [`${y} ${colHead(h)}`, `${y} low`, `${y} high`];
  return {
    title: card.title,
    lines: [metaLine(h), ...card.lines],
    csv: {
      head: ["Tract", "GEOID", "City neighborhoods", "DYCU areas", ...year(d.from), ...year(d.to), "Change", "Direction"],
      rows: d.changes.map((c) => [c.tract, c.geoid, cityCell(c.city), c.dycu.join(", "), c.from.value, c.from.lo, c.from.hi, c.to.value, c.to.lo, c.to.hi, c.change, c.direction]),
    },
    text: {
      head: ["Tract", "Neighborhood", "DYCU area", d.from, d.to, "Change"],
      rows: d.changes.map((c) => [c.tract, places(c.city), dycuText(c.dycu), shown(c.from, u), shown(c.to, u), changeText(c.change, c.direction, u)]),
    },
    notes: tractNotes([h], card.fine, ctx, d.note ? [d.note] : []),
    filename: safeName([`${h.code}-${h.column}`, `${h.place}-${d.from}-${d.to}`, "change"]),
  };
}

const MATCH = { fits: "clear match", close: "possible match" } as const;
const ORDER = { fits: 0, close: 1 } as const;

export function relateExport(d: RelateDetail, card: TractCardText, ctx: Ctx): CardExport {
  const { a, b } = d, ua = unitOf(a.meaning), ub = unitOf(b.meaning);
  const side = (h: Header) => [`${h.code} ${colHead(h)}`, `${h.code} low`, `${h.code} high`];
  const range = ([value, lo, hi]: [number, number | null, number | null]) => ({ value, lo, hi });
  // Clear matches, then possible ones, then the rest, each in the server's order.
  const points = [...d.points].sort((x, y) => (x.mark ? ORDER[x.mark] : 2) - (y.mark ? ORDER[y.mark] : 2));
  return {
    title: card.title,
    lines: [metaLine(a), metaLine(b, false), ...card.lines],
    csv: {
      head: ["Tract", "GEOID", "City neighborhoods", "DYCU areas", ...side(a), ...side(b), "Match", "Status"],
      rows: points.map((p) => [p.tract, p.geoid, cityCell(p.city), p.dycu.join(", "), ...p.a, ...p.b, p.mark ? MATCH[p.mark] : "", p.unreliable ? "too uncertain" : ""]),
    },
    text: {
      head: ["Tract", "Neighborhood", "DYCU area", a.column, b.column, "Match"],
      rows: points.map((p) => [p.tract, places(p.city), dycuText(p.dycu), shown(range(p.a), ua), shown(range(p.b), ub), [p.mark ? MATCH[p.mark] : "", p.unreliable ? "(too uncertain)" : ""].filter(Boolean).join(" ")]),
    },
    notes: tractNotes([a, b], card.fine, ctx),
    filename: safeName([`${a.code}-${a.column}`, `${b.code}-${b.column}`, `${a.place}-${a.year}`, "relate"]),
  };
}
```

- [ ] **Step 4: Run it.** `npx vitest run tests/ui/cardExport.test.ts && npx tsc --noEmit`. Expected: PASS, and no type errors.

- [ ] **Step 5: Commit.**

```bash
git add ui/lib/cardExport.ts tests/ui/cardExport.test.ts
git commit -m "feat: rank, change and relate cards export every tract from the full answer

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 4: Neighborhood figure, City count and report quote exports

**Files:**
- Modify: `ui/lib/cardExport.ts` (append)
- Test: `tests/ui/cardExport.test.ts` (append)

**Interfaces:**
- Consumes: from Task 2, `CardExport`, `Ctx`, `Cell`, `safeName`, `sourceNote`, `exported`. Also `formatPortraitNumber` and `formatPortraitMargin` from `./portrait`, `countCoverage` from `./askCount`, and `propertyCountSummary` from `./tractSummary`.
- Produces:
  - `type NumberCardData = { code: string; neighborhood: string; year: number | null; topic: string; tableIdText: string; definition: string | null; groups: string[]; nearby: { label: string; values: ({ estimate: string; moe: string | null } | null)[]; marked: boolean }[] }`
  - `numberExport(r: NumberCardData, ctx: Ctx): CardExport`
  - `type CountCardData = { code: string; name: string; count: number; groups: { label: string; count: number }[]; other: number; otherLabel: string | null; overlap: boolean; period: string; filters: string[]; futureExcluded: number; caveat: string | null; dateColumn: string | null; coverage: string | null; resourceName: string | null; area: string | null; noLocation: number; of?: { count: number; label: string }; tractMap?: { total: number } }`
  - `countNotes(r: CountCardData): string[]`, `countExport(r: CountCardData, ctx: Ctx): CardExport`
  - `quoteText(p: { quote: string; section: string; report: string; code: string }, ctx: Ctx): string`

- [ ] **Step 1: Write the failing test.** Append to `tests/ui/cardExport.test.ts`, and add `countExport, numberExport, quoteText` to the import:

```ts
describe("neighborhood figure export", () => {
  const r = {
    code: "N03", neighborhood: "Harambee", year: 2023, topic: "Poverty Status by Age", tableIdText: "B17001", definition: "tracts 1860, 90", groups: ["Below poverty"],
    nearby: [{ label: "Under 5 years", values: [{ estimate: "608", moe: "120" }], marked: true }, { label: "5 years", values: [{ estimate: "-", moe: null }], marked: false }],
  };
  const e = numberExport(r, ctx);
  it("keeps numbers as numbers and Census text cells as guarded text", () => {
    expect(e.csv.head).toEqual(["Row", "Below poverty estimate", "Below poverty margin", "Asked for"]);
    expect(e.csv.rows).toEqual([["Under 5 years", 608, 120, "yes"], ["5 years", "-", null, ""]]);
    expect(toCsv(e)).toContain("\r\n5 years,'-,,\r\n");
  });
  it("shows the card's formatting and marks the asked-for row", () => {
    expect(e.text.head).toEqual(["", "Below poverty estimate", "± Margin"]);
    expect(e.text.rows[0]).toEqual(["Under 5 years (asked for)", "608", "±120"]);
    expect(e.title).toBe("Harambee, 2023 · Poverty Status by Age");
    expect(e.lines).toEqual(["Harambee as DYCU defines it: tracts 1860, 90"]);
    expect(e.notes).toEqual(["Census table B17001", "Source: DYCU, N03: https://almanac.test/d/N03", "Exported from Cream City Almanac on October 12, 2026."]);
    expect(e.filename).toBe("almanac_N03_Harambee-2023");
  });
});

describe("City count export", () => {
  const r = {
    code: "P32", name: "NIBRS crimes", count: 1234, groups: [{ label: "2026-09", count: 1000 }], other: 234, otherLabel: "Earlier", overlap: false,
    period: "2025-10-01 to 2026-09-30", filters: ["Theft"], futureExcluded: 2, caveat: "Theft includes shoplifting.", dateColumn: "ReportedDate",
    coverage: "2005 to 2026", resourceName: "wibr", area: "Harambee", noLocation: 5,
  };
  const e = countExport(r, ctx);
  it("gives the total, each group and the rest", () => {
    expect(e.title).toBe("NIBRS crimes · Theft · 2025-10-01 to 2026-09-30");
    expect(e.csv.rows).toEqual([["Total", 1234], ["2026-09", 1000], ["Earlier", 234]]);
    expect(e.text.rows[0]).toEqual(["Total", "1,234"]);
  });
  it("copies the card's notes, labels the AI's caveat, and names the City as the source", () => {
    expect(e.notes).toEqual([
      "Counted by ReportedDate. The City's data here covers 2005 to 2026, from the City's 'wibr' file.",
      "In Harambee",
      "5 matching records citywide have no location and aren't included.",
      "2 records dated in the future were left out.",
      "Theft includes shoplifting. (written by AI)",
      "Source: City of Milwaukee, P32 NIBRS crimes: https://almanac.test/d/P32",
      "Exported from Cream City Almanac on October 12, 2026.",
    ]);
    expect(e.filename).toBe("almanac_P32_count");
  });
  it("leads a property count with its summary sentence", () => {
    const p = countExport({ ...r, groups: [], other: 0, caveat: null, of: { count: 160000, label: "properties" } }, ctx);
    expect(p.lines[0]).toMatch(/^1,234 properties in the City of Milwaukee are Theft/);
  });
});

describe("report quote", () => {
  it("is the quote, where it's from, the source and the date", () => {
    expect(quoteText({ quote: "Rents rose.", section: "Housing", report: "Harambee 2023", code: "R05" }, ctx)).toBe(
      "“Rents rose.”\nHarambee 2023, Housing\nSource: DYCU, R05: https://almanac.test/d/R05\nExported from Cream City Almanac on October 12, 2026.",
    );
  });
});
```

- [ ] **Step 2: Run it.** `npx vitest run tests/ui/cardExport.test.ts`. Expected: FAIL, `numberExport` is not exported.

- [ ] **Step 3: Implement.** Append to `ui/lib/cardExport.ts`, and add these imports at the top:

```ts
import { countCoverage } from "./askCount";
import { formatPortraitMargin, formatPortraitNumber } from "./portrait";
```

and add `propertyCountSummary` to the existing `./tractSummary` import.

```ts
export type NumberCardData = {
  code: string; neighborhood: string; year: number | null; topic: string; tableIdText: string; definition: string | null; groups: string[];
  nearby: { label: string; values: ({ estimate: string; moe: string | null } | null)[]; marked: boolean }[];
};

// A Census cell is a number when it reads as one; "-", "**" and "(X)" stay text, as DYCU wrote them.
const census = (s: string | null | undefined): Cell => (s == null || s.trim() === "" ? null : Number.isFinite(Number(s)) ? Number(s) : s);

export function numberExport(r: NumberCardData, ctx: Ctx): CardExport {
  const name = (g: string) => (g ? `${g} estimate` : "Estimate");
  return {
    title: `${r.neighborhood}, ${r.year ?? "latest"} · ${r.topic}`,
    lines: r.definition ? [`${r.neighborhood} as DYCU defines it: ${r.definition}`] : [],
    csv: {
      head: ["Row", ...r.groups.flatMap((g) => [name(g), g ? `${g} margin` : "Margin"]), "Asked for"],
      rows: r.nearby.map((row) => [row.label, ...row.values.flatMap((v) => [census(v?.estimate), census(v?.moe)]), row.marked ? "yes" : ""]),
    },
    text: {
      head: ["", ...r.groups.flatMap((g) => [name(g), "± Margin"])],
      rows: r.nearby.map((row) => [row.marked ? `${row.label} (asked for)` : row.label, ...row.values.flatMap((v) => [v ? formatPortraitNumber(v.estimate) : "", v?.moe ? formatPortraitMargin(v.moe) : ""])]),
    },
    notes: [`Census table ${r.tableIdText}`, sourceNote("DYCU", r.code, null, ctx), exported(ctx)],
    filename: safeName([r.code, `${r.neighborhood}-${r.year ?? "latest"}`]),
  };
}

export type CountCardData = {
  code: string; name: string; count: number; groups: { label: string; count: number }[]; other: number; otherLabel: string | null; overlap: boolean;
  period: string; filters: string[]; futureExcluded: number; caveat: string | null; dateColumn: string | null; coverage: string | null;
  resourceName: string | null; area: string | null; noLocation: number; of?: { count: number; label: string }; tractMap?: { total: number };
};

// The City count card's lines under its table, in the card's order (CountCard in AskCards.tsx).
export function countNotes(r: CountCardData): string[] {
  return [
    r.overlap && r.groups.length > 0 ? "An incident can count in more than one group." : null,
    countCoverage(r),
    r.area ? `In ${r.area}` : null,
    r.noLocation > 0 ? `${r.noLocation.toLocaleString("en-US")} matching records citywide have no location and aren't included.` : null,
    r.tractMap ? `Census tracts where more than half of the properties are ${r.filters.join(", ")}: ${r.tractMap.total}.` : null,
    r.futureExcluded > 0 ? `${r.futureExcluded.toLocaleString("en-US")} records dated in the future were left out.` : null,
    r.caveat ? `${r.caveat} (written by AI)` : null,
  ].filter((n): n is string => n !== null);
}

export function countExport(r: CountCardData, ctx: Ctx): CardExport {
  const rows: [string, number][] = [["Total", r.count], ...r.groups.map((g): [string, number] => [g.label, g.count]), ...(r.other > 0 ? [[r.otherLabel ?? "Other", r.other] as [string, number]] : [])];
  return {
    title: [r.name, ...r.filters, r.period].join(" · "),
    lines: r.of ? [propertyCountSummary({ ...r, of: r.of })] : [],
    csv: { head: ["Group", "Count"], rows },
    text: { head: ["", "Count"], rows: rows.map(([label, n]) => [label, n.toLocaleString("en-US")]) },
    notes: [...countNotes(r), sourceNote("City of Milwaukee", r.code, r.name, ctx), exported(ctx)],
    filename: safeName([r.code, "count"]),
  };
}

export const quoteText = (p: { quote: string; section: string; report: string; code: string }, ctx: Ctx) =>
  [`“${p.quote}”`, `${p.report}, ${p.section}`, sourceNote("DYCU", p.code, null, ctx), exported(ctx)].join("\n");
```

- [ ] **Step 4: Run it.** `npx vitest run tests/ui/cardExport.test.ts && npx tsc --noEmit`. Expected: PASS, and no type errors.

- [ ] **Step 5: Commit.**

```bash
git add ui/lib/cardExport.ts tests/ui/cardExport.test.ts
git commit -m "feat: neighborhood figures, City counts and report quotes export too

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 5: The PNG layout and drawing

**Files:**
- Create: `ui/lib/pngLayout.ts`
- Create: `ui/lib/cardPng.ts`
- Test: `tests/ui/pngLayout.test.ts`

**Interfaces:**
- Consumes: from Task 2, `CardExport`.
- Produces:
  - `type Font = "title" | "bold" | "body" | "small"`
  - `type Measure = (text: string, font: Font) => number`
  - `type Layout = { width: number; height: number; items: { text: string; x: number; y: number; font: Font; color: "ink" | "muted" }[]; rules: number[] }`
  - `pngLayout(e: CardExport, measure: Measure): Layout`
  - `PNG_WIDTH = 1200`, `PNG_PAD = 48`, `PNG_ROWS = 15`, `SIZE: Record<Font, number>`
  - `cardPng(e: CardExport): Promise<Blob | null>` (browser only; resolves `null` when the image can't be made)

- [ ] **Step 1: Write the failing test.** Create `tests/ui/pngLayout.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { CardExport } from "../../ui/lib/cardExport";
import { PNG_PAD, PNG_ROWS, PNG_WIDTH, pngLayout, type Font } from "../../ui/lib/pngLayout";

// A stand-in for the canvas: every character is 10px wide (15px in the title).
const measure = (t: string, f: Font) => t.length * (f === "title" ? 15 : 10);
const e = (rows: number, note = "Source: DYCU."): CardExport => ({
  title: "Highest pov_rate · County 2023",
  lines: ["Summary."],
  csv: { head: [], rows: [] },
  text: { head: ["Tract", "Neighborhood"], rows: Array.from({ length: rows }, (_, i) => [`T${i}`, `Place ${i}`]) },
  notes: [note],
  filename: "x",
});

describe("PNG layout", () => {
  it("draws at most 15 rows and says how many more are in the CSV", () => {
    const l = pngLayout(e(20), measure);
    const texts = l.items.map((i) => i.text);
    expect(texts).toContain(`T${PNG_ROWS - 1}`);
    expect(texts).not.toContain(`T${PNG_ROWS}`);
    expect(texts).toContain("5 more rows in the CSV");
    expect(l.rules).toHaveLength(1);
  });
  it("adds no 'more rows' line when every row fits", () => {
    expect(pngLayout(e(3), measure).items.map((i) => i.text).join(" ")).not.toContain("more rows");
  });
  it("wraps a long note and cuts a long cell to its column, never past the right edge", () => {
    const long = e(1, "word ".repeat(80).trim());
    long.text.rows[0][1] = "x".repeat(400);
    const l = pngLayout(long, measure);
    expect(l.items.filter((i) => i.font === "small").length).toBeGreaterThanOrEqual(3);
    expect(l.items.some((i) => i.text.endsWith("…"))).toBe(true);
    for (const i of l.items) expect(i.x + measure(i.text, i.font)).toBeLessThanOrEqual(PNG_WIDTH - PNG_PAD + 0.001);
  });
  it("is 1,200px wide and tall enough for everything", () => {
    const l = pngLayout(e(3), measure);
    expect(l.width).toBe(1200);
    expect(l.height).toBeGreaterThan(Math.max(...l.items.map((i) => i.y)));
  });
});
```

- [ ] **Step 2: Run it.** `npx vitest run tests/ui/pngLayout.test.ts`. Expected: FAIL, cannot resolve `../../ui/lib/pngLayout`.

- [ ] **Step 3: Implement.** Create `ui/lib/pngLayout.ts`:

```ts
import type { CardExport } from "./cardExport";

// Where each line of an exported card's image goes; cardPng.ts only paints it. Kept apart so it can be tested
// without a canvas (measure stands in for the canvas's text width).
export type Font = "title" | "bold" | "body" | "small";
export type Measure = (text: string, font: Font) => number;
export type Layout = { width: number; height: number; items: { text: string; x: number; y: number; font: Font; color: "ink" | "muted" }[]; rules: number[] };

export const PNG_WIDTH = 1200;
export const PNG_PAD = 48;
export const PNG_ROWS = 15; // a 200-row image isn't usable in a story; the CSV has them all
export const SIZE: Record<Font, number> = { title: 30, bold: 20, body: 20, small: 17 };
const GAP = 24;
const LEADING = 1.45;

function wrap(text: string, font: Font, width: number, measure: Measure): string[] {
  const lines: string[] = [];
  let cur = "";
  for (const w of text.split(/\s+/).filter(Boolean)) {
    const next = cur ? `${cur} ${w}` : w;
    if (cur && measure(next, font) > width) {
      lines.push(cur);
      cur = w;
    } else cur = next;
  }
  return cur ? [...lines, cur] : lines;
}

// ponytail: trims a character at a time; cells are short, so the loop is a few dozen measures at most.
function fit(text: string, font: Font, width: number, measure: Measure): string {
  if (measure(text, font) <= width) return text;
  let t = text;
  while (t.length > 1 && measure(`${t}…`, font) > width) t = t.slice(0, -1);
  return `${t}…`;
}

export function pngLayout(e: CardExport, measure: Measure): Layout {
  const avail = PNG_WIDTH - 2 * PNG_PAD;
  const items: Layout["items"] = [];
  const rules: number[] = [];
  let y = PNG_PAD;
  const para = (text: string, font: Font, color: "ink" | "muted" = "ink") => {
    for (const line of wrap(text, font, avail, measure)) {
      y += SIZE[font] * LEADING;
      items.push({ text: fit(line, font, avail, measure), x: PNG_PAD, y, font, color });
    }
  };
  para(e.title, "title");
  for (const l of e.lines) para(l, "body");
  y += GAP;

  const { head, rows } = e.text;
  const drawn = rows.slice(0, PNG_ROWS);
  // Each column as wide as its widest cell; when the table is wider than the page, every column shrinks in proportion.
  const natural = head.map((h, i) => Math.max(measure(h, "bold"), ...drawn.map((r) => measure(r[i] ?? "", "body"))));
  const room = avail - GAP * (head.length - 1);
  const total = natural.reduce((a, b) => a + b, 0);
  const widths = natural.map((w) => (total > room ? (w * room) / total : w));
  const xs = widths.map((_, i) => PNG_PAD + widths.slice(0, i).reduce((a, b) => a + b, 0) + GAP * i);
  const row = (cells: string[], font: Font) => {
    y += SIZE[font] * LEADING;
    cells.forEach((c, i) => items.push({ text: fit(c, font, widths[i], measure), x: xs[i], y, font, color: "ink" }));
  };
  if (head.length) {
    row(head, "bold");
    rules.push(y + 8);
    y += 8;
    drawn.forEach((r) => row(r, "body"));
  }
  if (rows.length > PNG_ROWS) para(`${rows.length - PNG_ROWS} more rows in the CSV`, "body", "muted");
  y += GAP;
  for (const n of e.notes) para(n, "small", "muted");
  return { width: PNG_WIDTH, height: Math.ceil(y + PNG_PAD), items, rules };
}
```

Create `ui/lib/cardPng.ts`:

```ts
import type { CardExport } from "./cardExport";
import { PNG_PAD, SIZE, pngLayout, type Font } from "./pngLayout";

const INK = "#1a1a1a";
const MUTED = "#5c5c5c";

// The exported card as a PNG, always light: white paper, ink text, the page's own font once it has loaded.
export async function cardPng(e: CardExport): Promise<Blob | null> {
  await document.fonts?.ready;
  const family = getComputedStyle(document.body).fontFamily || "sans-serif";
  const font = (f: Font) => `${f === "title" || f === "bold" ? "700 " : ""}${SIZE[f]}px ${family}`;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const layout = pngLayout(e, (text, f) => {
    ctx.font = font(f);
    return ctx.measureText(text).width;
  });
  canvas.width = layout.width; // resizing clears the canvas and its settings, so paint after it
  canvas.height = layout.height;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, layout.width, layout.height);
  for (const i of layout.items) {
    ctx.font = font(i.font);
    ctx.fillStyle = i.color === "ink" ? INK : MUTED;
    ctx.fillText(i.text, i.x, i.y);
  }
  ctx.fillStyle = INK;
  for (const y of layout.rules) ctx.fillRect(PNG_PAD, y, layout.width - 2 * PNG_PAD, 1);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}
```

- [ ] **Step 4: Run it.** `npx vitest run tests/ui/pngLayout.test.ts && npx tsc --noEmit`. Expected: PASS, 4 tests, and no type errors. `cardPng` is exercised by Task 6's browser test.

- [ ] **Step 5: Commit.**

```bash
git add ui/lib/pngLayout.ts ui/lib/cardPng.ts tests/ui/pngLayout.test.ts
git commit -m "feat: draw an exported card as a PNG, at most 15 rows, notes wrapped

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 6: The export buttons on the cards

**Files:**
- Create: `ui/components/ExportBar.tsx`
- Modify: `ui/components/ask.module.css` (append `.exportBar`)
- Modify: `ui/components/TractCards.tsx` (`RankCard`, `ChangeCard`, `RelateCard`)
- Modify: `ui/components/AskCards.tsx` (`NumberCard`, `CountCard`, the `readReport` passages)
- Test: `e2e/ask.spec.ts`

**Interfaces:**
- Consumes: from Tasks 2–5, `CardExport`, `Ctx`, `toCsv`, `toText`, `exportState`, `rankExport`, `changeExport`, `relateExport`, `numberExport`, `countExport`, `quoteText` and `cardPng`. From Task 1, `fineText`.
- Produces: `ExportBar(props: { make: ((ctx: Ctx) => CardExport) | null; expired?: boolean } | { copy: (ctx: Ctx) => string })`. The root is `[data-export]`, or `[data-export=expired]` when expired, and holds a `role="status"` live region.

- [ ] **Step 1: Write the failing browser test.** In `e2e/ask.spec.ts`:
  - Add `import { readFile } from "node:fs/promises";` under the existing import.
  - In the test "a report passage reads as lines, lists and tables, not one run of text", after `await expect(passage).not.toContainText("| --- |");`, add:

```ts
    // A quote copies as text only: no CSV, no image.
    await expect(passage.locator("[data-export]").getByRole("button")).toHaveText(["Copy text"]);
```

Inside `test.describe("signed in", …)`, after the test "next-question buttons fill the box, never send, and only the newest answer has them", add:

```ts
  test("a tract card exports CSV, text and a PNG, each with its source", async ({ page, context }, info) => {
    test.skip(!(await dycuUp(page)), "DYCU unreachable");
    await ask(page, "rank tracts by poverty");
    const card = page.locator("[data-card=tract-rank]:visible");
    await expect(card.locator("tbody tr").first()).toBeVisible({ timeout: 60_000 });
    const bar = card.locator("[data-export]");
    await expect(bar.getByRole("button", { name: "CSV" })).toBeEnabled({ timeout: 30_000 });

    const [csv] = await Promise.all([page.waitForEvent("download"), bar.getByRole("button", { name: "CSV" }).click()]);
    expect(csv.suggestedFilename()).toBe("almanac_E02-pov_rate_County-2023_rank.csv");
    const text = (await readFile(await csv.path())).toString("utf8");
    expect(text).toContain("Rank,Tract,GEOID,City neighborhoods,DYCU areas,pov_rate (percent),Low,High,Status");
    expect(text).toContain("Source: DYCU, E02");

    const [png] = await Promise.all([page.waitForEvent("download"), bar.getByRole("button", { name: "PNG" }).click()]);
    expect(png.suggestedFilename()).toBe("almanac_E02-pov_rate_County-2023_rank.png");
    expect([...(await readFile(await png.path())).subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

    // Only Chromium lets a test read the clipboard; the phone project runs WebKit.
    if (info.project.name !== "phone") {
      await context.grantPermissions(["clipboard-read", "clipboard-write"]);
      await bar.getByRole("button", { name: "Copy text" }).click();
      await expect(bar.getByRole("status")).toHaveText("Copied");
      expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/^Highest pov_rate · County 2023\n/);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
```

- [ ] **Step 2: Run it.** `npx playwright test e2e/ask.spec.ts -g "exports CSV|report passage" --project=desktop`. Expected: FAIL, with no `[data-export]` on the card. The signed-in tests need `E2E_CLERK_USER_EMAIL` and `CLERK_SECRET_KEY` in `.env.local`. If they are skipped locally, record a ruling and rely on CI's preview run for RED and GREEN.

- [ ] **Step 3: Implement.** Create `ui/components/ExportBar.tsx`:

```tsx
"use client";
import { useState } from "react";
import { exportState, toCsv, toText, type CardExport, type Ctx } from "@/ui/lib/cardExport";
import { cardPng } from "@/ui/lib/cardPng";
import styles from "./ask.module.css";

type Props = { make: ((ctx: Ctx) => CardExport) | null; expired?: boolean } | { copy: (ctx: Ctx) => string };

// Read at click time: where the page lives (for the dataset links) and today's date.
const here = (): Ctx => ({ origin: window.location.origin, date: new Date().toLocaleDateString("en-US", { dateStyle: "long" }) });

function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  // ponytail: revoked a minute later; Safari can still be reading the blob just after the click.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

// CSV · Copy text · PNG under a card (spec 2026-10-12 §4); a report quote gets Copy text only.
export function ExportBar(props: Props) {
  const [status, setStatus] = useState("");
  const say = (s: string) => {
    setStatus(s);
    setTimeout(() => setStatus(""), 4_000);
  };
  const copy = async (text: string, failed: string) => {
    try {
      await navigator.clipboard.writeText(text);
      say("Copied");
    } catch {
      say(failed);
    }
  };
  const live = <span role="status" aria-live="polite">{status}</span>;

  if ("copy" in props) {
    return (
      <div className={styles.exportBar} data-export>
        <button type="button" onClick={() => copy(props.copy(here()), "Couldn't copy.")}>Copy text</button>
        {live}
      </div>
    );
  }
  const { make } = props;
  const state = exportState(make !== null, Boolean(props.expired));
  if (state === "expired") return <p className={styles.exportBar} data-export="expired">Ask again to export</p>;
  const png = async () => {
    if (!make) return;
    const e = make(here());
    const blob = await cardPng(e).catch(() => null);
    if (blob) save(blob, `${e.filename}.png`);
    else say("Couldn't make the image.");
  };
  return (
    <div className={styles.exportBar} data-export>
      <button type="button" disabled={!make} onClick={() => { if (!make) return; const e = make(here()); save(new Blob([toCsv(e)], { type: "text/csv;charset=utf-8" }), `${e.filename}.csv`); }}>CSV</button>
      <button type="button" disabled={!make} onClick={() => make && copy(toText(make(here())), "Couldn't copy. Use CSV instead.")}>Copy text</button>
      <button type="button" disabled={!make} onClick={png}>PNG</button>
      {state === "loading" && <span>Loading…</span>}
      {live}
    </div>
  );
}
```

Append to `ui/components/ask.module.css`:

```css
/* Export a card (spec 2026-10-12): small underlined text buttons under the card, wrapping on phones. */
.exportBar { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 16px; margin: 8px 0 0; color: var(--muted); }
.exportBar button { min-height: 32px; padding: 0; background: none; border: 0; font: inherit; color: var(--ink); text-decoration: underline; text-underline-offset: 3px; cursor: pointer; }
.exportBar button:disabled { color: var(--muted); text-decoration: none; cursor: default; }
```

Changes to `ui/components/TractCards.tsx`:
- Imports: add `import { changeExport, rankExport, relateExport } from "@/ui/lib/cardExport";` and `import { ExportBar } from "./ExportBar";`.
- **`RankCard`:**
  - Change `const { detail } = useDetail(r.key);` to `const { detail, expired } = useDetail(r.key);`.
  - Add `const BARE_RANK = "No margin of error found for this column, so ranks may be ties.";` above the function, and use it in the `{bare && <p …>}` line in place of the literal.
  - After that card's `<Fine heads={[h]} onOpen={onOpen} />`, add:

```tsx
      <ExportBar expired={expired} make={full && ((ctx) => rankExport(full, { title, lines: bare ? [summary, BARE_RANK] : [summary], fine: fineText([full.header]) }, ctx))} />
```

- **`ChangeCard`:**
  - Change its `const { detail } = useDetail(r.key);` to `const { detail, expired } = useDetail(r.key);`.
  - After `const summary = changeSummary(…)`, add:

```tsx
  const counts = bare
    ? `Can't tell which tracts changed clearly: ${bare}.`
    : `${r.increases} clear increases · ${r.decreases} clear decreases · ${r.none} no clear change${r.unreliableCount > 0 ? ` · ${r.unreliableCount} not compared (too uncertain)` : ""}`;
```

  - After that card's `<Fine heads={[h]} onOpen={onOpen} />`, add:

```tsx
      <ExportBar expired={expired} make={full && ((ctx) => changeExport(full, { title, lines: [summary, counts], fine: fineText([full.header]) }, ctx))} />
```

- **`RelateCard`:**
  - After `const summary = relateSummary({ ...r, a, b });`, add:

```tsx
  const verdict = mismatch ? mismatchVerdict({ fitsCount: r.fitsCount, closeCount: r.closeCount, n: r.n, gated, bare }) : r.strength === "too-few" ? tooFew(r.n) : STRENGTH[r.strength];
  const lead = mismatch && !gated ? `Cutoffs: ${side(r.aSide)} third on ${a.column}, ${side(r.bSide)} third on ${b.column}.` : undefined;
```

  - Replace the verdict expression inside `<p className={styles.tractVerdict}>` with `{verdict}`.
  - Replace the `lead={…}` prop on its `<Fine>` with `lead={lead}`.
  - After that `<Fine … />`, add:

```tsx
      <ExportBar expired={expired} make={full && ((ctx) => relateExport(full, { title, lines: [summary, verdict, ...(r.unreliableCount > 0 ? [`${r.unreliableCount} tracts are too uncertain to count (shown faint).`] : [])], fine: fineText([full.a, full.b], { causal: true, lead }) }, ctx))} />
```

Changes to `ui/components/AskCards.tsx`:
- Imports: add `import { countExport, numberExport, quoteText } from "@/ui/lib/cardExport";` and `import { ExportBar } from "./ExportBar";`.
- **`NumberCard`**, laptop branch: wrap the returned `<p …>…</p>` in a fragment and add the bar after it:

```tsx
    return (
      <>
        <p className={styles.reference} data-card="number">
          {title} · {r.label} <ProvenanceTag source="DYCU" />
          {r.definition && <span className={styles.source} data-definition> {r.neighborhood} as DYCU defines it: {r.definition}</span>} <OpenLink code={r.code} query={query} onOpen={onOpen} anchor />
        </p>
        <ExportBar make={(ctx) => numberExport(r, ctx)} />
      </>
    );
```

- **`NumberCard`**, phone branch: after `<OpenLink code={r.code} query={query} onOpen={onOpen} label="Open the full table" />`, add `<ExportBar make={(ctx) => numberExport(r, ctx)} />`.
- **`CountCard`**: after `<OpenLink code={r.code} onOpen={onOpen} label="Open the data" />`, add `{!noMap && <ExportBar make={(ctx) => countExport(r, ctx)} />}`. A folded earlier count is the only caller passing `noMap`, and it gets no bar.
- **`readReport` passages**: inside each `<figure … data-card="passage">`, after `</figcaption>`, add `<ExportBar copy={(ctx) => quoteText(p, ctx)} />`.

- [ ] **Step 4: Run it.**
  - `npx tsc --noEmit && npx vitest run`. Expected: no type errors, and the whole unit suite passes.
  - Then `npx playwright test e2e/ask.spec.ts -g "exports CSV|report passage"`. Expected: PASS on desktop and phone (or skipped locally without the Clerk test user; see Step 2).

- [ ] **Step 5: Commit.**

```bash
git add ui/components/ExportBar.tsx ui/components/ask.module.css ui/components/TractCards.tsx ui/components/AskCards.tsx e2e/ask.spec.ts
git commit -m "feat: CSV, Copy text and PNG under Ask's number cards; Copy text under report quotes

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 7: Docs — decision 032, How it works, DESIGN.md

**Files:**
- Create: `docs/decisions/032-export-a-card.md`
- Modify: `ui/components/HowItWorks.tsx` (the "WHAT THE AI DOES" section, after "Numbers on a sheet come from the Hub's data, never from the AI.")
- Modify: `DESIGN.md` (add `### Export` after the `### Tract names` section, around line 380)
- Test: `e2e/how.spec.ts`

**Interfaces:** none.

- [ ] **Step 1: Write the failing test.** Append to `e2e/how.spec.ts`:

```ts
test("it says answers can be exported with their source and caveats", async ({ page }) => {
  await page.goto("/how-it-works");
  await expect(page.getByText(/Ask's number cards can be exported as a CSV, as plain text or as an image/)).toBeVisible();
});
```

- [ ] **Step 2: Run it.** `npx playwright test e2e/how.spec.ts -g "exported" --project=desktop`. Expected: FAIL, text not found.

- [ ] **Step 3: Implement.** In `ui/components/HowItWorks.tsx`, after `<p>Numbers on a sheet come from the Hub&apos;s data, never from the AI.</p>`, add:

```tsx
            <p>
              Ask&apos;s number cards can be exported as a CSV, as plain text or as an image. Each export copies the card: its figures, its
              fine print, the dataset&apos;s caveats and the source. The AI doesn&apos;t write any of it.
            </p>
```

Create `docs/decisions/032-export-a-card.md`:

```markdown
# 032: Export a card as CSV, text or an image

**Decision:** Ask's number cards get three exports (a CSV, plain text for a draft, and a PNG image), and report quotes get plain text. All are made in the reporter's browser from the card's own data. A share link waits for its own project (C2).

**Why this came up:** Reporters said they want to check an answer's numbers in a spreadsheet, quote it in a draft, put it in a story, and show an editor. The only way out of Ask was a screenshot or retyping, and both drop the source and caveats, which are what keep a number honest in print.

**Options:**
1. **Draw the image from the data** (chosen). Code lays out the title, table and notes on the browser's built-in canvas (a drawing surface in the page). Cost: it isn't pixel-identical to the card, and maps are left out.
2. **Photograph the card as shown** with a small library. Cost: a new dependency, maps come out blank, and the caveats only appear if they happen to be on screen.
3. **Skip the image.** Cost: reporters take screenshots that lose the source.

**What we chose and why (Tarik, 2026-10-12):** One export per card, written three ways, so the CSV, text and image never disagree. The CSV keeps the stored, unrounded values, so the reporter can recompute. Text and image keep the card's rounding, so a quoted figure matches the screen. Tract cards export only from the full answer, never the 10-row copy they show first. The share link is split off because it means saving answers on a server and publishing a page anyone can open.

**What we gave up:**
- The image is a clean table, not a copy of the card, and never shows a map or the relate scatter chart.
- An answer older than a day can't be exported until it is asked again.
- Editors still can't open an answer from a link.

**How we'll know if this was right:** Reporters export rather than screenshot. Exported numbers match the card when checked. No one reports an export missing its source or caveats.

**What actually happened:**
```

In `DESIGN.md`, after the `### Tract names` section, add:

```markdown
### Export
Under each number card (neighborhood figure, City count, rank, change, relate), a line of small underlined text buttons: **CSV · Copy text · PNG**. Report quotes get **Copy text** only. One export per card feeds all three (`ui/lib/cardExport.ts`). The CSV has stored values, then a blank row, then title, lines and notes. Text and PNG use the card's rounding. The PNG is drawn on a canvas (`ui/lib/pngLayout.ts`, `ui/lib/cardPng.ts`): light, 1,200px wide, 15 rows at most, no map. Tract cards wait for the full answer ("Loading…") and say "Ask again to export" once it has expired.
```

- [ ] **Step 4: Run it.** `npx playwright test e2e/how.spec.ts --project=desktop`. Expected: PASS, all tests in the file.

- [ ] **Step 5: Commit.**

```bash
git add docs/decisions/032-export-a-card.md ui/components/HowItWorks.tsx DESIGN.md e2e/how.spec.ts
git commit -m "docs: decision 032, How it works and DESIGN.md on exporting a card

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```
