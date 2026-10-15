# ZIP Health from Health Compass Milwaukee — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ask answers health, food and poverty "where" questions by ZIP code from a weekly stored copy of Health Compass Milwaukee. Each answer comes as a card that:
- leads with a code-written answer sentence;
- shows 95% ranges;
- names each ZIP's City neighborhoods;
- keeps Health Compass's source and credit attached everywhere.

**Architecture:**
- **Pure modules** in `convex/lib/`:
  - `healthCompass.ts` parses and picks Health Compass's API data;
  - `healthMath.ts` holds ranges, verdicts, ranking, "go together", "low despite high" and topic matching;
  - `healthAnswer.ts` builds one answer from stored data;
  - `zipPlaces.ts` reads the ZIP outlines.
- **`convex/health.ts`** stores the weekly copy (`refreshHealth`) and serves the public `zipHealth` query.
- **The weekly build** also stores each ZIP's City neighborhoods.
- **Ask's new `zipHealth` tool** draws `ZipHealthCard`. Its words and export come from `ui/lib/zipHealthText.ts`.

**Tech Stack:** Convex (internalAction, internalMutation, query, convex-test), Zod, Next.js 16 / React 19, CopilotKit `useRenderTool`, Vitest (edge-runtime, no DOM), Playwright.

**Spec:** `docs/superpowers/specs/2026-10-15-zip-health-design.md`

## Global Constraints

- **Credit on every figure, wherever it travels** (card, CSV, copied text, PNG, share page):
  - "Health Compass Milwaukee (Milwaukee Health Care Partnership), powered by Metopio";
  - the topic's original source and dataset text, verbatim, when it has any;
  - the period;
  - `https://healthcompassmilwaukee.org/topics/<key>`.
- **Stored:** the whole population only (`p === ""`), and one period per topic and place: the newest end year, then the longer span.
- **Places:** the 37 ZIPs in `COUNTY_ZIPS` (`convex/lib/zips.ts`), Milwaukee County (`layer=county&geography=55079`) and the City of Milwaukee (`layer=place&geography=5553000`).
- **Ranges:** `value ± 1.96 × se` (95%). No `se` means "no range published", never "clear". `se / |value| > 0.4` means "too uncertain to say".
- **Mismatch cutoffs:**
  - the asked-about measure (`measure`) is compared with Milwaukee County's figure: "clear" when its whole range is past it;
  - the condition (`other`) uses the third of ZIPs: top third for "high", bottom third for "low";
  - "clear" when its whole range is past the cut.
- **Requests to Health Compass:** one per place, 1 second apart, with `User-Agent: CreamCityAlmanac/1.0 (+https://www.creamcityalmanac.app)`.
- **The AI never writes a number.** Every figure and every lead sentence is written by code.
- **Topic matching** is done by code from the AI's words; the AI never handles topic keys.
- **Permissions:**
  - a dev Convex push and a dev data run each need Tarik's explicit OK (Task 8);
  - prod data jobs are Tarik's;
  - never stage `.superpowers/` or `clerk-creamcityalmanac.app.zone`.
- **Commit trailer:** `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- **Decision 050:** "What actually happened" stays blank.

## Rulings already made against the spec

- **The spec's `relate` mode becomes two modes, `together` and `mismatch`.** The AI's arguments are clearer that way, and the grader checks `mode`. Cost if wrong: renaming one enum.
- **The map is drawn the tract map's way,** with clear matches hatched and possible ones outlined on ZIP outlines, rather than every ZIP "shaded by the figure". It reuses `CityMap` unchanged except for a "ZIP" noun. Cost if wrong: a later choropleth.
- **"Too uncertain" uses the spec's rule,** a standard error over 40% of the value, through its own `tooUncertain`. The tract helper `isUnreliable` measures a 95% half-width for CDC data, which would wrongly set 53208's survey figure aside.
- **Health Compass's survey topics carry no source list** (MQ35's `datasets` is empty). Their credit is Health Compass, the period and the link.

## Review Focus

1. **Health Compass changes a field or its shape** (a value arrives as a string, `results` goes missing). The refresh fails loudly and keeps last week's copy. Pinned in Task 1 (the parser rejects a changed shape) and Task 3 (the copy is kept).
2. **A topic with no Milwaukee County figure.** `one` and `mismatch` refuse plainly instead of crashing or comparing with nothing. Pinned in Task 5.
3. **A ZIP figure with no standard error.** It is never "clear" and reads "no range published". Pinned in Task 2.
4. **Credit dropped on one export path.** CSV, text and the share snapshot all carry the credit, source text and link. Pinned in Task 6.
5. **The choose loop.** After "Pick one", the AI calls again with the exact topic name, and that must match on the first try. Pinned in Task 2 (an exact name gives `ok`).

---

### Task 1: Reading Health Compass (pure) and real fixtures

**Files:**
- Create: `convex/lib/healthCompass.ts`, `tests/fixtures/healthCompass.ts`
- Test: `tests/lib/healthCompass.test.ts`

**Interfaces:**
- Produces (`convex/lib/healthCompass.ts`):

```ts
export const HC_API = "https://healthcompassmilwaukee.org/api/v1";
export const HC_SITE = "https://healthcompassmilwaukee.org";
export const HC_CREDIT = "Health Compass Milwaukee (Milwaukee Health Care Partnership), powered by Metopio";
export const HC_HEADERS: Record<string, string>;
export const COUNTY_GEO = "55079";
export const CITY_GEO = "5553000";
export type HealthLayer = "zip" | "county" | "place";
export type HealthTopic = { key: string; name: string; description: string; units: string; decimals: number; isCount: boolean; keywords: string; team: string | null; sources: string[] };
export type HealthFigure = { topic: string; period: string; value: number; se: number | null };
export type RawRow = { g: string; l: string; a: string; p: string; d: string; v: number | null; se?: number | null };
export const topicUrl: (key: string) => string;
export const placeUrl: (layer: HealthLayer, geo: string) => string;
export function parseTopicsPage(json: unknown): { next: string | null; topics: HealthTopic[] };
export function parseDataPage(json: unknown): RawRow[];
export function pickFigures(rows: RawRow[]): HealthFigure[];
export function creditLines(t: HealthTopic, period: string): string[];
```

- [ ] **Step 1: Write the fixtures** in `tests/fixtures/healthCompass.ts`. Both are real API data, captured 2026-10-15. Copy them as-is:
  - `HC_TOPICS_PAGE`: 8 topics (MQ35, FAI, MQ36, POV, PVA, ALI, WIHRA, AST), in the API's own shape;
  - `HC_ROWS`: POV 2020-2024 and MQ35 2024 for every county ZIP, plus the county.

  The executor regenerates both with the script in Step 1a and pastes the output verbatim:

  - [ ] **Step 1a:** Run:

```bash
mkdir -p /tmp/hc && cd /tmp/hc && B=https://healthcompassmilwaukee.org/api/v1 \
&& curl -s "$B/topics/?limit=500" > topics.json \
&& curl -s "$B/data/?topic=POV&population=&period=2020-2024" > pov.json \
&& curl -s "$B/data/?topic=MQ35&population=&period=2024" > mq35.json \
&& grep -oE '^  "5[0-9]{4}"' "$OLDPWD/convex/lib/zips.ts" | tr -d ' "' > zips.txt \
&& python3 - <<'EOF'
import json
zips=set(open("zips.txt").read().split())
t=json.load(open("topics.json")); res=t["results"] if isinstance(t,dict) else t
keep=["MQ35","FAI","MQ36","POV","PVA","ALI","WIHRA","AST"]
out=[{"key":x["key"],"name":x["name"],"description":x["description"],"units":x["units"],"format":x["format"],"is_count":x["is_count"],"keywords":x.get("keywords") or "","team":x.get("team"),"datasets":[{"source":d.get("source"),"notes":d.get("notes"),"dataset":{"name":(d.get("dataset") or {}).get("name")}} for d in (x.get("datasets") or [])]} for k in keep for x in res if x["key"]==k]
rows=[r for f in ("pov.json","mq35.json") for r in json.load(open(f))["results"] if (r["l"]=="zip" and r["g"] in zips) or (r["l"]=="county" and r["g"]=="55079")]
rows.sort(key=lambda r:(r["a"],r["l"],r["g"]))
fmt=lambda r: f'  {{ g: "{r["g"]}", l: "{r["l"]}", a: "{r["a"]}", p: "", d: "{r["d"]}", v: {round(r["v"],4)}, se: {"null" if r["se"] is None else round(r["se"],4)} }},'
print("// Real Health Compass Milwaukee data (whole population), captured from /api/v1/ (spec 2026-10-15-zip-health §8).")
print("export const HC_TOPICS_PAGE = { count: %d, next: null, previous: null, results: %s };" % (len(out), json.dumps(out, ensure_ascii=False, indent=2)))
print("// POV 2020-2024 and MQ35 2024 for every ZIP in COUNTY_ZIPS, plus Milwaukee County (55079).")
print("export const HC_ROWS = [\n" + "\n".join(fmt(r) for r in rows) + "\n];")
EOF
```

  Expected: about 120 lines of TypeScript, with 38 POV rows and 36 MQ35 rows (`53126` and `53295` have no MQ35). Paste it into `tests/fixtures/healthCompass.ts`.

- [ ] **Step 2: Write the failing test** in `tests/lib/healthCompass.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { creditLines, HC_CREDIT, parseDataPage, parseTopicsPage, pickFigures, placeUrl, topicUrl, type RawRow } from "../../convex/lib/healthCompass";
import { HC_ROWS, HC_TOPICS_PAGE } from "../fixtures/healthCompass";

describe("reading Health Compass", () => {
  it("reads topics into what Ask stores, keeping their words and sources", () => {
    const { next, topics } = parseTopicsPage(HC_TOPICS_PAGE);
    expect(next).toBeNull();
    const mq35 = topics.find((t) => t.key === "MQ35")!;
    expect(mq35.description).toBe("In the last 12 months, did you ever eat less than you felt you should because there wasn’t enough money for food? % who answered yes");
    expect(mq35).toMatchObject({ units: "% of residents", decimals: 2, isCount: false, team: "milwaukee-health-partnership", sources: [] });
    expect(topics.find((t) => t.key === "POV")!.sources).toEqual(["U.S. Census Bureau · American Community Survey (ACS) · Table B17001"]);
  });
  it("refuses a changed shape instead of storing it (review focus 1)", () => {
    expect(() => parseTopicsPage({ results: [{ key: "X" }] })).toThrow(/topics changed shape/);
    expect(() => parseDataPage({ count: 1 })).toThrow(/figures changed shape/);
    expect(() => parseDataPage({ results: [{ g: "53208", l: "zip", a: "POV", p: "", d: "2024", v: "9.7" }] })).toThrow(/figures changed shape/);
  });
  it("keeps the whole population and one period per topic: newest end year, then the longer span", () => {
    const rows: RawRow[] = [
      { g: "53208", l: "zip", a: "POV", p: "", d: "2019-2023", v: 25, se: 2 },
      { g: "53208", l: "zip", a: "POV", p: "", d: "2020-2024", v: 21.6, se: 2.2 },
      { g: "53208", l: "zip", a: "POV", p: "B", d: "2020-2024", v: 30, se: 3 },
      { g: "53208", l: "zip", a: "X", p: "", d: "2024", v: 1, se: null },
      { g: "53208", l: "zip", a: "X", p: "", d: "2020-2024", v: 2, se: 0.5 },
      { g: "53208", l: "zip", a: "Y", p: "", d: "2024", v: null, se: null },
      { g: "53208", l: "zip", a: "Z", p: "", d: "FY24", v: 3, se: null },
    ];
    expect(pickFigures(rows)).toEqual([
      { topic: "POV", period: "2020-2024", value: 21.6, se: 2.2 },
      { topic: "X", period: "2020-2024", value: 2, se: 0.5 },
    ]);
  });
  it("reads the real fixture", () => {
    const figs = pickFigures(parseDataPage({ results: HC_ROWS.filter((r) => r.g === "53208") }));
    expect(figs.map((f) => f.topic)).toEqual(["MQ35", "POV"]);
    expect(figs[0]).toMatchObject({ period: "2024", value: 9.7087 });
  });
  it("credits Health Compass, the source and the period, with the topic's link", () => {
    const { topics } = parseTopicsPage(HC_TOPICS_PAGE);
    const pov = topics.find((t) => t.key === "POV")!;
    expect(creditLines(pov, "2020-2024")).toEqual([
      HC_CREDIT,
      "Source: U.S. Census Bureau · American Community Survey (ACS) · Table B17001",
      "Period: 2020-2024",
      "https://healthcompassmilwaukee.org/topics/POV",
    ]);
    expect(creditLines(topics.find((t) => t.key === "MQ35")!, "2024")).toEqual([HC_CREDIT, "Period: 2024", "https://healthcompassmilwaukee.org/topics/MQ35"]);
    expect(topicUrl("MQ35")).toBe("https://healthcompassmilwaukee.org/topics/MQ35");
    expect(placeUrl("zip", "53208")).toBe("https://healthcompassmilwaukee.org/api/v1/data/?layer=zip&geography=53208");
  });
});
```

(`9.7087` is the fixture's own rounding of 53208's value. If the regenerated fixture differs in the 4th decimal, use the fixture's value.)

- [ ] **Step 3: Run it to watch it fail**

Run: `npx vitest run tests/lib/healthCompass.test.ts`
Expected: FAIL, because the module doesn't exist.

- [ ] **Step 4: Write `convex/lib/healthCompass.ts`**

```ts
import { z } from "zod";

// Health Compass Milwaukee (healthcompassmilwaukee.org), the Milwaukee Health Care Partnership's data site, powered by
// Metopio (spec 2026-10-15-zip-health §3). Pure: reading its API, picking one figure per topic, and the credit line every
// figure carries (§6).
export const HC_API = "https://healthcompassmilwaukee.org/api/v1";
export const HC_SITE = "https://healthcompassmilwaukee.org";
export const HC_CREDIT = "Health Compass Milwaukee (Milwaukee Health Care Partnership), powered by Metopio";
export const HC_HEADERS: Record<string, string> = { "User-Agent": "CreamCityAlmanac/1.0 (+https://www.creamcityalmanac.app)" };
export const COUNTY_GEO = "55079";
export const CITY_GEO = "5553000";

export type HealthLayer = "zip" | "county" | "place";
export type HealthTopic = { key: string; name: string; description: string; units: string; decimals: number; isCount: boolean; keywords: string; team: string | null; sources: string[] };
export type HealthFigure = { topic: string; period: string; value: number; se: number | null };
export type RawRow = { g: string; l: string; a: string; p: string; d: string; v: number | null; se?: number | null };

export const topicUrl = (key: string) => `${HC_SITE}/topics/${encodeURIComponent(key)}`;
export const placeUrl = (layer: HealthLayer, geo: string) => `${HC_API}/data/?layer=${layer}&geography=${encodeURIComponent(geo)}`;

const Dataset = z.object({ source: z.string().nullish(), notes: z.string().nullish(), dataset: z.object({ name: z.string().nullish() }).passthrough().nullish() }).passthrough();
const Topic = z.object({
  key: z.string().min(1), name: z.string().min(1), description: z.string().nullish(), units: z.string().nullish(), format: z.string().nullish(),
  is_count: z.boolean().nullish(), keywords: z.string().nullish(), team: z.string().nullish(), datasets: z.array(Dataset).nullish(),
}).passthrough();
const TopicsPage = z.object({ next: z.string().nullish(), results: z.array(Topic) }).passthrough();
const Row = z.object({ g: z.string(), l: z.string(), a: z.string(), p: z.string(), d: z.string(), v: z.number().nullable(), se: z.number().nullish() }).passthrough();
const DataPage = z.object({ results: z.array(Row) }).passthrough();

const clean = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
const decimalsOf = (format: string | null | undefined) => Number(/(\d+)\s+decimal/.exec(format ?? "")?.[1] ?? 0);

export function parseTopicsPage(json: unknown): { next: string | null; topics: HealthTopic[] } {
  const p = TopicsPage.safeParse(json);
  if (!p.success) throw new Error("Health Compass topics changed shape");
  const topics = p.data.results.map((t) => ({
    key: t.key, name: clean(t.name), description: clean(t.description), units: clean(t.units), decimals: decimalsOf(t.format),
    isCount: Boolean(t.is_count), keywords: clean(t.keywords), team: t.team ?? null,
    sources: [...new Set((t.datasets ?? []).map((d) => [clean(d.source), clean(d.dataset?.name), clean(d.notes)].filter(Boolean).join(" · ")).filter(Boolean))],
  }));
  return { next: p.data.next ?? null, topics };
}

export function parseDataPage(json: unknown): RawRow[] {
  const p = DataPage.safeParse(json);
  if (!p.success) throw new Error("Health Compass figures changed shape");
  return p.data.results.map(({ g, l, a, p: pop, d, v, se }) => ({ g, l, a, p: pop, d, v, se: se ?? null }));
}

const PERIOD = /^(\d{4})(?:-(\d{4}))?$/;
const end = (d: string) => Number(PERIOD.exec(d)![2] ?? PERIOD.exec(d)![1]);
const span = (d: string) => end(d) - Number(PERIOD.exec(d)![1]);

// One figure per topic for a place: the whole population, the newest end year, and on a tie the longer (steadier) span.
export function pickFigures(rows: RawRow[]): HealthFigure[] {
  const best = new Map<string, RawRow>();
  for (const r of rows) {
    if (r.p !== "" || r.v === null || !Number.isFinite(r.v) || !PERIOD.test(r.d)) continue;
    const b = best.get(r.a);
    if (!b || end(r.d) > end(b.d) || (end(r.d) === end(b.d) && span(r.d) > span(b.d))) best.set(r.a, r);
  }
  return [...best.values()].sort((x, y) => x.a.localeCompare(y.a)).map((r) => ({ topic: r.a, period: r.d, value: r.v as number, se: r.se ?? null }));
}

// The credit every Health Compass figure keeps, wherever it goes (spec §6). Sources are Health Compass's own words.
export const creditLines = (t: HealthTopic, period: string): string[] => [
  HC_CREDIT,
  ...(t.sources.length ? [`Source: ${t.sources.join("; ")}`] : []),
  `Period: ${period}`,
  topicUrl(t.key),
];
```

- [ ] **Step 5: Run the test**

Run: `npx vitest run tests/lib/healthCompass.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add convex/lib/healthCompass.ts tests/fixtures/healthCompass.ts tests/lib/healthCompass.test.ts
git commit -m "feat: read Health Compass Milwaukee topics and figures, one per topic, with their credit

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Health math and topic matching (pure)

**Files:**
- Create: `convex/lib/healthMath.ts`
- Test: `tests/lib/healthMath.test.ts`

**Interfaces:**
- Consumes: `HealthTopic`, `parseTopicsPage`, `parseDataPage`, `pickFigures` (Task 1); `quantile`, `spearman`, `relationship` (`convex/lib/tractStats.ts`).
- Produces:

```ts
export const Z95 = 1.96;
export type Fig = { value: number; se: number | null };
export type Verdict = "higher" | "lower" | "same" | "uncertain" | "no-range";
export type Strength = "too-few" | "little" | "weak" | "moderate" | "strong";
export const rangeOf: (f: Fig) => { lo: number; hi: number } | null;
export const tooUncertain: (f: Fig) => boolean;
export function versus(zip: Fig, bench: Fig): Verdict;
export function rankZips<T extends { a: Fig }>(lines: T[], direction: "high" | "low"): { rows: T[]; uncertain: T[] };
export function togetherZips<T extends { a: Fig; b?: Fig }>(pairs: T[]): { n: number; strength: Strength; direction: "higher" | "lower" };
export function mismatchZips<T extends { zip: string; a: Fig; b?: Fig }>(pairs: T[], side: "high" | "low", otherSide: "high" | "low", bench: number): { cut: number; n: number; fits: T[]; close: T[]; uncertain: string[] };
export type TopicMatch = { status: "ok"; topic: HealthTopic } | { status: "choose"; choices: { key: string; name: string }[] } | { status: "not-found" };
export function matchTopic(words: string, topics: HealthTopic[]): TopicMatch;
```

- [ ] **Step 1: Write the failing test** in `tests/lib/healthMath.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseDataPage, parseTopicsPage, pickFigures } from "../../convex/lib/healthCompass";
import { matchTopic, mismatchZips, rangeOf, rankZips, togetherZips, tooUncertain, versus, type Fig } from "../../convex/lib/healthMath";
import { HC_ROWS, HC_TOPICS_PAGE } from "../fixtures/healthCompass";

const topics = parseTopicsPage(HC_TOPICS_PAGE).topics;
const fig = (geo: string, key: string): Fig | null => pickFigures(parseDataPage({ results: HC_ROWS.filter((r) => r.g === geo) })).find((f) => f.topic === key) ?? null;
const zips = [...new Set(HC_ROWS.filter((r) => r.l === "zip").map((r) => r.g))].sort();
const pairs = zips.flatMap((zip) => { const a = fig(zip, "MQ35"); const b = fig(zip, "POV"); return a && b ? [{ zip, a, b }] : []; });

describe("ranges and verdicts", () => {
  it("is ± 1.96 standard errors, or none without one (review focus 3)", () => {
    expect(rangeOf({ value: 10, se: 1 })).toEqual({ lo: 8.04, hi: 11.96 });
    expect(rangeOf({ value: 10, se: null })).toBeNull();
  });
  it("is too uncertain past a standard error of 40% of the value", () => {
    expect(tooUncertain({ value: 10, se: 4 })).toBe(false);
    expect(tooUncertain({ value: 10, se: 4.1 })).toBe(true);
    expect(tooUncertain({ value: 10, se: null })).toBe(false);
  });
  it("compares a ZIP with the county by its whole range", () => {
    const county = { value: 13.85, se: 0.47 };
    expect(versus({ value: 5, se: 1 }, county)).toBe("lower");
    expect(versus({ value: 25, se: 2 }, county)).toBe("higher");
    expect(versus({ value: 9.71, se: 2.24 }, county)).toBe("same");
    expect(versus({ value: 5, se: null }, county)).toBe("no-range");
    expect(versus({ value: 5, se: 3 }, county)).toBe("uncertain");
  });
});

describe("ZIPs on real Health Compass figures", () => {
  it("finds no clear 'low food insecurity despite high poverty' ZIP, and 53208 as the only possible one", () => {
    const county = fig("55079", "MQ35")!;
    const r = mismatchZips(pairs, "low", "high", county.value);
    expect(pairs).toHaveLength(35);
    expect(r.uncertain).toEqual(["53203"]);
    expect(r.n).toBe(34);
    expect(r.fits).toEqual([]);
    expect(r.close.map((p) => p.zip)).toEqual(["53208"]);
    expect(r.cut).toBeCloseTo(21.63, 1);
  });
  it("never calls a ZIP with no range clear", () => {
    const r = mismatchZips([{ zip: "1", a: { value: 1, se: null }, b: { value: 99, se: null } }, ...pairs], "low", "high", 13.85);
    expect(r.fits.map((p) => p.zip)).not.toContain("1");
  });
  it("ranks ZIPs, setting the too-uncertain aside", () => {
    const lines = pairs.map(({ zip, a }) => ({ zip, a }));
    const { rows, uncertain } = rankZips(lines, "high");
    expect(rows.slice(0, 3).map((l) => l.zip)).toEqual(["53205", "53218", "53235"]);
    expect(uncertain.map((l) => l.zip)).toEqual(["53203"]);
  });
  it("says whether two measures go together across ZIPs", () => {
    const t = togetherZips(pairs);
    expect(t.n).toBe(34);
    expect(t.direction).toBe("higher");
    expect(["moderate", "strong"]).toContain(t.strength);
  });
});

describe("topic matching", () => {
  it("matches plain words to one topic when one clearly fits", () => {
    expect(matchTopic("poverty", topics)).toMatchObject({ status: "ok", topic: { key: "POV" } });
    expect(matchTopic("asthma emergency visits", topics)).toMatchObject({ status: "ok", topic: { key: "WIHRA" } });
  });
  it("offers choices when several fit, survey first among equals", () => {
    const m = matchTopic("food insecurity", topics);
    expect(m.status).toBe("choose");
    expect(m.status === "choose" && m.choices.map((c) => c.key).slice(0, 2).sort()).toEqual(["FAI", "MQ35"]);
  });
  it("takes an exact name or key on the first try (review focus 5)", () => {
    expect(matchTopic("Food Insecurity (2024 Food Insecurity)", topics)).toMatchObject({ status: "ok", topic: { key: "MQ35" } });
    expect(matchTopic("mq35", topics)).toMatchObject({ status: "ok", topic: { key: "MQ35" } });
  });
  it("finds nothing for words no topic uses", () => {
    expect(matchTopic("zebra stripes", topics)).toEqual({ status: "not-found" });
    expect(matchTopic("the rate", topics)).toEqual({ status: "not-found" });
  });
});
```

The real-fixture checks pin the spec's 53208 result (§8). If the regenerated fixture changes which ZIPs come out (Health Compass updated its data), the spec's claim needs Tarik's review. **Stop and ask; don't edit the expectations to match.**

- [ ] **Step 2: Run it to watch it fail**

Run: `npx vitest run tests/lib/healthMath.test.ts`
Expected: FAIL, because the module doesn't exist.

- [ ] **Step 3: Write `convex/lib/healthMath.ts`**

```ts
import type { HealthTopic } from "./healthCompass";
import { quantile, relationship, spearman } from "./tractStats";

// ZIP health's numbers (spec 2026-10-15-zip-health §4): 95% ranges from Health Compass's standard errors, verdicts against
// Milwaukee County, ranking, "go together", "low despite high", and matching a measure's plain words to a topic.
export const Z95 = 1.96;
export type Fig = { value: number; se: number | null };
export type Verdict = "higher" | "lower" | "same" | "uncertain" | "no-range";
export type Strength = "too-few" | "little" | "weak" | "moderate" | "strong";

export const rangeOf = (f: Fig) => (f.se === null ? null : { lo: f.value - Z95 * f.se, hi: f.value + Z95 * f.se });
export const tooUncertain = (f: Fig) => f.se !== null && (f.value === 0 ? f.se > 0 : f.se / Math.abs(f.value) > 0.4);

export function versus(zip: Fig, bench: Fig): Verdict {
  const r = rangeOf(zip);
  if (!r) return "no-range";
  if (tooUncertain(zip)) return "uncertain";
  return r.lo > bench.value ? "higher" : r.hi < bench.value ? "lower" : "same";
}

export function rankZips<T extends { a: Fig }>(lines: T[], direction: "high" | "low") {
  const uncertain = lines.filter((l) => tooUncertain(l.a));
  const rows = lines.filter((l) => !tooUncertain(l.a)).sort((x, y) => (direction === "high" ? y.a.value - x.a.value : x.a.value - y.a.value));
  return { rows, uncertain };
}

const usable = <T extends { a: Fig; b?: Fig }>(p: T): p is T & { b: Fig } => !!p.b && !tooUncertain(p.a) && !tooUncertain(p.b);

export function togetherZips<T extends { a: Fig; b?: Fig }>(pairs: T[]): { n: number; strength: Strength; direction: "higher" | "lower" } {
  const ok = pairs.filter(usable);
  const rel = relationship(spearman(ok.map((p) => p.a.value), ok.map((p) => p.b.value)), ok.length);
  return { n: ok.length, strength: rel.strength, direction: rel.direction };
}

// "measure low (or high) despite other high (or low)": measure against the county's figure, other against its thirds.
// Clear means the whole range is past its line; close means only the figure is.
export function mismatchZips<T extends { zip: string; a: Fig; b?: Fig }>(pairs: T[], side: "high" | "low", otherSide: "high" | "low", bench: number) {
  const ok = pairs.filter(usable);
  const cut = quantile(ok.map((p) => p.b.value).sort((x, y) => x - y), otherSide === "high" ? 2 / 3 : 1 / 3);
  const onA = (f: Fig) => (side === "low" ? f.value < bench : f.value > bench);
  const onB = (f: Fig) => (otherSide === "high" ? f.value >= cut : f.value <= cut);
  const clearA = (f: Fig) => { const r = rangeOf(f); return !!r && (side === "low" ? r.hi < bench : r.lo > bench); };
  const clearB = (f: Fig) => { const r = rangeOf(f); return !!r && (otherSide === "high" ? r.lo >= cut : r.hi <= cut); };
  const margin = (p: T & { b: Fig }) => Math.min(side === "low" ? bench - p.a.value : p.a.value - bench, otherSide === "high" ? p.b.value - cut : cut - p.b.value);
  const order = (xs: (T & { b: Fig })[]) => [...xs].sort((x, y) => margin(y) - margin(x));
  const fits = ok.filter((p) => clearA(p.a) && clearB(p.b));
  const close = ok.filter((p) => !fits.includes(p) && onA(p.a) && onB(p.b));
  return { cut, n: ok.length, fits: order(fits) as T[], close: order(close) as T[], uncertain: pairs.filter((p) => p.b && !usable(p)).map((p) => p.zip) };
}

// Words that say what kind of figure, not which one; "visits" and "visit" count as the same word.
const STOP = new Set(["the", "a", "an", "of", "in", "and", "or", "for", "to", "with", "by", "on", "rate", "rates", "percent", "share", "number", "how", "many", "much", "zip", "zips", "code", "codes", "where", "which", "is", "are", "low", "high", "most", "least"]);
const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean).map((w) => (w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w));
const core = (name: string) => new Set(words(name.replace(/\([^)]*\)/g, " ")).filter((w) => !STOP.has(w)));

export type TopicMatch = { status: "ok"; topic: HealthTopic } | { status: "choose"; choices: { key: string; name: string }[] } | { status: "not-found" };

// Code picks the topic, never the AI (spec §4): a name counts three, keywords and the description one; fewer extra name
// words wins a tie. One clear winner that covers every word answers; otherwise up to eight choices.
export function matchTopic(asked: string, topics: HealthTopic[]): TopicMatch {
  const exact = topics.find((t) => t.key.toLowerCase() === asked.trim().toLowerCase() || words(t.name).join(" ") === words(asked).join(" "));
  if (exact) return { status: "ok", topic: exact };
  const q = [...new Set(words(asked).filter((w) => !STOP.has(w)))];
  if (!q.length) return { status: "not-found" };
  const scored = topics.map((t) => {
    const name = core(t.name);
    const loose = new Set(words(`${t.name} ${t.keywords} ${t.description}`));
    const score = q.reduce((s, w) => s + (name.has(w) ? 3 : loose.has(w) ? 1 : 0), 0);
    const extra = [...name].filter((w) => !q.includes(w)).length;
    return { t, score, extra };
  }).filter((x) => x.score > 0).sort((x, y) => y.score - x.score || x.extra - y.extra || x.t.name.localeCompare(y.t.name));
  if (!scored.length) return { status: "not-found" };
  const [best, next] = scored;
  if (best.score === 3 * q.length && (!next || next.score < best.score || next.extra > best.extra)) return { status: "ok", topic: best.t };
  return { status: "choose", choices: scored.slice(0, 8).map(({ t }) => ({ key: t.key, name: t.name })) };
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/lib/healthMath.test.ts`
Expected: PASS (12 tests). If the 53208 or top-3 expectations fail, see the note after Step 1: stop and report. Don't change the expectations.

- [ ] **Step 5: Commit**

```bash
git add convex/lib/healthMath.ts tests/lib/healthMath.test.ts
git commit -m "feat: ZIP health math: 95% ranges, county verdicts, ranking, go-together, low-despite-high, topic matching

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: The weekly stored copy

**Files:**
- Modify: `convex/validators.ts`, `convex/schema.ts`, `convex/build.ts` (finish step), `tests/helpers/fakeFetch.ts`
- Create: `convex/health.ts` (refresh part), `convex/health.test.ts`

**Interfaces:**
- Consumes: Task 1 (`HC_API`, `HC_HEADERS`, `COUNTY_GEO`, `CITY_GEO`, `placeUrl`, `parseTopicsPage`, `parseDataPage`, `pickFigures`); `COUNTY_ZIPS`; `fetchWithTimeout` (`convex/lib/http.ts`).
- Produces:
  - **Tables:**
    - `healthTopics` (`vHealthTopic`, index `by_key`);
    - `healthPlaces` (`{ layer: vHealthLayer, geo, figures: vHealthFigure[] }`, index `by_geo`);
    - `healthRefresh` (`{ status: "read" | "failed", note?, at, places }`).
  - **Functions:** `internal.health.refreshHealth` (args `{ paceMs?: number }`, returns `string[]` notes; never throws), `internal.health.replaceHealth`, `internal.health.markHealthFailed`.

- [ ] **Step 1: Validators and schema.** In `convex/validators.ts`, append:

```ts
// Health Compass Milwaukee (spec 2026-10-15-zip-health §3.1).
export const vHealthLayer = v.union(v.literal("zip"), v.literal("county"), v.literal("place"));
export const vHealthTopic = v.object({ key: v.string(), name: v.string(), description: v.string(), units: v.string(), decimals: v.number(), isCount: v.boolean(), keywords: v.string(), team: v.union(v.string(), v.null()), sources: v.array(v.string()) });
export const vHealthFigure = v.object({ topic: v.string(), period: v.string(), value: v.number(), se: v.union(v.number(), v.null()) });
```

In `convex/schema.ts`:
- import `vHealthFigure, vHealthLayer, vHealthTopic` from `./validators`;
- add, after `fireRefresh`:

```ts
  // Health Compass Milwaukee's figures, one row per place (37 ZIPs, the county, the city), replaced weekly together.
  healthTopics: defineTable(vHealthTopic).index("by_key", ["key"]),
  healthPlaces: defineTable({ layer: vHealthLayer, geo: v.string(), figures: v.array(vHealthFigure) }).index("by_geo", ["geo"]),
  healthRefresh: defineTable({ status: v.union(v.literal("read"), v.literal("failed")), note: v.optional(v.string()), at: v.number(), places: v.number() }),
```

- [ ] **Step 2: Fake Health Compass in tests.** In `tests/helpers/fakeFetch.ts`:
  - add to `FakeOptions`:

```ts
  healthCompass?: (url: string) => unknown; // Health Compass Milwaukee's API (/api/v1/topics/, /api/v1/data/)
  healthStatus?: number;
```

  - add, before the final `return json(404, …)`:

```ts
    if (url.includes("healthcompassmilwaukee.org/api/v1")) return json(opts.healthStatus ?? 200, opts.healthCompass?.(url) ?? { results: [] });
```

- [ ] **Step 3: Write the failing test** in `convex/health.test.ts`:

```ts
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HC_ROWS, HC_TOPICS_PAGE } from "../tests/fixtures/healthCompass";
import { installFakeFetch } from "../tests/helpers/fakeFetch";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");
afterEach(() => vi.unstubAllGlobals());

// Health Compass, faked from the real fixture: topics, and each place's rows.
const hc = (url: string) => {
  if (url.includes("/topics/")) return HC_TOPICS_PAGE;
  const geo = new URL(url).searchParams.get("geography");
  return { count: 0, next: null, previous: null, results: HC_ROWS.filter((r) => r.g === geo) };
};

describe("refreshHealth", () => {
  it("stores one row per place and only topics with a ZIP figure", async () => {
    installFakeFetch({ healthCompass: hc });
    const t = convexTest(schema, modules);
    expect(await t.action(internal.health.refreshHealth, { paceMs: 0 })).toEqual([]);
    const places = await t.run((ctx) => ctx.db.query("healthPlaces").collect());
    expect(places).toHaveLength(39);
    expect(places.find((p) => p.geo === "53208")!.figures.find((f) => f.topic === "MQ35")).toMatchObject({ period: "2024", se: expect.any(Number) });
    expect((await t.run((ctx) => ctx.db.query("healthTopics").collect())).map((x) => x.key).sort()).toEqual(["MQ35", "POV"]);
    expect(await t.run((ctx) => ctx.db.query("healthRefresh").first())).toMatchObject({ status: "read", places: 39 });
  });
  it("keeps last week's copy and says why when Health Compass fails or changes shape (review focus 1)", async () => {
    installFakeFetch({ healthCompass: hc });
    const t = convexTest(schema, modules);
    await t.action(internal.health.refreshHealth, { paceMs: 0 });
    installFakeFetch({ healthCompass: (url) => (url.includes("/topics/") ? HC_TOPICS_PAGE : { results: [{ g: "53208", v: "9.7" }] }) });
    const notes = await t.action(internal.health.refreshHealth, { paceMs: 0 });
    expect(notes[0]).toMatch(/Health Compass refresh failed, kept last week's: Health Compass figures changed shape/);
    expect(await t.run((ctx) => ctx.db.query("healthPlaces").collect())).toHaveLength(39);
    expect(await t.run((ctx) => ctx.db.query("healthRefresh").first())).toMatchObject({ status: "failed", places: 39 });
  });
  it("stops at once when Health Compass lists no topics", async () => {
    const seen: string[] = [];
    installFakeFetch({ healthCompass: (url) => { seen.push(url); return { results: [] }; } });
    const t = convexTest(schema, modules);
    expect(await t.action(internal.health.refreshHealth, {})).toEqual(["Health Compass refresh failed, kept last week's: Health Compass listed no topics"]);
    expect(seen).toHaveLength(1);
  });
  it("retries a busy answer, then fails the run without storing", async () => {
    installFakeFetch({ healthCompass: hc, healthStatus: 429 });
    const t = convexTest(schema, modules);
    const notes = await t.action(internal.health.refreshHealth, { paceMs: 0 });
    expect(notes[0]).toMatch(/Health Compass request failed: 429/);
    expect(await t.run((ctx) => ctx.db.query("healthPlaces").collect())).toHaveLength(0);
  });
});
```

- [ ] **Step 4: Run it to watch it fail**

Run: `npx vitest run convex/health.test.ts`
Expected: FAIL. `internal.health` doesn't exist.

- [ ] **Step 5: Write `convex/health.ts`** (the refresh part; Task 5 adds the query):

```ts
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation } from "./_generated/server";
import { CITY_GEO, COUNTY_GEO, HC_API, HC_HEADERS, parseDataPage, parseTopicsPage, pickFigures, placeUrl, type HealthFigure, type HealthLayer, type HealthTopic } from "./lib/healthCompass";
import { fetchWithTimeout } from "./lib/http";
import { COUNTY_ZIPS } from "./lib/zips";
import { vHealthFigure, vHealthLayer, vHealthTopic } from "./validators";

// Health Compass Milwaukee, stored weekly (spec 2026-10-15-zip-health §3.1). One request per place, a second apart.
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const HC_TIMEOUT_MS = 30_000;
const RETRY_WAITS_MS = [2_000, 5_000];
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// A busy (429) or failing (5xx) answer is tried again after a pause; anything else fails at once.
async function getJson(url: string, waits: number[]): Promise<unknown> {
  for (let i = 0; ; i++) {
    const res = await fetchWithTimeout(url, { headers: HC_HEADERS }, HC_TIMEOUT_MS);
    if (res.ok) return res.json();
    if (i >= waits.length || !(res.status === 429 || res.status >= 500)) throw new Error(`Health Compass request failed: ${res.status}`);
    await sleep(waits[i]);
  }
}

export const replaceHealth = internalMutation({
  args: { topics: v.array(vHealthTopic), places: v.array(v.object({ layer: vHealthLayer, geo: v.string(), figures: v.array(vHealthFigure) })), at: v.number() },
  handler: async (ctx, { topics, places, at }) => {
    for (const r of await ctx.db.query("healthTopics").collect()) await ctx.db.delete(r._id);
    for (const r of await ctx.db.query("healthPlaces").collect()) await ctx.db.delete(r._id);
    for (const t of topics) await ctx.db.insert("healthTopics", t);
    for (const p of places) await ctx.db.insert("healthPlaces", p);
    const old = await ctx.db.query("healthRefresh").first();
    const row = { status: "read" as const, at, places: places.length };
    if (old) await ctx.db.replace(old._id, row);
    else await ctx.db.insert("healthRefresh", row);
  },
});

// A failed run keeps the stored copy and its date; only the status and the reason change.
export const markHealthFailed = internalMutation({
  args: { note: v.string() },
  handler: async (ctx, { note }) => {
    const old = await ctx.db.query("healthRefresh").first();
    const places = (await ctx.db.query("healthPlaces").collect()).length;
    if (old) await ctx.db.replace(old._id, { status: "failed", note, at: old.at, places });
    else await ctx.db.insert("healthRefresh", { status: "failed", note, at: 0, places });
  },
});

// Weekly (build.finish) or alone: `npx convex run health:refreshHealth`. Notes, never throws.
export const refreshHealth = internalAction({
  args: { paceMs: v.optional(v.number()) },
  handler: async (ctx, { paceMs = 1_000 }): Promise<string[]> => {
    const waits = paceMs === 0 ? [0, 0] : RETRY_WAITS_MS;
    try {
      const topics: HealthTopic[] = [];
      let url: string | null = `${HC_API}/topics/?limit=500`;
      for (let page = 0; url && page < 20; page++) {
        const p = parseTopicsPage(await getJson(url, waits));
        topics.push(...p.topics);
        url = p.next;
      }
      if (!topics.length) throw new Error("Health Compass listed no topics"); // before 39 paced place requests
      const targets: { layer: HealthLayer; geo: string }[] = [
        ...Object.keys(COUNTY_ZIPS).map((geo) => ({ layer: "zip" as const, geo })),
        { layer: "county", geo: COUNTY_GEO },
        { layer: "place", geo: CITY_GEO },
      ];
      const places: { layer: HealthLayer; geo: string; figures: HealthFigure[] }[] = [];
      for (const t of targets) {
        places.push({ ...t, figures: pickFigures(parseDataPage(await getJson(placeUrl(t.layer, t.geo), waits))) });
        await sleep(paceMs);
      }
      const onZips = new Set(places.filter((p) => p.layer === "zip").flatMap((p) => p.figures.map((f) => f.topic)));
      const kept = topics.filter((t) => onZips.has(t.key));
      if (!kept.length) throw new Error("no topic had a ZIP figure");
      const keys = new Set(kept.map((t) => t.key));
      await ctx.runMutation(internal.health.replaceHealth, { topics: kept, places: places.map((p) => ({ ...p, figures: p.figures.filter((f) => keys.has(f.topic)) })), at: Date.now() });
      return [];
    } catch (e) {
      await ctx.runMutation(internal.health.markHealthFailed, { note: message(e) });
      return [`Health Compass refresh failed, kept last week's: ${message(e)}`];
    }
  },
});
```

- [ ] **Step 6: Add it to the weekly build.** In `convex/build.ts`'s finish step, after the `fireNotes` block, add:

```ts
    let healthNotes: string[];
    try {
      healthNotes = await ctx.runAction(internal.health.refreshHealth, {});
    } catch (e) {
      healthNotes = [`Health Compass refresh failed: ${message(e)}`];
    }
```

Then add `...healthNotes` to the end of the `notes` array passed to `completeBuild`.

- [ ] **Step 7: Run the tests**

Run: `npx convex codegen 2>&1 | tail -2; npx vitest run convex/health.test.ts convex/build.test.ts`
Expected: PASS. If `npx convex codegen` needs a deployment, run `npx tsc --noEmit -p .` instead after the tests; `_generated/api.d.ts` is regenerated by `convex dev` in Task 8. `convex-test` reads modules from disk, so the tests pass either way.

Check whether `convex/build.test.ts` fakes every refresh's fetches: an unexpected Health Compass URL gets the fake's default `{ results: [] }`, which fails the refresh with a note, not the build. If a build test asserts on the exact notes list, add the note it now receives. **The fix goes in the test's expected notes, not the code:** a build with no Health Compass data must note it.

- [ ] **Step 8: Commit**

```bash
git add convex/validators.ts convex/schema.ts convex/health.ts convex/health.test.ts convex/build.ts tests/helpers/fakeFetch.ts
git commit -m "feat: store Health Compass figures weekly for county ZIPs, the county and the city; keep last week's on failure

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Each ZIP's City neighborhoods

**Files:**
- Create: `convex/lib/zipPlaces.ts`, `tests/lib/zipPlaces.test.ts`
- Modify: `convex/schema.ts` (`zipNeighborhoods`), `convex/buildStore.ts` (`replaceZipNeighborhoods`), `convex/build.ts` (`refreshZipNeighborhoods` in `refreshNeighborhoods`), `tests/helpers/fakeFetch.ts`, `convex/neighborhoods.test.ts`

**Interfaces:**
- Consumes: `cityShares`, `Hood` (`convex/lib/tractPlaces.ts`); `COUNTY_ZIPS`; the City shapes `refreshNeighborhoods` already reads.
- Produces:
  - **Table:** `zipNeighborhoods` (`{ zip, city: { name, share }[] }`, index `by_zip`).
  - **`convex/lib/zipPlaces.ts`:** `ZCTA_LAYER` (string), `zctaUrl(zips: string[]): string`, `parseZipShapes(geojson: unknown): { zip: string; geometry: Geometry }[]`.

- [ ] **Step 1: Write the failing test** in `tests/lib/zipPlaces.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { cityShares } from "../../convex/lib/tractPlaces";
import { parseZipShapes, ZCTA_LAYER, zctaUrl } from "../../convex/lib/zipPlaces";

const square = (x0: number, y0: number, x1: number, y1: number) => ({ type: "Polygon" as const, coordinates: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]] });

describe("ZIP outlines", () => {
  it("asks TIGERweb for the ZIPs by GEOID, ignoring anything that isn't a ZIP", () => {
    expect(zctaUrl(["53208", "53228", "x' OR '1'='1"])).toBe(`${ZCTA_LAYER}/query?where=${encodeURIComponent("GEOID IN ('53208','53228')")}&outFields=GEOID&outSR=4326&f=geojson`);
  });
  it("reads ZIP outlines and refuses a truncated answer", () => {
    const fc = { type: "FeatureCollection", features: [{ properties: { GEOID: "53208" }, geometry: square(0, 0, 1, 1) }, { properties: { GEOID: "bad" }, geometry: square(0, 0, 1, 1) }] };
    expect(parseZipShapes(fc).map((z) => z.zip)).toEqual(["53208"]);
    expect(() => parseZipShapes({ ...fc, exceededTransferLimit: true })).toThrow(/truncated/);
    expect(() => parseZipShapes({})).toThrow(/no features/);
  });
  it("names the City neighborhoods covering a ZIP, biggest first", () => {
    const zip = square(0, 0, 2, 1);
    const hoods = [
      { name: "West", geometry: square(0, 0, 1.5, 1), bbox: { minLon: 0, minLat: 0, maxLon: 1.5, maxLat: 1 } },
      { name: "East", geometry: square(1.5, 0, 2, 1), bbox: { minLon: 1.5, minLat: 0, maxLon: 2, maxLat: 1 } },
    ];
    expect(cityShares(zip, hoods).map((s) => s.name)).toEqual(["West", "East"]);
  });
});
```

- [ ] **Step 2: Run it to watch it fail**

Run: `npx vitest run tests/lib/zipPlaces.test.ts`
Expected: FAIL, because the module doesn't exist.

- [ ] **Step 3: Write `convex/lib/zipPlaces.ts`**

```ts
import type { Geometry } from "./geo";

// The Census Bureau's ZIP (ZCTA) outlines from TIGERweb (public, no key), matched to the City's neighborhoods the same way
// tracts are (decision 031; spec 2026-10-15-zip-health §3.2). The map draws them from the same layer.
export const ZCTA_LAYER = "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_Current/MapServer/2";

export function zctaUrl(zips: string[]): string {
  const ids = zips.filter((z) => /^\d{5}$/.test(z));
  return `${ZCTA_LAYER}/query?where=${encodeURIComponent(`GEOID IN (${ids.map((z) => `'${z}'`).join(",")})`)}&outFields=GEOID&outSR=4326&f=geojson`;
}

type Feature = { properties?: { GEOID?: unknown } | null; geometry?: { type?: unknown; coordinates?: unknown } | null };

// A truncated answer is refused: a partial match would drop ZIPs without saying so.
export function parseZipShapes(geojson: unknown): { zip: string; geometry: Geometry }[] {
  const fc = geojson as { features?: Feature[]; exceededTransferLimit?: boolean; properties?: { exceededTransferLimit?: boolean } } | null;
  if (fc?.exceededTransferLimit || fc?.properties?.exceededTransferLimit) throw new Error("the ZIP outline list was truncated");
  if (!Array.isArray(fc?.features)) throw new Error("ZIP outlines returned no features");
  return fc.features.flatMap((f) => {
    const zip = String(f.properties?.GEOID ?? "");
    const g = f.geometry;
    if (!/^\d{5}$/.test(zip) || !g || (g.type !== "Polygon" && g.type !== "MultiPolygon") || !Array.isArray(g.coordinates)) return [];
    return [{ zip, geometry: { type: g.type, coordinates: g.coordinates } as Geometry }];
  });
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/lib/zipPlaces.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Store and refresh.**
  - **`convex/schema.ts`**, after `tractNeighborhoods`:

```ts
  // Each county ZIP's City neighborhoods (≥10% of its area, biggest first), matched weekly from TIGERweb's ZIP outlines.
  zipNeighborhoods: defineTable({ zip: v.string(), city: v.array(v.object({ name: v.string(), share: v.number() })) }).index("by_zip", ["zip"]),
```

  - **`convex/buildStore.ts`**, after `replaceTractNeighborhoods`:

```ts
export const replaceZipNeighborhoods = internalMutation({
  args: { rows: v.array(v.object({ zip: v.string(), city: v.array(v.object({ name: v.string(), share: v.number() })) })) },
  handler: async (ctx, { rows }) => {
    for (const r of await ctx.db.query("zipNeighborhoods").collect()) await ctx.db.delete(r._id);
    for (const r of rows) await ctx.db.insert("zipNeighborhoods", r);
  },
});
```

  - **`convex/build.ts`:**
    - import `parseZipShapes, zctaUrl` from `./lib/zipPlaces` and `COUNTY_ZIPS` from `./lib/zips` (if not already imported);
    - in `refreshNeighborhoods`, after `notes.push(...(await refreshTractNeighborhoods(ctx, hoods)));`, add `notes.push(...(await refreshZipNeighborhoods(ctx, hoods)));`;
    - add, after `refreshTractNeighborhoods`:

```ts
// Each county ZIP's City neighborhoods, from this run's City shapes and TIGERweb's ZIP outlines. Replaced only when both
// were read and at least one ZIP matched; the card falls back to the ZIP's main town.
async function refreshZipNeighborhoods(ctx: ActionCtx, hoods: Hood[] | null): Promise<string[]> {
  try {
    if (!hoods) throw new Error("the City's neighborhoods weren't read this week");
    const zips = parseZipShapes(await (await fetchOk(zctaUrl(Object.keys(COUNTY_ZIPS)), "ZIP outlines")).json());
    const rows = zips.map((z) => ({ zip: z.zip, city: cityShares(z.geometry, hoods) })).filter((r) => r.city.length > 0);
    if (rows.length === 0) throw new Error("no ZIP matched a City neighborhood");
    await ctx.runMutation(internal.buildStore.replaceZipNeighborhoods, { rows });
    return [];
  } catch (e) {
    return [`ZIP neighborhoods unavailable, kept last week's: ${message(e)}`];
  }
}
```

- [ ] **Step 6: Fake TIGERweb and test the refresh.**
  - **`tests/helpers/fakeFetch.ts`:** add to `FakeOptions`:

```ts
  zctaShapes?: unknown; // TIGERweb's ZIP outlines (f=geojson)
  zctaStatus?: number;
```

  - and, before the final 404:

```ts
    if (url.includes("tigerweb.geo.census.gov")) return json(opts.zctaStatus ?? 200, opts.zctaShapes ?? { type: "FeatureCollection", features: [] });
```

  - **`convex/neighborhoods.test.ts`** (where the `refreshNeighborhoods` tests live):
    - after `tractLayer`, add a ZIP outline on Harambee's square (100% Harambee):

```ts
const zipLayer = { type: "FeatureCollection", features: [{ properties: { GEOID: "53208" }, geometry: { type: "Polygon", coordinates: [ring] } }] };
```

    - add `zctaShapes: zipLayer` to **every** `installFakeFetch({...})` call inside `describe("refreshNeighborhoods", …)`. Four of those tests assert the exact notes list, and without ZIP outlines the new step adds a note they don't expect. For example, `installFakeFetch({ cityNeighborhoods: layer, tractShapes: tractLayer })` becomes `installFakeFetch({ cityNeighborhoods: layer, tractShapes: tractLayer, zctaShapes: zipLayer })`;
    - add, at the end of that describe:

```ts
  const zipRows = (t: Awaited<ReturnType<typeof seed>>) =>
    t.run(async (ctx) => (await ctx.db.query("zipNeighborhoods").collect()).map((r) => [r.zip, r.city]));

  it("names each ZIP's City neighborhoods", async () => {
    const t = await seed();
    installFakeFetch({ cityNeighborhoods: layer, tractShapes: tractLayer, zctaShapes: zipLayer });
    expect(await t.action(internal.build.refreshNeighborhoods, {})).toEqual([]);
    expect(await zipRows(t)).toEqual([["53208", [{ name: "Harambee", share: 100 }]]]);
  });
  it("keeps last week's ZIP neighborhoods when the outlines are down, and says so", async () => {
    const t = await seed();
    installFakeFetch({ cityNeighborhoods: layer, tractShapes: tractLayer, zctaShapes: zipLayer });
    await t.action(internal.build.refreshNeighborhoods, {});
    installFakeFetch({ cityNeighborhoods: layer, tractShapes: tractLayer, zctaStatus: 500 });
    const notes = await t.action(internal.build.refreshNeighborhoods, {});
    expect(notes).toEqual(["ZIP neighborhoods unavailable, kept last week's: ZIP outlines request failed: 500"]);
    expect(await zipRows(t)).toEqual([["53208", [{ name: "Harambee", share: 100 }]]]);
  });
```

- [ ] **Step 7: Run the tests**

Run: `npx vitest run tests/lib/zipPlaces.test.ts convex/neighborhoods.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add convex/lib/zipPlaces.ts tests/lib/zipPlaces.test.ts convex/schema.ts convex/buildStore.ts convex/build.ts convex/neighborhoods.test.ts tests/helpers/fakeFetch.ts
git commit -m "feat: name each county ZIP's City neighborhoods weekly from TIGERweb's ZIP outlines

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: The answer, the query, and Ask's tool

**Files:**
- Create: `convex/lib/healthAnswer.ts`, `tests/lib/healthAnswer.test.ts`
- Modify: `convex/health.ts` (`zipHealth` query), `convex/health.test.ts`, `lib/ask/tools.ts`, `lib/ask/backend.ts`, `lib/ask/prompt.ts`, `lib/ask/model.ts`, `tests/ui/askTools.test.ts`

**Interfaces:**
- Consumes: Tasks 1, 2 and 4 (`zipNeighborhoods`); `checkZip`, `COUNTY_ZIPS`.
- Produces (`convex/lib/healthAnswer.ts`):

```ts
export type HealthPlace = { layer: HealthLayer; geo: string; figures: HealthFigure[] };
export type HealthData = { topics: HealthTopic[]; places: HealthPlace[]; hoods: Record<string, string[]>; asOf: number | null };
export type HealthArgs = { mode: "one" | "rank" | "together" | "mismatch"; measure: string; zip?: string; direction?: "high" | "low"; side?: "high" | "low"; other?: string; otherSide?: "high" | "low" };
export type FigOut = { value: number; se: number | null; lo: number | null; hi: number | null; period: string };
export type ZipLine = { zip: string; places: string[]; town: string; a: FigOut; b?: FigOut; verdict?: Verdict };
export type HealthOk = …; // the four ok shapes below
export type HealthResult = HealthOk | …; // plus choose / not-found / bad-zip / outside / no-data / refused / unavailable
export function answer(a: HealthArgs, d: HealthData): HealthResult;
```

  - `zipHealth`: a public Convex query (args as `HealthArgs`), returns `HealthResult`;
  - `zipHealthParams` (Zod) and the `zipHealth` tool; `AskBackend.health`; `AskToolName` adds `"zipHealth"`;
  - `type ZipHealthAnswer = FunctionReturnType<typeof api.health.zipHealth>`.

- [ ] **Step 1: Write the failing test** in `tests/lib/healthAnswer.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseDataPage, parseTopicsPage, pickFigures } from "../../convex/lib/healthCompass";
import { answer, type HealthData } from "../../convex/lib/healthAnswer";
import { HC_ROWS, HC_TOPICS_PAGE } from "../fixtures/healthCompass";

const geos = [...new Set(HC_ROWS.map((r) => r.g))];
const data: HealthData = {
  topics: parseTopicsPage(HC_TOPICS_PAGE).topics,
  places: geos.map((geo) => ({ layer: geo === "55079" ? "county" : "zip", geo, figures: pickFigures(parseDataPage({ results: HC_ROWS.filter((r) => r.g === geo) })) })),
  hoods: { "53208": ["Washington Park", "Sherman Park"] },
  asOf: Date.UTC(2026, 9, 12),
};

describe("ZIP health answers", () => {
  it("answers 'low food insecurity despite high poverty' with 53208 possible, named by its neighborhoods", () => {
    const r = answer({ mode: "mismatch", measure: "Food Insecurity (2024 Food Insecurity)", side: "low", other: "Poverty rate", otherSide: "high" }, data);
    expect(r).toMatchObject({ status: "ok", mode: "mismatch", measure: { key: "MQ35" }, other: { key: "POV" }, fits: [], uncertain: ["53203"] });
    if (r.status !== "ok" || r.mode !== "mismatch") throw new Error("not a mismatch answer");
    expect(r.close[0]).toMatchObject({ zip: "53208", places: ["Washington Park", "Sherman Park"], town: "Milwaukee" });
    expect(r.county!.value).toBeCloseTo(13.85, 1);
  });
  it("compares one ZIP with the county", () => {
    const r = answer({ mode: "one", measure: "Food Insecurity (2024 Food Insecurity)", zip: "53208" }, data);
    expect(r).toMatchObject({ status: "ok", mode: "one", zip: { zip: "53208", verdict: "same" }, city: null });
  });
  it("ranks ZIPs and compares each with the county", () => {
    const r = answer({ mode: "rank", measure: "Food Insecurity (2024 Food Insecurity)" }, data);
    if (r.status !== "ok" || r.mode !== "rank") throw new Error("not a ranking");
    expect(r.rows[0]).toMatchObject({ zip: "53205", verdict: "higher" });
  });
  it("asks which measure when several fit, and says so when none does", () => {
    expect(answer({ mode: "rank", measure: "food insecurity" }, data)).toMatchObject({ status: "choose", which: "measure" });
    expect(answer({ mode: "mismatch", measure: "Poverty rate", other: "zebra" }, data)).toEqual({ status: "not-found", which: "other", words: "zebra" });
  });
  it("refuses plainly: no second measure, a ZIP outside the county, a ZIP with no figure, a measure with no county figure (review focus 2)", () => {
    expect(answer({ mode: "mismatch", measure: "Poverty rate" }, data)).toMatchObject({ status: "refused" });
    expect(answer({ mode: "one", measure: "Poverty rate", zip: "60601" }, data)).toEqual({ status: "outside", zip: "60601" });
    expect(answer({ mode: "one", measure: "Poverty rate", zip: "53x" }, data)).toMatchObject({ status: "bad-zip" });
    expect(answer({ mode: "one", measure: "Food Insecurity (2024 Food Insecurity)", zip: "53126" }, data)).toMatchObject({ status: "no-data", zip: "53126" });
    const noCounty = { ...data, places: data.places.filter((p) => p.geo !== "55079") };
    expect(answer({ mode: "mismatch", measure: "Food Insecurity (2024 Food Insecurity)", other: "Poverty rate" }, noCounty)).toMatchObject({ status: "refused", reason: expect.stringMatching(/no Milwaukee County figure/) });
  });
  it("says the figures aren't loaded yet when nothing is stored", () => {
    expect(answer({ mode: "rank", measure: "Poverty rate" }, { topics: [], places: [], hoods: {}, asOf: null })).toEqual({ status: "unavailable" });
  });
});
```

- [ ] **Step 2: Run it to watch it fail**

Run: `npx vitest run tests/lib/healthAnswer.test.ts`
Expected: FAIL, because the module doesn't exist.

- [ ] **Step 3: Write `convex/lib/healthAnswer.ts`**

```ts
import { CITY_GEO, COUNTY_GEO, type HealthFigure, type HealthLayer, type HealthTopic } from "./healthCompass";
import { matchTopic, mismatchZips, rangeOf, rankZips, togetherZips, versus, type Strength, type Verdict } from "./healthMath";
import { checkZip, COUNTY_ZIPS } from "./zips";

// One ZIP-health answer from the stored copy (spec 2026-10-15-zip-health §4). Pure, so it tests without a database.
export type HealthPlace = { layer: HealthLayer; geo: string; figures: HealthFigure[] };
export type HealthData = { topics: HealthTopic[]; places: HealthPlace[]; hoods: Record<string, string[]>; asOf: number | null };
export type HealthArgs = { mode: "one" | "rank" | "together" | "mismatch"; measure: string; zip?: string; direction?: "high" | "low"; side?: "high" | "low"; other?: string; otherSide?: "high" | "low" };
export type FigOut = { value: number; se: number | null; lo: number | null; hi: number | null; period: string };
export type ZipLine = { zip: string; places: string[]; town: string; a: FigOut; b?: FigOut; verdict?: Verdict };
type Base = { status: "ok"; measure: HealthTopic; county: FigOut | null; asOf: number | null };
export type HealthOk =
  | (Base & { mode: "one"; zip: ZipLine; city: FigOut | null })
  | (Base & { mode: "rank"; direction: "high" | "low"; rows: ZipLine[]; uncertain: ZipLine[] })
  | (Base & { mode: "together"; other: HealthTopic; n: number; strength: Strength; direction: "higher" | "lower"; rows: ZipLine[] })
  | (Base & { mode: "mismatch"; other: HealthTopic; side: "high" | "low"; otherSide: "high" | "low"; cut: number; n: number; fits: ZipLine[]; close: ZipLine[]; uncertain: string[] });
export type HealthResult =
  | HealthOk
  | { status: "choose"; which: "measure" | "other"; words: string; choices: { key: string; name: string }[] }
  | { status: "not-found"; which: "measure" | "other"; words: string }
  | { status: "bad-zip" | "outside"; zip: string }
  | { status: "no-data"; zip: string; measure: string }
  | { status: "refused"; reason: string }
  | { status: "unavailable" };

export function answer(a: HealthArgs, d: HealthData): HealthResult {
  if (!d.topics.length || !d.places.length) return { status: "unavailable" };
  const m = matchTopic(a.measure, d.topics);
  if (m.status === "choose") return { status: "choose", which: "measure", words: a.measure, choices: m.choices };
  if (m.status === "not-found") return { status: "not-found", which: "measure", words: a.measure };
  const measure = m.topic;
  const fig = (geo: string, key: string): FigOut | null => {
    const f = d.places.find((p) => p.geo === geo)?.figures.find((x) => x.topic === key);
    if (!f) return null;
    const r = rangeOf(f);
    return { value: f.value, se: f.se, lo: r?.lo ?? null, hi: r?.hi ?? null, period: f.period };
  };
  const line = (zip: string, fa: FigOut, fb?: FigOut): ZipLine => ({ zip, places: d.hoods[zip] ?? [], town: COUNTY_ZIPS[zip]?.mainPlace ?? "", a: fa, ...(fb ? { b: fb } : {}) });
  const zips = d.places.filter((p) => p.layer === "zip").map((p) => p.geo).sort();
  const county = fig(COUNTY_GEO, measure.key);
  const base = { status: "ok" as const, measure, county, asOf: d.asOf };
  const judged = (l: ZipLine): ZipLine => (county ? { ...l, verdict: versus(l.a, county) } : l);

  if (a.mode === "one") {
    const z = checkZip(a.zip ?? "");
    if (!z) return { status: "bad-zip", zip: (a.zip ?? "").trim() };
    if (!COUNTY_ZIPS[z]) return { status: "outside", zip: z };
    const f = fig(z, measure.key);
    if (!f) return { status: "no-data", zip: z, measure: measure.name };
    return { ...base, mode: "one", zip: judged(line(z, f)), city: fig(CITY_GEO, measure.key) };
  }
  if (a.mode === "rank") {
    const all = zips.flatMap((z) => { const f = fig(z, measure.key); return f ? [line(z, f)] : []; });
    if (!all.length) return { status: "refused", reason: `Health Compass has no ZIP figures for ${measure.name}.` };
    const direction = a.direction ?? "high";
    const { rows, uncertain } = rankZips(all, direction);
    return { ...base, mode: "rank", direction, rows: rows.map(judged), uncertain };
  }
  if (!a.other) return { status: "refused", reason: "Name the second measure to compare it with." };
  const o = matchTopic(a.other, d.topics);
  if (o.status === "choose") return { status: "choose", which: "other", words: a.other, choices: o.choices };
  if (o.status === "not-found") return { status: "not-found", which: "other", words: a.other };
  const other = o.topic;
  if (other.key === measure.key) return { status: "refused", reason: "Pick two different measures." };
  const pairs = zips.flatMap((z) => { const fa = fig(z, measure.key); const fb = fig(z, other.key); return fa && fb ? [line(z, fa, fb)] : []; });
  if (a.mode === "together") {
    return { ...base, mode: "together", other, ...togetherZips(pairs), rows: [...pairs].sort((x, y) => y.a.value - x.a.value) };
  }
  if (!county) return { status: "refused", reason: `Health Compass has no Milwaukee County figure for ${measure.name}, so ZIPs can't be compared with it.` };
  const side = a.side ?? "low";
  const otherSide = a.otherSide ?? "high";
  return { ...base, mode: "mismatch", other, side, otherSide, ...mismatchZips(pairs, side, otherSide, county.value) };
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/lib/healthAnswer.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: The query.** Append to `convex/health.ts` (adding the imports `query` from `./_generated/server` and `answer, type HealthArgs, type HealthResult` from `./lib/healthAnswer`):

```ts
const vMode = v.union(v.literal("one"), v.literal("rank"), v.literal("together"), v.literal("mismatch"));
const vSide = v.union(v.literal("high"), v.literal("low"));

// Ask's zipHealth: the stored copy, answered by code. Public: area figures only, no outside request.
export const zipHealth = query({
  args: { mode: vMode, measure: v.string(), zip: v.optional(v.string()), direction: v.optional(vSide), side: v.optional(vSide), other: v.optional(v.string()), otherSide: v.optional(vSide) },
  handler: async (ctx, a): Promise<HealthResult> => {
    const strip = <T extends { _id: unknown; _creationTime: unknown }>({ _id, _creationTime, ...rest }: T) => rest;
    const topics = (await ctx.db.query("healthTopics").collect()).map(strip);
    const places = (await ctx.db.query("healthPlaces").collect()).map(strip);
    const hoods = Object.fromEntries((await ctx.db.query("zipNeighborhoods").collect()).map((r) => [r.zip, r.city.map((c) => c.name)]));
    const refresh = await ctx.db.query("healthRefresh").first();
    return answer(a as HealthArgs, { topics, places, hoods, asOf: refresh && refresh.at > 0 ? refresh.at : null });
  },
});
```

Then append to `convex/health.test.ts`:

```ts
describe("zipHealth", () => {
  it("answers from the stored copy, with no outside request", async () => {
    installFakeFetch({ healthCompass: hc });
    const t = convexTest(schema, modules);
    await t.action(internal.health.refreshHealth, { paceMs: 0 });
    const seen: string[] = [];
    vi.stubGlobal("fetch", async (u: string) => { seen.push(String(u)); return new Response("{}", { status: 500 }); });
    const r = await t.query(api.health.zipHealth, { mode: "one", measure: "Poverty rate", zip: "53208" });
    expect(r).toMatchObject({ status: "ok", mode: "one", zip: { zip: "53208" } });
    expect(seen).toEqual([]);
  });
  it("says the figures aren't loaded yet before the first refresh", async () => {
    const t = convexTest(schema, modules);
    expect(await t.query(api.health.zipHealth, { mode: "rank", measure: "Poverty rate" })).toEqual({ status: "unavailable" });
  });
});
```

(Change the test file's import to `import { api, internal } from "./_generated/api";`.)

- [ ] **Step 6: The tool.** In `lib/ask/tools.ts`:
  - add `export type ZipHealthAnswer = FunctionReturnType<typeof api.health.zipHealth>;`;
  - add `"zipHealth"` to `AskToolName`;
  - add to `AskBackend`: `health(a: z.infer<typeof zipHealthParams>): Promise<ZipHealthAnswer>;`;
  - after `zipParams`, add:

```ts
const side = z.enum(["high", "low"]);
export const zipHealthParams = z.object({
  mode: z.enum(["one", "rank", "together", "mismatch"]).describe("one: one ZIP against the county; rank: ZIPs ordered; together: do two measures go together across ZIPs; mismatch: ZIPs where measure is low (or high) despite other being high (or low)"),
  measure: z.string().min(2).max(120).describe("The measure in plain words (\"food insecurity\", \"asthma emergency visits\"), or a choice's exact name; for mismatch, the one the question says is low or high despite the other"),
  zip: z.string().max(12).optional().describe("mode one: a 5-digit ZIP code"),
  direction: side.optional().describe("mode rank: high (default) or low"),
  side: side.optional().describe("mode mismatch: measure's side, low (default) or high"),
  other: z.string().min(2).max(120).optional().describe("together and mismatch: the second measure in plain words"),
  otherSide: side.optional().describe("mode mismatch: other's side, high (default) or low"),
});
```

  - add the tool after `zipProfile`:

```ts
    {
      name: "zipHealth",
      description: "Health, food, hospital-visit, poverty and other community measures by ZIP code in Milwaukee County, from Health Compass Milwaukee (the Milwaukee Health Care Partnership's data site), stored weekly with 95% ranges. mode one: one ZIP against Milwaukee County; rank: ZIPs ordered; together: do two measures go together across ZIPs; mismatch: ZIPs where measure is low (or high) despite other being high (or low): 'food insecurity low despite high poverty' → measure food insecurity, side low; other poverty, otherSide high. Pass the measures in plain words; code picks the topic. If it returns choose, pick the choice that fits the question and call again with its exact name; not-found, say what Health Compass didn't have; outside, bad-zip or no-data, say so; refused, give its reason; unavailable, say the health figures aren't loaded yet. The card opens with a sentence saying what was found and carries every figure, range and source; don't restate them.",
      parameters: zipHealthParams,
      execute: (a: z.infer<typeof zipHealthParams>) => b.health(a),
    },
```

  - In the `relateTracts` description, replace `Example: 'food insecurity low despite high poverty' → a = poverty (E02, a poverty rate), aSide high; b = food insecurity (F02), bSide low.` with `Example: 'tracts where E02 is high but F02 is low' → a = E02 (a poverty rate), aSide high; b = F02, bSide low.`

  **`lib/ask/backend.ts`:** add `health: (a) => fetchQuery(api.health.zipHealth, a),`.

- [ ] **Step 7: The routing rule.** In `lib/ask/prompt.ts`:
  - after the `zipProfile` line (`- For who lives in a ZIP code …`), add:

```
- Where-questions about health, food, hunger, hospital or emergency visits, poverty or other community measures ("where is food insecurity low despite high poverty", "which ZIP codes have the most asthma emergency visits", "how does 53208 compare with the county on food insecurity") use zipHealth, by ZIP code, from Health Compass Milwaukee. Don't search the catalog or open dataset sheets first. Use the tract tools only when the person names census tracts, a DYCU dataset or its code. The card opens with what was found and carries every figure and source; add what it means and one caveat, never a figure, and offer possible explanations only as possibilities.
```

  - In the tract line, replace `or mismatches like "where is poverty high but food insecurity low")` with `or mismatches between two of them), when the person names census tracts, a DYCU dataset or its code`.
  - In the same line, replace `"food insecurity low despite high poverty" → a = poverty (E02, a rate), aSide high; b = food insecurity (F02), bSide low.` with `"tracts where E02 is high but F02 is low" → a = E02 (a rate), aSide high; b = F02, bSide low.`

  **`tests/ui/askTools.test.ts`:** add:

```ts
  it("routes ZIP health questions to zipHealth, and keeps tracts for questions that name them", () => {
    expect(askTools(backend({})).map((t) => t.name)).toContain("zipHealth");
    expect(ASK_PROMPT).toContain("use zipHealth, by ZIP code, from Health Compass Milwaukee");
    expect(ASK_PROMPT).toContain("Use the tract tools only when the person names census tracts, a DYCU dataset or its code");
    expect(ASK_PROMPT).not.toContain("where is poverty high but food insecurity low");
  });
```

  If that file's `backend({})` helper builds a full `AskBackend` object literal, add `health: async () => ({ status: "unavailable" }) as never` to it.

- [ ] **Step 8: The scripted test model.** In `lib/ask/model.ts`:
  - add to the routing comment: `"food hardship" → zipHealth mismatch (survey food insecurity low despite high poverty);`
  - add as the **first** branch of the tool-call chain (before `"fire calls each year"`):

```ts
              ...[question.includes("food hardship")
                ? call("zipHealth", { mode: "mismatch", measure: "Food Insecurity (2024 Food Insecurity)", side: "low", other: "Poverty rate", otherSide: "high" })
                : question.includes("fire calls each year")
```

  (The rest of the chain is unchanged; this splices one condition in front of the existing first one.)

- [ ] **Step 9: Run the tests and typecheck**

Run: `npx vitest run tests/lib/healthAnswer.test.ts convex/health.test.ts tests/ui/askTools.test.ts && npx tsc --noEmit -p .`
Expected: PASS. `tsc` needs `convex/_generated/api.d.ts` to know `api.health`. If it fails only on `api.health`, run `npx convex codegen`. If codegen needs a deployment, leave it for Task 8 and ledger the ruling. Every other type error gets fixed now.

- [ ] **Step 10: Commit**

```bash
git add convex/lib/healthAnswer.ts tests/lib/healthAnswer.test.ts convex/health.ts convex/health.test.ts lib/ask/tools.ts lib/ask/backend.ts lib/ask/prompt.ts lib/ask/model.ts tests/ui/askTools.test.ts
git commit -m "feat: Ask's zipHealth tool: one ZIP, ranking, go-together and low-despite-high from the stored copy; where-questions route to it

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: The card, its words, export and share

**Files:**
- Create: `ui/lib/zipHealthText.ts`, `ui/components/ZipHealthCard.tsx`, `tests/ui/zipHealthText.test.ts`
- Modify: `ui/components/AskCards.tsx`, `ui/components/ProvenanceTag.tsx`, `ui/lib/tractShapes.ts`, `ui/components/CityMap.tsx`, `tests/ui/tractShapes.test.ts`, `ui/lib/shareCard.ts`, `convex/shares.ts`, `tests/ui/shareCard.test.ts`

**Interfaces:**
- Consumes:
  - Task 5 (`HealthOk`, `HealthResult`, `ZipLine`, `FigOut`, `zipHealthParams`, `ZipHealthAnswer`);
  - Task 1 (`creditLines`, `topicUrl`, `HC_CREDIT`);
  - Task 4 (`ZCTA_LAYER`);
  - `CardExport`, `Ctx`, `exported`, `safeName`, `toCsv` (`ui/lib/cardExport.ts`);
  - `FollowUp`.
- Produces (`ui/lib/zipHealthText.ts`):
  - `label(t)`, `leadOf(r)` → `{ strong: string; rest: string | null }`;
  - `zipHealthTitle(r)`, `tableOf(r)` → `{ head: string[]; rows: string[][] }`;
  - `notesOf(r)` → `string[]`, `creditsOf(r)` → `string[][]`, `mapOf(r)` → `TractShapes | null`;
  - `zipHealthExport(r, ctx)` → `CardExport`;
  - `zipHealthFollowUps(r)` → `FollowUp[]`, `zipHealthChoices(r)` → `FollowUp[]`, `zipHealthRefusal(r)` → `string`.

  Also `shapeSummary(t)` in `ui/lib/tractShapes.ts`, and `TractShapes` gains `noun?: string`.

- [ ] **Step 1: Write the failing test** in `tests/ui/zipHealthText.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseDataPage, parseTopicsPage, pickFigures, HC_CREDIT } from "../../convex/lib/healthCompass";
import { answer, type HealthData, type HealthOk } from "../../convex/lib/healthAnswer";
import { toCsv } from "../../ui/lib/cardExport";
import { shareCard } from "../../ui/lib/shareCard";
import { label, leadOf, mapOf, notesOf, tableOf, zipHealthChoices, zipHealthExport, zipHealthFollowUps, zipHealthRefusal } from "../../ui/lib/zipHealthText";
import { HC_ROWS, HC_TOPICS_PAGE } from "../fixtures/healthCompass";

const geos = [...new Set(HC_ROWS.map((r) => r.g))];
const data: HealthData = {
  topics: parseTopicsPage(HC_TOPICS_PAGE).topics,
  places: geos.map((geo) => ({ layer: geo === "55079" ? "county" : "zip", geo, figures: pickFigures(parseDataPage({ results: HC_ROWS.filter((r) => r.g === geo) })) })),
  hoods: { "53208": ["Washington Park", "Sherman Park"] },
  asOf: Date.UTC(2026, 9, 12, 17),
};
const ok = (a: Parameters<typeof answer>[0]) => answer(a, data) as HealthOk;
const FI = "Food Insecurity (2024 Food Insecurity)";
const mismatch = ok({ mode: "mismatch", measure: FI, side: "low", other: "Poverty rate", otherSide: "high" });
const ctx = { origin: "https://www.creamcityalmanac.app", date: "October 15, 2026" };

describe("ZIP health words", () => {
  it("names a measure plainly", () => {
    expect(label(data.topics.find((t) => t.key === "MQ35")!)).toBe("food insecurity");
    expect(label(data.topics.find((t) => t.key === "ALI")!)).toBe("households below ALICE threshold");
  });
  it("leads with what was found, written by code", () => {
    expect(leadOf(mismatch)).toEqual({ strong: "No ZIP clearly has high poverty rate with low food insecurity. Possible: 53208.", rest: "Its figures point that way, but its ranges overlap the cutoffs." });
    expect(leadOf(ok({ mode: "rank", measure: FI })).strong).toBe("Highest food insecurity: 53205, 53218, 53235.");
    expect(leadOf(ok({ mode: "one", measure: FI, zip: "53208" })).strong).toBe("53208 is about the same as Milwaukee County on food insecurity.");
  });
  it("rows name each ZIP's neighborhoods, or its town", () => {
    const t = tableOf(mismatch);
    expect(t.head).toEqual(["ZIP", "Where", "Food insecurity", "Poverty rate", "Match"]);
    expect(t.rows[0].slice(0, 2)).toEqual(["53208", "Washington Park, Sherman Park"]);
    expect(t.rows[0][4]).toBe("possible match");
  });
  it("states the cutoff, the ranges, the measure's own words and as-of date", () => {
    const n = notesOf(mismatch).join("\n");
    expect(n).toContain("In the last 12 months, did you ever eat less than you felt you should because there wasn’t enough money for food?");
    expect(n).toMatch(/High poverty rate: the third of ZIP codes with the most \(at or above 21\.6%\)/);
    expect(n).toMatch(/Low food insecurity: below Milwaukee County's 13\.85%/);
    expect(n).toContain("Too uncertain to use: 53203.");
    expect(n).toContain("Health Compass figures as of October 12, 2026.");
  });
  it("keeps the credit, source and link on every export path (review focus 4)", () => {
    const e = zipHealthExport(mismatch, ctx);
    const csv = toCsv(e);
    for (const s of [HC_CREDIT, "Source: U.S. Census Bureau · American Community Survey (ACS) · Table B17001", "https://healthcompassmilwaukee.org/topics/MQ35", "https://healthcompassmilwaukee.org/topics/POV"]) {
      expect(e.notes.join("\n")).toContain(s);
      expect(csv).toContain(s);
    }
    const shared = shareCard("zipHealth", mismatch, ctx);
    expect(shared && "card" in shared && shared.card.notes.join("\n")).toContain(HC_CREDIT);
  });
  it("maps clear matches hatched and possible ones outlined, as ZIPs", () => {
    expect(mapOf(mismatch)).toMatchObject({ fits: [], close: ["53208"], noun: "ZIP" });
  });
  it("offers plain next questions, choices and refusals", () => {
    expect(zipHealthFollowUps(mismatch)[0]).toEqual({ label: "EVERY ZIP", question: `Which ZIP codes have the highest ${FI}?` });
    const choose = answer({ mode: "rank", measure: "food insecurity" }, data);
    if (choose.status !== "choose") throw new Error("expected choices");
    expect(zipHealthChoices(choose)[0].question).toMatch(/^Answer that with Health Compass's "/);
    expect(zipHealthRefusal({ status: "unavailable" })).toBe("Health figures aren't loaded yet; try again later.");
  });
});
```

- [ ] **Step 2: Run it to watch it fail**

Run: `npx vitest run tests/ui/zipHealthText.test.ts`
Expected: FAIL, because the module doesn't exist.

- [ ] **Step 3: Write `ui/lib/zipHealthText.ts`**

```ts
import type { FollowUp } from "@/ui/components/FollowUps";
import type { TractShapes } from "@/ui/components/CityMap";
// Value imports are relative: shareCard runs this inside Convex, whose bundler resolves "@/" only for erased type imports.
import { creditLines, type HealthTopic } from "../../convex/lib/healthCompass";
import type { FigOut, HealthOk, HealthResult, ZipLine } from "@/convex/lib/healthAnswer";
import { ZCTA_LAYER } from "../../convex/lib/zipPlaces";
import { exported, safeName, type CardExport, type Ctx } from "./cardExport";

// ZIP health's words and export (spec 2026-10-15-zip-health §5–§6). Every figure comes from the tool; code writes the
// lead sentence; Health Compass's credit goes everywhere the figures go.

// "Food Insecurity (2024 Food Insecurity)" → "food insecurity"; acronyms stay ("ALICE").
export const label = (t: Pick<HealthTopic, "name">) =>
  t.name.replace(/\s*\([^)]*\)/g, "").trim().split(/\s+/).map((w) => (w.length > 1 && w === w.toUpperCase() ? w : w.toLowerCase())).join(" ");
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const num = (v: number, t: HealthTopic) =>
  t.units.startsWith("%") ? `${v.toFixed(t.decimals)}%` : v.toLocaleString("en-US", { minimumFractionDigits: t.decimals, maximumFractionDigits: t.decimals });
export const figText = (f: FigOut | undefined | null, t: HealthTopic) =>
  !f ? "—" : f.lo === null || f.hi === null ? `${num(f.value, t)} (no range published)` : `${num(f.value, t)} (${num(f.lo, t)}–${num(f.hi, t)})`;
export const placeText = (l: ZipLine) => (l.places.length ? `${l.places.slice(0, 2).join(", ")}${l.places.length > 2 ? " and more" : ""}` : l.town || "—");
const zipList = (ls: ZipLine[]) => `${ls.slice(0, 3).map((l) => l.zip).join(", ")}${ls.length > 3 ? ` and ${ls.length - 3} more` : ""}`;
const VERDICT = { higher: "clearly higher", lower: "clearly lower", same: "about the same", uncertain: "too uncertain to say", "no-range": "no range published" } as const;
const verdictText = (l: ZipLine) => (l.verdict ? VERDICT[l.verdict] : "—");

export function leadOf(r: HealthOk): { strong: string; rest: string | null } {
  const m = label(r.measure);
  if (r.mode === "one") {
    const z = r.zip.zip;
    switch (r.zip.verdict) {
      case "higher": case "lower": return { strong: `${z} is clearly ${r.zip.verdict} than Milwaukee County on ${m}.`, rest: null };
      case "same": return { strong: `${z} is about the same as Milwaukee County on ${m}.`, rest: null };
      case "uncertain": return { strong: `${z}'s ${m} figure is too uncertain to compare with the county.`, rest: null };
      case "no-range": return { strong: `${z}'s ${m} figure has no range published, so it can't be compared with the county.`, rest: null };
      default: return { strong: `Health Compass has no Milwaukee County figure to compare ${z} with.`, rest: null };
    }
  }
  if (r.mode === "rank") return { strong: `${r.direction === "high" ? "Highest" : "Lowest"} ${m}: ${zipList(r.rows.slice(0, 3))}.`, rest: null };
  const o = label(r.other);
  if (r.mode === "together") {
    if (r.strength === "too-few") return { strong: "Too few ZIP codes have both figures to say.", rest: null };
    if (r.strength === "little") return { strong: `Across ZIP codes, ${m} and ${o} show little pattern.`, rest: null };
    return { strong: `ZIP codes with higher ${o} tend to have ${r.direction} ${m} (a ${r.strength} pattern).`, rest: null };
  }
  const phrase = `${r.otherSide} ${o} with ${r.side} ${m}`;
  if (r.fits.length) {
    return {
      strong: `${r.fits.length === 1 ? "Clearest lead" : "Clear matches"}: ${zipList(r.fits)}.`,
      rest: `${cap(o)} is ${r.otherSide} there, and ${m} is ${r.side === "low" ? "lower" : "higher"} than across Milwaukee County.${r.close.length ? ` Possible: ${zipList(r.close)}.` : ""}`,
    };
  }
  if (r.close.length) {
    const one = r.close.length === 1;
    return { strong: `No ZIP clearly has ${phrase}. Possible: ${zipList(r.close)}.`, rest: `${one ? "Its" : "Their"} figures point that way, but ${one ? "its" : "their"} ranges overlap the cutoffs.` };
  }
  return { strong: `No ZIP has ${phrase}.`, rest: null };
}

export function zipHealthTitle(r: HealthOk): string {
  if (r.mode === "one") return `ZIP ${r.zip.zip} · ${r.measure.name}`;
  if (r.mode === "rank") return `ZIP codes · ${r.measure.name}`;
  return `ZIP codes · ${r.measure.name} and ${r.other.name}`;
}

export function tableOf(r: HealthOk): { head: string[]; rows: string[][] } {
  const M = cap(label(r.measure));
  if (r.mode === "one") {
    return { head: ["", `ZIP ${r.zip.zip}`, "Milwaukee County", "City of Milwaukee", "Compared with the county"], rows: [[M, figText(r.zip.a, r.measure), figText(r.county, r.measure), figText(r.city, r.measure), verdictText(r.zip)]] };
  }
  if (r.mode === "rank") {
    return { head: ["ZIP", "Where", M, "Compared with the county"], rows: r.rows.slice(0, 10).map((l) => [l.zip, placeText(l), figText(l.a, r.measure), verdictText(l)]) };
  }
  const O = cap(label(r.other));
  if (r.mode === "together") return { head: ["ZIP", "Where", M, O], rows: r.rows.map((l) => [l.zip, placeText(l), figText(l.a, r.measure), figText(l.b, r.other)]) };
  const row = (l: ZipLine, word: string) => [l.zip, placeText(l), figText(l.a, r.measure), figText(l.b, r.other), word];
  return { head: ["ZIP", "Where", M, O, "Match"], rows: [...r.fits.map((l) => row(l, "clear match")), ...r.close.map((l) => row(l, "possible match"))] };
}

const topicsOf = (r: HealthOk) => (r.mode === "one" || r.mode === "rank" ? [r.measure] : [r.measure, r.other]);
const periodOf = (r: HealthOk, t: HealthTopic) => {
  const lines = r.mode === "one" ? [r.zip] : r.mode === "rank" ? r.rows : r.mode === "together" ? r.rows : [...r.fits, ...r.close];
  const f = t.key === r.measure.key ? r.county ?? lines[0]?.a : lines[0]?.b;
  return f?.period ?? "";
};

// One line per dataset kind, from Health Compass's own source fields (spec §5).
export function limitationOf(t: HealthTopic): string | null {
  const src = t.sources.join(" ");
  if (t.team === "milwaukee-health-partnership") return `${t.name} is a survey: figures come from the people who answered, and ZIPs with few answers have wide ranges.`;
  if (/American Community Survey/.test(src)) return `${t.name} is a Census Bureau survey estimate; the range shows its uncertainty.`;
  if (/PLACES/.test(src)) return `${t.name} is a modeled estimate, not a count.`;
  return null;
}

const asOfText = (ms: number) => new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "America/Chicago" }).format(ms);

export function notesOf(r: HealthOk): string[] {
  const out = topicsOf(r).map((t) => `${t.name}: ${t.description} Units: ${t.units}.`);
  if (r.mode === "mismatch") {
    const o = label(r.other), m = label(r.measure);
    out.push(
      `${cap(r.otherSide)} ${o}: the third of ZIP codes with the ${r.otherSide === "high" ? "most" : "least"} (${r.otherSide === "high" ? "at or above" : "at or below"} ${num(r.cut, r.other)}). ${cap(r.side)} ${m}: ${r.side === "low" ? "below" : "above"} Milwaukee County's ${num(r.county!.value, r.measure)}. "Clear" means a ZIP's whole range is past both lines.`,
    );
  } else if (r.mode !== "together") {
    out.push("“Clearly higher” or “lower” means the ZIP's whole range is above or below Milwaukee County's figure.");
  }
  out.push("Ranges are 95%: each figure plus or minus 1.96 standard errors, as Health Compass publishes them.");
  const uncertain = r.mode === "rank" ? r.uncertain.map((l) => l.zip) : r.mode === "mismatch" ? r.uncertain : [];
  if (uncertain.length) out.push(`Too uncertain to use: ${uncertain.join(", ")}.`);
  for (const t of topicsOf(r)) { const l = limitationOf(t); if (l) out.push(l); }
  if (r.mode !== "one") out.push("Where: the City's neighborhoods covering at least 10% of the ZIP; outside the City, the ZIP's main town.");
  if (r.asOf) out.push(`Health Compass figures as of ${asOfText(r.asOf)}.`);
  return out;
}

// Health Compass's credit for each measure on the card (spec §6).
export const creditsOf = (r: HealthOk): string[][] => topicsOf(r).map((t) => creditLines(t, periodOf(r, t)));

export function mapOf(r: HealthOk): TractShapes | null {
  const fits = r.mode === "one" ? [r.zip.zip] : r.mode === "rank" ? r.rows.slice(0, 10).map((l) => l.zip) : r.mode === "mismatch" ? r.fits.map((l) => l.zip) : [];
  const close = r.mode === "mismatch" ? r.close.map((l) => l.zip) : [];
  return fits.length || close.length ? { url: ZCTA_LAYER, fits, close, noun: "ZIP" } : null;
}

const fig = (f: FigOut | null | undefined) => [f?.value ?? null, f?.se ?? null, f?.lo ?? null, f?.hi ?? null, f?.period ?? ""];

export function zipHealthExport(r: HealthOk, ctx: Ctx): CardExport {
  const lead = leadOf(r);
  const keys = topicsOf(r).map((t) => t.key);
  const figHead = (name: string) => [name, `${name} standard error`, `${name} range low`, `${name} range high`, `${name} period`];
  const lines = r.mode === "one" ? [r.zip] : r.mode === "rank" ? r.rows : r.mode === "together" ? r.rows : [...r.fits, ...r.close];
  const t = tableOf(r);
  return {
    title: zipHealthTitle(r),
    lines: [lead.rest ? `${lead.strong} ${lead.rest}` : lead.strong],
    csv: {
      head: ["ZIP", "Where", ...figHead(r.measure.name), ...(r.mode === "one" || r.mode === "rank" ? [] : figHead(r.other.name)), "Milwaukee County", "Milwaukee County standard error"],
      rows: lines.map((l) => [l.zip, placeText(l), ...fig(l.a), ...(r.mode === "one" || r.mode === "rank" ? [] : fig(l.b)), r.county?.value ?? null, r.county?.se ?? null]),
    },
    text: t,
    notes: [...notesOf(r), ...creditsOf(r).flat(), exported(ctx)],
    filename: safeName(["zip-health", ...keys, ...(r.mode === "one" ? [r.zip.zip] : [])]),
  };
}

export function zipHealthFollowUps(r: HealthOk): FollowUp[] {
  const every = { label: "EVERY ZIP", question: `Which ZIP codes have the highest ${r.measure.name}?` };
  if (r.mode === "one") return [every, { label: `MORE ON ${r.zip.zip}`, question: `What is the demographic makeup of ${r.zip.zip}?` }];
  if (r.mode === "rank") {
    const top = r.rows[0]?.zip;
    return top ? [{ label: `${top} VS COUNTY`, question: `How does ${top} compare with the county on ${r.measure.name}?` }, { label: `MORE ON ${top}`, question: `What is the demographic makeup of ${top}?` }] : [];
  }
  const first = r.mode === "mismatch" ? (r.fits[0] ?? r.close[0])?.zip : undefined;
  return [every, ...(first ? [{ label: `MORE ON ${first}`, question: `What is the demographic makeup of ${first}?` }] : [])];
}

export const zipHealthChoices = (r: Extract<HealthResult, { status: "choose" }>): FollowUp[] =>
  r.choices.map((c) => ({ label: c.name.toUpperCase(), question: `Answer that with Health Compass's "${c.name}".` }));

export function zipHealthRefusal(r: Exclude<HealthResult, HealthOk | { status: "choose" }>): string {
  switch (r.status) {
    case "not-found": return `Health Compass has no measure matching “${r.words}”. It covers health, hospital visits, food, income and housing by ZIP code.`;
    case "bad-zip": return "Give a 5-digit ZIP code, like 53212.";
    case "outside": return `Ask has Health Compass figures for the ZIP codes that touch Milwaukee County; ${r.zip} isn't one of them.`;
    case "no-data": return `Health Compass has no ${r.measure} figure for ${r.zip}.`;
    case "refused": return r.reason;
    default: return "Health figures aren't loaded yet; try again later.";
  }
}
```

  If the leadOf expectations in the test disagree with this code's exact words, **the test is the spec's wording**. Change the code, not the test. The one exception is where the test itself contradicts the spec (§5); ledger a ruling then.

- [ ] **Step 4: Map wording for ZIPs.** In `ui/lib/tractShapes.ts`:
  - change the ID check in `tractShapesUrl` from `!/^\d{11}$/.test(g)` to `!/^(\d{11}|\d{5})$/.test(g)`, and its comment to "only 11-digit tract ids or 5-digit ZIP codes";
  - add:

```ts
// The map's caption: "Map of 2 highlighted tracts, 1 close", or ZIPs.
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
export const shapeSummary = ({ fits, close, noun = "tract" }: { fits: string[]; close: string[]; noun?: string }) =>
  fits.length ? `Map of ${plural(fits.length, `highlighted ${noun}`)}${close.length ? `, ${close.length} close` : ""}` : `Map of ${plural(close.length, `close ${noun}`)}`;
```

  In `ui/components/CityMap.tsx`:
  - `export type TractShapes = { url: string; fits: string[]; close: string[]; noun?: string };`;
  - delete the local `plural` and `tractSummary`, and use `shapeSummary` (imported from `@/ui/lib/tractShapes`) where `tractSummary(` was called;
  - in the key, `highlighted tract` becomes `highlighted {tracts.noun ?? "tract"}`.

  (If `plural` is used elsewhere in `CityMap.tsx`, keep it there and only remove `tractSummary`.)

  In `tests/ui/tractShapes.test.ts`, add:

```ts
  it("takes ZIP codes too, and words the caption for them", () => {
    expect(tractShapesUrl("https://x/MapServer/2", ["53208"])).toContain(encodeURIComponent("GEOID IN ('53208')"));
    expect(shapeSummary({ fits: ["53208"], close: [], noun: "ZIP" })).toBe("Map of 1 highlighted ZIP");
    expect(shapeSummary({ fits: [], close: ["1", "2"] })).toBe("Map of 2 close tracts");
  });
```

  (and add `shapeSummary` to that file's import).

- [ ] **Step 5: The source tag.** In `ui/components/ProvenanceTag.tsx`:
  - change both `Provenance | "CITY" | "CENSUS"` occurrences to `Provenance | "CITY" | "CENSUS" | "HCM"`;
  - add to `LABELS`: `HCM: { short: "HCM", title: "From Health Compass Milwaukee (Milwaukee Health Care Partnership)" },`;
  - and update the comment above `LABELS` to "CITY, CENSUS and HCM are display-only".

- [ ] **Step 6: The card.** Create `ui/components/ZipHealthCard.tsx`:

```tsx
"use client";

import type { HealthOk } from "@/convex/lib/healthAnswer";
import { creditsOf, leadOf, mapOf, notesOf, tableOf, zipHealthExport, zipHealthTitle } from "@/ui/lib/zipHealthText";
import { CityMap } from "./CityMapLoader";
import { ExportBar } from "./ExportBar";
import { ProvenanceTag } from "./ProvenanceTag";
import styles from "./ask.module.css";

// Health Compass figures by ZIP (spec 2026-10-15-zip-health §5): code's lead sentence, the rows, the measure's own words,
// the cutoff and limitation, and Health Compass's credit with a link (§6).
export function ZipHealthCard({ r }: { r: HealthOk }) {
  const lead = leadOf(r);
  const t = tableOf(r);
  const map = mapOf(r);
  return (
    <figure className={styles.excerpt} data-card="zip-health">
      <figcaption className={styles.excerptTitle}>{zipHealthTitle(r)} <ProvenanceTag source="HCM" /></figcaption>
      <p className={styles.tractSummary} data-summary><strong>{lead.strong}</strong>{lead.rest && ` ${lead.rest}`}</p>
      {t.rows.length > 0 && (
        <div className={styles.tractScroll} tabIndex={0} role="region" aria-label={`${zipHealthTitle(r)}, scroll sideways for more`}>
          <table className={styles.excerptTable}>
            <thead><tr>{t.head.map((h, i) => <th key={i} scope="col">{h}</th>)}</tr></thead>
            <tbody>{t.rows.map((row) => <tr key={row.join("|")}>{row.map((c, i) => (i === 0 ? <th key={i} scope="row">{c}</th> : <td key={i}>{c}</td>))}</tr>)}</tbody>
          </table>
        </div>
      )}
      {map && <div className={styles.tractMap} data-tract-map><CityMap tracts={map} height={220} /></div>}
      {notesOf(r).map((n) => <p key={n} className={styles.source}>{n}</p>)}
      {creditsOf(r).map((lines) => (
        <p key={lines.join("|")} className={styles.source} data-credit>
          {lines.map((l, i) => (l.startsWith("https://") ? <a key={i} href={l}>{l}</a> : <span key={i}>{l}. </span>))}
        </p>
      ))}
      <ExportBar make={(ctx) => zipHealthExport(r, ctx)} />
    </figure>
  );
}
```

  In `ui/components/AskCards.tsx`:
  - import `ZipHealthCard`;
  - import `zipHealthChoices, zipHealthFollowUps, zipHealthRefusal` from `@/ui/lib/zipHealthText`;
  - import `zipHealthParams, type ZipHealthAnswer` with the other tool imports;
  - after the `zipProfile` render, add:

```tsx
  useRenderTool({ name: "zipHealth", parameters: zipHealthParams, render: (props) => {
    if (props.status !== "complete") return <Busy />;
    const r = parse<ZipHealthAnswer>(props.result);
    if (!r) return <Failed />;
    if (r.status === "choose") return <FollowUps pick items={zipHealthChoices(r)} id={props.toolCallId} />;
    if (r.status !== "ok") return <p className={styles.failed} data-card="zip-health-refusal">{zipHealthRefusal(r)}</p>;
    return <><ShareScope tool="zipHealth" args={props.parameters}><ZipHealthCard r={r} /></ShareScope><FollowUps items={zipHealthFollowUps(r)} id={props.toolCallId} /></>;
  } }, []);
```

- [ ] **Step 7: Share links.** In `ui/lib/shareCard.ts`:
  - add `"zipHealth"` to `SHAREABLE`;
  - import `zipHealthExport` from `./zipHealthText`;
  - add the case `case "zipHealth": return ok ? card(zipHealthExport(r as never, ctx)) : null;`.

  In `convex/shares.ts`'s `rerun`, add `case "zipHealth": return ctx.runQuery(api.health.zipHealth, args);`.

  If `tests/ui/shareCard.test.ts` asserts the exact `SHAREABLE` list, add `"zipHealth"` to its expected list.

- [ ] **Step 8: Run the tests and typecheck**

Run: `npx vitest run tests/ui/zipHealthText.test.ts tests/ui/tractShapes.test.ts tests/ui/shareCard.test.ts tests/ui && npx tsc --noEmit -p .`
Expected: PASS. The `tests/ui/effects.test.ts` guard must stay green (no effect returns a value).

- [ ] **Step 9: Commit**

```bash
git add ui/lib/zipHealthText.ts ui/components/ZipHealthCard.tsx tests/ui/zipHealthText.test.ts ui/components/AskCards.tsx ui/components/ProvenanceTag.tsx ui/lib/tractShapes.ts ui/components/CityMap.tsx tests/ui/tractShapes.test.ts ui/lib/shareCard.ts convex/shares.ts tests/ui/shareCard.test.ts
git commit -m "feat: the ZIP health card: code's lead sentence, neighborhoods per ZIP, ranges, map, Health Compass credit on every export and share

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Grading list, browser test, docs, decision 050

**Files:**
- Modify: `scripts/ask-questions.ts`, `lib/ask/examples.ts`, `e2e/ask.spec.ts`, `DESIGN.md`, `ui/components/HowItWorks.tsx`
- Create: `docs/decisions/050-health-compass.md`

- [ ] **Step 1: Graded questions.**
  - **`scripts/ask-questions.ts`:**
    - change `{ q: "Where is food insecurity low despite high poverty?", tool: "relateTracts", … }` to `{ q: "Where is food insecurity low despite high poverty?", tool: "zipHealth", expect: { mode: "mismatch", status: "ok" }, final: true }`;
    - change `{ q: "Is asthma higher where poverty is higher?", tool: "relateTracts", … }` to `{ q: "Is asthma higher where poverty is higher?", tool: "zipHealth", expect: { mode: "together", status: "ok" }, final: true }`;
    - add:

```ts
  { q: "Which ZIP codes have the highest rate of emergency visits for asthma?", tool: "zipHealth", expect: { mode: "rank", status: "ok", key: "WIHRA" }, final: true },
  { q: "How does 53208 compare with the county on food insecurity?", tool: "zipHealth", expect: { mode: "one", status: "ok", zip: "53208" }, final: true },
```

  - **`lib/ask/examples.ts`:** in the two entries for those questions, change `tool: "relateTracts"` to `tool: "zipHealth"` and `expect` to `{ mode: "mismatch" }` and `{ mode: "together" }`.

  Run: `npx vitest run tests/ui/askExamples.test.ts tests/ui/startAsk.test.ts`
  Expected: PASS. (Start here's questions don't include these two.)

- [ ] **Step 2: Browser test.** In `e2e/ask.spec.ts`'s "signed in" describe, after the ZIP card test, add:

```ts
  test("a food-hardship-by-ZIP question draws the ZIP health card with Health Compass's credit", async ({ page }) => {
    await ask(page, "Where is food hardship low despite high poverty, by ZIP?");
    const card = page.locator("[data-card=zip-health]:visible");
    const refusal = page.locator("[data-card=zip-health-refusal]:visible");
    await expect(card.or(refusal)).toBeVisible({ timeout: 30_000 });
    test.skip(await refusal.isVisible(), "Health Compass figures aren't stored on this deployment yet (run health:refreshHealth)");
    await expect(card.locator("abbr", { hasText: "HCM" })).toBeVisible();
    await expect(card.locator("[data-summary]")).toContainText("53208");
    await expect(card.locator("[data-credit]").first()).toContainText("Health Compass Milwaukee (Milwaukee Health Care Partnership), powered by Metopio");
    await expect(card.locator("[data-credit] a").first()).toHaveAttribute("href", /^https:\/\/healthcompassmilwaukee\.org\/topics\//);
  });
```

  Run: `npx playwright test --list e2e/ask.spec.ts | grep -c "ZIP health card"`
  Expected: `2` (phone and desktop). Not run locally; it runs in CI after the dev data refresh (Task 8).

- [ ] **Step 3: DESIGN.md.** After the "Tour (first visit)" section, add:

```markdown
### ZIP health (Ask)
Health Compass Milwaukee's figures by ZIP code (`[data-card=zip-health]`), stored weekly.
- **Title:** "ZIP codes · {measure}" (or "ZIP {zip} · {measure}"), with the **HCM** tag.
- **Lead:** one code-written sentence, its answer in bold ("No ZIP clearly has … Possible: 53208.").
- **Rows:** ZIP, Where (the City's neighborhoods covering ≥10% of it, or its town), each figure with its 95% range, and a strength word (clear match, possible match; clearly higher, clearly lower, about the same, too uncertain to say, no range published).
- **Map:** the tract map's style on ZIP outlines: clear matches hatched, possible ones outlined.
- **Under the rows:** the measure's own description, the cutoff, the 95% range rule, one limitation line, the as-of date, then the credit: "Health Compass Milwaukee (Milwaukee Health Care Partnership), powered by Metopio", the source, the period and the topic link. The credit is in every export and share.
```

- [ ] **Step 4: How it works.** In `ui/components/HowItWorks.tsx`, after the ZIP-code paragraph (the one ending "the figures cover the whole ZIP."), add:

```tsx
            <p>
              For health, food, hospital visits and similar measures by ZIP code, Ask uses Health Compass Milwaukee, the Milwaukee Health
              Care Partnership&apos;s data site, marked <ProvenanceTag source="HCM" />. Ask keeps a weekly copy, shows each figure&apos;s
              range, compares it with Milwaukee County, and credits Health Compass and the original source on every card, download and
              share.
            </p>
```

  Run: `npx vitest run tests/ui/how.test.ts`
  Expected: PASS.

- [ ] **Step 5: Decision 050** (`docs/decisions/050-health-compass.md`), in 048's format:
  - **Title:** "050: Ask answers health 'where' questions by ZIP code from Health Compass Milwaukee"
  - **Decision:** add Health Compass Milwaukee as a source, stored weekly for county ZIPs, the county and the city. "Where" questions about health, food, poverty and similar measures go to ZIP answers. Each ZIP is named by its City neighborhoods.
  - **Why this came up:**
    - Ask answered "Where is food insecurity low despite high poverty?" with census tracts, dataset codes and a list of 11 datasets. A reader doesn't know what a census tract is.
    - A general AI agent answered the same question by ZIP from Health Compass, and Tarik preferred it. But the agent did its own arithmetic, slipped on its cutoff, and showed no margins.
  - **Options:**
    - **Add Health Compass now, by ZIP (chosen).**
    - **Link to it only.**
    - **Keep tract answers** and reword them (Part 1, still planned).
  - **What we chose and why (Tarik, 2026-10-15):**
    - **ZIP codes because people know them.**
    - **Code does the math** with Health Compass's own standard errors.
    - **Credit stays attached everywhere.**
  - **What we gave up:**
    - **Group breakdowns** (race, sex, age).
    - **Health Compass's tract data.**
    - **Older periods.**
    - **"Clear" is stricter than the agent's answer.** With ranges counted, its "clearest lead" (53208) is only a possible match.
  - **How we'll know:**
    - the graded questions reach `zipHealth`;
    - 53208's food hardship reads 9.71% with its range on dev;
    - every export carries the credit (unit test).
  - **What actually happened:** blank.

- [ ] **Step 6: Whole suite, typecheck and build**

Run: `uptime; npx vitest run > /tmp/zip-health-suite.log 2>&1; grep -E "Test Files|Tests " /tmp/zip-health-suite.log; npx tsc --noEmit -p . && npm run build > /tmp/zip-health-build.log 2>&1; echo build=$?`
Expected: all pass, `build=0`. If the load average is over 20, rerun with `--testTimeout=120000 --maxWorkers=2`.

- [ ] **Step 7: Commit**

```bash
git add scripts/ask-questions.ts lib/ask/examples.ts e2e/ask.spec.ts DESIGN.md ui/components/HowItWorks.tsx docs/decisions/050-health-compass.md
git commit -m "test: graded ZIP health questions and a browser check; DESIGN.md, How it works and decision 050

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Live checks (needs Tarik's OK)

- [ ] **Step 1: Ask Tarik** for:
  - a dev Convex push;
  - one dev `health:refreshHealth` run (about 1 minute, 40 requests to Health Compass);
  - one dev `build:refreshNeighborhoods` run (re-reads the City's neighborhoods and DYCU's tract outlines, and now the ZIP outlines);
  - a graded real-AI run of the four ZIP health questions plus the rerun set (spec §8).

- [ ] **Step 2 (with OK): Push and refresh on dev**

Run: `npx convex dev --once && npx convex run health:refreshHealth && npx convex run build:refreshNeighborhoods`
Expected: `[]` from the health refresh, and no "ZIP neighborhoods unavailable" note.

- [ ] **Step 3: Check the numbers**

Run: `npx convex run health:zipHealth '{"mode":"one","measure":"Food Insecurity (2024 Food Insecurity)","zip":"53208"}'`
Expected: `status: "ok"`. 53208's `a.value` is about 9.71 with `se` about 2.24. `county.value` is about 13.85. `zip.places` names City neighborhoods.

Run: `npx convex run health:zipHealth '{"mode":"rank","measure":"Poverty rate"}' | grep -c '"zip"'`
Expected: at least 30.

- [ ] **Step 4: Graded questions.** Run the report card on the changed and added questions, the way earlier projects did, and record each question's tool and pass or fail:
  - "Where is food insecurity low despite high poverty?"
  - "Is asthma higher where poverty is higher?"
  - "Which ZIP codes have the highest rate of emergency visits for asthma?"
  - "How does 53208 compare with the county on food insecurity?"
  - "What is the demographic makeup of 53228?"
  - "Which census tracts have the highest poverty rate?"
  - the two home-value questions
