# Cream City Almanac: Ask Answers Read Plainly (Part 2) — Design

Tarik approved this design in conversation on 2026-10-15.

## 1. Why

**Ask's own words read like an analyst's notes.** The graded run on 2026-10-15 showed:
- **Every reply runs long.** Each one ran 6 to 10 sentences against a three-sentence rule. The AI restates the card's answer, its places and its caveats, then offers more ("I can run the same check with…").
- **Tract questions dump datasets.** The AI searches the catalog and opens dataset sheets before any tract analysis, because its instructions and the tract tools' descriptions say "find the datasets first, read the column guide (showDataset)". Each lookup draws a card: Tarik's example had 11 dataset links (some repeated, some unrelated) above the answer.
- **Codes leak into the prose.** Dataset codes and column names ("E02", "F02", `pov_rate`, `per_insecure`) appear in the AI's sentences and its suggested next steps ("Compare E02 and F02 margins of error").
- **Numbered points** ("1, 2, 3") get marked unverified.

**The target shape** is the answer Tarik preferred from a general AI agent: the answer first, places people know, figures beside a benchmark, the cutoff stated plainly, one limitation. The ZIP health card (decision 050) already does this in code.

## 2. Decisions (Tarik, 2026-10-15)

- **Part 2 covers how Ask talks:**
  - the AI's replies;
  - the lookup cards around an answer;
  - codes in the AI's words.

  The tract cards' own wording (headlines, field definitions) is rebuilt in Part 1 (neighborhood answers), so it's done once.
- **Fold the lookups in code, and rewrite the reply rules.** Trimming replies in code was rejected: it could cut a caveat mid-thought.
- **The grader gets stricter.** A reply over three sentences, or with a dataset code or column name, is a MISS. **This reverses Tarik's 2026-10-10 call** ("track it, don't fail on it"), now chosen deliberately so that slips show up.

## 3. Fold the lookups (code)

**Which cards fold:**
- **The answer:** everything after one question.
- **When it folds:** the answer includes any analysis call: `countRecords`, `timeSpan`, `rankTracts`, `compareYears`, `relateTracts`, `getNumber`, `factSheet`, `zipProfile`, `zipHealth`, `fireHistory`, `countStops`, `countTurnout`, `findPlace`, `boundariesFor` or `readReport`.
- **What folds:**
  - that answer's `searchCatalog` cards render nothing;
  - its `showDataset` cards render one line: "Dataset used: {name}" with an "Open the sheet →" link.
- **What never folds:** `previewData` cards, since live rows or a chart can be the answer.
- **Answers with no analysis call** ("Is there data on asthma?") are unchanged; the search results are the answer there.

**How:**
- A pure function `lookupIds(messages)` in `ui/lib/askNotes.ts`, beside `earlierCountIds` and `earlierSheetIds`, returns the IDs of the calls to fold.
- The Ask panel provides it through a `Lookups` context, as it does `EarlierCounts`.
- The `searchCatalog` and `showDataset` renders check it.

## 4. How the AI writes (`lib/ask/prompt.ts`)

**The reply rule** (the line beginning "Always end with one to three short sentences") becomes:

> The card already states the answer and carries every figure, place and source. Your reply adds, in plain sentences: one sentence on what it means for the person's question, one caveat that matters, and, if useful, one plain next question they could ask. At most three sentences. Never restate the card's answer, its places or its figures; never offer to do more ("I can also…", "If you want…"); no headings, no bold, no numbered points. Name datasets by their names, never by code or column name.

**Two worked examples follow it in the prompt.** Neither contains a figure.

1. After a ZIP health "low despite high" card:
   > The ZIPs the card lists are leads worth checking on the ground, not proof that something there protects people. The food figures come from a survey, so ZIPs where few people answered have wide ranges. You could ask how one of those ZIPs compares with the county on child food insecurity.
2. After a tract ranking card:
   > This ranking shows where to look first, not why those areas rank high. Small Census areas have wide margins, so areas next to each other in the list may not truly differ. You could ask which neighborhoods those areas fall in.

**Other prompt changes:**
- **Codes:**
  - remove "Years and dataset codes (like N03) are fine" from the first rule (years stay fine);
  - change the story-angle rule from "Name the datasets each angle draws on by code (H05, W01)" to "by name".
- **The tract rule:** remove "Find the datasets first, read the column guide (showDataset), and" from the tract line. The AI may still look things up when it needs a column; the fold hides it.
- **The tract tool descriptions** (`rankTracts`, `compareYears`, `relateTracts` in `lib/ask/tools.ts`): replace "Read the dataset's column guide (showDataset) first and pick a rate over a count" with "Pick a rate over a count; if you don't know the column, call without a valid one and choose from the list it returns."

**Follow-up buttons are unchanged.** Their questions carry a code so Ask picks the exact dataset, and their labels are already plain.

## 5. The checks (`ui/lib/askProse.ts` `replyProblems`, `scripts/ask-report-card.ts`)

- **`replyProblems` gains:**
  - `"code"` when the reply contains a dataset code (`\b[A-Z]\d{2}\b`, e.g. "E02");
  - `"column name"` for a snake_case name (`\b[a-z]+(?:_[a-z0-9]+)+\b`, e.g. "pov_rate").

  Text inside quotation marks is skipped, because the rules require quoting labels exactly.
- **The report card:** a reply with any `replyProblems` is a MISS. The line still prints the problems.

## 6. Tests and grading

**Unit tests:**
- `lookupIds`: an answer with a search, a sheet and a count folds the search and the sheet. One with only a search folds nothing. A preview never folds. Each answer is judged on its own.
- `replyProblems`: "code" and "column name" are found, and quoted labels are skipped.
- The prompt and tool text: the new reply rule and both examples are present; "Find the datasets first" and "(showDataset) first" are gone; codes are no longer "fine".

**Browser test:** the scripted model's "home values" question (a catalog search, then a tract comparison) shows the comparison card and no catalog results. A search-only question still shows its results.

**Real-AI regrade:** all graded questions, about $6–8, with Tarik's OK at the time. **Target:** every question that passed on tools and fields still does, and at least 9 in 10 replies pass the new shape.

## 7. Docs

- **Decision 051:** the fold, the rewritten rules, and the stricter grader (naming the reversal). "What actually happened" is left blank.
- **DESIGN.md:** a line in the Ask section on folded lookups.

## 8. Out of scope

- tract card wording (Part 1);
- trimming replies in code;
- new tools;
- follow-up button wording.
