# Learning Log

Dated entries, written by Tarik. Each answers three things: what did we expect, what happened, what do we now believe.

<!-- Suggested first entry (Tarik to write): we expected Firecrawl to pull dataset details from the Google Sheet's links; the links all pointed to other tabs, and the real catalog was a structured feed on DYCU's ArcGIS Hub. See docs/decisions/001. -->

<!-- Suggested entry (Tarik to write), 2026-10-08: we expected adding 1,564 spreadsheet passages to search to only help neighborhood questions; a gibberish search ("zzqqxxjj") started matching them, because passages full of long decimals sit close to everything in meaning-space; adding each topic's plain-English line and rounding the numbers fixed it (0.211 → 0.187, real questions scored higher). See the Task 6 notes in the Phase 3a plan. -->

<!-- Suggested entry (Tarik to write), 2026-10-08: we expected the plan's tests to catch data problems in the spreadsheets; two were found only by looking at screenshots against the mockups: 495 of 1,564 tables had no Census link (the "DP04" kind of table ID has two digits, the pattern wanted four), and household sizes were rounded to whole people. See decision 017. -->

<!-- Suggested entry (Tarik to write), 2026-10-09: we expected the City tests to prove the counting worked; they used a pretend City that accepts any query, so they passed while the real City refused two database functions (NULLIF, a function that skips blank values, and substr, one that cuts out part of a text). A live probe against the real site caught it, not the tests. We now believe: a pretend server only proves our own assumptions; probe the real service before trusting the tests. See decision 023. -->

<!-- Suggested entry (Tarik to write), 2026-10-09: we expected one City dataset per entry. The City publishes a Current file and a Historical file for the same data, updated the same day. An early version broke the tie in favor of the Historical file, whose crime data ends December 31, 2023, so a count for "this year" would have come back zero. Counts now always use the Current file. We now believe: when two sources tie, pick by what the title says, not by order. See decision 023. -->

<!-- Suggested entry (Tarik to write), 2026-10-09: we expected "updated recently" to mean the City changed something; the City stamps every dataset, even static map layers (zoning, parcels), as modified daily, so ten map layers filled "Updated this season" and DYCU's datasets vanished from the home page. The end-to-end home test caught it. We now believe: rank by when something was created, and never trust a metadata date as news. See decision 023. -->

<!-- Suggested entries (for Tarik to write in his own words), 2026-10-10, neighborhood counts. See decision 024.
1. We expected the City's SQL to refuse casts, since it had already refused some functions (NULLIF and one other). What happened: `::float` works inside a numeric guard. What do we now believe?
2. We expected a crime map to be the first neighborhood feature. What happened: a count by boundary came first, because a count is something a reporter can cite and a map is not. What do we now believe?
3. We expected all 28 DYCU neighborhood definitions to parse from one sentence form. What happened: 25 of 28 parsed at first; decimal tracts (3.03), one sentence without the word "neighborhood", and three renamed neighborhoods (Layton Boulevard, Westside, Little Menomonee River) needed fixes; the final count is 27 distinct, because two spreadsheet spellings are one place. What do we now believe?
-->

<!-- Suggested entries (for Tarik to write in his own words), 2026-10-10, the map. See decision 025.
1. We expected a "hide under 5" rule to be enough to keep a crime map safe. What happened: real Harambee counts showed the busiest robbery square held 4, so the rule would have hidden every one. What do we now believe?
2. We expected the City to offset crime points so they don't mark exact homes. What happened: NIBRS publishes exact street addresses and precise coordinates (the "not shown at exact location" note belongs to the retired WIBR Monthly dataset). What do we now believe?
3. We expected a map legend to be a small detail. What happened: the first one wasn't readable, and it took three tries (patterns instead of faint shades, body-size words in full ink, a written summary) before it was. What do we now believe?
4. We expected our map tests (a canvas exists, the summary text is there) to prove the map drew. What happened: MapLibre's helper file was a 404 under Next, so no square or boundary ever drew; every test passed and only a screenshot showed it. What do we now believe?
-->
