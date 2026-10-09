# 021: Dark mode follows the device, with a footer switch

**Decision:** The almanac has a dark "night edition" that turns on when the reader's device is set to dark, and a small "Theme: Auto · Light · Dark" switch in the footer lets a reader override that on their browser.

**Why this came up:** Many phones and laptops run in dark mode, especially at night, when a reporter on deadline is most likely to be reading. A bright white page in a dark room is hard on the eyes. The risk was doing it badly: dark modes often fail contrast checks (gray text that disappears), flash white while loading, or leave pieces behind (a white sign-in window on a dark page). Here one chart also meant something specific by "darker": in the daily air-quality chart, darker marks meant higher readings, which flips on a dark page.

**Options:**
1. **Follow the device, plus a footer switch.** Cost: about forty more lines than option 2, a tiny script that runs before the page draws, and one more thing in the footer.
2. **Follow the device only.** Cost: a reader with a dark phone who prefers reading tables on white can't get them.
3. **A sun/moon toggle in the masthead.** Cost: masthead room that already holds the section links and the account pair, and an icon in a masthead that is all type.

**What we chose and why:** Option 1 (Tarik, on Claude's recommendation). Respecting the device setting is what readers expect; the switch covers readers whose preference differs by task. The palette is the same five color names with night values, each checked against WCAG AA (the accessibility standard for contrast): ink 15.4:1 on the page, secondary text 7.2:1, the red teaching notes 6.6:1. The automated accessibility checker (axe) now runs on every page in both themes. The air chart's caption now says "a stronger mark means a higher reading", which is true in both themes.

**What we gave up:** A choice is remembered per browser, not per account, so a reader who switches devices picks again. On phones, the browser's top bar follows the device setting, not the footer switch. The red hand-drawn marks are images and stay the same red in both themes; on the dark band they clear the graphics contrast bar (3:1) only narrowly (3.1:1).

**How we'll know if this was right:** The dark-mode accessibility checks stay green in CI; no reader reports text they can't read at night; after a month, the number of readers who override their device setting (visible if we add analytics) is small, which would mean the automatic choice is the right default.

**What actually happened:**
