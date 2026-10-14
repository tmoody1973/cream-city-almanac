# ZIP Answers from the Census (Z1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ask answers "what is the demographic makeup of 53228" with a ZIP card: population, race and ethnicity, and the fact sheets' 8 measures from the Census survey, with Milwaukee's figure beside each one and a note when the ZIP lies mostly outside the City.

**Architecture:**
- A hand-kept list holds the 37 ZIP areas that touch Milwaukee County (`convex/lib/zips.ts`), and a pure module turns Census values into rows (`convex/lib/zipFigures.ts`).
- A new Convex action, `zips:zipProfile`, calls the Census ACS 5-year API live for one ZIP area. It reuses `censusUrl` (which gains a geography argument) and `parseCensus`, and compares against the stored `cityFigures`.
- Ask gets a `zipProfile` tool, and the UI gets a `ZipCard`.
- The prose checker stops flagging a 5-digit number the person typed.

**Tech Stack:**
- Convex (action, internalQuery, convex-test);
- Next.js App Router;
- CopilotKit `useRenderTool`;
- Zod, Vitest and Playwright.

**Spec:** `docs/superpowers/specs/2026-10-14-zip-profile-design.md`

## Global Constraints

- The Census key (`CENSUS_API_KEY`) never appears in code, files, logs, test output or notes. Error text is scrubbed of `key=…` before logging.
- The AI never writes a number. Code computes every figure, and the card carries them.
- The tool returns totals and shares only, never households or addresses.
- Reach: exactly the 37 ZIP areas in `COUNTY_ZIPS`. Anything else gets `outside`.
- Survey years: the newest period stored in `cityFigures`, so the ZIP and Milwaukee match. The period label is `${y - 4}–${y}`.
- Allowance: the existing `askCity` rate limit, per account.
- No share link for the ZIP card (out of scope). `SHAREABLE` is unchanged.
- Each dev Convex push or dev data run needs Tarik's explicit OK. Never stage `.superpowers/` or `clerk-creamcityalmanac.app.zone`.
- Commit trailer: `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- Decision log: "What actually happened" stays blank for Tarik.

## Review Focus

1. **A tiny ZIP area (53295, the VA grounds) with population 0 or missing codes.** Rows must show "—", never crash or print NaN. Pinned in Task 1.
2. **A ZIP+4 ("53228-1234") or spaces around the ZIP.** A person expects an answer, so the first 5 digits are used. Pinned in Task 3.
3. **The Census answers 200 with an HTML page** (its missing-key page after a redirect). This must be `unavailable` with the key scrubbed, not a crash. Pinned in Task 3.
4. **The stored city figures don't have race yet** (before the first refresh after merge). Milwaukee's race column must read "—" with no verdict. Pinned in Task 3.
5. **The note's wording when the City holds the largest part but not all of a ZIP** (53211 is 50%, with the rest in the suburbs). It must not say "most is in Milwaukee". Pinned in Task 5.

---

### Task 1: The ZIP list and the figures math (pure)

**Files:**
- Create: `convex/lib/zips.ts`
- Create: `convex/lib/zipFigures.ts`
- Test: `tests/lib/zips.test.ts`

**Interfaces:**
- Produces:
  - `export type ZipArea = { cityShare: number; mainPlace: string }`
  - `export const COUNTY_ZIPS: Record<string, ZipArea>`
  - `export function checkZip(raw: string): string | null` (the 5-digit ZIP, or null)
  - `export const RACE: { id: string; label: string; codes: string[] }[]`
  - `export const RACE_TOTAL = "B03002_001"`
  - `export const RACE_CODES: string[]`
  - `export type ZipRow = { id: string; label: string; meaning: string; zip: Figure | null; city: Figure | null; verdict: Verdict }`
  - `export function zipRows(values: Record<string, Est>, city: Record<string, Est> | undefined): { population: Est | null; race: ZipRow[]; facts: ZipRow[] }`

- [ ] **Step 1: Write the failing tests** in `tests/lib/zips.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { checkZip, COUNTY_ZIPS } from "../../convex/lib/zips";
import { RACE, RACE_CODES, zipRows } from "../../convex/lib/zipFigures";

const est = (estimate: number, moe: number | null = 10) => ({ estimate, moe });

describe("COUNTY_ZIPS", () => {
  it("lists the 37 ZIP areas touching Milwaukee County, with land shares in the City", () => {
    expect(Object.keys(COUNTY_ZIPS)).toHaveLength(37);
    for (const a of Object.values(COUNTY_ZIPS)) expect(a.cityShare).toBeGreaterThanOrEqual(0), expect(a.cityShare).toBeLessThanOrEqual(1);
    expect(COUNTY_ZIPS["53228"]).toEqual({ cityShare: 0.1, mainPlace: "Greenfield" });
    expect(COUNTY_ZIPS["53202"]).toEqual({ cityShare: 1, mainPlace: "Milwaukee" });
    expect(COUNTY_ZIPS["53201"]).toBeUndefined(); // a PO-box ZIP: no Census area
  });
});

describe("checkZip", () => {
  it("keeps the first 5 digits of a ZIP or ZIP+4, trimmed", () => {
    expect(checkZip(" 53228 ")).toBe("53228");
    expect(checkZip("53228-1234")).toBe("53228");
  });
  it("refuses anything else", () => {
    for (const bad of ["5322", "abcde", "532281", "", "53 228"]) expect(checkZip(bad)).toBeNull();
  });
});

describe("zipRows", () => {
  const values = {
    B03002_001: est(1000), B03002_003: est(600), B03002_004: est(100), B03002_005: est(5), B03002_006: est(50),
    B03002_007: est(5), B03002_008: est(10), B03002_009: est(30), B03002_012: est(200),
    B17001_001: est(1000), B17001_002: est(150),
  };
  it("computes population and race shares, with Other summing three codes", () => {
    const r = zipRows(values, undefined);
    expect(r.population).toEqual(est(1000));
    expect(r.race.map((x) => x.id)).toEqual(RACE.map((x) => x.id));
    const other = r.race.find((x) => x.id === "other")!;
    expect(other.zip!.count.estimate).toBe(20);
    expect(other.zip!.count.moe).toBeCloseTo(Math.sqrt(300));
    expect(r.race.find((x) => x.id === "white")!.zip!.rate!.estimate).toBeCloseTo(0.6);
  });
  it("uses the fact sheets' formulas for the 8 measures, and compares with Milwaukee", () => {
    const city = { B17001_001: est(500000, 100), B17001_002: est(120000, 100) };
    const pov = zipRows(values, city).facts.find((x) => x.id === "poverty")!;
    expect(pov.zip!.rate!.estimate).toBeCloseTo(0.15);
    expect(pov.city!.rate!.estimate).toBeCloseTo(0.24);
    expect(pov.verdict).toBe("lower");
    expect(zipRows(values, city).facts).toHaveLength(8);
  });
  it("leaves a row empty, never NaN, when codes are missing or the population is 0 (review focus 1)", () => {
    const r = zipRows({ B03002_001: est(0, 0) }, undefined);
    expect(r.race.every((x) => x.zip === null || x.zip.rate === null)).toBe(true);
    expect(r.facts.every((x) => x.zip === null)).toBe(true);
    expect(r.race.every((x) => x.verdict === "unknown")).toBe(true);
  });
  it("needs every race code in the city request set", () => {
    expect(RACE_CODES).toEqual(expect.arrayContaining(["B03002_001", "B03002_005", "B03002_007", "B03002_008", "B03002_012"]));
  });
});
```

- [ ] **Step 2: Run them to watch them fail**

Run: `npx vitest run tests/lib/zips.test.ts`
Expected: FAIL, because `../../convex/lib/zips` doesn't exist.

- [ ] **Step 3: Write `convex/lib/zips.ts`**

```ts
// The ZIP code tabulation areas (the Census Bureau's ZIP-shaped areas) that touch Milwaukee County, with the share of
// each one's LAND inside the City of Milwaukee and the place holding the largest part (spec 2026-10-14-zip-profile §4).
// Built once from the Census 2020 relationship files tab20_zcta520_county20_natl.txt (county GEOID 55079) and
// tab20_zcta520_place20_natl.txt: cityShare = AREALAND_PART in "Milwaukee city" ÷ AREALAND_ZCTA5_20, to 2 places.
// Land, not people. Rebuild after the 2030 census. PO-box ZIPs (53201 …) have no area and aren't here.
export type ZipArea = { cityShare: number; mainPlace: string };
export const COUNTY_ZIPS: Record<string, ZipArea> = {
  "53110": { cityShare: 0, mainPlace: "Cudahy" },
  "53126": { cityShare: 0, mainPlace: "Raymond" },
  "53129": { cityShare: 0, mainPlace: "Greendale" },
  "53130": { cityShare: 0, mainPlace: "Hales Corners" },
  "53132": { cityShare: 0, mainPlace: "Franklin" },
  "53154": { cityShare: 0, mainPlace: "Oak Creek" },
  "53172": { cityShare: 0, mainPlace: "South Milwaukee" },
  "53202": { cityShare: 1, mainPlace: "Milwaukee" },
  "53203": { cityShare: 1, mainPlace: "Milwaukee" },
  "53204": { cityShare: 1, mainPlace: "Milwaukee" },
  "53205": { cityShare: 1, mainPlace: "Milwaukee" },
  "53206": { cityShare: 1, mainPlace: "Milwaukee" },
  "53207": { cityShare: 1, mainPlace: "Milwaukee" },
  "53208": { cityShare: 0.99, mainPlace: "Milwaukee" },
  "53209": { cityShare: 0.61, mainPlace: "Milwaukee" },
  "53210": { cityShare: 0.99, mainPlace: "Milwaukee" },
  "53211": { cityShare: 0.5, mainPlace: "Milwaukee" },
  "53212": { cityShare: 0.89, mainPlace: "Milwaukee" },
  "53213": { cityShare: 0.15, mainPlace: "Wauwatosa" },
  "53214": { cityShare: 0.26, mainPlace: "West Allis" },
  "53215": { cityShare: 0.93, mainPlace: "Milwaukee" },
  "53216": { cityShare: 1, mainPlace: "Milwaukee" },
  "53217": { cityShare: 0, mainPlace: "River Hills" },
  "53218": { cityShare: 1, mainPlace: "Milwaukee" },
  "53219": { cityShare: 0.52, mainPlace: "Milwaukee" },
  "53220": { cityShare: 0.3, mainPlace: "Greenfield" },
  "53221": { cityShare: 0.69, mainPlace: "Milwaukee" },
  "53222": { cityShare: 0.58, mainPlace: "Milwaukee" },
  "53223": { cityShare: 0.64, mainPlace: "Milwaukee" },
  "53224": { cityShare: 1, mainPlace: "Milwaukee" },
  "53225": { cityShare: 0.8, mainPlace: "Milwaukee" },
  "53226": { cityShare: 0.1, mainPlace: "Wauwatosa" },
  "53227": { cityShare: 0.1, mainPlace: "West Allis" },
  "53228": { cityShare: 0.1, mainPlace: "Greenfield" },
  "53233": { cityShare: 1, mainPlace: "Milwaukee" },
  "53235": { cityShare: 0, mainPlace: "St. Francis" },
  "53295": { cityShare: 1, mainPlace: "Milwaukee" },
};

// A 5-digit ZIP, or a ZIP+4 (its first 5 digits), trimmed; anything else is null.
export function checkZip(raw: string): string | null {
  const m = /^(\d{5})(?:-\d{4})?$/.exec(raw.trim());
  return m ? m[1] : null;
}
```

- [ ] **Step 4: Write `convex/lib/zipFigures.ts`**

```ts
import { shareOf, sumOf, versus, type Est, type Verdict } from "./factMath";
import { cityFigure, FACTS, type Figure } from "./factSheet";

// A ZIP area's figures from Census values (spec 2026-10-14-zip-profile §5): code computes every one. Race and
// ethnicity from B03002 (Hispanic or Latino origin by race); the 8 measures are the fact sheets' own formulas.
export const RACE_TOTAL = "B03002_001";
export const RACE: { id: string; label: string; codes: string[] }[] = [
  { id: "white", label: "White (not Hispanic)", codes: ["B03002_003"] },
  { id: "black", label: "Black (not Hispanic)", codes: ["B03002_004"] },
  { id: "asian", label: "Asian (not Hispanic)", codes: ["B03002_006"] },
  { id: "two-or-more", label: "Two or more races (not Hispanic)", codes: ["B03002_009"] },
  // Native American, Pacific Islander and some other race: each small, so one row.
  { id: "other", label: "Other races (not Hispanic)", codes: ["B03002_005", "B03002_007", "B03002_008"] },
  { id: "hispanic", label: "Hispanic or Latino (any race)", codes: ["B03002_012"] },
];
export const RACE_CODES = [RACE_TOTAL, ...RACE.flatMap((r) => r.codes)];

export type ZipRow = { id: string; label: string; meaning: string; zip: Figure | null; city: Figure | null; verdict: Verdict };

function raceFigure(codes: string[], values: Record<string, Est> | undefined): Figure | null {
  const parts = codes.map((c) => values?.[c]);
  const of = values?.[RACE_TOTAL];
  if (parts.some((p) => !p) || !of) return null;
  const count = sumOf(parts as Est[]);
  return { rate: shareOf(count, of), count, of };
}

const verdictOf = (zip: Figure | null, city: Figure | null): Verdict => (zip?.rate && city?.rate ? versus(zip.rate, city.rate) : "unknown");

export function zipRows(values: Record<string, Est>, city: Record<string, Est> | undefined) {
  const race: ZipRow[] = RACE.map((r) => {
    const zip = raceFigure(r.codes, values);
    const c = raceFigure(r.codes, city);
    return { id: r.id, label: r.label, meaning: "Share of residents.", zip, city: c, verdict: verdictOf(zip, c) };
  });
  const facts: ZipRow[] = FACTS.filter((e) => e.census).map((e) => {
    const zip = cityFigure(e, values);
    const c = cityFigure(e, city);
    return { id: e.id, label: e.label, meaning: e.meaning, zip, city: c, verdict: verdictOf(zip, c) };
  });
  return { population: values[RACE_TOTAL] ?? null, race, facts };
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/lib/zips.test.ts`
Expected: PASS (8 tests). If "uses the fact sheets' formulas" finds fewer than 8 facts, count `FACTS.filter((e) => e.census)` and rule on it in the ledger (the spec says 8).

- [ ] **Step 6: Commit**

```bash
git add convex/lib/zips.ts convex/lib/zipFigures.ts tests/lib/zips.test.ts
git commit -m "feat: the 37 Milwaukee County ZIP areas and their figures from Census values (Z1)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Census requests for a ZIP area, and race in the city figures

**Files:**
- Modify: `convex/lib/census.ts` (`censusUrl`, `requestsFor`; add `zctaGeo`, `scrubKey`)
- Modify: `convex/cityFigures.ts` (use `scrubKey`; add `latestCityFigures`)
- Test: `tests/lib/census.test.ts`, `convex/cityFigures.test.ts`

**Interfaces:**
- Consumes: `RACE_CODES` from Task 1.
- Produces:
  - `censusUrl(period, kind, codes, key, geo?: string)`, where the default `geo` is the City's `for=place:53000&in=state:55`
  - `export const zctaGeo = (zip: string) => string`
  - `export const scrubKey = (s: string) => string`
  - `internal.cityFigures.latestCityFigures: () => { period: number; values: Record<string, Est> } | null`

- [ ] **Step 1: Write the failing tests.** Append to `tests/lib/census.test.ts`, extending the import to `censusUrl, parseCensus, requestsFor, scrubKey, zctaGeo`:

```ts
describe("ZIP areas (Z1)", () => {
  it("asks for one ZIP area instead of the City", () => {
    expect(censusUrl(2024, "", ["B03002_001"], "k", zctaGeo("53228"))).toBe("https://api.census.gov/data/2024/acs/acs5?get=B03002_001E,B03002_001M&for=zip%20code%20tabulation%20area:53228&key=k");
  });
  it("keeps the City URL unchanged without a geography", () => {
    expect(censusUrl(2024, "", ["B03002_001"], "k")).toBe("https://api.census.gov/data/2024/acs/acs5?get=B03002_001E,B03002_001M&for=place:53000&in=state:55&key=k");
  });
  it("adds the race codes to the detailed-table request, so the city refresh stores them", () => {
    expect(requestsFor().find((x) => x.kind === "")!.codes).toEqual(expect.arrayContaining(["B03002_001", "B03002_012", "B03002_008"]));
    expect(requestsFor()).toHaveLength(3);
  });
  it("scrubs the key from error text", () => {
    expect(scrubKey("fetch failed: https://api.census.gov/data?get=x&key=SECRET123&y=1")).toBe("fetch failed: https://api.census.gov/data?get=x&key=…&y=1");
    expect(scrubKey("no key here")).toBe("no key here");
  });
});
```

Append to `convex/cityFigures.test.ts` inside its `describe`:

```ts
  it("returns the newest stored period with its values, or null when none is stored", async () => {
    const t = await seed();
    expect(await t.query(internal.cityFigures.latestCityFigures, {})).toBeNull();
    process.env.CENSUS_API_KEY = "k";
    installFakeFetch({ census: reply });
    await t.action(internal.cityFigures.refreshCityFigures, {});
    expect(await t.query(internal.cityFigures.latestCityFigures, {})).toMatchObject({ period: 2024, values: { B03002_001: { estimate: 100, moe: 10 } } });
  });
```

- [ ] **Step 2: Run them to watch them fail**

Run: `npx vitest run tests/lib/census.test.ts convex/cityFigures.test.ts`
Expected: FAIL. `zctaGeo` and `scrubKey` aren't exported, and `latestCityFigures` doesn't exist.

- [ ] **Step 3: Change `convex/lib/census.ts`**

Replace the `MILWAUKEE`/`censusUrl` lines and `requestsFor` with:

```ts
import { RACE_CODES } from "./zipFigures";

const MILWAUKEE = "for=place:53000&in=state:55";
// A ZIP code tabulation area: national geography, no state needed (ACS 5-year, level 860).
export const zctaGeo = (zip: string) => `for=zip%20code%20tabulation%20area:${zip}`;
export const censusUrl = (period: number, kind: CensusPick["kind"], codes: string[], key: string, geo = MILWAUKEE) =>
  `${BASE}/${period}/acs/acs5${kind}?get=${codes.flatMap((c) => [`${c}E`, `${c}M`]).join(",")}&${geo}&key=${key}`;

// Every headline's codes, plus race and ethnicity (B03002) for the ZIP card's comparison, one request per table kind.
export function requestsFor(): { kind: CensusPick["kind"]; codes: string[] }[] {
  const by = new Map<CensusPick["kind"], Set<string>>([["", new Set(RACE_CODES)]]);
  for (const f of FACTS) if (f.census) for (const c of [...f.census.parts, f.census.of]) by.set(f.census.kind, (by.get(f.census.kind) ?? new Set()).add(c));
  return [...by].map(([kind, codes]) => ({ kind, codes: [...codes].sort() }));
}

// Never log the key: fetch errors can carry the full request URL.
export const scrubKey = (s: string) => s.replace(/key=[^&\s]+/g, "key=…");
```

Keep the header comment, but change "for the fact sheet's headlines" to "for the fact sheet's headlines and Ask's ZIP card".

- [ ] **Step 4: Change `convex/cityFigures.ts`**

- Import `scrubKey` from `./lib/census`.
- Replace `(e instanceof Error ? e.message : String(e)).replace(/key=[^&\s]+/g, "key=…")` with `scrubKey(e instanceof Error ? e.message : String(e))`.
- Add:

```ts
// The newest stored city figures, for the ZIP card's comparison and its survey years (spec 2026-10-14-zip-profile §5).
export const latestCityFigures = internalQuery({
  args: {},
  handler: async (ctx) => {
    const row = await ctx.db.query("cityFigures").withIndex("by_period").order("desc").first();
    return row ? { period: row.period, values: row.values } : null;
  },
});
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/lib/census.test.ts convex/cityFigures.test.ts tests/lib/factSheet.test.ts`
Expected: PASS. The existing "3 requests per period" assertion still holds, because race joins the detailed-table request.

- [ ] **Step 6: Commit**

```bash
git add convex/lib/census.ts convex/cityFigures.ts tests/lib/census.test.ts convex/cityFigures.test.ts
git commit -m "feat: Census requests for one ZIP area; race joins the city figures (Z1)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: The `zipProfile` action

**Files:**
- Create: `convex/zips.ts`
- Test: `convex/zips.test.ts`

**Interfaces:**
- Consumes:
  - `checkZip`, `COUNTY_ZIPS` (Task 1);
  - `zipRows`, `ZipRow` (Task 1);
  - `censusUrl`, `zctaGeo`, `scrubKey`, `requestsFor`, `parseCensus` (Task 2);
  - `internal.cityFigures.latestCityFigures` (Task 2);
  - `rateLimiter` with `"askCity"`;
  - `fetchWithTimeout` from `./lib/http`.
- Produces: `api.zips.zipProfile({ zip: string }): Promise<ZipResult>`, where:

```ts
export type ZipResult =
  | { status: "ok"; zip: string; period: string; cityShare: number; mainPlace: string; population: Est | null; race: ZipRow[]; facts: ZipRow[] }
  | { status: "bad-zip" | "outside" | "unavailable"; zip: string }
  | { status: "busy" };
```

- [ ] **Step 1: Write the failing tests** in `convex/zips.test.ts`:

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
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); delete process.env.CENSUS_API_KEY; });

// Every requested code: estimate 100 (the total, B03002_001 and B17001_001, 1000), margin 10.
const reply = (url: string) => {
  const codes = new URL(url).searchParams.get("get")!.split(",");
  return [[...codes, "zip code tabulation area"], [...codes.map((c) => (c.endsWith("M") ? "10" : /_001E$/.test(c) ? "1000" : "100")), "53228"]];
};
async function seed(city: Record<string, { estimate: number; moe: number | null }> = { B17001_001: { estimate: 500000, moe: 100 }, B17001_002: { estimate: 120000, moe: 100 } }) {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  await t.run(async (ctx) => { await ctx.db.insert("cityFigures", { period: 2024, values: city, fetchedAt: 0 }); });
  process.env.CENSUS_API_KEY = "SECRET123";
  return t;
}
const ask = (t: Awaited<ReturnType<typeof seed>>, zip: string) => t.withIdentity(reader).action(api.zips.zipProfile, { zip });

describe("zipProfile (Z1)", () => {
  it("needs sign-in", async () => {
    const t = await seed();
    await expect(t.action(api.zips.zipProfile, { zip: "53228" })).rejects.toThrow(/Sign in/);
  });
  it("answers a county ZIP+4 with its place, survey years, race and the 8 measures beside Milwaukee (review focus 2)", async () => {
    const t = await seed();
    const fake = installFakeFetch({ census: reply });
    const r = await ask(t, " 53228-1234 ");
    expect(r).toMatchObject({ status: "ok", zip: "53228", period: "2020–2024", cityShare: 0.1, mainPlace: "Greenfield", population: { estimate: 1000, moe: 10 } });
    expect(fake.count("zip%20code%20tabulation%20area:53228")).toBe(3);
    if (r.status !== "ok") throw new Error("not ok");
    expect(r.facts.find((x) => x.id === "poverty")).toMatchObject({ verdict: "lower" });
  });
  it("shows no Milwaukee race figures before the city refresh stores them (review focus 4)", async () => {
    const t = await seed();
    installFakeFetch({ census: reply });
    const r = await ask(t, "53228");
    if (r.status !== "ok") throw new Error("not ok");
    expect(r.race.every((x) => x.city === null && x.verdict === "unknown")).toBe(true);
  });
  it("refuses a malformed ZIP and a ZIP outside the county without calling the Census", async () => {
    const t = await seed();
    const fake = installFakeFetch({ census: reply });
    expect(await ask(t, "5322")).toEqual({ status: "bad-zip", zip: "5322" });
    expect(await ask(t, "53201")).toEqual({ status: "outside", zip: "53201" });
    expect(await ask(t, "60601")).toEqual({ status: "outside", zip: "60601" });
    expect(fake.count("api.census.gov")).toBe(0);
  });
  it("is unavailable when the Census fails, and never logs the key", async () => {
    const t = await seed();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    installFakeFetch({ census: reply, censusStatus: 500 });
    expect(await ask(t, "53228")).toEqual({ status: "unavailable", zip: "53228" });
    expect(log.mock.calls.flat().join(" ")).not.toContain("SECRET123");
  });
  it("is unavailable when the Census answers with a web page instead of a table (review focus 3)", async () => {
    const t = await seed();
    vi.spyOn(console, "error").mockImplementation(() => {});
    installFakeFetch({ census: () => "<html>Missing Key</html>" });
    expect(await ask(t, "53228")).toEqual({ status: "unavailable", zip: "53228" });
  });
  it("is unavailable with no key or no stored city figures", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const t = await seed();
    delete process.env.CENSUS_API_KEY;
    installFakeFetch({ census: reply });
    expect(await ask(t, "53228")).toEqual({ status: "unavailable", zip: "53228" });
    const empty = convexTest(schema, modules);
    rateLimiterTest.register(empty);
    process.env.CENSUS_API_KEY = "k";
    expect(await empty.withIdentity(reader).action(api.zips.zipProfile, { zip: "53228" })).toEqual({ status: "unavailable", zip: "53228" });
  });
  it("is busy when the City-count allowance is spent", async () => {
    const t = await seed();
    installFakeFetch({ census: reply });
    for (let i = 0; i < 20; i++) await ask(t, "53228");
    expect(await ask(t, "53228")).toEqual({ status: "busy" });
  });
});
```

- [ ] **Step 2: Run them to watch them fail**

Run: `npx vitest run convex/zips.test.ts`
Expected: FAIL, because `api.zips` doesn't exist. Then run `npx convex codegen` only if typecheck needs it; the local codegen is not a dev push.

- [ ] **Step 3: Write `convex/zips.ts`**

```ts
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action } from "./_generated/server";
import { censusUrl, parseCensus, requestsFor, scrubKey, zctaGeo } from "./lib/census";
import type { Est } from "./lib/factMath";
import { fetchWithTimeout } from "./lib/http";
import { zipRows, type ZipRow } from "./lib/zipFigures";
import { checkZip, COUNTY_ZIPS } from "./lib/zips";
import { rateLimiter } from "./limits";

const ZIP_TIMEOUT_MS = 15_000;
export type ZipResult =
  | { status: "ok"; zip: string; period: string; cityShare: number; mainPlace: string; population: Est | null; race: ZipRow[]; facts: ZipRow[] }
  | { status: "bad-zip" | "outside" | "unavailable"; zip: string }
  | { status: "busy" };

// Who lives in one ZIP area, live from the Census survey (spec 2026-10-14-zip-profile §5). Totals and shares only.
// Shares the City count's allowance. The survey years are the newest the stored city figures have, so they match.
export const zipProfile = action({
  args: { zip: v.string() },
  handler: async (ctx, { zip }): Promise<ZipResult> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Sign in to ask");
    const z = checkZip(zip);
    if (!z) return { status: "bad-zip", zip: zip.trim() };
    const area = COUNTY_ZIPS[z];
    if (!area) return { status: "outside", zip: z };
    if (!(await rateLimiter.limit(ctx, "askCity", { key: identity.tokenIdentifier })).ok) return { status: "busy" };
    const key = process.env.CENSUS_API_KEY;
    const city = await ctx.runQuery(internal.cityFigures.latestCityFigures, {});
    if (!key || !city) {
      console.error(`Census ZIP ${z} unavailable: ${!key ? "CENSUS_API_KEY is not set" : "no city figures stored"}`);
      return { status: "unavailable", zip: z };
    }
    try {
      const parts = await Promise.all(requestsFor().map(async (r) => {
        const res = await fetchWithTimeout(censusUrl(city.period, r.kind, r.codes, key, zctaGeo(z)), {}, ZIP_TIMEOUT_MS);
        if (!res.ok) throw new Error(`Census request failed: ${res.status}`);
        return parseCensus(await res.json(), r.codes);
      }));
      const values: Record<string, Est> = Object.assign({}, ...parts);
      return { status: "ok", zip: z, period: `${city.period - 4}–${city.period}`, ...area, ...zipRows(values, city.values) };
    } catch (e) {
      console.error(`Census ZIP ${z} failed: ${scrubKey(e instanceof Error ? e.message : String(e))}`);
      return { status: "unavailable", zip: z };
    }
  },
});
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run convex/zips.test.ts`
Expected: PASS (8 tests). If the fake's `census: () => "<html>…"` is returned as JSON-encoded text, `parseCensus` throws "Census reply was not a table". That is still `unavailable`, which is the behavior the test pins.

- [ ] **Step 5: Typecheck and commit**

Run: `npx tsc --noEmit -p . && npx tsc --noEmit -p convex`
Expected: no errors.

```bash
git add convex/zips.ts convex/zips.test.ts convex/_generated
git commit -m "feat: zipProfile asks the Census for one Milwaukee County ZIP area, beside Milwaukee (Z1)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

(Stage `convex/_generated` only if codegen changed it and the repo tracks it. Check with `git status`.)

---

### Task 4: Ask uses `zipProfile`

**Files:**
- Modify: `lib/ask/tools.ts` (type, `AskToolName`, `AskBackend.zip`, `zipParams`, the tool)
- Modify: `lib/ask/backend.ts`, `scripts/ask-report-card.ts` (backend `zip`)
- Modify: `lib/ask/prompt.ts` (one line), `lib/ask/model.ts` (scripted branch and its doc comment)
- Modify: `scripts/ask-questions.ts` (graded question)
- Modify the test backends: `tests/ui/ask.test.ts`, `tests/ui/askTools.test.ts`
- Test: `tests/ui/askTools.test.ts`

**Interfaces:**
- Consumes: `api.zips.zipProfile` (Task 3).
- Produces:
  - `export type ZipAnswer = FunctionReturnType<typeof api.zips.zipProfile>`
  - `export const zipParams = z.object({ zip: z.string().max(12) })`
  - `"zipProfile"` in `AskToolName`
  - `AskBackend.zip(a: { zip: string }): Promise<ZipAnswer>`

- [ ] **Step 1: Write the failing test.** Append to `tests/ui/askTools.test.ts`, and add `zip: async () => ({ status: "busy" }) as never,` to its `backend()` helper next to `turnout:`:

```ts
describe("zipProfile (Z1)", () => {
  it("offers zipProfile for ZIP questions and never adding up tracts", async () => {
    let asked: unknown;
    const tool = askTools({ ...backend({}), zip: async (a) => { asked = a; return { status: "busy" } as never; } }).find((t) => t.name === "zipProfile")!;
    expect(tool.description).toMatch(/ZIP/);
    expect(tool.description).toMatch(/never .*add(ing)? up tracts/i);
    await tool.execute({ zip: "53228" } as never);
    expect(asked).toEqual({ zip: "53228" });
  });
});
```

- [ ] **Step 2: Run it to watch it fail**

Run: `npx vitest run tests/ui/askTools.test.ts`
Expected: FAIL. TypeScript accepts the extra key at runtime, and the find returns undefined, so it fails on "Cannot read properties of undefined".

- [ ] **Step 3: Change `lib/ask/tools.ts`**

- Next to the other result types: `export type ZipAnswer = FunctionReturnType<typeof api.zips.zipProfile>;`
- Add `| "zipProfile"` to `AskToolName`.
- In `AskBackend`: `zip(a: { zip: string }): Promise<ZipAnswer>;`
- Near the other param schemas: `export const zipParams = z.object({ zip: z.string().max(12).describe("One 5-digit ZIP code, e.g. 53212.") });`
- In `askTools`, after `countTurnout`:

```ts
    {
      name: "zipProfile",
      description: "Who lives in one ZIP code in Milwaukee County and what it's like: population, race and ethnicity, poverty, low incomes, renters, vacant homes, rent burden, households with no car, and schooling, each beside Milwaukee's figure, from the U.S. Census Bureau's American Community Survey for that ZIP's Census area. One ZIP per call. Never answer a ZIP question by adding up tracts or neighborhoods. If the card says most of the ZIP is outside the City of Milwaukee, say that first. If it returns outside, say Ask covers ZIP codes that touch Milwaukee County; bad-zip, ask for a 5-digit ZIP; unavailable or busy, try later. The card carries every figure; don't restate them.",
      parameters: zipParams,
      execute: (a: z.infer<typeof zipParams>) => b.zip(a),
    },
```

- [ ] **Step 4: Wire the backends**

- `lib/ask/backend.ts`: `zip: (a) => fetchAction(api.zips.zipProfile, a, { token }),`
- `scripts/ask-report-card.ts`: `zip: async (a) => run("zips:zipProfile", a, true),`
- `tests/ui/ask.test.ts` backend stub, next to `turnout:`: `zip: async () => ({ status: "busy" }) as never,`

- [ ] **Step 5: Prompt, scripted model, graded question**

- `lib/ask/prompt.ts`, after the `countTurnout` line:

```
- For who lives in a ZIP code or what it's like, use zipProfile with that ZIP. Never add up tracts or neighborhoods for a ZIP. When the card says most of the ZIP is outside the City of Milwaukee, say that first. Don't restate the card's figures.
```

- `lib/ask/model.ts`: add the branch just before `question.includes("did turnout change")`:

```ts
                : question.includes("53228")
                ? call("zipProfile", { zip: "53228" })
```

  In the doc comment's keyword list, add `"53228" → zipProfile 53228;` before `"did turnout change"`.

- `scripts/ask-questions.ts`, after the turnout question:

```ts
  { q: "What is the demographic makeup of 53228?", tool: "zipProfile", expect: { status: "ok", zip: "53228" }, final: true },
```

- [ ] **Step 6: Run the tests and typecheck**

Run: `npx vitest run tests/ui && npx tsc --noEmit -p .`
Expected: PASS, with no type errors (every `AskBackend` object now has `zip`).

- [ ] **Step 7: Commit**

```bash
git add lib/ask scripts/ask-report-card.ts scripts/ask-questions.ts tests/ui/ask.test.ts tests/ui/askTools.test.ts
git commit -m "feat: Ask answers ZIP questions with zipProfile; scripted and graded checks (Z1)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: The ZIP card

**Files:**
- Create: `ui/lib/zipText.ts`
- Create: `ui/components/ZipCard.tsx`
- Modify: `ui/components/ProvenanceTag.tsx` (`CENSUS`), `ui/components/AskCards.tsx` (renderer)
- Test: `tests/ui/zipText.test.ts`

**Interfaces:**
- Consumes:
  - `ZipAnswer`, `zipParams` (Task 4);
  - `pct`, `margin`, `verdictText` from `ui/lib/factText.ts`;
  - `exported`, `safeName`, `CardExport`, `Ctx` from `ui/lib/cardExport.ts`.
- Produces:
  - `ZipOk`
  - `zipTitle(r)`
  - `placeNote(a: { cityShare: number; mainPlace: string }): string | null`
  - `zipRefusal(r): string`
  - `ZIP_NOTES: string[]`
  - `zipSource(period)`
  - `zipExport(r, ctx): CardExport`

- [ ] **Step 1: Write the failing tests** in `tests/ui/zipText.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { placeNote, zipExport, zipRefusal, zipTitle, type ZipOk } from "../../ui/lib/zipText";

const fig = (rate: number) => ({ rate: { estimate: rate, moe: 0.02 }, count: { estimate: 100, moe: 10 }, of: { estimate: 1000, moe: 10 } });
const r: ZipOk = {
  status: "ok", zip: "53228", period: "2020–2024", cityShare: 0.1, mainPlace: "Greenfield", population: { estimate: 14250, moe: 512 },
  race: [{ id: "white", label: "White (not Hispanic)", meaning: "Share of residents.", zip: fig(0.72), city: null, verdict: "unknown" }],
  facts: [{ id: "poverty", label: "People in poverty", meaning: "", zip: fig(0.08), city: fig(0.24), verdict: "lower" }],
};
const ctx = { origin: "https://x", date: "October 14, 2026" };

describe("ZIP card words (Z1)", () => {
  it("titles the card with the ZIP and survey years", () => {
    expect(zipTitle(r)).toBe("ZIP 53228 · Census estimates, 2020–2024");
  });
  it("says where the ZIP is unless nearly all of it is in the City (review focus 5)", () => {
    expect(placeNote({ cityShare: 0.1, mainPlace: "Greenfield" })).toBe("About 10% of this ZIP's land is in the City of Milwaukee; the largest part is in Greenfield. These figures cover the whole ZIP.");
    expect(placeNote({ cityShare: 0.5, mainPlace: "Milwaukee" })).toBe("About 50% of this ZIP's land is in the City of Milwaukee; the rest is in neighboring communities. These figures cover the whole ZIP.");
    expect(placeNote({ cityShare: 0.94, mainPlace: "Milwaukee" })).toMatch(/^About 94%/);
    expect(placeNote({ cityShare: 0.95, mainPlace: "Milwaukee" })).toBeNull();
    expect(placeNote({ cityShare: 0, mainPlace: "Cudahy" })).toBe("None of this ZIP's land is in the City of Milwaukee; the largest part is in Cudahy. These figures cover the whole ZIP.");
  });
  it("words each refusal", () => {
    expect(zipRefusal({ status: "outside", zip: "60601" })).toMatch(/touch Milwaukee County; 60601 isn't one of them/);
    expect(zipRefusal({ status: "bad-zip", zip: "5322" })).toMatch(/5-digit ZIP/);
    expect(zipRefusal({ status: "unavailable", zip: "53228" })).toBe("Census figures are unavailable right now; try again later.");
    expect(zipRefusal({ status: "busy" })).toMatch(/busy/);
  });
  it("exports every row with shares, margins, Milwaukee and the comparison, and the notes", () => {
    const e = zipExport(r, ctx);
    expect(e.title).toBe("ZIP 53228 · Census estimates, 2020–2024");
    expect(e.lines[0]).toBe("14,250 people (± 512)");
    expect(e.csv.rows).toEqual([["White (not Hispanic)", 72, 2, null, ""], ["People in poverty", 8, 2, 24, "clearly lower than the city"]]);
    expect(e.text.rows[1]).toEqual(["People in poverty", "8.0% ± 2.0 points", "24.0%", "clearly lower than the city"]);
    expect(e.text.rows[0][2]).toBe("—");
    expect(e.notes).toEqual(expect.arrayContaining([expect.stringMatching(/close to, but not exactly, the post office's ZIP/), "U.S. Census Bureau, American Community Survey 5-year estimates, 2020–2024."]));
    expect(e.filename).toBe("almanac_zip_53228");
  });
});
```

- [ ] **Step 2: Run them to watch them fail**

Run: `npx vitest run tests/ui/zipText.test.ts`
Expected: FAIL, because `ui/lib/zipText` doesn't exist.

- [ ] **Step 3: Write `ui/lib/zipText.ts`**

```ts
import type { ZipAnswer } from "@/lib/ask/tools";
import { exported, safeName, type CardExport, type Ctx } from "./cardExport";
import { margin, pct, verdictText } from "./factText";

// The ZIP card's words and export (spec 2026-10-14-zip-profile §6). Every figure comes from the tool.
export type ZipOk = Extract<ZipAnswer, { status: "ok" }>;
type Row = ZipOk["race"][number];

export const zipTitle = (r: Pick<ZipOk, "zip" | "period">) => `ZIP ${r.zip} · Census estimates, ${r.period}`;
export const zipSource = (period: string) => `U.S. Census Bureau, American Community Survey 5-year estimates, ${period}.`;
export const ZIP_NOTES = [
  "A Census ZIP area is close to, but not exactly, the post office's ZIP.",
  "These are survey estimates; each comes with a margin of error, the range the true number likely falls in (90% confidence).",
];

// Shown unless 95% or more of the ZIP's land is in the City. Land, not people.
export function placeNote(a: { cityShare: number; mainPlace: string }): string | null {
  if (a.cityShare >= 0.95) return null;
  const tail = "These figures cover the whole ZIP.";
  if (a.cityShare === 0) return `None of this ZIP's land is in the City of Milwaukee; the largest part is in ${a.mainPlace}. ${tail}`;
  const share = `About ${Math.round(a.cityShare * 100)}% of this ZIP's land is in the City of Milwaukee`;
  return a.mainPlace === "Milwaukee" ? `${share}; the rest is in neighboring communities. ${tail}` : `${share}; the largest part is in ${a.mainPlace}. ${tail}`;
}

export function zipRefusal(r: Exclude<ZipAnswer, { status: "ok" }>): string {
  switch (r.status) {
    case "outside": return `Ask has Census figures for the ZIP codes that touch Milwaukee County; ${r.zip} isn't one of them. Post-office-box ZIPs have no residents in the Census.`;
    case "bad-zip": return "Give a 5-digit ZIP code, like 53212.";
    case "busy": return "Census figures are busy right now; try again shortly.";
    default: return "Census figures are unavailable right now; try again later.";
  }
}

const points = (x: number | null | undefined) => (x === null || x === undefined ? null : Math.round(x * 1000) / 10);
export const populationLine = (p: ZipOk["population"]) =>
  p ? `${Math.round(p.estimate).toLocaleString("en-US")} people${p.moe === null ? "" : ` (± ${Math.round(p.moe).toLocaleString("en-US")})`}` : "Population unavailable";
export const shareCell = (x: Row) => (x.zip?.rate ? `${pct(x.zip.rate)} ${margin(x.zip.rate)}`.trim() : "—");
export const cityCell = (x: Row) => pct(x.city?.rate ?? null);

export function zipExport(r: ZipOk, ctx: Ctx): CardExport {
  const rows = [...r.race, ...r.facts];
  return {
    title: zipTitle(r),
    lines: [populationLine(r.population), ...(placeNote(r) ? [placeNote(r)!] : [])],
    csv: {
      head: ["Measure", `ZIP ${r.zip} (%)`, "Margin (± points)", "Milwaukee (%)", "Compared with Milwaukee"],
      rows: rows.map((x) => [x.label, points(x.zip?.rate?.estimate), points(x.zip?.rate?.moe), points(x.city?.rate?.estimate), verdictText(x.verdict)]),
    },
    text: { head: ["Measure", `ZIP ${r.zip}`, "Milwaukee", "Compared with Milwaukee"], rows: rows.map((x) => [x.label, shareCell(x), cityCell(x), verdictText(x.verdict)]) },
    notes: [...ZIP_NOTES, zipSource(r.period), exported(ctx)],
    filename: safeName(["zip", r.zip]),
  };
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/ui/zipText.test.ts`
Expected: PASS (4 tests). If `CardExport`'s `lines` type rejects the conditional spread, use `.filter((x): x is string => Boolean(x))`.

- [ ] **Step 5: Add the CENSUS tag.** In `ui/components/ProvenanceTag.tsx`:
  - widen both `Provenance | "CITY"` types to `Provenance | "CITY" | "CENSUS"`;
  - add `CENSUS: { short: "CENSUS", title: "From the U.S. Census Bureau's American Community Survey" },`;
  - update the comment: "CITY and CENSUS are display-only".

- [ ] **Step 6: Write `ui/components/ZipCard.tsx`**

```tsx
"use client";

import { cityCell, placeNote, populationLine, shareCell, zipExport, zipSource, zipTitle, ZIP_NOTES, type ZipOk } from "@/ui/lib/zipText";
import { verdictText } from "@/ui/lib/factText";
import { ExportBar } from "./ExportBar";
import { ProvenanceTag } from "./ProvenanceTag";
import styles from "./ask.module.css";

// Who lives in one ZIP area, from the Census survey, beside Milwaukee (spec 2026-10-14-zip-profile §6).
function Rows({ caption, rows, zip }: { caption: string; rows: ZipOk["race"]; zip: string }) {
  return (
    <div className={styles.tractScroll} tabIndex={0} role="region" aria-label={`${caption}, scroll sideways for more`}>
      <table className={styles.excerptTable}>
        <caption>{caption}</caption>
        <thead><tr><th scope="col">Measure</th><th scope="col">ZIP {zip}</th><th scope="col">Milwaukee</th><th scope="col">Compared with Milwaukee</th></tr></thead>
        <tbody>
          {rows.map((x) => (
            <tr key={x.id}><th scope="row">{x.label}</th><td>{shareCell(x)}</td><td>{cityCell(x)}</td><td>{verdictText(x.verdict)}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ZipCard({ r }: { r: ZipOk }) {
  const where = placeNote(r);
  return (
    <figure className={styles.excerpt} data-card="zip">
      <figcaption className={styles.excerptTitle}>{zipTitle(r)} <ProvenanceTag source="CENSUS" /></figcaption>
      {where && <p className={styles.source} data-place-note>{where}</p>}
      <p className={styles.source}>{populationLine(r.population)}</p>
      <Rows caption="Who lives here" rows={r.race} zip={r.zip} />
      <Rows caption="Living here" rows={r.facts} zip={r.zip} />
      {ZIP_NOTES.map((n) => <p key={n} className={styles.source}>{n}</p>)}
      <p className={styles.source} data-source>{zipSource(r.period)}</p>
      <ExportBar make={(ctx) => zipExport(r, ctx)} />
    </figure>
  );
}
```

- [ ] **Step 7: Register the renderer** in `ui/components/AskCards.tsx`:
  - add `zipParams` and `type ZipAnswer` to the `@/lib/ask/tools` import;
  - import `ZipCard` from `./ZipCard` and `zipRefusal` from `@/ui/lib/zipText`;
  - after the `countTurnout` renderer:

```tsx
  useRenderTool({ name: "zipProfile", parameters: zipParams, render: (props) => {
    if (props.status !== "complete") return <Busy />;
    const r = parse<ZipAnswer>(props.result);
    if (!r) return <Failed />;
    if (r.status !== "ok") return <p className={styles.failed} data-card="zip-refusal">{zipRefusal(r)}</p>;
    return <ZipCard r={r} />;
  } }, []);
```

- [ ] **Step 8: Run the UI tests, typecheck and lint**

Run: `npx vitest run tests/ui && npx tsc --noEmit -p . && npx eslint ui/components/ZipCard.tsx ui/lib/zipText.ts ui/components/AskCards.tsx`
Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git add ui/lib/zipText.ts ui/components/ZipCard.tsx ui/components/ProvenanceTag.tsx ui/components/AskCards.tsx tests/ui/zipText.test.ts
git commit -m "feat: the ZIP card: where the ZIP is, who lives there, beside Milwaukee, with a CENSUS tag (Z1)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: A ZIP the person typed isn't UNVERIFIED

**Files:**
- Modify: `ui/lib/askProse.ts` (`proseSegments(text, data, asked)`)
- Modify: `ui/components/AskPanel.tsx` (pass `asked` through `Prose` → `Words`)
- Test: `tests/ui/ask.test.ts`

**Interfaces:**
- Produces: `proseSegments(text: string, data = "", asked = ""): { text: string; unverified: boolean }[]`

- [ ] **Step 1: Write the failing test.** Append inside the prose `describe` in `tests/ui/ask.test.ts`:

```ts
  it("allows a 5-digit number the person typed in their question, and only that (Z1)", () => {
    const flag = (t: string, asked: string) => proseSegments(t, "", asked).filter((s) => s.unverified).map((s) => s.text);
    expect(flag("Most of 53228 is in Greenfield.", "what is the demographic makeup of 53228")).toEqual([]);
    expect(flag("Most of it is outside 53228.", "makeup of 53228?")).toEqual([]);
    expect(flag("Most of 53228 is in Greenfield.", "what about Greenfield")).toEqual(["53228"]);
    expect(flag("About 40% rent; 12345 people.", "is it 40% renters? 12345")).toEqual(["40%"]);
  });
```

- [ ] **Step 2: Run it to watch it fail**

Run: `npx vitest run tests/ui/ask.test.ts -t "5-digit"`
Expected: FAIL. The first expectation returns `["53228"]`.

- [ ] **Step 3: Change `ui/lib/askProse.ts`**

- Add to the comment block above `NUMBER`: `A 5-digit number the person typed (their ZIP) is a name too; nothing else they typed is.`
- Change `allowedSpans` and `proseSegments`:

```ts
// A 5-digit number the person typed: their ZIP, a name (spec 2026-10-14-zip-profile §8). Only 5-digit tokens.
function askedZips(text: string, asked: string): [number, number][] {
  const typed = new Set(asked.match(/(?<!\d)\d{5}(?!\d)/g) ?? []);
  return [...text.matchAll(/(?<!\d|\d[.,])\d{5}(?!\d|[.,]\d|%)/g)].filter((m) => typed.has(m[0])).map((m): [number, number] => [m.index, m.index + 5]);
}

function allowedSpans(text: string, data: string, asked: string): [number, number][] {
  const defined = DEFINITIONS.flatMap((re) => [...text.matchAll(re)]).map((m): [number, number] => [m.index, m.index + m[0].length]);
  return [...quotedFromData(text, data), ...defined, ...documentedDurations(text, data), ...namedTracts(text, data), ...askedZips(text, asked)];
}

// `data` is what the conversation's tools returned (their results as text); quoted labels must come from it.
// `asked` is what the person typed; only a 5-digit number from it (a ZIP) is allowed.
export function proseSegments(text: string, data = "", asked = ""): { text: string; unverified: boolean }[] {
  const allowed = allowedSpans(text, data, asked);
```

(The rest of `proseSegments` is unchanged.)

- [ ] **Step 4: Pass `asked` in `ui/components/AskPanel.tsx`**

- Give `Words` and `Prose` an `asked: string` prop and pass it down: `proseSegments(text, data, asked)`, `<Words text={…} data={data} asked={asked} />`.
- Next to `const data = …`, add:

```ts
  // What the person typed: a ZIP they named isn't a figure the model made up.
  const asked = messages.filter((m) => m.role === "user").map((m) => (typeof m.content === "string" ? m.content : "")).join("\n");
```

- Pass it on: `<Prose text={text} data={data} asked={asked} />`.

- [ ] **Step 5: Run the tests and typecheck**

Run: `npx vitest run tests/ui/ask.test.ts && npx tsc --noEmit -p .`
Expected: PASS. Existing prose tests are unchanged, since `asked` defaults to "".

- [ ] **Step 6: Commit**

```bash
git add ui/lib/askProse.ts ui/components/AskPanel.tsx tests/ui/ask.test.ts
git commit -m "fix: a ZIP the person typed isn't marked unverified in Ask's reply (Z1)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Browser test and docs

**Files:**
- Modify: `e2e/ask.spec.ts`
- Create: `docs/decisions/046-zip-answers.md`
- Modify: `ui/components/HowItWorks.tsx` (one sentence), `docs/research/2026-10-12-questions-by-audience.md` (one row)

- [ ] **Step 1: Add the browser test** after the vacant-buildings test in `e2e/ask.spec.ts`:

```ts
  test("a ZIP question draws the Census ZIP card with where the ZIP is (Z1)", async ({ page }) => {
    test.skip(!(await page.request.get("https://api.census.gov/data.json").then((r) => r.ok()).catch(() => false)), "Census API unreachable");
    await ask(page, "What is the demographic makeup of 53228?");
    const card = page.locator("[data-card=zip]:visible");
    await expect(card).toBeVisible({ timeout: 40_000 });
    await expect(card).toContainText("ZIP 53228 · Census estimates");
    await expect(card.locator("[data-place-note]")).toContainText("the largest part is in Greenfield");
    await expect(card).toContainText("Hispanic or Latino (any race)");
    await expect(card.getByTitle("From the U.S. Census Bureau's American Community Survey")).toBeVisible();
    await expect(card.locator("[data-export]").getByRole("button", { name: "CSV" })).toBeVisible();
  });
```

It runs in Task 8, after the dev push.

- [ ] **Step 2: Write `docs/decisions/046-zip-answers.md`.** Follow the format of `docs/decisions/045-open-age.md` (Decision, Why this came up, Options, What we chose and why, What we gave up, How we'll know, What actually happened).

  **Content:**
  - **Decision:** Ask answers ZIP-code questions from the Census survey's ZIP areas, live, beside Milwaukee.
  - **Why:** a real question about 53228 got a refusal. 53228 is 89% Greenfield by land.
  - **Options:**
    - Census ZIP areas live (chosen);
    - adding up DYCU tract figures split by land area (people aren't spread evenly, and margins combine badly);
    - a better refusal only.
  - **Chose:** Tarik, 2026-10-14, the measures, county reach and live fetching.
  - **Gave up:**
    - a third source beside DYCU and the City;
    - an answer only when the Census is up;
    - land shares, not people;
    - a Census ZIP area ≠ the post office ZIP.
  - **How we'll know:** the graded question passes, the card shows the Greenfield note, and no "unavailable" in a month of logs.
  - **What actually happened:** left blank.
  - Define "ZIP code tabulation area" inline on first use.

- [ ] **Step 3: How it works.** In `ui/components/HowItWorks.tsx`, after the "how long" paragraph, add a paragraph in the same markup:

```tsx
            <p>
              Ask can describe one ZIP code in Milwaukee County: who lives there and how it compares with Milwaukee, from the U.S. Census
              Bureau&apos;s survey for that ZIP&apos;s Census area, marked <ProvenanceTag source="CENSUS" />. When most of a ZIP lies outside the
              City, the card says so; the figures cover the whole ZIP.
            </p>
```

(If `ProvenanceTag` isn't imported in that file, it is at line 80, where it's already used.)

- [ ] **Step 4: Questions doc.** In `docs/research/2026-10-12-questions-by-audience.md`, next to the vacant-buildings row, add a row with the same columns: "What is the demographic makeup of 53228?" marked **Now**, with the tool `zipProfile` (Z1).

- [ ] **Step 5: Run the whole suite, typecheck and build**

Run: `npx vitest run > .superpowers/z1-suite.log 2>&1; tail -5 .superpowers/z1-suite.log && npx tsc --noEmit -p . && npm run build > .superpowers/z1-build.log 2>&1; tail -3 .superpowers/z1-build.log`
Expected: all files pass, no type errors, and the build succeeds.

- [ ] **Step 6: Commit**

```bash
git add e2e/ask.spec.ts docs/decisions/046-zip-answers.md ui/components/HowItWorks.tsx docs/research/2026-10-12-questions-by-audience.md
git commit -m "docs: decision 046, How it works and the questions list for ZIP answers; browser check (Z1)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Live checks (each needs Tarik's OK)

- [ ] **Step 1: Ask Tarik** which checks to run. Offer:
  - **Dev push + one live 53228 lookup:** it changes the dev deployment.
  - **Local browser tests:** about 4 minutes; mind the shared test account's allowance.
  - **The graded real-AI question:** about $0.05.

- [ ] **Step 2 (with OK): dev push and key check**

Run: `npx convex dev --once` and then `npx convex env get CENSUS_API_KEY > /dev/null && echo "dev key set"`. The value is never printed.
Expected: deploy succeeds and "dev key set" is printed. If it isn't set, stop and tell Tarik (he sets it, the key never passes through this session).

- [ ] **Step 3 (with OK): live lookup on dev.** Run `npx convex run cityFigures:refreshCityFigures` first, so dev's Milwaukee race figures exist; this is a dev data run, so it needs the OK. Then:

Run: `npx convex run zips:zipProfile '{"zip":"53228"}' --identity '{"subject":"check","issuer":"cli","tokenIdentifier":"cli|check"}'`
Expected:
- `status: "ok"`;
- population in the tens of thousands;
- the six race shares sum to about 100%;
- `mainPlace: "Greenfield"`;
- Milwaukee's race figures present.

Record the figures in the ledger.

- [ ] **Step 4 (with OK): local browser tests.** Run the app on :3100 with `BASE_URL`. Port 3000 is another app.

Run: `BASE_URL=http://localhost:3100 npx playwright test e2e/ask.spec.ts -g "ZIP question|vacant"`
Expected: pass on desktop and phone.

- [ ] **Step 5 (with OK): graded question**

Run: `N=$(npx tsx -e 'import("./scripts/ask-questions.ts").then((m) => console.log(m.ASK_QUESTIONS.findIndex((q) => q.q.includes("53228")) + 1))') && npx tsx scripts/ask-report-card.ts --only=$N --cap=0.25` (`--only` is 1-based).
Expected: a hit on `zipProfile` with 53228.
