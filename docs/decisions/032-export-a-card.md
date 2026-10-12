# 032: Export a card as CSV, text or an image

**Decision:** Ask's number cards get three exports (a CSV, plain text for a draft, and a PNG image), and report quotes get plain text. All are made in the reporter's browser from the card's own data. A share link waits for its own project (C2).

**Why this came up:** Reporters said they want to check an answer's numbers in a spreadsheet, quote it in a draft, put it in a story, and show an editor. The only way out of Ask was a screenshot or retyping, and both drop the source and caveats, which are what keep a number honest in print.

**Options:**
1. **Draw the image from the data** (chosen). Code lays out the title, table and notes on the browser's built-in canvas (a drawing surface in the page). Cost: it isn't pixel-identical to the card, and maps are left out.
2. **Photograph the card as shown** with a small library. Cost: a new dependency, maps come out blank, and the caveats only appear if they happen to be on screen.
3. **Skip the image.** Cost: reporters take screenshots that lose the source.

**What we chose and why (Tarik, 2026-10-12):** One export per card, written three ways, so the CSV, text and image never disagree. The CSV keeps the stored, unrounded values, so the reporter can recompute. Text and image keep the card's rounding, so a quoted figure matches the screen. Tract cards export only from the full answer, never the 10-row copy they show first. The share link is split off because it means saving answers on a server and publishing a page anyone can open.

**What we gave up:**
- The image is a clean table, not a copy of the card, and never shows a map or the relate scatter chart.
- An answer older than a day can't be exported until it is asked again.
- Editors still can't open an answer from a link.

**How we'll know if this was right:** Reporters export rather than screenshot. Exported numbers match the card when checked. No one reports an export missing its source or caveats.

**What actually happened:**
