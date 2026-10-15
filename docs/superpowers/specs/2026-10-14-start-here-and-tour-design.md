# Cream City Almanac: Start Here Update and a First-Visit Tour — Design

Tarik approved this design in conversation on 2026-10-14, part by part.

## 1. Why

**Start here (`/start-here`, `ui/components/StartHere.tsx`)** shows three worked examples:
- a reporter searching;
- a nonprofit using the portrait spreadsheet;
- a resident charting air quality.

It links to "How to use Ask", but shows nothing of what Ask now answers:
- City counts, maps and totals;
- how-long times and ages;
- crime, property, stops, turnout and fire history;
- fact sheets, address lookup and boundaries;
- ZIP codes, census-tract comparisons and City employee tenure;
- share links.

**New visitors get no guided introduction** to the front page or to Ask's cards (source tags, unverified marks, export, share, follow-ups). Tarik asked for a React Joyride tour.

## 2. Decisions (Tarik, 2026-10-14)

- **Start here:** keep the three stories and add a "WHAT YOU CAN ASK" section.
- **Tours:** the front page plus Ask, in two stages: Ask's empty state on the first visit, then the parts of the first answer card when one appears.

## 3. Start here: "WHAT YOU CAN ASK"

- **Where:** after the three examples, before "DYCU'S OWN GUIDES".
- **Rows:** seven ruled rows, in the page's existing type voices. Each has a label, one line, and one question linking to `/ask?prompt=<question>` (the Ask page already fills its box from `?prompt=`).

| Label | Line | Question |
|---|---|---|
| CITY RECORDS | Counts, maps and totals from the City's live files. | How many robberies were there in Harambee this year? |
| HOW LONG | How long City cases take, or have been open so far. | How long have Milwaukee's vacant buildings been vacant? |
| HISTORY | Crime and home values back to 2005, police stops, voter turnout, and Fire Department calls since 2015. | Has the Fire Department's time to arrive changed since 2015? |
| NEIGHBORHOODS & ADDRESSES | Fact sheets, and which neighborhood, district and ward an address is in. | Which neighborhood is 2400 W Center St in? |
| ZIP CODES | Who lives in a ZIP code, beside Milwaukee. | What is the demographic makeup of 53228? |
| CENSUS TRACTS | Rank tracts, see change over time, or where two measures go together. | Where is food insecurity low despite high poverty? |
| CITY EMPLOYEES | How long people have worked for the City. | How long have City of Milwaukee employees worked for the City? |

- **The rows live in a data list:** `ui/lib/startAsk.ts`, `START_ASK: { label; line; question }[]`.
- **A unit test** fails if any question isn't in `ASK_QUESTIONS` (`scripts/ask-questions.ts`), the set graded against the real AI. So the section never ships an ungraded question and costs no new grading.
- **Under the rows:**
  - one line: "Every answer card shows where its numbers came from, exports to CSV, text or a picture, and has a share link.";
  - two ruled links: **TAKE THE TOUR** (`/?tour=1`) and **TOUR ASK** (`/ask?tour=1`).
- **The lede** gains: "…and, below them, what you can ask Ask."

## 4. The tours

### 4.1 Library and loading

- **Library:** `react-joyride@3.2.0`. Its peer dependencies are React 16.8–19; the app runs React 19.3. It's imported only in a client component, loaded with `next/dynamic` and `ssr: false`.
- **Control:** v3's controlled mode (`run`, `stepIndex`, `onEvent`).
  - `EVENTS.STEP_AFTER` and `EVENTS.TARGET_NOT_FOUND` advance the step (back on `ACTIONS.PREV`).
  - `STATUS.FINISHED` or `STATUS.SKIPPED` stops the tour and marks it done.

### 4.2 Look (DESIGN.md rules)

**`TourTooltip`** (Joyride's `tooltipComponent`):
- paper background, a 2px ink rule border, square corners, no shadow;
- the title in the label voice (condensed capitals), the body in the body voice;
- **footer:** "N OF M" on the left; ruled buttons on the right: SKIP TOUR, BACK (from step 2), and NEXT (DONE on the last step);
- the buttons are the compact ruled button (44px, 2px ink rule), with the system focus ring;
- `tooltipProps`, `primaryProps`, `backProps` and `skipProps` are spread as the library requires, so labels, ARIA and actions are the library's.

**Options:**
- `skipBeacon: true`: no beacon, so no pulsing motion;
- `overlayColor: "transparent"` and `spotlightRadius: 0`: nothing dims or lifts off the page;
- `arrowColor` set to paper with an ink outline, by CSS on Joyride's arrow element. If that isn't possible, the arrow is hidden (`arrowSize: 0`);
- `width: "min(380px, calc(100vw - 32px))"`;
- `zIndex` above the sticky panes and below Clerk's dialogs;
- `dismissKeyAction: "close"` (Escape), handled as skip;
- `overlayClickAction: false`;
- `scrollDuration: 0` under `prefers-reduced-motion: reduce`, else 300.

**The target:** while a step shows, its target carries `data-tour-active`. Global CSS gives it the system focus ring look (3px ink outline, 2px offset). The night edition uses Night Ink. Never red.

### 4.3 Steps (`ui/lib/tourSteps.ts`)

Targets are stable `data-tour="…"` attributes on existing elements, except Ask's input. That one is the chat library's own textarea, so it's targeted as `section[aria-label="Ask"] textarea`.

**Front page tour (`/`, key `front`):**

| # | Target | Title | Text |
|---|---|---|---|
| 1 | `[data-tour="search"]` (the slug entry form) | START WITH A WORD | Type what you're looking into: a topic, a place, a dataset's name. DYCU's and the City's data and reports come up. |
| 2 | `[data-tour="three"]` (Find it / Understand it / Check where it came from) | THREE WAYS IN | Find the data, read what it means, and see where every number came from. |
| 3 | `[data-tour="data"]` (The data table) | WHAT'S HERE | DYCU's catalog and the City's open data, counted live. |
| 4 | `[data-tour="ask"]` (Ask a question) | OR JUST ASK | Ask in plain English. Code finds the numbers; the AI never writes one. |
| 5 | `[data-tour="start"]` (the masthead's START HERE link) | WORKED EXAMPLES | Start here shows three people's questions, and what you can ask. |

On a phone, the START HERE link sits in the menu. Step 5's target isn't found, so it's skipped (`TARGET_NOT_FOUND`).

**Ask, stage 1 (`/ask`, key `ask`):**

| # | Target | Title | Text |
|---|---|---|---|
| 1 | `section[aria-label="Ask"] textarea`, or, signed out, `[data-tour="ask-signin"]` | ASK HERE | Ask about Milwaukee in plain English: a neighborhood, a ZIP code, an address, a City record. |
| 2 | `[data-tour="ask-examples"]` ("What can I ask? See examples") | NOT SURE WHAT TO ASK? | Examples for reporters, nonprofits and residents, each checked against real answers. |

**Ask, stage 2 (key `ask-card`):** it starts the first time a card with an export bar is on screen. Each target is scoped to the newest such card (`[data-card]:has([data-export])`, last match; a fallback walks up from the last `[data-export]`).

| # | Target | Title | Text |
|---|---|---|---|
| 1 | the card's `abbr` source tag | WHERE IT CAME FROM | Every number carries its source: DYCU, CITY, CENSUS, or AI for words written by AI. |
| 2 | `[data-export]` | TAKE IT WITH YOU | Download the card as a spreadsheet, text, or a picture. |
| 3 | `[data-share]` | SHARE A LINK | A link that shows this exact card to anyone, no sign-in needed. |
| 4 | `[data-follow-ups="next"]` | KEEP GOING | Next questions that keep this card's place and period. |

A missing target, such as a card without a share link, is skipped. Stage 2 never starts before stage 1 is done.

### 4.4 Memory (`ui/lib/tourState.ts`)

- Each tour stores `localStorage["almanac:tour:<key>"] = "done"` on finish or skip. Keys: `front`, `ask`, `ask-card`.
- Reads and writes are wrapped in try/catch. **If storage is unavailable, the tour doesn't run:** it never nags on every visit.
- **Replay:** `?tour=1` on `/` or `/ask` clears that page's keys (`front`; or `ask` and `ask-card`) and runs.
- **Pure helpers, unit-tested:**
  - `shouldRun(key, storage, forced): boolean`
  - `markDone(key, storage): void`
  - `replayKeys(page): string[]`

### 4.5 Where it mounts

- `Landing.tsx` renders `<Tour id="front" steps={FRONT_STEPS} />`, plus the `data-tour` attributes.
- `AskScreen.tsx` (or `AskPanel.tsx`) renders the stage-1 tour, plus a stage-2 tour that waits for a `[data-export]` inside a `[data-card]`.
  - It watches with a `MutationObserver` on the Ask section and disconnects after the first match or once done.
  - It renders nothing when `ask-card` is already done.

## 5. Tests

**Unit (Vitest):**
- `tourState`: shouldRun (not done → true; done → false; storage throws → false; forced → true), markDone, replayKeys;
- `tourSteps`: every step has a target, a title in capitals and text with no figures; front has 5 steps, Ask stage 1 has 2, stage 2 has 4;
- `START_ASK`: 7 rows; every question is in `ASK_QUESTIONS`; no duplicates;
- a render test of `TourTooltip`: the counter, BACK hidden on step 1, DONE on the last step, SKIP TOUR present.

**Browser (Playwright):**
- **Existing tests:** `previewAccess` (run for every context, including signed-out ones) adds an init script setting all three keys to `"done"`, so no existing test meets a tour.
- **New tests** (a fresh context with no keys):
  - the front tour shows "START WITH A WORD" on a first visit;
  - SKIP TOUR hides it, and a reload keeps it hidden;
  - `/?tour=1` replays it;
  - after the scripted Ask answer, "WHERE IT CAME FROM" appears;
  - Start here shows WHAT YOU CAN ASK with 7 rows, and the first row's link opens `/ask?prompt=…`.

## 6. Docs

- **DESIGN.md:** a "Tour" component section (look, motion, the ink-outline target, no overlay).
- **Decision 049:**
  - the options: restyled react-joyride (chosen), a hand-built tour, or no tour;
  - why no dimmed overlay;
  - why storage-off means no tour.
  - "What actually happened" is left blank.

## 7. Out of scope

- tours on other pages (search, dataset sheets, fact sheets);
- an account-level "seen" flag (signed-in users get the tour once per browser);
- analytics on tour completion;
- new graded example questions.
