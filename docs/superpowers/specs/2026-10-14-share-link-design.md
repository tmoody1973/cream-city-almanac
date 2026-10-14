# Cream City Almanac: Share Link to an Answer (Project C2) — Design

Tarik approved this design in conversation on 2026-10-14, section by section.

It is **C2**, gap 4 in docs/research/2026-10-12-questions-by-audience.md. C1, exporting a card as CSV, text or PNG, has been live since 2026-10-12 (decision 032), and it left the link to this project.

## 1. Why

Reporters want to show an answer to an editor. Today the only way to do that is to export a file and send it. "A link an editor can open" is marked **Not yet**.

## 2. Decisions (Tarik, 2026-10-14)

- **Who opens it:** anyone with the link, with no account needed. The page is hidden from search engines.
- **How long:** permanently. A link shows the card as it was on the day it was shared, and it says so.
- **What it shows:** the card only. The question the reporter typed, the AI's reply and the sharer are never shown, and the typed question is never stored.
- **Where the numbers come from:** the server re-runs the card's tool and builds the snapshot itself. The browser sends only the tool's name and arguments, never numbers or text. Anyone signed in could otherwise publish a fake card under the site's name.

## 3. Which cards can be shared

Shareable cards are exactly the cards that export today. Each one is listed with its export builder:

| Tool | Card | Export |
|---|---|---|
| `getNumber` | neighborhood figure | `numberExport` |
| `countRecords` (count) | City count | `countExport` |
| `countRecords` (measure) | City sum, average or median | `measureExport` |
| `timeSpan` | how long | `spanExport` |
| `rankTracts` | tract rank | `rankExport` |
| `compareYears` | tract change | `changeExport` |
| `relateTracts` | tract relate | `relateExport` |
| `factSheet` | neighborhood fact sheet | `factSheetExport` |
| `countStops` | stop and search | `stopsExport` |
| `countTurnout` | turnout | `turnoutExport` |
| `readReport` | report quote | `quoteText` (text only) |

A City count card drawn as a map, with no export bar today, can't be shared either.

**Not shareable:**
- `searchCatalog`, `showDataset` and `previewData`, because they already link to their own pages;
- `findPlace` and `boundariesFor`, so an address never reaches a stored page.

## 4. What people see

**The reporter, in Ask:**
- A shareable card's export bar gains a fourth button: **Share link**.
- Pressing it shows "Making link…", then the link (the current site's address plus `/s/<id>`, e.g. `https://www.creamcityalmanac.app/s/<id>`) and a **Copy** button.
- On any failure it shows "Couldn't make a link. Ask again and retry." No link is made.

**Anyone opening `/s/<id>`, signed in or not:**
- **The card:** title, lines, table, notes (which hold the fine print, caveats and source), all from the stored snapshot. A report quote shows its text.
- **"Shared from Cream City Almanac on <Month D, YYYY>. Numbers are as of that day."**
- **Exports:** CSV, Copy text and PNG, made from the snapshot by the existing `ExportBar` (Copy text only for a report quote).
- **A link,** "Ask your own question →", to `/ask`.
- **Page metadata:** `<meta name="robots" content="noindex">`, and the card's title as the page title and link preview title.
- **An unknown or removed id:** "This shared answer isn't available." Its HTTP status is 404.
- **Layout:** works at phone width, with a 16px side gutter and no sideways scroll. Light and dark follow the site's tokens.

**Never on the page:** the typed question, the AI's reply, who shared it, a map, or the relate scatter chart. The table is the export's table, the same as the PNG.

## 5. How a share is made

**`shares:create`** is a public action. Its arguments are `{ tool: string, args: unknown }`, and it returns `{ ok: true, id } | { ok: false, reason }`. In order:

1. **Signed in:** `ctx.auth.getUserIdentity()`, otherwise `{ ok: false, reason: "signed-out" }`.
2. **Shareable tool:** `tool` must be one of the 11 in §3, otherwise `"not-shareable"`.
3. **Valid arguments:** `args` must pass that tool's existing Zod parameters (`turnoutParams`, `rankParams`, …), otherwise `"bad-args"`.
4. **Rate limit:** a new limiter `askShares`, a token bucket of 30 a day with capacity 30, per account. Otherwise `"limit"`.
5. **Re-run:** the same Convex function Ask's tool calls, run as the reporter, so the tools' own rate limits (`askCity`, `askTracts`, `askEmbeds`) still apply. `countRecords` gets the same `withoutCells` step Ask applies.
6. **Tract cards:** read the full answer that the re-run just saved under its `key` in `mapCache`.
7. **Check the result.** A refusal, an error, "not built yet", or a missing tract detail stores nothing and returns `"failed"`. A count result drawn as a map also returns `"failed"`.
8. **Build** the snapshot with that card's export builder from §3, with `ctx = { origin: "https://www.creamcityalmanac.app", date: <share date, America/Chicago> }`. The origin is a constant, never the browser's: it becomes the dataset links in the snapshot's source line. A share made on dev or a preview still links to the live site's dataset pages (City codes differ on dev, so those links can be wrong there; acceptable).
9. **Store and return** the id.

**The tract cards' text moves.** `RankCard`, `ChangeCard` and `RelateCard` work out their title, lines and fine print inside the component today. That code moves into plain functions in `ui/lib`, which both the cards and `shares:create` call. The cards must render exactly as before.

**The id:** 10 characters from `0-9A-Za-z`, from `crypto.getRandomValues`, about 59 bits. On the extremely unlikely event of a clash with an existing id, draw again.

## 6. The data

**Table `shares`:**
- `id`, the string from §5;
- `kind`, the tool name;
- `card`, the stored `CardExport` (title, lines, csv, text, notes, filename), or `{ quote: string }` for a report quote;
- `createdAt`, a number in milliseconds;
- `by`, the sharer's `tokenIdentifier`, kept only to trace a bad link.

It is indexed `by_id`. Nothing else is stored: no arguments, no question, no reply.

**`shares:get`** is a public query, `{ id }`. It returns `{ kind, card, createdAt }` or `null`, and never `by`.

**`shares:remove`** is an internal mutation, `{ id }`, run by hand: `npx convex run shares:remove '{"id":"…"}' --prod`.

## 7. Testing

**Unit (Vitest):**
- **Moved tract text:** the moved title, lines and fine-print functions give the same text the cards show today, pinned by tests written against the current card output before the move. `tests/ui/cardExport.test.ts` and `tests/ui/tractSummary.test.ts` keep passing.
- **Builders:** for each of the 11 kinds, a fake result goes through the share path's builder and gives the same export as the card's own CSV button.
- **The id:** 10 characters, alphabet only, and no clash in 10,000 draws.

**Database (convex-test, the tools' sources faked):**
- refused when signed out;
- refused for `findPlace` and for an unknown tool, with nothing stored;
- refused for bad arguments;
- a refusing tool result ("Turnout hasn't been built yet.") stores nothing;
- a good share stores one row, and `get` returns it without `by`;
- `remove` deletes it, and `get` then returns `null`;
- the 31st share in a day is refused.

**Browser (Playwright, desktop and phone):**
- A scripted turnout question; press Share link; open the link in a signed-out context. The page shows the title, "Numbers are as of that day.", and the CSV, Copy text and PNG buttons.
- `/s/doesnotexist` shows "This shared answer isn't available."
- The page has `noindex`.

## 8. Docs

- **Decision 043, share link:**
  - anyone with the link;
  - permanent;
  - card only, never the typed question;
  - the server re-runs rather than trusting the browser, and the rare drift that costs;
  - removal is by hand.
  - "What actually happened" is left blank.
- **/how-it-works:** one sentence: any exportable answer can be shared as a link that shows the card as it was that day.
- **The questions document:**
  - "A link an editor can open" becomes **Now**;
  - gap 4 is done.

## 9. Going live

Merging deploys the code and the new table, which starts empty. There's no data step.

## 10. Out of scope

- sharing several cards or a whole conversation;
- a "my shared links" list or a delete button;
- maps and the relate scatter chart on the shared page;
- dataset cards, address and boundary cards;
- links that update when the data does;
- showing the typed question or the AI's reply.
