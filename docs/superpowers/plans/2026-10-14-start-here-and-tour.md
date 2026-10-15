# Start Here Update and First-Visit Tour Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:**
- Start here gains a "WHAT YOU CAN ASK" section of seven graded questions.
- New visitors get a short, skippable tour of the front page and of Ask (its empty state, then the first answer card), restyled to the design system.

**Architecture:**
- **Pure helpers:** `ui/lib/tourState.ts` (should a tour run, remembering it, replay keys, the tooltip footer) and `ui/lib/tourSteps.ts` (step text and targets).
- **The tour:** one client component, `ui/components/Tour.tsx`, wraps `react-joyride` 3 in controlled mode with a custom ruled tooltip. It drops steps whose target isn't visible, and outlines the current target in ink.
- **Launchers** (`ui/components/TourLaunch.tsx`) decide when each tour starts. `FrontTour` is on the landing page. `AskTours` sits inside the shared Ask panel and runs stage 1, then stage 2 when the first card with an export bar appears.
- **Start here** reads `ui/lib/startAsk.ts`.

**Tech Stack:** Next.js 16 App Router (client components, `next/dynamic` with `ssr: false`), React 19, `react-joyride@3.2.0`, Vitest (edge-runtime: no DOM), Playwright.

**Spec:** `docs/superpowers/specs/2026-10-14-start-here-and-tour-design.md`

## Global Constraints

- **DESIGN.md:**
  - no shadows, radii, gradients or cards;
  - ink-on-paper only, with red only for the grease pencil (never used here);
  - the only motion is the pencil circle, so no beacon pulse;
  - focus is a 3px ink outline offset 2px;
  - ruled buttons have a 2px ink border, square corners and the caps voice.
- **Tooltip text, verbatim:** SKIP TOUR, BACK, NEXT, DONE, and the counter "N OF M".
- **Storage keys:** `almanac:tour:front`, `almanac:tour:ask`, `almanac:tour:ask-card`, each set to `"done"`. If storage is unavailable, no tour runs (forced replay excepted).
- **Replay:** `?tour=1` on `/` clears `front`. On `/ask` (phone) and `/search?ask=1` (laptop, via `laptopAskHref`), it clears `ask` and `ask-card`.
- **Start here questions:** every one must be in `ASK_QUESTIONS` (`scripts/ask-questions.ts`).
- **Permissions:** no dev Convex push or data run is needed. Never stage `.superpowers/` or `clerk-creamcityalmanac.app.zone`.
- **Commit trailer:** `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- **Decision 049:** "What actually happened" stays blank.

## Review Focus

1. **Existing browser tests must never meet a tour,** including signed-out contexts made with `previewAccess`, and local runs with no Vercel bypass set. Pinned in Task 5: the tours-off script runs before `previewAccess`'s early return.
2. **On a laptop, `/ask?tour=1` redirects to `/search?ask=1`.** The replay must survive the redirect. Pinned in Task 1 (`laptopAskHref` keeps `tour=1`).
3. **A step whose target is hidden** (the masthead's START HERE link on a phone, or a card with no share link) is dropped, not shown pointing at nothing. Pinned in Task 2 (`resolveSteps` visibility rule, unit-tested through a pure `pickTarget`).
4. **Storage that throws** (a private window, blocked storage) means no tour, and nothing crashes. Pinned in Task 1.
5. **Stage 2 never starts before stage 1 is done,** and never twice. Pinned in Task 1 (`nextAskStage`) and Task 5's browser test.

---

### Task 1: Tour state, steps, and the laptop redirect (pure)

**Files:**
- Create: `ui/lib/tourState.ts`, `ui/lib/tourSteps.ts`
- Modify: `ui/lib/askPrompt.ts` (`laptopAskHref` keeps `tour=1`)
- Test: `tests/ui/tourState.test.ts`, `tests/ui/askPrompt.test.ts`

**Interfaces:**
- Produces:

```ts
export type TourKey = "front" | "ask" | "ask-card";
export type KeyStore = { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void };
export function safeStorage(): KeyStore | null;
export function shouldRun(key: TourKey, s: KeyStore | null, forced: boolean): boolean;
export function markDone(key: TourKey, s: KeyStore | null): void;
export function replayKeys(page: "front" | "ask"): TourKey[];
export function clearDone(key: TourKey, s: KeyStore | null): void;
export function nextAskStage(s: KeyStore | null, forced: boolean): "ask" | "ask-card" | null;
export function tooltipFooter(index: number, size: number): { counter: string; back: boolean; primary: "NEXT" | "DONE" };
export function pickTarget(targets: string[], isVisible: (sel: string) => boolean): string | null;
// tourSteps.ts
export type TourStep = { targets: string[]; title: string; content: string };
export const FRONT_STEPS: TourStep[]; export const ASK_STEPS: TourStep[]; export const ASK_CARD_STEPS: TourStep[];
```

- [ ] **Step 1: Write the failing tests** in `tests/ui/tourState.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { clearDone, markDone, nextAskStage, pickTarget, replayKeys, shouldRun, tooltipFooter, type KeyStore } from "../../ui/lib/tourState";
import { ASK_CARD_STEPS, ASK_STEPS, FRONT_STEPS } from "../../ui/lib/tourSteps";

const store = (init: Record<string, string> = {}): KeyStore & { data: Record<string, string> } => {
  const data = { ...init };
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = v; }, removeItem: (k) => { delete data[k]; } };
};
const broken: KeyStore = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); }, removeItem: () => { throw new Error("blocked"); } };

describe("tour state", () => {
  it("runs a tour once: not done → run; done → not", () => {
    const s = store();
    expect(shouldRun("front", s, false)).toBe(true);
    markDone("front", s);
    expect(s.data["almanac:tour:front"]).toBe("done");
    expect(shouldRun("front", s, false)).toBe(false);
  });
  it("never runs, and never throws, when storage is missing or blocked, unless forced (review focus 4)", () => {
    expect(shouldRun("front", null, false)).toBe(false);
    expect(shouldRun("front", broken, false)).toBe(false);
    expect(() => markDone("front", broken)).not.toThrow();
    expect(() => clearDone("front", broken)).not.toThrow();
    expect(shouldRun("front", broken, true)).toBe(true);
  });
  it("replays a page's tours by clearing their keys", () => {
    expect(replayKeys("front")).toEqual(["front"]);
    expect(replayKeys("ask")).toEqual(["ask", "ask-card"]);
    const s = store({ "almanac:tour:ask": "done" });
    clearDone("ask", s);
    expect(shouldRun("ask", s, false)).toBe(true);
  });
  it("runs Ask's card stage only after stage 1, and only once (review focus 5)", () => {
    expect(nextAskStage(store(), false)).toBe("ask");
    expect(nextAskStage(store({ "almanac:tour:ask": "done" }), false)).toBe("ask-card");
    expect(nextAskStage(store({ "almanac:tour:ask": "done", "almanac:tour:ask-card": "done" }), false)).toBeNull();
    expect(nextAskStage(store({ "almanac:tour:ask": "done", "almanac:tour:ask-card": "done" }), true)).toBe("ask");
    expect(nextAskStage(null, false)).toBeNull();
  });
  it("words the tooltip footer: counter, back from step 2, done on the last", () => {
    expect(tooltipFooter(0, 5)).toEqual({ counter: "1 OF 5", back: false, primary: "NEXT" });
    expect(tooltipFooter(4, 5)).toEqual({ counter: "5 OF 5", back: true, primary: "DONE" });
  });
  it("points a step at its first visible target, or drops it (review focus 3)", () => {
    expect(pickTarget(["a", "b"], (s) => s === "b")).toBe("b");
    expect(pickTarget(["a"], () => false)).toBeNull();
  });
});

describe("tour steps", () => {
  it("has 5 front steps, 2 Ask steps and 4 card steps, with capital titles and no figures in the text", () => {
    expect([FRONT_STEPS.length, ASK_STEPS.length, ASK_CARD_STEPS.length]).toEqual([5, 2, 4]);
    for (const s of [...FRONT_STEPS, ...ASK_STEPS, ...ASK_CARD_STEPS]) {
      expect(s.targets.length).toBeGreaterThan(0);
      expect(s.title).toBe(s.title.toUpperCase());
      expect(s.content).not.toMatch(/\d/);
    }
    expect(FRONT_STEPS[0]).toMatchObject({ targets: ['[data-tour="search"]'], title: "START WITH A WORD" });
    expect(ASK_STEPS[0].targets).toEqual(['section[aria-label="Ask"] textarea', '[data-tour="ask-signin"]']);
    expect(ASK_CARD_STEPS.map((s) => s.targets[0])).toEqual(['[data-tour-card="tag"]', '[data-tour-card="export"]', '[data-tour-card="share"]', '[data-tour-card="next"]']);
  });
});
```

Append to `tests/ui/askPrompt.test.ts`, inside its `laptopAskHref` describe (or a new `it`):

```ts
  it("keeps a tour replay through the laptop redirect (review focus 2)", () => {
    expect(laptopAskHref("?tour=1")).toBe("/search?ask=1&tour=1");
    expect(laptopAskHref("?prompt=a%26b&tour=1")).toBe("/search?ask=1&prompt=a%26b&tour=1");
  });
```

- [ ] **Step 2: Run them to watch them fail**

Run: `npx vitest run tests/ui/tourState.test.ts tests/ui/askPrompt.test.ts`
Expected: FAIL. The modules don't exist, and the tour parameter is dropped.

- [ ] **Step 3: Write `ui/lib/tourState.ts`**

```ts
// The first-visit tours' memory and small decisions (spec 2026-10-14-start-here-and-tour §4.4). Pure, so they test
// without a browser; the components pass the real localStorage through safeStorage().
export type TourKey = "front" | "ask" | "ask-card";
export type KeyStore = { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void };
const KEY = (k: TourKey) => `almanac:tour:${k}`;

// null when the browser blocks storage: no tour then, rather than one on every visit.
export function safeStorage(): KeyStore | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function shouldRun(key: TourKey, s: KeyStore | null, forced: boolean): boolean {
  if (forced) return true;
  if (!s) return false;
  try {
    return s.getItem(KEY(key)) !== "done";
  } catch {
    return false;
  }
}

export function markDone(key: TourKey, s: KeyStore | null): void {
  try { s?.setItem(KEY(key), "done"); } catch { /* storage blocked: the tour simply shows again next time */ }
}

export function clearDone(key: TourKey, s: KeyStore | null): void {
  try { s?.removeItem(KEY(key)); } catch { /* storage blocked */ }
}

export const replayKeys = (page: "front" | "ask"): TourKey[] => (page === "front" ? ["front"] : ["ask", "ask-card"]);

// Ask's two stages: the empty state first, then the first answer card; never the card stage before stage 1 is done.
export function nextAskStage(s: KeyStore | null, forced: boolean): "ask" | "ask-card" | null {
  if (shouldRun("ask", s, forced)) return "ask";
  return shouldRun("ask-card", s, false) ? "ask-card" : null;
}

export const tooltipFooter = (index: number, size: number) => ({
  counter: `${index + 1} OF ${size}`,
  back: index > 0,
  primary: (index === size - 1 ? "DONE" : "NEXT") as "NEXT" | "DONE",
});

export const pickTarget = (targets: string[], isVisible: (sel: string) => boolean): string | null => targets.find(isVisible) ?? null;
```

Note: when forced, `nextAskStage` returns "ask". The launcher clears both keys first, so the card stage follows naturally.

- [ ] **Step 4: Write `ui/lib/tourSteps.ts`**

```ts
// The tours' words and targets (spec 2026-10-14-start-here-and-tour §4.3). Targets are stable data-tour attributes,
// except Ask's input (the chat library's own textarea). A step lists fallbacks; the first visible one is used.
export type TourStep = { targets: string[]; title: string; content: string };

export const FRONT_STEPS: TourStep[] = [
  { targets: ['[data-tour="search"]'], title: "START WITH A WORD", content: "Type what you're looking into: a topic, a place, a dataset's name. DYCU's and the City's data and reports come up." },
  { targets: ['[data-tour="three"]'], title: "THREE WAYS IN", content: "Find the data, read what it means, and see where every number came from." },
  { targets: ['[data-tour="data"]'], title: "WHAT'S HERE", content: "DYCU's catalog and the City's open data, counted live." },
  { targets: ['[data-tour="ask"]'], title: "OR JUST ASK", content: "Ask in plain English. Code finds the numbers; the AI never writes one." },
  { targets: ['[data-tour="start"]'], title: "WORKED EXAMPLES", content: "Start here shows three people's questions, and what you can ask." },
];

export const ASK_STEPS: TourStep[] = [
  { targets: ['section[aria-label="Ask"] textarea', '[data-tour="ask-signin"]'], title: "ASK HERE", content: "Ask about Milwaukee in plain English: a neighborhood, a ZIP code, an address, a City record." },
  { targets: ['[data-tour="ask-examples"]'], title: "NOT SURE WHAT TO ASK?", content: "Examples for reporters, nonprofits and residents, each checked against real answers." },
];

export const ASK_CARD_STEPS: TourStep[] = [
  { targets: ['[data-tour-card="tag"]'], title: "WHERE IT CAME FROM", content: "Every number carries its source: DYCU, CITY, CENSUS, or AI for words written by AI." },
  { targets: ['[data-tour-card="export"]'], title: "TAKE IT WITH YOU", content: "Download the card as a spreadsheet, text, or a picture." },
  { targets: ['[data-tour-card="share"]'], title: "SHARE A LINK", content: "A link that shows this exact card to anyone, no sign-in needed." },
  { targets: ['[data-tour-card="next"]'], title: "KEEP GOING", content: "Next questions that keep this card's place and period." },
];
```

- [ ] **Step 5: Keep `tour=1` through the laptop redirect.** In `ui/lib/askPrompt.ts`:

```ts
export function laptopAskHref(search: string): string {
  const prompt = readPrompt(search);
  const tour = new URLSearchParams(search).get("tour") === "1" ? "&tour=1" : "";
  return `${prompt ? `/search?ask=1&prompt=${encodeURIComponent(prompt)}` : "/search?ask=1"}${tour}`;
}
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run tests/ui/tourState.test.ts tests/ui/askPrompt.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add ui/lib/tourState.ts ui/lib/tourSteps.ts ui/lib/askPrompt.ts tests/ui/tourState.test.ts tests/ui/askPrompt.test.ts
git commit -m "feat: tour memory, steps and footer words; laptop Ask keeps a tour replay

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: The tour component and the front-page tour

**Files:**
- Modify: `package.json` / lockfile (`react-joyride@3.2.0`)
- Create: `ui/components/Tour.tsx`, `ui/components/TourTooltip.tsx`, `ui/components/tour.module.css`, `ui/components/TourLaunch.tsx`
- Modify: `app/globals.css` (`[data-tour-active]`), `ui/components/Landing.tsx` (data-tour attributes, `<FrontTour />`), `ui/components/SiteNav.tsx` (`data-tour="start"` on the masthead's START HERE link)

**Interfaces:**
- Consumes: Task 1 (all).
- Produces:
  - `Tour` (default export; props `{ id: TourKey; steps: TourStep[]; onDone?: () => void }`)
  - `FrontTour`, `AskTours` (named, from `TourLaunch.tsx`; `AskTours` is filled in Task 3)

- [ ] **Step 1: Install**

Run: `npm install react-joyride@3.2.0 --save-exact`
Expected: added. Check: `npm ls react-joyride` prints `react-joyride@3.2.0` with no peer warning for React 19.

- [ ] **Step 2: Confirm the v3 API before writing code.** Read `node_modules/react-joyride/dist/index.d.ts` (or `index.d.mts`) and confirm these names:
  - `Joyride` (named export);
  - `ACTIONS`, `EVENTS`, `STATUS`, `EventData`, `TooltipRenderProps`, `Step`;
  - the props `run`, `stepIndex`, `steps`, `onEvent`, `tooltipComponent`, `options`, and `continuous` (or its v3 equivalent);
  - the option names `skipBeacon`, `hideOverlay`, `spotlightRadius`, `zIndex`, `width`, `scrollDuration`, `dismissKeyAction`, `overlayClickAction`.

  Any name that differs is a plan error: use the real name and ledger a ruling.

- [ ] **Step 3: Write `ui/components/TourTooltip.tsx`**

```tsx
"use client";

import type { TooltipRenderProps } from "react-joyride";
import { tooltipFooter } from "@/ui/lib/tourState";
import styles from "./tour.module.css";

// The tour's note, ruled like everything else on the sheet (DESIGN.md: no shadow, no radius, ink rules, ruled buttons).
export function TourTooltip({ backProps, index, primaryProps, size, skipProps, step, tooltipProps }: TooltipRenderProps) {
  const f = tooltipFooter(index, size);
  return (
    <div {...tooltipProps} className={styles.tour} data-tour-tooltip>
      {step.title && <p className={styles.title}>{step.title}</p>}
      <p className={styles.text}>{step.content}</p>
      <div className={styles.foot}>
        <span className={styles.count}>{f.counter}</span>
        <button {...skipProps} className={styles.button}>SKIP TOUR</button>
        {f.back && <button {...backProps} className={styles.button}>BACK</button>}
        <button {...primaryProps} className={styles.button}>{f.primary}</button>
      </div>
    </div>
  );
}
```

(Spreading the props after `className` would override it, which is why `className` comes after each spread here. If the library's props carry their own `title` or `aria-label` text, keep them: they are the accessible names.)

- [ ] **Step 4: Write `ui/components/tour.module.css`**

```css
/* DESIGN.md "Tour": a ruled note on paper. No shadow, no radius, no motion. */
.tour { max-width: min(380px, calc(100vw - 32px)); padding: 14px 16px; background: var(--paper); color: var(--ink); border: var(--rule); border-radius: 0; box-shadow: none; }
.title { margin: 0 0 6px; font-family: var(--font-caps); font-weight: 700; font-size: var(--fs-label); line-height: 1.05; }
.text { margin: 0 0 12px; font-size: var(--fs-small); }
.foot { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.count { margin-right: auto; font-family: var(--font-caps); font-weight: 700; font-size: var(--fs-small); font-variant-numeric: tabular-nums; }
.button { min-height: 44px; padding: 0 clamp(12px, 2.4vw, 20px); border: var(--rule); border-radius: 0; background: var(--paper); color: var(--ink); font-family: var(--font-caps); font-weight: 700; font-size: var(--fs-small); cursor: pointer; }
```

Append to `app/globals.css`, after the `:focus-visible` rule:

```css
/* The tour's current target: the system focus ring, so it reads as "this one" without color (DESIGN.md "Tour"). */
[data-tour-active] { outline: 3px solid var(--ink); outline-offset: 2px; }
```

- [ ] **Step 5: Write `ui/components/Tour.tsx`**

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { ACTIONS, EVENTS, Joyride, STATUS, type EventData, type Step } from "react-joyride";
import { markDone, pickTarget, safeStorage, type TourKey } from "@/ui/lib/tourState";
import type { TourStep } from "@/ui/lib/tourSteps";
import { TourTooltip } from "./TourTooltip";

// A target counts only if it is on screen now (the phone hides the masthead's links, a card may have no share link).
const visible = (sel: string) => {
  const el = document.querySelector(sel);
  return !!el && el.getClientRects().length > 0;
};

// One first-visit tour (spec 2026-10-14-start-here-and-tour §4). Controlled: we own the step index; finishing,
// skipping or Escape marks it done in this browser.
const resolve = (steps: TourStep[]): Step[] =>
  steps.flatMap((s) => { const target = pickTarget(s.targets, visible); return target ? [{ target, title: s.title, content: s.content }] : []; });

export default function Tour({ id, steps, onDone }: { id: TourKey; steps: TourStep[]; onDone?: () => void }) {
  const [resolved, setResolved] = useState<Step[]>([]);
  const [run, setRun] = useState(false);
  const [index, setIndex] = useState(0);
  const reduce = useMemo(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches, []);

  // Targets can arrive after the page (Ask's input is the chat library's own, mounted late): wait up to 5 s, checking
  // every 250 ms, for the first step's target; then fix the step list once. Nothing found: no tour this visit.
  useEffect(() => {
    let tries = 0;
    let timer: ReturnType<typeof setTimeout>;
    const attempt = () => {
      if (pickTarget(steps[0]?.targets ?? [], visible) || tries >= 20) {
        const r = resolve(steps);
        if (r.length) { setResolved(r); setRun(true); }
        return;
      }
      tries += 1;
      timer = setTimeout(attempt, 250);
    };
    attempt();
    return () => clearTimeout(timer);
  }, [steps]);

  // The current step's target wears the focus-ring outline while its note shows.
  useEffect(() => {
    if (!run) return;
    const sel = resolved[index]?.target;
    const el = typeof sel === "string" ? document.querySelector(sel) : null;
    el?.setAttribute("data-tour-active", "");
    return () => el?.removeAttribute("data-tour-active");
  }, [run, index, resolved]);

  const finish = () => {
    if (!run) return; // finish once, however many end events arrive
    setRun(false);
    markDone(id, safeStorage());
    onDone?.();
  };
  const onEvent = (d: EventData) => {
    if (d.status === STATUS.FINISHED || d.status === STATUS.SKIPPED || d.action === ACTIONS.CLOSE) return finish();
    if (d.type === EVENTS.STEP_AFTER || d.type === EVENTS.TARGET_NOT_FOUND) setIndex(d.index + (d.action === ACTIONS.PREV ? -1 : 1));
  };

  if (!resolved.length) return null;
  return (
    <Joyride
      run={run}
      stepIndex={index}
      steps={resolved}
      continuous
      onEvent={onEvent}
      tooltipComponent={TourTooltip}
      options={{ skipBeacon: true, hideOverlay: true, spotlightRadius: 0, zIndex: 900, width: "min(380px, calc(100vw - 32px))", scrollDuration: reduce ? 0 : 300, dismissKeyAction: "close", overlayClickAction: false, arrowColor: "var(--paper)" }}
    />
  );
}
```

Ruling to record: the spec says `overlayColor: "transparent"`; `hideOverlay: true` meets the same rule (nothing dims) and leaves the page clickable (no invisible layer). Ruling to record: the spec's `TourTooltip` render test isn't possible (Vitest runs in edge-runtime with no DOM or testing library); its logic is the pure `tooltipFooter`, tested in Task 1, and the browser test checks the rendered note.

- [ ] **Step 6: Write `ui/components/TourLaunch.tsx`** (the front tour now; `AskTours` comes in Task 3):

```tsx
"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { clearDone, replayKeys, safeStorage, shouldRun } from "@/ui/lib/tourState";
import { FRONT_STEPS } from "@/ui/lib/tourSteps";

// The tour library loads only in the browser, and only when a tour will run.
const Tour = dynamic(() => import("./Tour"), { ssr: false });
const forcedReplay = () => new URLSearchParams(window.location.search).get("tour") === "1";

export function FrontTour() {
  const [start, setStart] = useState(false);
  useEffect(() => {
    const s = safeStorage();
    const forced = forcedReplay();
    if (forced) for (const k of replayKeys("front")) clearDone(k, s);
    setStart(shouldRun("front", s, forced));
  }, []);
  return start ? <Tour id="front" steps={FRONT_STEPS} /> : null;
}
```

- [ ] **Step 7: Mark the targets and mount.**
  - `ui/components/Landing.tsx`:
    - add `data-tour="search"` to the `<form … role="search">`;
    - add `data-tour="three"` to `<div className={styles.three}>`;
    - add `data-tour="data"` to the `<section>` holding "The data" heading;
    - add `data-tour="ask"` to the `<section>` holding "Ask a question";
    - render `<FrontTour />` as the last child of `<main>`;
    - import `FrontTour` from `./TourLaunch`.
  - `ui/components/SiteNav.tsx`: on the START HERE `<Link>`, add `data-tour={placement === "masthead" ? "start" : undefined}`.

- [ ] **Step 8: Typecheck and build**

Run: `npx tsc --noEmit -p . && npx vitest run tests/ui && npm run build > .superpowers/sdd/2026-10-14-start-here-and-tour/build.log 2>&1; echo build=$?`
Expected: no type errors, UI tests pass, and `build=0`. The landing page stays prerendered: `FrontTour` is a client island that renders nothing on the server.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json ui/components/Tour.tsx ui/components/TourTooltip.tsx ui/components/tour.module.css ui/components/TourLaunch.tsx app/globals.css ui/components/Landing.tsx ui/components/SiteNav.tsx
git commit -m "feat: a ruled first-visit tour of the front page (react-joyride, restyled)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Ask's two-stage tour

**Files:**
- Modify: `ui/components/TourLaunch.tsx` (`AskTours`), `ui/components/AskPanel.tsx` (data-tour attributes, mount)

**Interfaces:**
- Consumes: `nextAskStage`, `clearDone`, `replayKeys`, `safeStorage` (Task 1); `ASK_STEPS`, `ASK_CARD_STEPS` (Task 1); `Tour` (Task 2).
- Produces: `AskTours`.

- [ ] **Step 1: Add `AskTours`** to `ui/components/TourLaunch.tsx`. Import `nextAskStage` and `ASK_STEPS`, `ASK_CARD_STEPS`.

```tsx
// Stage 2's targets: the newest card that has an export bar, and the follow-up buttons under it.
function tagNewestCard(): boolean {
  const bars = document.querySelectorAll("[data-card] [data-export]");
  const bar = bars[bars.length - 1];
  const card = bar?.closest("[data-card]");
  if (!bar || !card) return false;
  document.querySelectorAll("[data-tour-card]").forEach((el) => el.removeAttribute("data-tour-card"));
  card.querySelector("abbr")?.setAttribute("data-tour-card", "tag");
  bar.setAttribute("data-tour-card", "export");
  card.querySelector("[data-share]")?.setAttribute("data-tour-card", "share");
  const next = document.querySelectorAll('[data-follow-ups="next"]');
  next[next.length - 1]?.setAttribute("data-tour-card", "next");
  return true;
}

// Ask (spec §4.3): stage 1 on the first visit; stage 2 the first time a full answer card appears.
export function AskTours() {
  const [stage, setStage] = useState<"ask" | "ask-card" | null>(null);
  const [cardReady, setCardReady] = useState(false);
  useEffect(() => {
    const s = safeStorage();
    const forced = forcedReplay();
    if (forced) for (const k of replayKeys("ask")) clearDone(k, s);
    setStage(nextAskStage(s, forced));
  }, []);
  useEffect(() => {
    if (stage !== "ask-card" || cardReady) return;
    if (tagNewestCard()) return setCardReady(true);
    const watch = new MutationObserver(() => { if (tagNewestCard()) { watch.disconnect(); setCardReady(true); } });
    watch.observe(document.body, { childList: true, subtree: true });
    return () => watch.disconnect();
  }, [stage, cardReady]);
  if (stage === "ask") return <Tour id="ask" steps={ASK_STEPS} onDone={() => setStage(nextAskStage(safeStorage(), false))} />;
  if (stage === "ask-card" && cardReady) return <Tour id="ask-card" steps={ASK_CARD_STEPS} />;
  return null;
}
```

- [ ] **Step 2: Mark and mount in `ui/components/AskPanel.tsx`**
  - The "What can I ask? See examples →" `<Link>` gets `data-tour="ask-examples"`.
  - The signed-out "Sign in to ask" button gets `data-tour="ask-signin"`: wrap its label element or add it to the button inside `SignInButton`.
  - Render `<AskTours />` once inside the Ask `<section aria-label="Ask">` (or as the panel's last child), and import it from `./TourLaunch`.

- [ ] **Step 3: Typecheck, test and build**

Run: `npx tsc --noEmit -p . && npx vitest run tests/ui && npm run build > .superpowers/sdd/2026-10-14-start-here-and-tour/build.log 2>&1; echo build=$?`
Expected: PASS and `build=0`.

- [ ] **Step 4: Commit**

```bash
git add ui/components/TourLaunch.tsx ui/components/AskPanel.tsx
git commit -m "feat: Ask's tour: where to ask, then the first card's source, export, share and next questions

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Start here, "WHAT YOU CAN ASK"

**Files:**
- Create: `ui/lib/startAsk.ts`
- Modify: `ui/components/StartHere.tsx`, `ui/components/start.module.css`
- Test: `tests/ui/startAsk.test.ts`

**Interfaces:**
- Produces: `START_ASK: { label: string; line: string; question: string }[]`

- [ ] **Step 1: Write the failing test** in `tests/ui/startAsk.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ASK_QUESTIONS } from "../../scripts/ask-questions";
import { START_ASK } from "../../ui/lib/startAsk";

describe("Start here: what you can ask", () => {
  it("lists seven graded questions, no repeats", () => {
    expect(START_ASK.map((r) => r.label)).toEqual(["CITY RECORDS", "HOW LONG", "HISTORY", "NEIGHBORHOODS & ADDRESSES", "ZIP CODES", "CENSUS TRACTS", "CITY EMPLOYEES"]);
    const graded = new Set(ASK_QUESTIONS.map((q) => q.q));
    for (const r of START_ASK) expect(graded.has(r.question)).toBe(true);
    expect(new Set(START_ASK.map((r) => r.question)).size).toBe(7);
  });
});
```

- [ ] **Step 2: Run it to watch it fail**

Run: `npx vitest run tests/ui/startAsk.test.ts`
Expected: FAIL, because the module doesn't exist.

- [ ] **Step 3: Write `ui/lib/startAsk.ts`**

```ts
// Start here's "What you can ask" (spec 2026-10-14-start-here-and-tour §3). Every question is in the graded set
// (scripts/ask-questions.ts), so the page never offers one the real AI hasn't been checked on.
export const START_ASK: { label: string; line: string; question: string }[] = [
  { label: "CITY RECORDS", line: "Counts, maps and totals from the City's live files.", question: "How many robberies were there in Harambee this year?" },
  { label: "HOW LONG", line: "How long City cases take, or have been open so far.", question: "How long have Milwaukee's vacant buildings been vacant?" },
  { label: "HISTORY", line: "Crime and home values back to 2005, police stops, voter turnout, and Fire Department calls since 2015.", question: "Has the Fire Department's time to arrive changed since 2015?" },
  { label: "NEIGHBORHOODS & ADDRESSES", line: "Fact sheets, and which neighborhood, district and ward an address is in.", question: "Which neighborhood is 2400 W Center St in?" },
  { label: "ZIP CODES", line: "Who lives in a ZIP code, beside Milwaukee.", question: "What is the demographic makeup of 53228?" },
  { label: "CENSUS TRACTS", line: "Rank tracts, see change over time, or where two measures go together.", question: "Where is food insecurity low despite high poverty?" },
  { label: "CITY EMPLOYEES", line: "How long people have worked for the City.", question: "How long have City of Milwaukee employees worked for the City?" },
];
```

- [ ] **Step 4: Render it in `ui/components/StartHere.tsx`**
  - Import `START_ASK`.
  - Change the lede to: `Three people, three questions, and how each gets an answer here; below them, what you can ask Ask.`
  - Between the closing `</div>` of `styles.examples` and the guides `<section>`, add:

```tsx
        <section className={styles.ask} aria-labelledby="ask-heading" data-start-ask>
          <h3 id="ask-heading" className={styles.guidesHeading}>WHAT YOU CAN ASK</h3>
          <ul className={styles.askRows}>
            {START_ASK.map((r) => (
              <li key={r.label}>
                <span className={styles.askLabel}>{r.label}</span>
                <span>{r.line}</span>
                <Link href={`/ask?prompt=${encodeURIComponent(r.question)}`}>{r.question}<Arrow /></Link>
              </li>
            ))}
          </ul>
          <p>Every answer card shows where its numbers came from, exports to CSV, text or a picture, and has a share link.</p>
          <p className={styles.tourLinks}>
            <Link href="/?tour=1">TAKE THE TOUR<Arrow /></Link>
            <Link href="/ask?tour=1">TOUR ASK<Arrow /></Link>
          </p>
        </section>
```

- [ ] **Step 5: Styles** in `ui/components/start.module.css`:

```css
.ask { display: grid; gap: 12px; margin-top: clamp(28px, 5vw, 48px); padding-top: clamp(16px, 3vw, 24px); border-top: var(--hair); }
.ask p { margin: 0; }
.askRows { margin: 0; padding: 0; list-style: none; border-top: var(--rule); }
.askRows li { display: grid; gap: 4px; padding: 10px 0; border-bottom: var(--hair); }
.askRows a { font-weight: 700; }
.askLabel { font-family: var(--font-caps); font-weight: 700; font-size: var(--fs-label); }
.tourLinks { display: flex; flex-wrap: wrap; gap: 20px; font-weight: 700; }
```

- [ ] **Step 6: Run the tests and typecheck**

Run: `npx vitest run tests/ui/startAsk.test.ts tests/ui && npx tsc --noEmit -p .`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add ui/lib/startAsk.ts ui/components/StartHere.tsx ui/components/start.module.css tests/ui/startAsk.test.ts
git commit -m "feat: Start here shows what you can ask, with seven graded questions and tour links

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Browser tests and docs

**Files:**
- Modify: `e2e/fixtures.ts` (tours off), `e2e/ask.spec.ts` (card-stage test)
- Create: `e2e/tour.spec.ts`, `docs/decisions/049-first-visit-tour.md`
- Modify: `DESIGN.md` (a "Tour" component section)

- [ ] **Step 1: Tours off for every existing test (review focus 1).** In `e2e/fixtures.ts`:

```ts
// No test meets a first-visit tour unless it asks for one: every context marks the tours done, unless the page's
// storage carries almanac:tour:e2e-keep (set by the tour tests themselves).
const TOURS_OFF = () => {
  try {
    if (localStorage.getItem("almanac:tour:e2e-keep")) return;
    for (const k of ["front", "ask", "ask-card"]) localStorage.setItem(`almanac:tour:${k}`, "done");
  } catch { /* storage blocked: tours don't run then anyway */ }
};
```

- At the very top of `previewAccess(context, baseURL, opts: { tours?: boolean } = {})`, before the `if (!bypass || !baseURL) return;`, add `if (!opts.tours) await context.addInitScript(TOURS_OFF);`.
- The `test` fixture still calls `previewAccess(context, baseURL)`, so tours are off by default.

- [ ] **Step 2: Write `e2e/tour.spec.ts`**

```ts
import { expect, previewAccess, test } from "./fixtures";

test("a first visit gets the front-page tour; skip keeps it away; ?tour=1 replays it", async ({ browser, baseURL }) => {
  const context = await browser.newContext();
  await previewAccess(context, baseURL, { tours: true });
  const page = await context.newPage();
  await page.goto("/");
  const note = page.locator("[data-tour-tooltip]");
  await expect(note).toContainText("START WITH A WORD", { timeout: 15_000 });
  await expect(note).toContainText("1 OF");
  await expect(page.locator('[data-tour="search"][data-tour-active]')).toHaveCount(1);
  await note.getByRole("button", { name: "SKIP TOUR" }).click();
  await expect(note).toHaveCount(0);
  await page.reload();
  await page.waitForTimeout(1_500);
  await expect(page.locator("[data-tour-tooltip]")).toHaveCount(0);
  await page.goto("/?tour=1");
  await expect(page.locator("[data-tour-tooltip]")).toContainText("START WITH A WORD", { timeout: 15_000 });
  await context.close();
});

test("Start here lists what you can ask, each opening Ask with the question", async ({ page }) => {
  await page.goto("/start-here");
  const rows = page.locator("[data-start-ask] li");
  await expect(rows).toHaveCount(7);
  await expect(rows.first()).toContainText("CITY RECORDS");
  await expect(rows.first().getByRole("link")).toHaveAttribute("href", /^\/ask\?prompt=How%20many%20robberies/);
  await expect(page.getByRole("link", { name: /TAKE THE TOUR/ })).toHaveAttribute("href", "/?tour=1");
});
```

(If the SKIP TOUR button's accessible name comes from the library's `skipProps` instead of its text, select it with `note.locator("button", { hasText: "SKIP TOUR" })`.)

- [ ] **Step 3: The card stage** (in `e2e/ask.spec.ts`'s "signed in" describe, review focus 5):

```ts
  test("the first answer card gets the card tour: its source, export, share and next questions", async ({ page }, info) => {
    await page.evaluate(() => { localStorage.setItem("almanac:tour:e2e-keep", "1"); localStorage.removeItem("almanac:tour:ask-card"); });
    await page.reload();
    await ask(page, "How long have vacant buildings been vacant?");
    const note = page.locator("[data-tour-tooltip]");
    await expect(note).toContainText("WHERE IT CAME FROM", { timeout: 45_000 });
    await note.getByRole("button", { name: "SKIP TOUR" }).click();
    await expect(note).toHaveCount(0);
    await page.evaluate(() => localStorage.removeItem("almanac:tour:e2e-keep"));
  });
```

(The vacant question uses the scripted model and draws a span card with an export bar.)

- [ ] **Step 4: DESIGN.md.** After the "Follow-up buttons (Ask)" component section, add:

```markdown
### Tour (first visit)
A short note that walks a new visitor through the front page and Ask, once per browser (react-joyride, restyled).
- **Note:** paper, a 2px ink rule, square corners, no shadow; the title in label-voice capitals, the text in the body voice; a footer with the "N OF M" counter and compact ruled buttons SKIP TOUR, BACK, NEXT / DONE.
- **Target:** the step's element wears the system focus ring (3px ink outline, 2px offset). No dimmed page, no spotlight, no beacon; nothing red.
- **Motion:** none of its own; under reduced motion the page jumps to each step instead of scrolling.
- **Memory:** done or skipped is remembered in this browser; Start here's TAKE THE TOUR and TOUR ASK replay it.
```

- [ ] **Step 5: Decision 049** (`docs/decisions/049-first-visit-tour.md`), in 048's format.
  - **Decision:** first-visit tours on the front page and Ask, with react-joyride restyled to the design system; plus Start here's "What you can ask".
  - **Why:** Ask had grown far past what Start here showed; new visitors got no guided introduction.
  - **Options:**
    - react-joyride restyled (chosen: positioning, scrolling, keyboard and focus handling already solved);
    - a hand-built tour (full control, but rebuilding floating-note placement and accessibility);
    - no tour (Start here only).
  - **Chose:** Tarik, 2026-10-14: front page plus Ask in two stages, and keep the three stories while adding "What you can ask".
  - **Gave up:**
    - a dimmed spotlight (the system is flat, so the target gets an ink outline instead);
    - tours where storage is blocked;
    - an account-wide "seen" (it's per browser);
    - a new dependency of about 30 KB, loaded only when a tour runs.
  - **How we'll know:** the browser test shows the tour once and never again after skipping; Ask questions from Start here open filled in; nobody reports being stuck behind a tour.
  - **What actually happened:** blank.

- [ ] **Step 6: Run the whole suite, typecheck and build**

Run: `W=.superpowers/sdd/2026-10-14-start-here-and-tour; uptime; npx vitest run > $W/suite.log 2>&1; grep -E "Test Files|Tests " $W/suite.log; npx tsc --noEmit -p . && npm run build > $W/build.log 2>&1; echo build=$?`
Expected: all pass, `build=0`. If the load average is over 20, rerun with `--testTimeout=120000 --maxWorkers=2` and record both runs.

- [ ] **Step 7: Commit**

```bash
git add e2e/fixtures.ts e2e/tour.spec.ts e2e/ask.spec.ts DESIGN.md docs/decisions/049-first-visit-tour.md
git commit -m "test: first-visit tour and Start here checks; existing browser tests never meet a tour; DESIGN.md and decision 049

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Local look (needs Tarik's OK)

- [ ] **Step 1: Ask Tarik** whether to run the tour browser tests locally (about 2 minutes; `tour.spec.ts` needs no Ask allowance; the card-stage test uses the shared test account), and whether to take phone and laptop screenshots of the front tour's first note and of Start here's new section for him to check.

- [ ] **Step 2 (with OK):** Run the app on :3100 (port 3000 is another app).

Run: `BASE_URL=http://localhost:3100 npx playwright test e2e/tour.spec.ts`
Expected: pass on desktop and phone. Then take the screenshots with a Playwright script (device emulation), and show them.
