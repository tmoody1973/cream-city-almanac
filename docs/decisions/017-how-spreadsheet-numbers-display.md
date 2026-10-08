# 017: How the spreadsheet numbers are displayed

**Decision:** The app shows DYCU's estimates and margins of error as stored in DYCU's file, with one display rule: whole numbers get commas; decimals DYCU wrote to three places or fewer are shown exactly as written; longer decimals, which come from calculations, are rounded by size (under 1 to three places, under 10 to two, otherwise to a whole number). A zero margin prints 0. The stored values are never changed.

**Why this came up:** DYCU's files mix typed values (an average household size of 2.904) with calculated ones (a margin of error of 1694.69348260976). The first display rule rounded everything of 1 or more to a whole number, which showed Average Household Size as "2" in 74 tables, a wrong number. The design review then asked to take the decimals from each cell's number format, the display setting stored in the spreadsheet.

**Options:**
1. **Show every stored digit.** Cost: unreadable tables ("±1,694.69348260976") that look more precise than any survey is.
2. **Take decimals from each cell's number format.** Cost: there is nothing to take. All 685 long decimals of 10 or more in the test files use Excel's "General" format, which sets no decimal places; Excel just shows whatever fits the column.
3. **Keep typed decimals as written and round calculated ones by size.** Cost: a calculated value of 10 or more loses its decimals ("Unemployed 60.3407" shows as 60).

**What we chose and why:** Option 3 (Claude recommended; Tarik confirmed 2026-10-08). It never changes a number DYCU typed, keeps small calculated values like household size readable (2.43), and rounds margins of error to whole people, the way reporters quote them.

**What we gave up:** The decimals of calculated values of 10 or more on screen. The coming Ask chat reads the stored tables, which keep every digit, so answers there aren't affected.

**How we'll know if this was right:** A reporter checking a number in the app against DYCU's downloaded file finds it matches what Excel shows at normal column width, or differs only in rounding of a calculated margin.

**What actually happened:**
