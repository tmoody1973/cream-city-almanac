# 008: Desktop stays compact instead of scaling up the phone design

**Decision:** On laptops and desktops the page keeps a column up to 1280px wide, with text at the approved comp's sizes, and the SEARCH / ASK / SAVED bar sits at the end of the page instead of pinned to the bottom. Phones are unaffected.

**Why this came up:** The approved design (comp B) was generated as a phone screen. Impeccable's desktop check wants a laptop to look like that comp scaled up proportionally. At 1440px wide, that means a 143px wordmark, 42px body text and 190px rows. On a typical 1440×900 laptop, every rundown row would then start below the fold: the "see what DYCU just updated" moment would need a scroll before you saw any data.

**Options:**
1. **Scale with the screen.** Cost: passes the automated design check, but on a laptop the masthead and search box fill the first screen and no data rows show.
2. **Compact desktop.** Cost: desktop doesn't reproduce the comp's proportions, so the design check scores it 65% (its bar is 65%) and needed a recorded override.

**What we chose and why:** Compact desktop (Tarik's choice: "Desktop doesn't need to match the phone comp's proportions. Keep it compact so the rundown rows show above the fold."). The audience is reporters, mostly on phones, and the product's first job is showing what changed.

**What we gave up:** A desktop that looks exactly like a bigger version of the comp. The design pipeline records the override with Tarik's words as the reason.

**How we'll know if this was right:** On a 1440×900 laptop, rundown rows are visible without scrolling, and nobody testing on desktop calls the page sparse or broken.

**What actually happened:**
