# 015: Show the neighborhood spreadsheets as DYCU's own numbers, read every week

**Decision:** The weekly build opens all 99 Neighborhood Portrait spreadsheets, tidies their tables, and the N03 sheet shows any neighborhood's tables with DYCU's Estimate and margin of error exactly as published. The percentage column, which shows formula errors in most files, is left out and labeled; the app doesn't compute replacement percentages. No AI touches these numbers or their explanations.

**Why this came up:** N03 listed 99 spreadsheets but said nothing about what was in them, so a reporter had to download a file blind. Opening a sample showed two file layouts (2021 vs 2022–2024), renamed tabs, and 577 formula-error cells in each newer file, all in the % column. A careless reading would show reporters wrong or broken numbers.

**Options:**
1. **Read the files in the weekly build and store tidy tables.** Cost: the most code up front (two layouts, renamed tabs), a few more minutes per weekly run.
2. **Read the chosen file in the reader's browser.** Cost: nothing stored, so search and the coming Ask chat can't use it; slower on phones.
3. **Convert the files once by hand into data saved with the code.** Cost: goes stale when DYCU updates a file.

For the broken percentages: show only DYCU's Estimate and margin of error; compute percentages from DYCU's own numbers and label them; or show the error cells as they are.

**What we chose and why:** Option 1, and Estimate + margin only (Tarik, on Claude's recommendations). Option 1 is the only one that also feeds search and Ask, and it fits the weekly job already trusted to refresh the catalog. Showing only what DYCU published keeps the product rule intact: numbers come from the data, never from the app or the AI.

**What we gave up:** Percentages, often what a reporter wants first, aren't shown for most files; a reporter has to divide by the total themselves. And the weekly build gains a parser that must keep up with any new layout DYCU uses.

**How we'll know if this was right:** The parser reads all 99 files with every unrecognized layout flagged rather than guessed; reporters can find a neighborhood's number in the app without downloading the file; and nobody reports a number in the app that differs from DYCU's spreadsheet.

**What actually happened:**
