# 030: Buttons under Ask's answers suggest the next question, built by code, and fill the box without sending

**Decision:** Under the newest Ask answer, buttons suggest a next question ("SHOW THE LOWEST", "BY MONTH", "WHAT ARE THE CAVEATS?"), and when Ask can't tell what was meant, a "Pick one:" row offers the options its tool listed. Code builds every button from the answer's own data. A click puts the full question in the box; the person presses send.

**Why this came up:** Ask had two dead ends. When it couldn't tell which column, year or neighborhood was meant, it asked in words and the person retyped a question naming one of the options. After an answer, nothing pointed onward, though each card knew enough to offer the obvious next step. The idea came from CopilotKit's OpenIntelligentUI (an open-source chat app whose answers include buttons and small interactive tools); we took its buttons, not its AI-written charts, which would break the almanac's rule that every number comes from the data.

**Options:**
- *Code builds the buttons (chosen):* each card type has a few rules ("a ranking can show its other end"); choices come straight from the server's own list of valid options. Cost: fixed, plain wording, and only the ideas the rules know.
- *The AI suggests follow-ups after each answer:* more natural. Cost: extra AI spending on every answer; it can suggest questions the data can't answer (a year that doesn't exist); and suggestions change from run to run, so they can't be tested.
- *Code picks, the AI rewords:* friendlier wording. Cost: the extra spending comes back, and rewording can drift from what the data supports.

**What we chose and why:** Tarik chose code-built buttons on 2026-10-11, from options Claude laid out, and made these calls: a click fills the question box and never sends (so nothing comes out of the person's daily question limit by accident, and they can edit first); buttons go under tract cards, City counts, neighborhood-table rows, and dataset and preview cards. Every question names its dataset code and column, so Ask asks for exactly what the button meant, and no question contains a number of its own (only years, cutoffs and dates the person already used).

**What we gave up:**
- Plain, fixed phrasing; the ideas are only the ones the rules know.
- One extra tap: the person presses send.
- No "same row, another year" for neighborhood tables: that answer carries one year and no list of others, so the button couldn't know what to offer.
- "Where did it change?" lets Ask pick the earlier year, so it can meet a "which year?" refusal; that refusal brings its own "Pick one:" buttons.
- Only the newest answer has buttons; scrolling back shows none.

**How we'll know if this was right:** after a "which did you mean?" refusal, people pick a button instead of retyping; no reader reports a button whose question the data couldn't answer.

**What actually happened:**
