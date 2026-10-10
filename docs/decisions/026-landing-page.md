# 026: A front page that explains the almanac; search moves to /search

**Decision:** creamcityalmanac.app now opens on a page that says what the almanac is — "A guide to Milwaukee's public data. Find it. Understand it. Check where it came from." — with live numbers and a live sample answer; search moves to /search.

**Why this came up:** New visitors landed on a search box with no explanation of whose data this is, what the site does with it, or why to trust it.

**Options:**
- *Front page at /, search at /search (chosen):* explains first; one more click for people who came to search. Cost: every search address changes; links shared before the move rely on a redirect (the server sending the browser on to another address).
- *Front page for first visits only:* regulars skip it. Cost: two front doors, harder to share and test.
- *Keep search at /, explanation at /about:* smallest change. Cost: visitors still land without context.

**What we chose and why:** Front page at / — Tarik's call, 2026-10-10 — so the first thing anyone sees says what this is. The descriptor avoids words like "portal", "platform" and "AI-powered" that describe how it's built rather than what it does for someone.

**What we gave up:** A click for searchers; the redirect becomes something to keep working. The redirect only fires for the 11 search settings the old home page understood (q, open, ask, prompt, row, place, year, topic, day, month, weekday), so a campaign tag such as `?utm_source=linkedin` (a label a link carries to show where a visitor came from) still lands on the front page. The cost of that choice: a new search setting added later has to be added to the list, or its old links stay on the front page.

**How we'll know if this was right:** first-time visitors go on to search, Start here, or Ask instead of leaving; no reports of broken old links.

**What actually happened:**
