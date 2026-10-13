# 042: Ask compares voter turnout across 12 Milwaukee elections, 2016–2022, from stored ward totals

**Decision:** The Almanac reads turnout (the share of registered voters who cast a ballot) for 12 elections from the City's election files once, stores registered voters and ballots for each ward (a small voting district, 327 across the city until 2022, 354 after), and Ask's `countTurnout` tool compares them: citywide per election, one ward across elections, or one election's lowest or highest wards. Candidate results are not included.

**Why this came up:** "Did turnout change between elections?" was marked "Not yet". The City publishes each election as its own package with one file per race, so no file holds more than one election. Getting it wrong is costly: a turnout trend that silently mixes an incomplete file with complete ones, or compares a spring election with a presidential one, misleads readers on a basic civic question.

**Options:**
- **Turnout only (chosen).** Every election's turnout file carries ward, registered voters and ballots cast, under different column names.
- **Turnout plus headline races.** Each race file has one column per candidate, so every race needs its own mapping; roughly double the work and the most fragile part of Project K.
- **Skip.** The portal's election data stops at 2022; the City now publishes results on the Election Commission's site.

**What we chose and why (Tarik, 2026-10-13, with Claude):**
- **Turnout only, read once and stored:** four of the twelve sources can't be queried live (three Excel workbooks and a printed canvass report saved as a CSV file), and published elections don't change.
- **A hand-kept list of elections:** every election's file differs (column names, layouts, formats), so each names its catalog dataset, its file and how to read it. Each election's ward totals must match the file's own stated citywide totals, or that election isn't stored.
- **Partial files stay visible and labelled:** the City's November 2016 file lists only wards 1–250 of 327, so its citywide figure undercounts; the card says so instead of hiding the election or quietly totalling it.
- **No districts:** the files don't say which aldermanic district a ward belongs to.
- **Rankings skip tiny wards:** "lowest turnout" leaves out wards with fewer than 50 registered voters, so a three-voter ward can't top the list.

**What we gave up:**
- Candidate and referendum results.
- Turnout by aldermanic district.
- Elections after 2022 (not on the open data portal), and the 2018 fall primary (no turnout file).
- Comparing a ward across the 2022 redistricting (the card says the ward numbers name different areas).

**How we'll know if this was right:**
- The checked citywide totals match the City's own: November 2020 (315,483 registered, 247,695 ballots), November 2018 (294,032 and 216,545), April 2021 (325,024 and 48,782).
- All 12 elections are read, or named on the card when they can't be.
- The graded real-AI question passes.

**What actually happened:**
