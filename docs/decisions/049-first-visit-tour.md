# 049: New visitors get a short, skippable tour of the front page and Ask, and Start here shows what Ask can answer

**Decision:**
- **A first-visit tour** on the front page (five notes) and on Ask (two notes on the empty page, then four on the first answer card: where its numbers came from, export, share link, next questions). It uses react-joyride (a ready-made library that places a note beside a page element and steps through a list of them), restyled to the almanac's ruled, ink-on-paper look.
- **Start here gains "WHAT YOU CAN ASK":** seven rows, one per kind of question, each with a question that opens Ask already typed in. Every one is from the set graded against the real AI.

**Why this came up:**
- Ask had grown far past what Start here showed: City counts and "how long" times, crime, property, stops, turnout and fire history, fact sheets, address lookup, ZIP codes, tract comparisons, City employee tenure and share links. Start here still showed three worked examples and a link.
- A new visitor got no guided introduction to the front page, or to the parts of an answer card that make it trustworthy (the source tag) and useful (export, share, next questions).

**Options:**
- **React-joyride, restyled (chosen).** Placing a note beside an element, scrolling to it, keyboard control and focus handling are already solved. Cost: a new dependency, about 30 KB, and its default look (rounded, shadowed, a pulsing dot) has to be overridden.
- **A hand-built tour.** Full control of the look, but placement near screen edges, scrolling and accessibility would all be rebuilt and maintained here.
- **No tour, Start here only.** Nothing new to load, but nothing meets a visitor who never opens Start here.

**What we chose and why (Tarik, 2026-10-14, with Claude):**
- **Front page plus Ask, in two stages.** Ask's card stage waits for a real answer, so it points at a real source tag, export bar and share link instead of describing them in the empty page.
- **Keep the three stories on Start here** and add "What you can ask" below them.
- **No dimmed page.** The design system is flat, with no shadows or overlays, so the current target gets the same 3px ink outline as keyboard focus.
- **No storage, no tour.** The tour remembers "done" in the browser. Where the browser blocks that (some private windows), the tour doesn't run at all, rather than showing on every visit.

**What we gave up:**
- **A spotlight.** Some people may notice an outline less than a dimmed page.
- **Tours where storage is blocked.**
- **An account-wide "seen".** It's per browser, so a signed-in person on a second device sees it again.
- **A new dependency**, loaded only when a tour is about to run.

**How we'll know if this was right:**
- The browser test shows the front tour on a first visit, never again after SKIP TOUR, and again from TAKE THE TOUR.
- Every Start here question opens Ask filled in, and the unit test fails if one ever leaves the graded set.
- Nobody reports being stuck behind a tour, or a tour pointing at nothing.

**What actually happened:**
