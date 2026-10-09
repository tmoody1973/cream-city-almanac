# 020: Ask writes its own story angles, and definitions aren't figures

**Decision:** Asked for story ideas, Ask suggests up to three angles of its own, as questions that name the datasets they draw on and respect those datasets' caveats, labeled as suggestions to check. The prose number check now lets definitions through: age bands ("ages 20 to 64", "18 and older"), survey periods ("5-year"), and table numbers ("Table 11").

**Why this came up:** Reporters are Ask's first audience, and a dataset is only useful to them once it suggests a story. Each sheet already carries two or three AI-written story angles, but they look at one dataset at a time; the best stories often join two (old housing and asthma). Once Ask started explaining caveats in order to write angles, it began quoting definitions from the data cards, and the number check marked about a third of correct answers "unverified", which would teach readers to ignore the mark.

**Options:**
1. **Point to the sheets' existing angles only.** Cost: no cross-dataset ideas; only what the weekly build already wrote.
2. **Let Ask write angles too.** Cost: new, unreviewed AI writing in the chat that can suggest comparisons the data can't support.
3. **Both, sheet angles first.** Cost: the most to build and test.

For the number check: allow the definitional patterns; keep it strict and accept frequent marks; or ask the model to quote definitions.

**What we chose and why:** Option 2 and allowing the patterns (Tarik; Claude recommended option 1 for angles and allowing the patterns for the check). Grounding comes from the tool: Ask reads each dataset's caveats before suggesting, and the instructions make it name its datasets and say what can't be compared. In the first test the angles used the caveats correctly (different release years, modeled estimates, unknown sensor locations) and contained no figures. Definitions describe who or what a figure covers; they are not figures.

**What we gave up:** Angles nobody reviewed before a reporter reads them; a slightly looser number check (a figure phrased exactly like an age band would pass).

**How we'll know if this was right:** On the report card, angle questions keep passing with zero unverified numbers; reporters who use Ask's angles cite the datasets it named; no one reports an angle that rested on a comparison the caveats ruled out.

**What actually happened:**
