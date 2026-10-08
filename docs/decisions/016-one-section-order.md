# 016: One order for the spreadsheet section on every screen

**Decision:** The "What's in each spreadsheet" section reads in the same order on phones and laptops: heading, neighborhood and year pickers, topics, then the table. The laptop mockup put the topic buttons above the heading; the build doesn't.

**Why this came up:** The two approved mockups disagreed. The laptop one drew the 16 topic buttons above the section heading; the phone one put them after the pickers. The design check compares the built laptop page with its mockup region by region, and the order difference alone pulled its score to 63% against a 72% bar. Getting this wrong either breaks keyboard and screen-reader order or leaves the laptop permanently "off-mockup".

**Options:**
1. **One order, the phone's, on both screens.** Cost: the laptop doesn't match its mockup's order, and its design check is accepted below the bar.
2. **The laptop mockup's order on both screens.** Cost: topics come before you've picked a neighborhood or year, and the phone no longer matches its mockup.
3. **Reorder on laptops only, with styling.** Cost: pressing Tab would jump from the pickers back up to the topics (focus order, the order a keyboard moves through a page, would no longer match what you see), an accessibility failure.

**What we chose and why:** Option 1 (Tarik, on Claude's recommendation). You pick a neighborhood and year before a topic, the page reads the same way for every reader and every device, and one component behaves one way.

**What we gave up:** Fidelity to the laptop mockup's layout. Two design checks are on record as accepted below their bars (63% at 1536px and at 1440px), with the reason in Tarik's words.

**How we'll know if this was right:** Laptop readers find the topics without scrolling past them, and nobody reports the topics feeling "buried" under the pickers.

**What actually happened:**
