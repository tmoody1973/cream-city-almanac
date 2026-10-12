# 036: Neighborhood fact sheets set DYCU's figures beside the City's, from the same Census survey

**Decision:** Each of the 27 neighborhoods Data You Can Use (DYCU) profiles gets a printable fact sheet at `/n/<name>`. It shows 9 headline figures from DYCU's own portrait spreadsheet, each beside the City of Milwaukee's figure from the U.S. Census Bureau's same survey and years, with a verdict ("clearly higher than the city", "clearly lower" or "about the same") worked out by code.

**Why this came up:** Nonprofits writing grants and residents preparing for meetings ask for "a one-page fact sheet for our neighborhood" and "how does our neighborhood compare with the city?" Ask could read one row of DYCU's portrait at a time, but nothing gathered the key figures on one page, and DYCU publishes no whole-city portrait to compare against. A comparison built on mismatched years or loose math would mislead the people most likely to quote it.

**Options:**
- **Sheets for DYCU's 27 areas, with the Census's own city figures (chosen).** Every neighborhood figure is DYCU's; the city figure comes from the same American Community Survey (ACS) table and five-year period. It needs one new outside source, the Census Bureau's data service, and a free key.
- **Sheets for all 190 City neighborhoods.** This would mean adding census tracts together into neighborhood numbers, with rules for tracts that are only partly inside and new margin-of-error math. It is more reach, but a new source of error; decision 035 chose not to blend tracts.
- **Compare against DYCU's other 26 areas only.** It's quick and needs no new source, but "highest of DYCU's areas" doesn't answer "compared with the city."

**What we chose and why (Tarik, 2026-10-12):**
- **Sheets for DYCU's 27 areas, with Census city figures.**
- **The headline list is hand-checked:** poverty, households under $25,000, renters, vacant homes, rent burden, no vehicle, bachelor's degree or more, no high school diploma, and population. Each figure names its exact DYCU rows and Census codes.
- **Margins use the Census Bureau's published formulas.** A margin of error is the range the true value probably sits in, at 90% confidence.
- **The verdict is "clear"** only when the gap is larger than both margins combined.
- **The sheet says the comparison is approximate,** because the neighborhood is part of the city.
- **Population adds DYCU's Male and Female columns,** because DYCU's Total column is blank in its own file for 2022–2024.

**What we gave up:**
- **Unemployment is left off.** DYCU's file gives it a margin larger than the rate itself, so every comparison would read "about the same."
- **City neighborhoods outside DYCU's 27 have no sheet.**
- **The page depends on a Census key and a weekly fetch.** If the fetch fails, the sheet shows the neighborhood alone and says the city figure is unavailable.
- **The comparison is approximate,** not a formal statistical test.

**How we'll know if this was right:**
- The city figures keep matching the Census Bureau's published rates. Milwaukee's poverty rate was 22.8% ± 0.8 for 2020–2024, checked on 2026-10-12.
- People print or share sheets, and no one reports a verdict that misread the numbers.

**What actually happened:**
