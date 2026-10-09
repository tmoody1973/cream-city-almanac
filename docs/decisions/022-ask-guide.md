# 022: A "How to use Ask" page, with examples that must pass the report card

**Decision:** Add a `/ask/guide` page that explains what Ask does, shows how to read an answer with a live annotated sample, and lists example questions for a journalist, a nonprofit and a citizen. Each example opens Ask with the question typed in but not sent, and every example must pass the Ask report card (the script that grades the real AI's answers) before it ships.

**Why this came up:** Ask's empty panel was a bare text box. A newcomer couldn't tell what Ask is good at (exact figures with margins, what a neighborhood report says, caveats, story angles) or what it refuses (guessing numbers, forecasts, opinions), and couldn't tell how to read an answer: the number lives in the card, not the sentence, and figures in the AI's own words get marked "unverified". Start here teaches searching by hand; nothing taught Ask. The risk in fixing it was examples that don't work: a showcase question that gets a bad answer teaches people not to trust the tool.

**Options:**
1. **A new page, linked from Ask.** Cost: one more page to keep current, plus a small change so Ask can open with a question typed in.
2. **Add Ask blocks to Start here.** Cost: a longer Start here, and the guidance isn't reachable from inside Ask.
3. **Examples inside Ask only** (role tabs in the empty panel). Cost: little room to explain how to read answers, and hidden until someone opens Ask.

For showing an answer: a live sample built from Ask's real parts; words only; or a screenshot (which goes stale and freezes numbers into a picture).

**What we chose and why:** Option 1 with the live sample (Tarik, on Claude's recommendations). A page can teach reading an answer properly; the live sample always matches the app because it is the app's own card filled from the same public lookup, and it costs no AI call. Examples open Ask pre-filled rather than sent so nobody spends one of their daily questions by accident (30 a day, 200 for newsroom emails). Sharing one list between the page and the report card means an example can't drift from what's tested: all 12 passed against the real model (39¢) before the page shipped.

**What we gave up:** Upkeep: the examples need re-grading whenever Ask's instructions or tools change. The unverified-mark example uses a made-up figure, labeled as such; a careless reader could still notice a number that isn't real. The sample is one fixed question (Harambee, under 5, poverty), so it shows one kind of answer, not report passages or story angles.

**How we'll know if this was right:** People who open the guide go on to send one of its example questions (visible if we add analytics); the report card keeps passing all examples; nobody reports that an example gave a wrong or empty answer.

**What actually happened:**
