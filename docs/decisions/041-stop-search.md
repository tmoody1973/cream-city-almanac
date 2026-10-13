# 041: Ask counts the people MPD stopped, 2019–2024, from counts the Almanac stores, never people

**Decision:** The Almanac reads every quarterly package of MPD's stop-and-search data (2019 Q1–Q2 through 2024 Q4) once, counts the people in its three person tables (traffic stops, field interviews and no-action encounters), and stores only those counts. Ask's `countStops` tool answers from them: people by race/ethnicity, sex, year or quarter, plus frisk, search and found rates for field interviews.

**Why this came up:** "Who gets stopped by MPD?" is the central public question this data exists to answer. MPD publishes it under its stop-and-frisk settlement as one package per quarter, so no single file holds more than three months, and none of it could be counted in Ask. Getting it wrong is costly: a disparity figure that silently drops quarters, double-counts, or mislabels who was stopped would mislead readers on a question about civil rights.

**Options:**
- **Count every quarter at build time and store the counts (chosen).** The packages from 2022 on exist only as ZIP files (a compressed bundle of files you have to download and unpack), which the City's database can't query, so any answer covering them has to be counted ahead of time. Published quarters don't change, so each one is read once. Cost: only the breakdowns chosen ahead of time can be asked.
- **Query the 2019–2021 tables live** (the approach crime and property history use). Any filter would work, but the answers would stop at the end of 2021, and "over five years" couldn't be answered.
- **Skip it.** Leave stop-and-search as "Not yet".

**What we chose and why (Tarik, 2026-10-13, with Claude):**
- **Build-time counts for all 23 packages,** read once each and refreshed only if the City republishes a package.
- **Counts only:** no person's row, date of birth, ID or narrative text is ever stored.
- **People per stop, not stops:** race and sex live in the person tables, so one person stopped twice counts twice, and the card says so.
- **Race and ethnicity as one group** (Claude's proposal, approved by Tarik with the spec): traffic stops record Hispanic as a race code, while field interviews record it as a separate ethnicity field. Counting race alone would undercount Hispanic people in field interviews and make the stop types incomparable.
- **Rates for field interviews:** the share frisked (patted down for weapons), the share searched, and how often a search found something, each shown only when at least 10 people are behind it.
- **No location:** the person tables don't record where the stop happened.

**What we gave up:**
- Stop locations and maps.
- The officer, dispatch and use-of-force tables.
- Rates per resident (comparing with Milwaukee's population is a separate question).
- Any breakdown beyond race/ethnicity, sex, period, kind and what a search found.

**How we'll know if this was right:**
- 2023 Q4 traffic-stop people match the City's file (15,472).
- Every quarter is either counted or named on the card as unreadable.
- The graded real-AI question passes.

**What actually happened:**
