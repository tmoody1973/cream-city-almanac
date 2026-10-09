# Learning Log

Dated entries, written by Tarik. Each answers three things: what did we expect, what happened, what do we now believe.

<!-- Suggested first entry (Tarik to write): we expected Firecrawl to pull dataset details from the Google Sheet's links; the links all pointed to other tabs, and the real catalog was a structured feed on DYCU's ArcGIS Hub. See docs/decisions/001. -->

<!-- Suggested entry (Tarik to write), 2026-10-08: we expected adding 1,564 spreadsheet passages to search to only help neighborhood questions; a gibberish search ("zzqqxxjj") started matching them, because passages full of long decimals sit close to everything in meaning-space; adding each topic's plain-English line and rounding the numbers fixed it (0.211 → 0.187, real questions scored higher). See the Task 6 notes in the Phase 3a plan. -->

<!-- Suggested entry (Tarik to write), 2026-10-08: we expected the plan's tests to catch data problems in the spreadsheets; two were found only by looking at screenshots against the mockups: 495 of 1,564 tables had no Census link (the "DP04" kind of table ID has two digits, the pattern wanted four), and household sizes were rounded to whole people. See decision 017. -->

<!-- Suggested entry (Tarik to write), 2026-10-09: we expected the City tests to prove the counting worked; they used a pretend City that accepts any query, so they passed while the real City refused two database functions (NULLIF, substr). A live probe against the real site caught it, not the tests. We now believe: a pretend server only proves our own assumptions; probe the real service before trusting the tests. See decision 023. -->

<!-- Suggested entry (Tarik to write), 2026-10-09: we expected one City dataset per entry; the City publishes "Current" and "Historical" files of the same data, updated the same day, and a tie on date made counts read the Historical file (crime "this year" would have counted 2023 data). We now believe: when two sources tie, pick by what the title says, not by order. See decision 023. -->

<!-- Suggested entry (Tarik to write), 2026-10-09: we expected "updated recently" to mean the City changed something; the City stamps every dataset, even static map layers (zoning, parcels), as modified daily, so ten map layers filled "Updated this season" and DYCU's datasets vanished from the home page. The end-to-end home test caught it. We now believe: rank by when something was created, and never trust a metadata date as news. See decision 023. -->
