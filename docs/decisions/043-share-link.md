# 043: A share link shows one Ask card, as it was on the day it was shared, to anyone with the link

**Decision:** Every Ask card that can be exported gets a Share link. The server re-runs the card's question, stores a snapshot of the card, and publishes it at a permanent address (`/s/` and a random 10-character code) that anyone can open without an account. Search engines are told not to list it.

**Why this came up:** Reporters want to show an answer to an editor. Exports (decision 032) produce files to attach. An editor wants to click a link. A public page on the Almanac's own address reads as "the Almanac says this", so getting it wrong means the site vouching for a number it didn't produce, or putting something personal on a public page.

**Options:**
- **Trust the browser.** Store the card exactly as the reporter's browser sends it. Smallest build, but anyone signed in could publish a made-up card under the site's name.
- **Sign every answer.** Stamp each answer with a secret key as it is made, and store only stamped answers. Exact match to the screen, but it adds a secret and work to every question.
- **Re-run on the server (chosen).** The browser says only which question to share. The server asks it again and stores what it got.

**What we chose and why (Tarik, 2026-10-14, with Claude):**
- **Anyone with the link can open it,** so an editor without an account, or a reader of a published story, can see it. The code has about 59 bits of randomness, so links can't be guessed.
- **Permanent,** so a link in a story or an email keeps working. The page says the day it was shared and that the numbers are as of that day.
- **The card only.** What the reporter typed and the AI's reply are never stored or shown, because typed words can hold anything, including names and addresses. Address and boundary cards can't be shared at all.
- **The server re-runs the question** and builds the snapshot with the same code as the card's CSV, text and image exports, so all four agree and no number on a shared page came from a browser.

**What we gave up:**
- If the data changed between asking and sharing (the weekly build), the shared card shows the newer numbers, not the ones on the reporter's screen.
- No "my shared links" list. A link is taken down by hand, by the developer.
- Maps and the relate scatter chart aren't on the shared page: it shows the export's table, like the image export.
- Each share runs its question again, which costs one report search for a report quote.
- Ask's fact-sheet card can't be shared. It has no export, but it already links to the neighborhood's public fact-sheet page.

**How we'll know if this was right:**
- Editors open links instead of asking for files.
- No shared page ever shows a figure that differs from what the server computes for the same question that day.
- No request to take down a link because it exposed something personal.

**What actually happened:**
