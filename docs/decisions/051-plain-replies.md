# 051: Ask's replies follow the answer-first shape, lookups fold, and the report card fails a reply that breaks it

**Decision:**
- **The AI's reply.** The card states the answer and carries every figure. The AI adds, in plain sentences:
  - one sentence on what it means for the question;
  - one caveat that matters;
  - optionally, one plain next question.

  That's at most three sentences. It never restates the card or offers to do more, and it names datasets by name, never by code or column name.
- **Lookups fold.** When an answer reaches an analysis card, the catalog searches and dataset sheets opened on the way fold away: search results disappear, and each sheet becomes one "Dataset used" line.
- **The report card** (the graded test of Ask against the real AI) now counts a reply that breaks this shape as a miss.

**Why this came up:**
- **Every reply ran long.** In the graded run on 2026-10-15, every reply ran 6 to 10 sentences against a three-sentence rule. The AI restated the card and offered more work.
- **Tarik's census-tract example read like analyst notes:**
  - 11 dataset links above the answer, some repeated and some unrelated;
  - dataset codes and column names in the prose ("E02", "pov_rate");
  - next steps that asked the reader to do analyst work.

  The AI opened those sheets because its own instructions told it to "find the datasets first, read the column guide" before any tract analysis.

**Options:**
- **Fold the lookups in code and rewrite the rules (chosen).** The fold holds however the AI behaves; the rules shape what it writes.
- **Rewrite the rules only.** Cheaper, but the AI still needs column names, so it would keep opening sheets and the dump would stay.
- **Trim replies in code to three sentences.** Guaranteed short, but it could cut a caveat mid-thought.

**What we chose and why (Tarik, 2026-10-15, with Claude):**
- **The shape** comes from the answer Tarik preferred from a general AI agent: the answer first, then what it means and one limitation. The ZIP health card already leads with code-written answers, so the AI's job is the meaning, not the facts.
- **Two worked example replies** are in the instructions. Neither contains a figure or a place the AI could copy wrongly.
- **The report card now fails a reply that breaks the shape.** This reverses Tarik's 2026-10-10 call that reply length is "tracked, not failed": a warning nobody acted on let every reply drift long.

- **Two real-AI regrades settled the length (2026-10-15).** With the new rules, replies dropped from 6–10 sentences to mostly 5–6, with no codes and no restating of the card. They did not reach three. A second round of wording (an explicit three-part shape) made replies *longer*, so it was reverted. The report card now fails a reply over **six** sentences. On the first regrade's replies, that is 51 of 58 within shape and 44 of 58 passing outright. The prompt still asks for three.

**What we gave up:**
- **Lookup cards are hidden when an analysis follows.** A reader who wants the full search results has to ask a search question.
- **Three sentences.** Replies are a short paragraph, five or six sentences, not the three the rules ask for.
- **The pass rate will drop at first.** A stricter grader means misses for long replies until the rules take hold.
- **Follow-up buttons still carry dataset codes** in the question they fill in, so Ask picks the exact dataset.
- **The census-tract cards' own headlines and field definitions are unchanged.** They're rebuilt with the neighborhood answers (Part 1).

**How we'll know if this was right:**
- In a full regrade, every question that reached the right tool and fields before still does.
- At least 9 in 10 replies pass the new shape.
- No catalog list appears above an analysis card in the live app.

**What actually happened:**
