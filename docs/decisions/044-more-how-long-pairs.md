# 044: The Fire Department's dispatch and on-scene times join "how long"; the rest of the planned pairs are re-scoped

**Decision:** Ask's "how long" measure gains two pairs on the Fire Department's current calls file: time to dispatch (call started → first unit dispatched) and time on scene (first unit arrived → call closed). The other three pairs planned for this project don't hold up in the data. They are replaced by three follow-up projects (L2–L4) instead of being built as planned.

**Why this came up:** The questions list planned "more how long pairs": how long a building stays vacant, liquor license terms, and DPW work orders. Each was assumed to be one line in the list of measurable date pairs. Checking the City's data showed otherwise. Measuring the wrong pair of dates would give a confident-looking number that answers a different question than the one asked.

**What the check found (2026-10-14):**
- **Only 7 City datasets have two or more date columns.**
- **Vacant buildings** have only the date a building was registered vacant. The file lists buildings vacant now, so "how long did it stay vacant" can't be measured.
- **Liquor licenses** have start and expiry dates, but a license runs about a year by rule. The "term" would measure the rule, not anything that varies.
- **There is no DPW work-order file** on the portal.
- **The Fire Department's current calls file** (350,530 calls, February 2024 to September 2026) has clean dispatch and close times, but Ask measured only time to arrive. 96% of calls have a dispatch time; all but 6 have a close time.
- **Whole-file medians on that file take 9.5–10.5 seconds** on the City's server, past the 10-second limit Ask gave every City query. Time to dispatch failed outright, and the existing time to arrive was on the edge. "How long" queries now get 25 seconds.

**Options:**
- **Build the original three anyway.** That means inventing an end date for vacant buildings and publishing a liquor "term" that is always about a year. Misleading.
- **Add only what the data supports now (chosen for L1).** Two new lines on the Fire Department file.
- **Re-scope the rest (chosen):**
  - **L2:** how long today's vacant buildings have been vacant, a new "still open" measure;
  - **L3:** fire incidents across their yearly files, 2015–2023;
  - **L4:** City employee tenure from hire and termination dates.

**What we chose and why (Tarik, 2026-10-14, with Claude):** L1 now, because it is two list lines on a file whose dates are already proven by the existing time-to-arrive measure. Tarik picked all three follow-ups. Each gets its own design: L2 changes what the tool measures, L3 is a "files split by period" project like K1–K4, and L4 reads a file that names people.

**What we gave up:**
- No answer yet to "how long do buildings stay vacant". L2 answers a different question, how long the current ones have been vacant, and must say so.
- Time on scene ends when the call's record is closed, which can be after the last unit leaves. The card says so.

**How we'll know if this was right:**
- On the live file, median dispatch time is under a couple of minutes and median time on scene is plausible (tens of minutes).
- Ask picks the right measure for "how fast does the Fire Department dispatch" and "how long are firefighters on scene".

**What actually happened:**
