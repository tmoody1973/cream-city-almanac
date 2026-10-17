# 056: Explain the Almanac in a video built from rebuilt scenes and one real recording

**Decision:** The explainer video recreates the site's parts (the fact-sheet row, the Ask card, the source tags) as animated scenes in the site's own fonts and colors, filled with real production numbers, and shows one real screen recording: the address lookup.

**Why this came up:** Tarik wanted a video for YouTube and social media that makes clear what Cream City Almanac is, for residents, journalists and nonprofits, and says Wisconsin DNR open data is coming next. A posted video can't be corrected, so every claim and number in it has to be true on the day it's made.

**Options:**
1. **Rebuilt scenes plus one real recording (chosen).** Crisp at phone size, and it doesn't break when the site's layout changes; the recording proves the product is live. Cost: the rebuilt parts are a likeness of the site, not the site itself.
2. **All screen recordings.** Most literal. Cost: recordings look soft on phones and go out of date with every design change.
3. **All rebuilt, no recording.** Cleanest motion. Cost: nothing on screen proves the product actually works.

**What we chose and why (Tarik, 2026-10-16, with Claude):**
- Option 1. Tarik picked rebuilt scenes and offered ego-browser for the recording.
- The numbers come from production's public endpoints (the same calls /about makes) and carry the date they were read: Riverwest's poverty rate and Harambee's robbery count as of Oct 16, 2026.
- All on-screen text is checked word for word, by a test, against a claims table traced to /about and the one-pager.
- The music is a royalty-free library track (`video/MUSIC.md`) whose license Tarik checks before posting.
- Two calls made during the build:
  - ego-browser could only take screenshots in a loop, at 8.7 frames a second, so the recording was made with Playwright's built-in video recorder instead. Playwright is a browser-automation tool the site already uses for its tests.
  - The red grease-pencil circles in the design became the site's own hand-drawn underline. A drawn loop kept slicing through letters, and the underline is the mark the site already uses for emphasis.

**What we gave up:**
- The video's numbers go stale. The Ask card says "As of" its snapshot date.
- The address recording shows the site as it looked on recording day.
- No narration: the story has to work in on-screen words alone.
- The music isn't timed to the cuts. The track lists no tempo, and our estimate was inconclusive.

**How we'll know if this was right:**
- A muted viewer can say what the Almanac is, that they can type their address, and that every number has a source.
- Views and click-throughs to creamcityalmanac.app from the posts.
- Re-rendering after a site change needs only a new snapshot and recording, not new scenes.

**What actually happened:**
