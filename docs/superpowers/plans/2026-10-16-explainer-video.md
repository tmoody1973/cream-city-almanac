# Explainer Video Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A 90 s wide and a 30 s vertical Remotion video, plus two thumbnail stills, that explain Cream City Almanac with real production numbers, one real address-lookup recording, and music.

**Architecture:** A self-contained Remotion project in `video/` (own `package.json`, outside the site's typecheck, tests, lint and Vercel upload). Text lives in one `copy.ts` checked word for word against the spec's claims table; numbers live in one `data.json` written by a snapshot script from production's public endpoints; scenes are React components timed in "wide frames" and scaled for the vertical cut by one factor `k`.

**Tech Stack:** Remotion 4 (`remotion`, `@remotion/media`, `@remotion/google-fonts`), React, TypeScript, Node 26 built-in test runner (`node --test`, runs `.ts` with type stripping), `convex/browser` `ConvexHttpClient` (resolved from the repo root's `node_modules`), ego-browser, ffmpeg/ffprobe.

**Spec:** `docs/superpowers/specs/2026-10-16-explainer-video-design.md`

## Global Constraints

- Wide: 1920×1080, 30 fps, 2700 frames. Vertical: 1080×1920, 30 fps, 900 frames. Thumbnails: 1280×720 and 1080×1920 PNG.
- Every visible word comes from the claims table (scenes hold no literal JSX text). No number appears unless it comes from `data.json`. Only digits allowed in copy: `2005`, `2015`.
- Frame 0 is never blank.
- Colors: paper `#ffffff`, ink `#111111`, band `#ededea`, muted `#5c5c5c`, grease pencil `#d7261e`. No shadows, no rounded corners, no gradients.
- Fonts: Saira variable (50% width, 900) wordmark only; Saira Extra Condensed 700/900 caps; Caveat 600 pencil handwriting; Vazirmatn 400/500/700 body.
- Text sizes: headline ≥ 84 px and supporting ≥ 44 px per 1080 px of width (`u = width / 1080`). Safe area: ≥ 80u px sides; ≥ 100 px top/bottom (scaled to height).
- The address shown is Milwaukee City Hall, `200 E Wells St`. Never a home.
- Production Convex URL (public): `https://spotted-tern-278.convex.cloud`.
- Nothing about a specific property, owner or person. No testimonials.
- Render MP4s only when Tarik asks. Stills for review are fine.
- Never stage `.superpowers/` or `clerk-creamcityalmanac.app.zone`. Commit trailer: `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

## Review Focus

1. Snapshot day has no robberies yet, or the City endpoint is busy → the script must fail loudly and write nothing, never a 0 or a stale file silently (Task 3 tests `busy`; a real `0` is a valid count and is shown).
2. Address clip shorter than the 15 s scene → the last frame must hold, not go blank (Task 4 holds the final frame to ≥ 16 s and checks with ffprobe).
3. Music shorter than 90 s → silence at the end (Task 5 checks duration ≥ 92 s).
4. Long copy wrapping past the safe area in the vertical layout → stills of every vertical scene viewed at full size (Task 9).
5. Wordmark font not loaded at render → fallback font in the frame (Task 6 still of S2 shows the 50%-width Saira; `delayRender` blocks until loaded, `cancelRender` on failure).

---

### Task 1: Scaffold the Remotion project and keep it out of the site

**Files:**
- Create: `video/` (scaffold), `video/public/fonts/saira-var.woff2`, `video/src/theme.ts`
- Modify: `.gitignore`, `.vercelignore` (create if absent), `video/tsconfig.json`

**Interfaces:**
- Produces: `C` (colors) and `F` (`{ mark, caps, hand, body }` font-family strings) from `video/src/theme.ts`.

- [ ] **Step 1: Scaffold**

```bash
cd /Users/tarikmoody/Projects/dycu/inventory
npx create-video@latest --yes --blank --no-tailwind video
ls -a video
```
Expected: `package.json`, `src/Root.tsx`, `src/index.ts`, `remotion.config.ts`. If `video/.git` exists (a fresh empty repo the scaffold made), remove it: `rm -rf video/.git` — this repo tracks `video/`.

- [ ] **Step 2: Install packages**

```bash
cd video && npm i && npx remotion add @remotion/google-fonts @remotion/media
ls node_modules/@remotion/google-fonts | grep -E "^(SairaExtraCondensed|Caveat|Vazirmatn)$"
```
Expected: three lines.

- [ ] **Step 3: Isolation**

```bash
cd /Users/tarikmoody/Projects/dycu/inventory
printf '\n# Explainer video (Remotion): renders and screenshot frames\nvideo/out/\nvideo/.frames/\n' >> .gitignore
grep -qx 'video' .vercelignore 2>/dev/null || echo 'video' >> .vercelignore
```
In `video/tsconfig.json` set `"include": ["src"]` and `"resolveJsonModule": true` under `compilerOptions`. Root `tsconfig.json` lists folders explicitly and Vitest only globs `convex/**` and `tests/**`, so neither sees `video/`.

- [ ] **Step 4: Vendor the wordmark font (OFL)**

```bash
cd video
css=$(curl -s -A "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36" "https://fonts.googleapis.com/css2?family=Saira:wdth,wght@50..125,100..900&display=swap")
url=$(echo "$css" | awk '/\/\* latin \*\//{f=1} f&&/src:/{match($0,/https:[^)]+/); print substr($0,RSTART,RLENGTH); exit}')
mkdir -p public/fonts && curl -s -o public/fonts/saira-var.woff2 "$url" && file public/fonts/saira-var.woff2
```
Expected: `Web Open Font Format (Version 2)`.

- [ ] **Step 5: Write `video/src/theme.ts`**

```ts
import { cancelRender, continueRender, delayRender, staticFile } from "remotion";
import { loadFont as caps } from "@remotion/google-fonts/SairaExtraCondensed";
import { loadFont as hand } from "@remotion/google-fonts/Caveat";
import { loadFont as body } from "@remotion/google-fonts/Vazirmatn";

// DESIGN.md colors.
export const C = { pencil: "#d7261e", paper: "#ffffff", ink: "#111111", band: "#ededea", muted: "#5c5c5c" } as const;

// The wordmark's variable Saira (width axis 50–125%), the same face app/layout.tsx loads; rendering waits for it.
const wait = delayRender("Saira variable");
new FontFace("SairaVar", `url(${staticFile("fonts/saira-var.woff2")}) format("woff2")`, { weight: "100 900", stretch: "50% 125%" })
  .load()
  .then((f) => {
    document.fonts.add(f);
    continueRender(wait);
  })
  .catch(cancelRender);

export const F = {
  mark: "SairaVar",
  caps: caps("normal", { weights: ["700", "900"], subsets: ["latin"] }).fontFamily,
  hand: hand("normal", { weights: ["600"], subsets: ["latin"] }).fontFamily,
  body: body("normal", { weights: ["400", "500", "700"], subsets: ["latin"] }).fontFamily,
};
```

- [ ] **Step 6: Typecheck and Studio boots**

```bash
cd video && npx tsc --noEmit && (npx remotion studio --no-open --port 3200 & sleep 15; curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3200; kill %1)
```
Expected: no tsc output; `200`.

- [ ] **Step 7: Commit**

```bash
cd /Users/tarikmoody/Projects/dycu/inventory
git add .gitignore .vercelignore video
git status --short | grep -E "superpowers|clerk" && echo "STOP: unstaged files leaked" || true
git commit -m "feat(video): scaffold Remotion project, kept out of the site build

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 2: Copy and timeline, checked against the spec

**Files:**
- Create: `video/src/copy.ts`, `video/src/timeline.ts`, `video/tests/copy.test.ts`, `video/tests/timeline.test.ts`
- Modify: `video/package.json` (add `"test": "node --test tests/"`)

**Interfaces:**
- Produces: `COPY: Record<Id, { text: string; source: string }>`; `WIDE`, `VERTICAL`: `readonly { id: SceneId; frames: number }[]`; `total(tl): number`; `wideFrames(id): number`; type `SceneId`.

- [ ] **Step 1: Write the failing tests**

`video/tests/copy.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { COPY } from "../src/copy.ts";

const spec = readFileSync(new URL("../../docs/superpowers/specs/2026-10-16-explainer-video-design.md", import.meta.url), "utf8");
const rows = new Map([...spec.matchAll(/^\| ([A-Z]\d+a?) \| (.+?) \| (.+?) \|$/gm)].map((m) => [m[1], m[2]]));

test("on-screen copy is exactly the spec's claims table", () => {
  assert.deepEqual(Object.keys(COPY).sort(), [...rows.keys()].sort());
  for (const [id, c] of Object.entries(COPY)) assert.equal(c.text, rows.get(id), id);
});

test("no number in the copy except the years the site states", () => {
  for (const [id, c] of Object.entries(COPY)) for (const d of c.text.match(/\d+/g) ?? []) assert.ok(["2005", "2015"].includes(d), `${id}: ${d}`);
});

test("scenes put no literal text on screen", () => {
  const dir = new URL("../src/scenes/", import.meta.url);
  if (!existsSync(dir)) return;
  for (const f of readdirSync(dir).filter((n) => n.endsWith(".tsx"))) {
    assert.doesNotMatch(readFileSync(new URL(f, dir), "utf8"), />[^<>{}\n]*[A-Za-z][^<>{}\n]*</, f);
  }
});
```

`video/tests/timeline.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { VERTICAL, WIDE, total } from "../src/timeline.ts";

test("cuts are 90 s and 30 s", () => {
  assert.equal(total(WIDE), 2700);
  assert.equal(total(VERTICAL), 900);
});

test("every cut lands on a 120 BPM beat (15 frames)", () => {
  for (const tl of [WIDE, VERTICAL]) {
    let at = 0;
    for (const s of tl) {
      assert.equal(at % 15, 0, s.id);
      at += s.frames;
    }
  }
});

test("the vertical cut only uses wide scenes", () => {
  const ids = new Set(WIDE.map((s) => s.id));
  for (const s of VERTICAL) assert.ok(ids.has(s.id), s.id);
});
```

- [ ] **Step 2: Run, watch them fail**

Run: `cd video && node --test tests/`
Expected: FAIL, cannot find `../src/copy.ts` / `../src/timeline.ts`.

- [ ] **Step 3: Write `video/src/copy.ts`**

```ts
// Every word the video shows, one entry per row of the spec's claims table
// (docs/superpowers/specs/2026-10-16-explainer-video-design.md). tests/copy.test.ts holds them equal.
export const COPY = {
  N1: { text: "Cream City Almanac", source: "product name (wordmark)" },
  W1: { text: "Crime reports · Fire calls · Property records · Voter turnout · Health surveys · Census figures", source: "one-pager ¶1" },
  C1: { text: "Milwaukee publishes a lot of information about itself.", source: "one-pager ¶1" },
  C2: { text: "Most of it sits in spreadsheets only a data analyst would open.", source: "one-pager ¶1" },
  C3: { text: "Look up your Milwaukee neighborhood. Every number says where it came from.", source: "one-pager tagline; /about lede" },
  C3a: { text: "Look up your Milwaukee neighborhood.", source: "one-pager tagline" },
  C4: { text: "Type your address. See your neighborhood, alder, ward and polling place.", source: "/about entry 1; one-pager" },
  K1: { text: "Neighborhood · Alder · Ward · Polling place", source: "/about entry 1" },
  C5: { text: "The Almanac doesn't keep your address.", source: "one-pager" },
  C6: { text: "Your neighborhood's figures, next to the city's.", source: "one-pager" },
  K2: { text: "City of Milwaukee", source: "fact sheet's city column" },
  C7: { text: "Every City neighborhood has a fact sheet.", source: "one-pager; decision 054" },
  Q1: { text: "How many robberies in Harambee this year?", source: "ui/components/LandingAskSample.tsx QUESTION" },
  K4: { text: "As of", source: "snapshot date label" },
  C8: { text: "Crime back to 2005 · Fire calls and response times since 2015 · How long vacant buildings have sat on the City's list · Health and food figures by ZIP code · Voter turnout", source: "/about CAN_ASK" },
  C9: { text: "The AI picks the right tool. Code does the math.", source: "one-pager" },
  C10: { text: "The AI never writes a number.", source: "one-pager" },
  T1: { text: "DYCU · CITY · CENSUS · HCM · AI", source: "/about TAGS" },
  C11: { text: "Data You Can Use · City of Milwaukee · U.S. Census Bureau · Health Compass Milwaukee · Written by AI", source: "/about TAGS" },
  L1: { text: "For journalists", source: "one-pager heading" },
  L2: { text: "For nonprofits", source: "one-pager heading" },
  C12: { text: "The figure, its source and its caveats on one card. Export it or share a link.", source: "one-pager" },
  C13: { text: "A one-page fact sheet with the city's figures alongside, for grant applications.", source: "one-pager" },
  C14: { text: "Coming next: Wisconsin DNR open data on air, water and land.", source: "Tarik, 2026-10-16" },
  U1: { text: "creamcityalmanac.app", source: "the site's address" },
  C15: { text: "Free. Start with your address.", source: "one-pager" },
} as const;
```

- [ ] **Step 4: Write `video/src/timeline.ts`**

```ts
// Scene lengths in frames at 30 fps. Every boundary is a multiple of 15 (a beat at 120 BPM).
export const FPS = 30;
export type SceneId = "S1-Problem" | "S2-Reveal" | "S3-Address" | "S4-FactSheet" | "S5-Ask" | "S6-Trust" | "S7-WhoFor" | "S8-ComingNext" | "S9-Start";

export const WIDE: readonly { id: SceneId; frames: number }[] = [
  { id: "S1-Problem", frames: 240 },
  { id: "S2-Reveal", frames: 210 },
  { id: "S3-Address", frames: 450 },
  { id: "S4-FactSheet", frames: 360 },
  { id: "S5-Ask", frames: 480 },
  { id: "S6-Trust", frames: 300 },
  { id: "S7-WhoFor", frames: 360 },
  { id: "S8-ComingNext", frames: 150 },
  { id: "S9-Start", frames: 150 },
];

export const VERTICAL: readonly { id: SceneId; frames: number }[] = [
  { id: "S1-Problem", frames: 120 },
  { id: "S2-Reveal", frames: 120 },
  { id: "S3-Address", frames: 240 },
  { id: "S5-Ask", frames: 210 },
  { id: "S6-Trust", frames: 90 },
  { id: "S8-ComingNext", frames: 60 },
  { id: "S9-Start", frames: 60 },
];

export const total = (tl: readonly { frames: number }[]) => tl.reduce((t, s) => t + s.frames, 0);
export const wideFrames = (id: SceneId) => WIDE.find((s) => s.id === id)!.frames;
```

- [ ] **Step 5: Run, watch them pass**

Add `"test": "node --test tests/"` to `video/package.json` scripts. Run: `cd video && npm test`
Expected: 6 tests pass.

- [ ] **Step 6: Commit**

```bash
cd /Users/tarikmoody/Projects/dycu/inventory
git add video/src/copy.ts video/src/timeline.ts video/tests video/package.json
git commit -m "feat(video): on-screen copy and timeline, tested against the spec's claims table

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 3: Real numbers from production

**Files:**
- Create: `video/scripts/snapshot-lib.mjs`, `video/scripts/snapshot.mjs`, `video/tests/snapshot.test.mjs`, `video/src/data.json`, `video/src/data.ts`

**Interfaces:**
- Produces: `toData({ sheet, robbery, asOf }) → VideoData` (throws on anything not showable); `DATA: VideoData` from `video/src/data.ts`:
  `{ asOf: string; riverwest: { name: string; label: string; period: string; rate: Est; city: Est; verdict: string }; robbery: { count: number; caption: string } }`, `Est = { estimate: number; moe: number | null }` (rates are shares 0–1).

- [ ] **Step 1: Write the failing test** — `video/tests/snapshot.test.mjs`

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { toData } from "../scripts/snapshot-lib.mjs";

const sheet = {
  status: "ok", name: "Riverwest", period: "2019–2023",
  headlines: [{ id: "poverty", label: "Poverty", verdict: "higher", hood: { rate: { estimate: 0.31, moe: 0.04 } }, city: { rate: { estimate: 0.24, moe: 0.01 } } }],
};
const robbery = { status: "ok", name: "Crime (NIBRS)", filters: ["Robbery"], period: "2026 so far", area: "Harambee", count: 42 };

test("keeps only what the video shows", () => {
  assert.deepEqual(toData({ sheet, robbery, asOf: "2026-10-16" }), {
    asOf: "2026-10-16",
    riverwest: { name: "Riverwest", label: "Poverty", period: "2019–2023", rate: { estimate: 0.31, moe: 0.04 }, city: { estimate: 0.24, moe: 0.01 }, verdict: "clearly higher than the city" },
    robbery: { count: 42, caption: "Crime (NIBRS) · Robbery · 2026 so far · In Harambee" },
  });
});

test("a zero count is a real answer", () => {
  assert.equal(toData({ sheet, robbery: { ...robbery, count: 0 }, asOf: "2026-10-16" }).robbery.count, 0);
});

test("refuses when the City is busy", () => {
  assert.throws(() => toData({ sheet, robbery: { status: "busy" }, asOf: "2026-10-16" }), /Robbery count not ok: busy/);
});

test("refuses a small or missing sheet", () => {
  assert.throws(() => toData({ sheet: { status: "small" }, robbery, asOf: "2026-10-16" }), /sheet not ok/);
  assert.throws(() => toData({ sheet: { ...sheet, headlines: [] }, robbery, asOf: "2026-10-16" }), /poverty rate missing/);
});

test("refuses a verdict it has no words for", () => {
  assert.throws(() => toData({ sheet: { ...sheet, headlines: [{ ...sheet.headlines[0], verdict: "unknown" }] }, robbery, asOf: "2026-10-16" }), /No verdict/);
});
```

- [ ] **Step 2: Run, watch it fail**

Run: `cd video && node --test tests/snapshot.test.mjs`
Expected: FAIL, cannot find `snapshot-lib.mjs`.

- [ ] **Step 3: Write `video/scripts/snapshot-lib.mjs`**

```js
// The fact sheet's plain-language verdicts, copied from VERDICT in ui/lib/factText.ts ("unknown" has no words, so it isn't shown).
const VERDICT = { higher: "clearly higher than the city", lower: "clearly lower than the city", same: "about the same as the city (within the margin of error)" };

// What the video shows, from production's own answers. Throws rather than ever showing a guessed number.
export function toData({ sheet, robbery, asOf }) {
  if (sheet?.status !== "ok") throw new Error(`Riverwest sheet not ok: ${sheet?.status}`);
  const h = sheet.headlines.find((x) => x.id === "poverty");
  if (!h?.hood?.rate || !h.city?.rate) throw new Error("Riverwest poverty rate missing");
  if (!VERDICT[h.verdict]) throw new Error(`No verdict to show: ${h.verdict}`);
  if (robbery?.status !== "ok") throw new Error(`Robbery count not ok: ${robbery?.status}`);
  // Same caption as the site's sample card (sampleView in ui/lib/landingSample.ts).
  const caption = [robbery.name, ...robbery.filters, robbery.period, robbery.area ? `In ${robbery.area}` : null].filter(Boolean).join(" · ");
  return {
    asOf,
    riverwest: { name: sheet.name, label: h.label, period: sheet.period, rate: h.hood.rate, city: h.city.rate, verdict: VERDICT[h.verdict] },
    robbery: { count: robbery.count, caption },
  };
}
```

- [ ] **Step 4: Run, watch it pass**

Run: `cd video && node --test tests/snapshot.test.mjs`
Expected: 5 pass.

- [ ] **Step 5: Write `video/scripts/snapshot.mjs`**

```js
// Reads the two figures the video shows from production's public endpoints (the same calls /about makes)
// and writes src/data.json. Writes nothing if any answer isn't showable.
// Run: CONVEX_URL=https://spotted-tern-278.convex.cloud node scripts/snapshot.mjs
import { writeFileSync } from "node:fs";
import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";
import { toData } from "./snapshot-lib.mjs";

const url = process.env.CONVEX_URL;
if (!url) throw new Error("Set CONVEX_URL to production's address");
const client = new ConvexHttpClient(url);
const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
const [sheet, stats] = await Promise.all([client.query(anyApi.factSheet.sheet, { slug: "riverwest" }), client.query(anyApi.catalog.landingStats, {})]);
if (!stats.sampleCode) throw new Error("No crime dataset code from landingStats");
// Same arguments as useRobberySample in ui/components/LandingAskSample.tsx.
const robbery = await client.action(anyApi.map.mapCells, { code: stats.sampleCode, from: `${today.slice(0, 4)}-01-01`, filters: [{ column: "Offense_All", values: ["120"] }], neighborhood: "Harambee" });
const data = toData({ sheet, robbery, asOf: today });
writeFileSync(new URL("../src/data.json", import.meta.url), `${JSON.stringify(data, null, 2)}\n`);
console.log(data);
```

- [ ] **Step 6: Run against production (read-only public calls, the same ones any visitor's browser makes)**

Run: `cd video && CONVEX_URL=https://spotted-tern-278.convex.cloud node scripts/snapshot.mjs`
Expected: prints the data; `src/data.json` exists. Compare `riverwest.rate`/`robbery.count` with https://www.creamcityalmanac.app/about (fetched with ego-browser) — they must match.

- [ ] **Step 7: Write `video/src/data.ts`**

```ts
import raw from "./data.json";

export type Est = { estimate: number; moe: number | null };
export type VideoData = {
  asOf: string;
  riverwest: { name: string; label: string; period: string; rate: Est; city: Est; verdict: string };
  robbery: { count: number; caption: string };
};
export const DATA = raw as VideoData;
```

Run: `cd video && npx tsc --noEmit && npm test` — Expected: clean, all pass.

- [ ] **Step 8: Commit**

```bash
cd /Users/tarikmoody/Projects/dycu/inventory
git add video/scripts/snapshot-lib.mjs video/scripts/snapshot.mjs video/tests/snapshot.test.mjs video/src/data.json video/src/data.ts
git commit -m "feat(video): snapshot the two on-screen figures from production

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 4: Record the address lookup

**Files:**
- Create: `video/scripts/record-address.mjs` (ego-browser), `video/scripts/record-address.playwright.mjs` (fallback), `video/scripts/frames-lib.mjs`, `video/scripts/frames-to-mp4.mjs`, `video/tests/frames.test.mjs`, `video/public/address.mp4`

**Interfaces:**
- Produces: `video/public/address.mp4`, 1280×800, 30 fps, ≥ 16 s, the result visible by its end; `RESULT_AT` (seconds into the clip when the result appears) written into `video/src/clip.ts` as `export const RESULT_AT = <number>;`.
- `concatList(times: number[], holdUntil: number) → string` (ffconcat text).

- [ ] **Step 1: Failing test for the frame timing** — `video/tests/frames.test.mjs`

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { concatList } from "../scripts/frames-lib.mjs";

test("each frame lasts until the next capture; the last holds to the target length", () => {
  assert.equal(
    concatList([0, 100, 250], 1),
    "ffconcat version 1.0\nfile f00000.png\nduration 0.100\nfile f00001.png\nduration 0.150\nfile f00002.png\nduration 0.750\nfile f00002.png\n",
  );
});

test("never a negative hold when the recording already runs long", () => {
  assert.match(concatList([0, 2000], 1), /duration 0\.000\nfile f00001\.png\n$/);
});
```

Run: `cd video && node --test tests/frames.test.mjs` — Expected: FAIL (module missing).

- [ ] **Step 2: Write `video/scripts/frames-lib.mjs`**

```js
// ffmpeg's concat format for screenshots taken at uneven times (ms since start). The last frame repeats
// so ffmpeg honors its duration, and holds until `holdUntil` seconds so the clip never runs out mid-scene.
export function concatList(times, holdUntil) {
  const name = (i) => `f${String(i).padStart(5, "0")}.png`;
  const last = times.length - 1;
  const lines = times.map((t, i) => {
    const end = i < last ? times[i + 1] : Math.max(t, holdUntil * 1000);
    return `file ${name(i)}\nduration ${((end - t) / 1000).toFixed(3)}`;
  });
  return `ffconcat version 1.0\n${lines.join("\n")}\nfile ${name(last)}\n`;
}
```

Run the test — Expected: 2 pass.

- [ ] **Step 3: Write `video/scripts/frames-to-mp4.mjs`**

```js
// Usage: node scripts/frames-to-mp4.mjs <frames dir with times.json> <out.mp4>
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { concatList } from "./frames-lib.mjs";

const [dir, out] = process.argv.slice(2);
const times = JSON.parse(readFileSync(join(dir, "times.json"), "utf8"));
writeFileSync(join(dir, "list.txt"), concatList(times, 16));
execFileSync("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", join(dir, "list.txt"), "-vf", "fps=30,format=yuv420p", "-c:v", "libx264", "-crf", "18", out], { stdio: "inherit" });
```

- [ ] **Step 4: Check the ego-browser runtime first**

Run `ego-browser skill | sed -n '1,140p'` and read: the exact return value of `openOrReuseTab`, the signature of `page.waitForFunction`, and whether `process.env` and `node:fs` are available inside `ego-browser nodejs`. Adjust Step 5's script to what the guide says; ledger any change as a ruling.

- [ ] **Step 5: Write `video/scripts/record-address.mjs` (ego-browser)**

```js
// Run: FRAMES_DIR=$PWD/.frames ego-browser nodejs < scripts/record-address.mjs
// ego-browser can't subscribe to the screencast's frame events, so this takes screenshots in a tight loop
// while it types City Hall's address into the live /about page.
const fs = await import("node:fs");
const OUT = process.env.FRAMES_DIR;
if (!OUT) throw new Error("Set FRAMES_DIR");
fs.mkdirSync(OUT, { recursive: true });
await useOrCreateTaskSpace("cca explainer recording");
const page = await openOrReuseTab("https://www.creamcityalmanac.app/about", { wait: true, timeout: 30 });
await page.cdp("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
await page.evaluate(() => document.getElementById("find-address").scrollIntoView({ block: "start" }));
await page.waitForTimeout(500);

const times = [];
let recording = true;
const t0 = Date.now();
const loop = (async () => {
  while (recording) {
    await page.screenshot({ path: `${OUT}/f${String(times.length).padStart(5, "0")}.png` });
    times.push(Date.now() - t0);
  }
})();

await page.waitForTimeout(1000);
await page.click("#find-address");
for (const ch of "200 E Wells St") {
  await page.keyboard.type(ch);
  await page.waitForTimeout(90);
}
await page.keyboard.press("Enter");
const sent = Date.now() - t0;
await page.waitForFunction(() => /ward/i.test(document.querySelector("[data-place-message]")?.textContent ?? ""), undefined, { timeout: 20000 });
const resultAt = Date.now() - t0;
await page.waitForTimeout(3000);
recording = false;
await loop;
fs.writeFileSync(`${OUT}/times.json`, JSON.stringify(times));
const fps = times.length / (times.at(-1) / 1000);
cliLog({ frames: times.length, seconds: times.at(-1) / 1000, fps: fps.toFixed(1), sent: sent / 1000, resultAt: resultAt / 1000 });
await completeTaskSpace("cca explainer recording", { keep: false });
```

- [ ] **Step 6: Record and apply the gate**

```bash
cd video && rm -rf .frames && FRAMES_DIR=$PWD/.frames ego-browser nodejs < scripts/record-address.mjs
```
Expected: a printed `fps`. **Gate:** `fps ≥ 15` → keep this recording, go to Step 8. `fps < 15` → Step 7. Ledger the measured fps and the choice.

- [ ] **Step 7 (only if fps < 15): Playwright fallback** — `video/scripts/record-address.playwright.mjs`

```js
// Run from the repo root (Playwright is a root dev dependency): node video/scripts/record-address.playwright.mjs
import { chromium } from "@playwright/test";
import { renameSync } from "node:fs";

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, recordVideo: { dir: "video/.frames/pw", size: { width: 1280, height: 800 } } });
const page = await context.newPage();
const t0 = Date.now();
await page.goto("https://www.creamcityalmanac.app/about", { waitUntil: "networkidle" });
await page.locator("#find-address").scrollIntoViewIfNeeded();
await page.waitForTimeout(1000);
await page.locator("#find-address").pressSequentially("200 E Wells St", { delay: 90 });
await page.keyboard.press("Enter");
await page.waitForFunction(() => /ward/i.test(document.querySelector("[data-place-message]")?.textContent ?? ""), undefined, { timeout: 20000 });
console.log({ resultAt: (Date.now() - t0) / 1000 });
await page.waitForTimeout(3000);
const video = page.video();
await context.close();
renameSync(await video.path(), "video/.frames/address.webm");
await browser.close();
```
Then: `ffmpeg -y -i video/.frames/address.webm -vf "fps=30,format=yuv420p,tpad=stop_mode=clone:stop_duration=6" -c:v libx264 -crf 18 video/public/address.mp4`. Note: Playwright's clip includes page load before typing; trim with `-ss <seconds>` so it starts ~1 s before typing, and subtract the same from `resultAt`.

- [ ] **Step 8 (ego path): Assemble**

Run: `cd video && node scripts/frames-to-mp4.mjs .frames public/address.mp4`

- [ ] **Step 9: Check the clip**

```bash
cd video && ffprobe -v error -show_entries format=duration -show_entries stream=width,height,r_frame_rate -of default=nw=1 public/address.mp4
ffmpeg -y -v error -sseof -0.5 -i public/address.mp4 -frames:v 1 .frames/last.png
```
Expected: duration ≥ 15.5; 1280×800; 30/1. View `.frames/last.png` with Read: the result (neighborhood, alder, ward, polling place) is visible and the address is City Hall's.

- [ ] **Step 10: Record when the result appears** — `video/src/clip.ts`

```ts
// Seconds into public/address.mp4 when the lookup result appears (printed by the recording script as resultAt).
export const RESULT_AT = 0; // replace with the measured value
```
Set the measured number (not 0) before committing.

- [ ] **Step 11: Commit**

```bash
cd /Users/tarikmoody/Projects/dycu/inventory
git add video/scripts/record-address.mjs video/scripts/record-address.playwright.mjs video/scripts/frames-lib.mjs video/scripts/frames-to-mp4.mjs video/tests/frames.test.mjs video/public/address.mp4 video/src/clip.ts
git commit -m "feat(video): real recording of the address lookup (City Hall)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 5: Music

**Files:**
- Create: `video/public/music.mp3`, `video/MUSIC.md`, `video/src/music.ts`

**Interfaces:**
- Produces: `MUSIC_START` (frames to skip so a downbeat lands on frame 0) from `video/src/music.ts`.

- [ ] **Step 1: Pick the track**

With ego-browser, browse Pixabay Music (https://pixabay.com/music/) or the YouTube Audio Library. Criteria: instrumental, upbeat but not frantic, no vocals, ≥ 95 s, ideally listed near 120 BPM (scene cuts are every multiple of 15 frames). Download to `video/public/music.mp3`. If no suitable track is near 120 BPM, take the best fit and ledger a ruling: cuts stay on the 15-frame grid and the music is not beat-matched.

- [ ] **Step 2: Check it**

Run: `ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 video/public/music.mp3`
Expected: ≥ 92.

- [ ] **Step 3: Write `video/MUSIC.md`**

```markdown
# Music

- Track: <title>
- Artist: <artist>
- Source page: <url of the track's page>
- License page: <url of the library's license>
- Downloaded: 2026-10-16
- BPM: <listed BPM, or "not listed">

Tarik checks the license before the video is posted.
```
Fill every field with the real values from the track's page (no blanks).

- [ ] **Step 4: Find the first downbeat** — `video/src/music.ts`

Run `ffmpeg -v info -i video/public/music.mp3 -af silencedetect=noise=-35dB:d=0.1 -f null - 2>&1 | grep silence_end | head -1` to find where sound starts; set:
```ts
// Frames of the track to skip so its first downbeat lands on frame 0 (from silencedetect: silence_end × 30).
export const MUSIC_START = 0; // replace with the measured value; 0 if the track starts on the beat
```

- [ ] **Step 5: Commit**

```bash
cd /Users/tarikmoody/Projects/dycu/inventory
git add video/public/music.mp3 video/MUSIC.md video/src/music.ts
git commit -m "feat(video): music track with its source and license page

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 6: Motion primitives, opening scenes and the thumbnail

**Files:**
- Create: `video/src/ui.tsx`, `video/src/scenes/S1Problem.tsx`, `video/src/scenes/S2Reveal.tsx`, `video/src/scenes/Thumbnail.tsx`
- Modify: `video/src/Root.tsx`

**Interfaces:**
- Consumes: `C`, `F` (Task 1); `COPY` (Task 2).
- Produces from `ui.tsx`: `useLayout() → { tall: boolean; u: number; width: number; height: number }`; `prog(f, start, dur) → 0..1`; components `Page`, `Headline({p?, size?})`, `Body({p?, size?})`, `Hand({p?, size?})`, `Rule({p, color?, weight?})`, `Circle({p})`, `Stamp({f, at})`, `Tag({name})`. Every scene is `React.FC<{ k?: number }>`, reads `const f = useCurrentFrame() / k`, and times everything in wide frames.

- [ ] **Step 1: Write `video/src/ui.tsx`**

```tsx
import React from "react";
import { Easing, interpolate, spring, useVideoConfig } from "remotion";
import { C, F } from "./theme";

// u: pixels per 1080 px of width (the layout rules' unit). tall: the vertical cut.
export function useLayout() {
  const { width, height } = useVideoConfig();
  return { tall: height > width, u: width / 1080, width, height };
}

// 0 → 1 between start and start + dur, eased out, clamped both ends.
export const prog = (f: number, start: number, dur: number) =>
  interpolate(f, [start, start + dur], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });

const rise = (p: number, u: number): React.CSSProperties => ({ opacity: p, transform: `translateY(${(1 - p) * 30 * u}px)` });

export const Page: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { u, tall, height } = useLayout();
  const pv = tall ? 100 * u : 100 * (height / 1080);
  return (
    <div style={{ position: "absolute", inset: 0, background: C.paper, color: C.ink, fontFamily: F.body, padding: `${pv}px ${80 * u}px`, display: "flex", flexDirection: "column", justifyContent: "center", gap: 32 * u }}>
      {children}
    </div>
  );
};

type Text = { children: React.ReactNode; p?: number; size?: number };
export const Headline: React.FC<Text> = ({ children, p = 1, size = 1 }) => {
  const { u } = useLayout();
  return <div style={{ fontFamily: F.caps, fontWeight: 900, fontSize: 84 * u * size, lineHeight: 0.95, textTransform: "uppercase", ...rise(p, u) }}>{children}</div>;
};
export const Body: React.FC<Text> = ({ children, p = 1, size = 1 }) => {
  const { u } = useLayout();
  return <div style={{ fontFamily: F.body, fontWeight: 500, fontSize: 44 * u * size, lineHeight: 1.25, ...rise(p, u) }}>{children}</div>;
};
// Grease-pencil handwriting.
export const Hand: React.FC<Text> = ({ children, p = 1, size = 1 }) => {
  const { u } = useLayout();
  return <div style={{ fontFamily: F.hand, fontWeight: 600, fontSize: 60 * u * size, lineHeight: 1.1, color: C.pencil, ...rise(p, u) }}>{children}</div>;
};

export const Rule: React.FC<{ p: number; color?: string; weight?: number }> = ({ p, color = C.ink, weight = 2 }) => {
  const { u } = useLayout();
  return <div style={{ height: weight * u, background: color, transform: `scaleX(${p})`, transformOrigin: "left" }} />;
};

// A loose grease-pencil loop drawn around its children as p goes 0 → 1.
export const Circle: React.FC<{ p: number; children: React.ReactNode }> = ({ p, children }) => (
  <div style={{ position: "relative", display: "inline-block", alignSelf: "flex-start" }}>
    {children}
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: "absolute", left: "-6%", top: "-22%", width: "112%", height: "144%", overflow: "visible", pointerEvents: "none" }}>
      <path d="M 8 55 C 6 18, 92 8, 95 45 C 98 86, 14 96, 5 60 C 3 46, 22 28, 42 24" fill="none" stroke={C.pencil} strokeWidth={2.2} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - p} />
    </svg>
  </div>
);

// Lands at frame `at` (in the scene's own frames) with a short overshoot, like a rubber stamp.
export const Stamp: React.FC<{ f: number; at: number; children: React.ReactNode }> = ({ f, at, children }) => {
  const { fps } = useVideoConfig();
  const s = spring({ frame: f - at, fps, config: { damping: 14, stiffness: 220 } });
  return <div style={{ display: "inline-block", opacity: f >= at ? 1 : 0, transform: `scale(${interpolate(s, [0, 1], [1.5, 1])})` }}>{children}</div>;
};

// A source tag as the site draws it: square, ink-ruled, caps.
export const Tag: React.FC<{ name: string }> = ({ name }) => {
  const { u } = useLayout();
  return <span style={{ display: "inline-block", border: `${2 * u}px solid ${C.ink}`, padding: `${4 * u}px ${12 * u}px`, fontFamily: F.caps, fontWeight: 700, fontSize: 44 * u, letterSpacing: "0.04em", lineHeight: 1 }}>{name}</span>;
};
```

- [ ] **Step 2: Write `video/src/scenes/S1Problem.tsx`**

```tsx
import React from "react";
import { useCurrentFrame } from "remotion";
import { COPY } from "../copy";
import { C, F } from "../theme";
import { Body, Headline, Page, Rule, prog, useLayout } from "../ui";

// Where each file name sits at frame 0 (frame 0 is a designed cover, never empty paper), and the pile it slides into.
const SPOTS = [{ x: 6, y: 10, r: -4 }, { x: 54, y: 6, r: 3 }, { x: 22, y: 30, r: 2 }, { x: 58, y: 34, r: -3 }, { x: 8, y: 52, r: 4 }, { x: 46, y: 56, r: -2 }];
const PILE = [{ x: 6, y: 16, r: -6 }, { x: 10, y: 12, r: 4 }, { x: 4, y: 9, r: -2 }, { x: 12, y: 6, r: 7 }, { x: 7, y: 3, r: -5 }, { x: 9, y: 0, r: 3 }];

export const S1Problem: React.FC<{ k?: number }> = ({ k = 1 }) => {
  const f = useCurrentFrame() / k;
  const { u, tall } = useLayout();
  const m = prog(f, 20, 60);
  return (
    <Page>
      {COPY.W1.text.split(" · ").map((w, i) => {
        const a = SPOTS[i];
        const b = PILE[i];
        return (
          <div key={w} style={{ position: "absolute", left: `${a.x + (b.x - a.x) * m}%`, top: `${a.y + (b.y - a.y) * m + 6}%`, transform: `rotate(${a.r + (b.r - a.r) * m}deg)`, background: C.band, border: `${2 * u}px solid ${C.ink}`, padding: `${10 * u}px ${20 * u}px`, fontFamily: F.caps, fontWeight: 700, fontSize: 44 * u, textTransform: "uppercase", whiteSpace: "nowrap" }}>
            {w}
          </div>
        );
      })}
      <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 24 * u }}>
        <Headline p={prog(f, 90, 20)}>{COPY.C1.text}</Headline>
        {!tall && <Body p={prog(f, 150, 20)}>{COPY.C2.text}</Body>}
        {!tall && <Rule p={prog(f, 180, 30)} color={C.pencil} weight={6} />}
      </div>
    </Page>
  );
};
```

- [ ] **Step 3: Write `video/src/scenes/S2Reveal.tsx`**

```tsx
import React from "react";
import { useCurrentFrame } from "remotion";
import { COPY } from "../copy";
import { C, F } from "../theme";
import { Body, Page, Rule, prog, useLayout } from "../ui";

export const S2Reveal: React.FC<{ k?: number }> = ({ k = 1 }) => {
  const f = useCurrentFrame() / k;
  const { u } = useLayout();
  const p = prog(f, 0, 40);
  return (
    <Page>
      <div style={{ clipPath: `inset(0 ${(1 - p) * 100}% 0 0)`, fontFamily: F.mark, fontWeight: 900, fontStretch: "50%", fontSize: 160 * u, lineHeight: 0.9, textTransform: "uppercase" }}>{COPY.N1.text}</div>
      <Rule p={prog(f, 35, 30)} color={C.pencil} weight={8} />
      <Body p={prog(f, 70, 25)} size={1.3}>{COPY.C3.text}</Body>
    </Page>
  );
};
```

- [ ] **Step 4: Write `video/src/scenes/Thumbnail.tsx`**

```tsx
import React from "react";
import { COPY } from "../copy";
import { C, F } from "../theme";
import { Circle, Headline, Page, Rule, Tag, useLayout } from "../ui";

// The designed cover: YouTube's custom thumbnail (1280×720) and the vertical cover (1080×1920).
export const Thumbnail: React.FC = () => {
  const { u, tall } = useLayout();
  return (
    <Page>
      <div style={{ fontFamily: F.mark, fontWeight: 900, fontStretch: "50%", fontSize: (tall ? 150 : 130) * u, lineHeight: 0.88, textTransform: "uppercase" }}>{COPY.N1.text}</div>
      <Rule p={1} color={C.pencil} weight={8} />
      <Circle p={1}>
        <Headline size={0.75}>{COPY.C3a.text}</Headline>
      </Circle>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16 * u }}>
        {COPY.T1.text.split(" · ").map((t) => <Tag key={t} name={t} />)}
      </div>
    </Page>
  );
};
```

- [ ] **Step 5: Register for preview** — replace `video/src/Root.tsx`

```tsx
import React from "react";
import { Composition, Folder, Still } from "remotion";
import { S1Problem } from "./scenes/S1Problem";
import { S2Reveal } from "./scenes/S2Reveal";
import { Thumbnail } from "./scenes/Thumbnail";

export const RemotionRoot: React.FC = () => (
  <>
    <Folder name="Scenes">
      <Composition id="S1-Problem" component={S1Problem} durationInFrames={240} fps={30} width={1920} height={1080} defaultProps={{ k: 1 }} />
      <Composition id="S2-Reveal" component={S2Reveal} durationInFrames={210} fps={30} width={1920} height={1080} defaultProps={{ k: 1 }} />
    </Folder>
    <Still id="Thumbnail" component={Thumbnail} width={1280} height={720} />
    <Still id="ThumbnailVertical" component={Thumbnail} width={1080} height={1920} />
  </>
);
```
(Keep the scaffold's `src/index.ts` `registerRoot(RemotionRoot)`; if the scaffold exports the root under another name, match it.)

- [ ] **Step 6: Tests, typecheck, stills**

```bash
cd video && npm test && npx tsc --noEmit
mkdir -p out/stills
npx remotion still S1-Problem out/stills/s1-f0.png --frame=0
npx remotion still S1-Problem out/stills/s1-f230.png --frame=230
npx remotion still S2-Reveal out/stills/s2-f200.png --frame=200
npx remotion still Thumbnail out/stills/thumb.png
npx remotion still ThumbnailVertical out/stills/thumb-v.png
```
Expected: tests pass (including "no literal text"), no tsc output. View each PNG with Read. Check: frame 0 shows six file labels on paper (not blank); the wordmark is the narrow 50%-width Saira, not a fallback; nothing crosses the safe area; text sizes read at phone size. Fix positions in one batch; re-check once.

- [ ] **Step 7: Commit**

```bash
cd /Users/tarikmoody/Projects/dycu/inventory
git add video/src/ui.tsx video/src/scenes video/src/Root.tsx
git commit -m "feat(video): motion primitives, opening scenes, thumbnails

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 7: Address, fact sheet and Ask scenes

**Files:**
- Create: `video/src/scenes/S3Address.tsx`, `video/src/scenes/S4FactSheet.tsx`, `video/src/scenes/S5Ask.tsx`
- Modify: `video/src/Root.tsx`

**Interfaces:**
- Consumes: `ui.tsx` (Task 6), `DATA` (Task 3), `RESULT_AT` (Task 4), `COPY`.

- [ ] **Step 1: Write `video/src/scenes/S3Address.tsx`**

```tsx
import React from "react";
import { staticFile, useCurrentFrame } from "remotion";
import { Video } from "@remotion/media";
import { RESULT_AT } from "../clip";
import { COPY } from "../copy";
import { C } from "../theme";
import { Body, Circle, Hand, Headline, Page, prog, useLayout } from "../ui";

export const S3Address: React.FC<{ k?: number }> = ({ k = 1 }) => {
  const f = useCurrentFrame() / k;
  const { u, tall } = useLayout();
  // Callouts start when the real result appears in the clip, one every second.
  const first = RESULT_AT * 30 + 10;
  return (
    <Page>
      <Headline p={prog(f, 0, 20)} size={0.8}>{COPY.C4.text}</Headline>
      <div style={{ display: "flex", flexDirection: tall ? "column" : "row", gap: 40 * u, alignItems: tall ? "stretch" : "center" }}>
        <div style={{ flex: tall ? "none" : "0 0 62%", border: `${2 * u}px solid ${C.ink}`, opacity: prog(f, 10, 20) }}>
          <Video src={staticFile("address.mp4")} muted playbackRate={1 / k} style={{ width: "100%", display: "block" }} />
        </div>
        <div style={{ display: "flex", flexDirection: tall ? "row" : "column", flexWrap: "wrap", gap: 28 * u }}>
          {COPY.K1.text.split(" · ").map((t, i) => (
            <Circle key={t} p={prog(f, first + i * 30 + 6, 18)}>
              <Hand p={prog(f, first + i * 30, 8)}>{t}</Hand>
            </Circle>
          ))}
        </div>
      </div>
      <Body p={prog(f, Math.min(first + 130, 400), 20)} size={0.9}>{COPY.C5.text}</Body>
    </Page>
  );
};
```

- [ ] **Step 2: Write `video/src/scenes/S4FactSheet.tsx`**

```tsx
import React from "react";
import { useCurrentFrame } from "remotion";
import { COPY } from "../copy";
import { DATA, type Est } from "../data";
import { C, F } from "../theme";
import { Body, Hand, Headline, Page, Stamp, prog, useLayout } from "../ui";

// Same formats as pct and margin in ui/lib/factText.ts.
const pct = (e: Est) => `${(e.estimate * 100).toFixed(1)}%`;
const margin = (e: Est) => (e.moe === null ? "" : `± ${(e.moe * 100).toFixed(1)} points`);

export const S4FactSheet: React.FC<{ k?: number }> = ({ k = 1 }) => {
  const f = useCurrentFrame() / k;
  const { u } = useLayout();
  const r = DATA.riverwest;
  const top = (e: Est) => e.estimate + (e.moe ?? 0);
  const max = Math.max(top(r.rate), top(r.city)) * 1.15;
  const rows = [{ name: r.name, e: r.rate, at: 30, fill: C.ink }, { name: COPY.K2.text, e: r.city, at: 60, fill: C.band }];
  return (
    <Page>
      <Headline p={prog(f, 0, 20)} size={0.8}>{COPY.C6.text}</Headline>
      <Hand p={prog(f, 15, 15)}>{`${r.label} · ${r.period}`}</Hand>
      {rows.map((row) => {
        const g = prog(f, row.at, 40);
        const w = (row.e.estimate / max) * 100;
        const lo = ((row.e.estimate - (row.e.moe ?? 0)) / max) * 100;
        const hi = (top(row.e) / max) * 100;
        return (
          <div key={row.name} style={{ display: "grid", gridTemplateColumns: "28% 1fr", alignItems: "center", gap: 24 * u }}>
            <div style={{ fontFamily: F.caps, fontWeight: 700, fontSize: 44 * u, textTransform: "uppercase" }}>{row.name}</div>
            <div style={{ position: "relative", height: 72 * u }}>
              <div style={{ position: "absolute", left: 0, top: 12 * u, bottom: 12 * u, width: `${w * g}%`, background: row.fill, border: `${2 * u}px solid ${C.ink}` }} />
              {row.e.moe !== null && <div style={{ position: "absolute", left: `${lo}%`, width: `${hi - lo}%`, top: "50%", height: 6 * u, marginTop: -3 * u, background: C.pencil, opacity: prog(f, row.at + 40, 15) }} />}
              <div style={{ position: "absolute", left: `calc(${hi * g}% + ${20 * u}px)`, top: 0, bottom: 0, display: "flex", alignItems: "center", gap: 16 * u, fontSize: 44 * u, fontWeight: 700, whiteSpace: "nowrap", opacity: g }}>
                {pct(row.e)}
                <span style={{ fontSize: 32 * u, color: C.muted, fontWeight: 400 }}>{margin(row.e)}</span>
              </div>
            </div>
          </div>
        );
      })}
      <Stamp f={f} at={170}>
        <div style={{ border: `${4 * u}px solid ${C.pencil}`, color: C.pencil, fontFamily: F.caps, fontWeight: 900, fontSize: 56 * u, textTransform: "uppercase", padding: `${8 * u}px ${20 * u}px` }}>{`${r.name}: ${r.verdict}`}</div>
      </Stamp>
      <Body p={prog(f, 260, 20)} size={0.9}>{COPY.C7.text}</Body>
    </Page>
  );
};
```

- [ ] **Step 3: Write `video/src/scenes/S5Ask.tsx`**

```tsx
import React from "react";
import { useCurrentFrame } from "remotion";
import { COPY } from "../copy";
import { DATA } from "../data";
import { C, F } from "../theme";
import { Body, Hand, Page, Stamp, Tag, prog, useLayout } from "../ui";

export const S5Ask: React.FC<{ k?: number }> = ({ k = 1 }) => {
  const f = useCurrentFrame() / k;
  const { u, tall } = useLayout();
  const q = COPY.Q1.text;
  const typed = q.slice(0, Math.max(0, Math.floor((f - 10) * 0.8)));
  const card = prog(f, 90, 20);
  const asOf = new Date(`${DATA.asOf}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const items = COPY.C8.text.split(" · ");
  return (
    <Page>
      <div style={{ display: "flex", alignItems: "center", border: `${2 * u}px solid ${C.ink}`, padding: `${20 * u}px ${28 * u}px`, fontSize: 48 * u, minHeight: 64 * u }}>
        {typed}
        <div style={{ width: 4 * u, height: 52 * u, marginLeft: 4 * u, background: C.ink, opacity: Math.floor(f / 15) % 2 === 0 ? 1 : 0 }} />
      </div>
      <div style={{ borderTop: `${4 * u}px solid ${C.ink}`, paddingTop: 24 * u, opacity: card, transform: `translateY(${(1 - card) * 40 * u}px)` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 32 * u }}>
          <div style={{ fontFamily: F.caps, fontWeight: 900, fontSize: 200 * u, lineHeight: 0.9 }}>{DATA.robbery.count.toLocaleString("en-US")}</div>
          <Stamp f={f} at={125}>
            <Tag name={COPY.T1.text.split(" · ")[1]} />
          </Stamp>
        </div>
        <Body size={0.8}>{DATA.robbery.caption}</Body>
        <div style={{ fontSize: 32 * u, color: C.muted }}>{`${COPY.K4.text} ${asOf}`}</div>
      </div>
      {!tall && (
        <div style={{ position: "relative", height: 72 * u }}>
          {items.map((t, i) => {
            const at = 270 + i * 40;
            const out = i === items.length - 1 ? 0 : prog(f, at + 34, 6);
            return (
              <div key={t} style={{ position: "absolute", inset: 0, opacity: prog(f, at, 8) * (1 - out) }}>
                <Hand>{t}</Hand>
              </div>
            );
          })}
        </div>
      )}
    </Page>
  );
};
```
(`COPY.T1.text.split(" · ")[1]` is `CITY`, the robbery count's source.)

- [ ] **Step 4: Register** — add to the `Scenes` folder in `video/src/Root.tsx`

```tsx
<Composition id="S3-Address" component={S3Address} durationInFrames={450} fps={30} width={1920} height={1080} defaultProps={{ k: 1 }} />
<Composition id="S4-FactSheet" component={S4FactSheet} durationInFrames={360} fps={30} width={1920} height={1080} defaultProps={{ k: 1 }} />
<Composition id="S5-Ask" component={S5Ask} durationInFrames={480} fps={30} width={1920} height={1080} defaultProps={{ k: 1 }} />
```
with the matching imports.

- [ ] **Step 5: Tests, typecheck, stills**

```bash
cd video && npm test && npx tsc --noEmit
npx remotion still S3-Address out/stills/s3-f440.png --frame=440
npx remotion still S4-FactSheet out/stills/s4-f350.png --frame=350
npx remotion still S5-Ask out/stills/s5-f300.png --frame=300
npx remotion still S5-Ask out/stills/s5-f470.png --frame=470
```
View each with Read. Check: the clip shows City Hall's result and all four callouts are circled by f440; the Riverwest and city figures equal `data.json` and the margin bars sit inside each bar's range; the count equals `data.json`; nothing overlaps or leaves the safe area.

- [ ] **Step 6: Commit**

```bash
cd /Users/tarikmoody/Projects/dycu/inventory
git add video/src/scenes video/src/Root.tsx
git commit -m "feat(video): address, fact sheet and Ask scenes

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 8: Trust, audiences, coming next, start

**Files:**
- Create: `video/src/scenes/S6Trust.tsx`, `video/src/scenes/S7WhoFor.tsx`, `video/src/scenes/S8ComingNext.tsx`, `video/src/scenes/S9Start.tsx`
- Modify: `video/src/Root.tsx`

- [ ] **Step 1: Write `video/src/scenes/S6Trust.tsx`**

```tsx
import React from "react";
import { useCurrentFrame } from "remotion";
import { COPY } from "../copy";
import { C } from "../theme";
import { Body, Headline, Page, Rule, Stamp, Tag, prog, useLayout } from "../ui";

export const S6Trust: React.FC<{ k?: number }> = ({ k = 1 }) => {
  const f = useCurrentFrame() / k;
  const { u, tall } = useLayout();
  const tags = COPY.T1.text.split(" · ");
  const names = COPY.C11.text.split(" · ");
  const t0 = tall ? 60 : 150;
  return (
    <Page>
      {!tall && <Body p={prog(f, 0, 20)}>{COPY.C9.text}</Body>}
      <Headline p={prog(f, tall ? 0 : 70, 20)}>{COPY.C10.text}</Headline>
      <Rule p={prog(f, tall ? 20 : 100, 25)} color={C.pencil} weight={6} />
      <div style={{ display: "grid", gridTemplateColumns: tall ? "1fr" : "1fr 1fr", gap: `${16 * u}px ${40 * u}px` }}>
        {tags.map((t, i) => (
          <div key={t} style={{ display: "flex", alignItems: "center", gap: 20 * u }}>
            <Stamp f={f} at={t0 + i * 20}>
              <Tag name={t} />
            </Stamp>
            <span style={{ fontSize: 36 * u, opacity: prog(f, t0 + i * 20 + 5, 10) }}>{names[i]}</span>
          </div>
        ))}
      </div>
    </Page>
  );
};
```

- [ ] **Step 2: Write `video/src/scenes/S7WhoFor.tsx`**

```tsx
import React from "react";
import { useCurrentFrame } from "remotion";
import { COPY } from "../copy";
import { C } from "../theme";
import { Body, Headline, Page, prog, useLayout } from "../ui";

export const S7WhoFor: React.FC<{ k?: number }> = ({ k = 1 }) => {
  const f = useCurrentFrame() / k;
  const { u } = useLayout();
  const col = (title: string, text: string, at: number) => {
    const p = prog(f, at, 20);
    return (
      <div style={{ flex: 1, borderTop: `${4 * u}px solid ${C.ink}`, paddingTop: 24 * u, display: "flex", flexDirection: "column", gap: 20 * u, opacity: p, transform: `translateY(${(1 - p) * 40 * u}px)` }}>
        <Headline size={0.7}>{title}</Headline>
        <Body size={0.8}>{text}</Body>
      </div>
    );
  };
  return (
    <Page>
      <div style={{ display: "flex", gap: 60 * u }}>
        {col(COPY.L1.text, COPY.C12.text, 0)}
        {col(COPY.L2.text, COPY.C13.text, 90)}
      </div>
    </Page>
  );
};
```

- [ ] **Step 3: Write `video/src/scenes/S8ComingNext.tsx`**

```tsx
import React from "react";
import { useCurrentFrame } from "remotion";
import { COPY } from "../copy";
import { Circle, Hand, Headline, Page, prog } from "../ui";

export const S8ComingNext: React.FC<{ k?: number }> = ({ k = 1 }) => {
  const f = useCurrentFrame() / k;
  const [lead, rest] = COPY.C14.text.split(": ");
  return (
    <Page>
      <Hand p={prog(f, 0, 15)} size={1.3}>{lead}</Hand>
      <Circle p={prog(f, 40, 40)}>
        <Headline p={prog(f, 10, 20)}>{rest}</Headline>
      </Circle>
    </Page>
  );
};
```

- [ ] **Step 4: Write `video/src/scenes/S9Start.tsx`**

```tsx
import React from "react";
import { useCurrentFrame } from "remotion";
import { COPY } from "../copy";
import { C, F } from "../theme";
import { Body, Page, Rule, prog, useLayout } from "../ui";

export const S9Start: React.FC<{ k?: number }> = ({ k = 1 }) => {
  const f = useCurrentFrame() / k;
  const { u } = useLayout();
  return (
    <Page>
      <div style={{ fontFamily: F.mark, fontWeight: 900, fontStretch: "50%", fontSize: 150 * u, lineHeight: 0.9, opacity: prog(f, 0, 15) }}>{COPY.U1.text}</div>
      <Rule p={prog(f, 15, 30)} color={C.pencil} weight={8} />
      <Body p={prog(f, 40, 20)} size={1.2}>{COPY.C15.text}</Body>
    </Page>
  );
};
```

- [ ] **Step 5: Register** — add to the `Scenes` folder

```tsx
<Composition id="S6-Trust" component={S6Trust} durationInFrames={300} fps={30} width={1920} height={1080} defaultProps={{ k: 1 }} />
<Composition id="S7-WhoFor" component={S7WhoFor} durationInFrames={360} fps={30} width={1920} height={1080} defaultProps={{ k: 1 }} />
<Composition id="S8-ComingNext" component={S8ComingNext} durationInFrames={150} fps={30} width={1920} height={1080} defaultProps={{ k: 1 }} />
<Composition id="S9-Start" component={S9Start} durationInFrames={150} fps={30} width={1920} height={1080} defaultProps={{ k: 1 }} />
```

- [ ] **Step 6: Tests, typecheck, stills**

```bash
cd video && npm test && npx tsc --noEmit
npx remotion still S6-Trust out/stills/s6-f290.png --frame=290
npx remotion still S7-WhoFor out/stills/s7-f350.png --frame=350
npx remotion still S8-ComingNext out/stills/s8-f140.png --frame=140
npx remotion still S9-Start out/stills/s9-f140.png --frame=140
```
View each with Read. Check: all five tags with names; both audience columns; the DNR line circled and complete; the URL readable.

- [ ] **Step 7: Commit**

```bash
cd /Users/tarikmoody/Projects/dycu/inventory
git add video/src/scenes video/src/Root.tsx
git commit -m "feat(video): trust, audiences, coming next and start scenes

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 9: The two cuts, with music, and a full stills review

**Files:**
- Create: `video/src/Master.tsx`, `video/src/scenes/index.ts`, `video/tests/scenes.test.ts`
- Modify: `video/src/Root.tsx`

**Interfaces:**
- Consumes: `WIDE`, `VERTICAL`, `total`, `wideFrames` (Task 2); `MUSIC_START` (Task 5); all scenes.
- Produces: compositions `CreamCityAlmanac` (1920×1080, 2700) and `CreamCityAlmanacVertical` (1080×1920, 900).

- [ ] **Step 1: Failing test** — `video/tests/scenes.test.ts`

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { WIDE } from "../src/timeline.ts";

test("every timeline scene has a component in the scene index", () => {
  const index = readFileSync(new URL("../src/scenes/index.ts", import.meta.url), "utf8");
  for (const s of WIDE) assert.match(index, new RegExp(`"${s.id}":`), s.id);
});
```
Run: `cd video && node --test tests/scenes.test.ts` — Expected: FAIL (no index.ts).

- [ ] **Step 2: Write `video/src/scenes/index.ts`**

```ts
import type React from "react";
import type { SceneId } from "../timeline";
import { S1Problem } from "./S1Problem";
import { S2Reveal } from "./S2Reveal";
import { S3Address } from "./S3Address";
import { S4FactSheet } from "./S4FactSheet";
import { S5Ask } from "./S5Ask";
import { S6Trust } from "./S6Trust";
import { S7WhoFor } from "./S7WhoFor";
import { S8ComingNext } from "./S8ComingNext";
import { S9Start } from "./S9Start";

export const SCENES: Record<SceneId, React.FC<{ k?: number }>> = {
  "S1-Problem": S1Problem,
  "S2-Reveal": S2Reveal,
  "S3-Address": S3Address,
  "S4-FactSheet": S4FactSheet,
  "S5-Ask": S5Ask,
  "S6-Trust": S6Trust,
  "S7-WhoFor": S7WhoFor,
  "S8-ComingNext": S8ComingNext,
  "S9-Start": S9Start,
};
```
Run the test — Expected: PASS.

- [ ] **Step 3: Write `video/src/Master.tsx`**

```tsx
import React from "react";
import { AbsoluteFill, Series, interpolate, staticFile } from "remotion";
import { Audio } from "@remotion/media";
import { MUSIC_START } from "./music";
import { SCENES } from "./scenes";
import { C } from "./theme";
import { VERTICAL, WIDE, total, wideFrames } from "./timeline";

// One cut of the video: its scenes in order (each timed in wide frames, scaled by k), with the music under it.
export const Master: React.FC<{ cut: "wide" | "vertical" }> = ({ cut }) => {
  const tl = cut === "wide" ? WIDE : VERTICAL;
  const end = total(tl);
  return (
    <AbsoluteFill style={{ background: C.paper }}>
      <Series>
        {tl.map((s) => {
          const Scene = SCENES[s.id];
          return (
            <Series.Sequence key={s.id} durationInFrames={s.frames}>
              <Scene k={s.frames / wideFrames(s.id)} />
            </Series.Sequence>
          );
        })}
      </Series>
      <Audio src={staticFile("music.mp3")} trimBefore={MUSIC_START} volume={(fr) => interpolate(fr, [0, 15, end - 45, end], [0, 0.8, 0.8, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })} />
    </AbsoluteFill>
  );
};
```

- [ ] **Step 4: Register the cuts** — add to `video/src/Root.tsx` (outside the folder)

```tsx
<Composition id="CreamCityAlmanac" component={Master} durationInFrames={2700} fps={30} width={1920} height={1080} defaultProps={{ cut: "wide" as const }} />
<Composition id="CreamCityAlmanacVertical" component={Master} durationInFrames={900} fps={30} width={1080} height={1920} defaultProps={{ cut: "vertical" as const }} />
```

- [ ] **Step 5: Full stills review, both cuts**

```bash
cd video && npm test && npx tsc --noEmit
for fr in 0 230 440 890 1250 1560 1730 2030 2390 2540 2690; do npx remotion still CreamCityAlmanac out/stills/wide-$fr.png --frame=$fr; done
for fr in 0 110 230 470 680 770 830 890; do npx remotion still CreamCityAlmanacVertical out/stills/vert-$fr.png --frame=$fr; done
```
View every PNG with Read, at full size. One batch of fixes for anything outside the safe area, overlapping, unreadable, or blank; then re-check only the changed frames once. Frame 0 of both cuts must show the file labels.

- [ ] **Step 6: Commit**

```bash
cd /Users/tarikmoody/Projects/dycu/inventory
git add video/src/Master.tsx video/src/scenes/index.ts video/tests/scenes.test.ts video/src/Root.tsx
git commit -m "feat(video): 90-second wide and 30-second vertical cuts with music

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 10: How to run it, and the decision

**Files:**
- Create: `docs/decisions/056-explainer-video.md`
- Modify: `video/README.md` (replace the scaffold's)

- [ ] **Step 1: Write `video/README.md`**

```markdown
# Cream City Almanac explainer video

A Remotion project, separate from the site (its own packages; the site's build, typecheck, tests and Vercel upload skip this folder).

- `npm test`: checks on-screen copy against the spec's claims table, the timeline, the snapshot and the recording math.
- `CONVEX_URL=https://spotted-tern-278.convex.cloud node scripts/snapshot.mjs`: refreshes the two on-screen figures from production (`src/data.json`, dated).
- `FRAMES_DIR=$PWD/.frames ego-browser nodejs < scripts/record-address.mjs` then `node scripts/frames-to-mp4.mjs .frames public/address.mp4`: re-records the City Hall address lookup.
- `npx remotion studio`: preview. Each scene is also its own composition under Scenes.
- `npx remotion render CreamCityAlmanac out/cream-city-almanac-90s.mp4` and `npx remotion render CreamCityAlmanacVertical out/cream-city-almanac-30s-vertical.mp4`: the videos.
- `npx remotion still Thumbnail out/thumbnail-youtube.png` and `npx remotion still ThumbnailVertical out/thumbnail-vertical.png`: the covers.

Music: see `MUSIC.md` (check the license before posting). Spec: `docs/superpowers/specs/2026-10-16-explainer-video-design.md`.
```

- [ ] **Step 2: Write `docs/decisions/056-explainer-video.md`**

```markdown
# 056: Explain the Almanac in a video built from rebuilt scenes and one real recording

**Decision:** The explainer video recreates the site's parts (fact-sheet row, Ask card, source tags) as animated scenes in the site's own fonts and colors, filled with real production numbers, and shows one real screen recording: the address lookup.

**Why this came up:** Tarik wanted a video for YouTube and social that makes clear what Cream City Almanac is, for residents, journalists and nonprofits. A video can't be corrected after it's posted, so every claim and number in it has to be true on the day it's made.

**Options:**
1. **Rebuilt scenes plus one real recording (chosen).** Crisp at phone size and doesn't break when the site's layout changes; the recording proves the product is live. Cost: the rebuilt parts are a likeness of the site, not the site itself.
2. **All screen recordings.** Most literal. Cost: recordings look soft on phones and go out of date with every UI change.
3. **All rebuilt, no recording.** Cleanest motion. Cost: nothing on screen proves the product actually works.

**What we chose and why (Tarik, 2026-10-16, with Claude):** Option 1. Tarik picked rebuilt scenes and offered ego-browser for recording. Numbers come from production's public endpoints and carry the date they were read; all on-screen text is checked word for word against a claims table traced to /about and the one-pager. Music is a royalty-free library track whose license Tarik checks before posting.

**What we gave up:**
- The video's numbers go stale; the Ask card says "As of" its snapshot date.
- The address recording shows the site as it looked on recording day.
- No narration: the story has to work in on-screen words alone.

**How we'll know if this was right:**
- A muted viewer can say what the Almanac is, that they can type their address, and that every number has a source.
- Views and click-throughs to creamcityalmanac.app from the posts.
- Re-rendering after a site change needs a new snapshot and recording, not new scenes.

**What actually happened:**
```

- [ ] **Step 3: Commit**

```bash
cd /Users/tarikmoody/Projects/dycu/inventory
git add video/README.md docs/decisions/056-explainer-video.md
git commit -m "docs(video): how to run the video project; decision 056

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```
