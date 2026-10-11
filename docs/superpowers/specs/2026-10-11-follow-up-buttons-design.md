# Cream City Almanac: Follow-up Buttons — Design

Approved in conversation 2026-10-11 (Tarik), section by section. This is Project A of four, in the order A → B → C → D:
- **A, follow-up buttons** (this spec).
- **B, City neighborhood names per tract**, including tracts that belong to several DYCU areas.
- **C, export and share.**
- **D, the neighborhood fact sheet.**

Origin: patterns from CopilotKit's OpenIntelligentUI, adopted without its AI-written UI.

## 1. Why
Two gaps in today's Ask:
- **Dead ends.** When Ask can't tell which column, year, place or neighborhood the person meant, it asks in words. The person then retypes a question naming one of the options it listed.
- **No path onward.** After an answer, nothing suggests what to ask next, even though the card knows enough to offer the obvious follow-ups: the other end of a ranking, where a measure changed, the same count by month.

Buttons fix both, and they serve everyone: residents who don't know what to ask next, reporters following a thread, and grant writers who need the same row for another place.

## 2. Decisions (Tarik, 2026-10-11)
- **A click fills the question box and never sends.** The person can edit the question or press Send, and nothing is spent from the daily question limit by accident.
- **Code builds every button** from the card's own data and the server's own lists. The AI never suggests or rewords a button.
- **Next-question buttons go under four kinds of card:** tract cards, City counts (including property counts), neighborhood-table (N03) rows, and dataset and preview cards. "Which did you mean?" choices come with every refusal that lists options.

## 3. What the reader sees
- **Next-question buttons.** Up to **3** under each card, as a row of ruled caps buttons in the EXPAND button's style.
- **Choices.** When Ask's tool comes back with a list of options, a **"Pick one:"** row of up to **8** buttons appears under Ask's sentence. The options are columns (with their plain meanings), places and years, nearest neighborhood names, or category values.
- **A click** puts the full, ready-worded question in the box and moves the cursor there. On a phone it also scrolls the box into view. It never sends.
- **Only the newest answer** gets buttons; earlier answers show none.
- **Accessibility:** real `<button>`s, keyboard-reachable, at least 44px tall, with a visually hidden "Fills the question box" label.
- **Never shown:** a button for a question the card can't support, an AI-written suggestion, or a figure in a button's question (years, and the person's own cutoffs and dates, are allowed).

## 4. The rules (`ui/lib/nextQuestions.ts`)
Each button is shown only when the card holds what it needs. Questions use the cards' plain helpers (`subject`, `placeName`, the City filter labels) and always name the dataset code and column.

| Card | Label → question | Shown when |
|---|---|---|
| Ranking | SHOW THE LOWEST / SHOW THE HIGHEST → "Rank census tracts by {meaning}, {lowest/highest} first, {place} {year} ({code} {column})." | always |
| Ranking | WHERE DID IT CHANGE? → "Where did {meaning} change most in {place}, from an earlier year to {year}? ({code} {column})" | DYCU columns only, never the property file (no change over time). A wrong year returns a choose-year refusal, which brings its own choices. |
| Ranking, Change | WHAT GOES WITH IT? → "What else goes with {meaning} across {place} census tracts in {year}? ({code} {column})" | always (Change uses its later year) |
| Change | RANK BY THIS → the ranking question for the later year, highest first | always |
| Go-together (relate) | WHERE IS ONE HIGH, THE OTHER LOW? → the mismatch question with these two columns (a high / b low), plus a second button with the sides swapped | relate mode, strength not "too-few" |
| Mismatch | DO THEY GO TOGETHER? → the relate question; FLIP THE SIDES → aSide and bSide swapped | mismatch mode |
| City count | BY MONTH → the same count, grouped by month | the file has a date column, the count isn't grouped, and it isn't a property count |
| City count | SAME PERIOD A YEAR EARLIER → the same filters, `from` and `to` moved back one year | the question had explicit `from` and `to` |
| City count | IN A NEIGHBORHOOD → "{the same count, worded} in " with the cursor at the end | the count has a map (located file) and no neighborhood |
| Property count | TYPICAL HOME VALUE BY TRACT → "Which census tracts have the highest typical home value in the City's Master Property File?"; BY DISTRICT → the same count grouped by aldermanic district | property counts (the count has `of`); BY DISTRICT only when not already grouped |
| N03 row | ANOTHER NEIGHBORHOOD → "{topic}: \"{row}\" in " with the cursor at the end | always |
| Dataset (showDataset) | STORY ANGLES → "Give me story angles using {code} {name}." | the sheet has story angles |
| Dataset (showDataset) | WHAT ARE THE CAVEATS? → "What are the caveats on {code} {name}?" | always |
| Preview (previewData) | RANK TRACTS ON THIS → "Which census tracts rank highest on {code} {name}?" | its fields include GEOID |
| Preview (previewData) | WHAT ARE THE CAVEATS? | always |

There is no "same row, another year" button for N03: its answer carries one year and no list of others. It can come later, if the answer starts listing them.

## 5. The choices (`ui/lib/refusalChoices.ts`)
Each choice's question is the original tool settings with only that choice swapped in, written as a full sentence. Each label is the choice itself; a column's plain meaning is cut at about 60 characters and followed by the column name.

| Refusal | From | Choices |
|---|---|---|
| `choose-column` | rankTracts, compareYears, relateTracts (tagged a or b) | the listed columns, those with margins (`range: true`) first |
| `choose-year` | the same tools | the listed place/years. For two datasets, the shared ones first. |
| `choose` | countRecords | the listed category values (e.g. offense types) |
| `bad-column` | countRecords | the listed columns |
| `no-neighborhood` | countRecords (`nearest`), getNumber (`neighborhoods`) | the names |
| `no-topic`, `choose-row` | getNumber | the topics or rows |

## 6. How it's built
- **Two pure files, unit-tested:**
  - `ui/lib/nextQuestions.ts`, from tool name + settings + result → `{ label, question }[]` (at most 3);
  - `ui/lib/refusalChoices.ts`, from tool name + settings + refusal → `{ label, question }[]` (at most 8).
- **`ui/components/FollowUps.tsx`** renders a row of buttons. A click calls `fill(question)`.
- **The fill path.** The existing prefill path (`PromptFill` in `ui/components/AskPanel.tsx`, used by `?prompt=` links) gains `fill(text)`: it types the text in as the person would, moves the cursor there, and never sends.
- **Wiring in `ui/components/AskCards.tsx`.** Each card renderer adds `<FollowUps>` under its card. The refusal renderers draw the "Pick one:" row where they draw nothing today.
- **Newest answer only**, using the existing newest-message bookkeeping (`ui/lib/askNotes.ts`).
- **No server, data or schema changes.** Every list and setting is already in what the tools return.

## 7. Testing
- **Unit:**
  - every rule, both when it shows and when it doesn't (no change button on property; no "same period" without explicit dates; no "rank tracts" on a non-tract preview; no BY MONTH on a property count);
  - every refusal type, with labels, wording and the caps of 3 and 8;
  - every question names its code and column, and contains no figure except years, cutoffs and dates from the settings;
  - `fill` puts text in the box and never sends.
- **Browser tests** (signed in, scripted model, PR preview):
  - "rank tracts by poverty" shows SHOW THE LOWEST, and clicking it fills the box with a question naming E02 and "lowest first";
  - the "questions left today" line is unchanged after the click;
  - a scripted wrong-column call shows "Pick one:" buttons from the server's list, and one click fills a question with that column. This needs a new scripted-model question in `lib/ask/model.ts`: "wrong column" → rankTracts on E02 with column `nope`;
  - an older answer shows no buttons.
- **Accessibility:** buttons are reachable with Tab and at least 44px tall.

## 8. Records and rollout
- **Decision 030:** code-built buttons that fill and never send; why not AI suggestions; what we gave up. "What actually happened" is left blank for Tarik.
- **DESIGN.md:** a "Follow-up buttons" item.
- **Ask guide:** one line saying buttons under answers fill the box.
- **Rollout:** front end only, one PR; no development or production backend push.

## 9. Out of scope
AI-written or AI-worded suggestions; sending on click; buttons on older answers; remembering which buttons were used; report-card grading (no AI is involved).
