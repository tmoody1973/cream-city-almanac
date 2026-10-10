# Ask Analyzes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ask answers rankings, change over time, "do they go together" and mismatch questions across DYCU's census-tract datasets, with every number on a card and honest uncertainty rules enforced by the server.

**Architecture:** Pure math (`convex/lib/tractStats.ts`) and pure data helpers (`convex/lib/tractData.ts`, `convex/lib/tractNames.ts`) are unit-tested on their own. Three signed-in Convex actions in `convex/tracts.ts` check the request, fetch ~300 tract rows live from the dataset's own DYCU FeatureServer, run the math, store the full answer in the existing `mapCache` table for 10 minutes, and return a compact answer (no per-tract points) to the model. Three Ask cards fetch the full answer by key (public query `tractDetail`) and draw a table, a scatter plot and tract shapes on the existing `CityMap`.

**Tech Stack:** Convex 1.46 (actions, queries, convex-test, `@convex-dev/rate-limiter`), Next.js 16, CopilotKit v2 (`useRenderTool`), AI SDK + zod, MapLibre 6.11.2, Vitest 5, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-10-ask-analyzes-design.md`

## Global Constraints

- Scope: DYCU tract datasets only (families whose FeatureServer fields include `GEOID`). No City records, no combining tracts into neighborhood estimates, no color scales, no causal claims.
- Never a number in the model's words: every figure is on a card; the existing unverified-number marking stays.
- Exact reader words (spec §3): "little relationship", "weakly related", "moderately related", "strongly related"; "clearly fits", "close, not clear"; "No tract clearly fits; N come close."; "within range of #10"; "unreliable: range too wide"; "clear increase", "clear decrease", "no clear change"; "Related doesn't mean one causes the other."; "DYCU's data didn't respond. Try again shortly."; "Too few tracts to say (fewer than 20 matched)."; "no margin of error published"; "Tract map unavailable."
- Ranges: `<column>_moe` (case-insensitive) → value ± moe, "90% confidence (Census)"; `Low_Confidence_Limit` + `High_Confidence_Limit` → those limits, "95% confidence (CDC)"; neither → no range.
- Unreliable: moe90 → `(moe / 1.645) / |value| > 0.40` (value 0 with moe > 0 is unreliable); ci95 → `halfWidth / |value| > 0.40`.
- Change: clear when `|v2 − v1| > √(h1² + h2²)` (h = moe, or CI half-width). Relationship: Spearman ρ on reliable matched tracts; n < 20 → too few; |ρ| < 0.2 little, < 0.4 weak, < 0.6 moderate, else strong. Mismatch: cutoffs are the 1/3 and 2/3 quantiles (linear interpolation) of reliable values; "clearly fits" = whole range on its side of both cutoffs.
- `GEOID` = `55079` + 6-digit tract; tract number = 6 digits ÷ 100 without trailing zeros. Neighborhood names only from DYCU definitions (`neighborhoods`, `definition: "dycu"`) for that year; no match → "—".
- Per-person limit `askTracts`: token bucket 60/hour, capacity 20. Answers cached 10 minutes in `mapCache` under a `tracts:` key prefix; no schema change.
- The model-facing tool result never carries per-tract points (≤ 10 rows per list; < 8 KB for 300 tracts).
- House rules (DESIGN.md): hairline card, ink, caps for names, tabular lining figures, red only as the map's boundary pencil, map labels on paper/ink.
- No new npm dependency. No production deploys. Commit trailers name the implementing model.

## Review Focus

1. ACS "jam" values (−666666666 and similar sentinels) or blanks in a column must be left out and counted in "left out", never ranked — pinned in Task 2 (`parseRows` test).
2. A `GEOID` that arrives as a number, or as a 6-digit tract without the county prefix, must still match across two datasets — pinned in Task 2 (`normalizeGeoid` test) and Task 4 (relate join test).
3. The model passes `year: "2022"` for a member labeled "2022", and a request for a year a dataset doesn't have gets the list of what exists, not an error — pinned in Task 3 (`choose-year` test).
4. A dataset with more than 2,000 rows (DYCU pages with `exceededTransferLimit`) must be fetched completely — pinned in Task 2 (paging test).
5. The conversation must stay small: a 300-tract relate answer's model-facing result is under 8 KB — pinned in Task 5.

---

## File Structure

| File | Responsibility |
|---|---|
| `convex/lib/tractStats.ts` (new) | Pure math: ranges, reliability, overlap, ranking with ties, change test, Spearman, verdict, quantiles, mismatch. |
| `convex/lib/tractData.ts` (new) | Pure + fetch: range columns, column kind, numeric field check, GEOID normalization, tract number, row parsing, rows URL, paged fetch. |
| `convex/lib/tractNames.ts` (new) | DYCU neighborhood name for a tract and year. |
| `convex/tracts.ts` (new) | `rankTracts`, `compareYears`, `relateTracts` actions; `tractDetail` query; internal lookups. |
| `convex/limits.ts` | `ASK_TRACTS` bucket. |
| `tests/helpers/fakeFetch.ts` | `tractRows` option for FeatureServer `/query`. |
| `lib/ask/tools.ts`, `lib/ask/backend.ts`, `lib/ask/prompt.ts`, `lib/ask/model.ts` | Three tools, backend calls, instructions, fake-model scripts. |
| `ui/lib/tractScatter.ts` (new), `ui/components/TractCards.tsx` (new), `ui/components/AskCards.tsx` | Scatter scales; the three cards; registration. |
| `ui/lib/tractShapes.ts` (new), `ui/components/CityMap.tsx` | Tract shapes URL; tract layer. |
| `scripts/ask-questions.ts`, `lib/ask/examples.ts`, `docs/decisions/027-ask-analyzes.md`, `DESIGN.md` | Report card, guide examples, decision, design notes. |

---

### Task 1: The math (`tractStats`)

**Files:**
- Create: `convex/lib/tractStats.ts`
- Test: `tests/tractStats.test.ts`

**Interfaces:**
- Produces:
  - `type RangeKind = "moe90" | "ci95"`
  - `type TractValue = { geoid: string; value: number; lo: number | null; hi: number | null; kind: RangeKind | null }`
  - `halfWidth(v: TractValue): number | null`
  - `isUnreliable(v: TractValue): boolean`
  - `overlaps(a: TractValue, b: TractValue): boolean`
  - `rankValues(values: TractValue[], direction: "high" | "low", top?: number): { top: TractValue[]; ties: TractValue[]; unreliable: TractValue[] }`
  - `changeOf(a: TractValue, b: TractValue): "increase" | "decrease" | "none"`
  - `spearman(xs: number[], ys: number[]): number`
  - `relationship(rho: number, n: number): { strength: "too-few" | "little" | "weak" | "moderate" | "strong"; direction: "higher" | "lower" }`
  - `quantile(sorted: number[], p: number): number`
  - `type Pair = { geoid: string; a: TractValue; b: TractValue }`
  - `mismatch(pairs: Pair[], aSide: "high" | "low", bSide: "high" | "low"): { cutA: number; cutB: number; fits: Pair[]; close: Pair[] }`

- [ ] **Step 1: Write the failing tests** — `tests/tractStats.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { changeOf, halfWidth, isUnreliable, mismatch, overlaps, quantile, rankValues, relationship, spearman, type TractValue } from "../convex/lib/tractStats";

const moe = (geoid: string, value: number, m: number): TractValue => ({ geoid, value, lo: value - m, hi: value + m, kind: "moe90" });
const ci = (geoid: string, value: number, lo: number, hi: number): TractValue => ({ geoid, value, lo, hi, kind: "ci95" });
const bare = (geoid: string, value: number): TractValue => ({ geoid, value, lo: null, hi: null, kind: null });

describe("ranges and reliability", () => {
  it("half-width is the moe or half the CDC interval, null without a range", () => {
    expect(halfWidth(moe("a", 40, 6))).toBe(6);
    expect(halfWidth(ci("a", 14, 11, 17))).toBe(3);
    expect(halfWidth(bare("a", 14))).toBeNull();
  });
  it("marks a Census estimate unreliable past a 40% coefficient of variation", () => {
    expect(isUnreliable(moe("a", 40, 26))).toBe(false); // (26/1.645)/40 = 0.395
    expect(isUnreliable(moe("a", 40, 27))).toBe(true); // 0.410
    expect(isUnreliable(moe("a", 0, 1))).toBe(true);
    expect(isUnreliable(moe("a", 0, 0))).toBe(false);
  });
  it("marks a CDC estimate unreliable when its half-width passes 40% of the value", () => {
    expect(isUnreliable(ci("a", 10, 6.2, 13.8))).toBe(false); // 3.8/10
    expect(isUnreliable(ci("a", 10, 5, 15))).toBe(true); // 5/10
    expect(isUnreliable(bare("a", 10))).toBe(false);
  });
  it("overlap needs both ranges", () => {
    expect(overlaps(moe("a", 40, 5), moe("b", 48, 4))).toBe(true);
    expect(overlaps(moe("a", 40, 3), moe("b", 48, 4))).toBe(false);
    expect(overlaps(bare("a", 40), moe("b", 40, 4))).toBe(false);
  });
});

describe("rankValues", () => {
  it("ranks reliable tracts, lists overlapping ones below #10 as ties, and sets unreliable aside", () => {
    const values = Array.from({ length: 12 }, (_, i) => moe(`t${i}`, 100 - i * 5, 2)); // 100, 95, … 45
    values.push(moe("tie", 52, 6)); // overlaps #10 (55 ± 2)
    values.push(moe("shaky", 99, 80));
    const r = rankValues(values, "high");
    expect(r.top.map((v) => v.geoid)).toEqual(["t0", "t1", "t2", "t3", "t4", "t5", "t6", "t7", "t8", "t9"]);
    expect(r.ties.map((v) => v.geoid)).toEqual(["tie"]);
    expect(r.unreliable.map((v) => v.geoid)).toEqual(["shaky"]);
  });
  it("ranks low to high when asked", () => {
    expect(rankValues([moe("a", 3, 1), moe("b", 1, 0.5), moe("c", 2, 0.5)], "low").top.map((v) => v.geoid)).toEqual(["b", "c", "a"]);
  });
  it("lists no ties when the column has no ranges", () => {
    expect(rankValues(Array.from({ length: 12 }, (_, i) => bare(`t${i}`, 12 - i)), "high").ties).toEqual([]);
  });
});

describe("changeOf", () => {
  it("is clear only when the change beats both margins combined", () => {
    expect(changeOf(moe("a", 48, 7), moe("a", 63, 6))).toBe("increase"); // 15 > 9.22
    expect(changeOf(moe("a", 48, 7), moe("a", 55, 6))).toBe("none"); // 7 < 9.22
    expect(changeOf(moe("a", 60, 3), moe("a", 50, 3))).toBe("decrease");
    expect(changeOf(bare("a", 10), bare("a", 90))).toBe("none");
  });
});

describe("spearman and relationship", () => {
  it("is 1 for the same order, -1 for the reverse, and handles ties by average rank", () => {
    expect(spearman([1, 2, 3, 4], [10, 20, 30, 40])).toBeCloseTo(1);
    expect(spearman([1, 2, 3, 4], [40, 30, 20, 10])).toBeCloseTo(-1);
    expect(spearman([1, 2, 2, 3], [1, 2, 3, 4])).toBeCloseTo(0.9487, 3);
  });
  it("words the verdict by strength and direction, and refuses under 20 tracts", () => {
    expect(relationship(0.65, 40)).toEqual({ strength: "strong", direction: "higher" });
    expect(relationship(-0.45, 40)).toEqual({ strength: "moderate", direction: "lower" });
    expect(relationship(0.25, 40)).toEqual({ strength: "weak", direction: "higher" });
    expect(relationship(0.1, 40)).toEqual({ strength: "little", direction: "higher" });
    expect(relationship(0.9, 19).strength).toBe("too-few");
  });
});

describe("quantile and mismatch", () => {
  it("interpolates between sorted values", () => {
    expect(quantile([0, 10, 20, 30], 1 / 3)).toBeCloseTo(10);
    expect(quantile([0, 10, 20, 30], 2 / 3)).toBeCloseTo(20);
  });
  it("counts a tract only when its whole range clears both cutoffs; a value on the right side with a crossing range is close", () => {
    // a: poverty 0..100 step 5 (21 tracts); b: food insecurity mirrors it, except two high-poverty tracts with low b.
    const pairs = Array.from({ length: 21 }, (_, i) => ({ geoid: `t${i}`, a: moe(`t${i}`, i * 5, 1), b: ci(`t${i}`, i * 5, i * 5 - 1, i * 5 + 1) }));
    pairs[20] = { geoid: "fits", a: moe("fits", 100, 2), b: ci("fits", 5, 4, 6) }; // clearly high a, clearly low b
    pairs[19] = { geoid: "close", a: moe("close", 95, 2), b: ci("close", 30, 20, 40) }; // low-ish b whose range crosses the cutoff
    const r = mismatch(pairs, "high", "low");
    expect(r.fits.map((p) => p.geoid)).toEqual(["fits"]);
    expect(r.close.map((p) => p.geoid)).toEqual(["close"]);
  });
  it("leaves unreliable tracts out of cutoffs and findings", () => {
    const pairs = Array.from({ length: 21 }, (_, i) => ({ geoid: `t${i}`, a: moe(`t${i}`, i, 0.5), b: moe(`t${i}`, 20 - i, 0.5) }));
    pairs.push({ geoid: "shaky", a: moe("shaky", 30, 30), b: moe("shaky", 0, 0.1) });
    expect(mismatch(pairs, "high", "low").fits.some((p) => p.geoid === "shaky")).toBe(false);
  });
});
```

- [ ] **Step 2: Run them to see them fail** — `npx vitest run tests/tractStats.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement** — `convex/lib/tractStats.ts`:

```ts
// The honesty rules for tract comparisons (docs/superpowers/specs/2026-10-10-ask-analyzes-design.md §5). Pure: no I/O.
export type RangeKind = "moe90" | "ci95";
export type TractValue = { geoid: string; value: number; lo: number | null; hi: number | null; kind: RangeKind | null };
export type Pair = { geoid: string; a: TractValue; b: TractValue };

export const halfWidth = (v: TractValue) => (v.lo === null || v.hi === null ? null : (v.hi - v.lo) / 2);

// Census guidance: an estimate whose coefficient of variation passes 40% is unreliable. A CDC interval uses its half-width.
export function isUnreliable(v: TractValue): boolean {
  const h = halfWidth(v);
  if (h === null) return false;
  if (v.value === 0) return h > 0;
  const spread = v.kind === "moe90" ? h / 1.645 : h;
  return spread / Math.abs(v.value) > 0.4;
}

export const overlaps = (a: TractValue, b: TractValue) =>
  a.lo !== null && a.hi !== null && b.lo !== null && b.hi !== null && a.lo <= b.hi && b.lo <= a.hi;

export function rankValues(values: TractValue[], direction: "high" | "low", top = 10) {
  const unreliable = values.filter(isUnreliable);
  const sorted = values.filter((v) => !isUnreliable(v)).sort((x, y) => (direction === "high" ? y.value - x.value : x.value - y.value));
  const head = sorted.slice(0, top);
  const last = head.at(-1);
  const ties = last ? sorted.slice(top).filter((v) => overlaps(v, last)) : [];
  return { top: head, ties, unreliable };
}

// The Census Bureau's test for comparing two estimates (90% margins); CDC intervals use their half-widths.
export function changeOf(a: TractValue, b: TractValue): "increase" | "decrease" | "none" {
  const ha = halfWidth(a);
  const hb = halfWidth(b);
  if (ha === null || hb === null) return "none";
  const diff = b.value - a.value;
  if (Math.abs(diff) <= Math.sqrt(ha * ha + hb * hb)) return "none";
  return diff > 0 ? "increase" : "decrease";
}

function ranks(xs: number[]): number[] {
  const order = xs.map((x, i) => [x, i] as const).sort((p, q) => p[0] - q[0]);
  const out = new Array<number>(xs.length);
  for (let i = 0; i < order.length; ) {
    let j = i;
    while (j + 1 < order.length && order[j + 1][0] === order[i][0]) j++;
    for (let k = i; k <= j; k++) out[order[k][1]] = (i + j) / 2 + 1;
    i = j + 1;
  }
  return out;
}

// Spearman's rank correlation: Pearson on average ranks, so ties are handled and a few extreme tracts don't dominate.
export function spearman(xs: number[], ys: number[]): number {
  const rx = ranks(xs);
  const ry = ranks(ys);
  const n = rx.length;
  const mx = rx.reduce((s, x) => s + x, 0) / n;
  const my = ry.reduce((s, y) => s + y, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    num += (rx[i] - mx) * (ry[i] - my);
    dx += (rx[i] - mx) ** 2;
    dy += (ry[i] - my) ** 2;
  }
  return dx === 0 || dy === 0 ? 0 : num / Math.sqrt(dx * dy);
}

export function relationship(rho: number, n: number) {
  const a = Math.abs(rho);
  const strength = n < 20 ? "too-few" : a < 0.2 ? "little" : a < 0.4 ? "weak" : a < 0.6 ? "moderate" : "strong";
  return { strength, direction: rho >= 0 ? "higher" : "lower" } as { strength: "too-few" | "little" | "weak" | "moderate" | "strong"; direction: "higher" | "lower" };
}

export function quantile(sorted: number[], p: number): number {
  const pos = (sorted.length - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

const onSide = (x: number, side: "high" | "low", cut: number) => (side === "high" ? x >= cut : x <= cut);
const clears = (v: TractValue, side: "high" | "low", cut: number) =>
  v.lo !== null && v.hi !== null && (side === "high" ? v.lo >= cut : v.hi <= cut);

export function mismatch(pairs: Pair[], aSide: "high" | "low", bSide: "high" | "low") {
  const ok = pairs.filter((p) => !isUnreliable(p.a) && !isUnreliable(p.b));
  const sa = ok.map((p) => p.a.value).sort((x, y) => x - y);
  const sb = ok.map((p) => p.b.value).sort((x, y) => x - y);
  const cutA = quantile(sa, aSide === "high" ? 2 / 3 : 1 / 3);
  const cutB = quantile(sb, bSide === "high" ? 2 / 3 : 1 / 3);
  const fits = ok.filter((p) => clears(p.a, aSide, cutA) && clears(p.b, bSide, cutB));
  const close = ok.filter((p) => onSide(p.a.value, aSide, cutA) && onSide(p.b.value, bSide, cutB) && !fits.includes(p));
  return { cutA, cutB, fits, close };
}
```

- [ ] **Step 4: Run them to see them pass** — `npx vitest run tests/tractStats.test.ts` → PASS. If a hand-computed expectation disagrees with the code, recheck the arithmetic in the test comment before changing either; the formulas are the spec's.

- [ ] **Step 5: Commit**

```bash
git add convex/lib/tractStats.ts tests/tractStats.test.ts
git commit -m "feat: tract statistics — ranges, reliability, ties, change test, Spearman, mismatch"
```

---

### Task 2: Tract data helpers (`tractData`, `tractNames`)

**Files:**
- Create: `convex/lib/tractData.ts`, `convex/lib/tractNames.ts`
- Test: `tests/tractData.test.ts`

**Interfaces:**
- Consumes: `TractValue`, `RangeKind` (Task 1); `fetchWithTimeout(url, init, ms)` from `convex/lib/http.ts`; `Column` from `convex/lib/types.ts` (`{ name; alias; type }`, type without the `esriFieldType` prefix).
- Produces:
  - `type RangeCols = { kind: "moe90"; moe: string } | { kind: "ci95"; lo: string; hi: string } | null`
  - `rangeColumns(column: string, fieldNames: string[]): RangeCols`
  - `columnKind(name: string, meaning: string): "rate" | "count" | "value"`
  - `isNumericField(c: Column): boolean`
  - `normalizeGeoid(x: unknown): string | null`
  - `tractNumber(geoid: string): string`
  - `parseRows(features: { attributes: Record<string, unknown> }[], column: string, range: RangeCols): { values: TractValue[]; leftOut: number }`
  - `rowsUrl(featureServerUrl: string, fields: string[], offset: number): string`
  - `fetchTractRows(featureServerUrl: string, column: string, range: RangeCols): Promise<{ values: TractValue[]; leftOut: number }>`
  - `type DycuDef = { name: string; tracts?: { years: number[]; tracts: string[] }[] }`
  - `neighborhoodFor(tract: string, year: number, defs: DycuDef[]): string | null`

- [ ] **Step 1: Write the failing tests** — `tests/tractData.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { columnKind, fetchTractRows, isNumericField, normalizeGeoid, parseRows, rangeColumns, rowsUrl, tractNumber } from "../convex/lib/tractData";
import { neighborhoodFor } from "../convex/lib/tractNames";

afterEach(() => vi.unstubAllGlobals());

describe("columns", () => {
  it("finds a Census margin or a CDC interval, case-insensitively", () => {
    expect(rangeColumns("pov_rate", ["GEOID", "pov_rate", "POV_RATE_MOE"])).toEqual({ kind: "moe90", moe: "POV_RATE_MOE" });
    expect(rangeColumns("per_insecure", ["GEOID", "per_insecure", "Low_Confidence_Limit", "High_Confidence_Limit"])).toEqual({ kind: "ci95", lo: "Low_Confidence_Limit", hi: "High_Confidence_Limit" });
    expect(rangeColumns("households", ["GEOID", "households"])).toBeNull();
  });
  it("calls a column a rate, a count or a value from its name and meaning", () => {
    expect(columnKind("pov_rate", "Share of households in poverty")).toBe("rate");
    expect(columnKind("per_insecure", "Percent of adults")).toBe("rate");
    expect(columnKind("households", "Number of households")).toBe("count");
    expect(columnKind("med_age", "Median age")).toBe("value");
  });
  it("accepts number field types only", () => {
    expect(isNumericField({ name: "pov_rate", alias: "", type: "Double" })).toBe(true);
    expect(isNumericField({ name: "GEOID", alias: "", type: "String" })).toBe(false);
  });
});

describe("tract ids", () => {
  it("normalizes numbers and bare tract codes to 11 digits, and rejects junk", () => {
    expect(normalizeGeoid(55079160101)).toBe("55079160101");
    expect(normalizeGeoid("160101")).toBe("55079160101");
    expect(normalizeGeoid(" 55079180500 ")).toBe("55079180500");
    expect(normalizeGeoid("abc")).toBeNull();
    expect(normalizeGeoid(null)).toBeNull();
  });
  it("reads a tract number the way DYCU writes it", () => {
    expect(tractNumber("55079160101")).toBe("1601.01");
    expect(tractNumber("55079180500")).toBe("1805");
    expect(tractNumber("55079009000")).toBe("90");
  });
  it("names a tract from DYCU's definition for that year, else null", () => {
    const defs = [{ name: "Harambee", tracts: [{ years: [2021, 2022, 2023, 2024], tracts: ["1860", "90"] }] }];
    expect(neighborhoodFor("90", 2022, defs)).toBe("Harambee");
    expect(neighborhoodFor("90", 2019, defs)).toBeNull();
    expect(neighborhoodFor("1805", 2022, defs)).toBeNull();
  });
});

describe("rows", () => {
  it("leaves out blanks and Census jam values, and builds ranges", () => {
    const features = [
      { attributes: { GEOID: "55079160101", pov_rate: 40, pov_rate_moe: 6 } },
      { attributes: { GEOID: "55079180500", pov_rate: -666666666, pov_rate_moe: -222222222 } },
      { attributes: { GEOID: "55079009000", pov_rate: null, pov_rate_moe: 1 } },
      { attributes: { GEOID: "bad", pov_rate: 5, pov_rate_moe: 1 } },
    ];
    expect(parseRows(features, "pov_rate", { kind: "moe90", moe: "pov_rate_moe" })).toEqual({
      values: [{ geoid: "55079160101", value: 40, lo: 34, hi: 46, kind: "moe90" }],
      leftOut: 3,
    });
  });
  it("asks for only the fields it needs, a page at a time", () => {
    expect(rowsUrl("https://x/FeatureServer/0", ["GEOID", "pov_rate"], 2000)).toBe("https://x/FeatureServer/0/query?where=1%3D1&outFields=GEOID%2Cpov_rate&returnGeometry=false&resultOffset=2000&resultRecordCount=2000&f=json");
  });
  it("follows DYCU's pages until the server says there are no more", async () => {
    const page = (n: number, more: boolean) => ({ features: Array.from({ length: n }, (_, i) => ({ attributes: { GEOID: String(55079000100 + i * 100 + n), v: i } })), exceededTransferLimit: more });
    const fetchMock = vi.fn(async (url: string) => new Response(JSON.stringify(url.includes("resultOffset=0") ? page(2000, true) : page(5, false))));
    vi.stubGlobal("fetch", fetchMock);
    const r = await fetchTractRows("https://x/FeatureServer/0", "v", null);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(r.values.length + r.leftOut).toBe(2005);
  });
});
```

- [ ] **Step 2: Run to see it fail** — `npx vitest run tests/tractData.test.ts` → FAIL.

- [ ] **Step 3: Implement** — `convex/lib/tractData.ts`:

```ts
import { fetchWithTimeout } from "./http";
import type { TractValue } from "./tractStats";
import type { Column } from "./types";

export type RangeCols = { kind: "moe90"; moe: string } | { kind: "ci95"; lo: string; hi: string } | null;

const find = (names: string[], want: string) => names.find((n) => n.toLowerCase() === want.toLowerCase());

export function rangeColumns(column: string, fieldNames: string[]): RangeCols {
  const moe = find(fieldNames, `${column}_moe`);
  if (moe) return { kind: "moe90", moe };
  const lo = find(fieldNames, "Low_Confidence_Limit");
  const hi = find(fieldNames, "High_Confidence_Limit");
  return lo && hi ? { kind: "ci95", lo, hi } : null;
}

export function columnKind(name: string, meaning: string): "rate" | "count" | "value" {
  const s = `${name} ${meaning}`.toLowerCase();
  if (/rate|percent|pct|per_|share|prevalence|proportion/.test(s)) return "rate";
  if (/count|total|number|households|population|persons|people/.test(s)) return "count";
  return "value";
}

const NUMERIC = new Set(["Double", "Single", "Integer", "SmallInteger", "BigInteger"]);
export const isNumericField = (c: Column) => NUMERIC.has(c.type);

// Milwaukee County is 55079; a bare 6-digit tract gets the prefix. Anything else is not a tract id.
export function normalizeGeoid(x: unknown): string | null {
  if (x === null || x === undefined) return null;
  const s = String(x).trim();
  if (/^\d{11}$/.test(s)) return s;
  if (/^\d{6}$/.test(s)) return `55079${s}`;
  return null;
}

export const tractNumber = (geoid: string) => String(Number(geoid.slice(5)) / 100);

// Census "jam" values (−666666666, −222222222, …) mark estimates that couldn't be computed; they and blanks are left out.
const usable = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x) && x > -99999;

export function parseRows(features: { attributes: Record<string, unknown> }[], column: string, range: RangeCols) {
  const values: TractValue[] = [];
  let leftOut = 0;
  for (const { attributes: a } of features) {
    const geoid = normalizeGeoid(a.GEOID ?? a.geoid);
    const value = a[column];
    if (!geoid || !usable(value)) { leftOut++; continue; }
    if (range?.kind === "moe90" && usable(a[range.moe])) values.push({ geoid, value, lo: value - (a[range.moe] as number), hi: value + (a[range.moe] as number), kind: "moe90" });
    else if (range?.kind === "ci95" && usable(a[range.lo]) && usable(a[range.hi])) values.push({ geoid, value, lo: a[range.lo] as number, hi: a[range.hi] as number, kind: "ci95" });
    else values.push({ geoid, value, lo: null, hi: null, kind: null });
  }
  return { values, leftOut };
}

const PAGE = 2000;
export const rowsUrl = (featureServerUrl: string, fields: string[], offset: number) =>
  `${featureServerUrl}/query?where=1%3D1&outFields=${encodeURIComponent(fields.join(","))}&returnGeometry=false&resultOffset=${offset}&resultRecordCount=${PAGE}&f=json`;

export async function fetchTractRows(featureServerUrl: string, column: string, range: RangeCols) {
  const fields = ["GEOID", column, ...(range?.kind === "moe90" ? [range.moe] : range?.kind === "ci95" ? [range.lo, range.hi] : [])];
  const features: { attributes: Record<string, unknown> }[] = [];
  for (let page = 0; page < 10; page++) {
    const res = await fetchWithTimeout(rowsUrl(featureServerUrl, fields, page * PAGE), {}, 30_000);
    if (!res.ok) throw new Error(`FeatureServer ${res.status} for ${featureServerUrl}`);
    const body = (await res.json()) as { features?: { attributes: Record<string, unknown> }[]; exceededTransferLimit?: boolean; error?: { message?: string } };
    if (body.error) throw new Error(`FeatureServer error: ${body.error.message ?? "unknown"}`);
    features.push(...(body.features ?? []));
    if (!body.exceededTransferLimit) break;
  }
  return parseRows(features, column, range);
}
```

`convex/lib/tractNames.ts`:

```ts
// A tract's DYCU neighborhood for a year, from the translator's definitions (DYCU's reports name the tracts). DYCU
// defines its 28 report neighborhoods only, so most tracts have none: the card shows "—", never a guess.
export type DycuDef = { name: string; tracts?: { years: number[]; tracts: string[] }[] };

export function neighborhoodFor(tract: string, year: number, defs: DycuDef[]): string | null {
  for (const d of defs) for (const entry of d.tracts ?? []) if (entry.years.includes(year) && entry.tracts.includes(tract)) return d.name;
  return null;
}
```

(`fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response>` is exported from `convex/lib/http.ts`.)

- [ ] **Step 4: Run to see it pass** — `npx vitest run tests/tractData.test.ts` → PASS; `npx tsc --noEmit -p convex` clean.

- [ ] **Step 5: Commit**

```bash
git add convex/lib/tractData.ts convex/lib/tractNames.ts tests/tractData.test.ts
git commit -m "feat: tract data helpers — ranges, tract ids, row parsing with paging, DYCU neighborhood names"
```

---

### Task 3: `rankTracts`, `tractDetail` and the shared checks

**Files:**
- Create: `convex/tracts.ts`
- Modify: `convex/limits.ts`, `tests/helpers/fakeFetch.ts`
- Test: `convex/tracts.test.ts`

**Interfaces:**
- Consumes: Tasks 1–2; `fetchColumns(url)` (`convex/lib/arcgis.ts`); `hashInputs` (`convex/lib/hash.ts`); `chicagoDay` (`convex/lib/ask.ts`); `internal.map.cached` / `internal.map.remember` and `MAP_TTL_MS` (`convex/map.ts`); `rateLimiter` (`convex/limits.ts`).
- Produces:
  - `type TractRow = { geoid: string; tract: string; neighborhood: string | null; value: number; lo: number | null; hi: number | null; unreliable: boolean }`
  - `type Header = { code: string; name: string; column: string; meaning: string; kind: "rate" | "count" | "value"; place: string; year: string; n: number; leftOut: number; confidence: string | null; url: string; caveats: string[] }`
  - `type Refusal = { status: "not-found" } | { status: "not-tract" } | { status: "choose-column"; columns: { column: string; meaning: string }[] } | { status: "choose-year"; available: { place: string; year: string }[]; shared?: { place: string; year: string }[] } | { status: "unavailable" } | { status: "busy" }`
  - `type RankDetail = { status: "ok"; tool: "rank"; header: Header; direction: "high" | "low"; top: TractRow[]; ties: TractRow[]; unreliable: TractRow[]; highlighted: string[]; key: string }`
  - `api.tracts.rankTracts({ code, column, place: "City" | "County", year: string, direction: "high" | "low" }) → RankDetail | Refusal` (signed in)
  - `api.tracts.tractDetail({ key }) → (RankDetail | ChangeDetail | RelateDetail) | { status: "expired" }` (public)
  - Internal helpers for Task 4: `resolveTract(ctx, code, column, place, year)`, `loadValues(ctx, url, column, range)`, `toRow(v, year, defs)`, `store(ctx, key, detail)`, `limitTracts(ctx)`.

- [ ] **Step 1: Add the fake DYCU rows route** — in `tests/helpers/fakeFetch.ts`, add to `FakeOptions`:

```ts
  tractRows?: (url: string) => { features: { attributes: Record<string, unknown> }[]; exceededTransferLimit?: boolean };
  tractStatus?: number;
```

and, before the existing `url.includes("FeatureServer") && url.endsWith("?f=json")` route:

```ts
    if (url.includes("/FeatureServer/0/query?") && opts.tractRows)
      return json(opts.tractStatus ?? 200, opts.tractRows(url));
```

- [ ] **Step 2: Add the limit** — `convex/limits.ts`: `export const ASK_TRACTS = { kind: "token bucket" as const, rate: 60, period: HOUR, capacity: 20 };` with a comment like ASK_CITY's ("one person's tract analyses; DYCU's server is shared"), and register `askTracts: ASK_TRACTS` in the `RateLimiter` config.

- [ ] **Step 3: Write the failing tests** — `convex/tracts.test.ts`:

```ts
/// <reference types="vite/client" />
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { installFakeFetch } from "../tests/helpers/fakeFetch";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");
const reader = { subject: "u1", issuer: "test", tokenIdentifier: "test|u1" };
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

const URL_2022 = "https://services.arcgis.com/x/arcgis/rest/services/Poverty_2022/FeatureServer/0";
const POV_FIELDS = [
  { name: "OBJECTID", type: "esriFieldTypeOID" },
  { name: "GEOID", type: "esriFieldTypeString" },
  { name: "NAME", type: "esriFieldTypeString" },
  { name: "households", type: "esriFieldTypeInteger" },
  { name: "pov_rate", type: "esriFieldTypeDouble" },
  { name: "pov_rate_moe", type: "esriFieldTypeDouble" },
];
// 25 tracts, 1000..1024; tract 1860 is Harambee's and the poorest.
export const povertyRows = () => ({
  features: [
    ...Array.from({ length: 24 }, (_, i) => ({ attributes: { GEOID: `55079${String(100000 + i * 100).slice(-6)}`, pov_rate: 10 + i, pov_rate_moe: 1 } })),
    { attributes: { GEOID: "55079186000", pov_rate: 58, pov_rate_moe: 4 } },
  ],
});

export async function seedTracts() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  await t.run(async (ctx) => {
    await ctx.db.insert("families", { key: "e02", code: "E02", name: "Households Living in Poverty", kind: "dataset", topic: "Economy", keywords: [], places: ["City"], years: [2022], latestModified: "2024-01-01", baseSearchText: "", searchText: "", dictionaryTab: null });
    const member = { kind: "dataset" as const, landingPage: "", place: "City", years: [2022], modified: "2024-01-01", downloads: {}, description: "", keywords: [] };
    await ctx.db.insert("members", { familyKey: "e02", hubId: "h1", title: "Poverty 2022", yearLabel: "2022", featureServerUrl: URL_2022, ...member });
    await ctx.db.insert("members", { familyKey: "e02", hubId: "h2", title: "Poverty 2022 (no service)", yearLabel: "2023", featureServerUrl: null, ...member });
    await ctx.db.insert("cards", { familyKey: "e02", inputHash: "h", explainer: "x", explainerProvenance: "AI", hubSummary: "", glossary: [{ field: "pov_rate", meaning: "Share of households below the poverty line." }, { field: "households", meaning: "Number of households." }], caveats: ["Survey estimates pool five years."], storyAngles: [], basic: false, embedding: new Array(1536).fill(0) });
    await ctx.db.insert("neighborhoods", { definition: "dycu", name: "Harambee", matchKey: "harambee", tracts: [{ years: [2021, 2022, 2023, 2024], tracts: ["1860"] }] });
  });
  return t;
}

describe("rankTracts", () => {
  it("ranks tracts with ranges and names, stores the full answer, and serves it by key", async () => {
    const t = await seedTracts();
    installFakeFetch({ columns: POV_FIELDS, tractRows: povertyRows });
    const r = await t.withIdentity(reader).action(api.tracts.rankTracts, { code: "e02", column: "POV_RATE", place: "City", year: "2022", direction: "high" });
    expect(r).toMatchObject({ status: "ok", tool: "rank", header: { code: "E02", column: "pov_rate", kind: "rate", place: "City", year: "2022", n: 25, leftOut: 0, confidence: "90% confidence (Census)" } });
    if (r.status !== "ok") return;
    expect(r.top[0]).toMatchObject({ tract: "1860", neighborhood: "Harambee", value: 58, lo: 54, hi: 62, unreliable: false });
    expect(r.top).toHaveLength(10);
    expect(await t.query(api.tracts.tractDetail, { key: r.key })).toMatchObject({ status: "ok", tool: "rank" });
  });
  it("offers the numeric columns when the column isn't one", async () => {
    const t = await seedTracts();
    installFakeFetch({ columns: POV_FIELDS, tractRows: povertyRows });
    const r = await t.withIdentity(reader).action(api.tracts.rankTracts, { code: "E02", column: "NAME", place: "City", year: "2022", direction: "high" });
    expect(r).toMatchObject({ status: "choose-column", columns: expect.arrayContaining([{ column: "pov_rate", meaning: "Share of households below the poverty line." }]) });
    expect(JSON.stringify(r)).not.toContain("pov_rate_moe");
  });
  it("lists the place/years that exist when asked for one that doesn't (a year with no map service doesn't count)", async () => {
    const t = await seedTracts();
    installFakeFetch({ columns: POV_FIELDS, tractRows: povertyRows });
    expect(await t.withIdentity(reader).action(api.tracts.rankTracts, { code: "E02", column: "pov_rate", place: "City", year: "2023", direction: "high" })).toEqual({ status: "choose-year", available: [{ place: "City", year: "2022" }] });
  });
  it("refuses unknown codes, non-tract datasets and a down server, and needs sign-in", async () => {
    const t = await seedTracts();
    installFakeFetch({ columns: POV_FIELDS.filter((f) => f.name !== "GEOID"), tractRows: povertyRows });
    expect(await t.withIdentity(reader).action(api.tracts.rankTracts, { code: "Z99", column: "pov_rate", place: "City", year: "2022", direction: "high" })).toEqual({ status: "not-found" });
    expect(await t.withIdentity(reader).action(api.tracts.rankTracts, { code: "E02", column: "pov_rate", place: "City", year: "2022", direction: "high" })).toEqual({ status: "not-tract" });
    installFakeFetch({ columns: POV_FIELDS, tractRows: povertyRows, tractStatus: 500 });
    expect(await t.withIdentity(reader).action(api.tracts.rankTracts, { code: "E02", column: "pov_rate", place: "City", year: "2022", direction: "high" })).toEqual({ status: "unavailable" });
    await expect(t.action(api.tracts.rankTracts, { code: "E02", column: "pov_rate", place: "City", year: "2022", direction: "high" })).rejects.toThrow(/Sign in/);
  });
  it("answers an expired or unknown key with expired", async () => {
    const t = await seedTracts();
    expect(await t.query(api.tracts.tractDetail, { key: "tracts:nope" })).toEqual({ status: "expired" });
  });
});
```

- [ ] **Step 4: Run to see it fail** — `npx vitest run convex/tracts.test.ts` → FAIL (`api.tracts` missing).

- [ ] **Step 5: Implement** — `convex/tracts.ts`:

```ts
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalQuery, query, type ActionCtx } from "./_generated/server";
import { MAP_TTL_MS } from "./map";
import { fetchColumns } from "./lib/arcgis";
import { chicagoDay } from "./lib/ask";
import { hashInputs } from "./lib/hash";
import { columnKind, fetchTractRows, isNumericField, rangeColumns, tractNumber, type RangeCols } from "./lib/tractData";
import { neighborhoodFor, type DycuDef } from "./lib/tractNames";
import { isUnreliable, rankValues, type TractValue } from "./lib/tractStats";
import { rateLimiter } from "./limits";

// Ask's tract analyses (docs/superpowers/specs/2026-10-10-ask-analyzes-design.md). The model gets a compact answer;
// the full one waits in mapCache under a tracts: key for the card (tractDetail), so per-tract points never ride in
// the conversation.

export type TractRow = { geoid: string; tract: string; neighborhood: string | null; value: number; lo: number | null; hi: number | null; unreliable: boolean };
export type Header = { code: string; name: string; column: string; meaning: string; kind: "rate" | "count" | "value"; place: string; year: string; n: number; leftOut: number; confidence: string | null; url: string; caveats: string[] };
export type Refusal =
  | { status: "not-found" }
  | { status: "not-tract" }
  | { status: "choose-column"; columns: { column: string; meaning: string }[] }
  | { status: "choose-year"; available: { place: string; year: string }[]; shared?: { place: string; year: string }[] }
  | { status: "unavailable" }
  | { status: "busy" };
export type RankDetail = { status: "ok"; tool: "rank"; header: Header; direction: "high" | "low"; top: TractRow[]; ties: TractRow[]; unreliable: TractRow[]; highlighted: string[]; key: string };

const vPlace = v.union(v.literal("City"), v.literal("County"));
const CONFIDENCE = { moe90: "90% confidence (Census)", ci95: "95% confidence (CDC)" } as const;

export const familyForTracts = internalQuery({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const family = await ctx.db.query("families").withIndex("by_code", (q) => q.eq("code", code.trim().toUpperCase())).first();
    if (!family || family.source === "city" || family.kind === "page") return null;
    const members = await ctx.db.query("members").withIndex("by_family", (q) => q.eq("familyKey", family.key)).collect();
    const card = await ctx.db.query("cards").withIndex("by_family", (q) => q.eq("familyKey", family.key)).first();
    return {
      code: family.code,
      name: family.name,
      members: members.filter((m) => m.featureServerUrl && m.place).map((m) => ({ place: m.place as string, year: m.yearLabel ?? String(m.years[0] ?? ""), url: m.featureServerUrl as string })),
      glossary: card?.glossary ?? [],
      caveats: card?.caveats ?? [],
    };
  },
});

export const dycuDefs = internalQuery({
  args: {},
  handler: async (ctx): Promise<DycuDef[]> =>
    (await ctx.db.query("neighborhoods").collect()).filter((n) => n.definition === "dycu").map((n) => ({ name: n.name, tracts: n.tracts })),
});

export type Resolved = { family: { code: string; name: string; caveats: string[] }; url: string; column: string; meaning: string; range: RangeCols };

// The checks every tool runs before any math (spec §4). Throws nothing: a refusal is an answer the model acts on.
export async function resolveTract(ctx: ActionCtx, code: string, column: string, place: string, year: string): Promise<Resolved | Refusal> {
  const fam = await ctx.runQuery(internal.tracts.familyForTracts, { code });
  if (!fam) return { status: "not-found" };
  const available = fam.members.map(({ place, year }) => ({ place, year }));
  const member = fam.members.find((m) => m.place === place && m.year === year.trim());
  if (!member) return { status: "choose-year", available };
  let fields;
  try {
    fields = await fetchColumns(member.url);
  } catch {
    return { status: "unavailable" };
  }
  if (!fields.some((f) => f.name.toUpperCase() === "GEOID")) return { status: "not-tract" };
  const meaningOf = (name: string) => fam.glossary.find((g) => g.field.toLowerCase() === name.toLowerCase())?.meaning ?? "";
  const numeric = fields.filter((f) => isNumericField(f) && !/_moe$|confidence_limit$/i.test(f.name));
  const col = numeric.find((f) => f.name.toLowerCase() === column.trim().toLowerCase());
  if (!col) return { status: "choose-column", columns: numeric.map((f) => ({ column: f.name, meaning: meaningOf(f.name) })) };
  return { family: { code: fam.code, name: fam.name, caveats: fam.caveats }, url: member.url, column: col.name, meaning: meaningOf(col.name), range: rangeColumns(col.name, fields.map((f) => f.name)) };
}

export async function limitTracts(ctx: ActionCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Sign in to ask");
  return (await rateLimiter.limit(ctx, "askTracts", { key: identity.tokenIdentifier })).ok;
}

export async function loadValues(r: Resolved) {
  try {
    return await fetchTractRows(r.url, r.column, r.range);
  } catch {
    return null;
  }
}

export const yearNumber = (year: string) => Number(year.match(/\d{4}/)?.[0] ?? 0);

export const toRow = (v: TractValue, year: string, defs: DycuDef[]): TractRow => {
  const tract = tractNumber(v.geoid);
  return { geoid: v.geoid, tract, neighborhood: neighborhoodFor(tract, yearNumber(year), defs), value: v.value, lo: v.lo, hi: v.hi, unreliable: isUnreliable(v) };
};

export const header = (r: Resolved, place: string, year: string, n: number, leftOut: number): Header => ({
  code: r.family.code, name: r.family.name, column: r.column, meaning: r.meaning, kind: columnKind(r.column, r.meaning),
  place, year, n, leftOut, confidence: r.range ? CONFIDENCE[r.range.kind] : null, url: r.url, caveats: r.family.caveats,
});

export async function store(ctx: ActionCtx, args: unknown) {
  const key = `tracts:${await hashInputs({ args, day: chicagoDay(Date.now()) })}`;
  return { key, save: (detail: unknown) => ctx.runMutation(internal.map.remember, { key, result: JSON.stringify(detail), expiresAt: Date.now() + MAP_TTL_MS }) };
}

export const rankTracts = action({
  args: { code: v.string(), column: v.string(), place: vPlace, year: v.string(), direction: v.union(v.literal("high"), v.literal("low")) },
  handler: async (ctx, args): Promise<RankDetail | Refusal> => {
    if (!(await limitTracts(ctx))) return { status: "busy" };
    const r = await resolveTract(ctx, args.code, args.column, args.place, args.year);
    if ("status" in r) return r;
    const rows = await loadValues(r);
    if (!rows) return { status: "unavailable" };
    const defs = await ctx.runQuery(internal.tracts.dycuDefs, {});
    const ranked = rankValues(rows.values, args.direction);
    const { key, save } = await store(ctx, { tool: "rank", ...args, code: r.family.code, column: r.column });
    const detail: RankDetail = {
      status: "ok", tool: "rank", header: header(r, args.place, args.year, rows.values.length, rows.leftOut), direction: args.direction,
      top: ranked.top.map((v) => toRow(v, args.year, defs)), ties: ranked.ties.slice(0, 10).map((v) => toRow(v, args.year, defs)),
      unreliable: ranked.unreliable.slice(0, 10).map((v) => toRow(v, args.year, defs)), highlighted: ranked.top.map((v) => v.geoid), key,
    };
    await save(detail);
    return detail;
  },
});

// The card's full answer by key. Anyone with the key may read it: it holds public DYCU data and expires in 10 minutes.
export const tractDetail = query({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    if (!key.startsWith("tracts:")) return { status: "expired" as const };
    const row = await ctx.db.query("mapCache").withIndex("by_key", (q) => q.eq("key", key)).first();
    return row && row.expiresAt > Date.now() ? JSON.parse(row.result) : { status: "expired" as const };
  },
});
```

(The rank answer is already compact — at most 10 rows per list — so `rankTracts` returns the stored detail itself. The `cards` table's index is `by_family`, as `convex/catalog.ts` uses it.)

- [ ] **Step 6: Run to see it pass** — `npx convex dev --once` (dev only; regenerates `api.d.ts`), then `npx vitest run convex/tracts.test.ts` → PASS; `npx tsc --noEmit -p convex` clean.

- [ ] **Step 7: Commit**

```bash
git add convex/tracts.ts convex/tracts.test.ts convex/limits.ts tests/helpers/fakeFetch.ts convex/_generated
git commit -m "feat: rankTracts — checks, live DYCU rows, ranked tracts with ranges and names, detail by key"
```

---

### Task 4: `compareYears` and `relateTracts`

**Files:**
- Modify: `convex/tracts.ts`
- Test: `convex/tracts.test.ts`

**Interfaces:**
- Consumes: Task 3's `resolveTract`, `limitTracts`, `loadValues`, `toRow`, `header`, `store`, `familyForTracts`, `yearNumber`; Task 1's `changeOf`, `spearman`, `relationship`, `mismatch`, `isUnreliable`.
- Produces:
  - `type ChangeRow = { geoid: string; tract: string; neighborhood: string | null; from: TractRow; to: TractRow; change: number; direction: "increase" | "decrease" }`
  - `type ChangeDetail = { status: "ok"; tool: "change"; header: Header; from: string; to: string; increases: number; decreases: number; none: number; changes: ChangeRow[]; highlighted: string[]; key: string }`
  - `type Point = { geoid: string; tract: string; neighborhood: string | null; a: [number, number | null, number | null]; b: [number, number | null, number | null]; mark: "fits" | "close" | null }`
  - `type RelateDetail = { status: "ok"; tool: "relate"; mode: "relate" | "mismatch"; a: Header; b: Header; n: number; rho: number; strength: "too-few" | "little" | "weak" | "moderate" | "strong"; direction: "higher" | "lower"; aSide?: "high" | "low"; bSide?: "high" | "low"; cutA?: number; cutB?: number; fits: { a: TractRow; b: TractRow }[]; close: { a: TractRow; b: TractRow }[]; points: Point[]; highlighted: string[]; closeIds: string[]; key: string }`
  - `api.tracts.compareYears({ code, column, place, from, to }) → ChangeDetail | Refusal`
  - `api.tracts.relateTracts({ a: { code, column }, b: { code, column }, place, year, mode, aSide?, bSide? }) → Omit<RelateDetail, "points"> | Refusal` (the stored detail keeps `points`)

- [ ] **Step 1: Write the failing tests** — append to `convex/tracts.test.ts`:

```ts
const URL_F02 = "https://services.arcgis.com/x/arcgis/rest/services/FoodSecurity_MKE_2022/FeatureServer/0";
const F02_FIELDS = [
  { name: "GEOID", type: "esriFieldTypeString" },
  { name: "per_insecure", type: "esriFieldTypeDouble" },
  { name: "Low_Confidence_Limit", type: "esriFieldTypeDouble" },
  { name: "High_Confidence_Limit", type: "esriFieldTypeDouble" },
];

async function seedPair() {
  const t = await seedTracts();
  await t.run(async (ctx) => {
    await ctx.db.insert("families", { key: "f02", code: "F02", name: "Food Insecurity Prevalence", kind: "dataset", topic: "Health", keywords: [], places: ["City"], years: [2022], latestModified: "2024-01-01", baseSearchText: "", searchText: "", dictionaryTab: null });
    await ctx.db.insert("members", { familyKey: "f02", hubId: "f1", title: "Food 2022", yearLabel: "2022", featureServerUrl: URL_F02, kind: "dataset", landingPage: "", place: "City", years: [2022], modified: "2024-01-01", downloads: {}, description: "", keywords: [] });
    await ctx.db.insert("cards", { familyKey: "f02", inputHash: "h", explainer: "x", explainerProvenance: "AI", hubSummary: "", glossary: [{ field: "per_insecure", meaning: "Percent of adults food-insecure (model estimate)." }], caveats: ["Model-based estimates."], storyAngles: [], basic: false, embedding: new Array(1536).fill(0) });
  });
  return t;
}

// Food insecurity mirrors poverty, except Harambee's tract: high poverty, clearly low food insecurity. One F02 GEOID
// arrives as a number and one as a bare 6-digit tract; both must still match.
const foodRows = () => ({
  features: [
    ...Array.from({ length: 24 }, (_, i) => ({ attributes: { GEOID: i === 0 ? 55079100000 : i === 1 ? "100100" : `55079${String(100000 + i * 100).slice(-6)}`, per_insecure: 10 + i, Low_Confidence_Limit: 9.5 + i, High_Confidence_Limit: 10.5 + i } })),
    { attributes: { GEOID: "55079186000", per_insecure: 8, Low_Confidence_Limit: 7, High_Confidence_Limit: 9 } },
  ],
});
const routeRows = (url: string) => (url.includes("FoodSecurity") ? foodRows() : povertyRows());
const routeFields = (url: string) => (url.includes("FoodSecurity") ? F02_FIELDS : POV_FIELDS);

describe("relateTracts", () => {
  it("lines two datasets up by tract, words the relationship, and keeps points out of the model's answer", async () => {
    const t = await seedPair();
    installFakeFetch({ columnsFor: routeFields, tractRows: routeRows });
    const r = await t.withIdentity(reader).action(api.tracts.relateTracts, { a: { code: "E02", column: "pov_rate" }, b: { code: "F02", column: "per_insecure" }, place: "City", year: "2022", mode: "relate" });
    expect(r).toMatchObject({ status: "ok", tool: "relate", n: 25, strength: "strong", direction: "higher", a: { confidence: "90% confidence (Census)" }, b: { confidence: "95% confidence (CDC)" } });
    expect(r).not.toHaveProperty("points");
    if (r.status !== "ok") return;
    expect((await t.query(api.tracts.tractDetail, { key: r.key })).points).toHaveLength(25);
  });
  it("finds the tract that clearly breaks the pattern and names it", async () => {
    const t = await seedPair();
    installFakeFetch({ columnsFor: routeFields, tractRows: routeRows });
    const r = await t.withIdentity(reader).action(api.tracts.relateTracts, { a: { code: "E02", column: "pov_rate" }, b: { code: "F02", column: "per_insecure" }, place: "City", year: "2022", mode: "mismatch", aSide: "high", bSide: "low" });
    expect(r).toMatchObject({ status: "ok", mode: "mismatch", fits: [{ a: { tract: "1860", neighborhood: "Harambee" } }] });
  });
  it("names the place/years two datasets share when asked for one they don't", async () => {
    const t = await seedPair();
    installFakeFetch({ columnsFor: routeFields, tractRows: routeRows });
    expect(await t.withIdentity(reader).action(api.tracts.relateTracts, { a: { code: "E02", column: "pov_rate" }, b: { code: "F02", column: "per_insecure" }, place: "County", year: "2023", mode: "relate" }))
      .toMatchObject({ status: "choose-year", shared: [{ place: "City", year: "2022" }] });
  });
});

describe("compareYears", () => {
  it("counts clear increases and decreases against both years' margins", async () => {
    const t = await seedTracts();
    await t.run(async (ctx) => {
      const m = (await ctx.db.query("members").collect()).find((x) => x.yearLabel === "2023")!;
      await ctx.db.patch(m._id, { featureServerUrl: "https://services.arcgis.com/x/arcgis/rest/services/Poverty_MKE_2023/FeatureServer/0" });
    });
    const y2023 = () => ({ features: povertyRows().features.map((f, i) => ({ attributes: { ...f.attributes, pov_rate: (f.attributes.pov_rate as number) + (i === 0 ? 10 : i === 1 ? -10 : 0.5) } })) });
    installFakeFetch({ columns: POV_FIELDS, tractRows: (url) => (url.includes("2023") ? y2023() : povertyRows()) });
    const r = await t.withIdentity(reader).action(api.tracts.compareYears, { code: "E02", column: "pov_rate", place: "City", from: "2022", to: "2023" });
    expect(r).toMatchObject({ status: "ok", tool: "change", increases: 1, decreases: 1, none: 23 });
  });
});
```

Add a `columnsFor?: (url: string) => { name: string; alias?: string; type?: string }[]` option to `FakeOptions` in `tests/helpers/fakeFetch.ts`, used by the `?f=json` route as `opts.columnsFor?.(url) ?? opts.columns ?? [...]`.

- [ ] **Step 2: Run to see them fail** — `npx vitest run convex/tracts.test.ts` → FAIL.

- [ ] **Step 3: Implement** — append to `convex/tracts.ts` (and add `changeOf, mismatch, relationship, spearman` to the `./lib/tractStats` import):

```ts
export type ChangeRow = { geoid: string; tract: string; neighborhood: string | null; from: TractRow; to: TractRow; change: number; direction: "increase" | "decrease" };
export type ChangeDetail = { status: "ok"; tool: "change"; header: Header; from: string; to: string; increases: number; decreases: number; none: number; changes: ChangeRow[]; highlighted: string[]; key: string };
export type Point = { geoid: string; tract: string; neighborhood: string | null; a: [number, number | null, number | null]; b: [number, number | null, number | null]; mark: "fits" | "close" | null };
export type RelateDetail = {
  status: "ok"; tool: "relate"; mode: "relate" | "mismatch"; a: Header; b: Header; n: number; rho: number;
  strength: "too-few" | "little" | "weak" | "moderate" | "strong"; direction: "higher" | "lower";
  aSide?: "high" | "low"; bSide?: "high" | "low"; cutA?: number; cutB?: number;
  fits: { a: TractRow; b: TractRow }[]; close: { a: TractRow; b: TractRow }[]; points: Point[]; highlighted: string[]; closeIds: string[]; key: string;
};

export const compareYears = action({
  args: { code: v.string(), column: v.string(), place: vPlace, from: v.string(), to: v.string() },
  handler: async (ctx, args): Promise<ChangeDetail | Refusal> => {
    if (!(await limitTracts(ctx))) return { status: "busy" };
    const r1 = await resolveTract(ctx, args.code, args.column, args.place, args.from);
    if ("status" in r1) return r1;
    const r2 = await resolveTract(ctx, args.code, r1.column, args.place, args.to);
    if ("status" in r2) return r2;
    const [y1, y2] = await Promise.all([loadValues(r1), loadValues(r2)]);
    if (!y1 || !y2) return { status: "unavailable" };
    const defs = await ctx.runQuery(internal.tracts.dycuDefs, {});
    const later = new Map(y2.values.map((x) => [x.geoid, x]));
    let increases = 0, decreases = 0, none = 0;
    const changes: ChangeRow[] = [];
    for (const a of y1.values) {
      const b = later.get(a.geoid);
      if (!b) continue;
      const d = changeOf(a, b);
      if (d === "none") { none++; continue; }
      if (d === "increase") increases++; else decreases++;
      const to = toRow(b, args.to, defs);
      changes.push({ geoid: a.geoid, tract: to.tract, neighborhood: to.neighborhood, from: toRow(a, args.from, defs), to, change: b.value - a.value, direction: d });
    }
    changes.sort((p, q) => Math.abs(q.change) - Math.abs(p.change));
    const { key, save } = await store(ctx, { tool: "change", ...args, code: r1.family.code, column: r1.column });
    const matched = increases + decreases + none;
    const detail: ChangeDetail = {
      status: "ok", tool: "change", header: header(r1, args.place, `${args.from}–${args.to}`, matched, y1.values.length + y1.leftOut - matched),
      from: args.from, to: args.to, increases, decreases, none, changes: changes.slice(0, 10), highlighted: changes.slice(0, 10).map((c) => c.geoid), key,
    };
    await save(detail);
    return detail;
  },
});

const vSide = v.union(v.literal("high"), v.literal("low"));
const vPick = v.object({ code: v.string(), column: v.string() });

export const relateTracts = action({
  args: { a: vPick, b: vPick, place: vPlace, year: v.string(), mode: v.union(v.literal("relate"), v.literal("mismatch")), aSide: v.optional(vSide), bSide: v.optional(vSide) },
  handler: async (ctx, args): Promise<Omit<RelateDetail, "points"> | Refusal> => {
    if (!(await limitTracts(ctx))) return { status: "busy" };
    const ra = await resolveTract(ctx, args.a.code, args.a.column, args.place, args.year);
    const rb = await resolveTract(ctx, args.b.code, args.b.column, args.place, args.year);
    if ("status" in ra || "status" in rb) {
      const year = [ra, rb].find((x): x is Extract<Refusal, { status: "choose-year" }> => "status" in x && x.status === "choose-year");
      if (year) {
        const [fa, fb] = await Promise.all([ctx.runQuery(internal.tracts.familyForTracts, { code: args.a.code }), ctx.runQuery(internal.tracts.familyForTracts, { code: args.b.code })]);
        const pa = (fa?.members ?? []).map(({ place, year }) => ({ place, year }));
        const shared = pa.filter((x) => (fb?.members ?? []).some((y) => y.place === x.place && y.year === x.year));
        return { status: "choose-year", available: pa, shared };
      }
      return ("status" in ra ? ra : rb) as Refusal;
    }
    const [va, vb] = await Promise.all([loadValues(ra), loadValues(rb)]);
    if (!va || !vb) return { status: "unavailable" };
    const defs = await ctx.runQuery(internal.tracts.dycuDefs, {});
    const bBy = new Map(vb.values.map((x) => [x.geoid, x]));
    const pairs = va.values.flatMap((a) => (bBy.has(a.geoid) ? [{ geoid: a.geoid, a, b: bBy.get(a.geoid)! }] : []));
    const ok = pairs.filter((p) => !isUnreliable(p.a) && !isUnreliable(p.b));
    const rho = ok.length ? spearman(ok.map((p) => p.a.value), ok.map((p) => p.b.value)) : 0;
    const verdict = relationship(rho, ok.length);
    const mm = args.mode === "mismatch" && ok.length >= 20 ? mismatch(pairs, args.aSide ?? "high", args.bSide ?? "low") : null;
    const fitsIds = new Set(mm?.fits.map((p) => p.geoid));
    const closeIds = new Set(mm?.close.map((p) => p.geoid));
    const both = (p: { a: TractValue; b: TractValue }) => ({ a: toRow(p.a, args.year, defs), b: toRow(p.b, args.year, defs) });
    const { key, save } = await store(ctx, { tool: "relate", ...args, a: { code: ra.family.code, column: ra.column }, b: { code: rb.family.code, column: rb.column } });
    const leftOut = va.values.length + va.leftOut - pairs.length;
    const detail: RelateDetail = {
      status: "ok", tool: "relate", mode: args.mode,
      a: header(ra, args.place, args.year, pairs.length, leftOut), b: header(rb, args.place, args.year, pairs.length, vb.values.length + vb.leftOut - pairs.length),
      n: ok.length, rho, strength: verdict.strength, direction: verdict.direction,
      ...(mm ? { aSide: args.aSide ?? "high", bSide: args.bSide ?? "low", cutA: mm.cutA, cutB: mm.cutB } : {}),
      fits: (mm?.fits ?? []).slice(0, 10).map(both), close: (mm?.close ?? []).slice(0, 10).map(both),
      points: pairs.map((p) => {
        const row = toRow(p.a, args.year, defs);
        return { geoid: p.geoid, tract: row.tract, neighborhood: row.neighborhood, a: [p.a.value, p.a.lo, p.a.hi], b: [p.b.value, p.b.lo, p.b.hi], mark: fitsIds.has(p.geoid) ? "fits" : closeIds.has(p.geoid) ? "close" : null };
      }),
      highlighted: [...fitsIds].slice(0, 10), closeIds: [...closeIds].slice(0, 10), key,
    };
    await save(detail);
    const { points: _points, ...forModel } = detail;
    return forModel;
  },
});
```

- [ ] **Step 4: Run to see them pass** — `npx convex dev --once`, `npx vitest run convex/tracts.test.ts` → PASS; `npx tsc --noEmit -p convex`.

If the "strong / higher" expectation fails, print `rho` — with the fixture's mirrored values it must be close to 1 except Harambee's tract; check the fixture before changing the code.

- [ ] **Step 5: Commit**

```bash
git add convex/tracts.ts convex/tracts.test.ts tests/helpers/fakeFetch.ts convex/_generated
git commit -m "feat: compareYears and relateTracts — clear changes, ranked relationship, mismatches that clear their ranges"
```

---

### Task 5: Ask's three tools

**Files:**
- Modify: `lib/ask/tools.ts`, `lib/ask/backend.ts`, `lib/ask/prompt.ts`, `lib/ask/model.ts`
- Test: `tests/ui/askTools.test.ts` (new)

**Interfaces:**
- Consumes: `api.tracts.rankTracts`, `api.tracts.compareYears`, `api.tracts.relateTracts` (Tasks 3–4).
- Produces: `AskToolName` gains `"rankTracts" | "compareYears" | "relateTracts"`; `AskBackend` gains `rank(a)`, `change(a)`, `relate(a)`; `rankParams`, `changeParams`, `relateParams` (zod) exported for the cards.

- [ ] **Step 1: Write the failing test** — `tests/ui/askTools.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { askTools, type AskBackend } from "../../lib/ask/tools";

const backend = (relateResult: unknown): AskBackend => ({
  search: async () => ({ results: [] }) as never, sheet: async () => null, number: async () => ({}) as never, report: async () => ({}) as never, count: async () => ({}) as never,
  rank: async () => ({ status: "busy" }) as never, change: async () => ({ status: "busy" }) as never, relate: async () => relateResult as never,
});

describe("tract tools", () => {
  it("offers rankTracts, compareYears and relateTracts", () => {
    expect(askTools(backend({})).map((t) => t.name)).toEqual(expect.arrayContaining(["rankTracts", "compareYears", "relateTracts"]));
  });
  it("keeps a 300-tract relate answer under 8 KB in the conversation", async () => {
    const row = (i: number) => ({ geoid: `5507910${String(i).padStart(4, "0")}`, tract: String(i), neighborhood: "Harambee", value: 41.2, lo: 35.1, hi: 47.3, unreliable: false });
    const head = { code: "E02", name: "Households Living in Poverty", column: "pov_rate", meaning: "Share of households below the poverty line.", kind: "rate", place: "City", year: "2022", n: 300, leftOut: 4, confidence: "90% confidence (Census)", url: "https://services.arcgis.com/x/FeatureServer/0", caveats: ["Survey estimates pool five years."] };
    const answer = { status: "ok", tool: "relate", mode: "mismatch", a: head, b: { ...head, code: "F02" }, n: 300, rho: 0.71, strength: "strong", direction: "higher", fits: Array.from({ length: 10 }, (_, i) => ({ a: row(i), b: row(i) })), close: Array.from({ length: 10 }, (_, i) => ({ a: row(i), b: row(i) })), highlighted: [], closeIds: [], key: "tracts:abc" };
    const tool = askTools(backend(answer)).find((t) => t.name === "relateTracts")!;
    const out = await tool.execute({ a: { code: "E02", column: "pov_rate" }, b: { code: "F02", column: "per_insecure" }, place: "City", year: "2022", mode: "mismatch" } as never);
    expect(JSON.stringify(out).length).toBeLessThan(8_000);
  });
});
```

- [ ] **Step 2: Run to see it fail** — `npx vitest run tests/ui/askTools.test.ts` → FAIL.

- [ ] **Step 3: Implement**

`lib/ask/tools.ts`:
- Types: `export type RankResult = FunctionReturnType<typeof api.tracts.rankTracts>; export type ChangeResult = FunctionReturnType<typeof api.tracts.compareYears>; export type RelateResult = FunctionReturnType<typeof api.tracts.relateTracts>;`
- Extend `AskToolName` with `"rankTracts" | "compareYears" | "relateTracts"`.
- Extend `AskBackend` with `rank(a: z.infer<typeof rankParams>): Promise<RankResult>; change(a: z.infer<typeof changeParams>): Promise<ChangeResult>; relate(a: z.infer<typeof relateParams>): Promise<RelateResult>;`
- Params:

```ts
const place = z.enum(["City", "County"]).describe("City or County, as the dataset's sheet lists it");
const year = z.string().max(9).describe('The year label from the dataset\'s sheet, e.g. "2022"');
const column = z.string().max(64).describe("A numeric column from the dataset's column guide; prefer a rate over a count when comparing tracts");
export const rankParams = z.object({ code, column, place, year, direction: z.enum(["high", "low"]) });
export const changeParams = z.object({ code, column, place, from: year, to: year });
export const relateParams = z.object({
  a: z.object({ code, column }), b: z.object({ code, column }), place, year,
  mode: z.enum(["relate", "mismatch"]).describe("relate: do they go together; mismatch: tracts high on one but low on the other"),
  aSide: z.enum(["high", "low"]).optional(), bSide: z.enum(["high", "low"]).optional(),
});
```

- Tools (append to the `tools` array):

```ts
    {
      name: "rankTracts",
      description: "Rank census tracts on one DYCU tract dataset's column (highest or lowest), with margins of error and DYCU neighborhood names. Returns rows for the card; never restate their numbers. If it returns choose-column or choose-year, pick from the list and call again.",
      parameters: rankParams,
      execute: (a: z.infer<typeof rankParams>) => b.rank(a),
    },
    {
      name: "compareYears",
      description: "Find census tracts whose value on one DYCU tract dataset's column changed clearly between two years (beyond both years' margins of error). Same place both years.",
      parameters: changeParams,
      execute: (a: z.infer<typeof changeParams>) => b.change(a),
    },
    {
      name: "relateTracts",
      description: "Line two DYCU tract datasets up tract by tract. mode relate: do they go together (a ranked comparison, worded on the card). mode mismatch: tracts high on one but low on the other (aSide, bSide), counted only when their ranges clear both cutoffs. If they share no place/year, it returns the shared ones.",
      parameters: relateParams,
      execute: (a: z.infer<typeof relateParams>) => b.relate(a),
    },
```

`lib/ask/backend.ts` — add `rank: (a) => fetchAction(api.tracts.rankTracts, a, { token })`, `change: (a) => fetchAction(api.tracts.compareYears, a, { token })`, `relate: (a) => fetchAction(api.tracts.relateTracts, a, { token })`.

`lib/ask/prompt.ts` — add to the rules list (before the closing reply rule):

```
- DYCU's census-tract datasets (most of them; their columns include GEOID) can be ranked (rankTracts), compared across years (compareYears), or lined up against each other (relateTracts: "do they go together", or mismatches like "where is poverty high but food insecurity low"). Find the datasets first, read the column guide (showDataset), and pick a rate over a count. The card carries every number, the ranges and the verdict; say what the card shows and the one caveat that matters, never a figure. Never say one thing causes another.
```

`lib/ask/model.ts` (fake model) — in the first-step branch add, before `question.includes("air")`:

```ts
                : question.includes("rank tracts")
                ? call("rankTracts", { code: "E02", column: "pov_rate", place: "City", year: "2022", direction: "high" })
                : question.includes("despite")
                ? call("relateTracts", { a: { code: "E02", column: "pov_rate" }, b: { code: "F02", column: "per_insecure" }, place: "City", year: "2022", mode: "mismatch", aSide: "high", bSide: "low" })
                : question.includes("grow most")
                ? call("compareYears", { code: "E02", column: "pov_rate", place: "City", from: "2022", to: "2023" })
```

and list them in the header comment.

Any test file that builds an `AskBackend` (grep `AskBackend` in `tests/`) gets the three new methods stubbed.

- [ ] **Step 4: Run** — `npx vitest run --maxWorkers=2` (all) → PASS; `npx tsc --noEmit -p .` clean.

- [ ] **Step 5: Commit**

```bash
git add lib/ask tests/ui/askTools.test.ts tests
git commit -m "feat: Ask's tract tools — rankTracts, compareYears, relateTracts; prompt and fake-model scripts"
```

---

### Task 6: The three cards

**Files:**
- Create: `ui/lib/tractScatter.ts`, `ui/components/TractCards.tsx`
- Modify: `ui/components/AskCards.tsx`, `ui/components/ask.module.css`
- Test: `tests/ui/tractScatter.test.ts`, `e2e/ask.spec.ts`

**Interfaces:**
- Consumes: `RankResult`, `ChangeResult`, `RelateResult`, `rankParams`, `changeParams`, `relateParams` (Task 5); `api.tracts.tractDetail` (Task 3); `RelateDetail`, `Point`, `TractRow` types from `convex/tracts.ts`; `CityMapLoader` (existing; Task 7 adds its `tracts` prop — in this task render the map only after Task 7, so leave a `{/* map: Task 7 */}` slot inside each card's `data-tract-map` wrapper).
- Produces: `RankCard`, `ChangeCard`, `RelateCard`; `scales(points, width, height, pad)`; registrations for the three tools in `AskCards`.

- [ ] **Step 1: Failing unit test** — `tests/ui/tractScatter.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { scales } from "../../ui/lib/tractScatter";

describe("scatter scales", () => {
  it("maps the data's range (ranges included) into the plot box, y up", () => {
    const s = scales([{ a: [10, 8, 12], b: [5, 4, 6] }, { a: [50, 45, 55], b: [25, 20, 30] }], 300, 200, 20);
    expect(s.x(8)).toBeCloseTo(20);
    expect(s.x(55)).toBeCloseTo(280);
    expect(s.y(4)).toBeCloseTo(180);
    expect(s.y(30)).toBeCloseTo(20);
  });
  it("doesn't divide by zero when every value is the same", () => {
    const s = scales([{ a: [5, null, null], b: [5, null, null] }], 300, 200, 20);
    expect(Number.isFinite(s.x(5))).toBe(true);
  });
});
```

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement** `ui/lib/tractScatter.ts`:

```ts
type Triple = [number, number | null, number | null];
// Linear scales for the relate card's scatter: the x/y extents include each point's range, y grows upward.
export function scales(points: { a: Triple; b: Triple }[], width: number, height: number, pad: number) {
  const ext = (k: "a" | "b") => {
    const all = points.flatMap((p) => [p[k][0], p[k][1], p[k][2]]).filter((v): v is number => v !== null);
    const lo = Math.min(...all);
    const hi = Math.max(...all);
    return hi > lo ? [lo, hi] : [lo - 1, hi + 1];
  };
  const [x0, x1] = ext("a");
  const [y0, y1] = ext("b");
  return {
    x: (v: number) => pad + ((v - x0) / (x1 - x0)) * (width - 2 * pad),
    y: (v: number) => height - pad - ((v - y0) / (y1 - y0)) * (height - 2 * pad),
  };
}
```

`ui/components/TractCards.tsx` — three cards following the approved mockups (`.superpowers/brainstorm/75320-1791668714/content/analyze-cards.html`) and spec §7. Shared pieces:

```tsx
"use client";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Header, Point, TractRow } from "@/convex/tracts";
import { scales } from "@/ui/lib/tractScatter";
import { ProvenanceTag } from "./ProvenanceTag";
import styles from "./ask.module.css";

const fmt = (v: number) => (Math.abs(v) >= 100 ? Math.round(v).toLocaleString("en-US") : String(Math.round(v * 10) / 10));
const range = (r: { value: number; lo: number | null; hi: number | null }) =>
  r.lo === null || r.hi === null ? fmt(r.value) : `${fmt(r.value)} (${fmt(r.lo)}–${fmt(r.hi)})`;
const KIND = { rate: "a rate", count: "a count", value: "a value" } as const;
const STRENGTH = { little: "Little relationship", weak: "Weakly related", moderate: "Moderately related", strong: "Strongly related", "too-few": "Too few tracts to say (fewer than 20 matched)." } as const;

function Head({ h, title }: { h: Header; title: string }) {
  return (
    <>
      <p className={styles.tractHead}>{title}</p>
      <p className={styles.tractMeta}>
        {h.code} <b>{h.column}</b> ({h.meaning || "no definition in the column guide"}, {KIND[h.kind]}) · {h.place} {h.year} · {h.n} tracts{h.leftOut ? `, ${h.leftOut} left out (no data)` : ""} <ProvenanceTag source="DYCU" />
      </p>
    </>
  );
}

function Rows({ rows, cells }: { rows: TractRow[]; cells: (r: TractRow) => React.ReactNode[] }) {
  return rows.map((r) => (
    <tr key={r.geoid} className={r.unreliable ? styles.tractUnreliable : undefined}>
      <td>{r.tract}</td><td>{r.neighborhood ?? "—"}</td>{cells(r).map((c, i) => <td key={i} className={styles.num}>{c}</td>)}
    </tr>
  ));
}

function Fine({ heads, causal }: { heads: Header[]; causal?: boolean }) {
  const levels = [...new Set(heads.map((h) => h.confidence ?? "no margin of error published"))];
  const bare = heads.some((h) => !h.confidence); // spec §5 rule 7
  return (
    <p className={styles.tractFine}>
      Ranges: {levels.join("; ")}.{bare && " Without published ranges, findings can't be separated from noise."}{causal && " Related doesn't mean one causes the other."} Caveats: {heads.map((h) => <a key={h.code} href={`/d/${h.code}`}> {h.code}</a>)}
    </p>
  );
}
```

`RankCard({ r })`: `<div className={styles.reference} data-card="tract-rank">` → `<Head h={r.header} title={`${r.direction === "high" ? "Highest" : "Lowest"} ${r.header.column} · ${r.header.place} ${r.header.year}`} />`, a table with columns `#`, Tract, Neighborhood, the column name — rows `r.top` numbered 1–10, then `r.ties` rows with `#` "=" and the neighborhood suffixed " (within range of #10)" in `styles.tractTie`, then `r.unreliable` rows with "unreliable: range too wide"; the `data-tract-map` slot; `<Fine heads={[r.header]} />`.

`ChangeCard({ r })`: header line plus `<p className={styles.tractCounts}>{r.increases} clear increases · {r.decreases} clear decreases · {r.none} no clear change</p>`; a table (Tract, Neighborhood, `r.from`, `r.to`, Change) of `r.changes` with change cells like `+15 (clear increase)`; the map slot; `<Fine heads={[r.header]} />`.

`RelateCard({ r })`:
- `const detail = useQuery(api.tracts.tractDetail, { key: r.key })`; points = `detail?.status === "ok" ? detail.points : []`; expired → `<p>This answer has expired; ask again.</p>` in place of the scatter.
- Title `${r.a.name} vs. ${r.b.name}`; both headers' meta lines.
- relate mode: `<p className={styles.tractVerdict}>{STRENGTH[r.strength]}</p>` and, unless too few, the sentence `{r.b.column} is {r.direction} where {r.a.column} is higher` plus `ρ = {r.rho.toFixed(2)}, {r.n} tracts`.
- mismatch mode: if `r.fits.length === 0` → `No tract clearly fits; {r.close.length} come close.`
- An SVG scatter (width 300, height 220, pad 24) from `scales(points, 300, 220, 24)`: every point a small grey dot; points with ranges get error bars (lines from lo to hi on each axis); `mark === "fits"` solid 4.5px dot, `mark === "close"` hollow ring; in mismatch mode dashed lines at `r.cutA` (vertical) and `r.cutB` (horizontal); axis captions `{r.a.column} ({r.a.code}) →` and `{r.b.column} ({r.b.code}) →`; `role="img"` with `aria-label` summarizing ("Scatter of N tracts; M clearly fit").
- The legend list (body size): solid dot "clearly fits (range clears both cutoffs)", ring "close, not clear", dot "other tracts".
- A table of `r.fits` then `r.close` (Tract, Neighborhood, A range, B range, label "clearly fits" / "close, not clear").
- The map slot; `<Fine heads={[r.a, r.b]} causal />`.

CSS (`ui/components/ask.module.css`) — reuse `.reference`, `.num`; add:

```css
.tractHead { font-family: var(--font-caps); font-weight: 700; text-transform: uppercase; font-size: var(--fs-label); margin: 0; }
.tractMeta, .tractFine, .tractCounts { font-size: var(--fs-small); margin: 4px 0 8px; }
.tractFine { border-top: var(--hair); padding-top: 8px; margin-top: 10px; }
.tractVerdict { font-family: var(--font-caps); font-weight: 700; text-transform: uppercase; font-size: var(--fs-label); margin: 6px 0 2px; }
.tractTie td { color: var(--muted); }
.tractUnreliable td { color: var(--muted); font-style: italic; }
.tractTable { width: 100%; border-collapse: collapse; font-size: var(--fs-small); font-variant-numeric: tabular-nums lining-nums; }
.tractTable th, .tractTable td { text-align: left; padding: 6px 8px 6px 0; border-bottom: var(--hair); }
```

Register in `AskCards` (same shape as `countRecords`'s): for each tool, `props.status !== "complete"` → `<Busy />`; parse; `!r` → `<Failed />`; `r.status !== "ok"` → `null` (the model handles refusals in words; `unavailable` → `<p className={styles.source}>DYCU&apos;s data didn&apos;t respond. Try again shortly.</p>`); else the card.

- [ ] **Step 4: e2e** — in `e2e/ask.spec.ts`'s signed-in block (these call the real DYCU FeatureServer through dev Convex; skip when DYCU is unreachable):

```ts
  const dycuUp = (page: import("@playwright/test").Page) =>
    page.request.get("https://services.arcgis.com/").then((r) => r.status() < 500).catch(() => false);

  test("a ranking question draws a ranked tract table with ranges", async ({ page }) => {
    test.skip(!(await dycuUp(page)), "DYCU unreachable");
    await ask(page, "rank tracts by poverty");
    const card = page.locator("[data-card=tract-rank]");
    await expect(card.locator("tbody tr").first()).toBeVisible({ timeout: 60_000 });
    await expect(card).toContainText("pov_rate");
    await expect(card).toContainText("90% confidence (Census)");
  });

  test("a mismatch question draws the scatter and names what clearly fits or says none does", async ({ page }) => {
    test.skip(!(await dycuUp(page)), "DYCU unreachable");
    await ask(page, "food insecurity low despite high poverty");
    const card = page.locator("[data-card=tract-relate]");
    await expect(card.locator("svg[role=img]")).toBeVisible({ timeout: 60_000 });
    await expect(card).toContainText(/clearly fits|No tract clearly fits/);
    await expect(card).toContainText("Related doesn't mean one causes the other.");
  });
```

(`RelateCard` root: `data-card="tract-relate"`; `ChangeCard`: `data-card="tract-change"`.)

- [ ] **Step 5: Run** — unit, `npx tsc --noEmit -p .`, `npm run build`, `e2e/ask.spec.ts` on both projects (`--workers=1`; dev server `npx next dev -p 3200`; dev Convex). Screenshot the relate card (phone + laptop) into the scratchpad and compare with the mockup.

- [ ] **Step 6: Commit**

```bash
git add ui/lib/tractScatter.ts ui/components/TractCards.tsx ui/components/AskCards.tsx ui/components/ask.module.css tests/ui/tractScatter.test.ts e2e/ask.spec.ts
git commit -m "feat: Ask's tract cards — ranked table, clear changes, relationship scatter with mismatches"
```

---

### Task 7: Tract shapes on the map

**Files:**
- Create: `ui/lib/tractShapes.ts`
- Modify: `ui/components/CityMap.tsx`, `ui/components/CityMapLoader.tsx` (pass-through props), `ui/components/TractCards.tsx` (fill the map slots)
- Test: `tests/ui/tractShapes.test.ts`

**Interfaces:**
- Consumes: `highlighted`, `closeIds`, `header.url` from Tasks 3–4.
- Produces: `tractShapesUrl(featureServerUrl: string, geoids: string[]): string | null`; `CityMap` prop `tracts?: { url: string; fits: string[]; close: string[] } | null`.

- [ ] **Step 1: Failing test** — `tests/ui/tractShapes.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { tractShapesUrl } from "../../ui/lib/tractShapes";

describe("tract shapes", () => {
  it("asks for just those tracts as GeoJSON in map coordinates", () => {
    expect(tractShapesUrl("https://x/FeatureServer/0", ["55079186000", "55079030300"])).toBe(
      "https://x/FeatureServer/0/query?where=" + encodeURIComponent("GEOID IN ('55079186000','55079030300')") + "&outFields=GEOID&outSR=4326&f=geojson",
    );
  });
  it("refuses anything that isn't an 11-digit tract id, and an empty list", () => {
    expect(tractShapesUrl("https://x/FeatureServer/0", ["55079186000", "1' OR '1'='1"])).toBeNull();
    expect(tractShapesUrl("https://x/FeatureServer/0", [])).toBeNull();
  });
});
```

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement** — `ui/lib/tractShapes.ts`:

```ts
// The highlighted tracts' outlines from the dataset's own FeatureServer. Ids are checked before they go in the
// where clause: only 11-digit tract ids, so nothing else can be injected into DYCU's query.
export function tractShapesUrl(featureServerUrl: string, geoids: string[]): string | null {
  if (!geoids.length || geoids.some((g) => !/^\d{11}$/.test(g))) return null;
  const where = `GEOID IN (${geoids.map((g) => `'${g}'`).join(",")})`;
  return `${featureServerUrl}/query?where=${encodeURIComponent(where)}&outFields=GEOID&outSR=4326&f=geojson`;
}
```

`CityMap.tsx` — a new effect, modeled on the existing City-layer effect (abort on cleanup, re-add after a style swap via the existing `loaded`/`style.load` pattern, `popup` cleanup), that when `tracts` is set:
1. fetches `tractShapesUrl(tracts.url, [...tracts.fits, ...tracts.close])` once (AbortController; failure → `setLayerNote("Tract map unavailable.")`);
2. adds source `tracts` (GeoJSON) and layers: `tracts-fit` (`fill`, `fill-pattern: "hatch"`, filter `["in", ["get", "GEOID"], ["literal", tracts.fits]]`), `tracts-line` (`line`, ink, 1.5px, all features);
3. fits the map to the features' bounds (padding 24);
4. removes the layers/source and aborts in cleanup.
The summary/aria-label for a tract map: `Map of ${fits.length} highlighted tracts` (+ `, ${close.length} close`).
Keep `role="group"` and the existing day/night handling; add the tract ids to the effect's dependencies by value (`tracts.fits.join(",")`) so a re-render doesn't refetch.

`TractCards.tsx` — fill each `data-tract-map` slot with `<CityMapLoader tracts={{ url: header.url, fits: r.highlighted, close: r.closeIds ?? [] }} height={220} />` (relate: `url: r.a.url`). Skip the map when `highlighted` is empty.

- [ ] **Step 4: Run** — unit, tsc, build; screenshot a relate and a rank card with the map (day + night) and check the hatched tracts sit inside Milwaukee; e2e `ask.spec.ts` tract tests also assert `[data-card=tract-rank] [data-map]` is visible.

- [ ] **Step 5: Commit**

```bash
git add ui/lib/tractShapes.ts tests/ui/tractShapes.test.ts ui/components/CityMap.tsx ui/components/CityMapLoader.tsx ui/components/TractCards.tsx e2e/ask.spec.ts
git commit -m "feat: highlighted tracts hatched on the map, shapes from the dataset's own service"
```

---

### Task 8: Report card, guide, docs, verification

**Files:**
- Modify: `scripts/ask-questions.ts`, `lib/ask/examples.ts`, `DESIGN.md`, `docs/LEARNING-LOG.md`
- Create: `docs/decisions/027-ask-analyzes.md`

- [ ] **Step 1: Report card questions** — append to `ASK_QUESTIONS`:

```ts
  { q: "Where is food insecurity low despite high poverty?", tool: "relateTracts", expect: { code: "E02", column: "pov_rate", mode: "mismatch" }, final: true },
  { q: "Which census tracts have the highest poverty rate?", tool: "rankTracts", expect: { code: "E02", column: "pov_rate" }, final: true },
  { q: "Where did poverty grow most from 2022 to 2023?", tool: "compareYears", expect: { code: "E02", column: "pov_rate" }, final: true },
  { q: "Is asthma higher where poverty is higher?", tool: "relateTracts", expect: { mode: "relate" }, final: true },
```

(`expect` values must appear in the tool's JSON output: `rankTracts`/`compareYears` carry them in `header`; `relateTracts` carries `a.code`, `a.column` and `mode`.)

- [ ] **Step 2: Guide examples** — add to `ASK_EXAMPLES` one per role: journalist "Where is food insecurity low despite high poverty?" (`relateTracts`, `{ mode: "mismatch" }`), nonprofit "Which census tracts have the highest poverty rate?" (`rankTracts`, `{ code: "E02" }`), citizen "Is asthma higher where poverty is higher?" (`relateTracts`, `{ mode: "relate" }`).

- [ ] **Step 3: Decision 027** — `docs/decisions/027-ask-analyzes.md` in the house format (plain English; define "census tract", "margin of error", "Spearman" on first use; "What actually happened" blank): Decision (Ask ranks, compares years and lines up DYCU tract datasets, numbers on cards, honesty rules in server code); Why (the "low food insecurity despite high poverty" question Ask couldn't answer); Options (A live fetch + cache, chosen; B copy on the Monday build; C browser math); What we chose and why (Tarik's calls 2026-10-10: all four question types, Ask picks the column, tract level, approach A); What we gave up (tract-level only, many tracts unnamed until City-boundary naming, 90%/95% confidence mixed and labeled, depends on DYCU's server being up); How we'll know (the four report-card questions pass; no reader reports a tract finding that the ranges don't support).

- [ ] **Step 4: DESIGN.md** — an "Analysis cards" section: the three cards as built (header line with column, kind, place/year, tracts; ranked table with ties and unreliable rows; counts line for change; verdict in caps, scatter with solid / ring / grey dots and dashed thirds; tract map hatched/outlined with the pencil boundary; footer with confidence levels, caveats, causation line), and the rule that no color scale is ever used.

- [ ] **Step 5: Learning log** — dated "Suggested entries (for Tarik to write in his own words)": expected curated dataset pairs → 32 of 46 DYCU datasets share tract ids, so a general tool was cheaper; expected tract ids to differ between DYCU's tables and its report definitions → one formula connects them.

- [ ] **Step 6: Full verification** — `npx vitest run --maxWorkers=2`, `npx tsc --noEmit -p .`, `npx tsc --noEmit -p convex`, `npm run build`, `npx convex dev --once` (dev only), full e2e on both projects (`--workers=2`; rerun failures `--last-failed --workers=1`; report both runs). Report card: `npm run ask:card -- --only=<the four new question numbers> --cap=1 --verbose` (≈ $0.30); report each PASS/MISS and any shape warnings.

- [ ] **Step 7: Commit** — docs and question files. No push, PR or deploy.
