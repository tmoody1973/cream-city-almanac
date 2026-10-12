# Cream City Almanac: Export a Card (CSV, Copy Text, PNG) — Design

Approved in conversation 2026-10-12 (Tarik), section by section. This is Project C1 of the queue (A → B → C → D):
- A, follow-up buttons: live (PR #24).
- B, City neighborhood names per tract: live (PR #25).
- **C1, export a card** (this spec).
- C2, share link to an answer: its own design later.
- D, the neighborhood fact sheet.

## 1. Why
A reporter who gets an answer in Ask can't take it anywhere. The only way out today is a screenshot or retyping, and both drop the source and caveats. Reporters want to do four things with an answer (Tarik, 2026-10-12):
- check the numbers in a spreadsheet;
- quote it in a draft;
- put a picture of it in a story;
- show an editor.

C1 covers the first three. The fourth needs answers saved on a server and a public page, so it is C2.

## 2. Decisions (Tarik, 2026-10-12)
- **Split C.** C1 is CSV, copy as text and PNG, all made in the reporter's browser. C2, the share link, comes later with its own design: what is stored, for how long, and who can open it.
- **Which cards.**
  - Number cards get all three exports: the neighborhood figure (`getNumber`), the City count (`countRecords`), and the three tract cards (rank, change, relate).
  - Report quotes (`readReport`) get copy as text only.
  - Dataset lists, dataset sheets and previews get nothing, because they already link to DYCU's or the City's own files.
- **PNG is drawn from the data**, with the browser's built-in canvas and no new library. It is always in light colors, never contains a map, and won't be pixel-identical to the card.
- **CSV notes go under the table**: data rows, one blank row, then the note lines.

## 3. The one rule
An export copies the card; it never rewrites it. Every number and every sentence in an export is either on the card already or comes from the same data and the same wording functions the card uses. Nothing is written by the model at export time.

## 4. What the reporter sees
- **The export line.** Under each eligible card there is a line of small text buttons, **CSV · Copy text · PNG**. A report quote shows only **Copy text**.
- **Laptop.** The neighborhood-figure card is a one-line note there, because its table is open in the side pane. The buttons sit at the end of that note.
- **While loading.** The tract cards build their exports from the full answer (`tractDetail`, kept for a day). Until it arrives the buttons are disabled and read "Loading…".
- **After the full answer expires.** The line reads "Ask again to export" instead of the buttons. A tract card's own data is only the trimmed copy, at most 10 rows per list, and exporting that under the card's full title would mislead.
- **Feedback.** After **Copy text**, the line says "Copied" for a few seconds. The message is in an `aria-live` region, so screen readers hear it.
- **Errors.**
  - Clipboard blocked: "Couldn't copy. Use CSV instead."
  - Image failed: "Couldn't make the image."

## 5. What every export contains
All three formats are produced from one export, built per card type in `ui/lib/cardExport.ts`. It has five parts: `title`, `head` (column headings), `rows`, `notes` and `filename`. The formats differ only in layout, so they never disagree.

### 5.1 Per card type

| Card | Title | Rows (CSV: all of them) |
|---|---|---|
| Neighborhood figure (`getNumber`) | the card's title: "{neighborhood}, {year} · {topic}" | every row the card holds (`nearby`), with an estimate and ± margin column per group, and a "marked" column naming the asked-for row |
| City count (`countRecords`) | "{name} · {filters} · {period}" | Total, then one row per group, then "Other" if any |
| Rank | the card's title ("Highest pov_rate · County 2023"), then its line "{code} {column} ({meaning}, {kind}) · {place} {year} · {n} census tracts" | every ranked, tied and too-uncertain tract from the full answer |
| Change | the card's title ("pov_rate · County 2022 → 2023"), then the same line | every tract in the full answer's `changes` |
| Relate | the card's title ("{dataset A} vs. {dataset B}"), then one such line per dataset | every tract in the full answer's `points` |
| Report quote | "{report}, {section}" | none (text only: the quote) |

**Tract rows (rank).** Each row has: rank, tract, GEOID, City neighborhoods, DYCU areas, value, low, high and status.
- **Rank:** "1", "2", … for ranked tracts, empty for the others.
- **City neighborhoods:** every kept neighborhood with its share, for example "Hillside 51%; Halyard Park 27%; Triangle North 13%". This is the CSV's version of the card's "+N".
- **DYCU areas:** comma-separated.
- **Status:** "ranked", "tied" or "too uncertain".

**Tract rows (change).** Tract, GEOID, City neighborhoods, DYCU areas, then for each year the value, low and high, then the change and its direction.

**Tract rows (relate).** Tract, GEOID, City neighborhoods, DYCU areas, then the A value, low and high, the B value, low and high, then "fits" / "close" / empty, and status.

### 5.2 Notes
In this order, each one only when the card shows it:
1. **The card's summary sentence** (`rankSummary`, `changeSummary`, `relateSummary`, `propertyCountSummary`).
2. **The card's fine print.** For tract cards: the margin-of-error line, "Property figures are exact (City records).", "Without a margin of error…", "Related doesn't mean one causes the other.", the property notes and `AREA_NOTE`. For the City count: coverage, area, no-location, future-excluded and overlap lines.
3. **The dataset's caveats** (`header.caveats`). On the card these sit behind the "Caveats:" links.
4. **An AI-written caveat** (`countRecords`' `caveat`) is labeled "(written by AI)", as the card's AI tag does.
5. **Source:** "DYCU" or "City of Milwaukee", plus the dataset code(s) and the dataset page URL.
6. **The export line:** "Exported from Cream City Almanac on {date}."

### 5.3 Formats
**CSV**
- A UTF-8 byte-order mark first, so Excel reads "±", "—" and accents.
- Then the header row, the data rows, one blank row, and one note per row in the first column.
- Numbers are the stored values, unrounded, with the unit in the heading: "Per_Poverty (percent)".
- Quoting follows RFC 4180: a field containing a comma, quote or line break is wrapped in quotes, with inner quotes doubled.
- **Formula guard.** A text cell starting with `=`, `+`, `-` or `@` gets a leading `'`, so a spreadsheet never runs it as a formula. Number cells are written as plain numbers, so negative changes stay numbers.

**Copy text**
- The title, a blank line, and the table as one line per row with cells separated by " · ". The first line is the headings.
- Then a blank line and the notes, one per line.
- Values use the card's own rounding (`rangeText`, `formatPortraitNumber`), so a quoted figure matches the screen.

**PNG**
- About 1,200 px wide, white background, ink text, in the app's fonts once they have loaded.
- The title, the summary sentence, then a table of at most 15 rows.
- When there are more: "{N} more rows in the CSV".
- Then the notes, wrapped to the width.
- Values use the card's rounding.
- No map. The relate card's PNG is its table, not its scatter chart; redrawing the chart is a later addition if reporters ask.

**File names**
- `almanac_{code}-{column}_{place}-{year}_{rank|change|relate}.csv` / `.png`.
- `almanac_{code}_{neighborhood}-{year}.csv` for the neighborhood figure.
- `almanac_{code}_count.csv` for the City count.
- Characters outside letters, digits, `-` and `_` become `-`.

## 6. How it is built, in order
1. **`ui/lib/cardExport.ts`** (new, pure functions).
   - One builder per card type turns the card's data into the export (§5).
   - `toCsv(export): string` and `toText(export): string`.
   - `pngLayout(export): Layout` decides lines, rows and wrapping with no drawing, so it can be tested.
2. **`ui/lib/tractSummary.ts`** gains `fineText(heads, { causal, lead })`, the fine-print sentence the `Fine` component in `TractCards.tsx` builds today. `Fine` calls it, and so does the export. The card's visible text is unchanged; the existing card tests prove it.
3. **`ui/lib/cardPng.ts`** (new) draws a `Layout` on a canvas and returns a PNG blob (`canvas.toBlob`). A `null` blob is the "Couldn't make the image." error.
4. **`ui/components/ExportBar.tsx`** (new) shows the buttons and the status line.
   - It takes the export when it is ready, `"loading"`, or `"expired"`.
   - Downloads use a blob URL on an `<a download>`, revoked after the click.
   - Copy uses `navigator.clipboard.writeText`.
5. **Placed** under `NumberCard`, `CountCard`, `RankCard`, `ChangeCard`, `RelateCard` and each report passage, in `AskCards.tsx` and `TractCards.tsx`. A City count that has folded away as an earlier count (`EarlierCounts`) gets no export line.

No server, database or tool changes.

## 7. Testing
**Unit (Vitest)**
- **Builders.** Each card type's builder against fixtures: rank with ties, folded ties and too-uncertain rows; a tract in three City neighborhoods; a property side (exact figures, property notes); change; relate with fits and close; the neighborhood figure with groups; the City count with groups, other, coverage and an AI caveat.
- **CSV.** Quoting of commas, quotes and line breaks; the formula guard (`=`, `+`, `-`, `@` text cells get `'`, and negative numbers don't); the byte-order mark; the notes after one blank row.
- **Text.** The layout and the card's rounding.
- **`pngLayout`.** Rows capped at 15, the "{N} more rows in the CSV" line, notes wrapped.
- **`fineText`.** It equals what `Fine` rendered before, for each case the card tests cover.
- **File names.** Unsafe characters replaced.

**Browser (Playwright, desktop and phone sizes)**
- On a rank card, **CSV** downloads a file whose text holds the header row and "Source:".
- **Copy text** puts the card's title on the clipboard (the test grants clipboard permission).
- **PNG** downloads a file starting with the PNG signature.
- A tract card whose full answer has expired shows "Ask again to export" and no buttons.
- A report quote shows only **Copy text**.
- The export line keeps the page from scrolling sideways at 390 px.

**Not covered:** downloads on a real iPhone. Playwright imitates the phone size, not iOS Safari's download sheet.

## 8. Docs
- **Decision 032, export a card.** Why the PNG is drawn rather than snapshotted, why the CSV keeps raw values while text and PNG keep the card's rounding, why the link waits for C2, and why exports need the full answer. "What actually happened" is left blank.
- **/how-it-works** gains one line: answers can be exported as CSV, text or an image, each carrying its source and caveats.
- **DESIGN.md** gets an "### Export" note under the Ask cards.

## 9. Out of scope
- The share link (C2).
- Exporting maps.
- The relate scatter chart as an image.
- Exporting several cards or a whole conversation at once.
- Exporting dataset lists, sheets and previews.
