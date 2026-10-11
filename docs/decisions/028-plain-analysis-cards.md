# 028: Analysis cards lead with a plain sentence that code writes, and open big

**Decision:** Each of Ask's three analysis cards (ranking, change over time, and "do they go together" or mismatch) now opens with one plain-English sentence saying what was found. Code fills that sentence in from the server's verdict and counts; the AI doesn't write it. The cards' jargon is replaced with everyday words, the scatter plot is redrawn to be read, and an EXPAND button opens the plot, map and table in a window that fills most of the screen.

**Why this came up:** Tarik found the analysis cards hard to use. The scatter plot was unreadable, the tract map in the chat was small, and the answers weren't in words anyone could follow. The cards were built to be honest first. They showed every margin of error and named every column by its database name (`pov_rate`). But a reader had to know what "ρ", "clearly fits", "close, not clear" and "unreliable: range too wide" meant before the card told them anything. What was at stake: a card nobody can read protects nobody from a wrong conclusion. The other risk ran the opposite way. Making the words friendlier must not make them overclaim, for example saying poverty *causes* food insecurity, or calling a noise-level difference a finding.

**Options:**
- *A. Code writes the sentence from a template (chosen):* the sentence comes from the same counts and verdict the card already shows, so it can't contradict them, can include the card's figures, and can never say "causes". Cost: it reads a little stiffer than a person would write, and a column whose definition is long falls back to the dataset's name ("Food Insecurity Prevalence (per_insecure)").
- *B. The AI writes it:* sounds more natural. Cost: Ask's AI is not allowed to write numbers (every figure must come from the data), so it couldn't say "3 tracts". It's also the part most likely to drift into overstatement.
- *C. Keep the cards as they were and only explain in a help page:* no change to the cards. Cost: the reader still meets the jargon first, and few people open a help page.

**What we chose and why:** Option A, Tarik's call on 2026-10-11, from three options Claude laid out. The sentence names the place in full ("Milwaukee County"), the year of the data, and the result in words. Examples: "where the percentage of households with income below the poverty line is higher, the Food Insecurity Prevalence (per_insecure) tends to be higher too. The pattern is strong. That doesn't mean one causes the other."; "Once the survey's margin of error is counted, none is a clear match; 2 are possible matches." The other changes follow common charting and plain-language practice:
- *Words:* "clear match" and "possible match" replace "clearly fits" and "close, not clear". "Tied with #10 (within the margin of error)" replaces "within range of #10". "Too uncertain to rank" replaces "unreliable: range too wide".
- *A "How to read this" fold:* it defines a census tract (a small area of usually 1,200 to 8,000 people) and says how each card decided. It is also where Spearman's ρ (a measure from −1 to 1 of how alike the two orders are: 1 the same order, 0 no connection, −1 the opposite) now lives, explained.
- *The plot:*
  - It is drawn at its real size on screen, so its words are the card's text size, not a picture shrunk to fit.
  - Axis titles are in words, and both axes show their low end, high end and cutoff.
  - The corner the question asked about is shaded and labeled "Clear matches land here".
  - Only the highlighted tracts carry margin bars, so 300 overlapping ranges no longer tangle together.
  - In the big view, tapping a dot names its tract and both figures.
- *EXPAND:* uses the browser's own pop-up window (the same kind the phone menu uses), so Escape closes it and keyboard focus returns to the button.
- *Ask's own instructions:* its AI now explains things "as you would explain it to a neighbor". It may not use statistics words like correlation, coefficient or quantile, and must say once what a tract is if it uses the word.

**What we gave up:**
- Template sentences are less natural than a person's and can repeat what a heading says.
- When a column's definition is longer than 80 characters, the sentence uses the dataset's name and the column's code, which is less plain.
- Margin bars are gone from the grey dots. A reader can no longer see at a glance how uncertain every tract is, only the highlighted ones; the faint dots still mark the too-uncertain tracts.
- ρ is no longer on the face of the card; a reader who wants it opens "How to read this".
- On a phone the shaded corner is often too narrow for its label, so only the key explains it.

**How we'll know if this was right:** A reader who isn't a data person can say what a card found after reading only its first sentence (try it on three people with the report card's mismatch question). No card's sentence disagrees with its own table or counts (the unit tests in `tests/ui/tractSummary.test.ts` pin each wording). Readers use EXPAND (watch for it in feedback).

**What actually happened:**
