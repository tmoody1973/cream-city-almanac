# 052: Rank and compare-two answer by the City's neighborhoods, built from census tracts

**Decision:**
- **The unit.** Ask's "which areas have the most…" and "do these two go together" questions now answer in the City's official neighborhoods by default, not in census tracts (small areas the Census Bureau draws, about 4,000 people each, that most readers have never heard of).
- **How a neighborhood figure is built.** Each census tract is split into the neighborhoods it overlaps. Each piece counts in proportion to the residents living in it: the tract's population times the share of the tract's area inside the neighborhood. The neighborhood's figure is the weighted average of its pieces, with a combined margin of error.
- **What stays in tracts.** Only rates (percentages) are built into neighborhoods. Counts, medians (such as median income) and the City's property file stay as tract answers, and the card says why. Anyone can still ask for tracts by saying so, or by pressing "BY CENSUS AREA".

**Why this came up:**
- Readers think in neighborhoods. A tract answer ("55079186000") told people nothing they could use.
- ZIP health (decision 050) already answers health and food questions by ZIP. DYCU's other measures (housing, income, internet, education, jobs) still answered only in tracts.
- If we got it wrong, Ask would show confident neighborhood numbers that don't match what's on the ground.

**Options:**
1. **Build neighborhood figures from tracts, weighted by residents** (chosen). Covers all 190 City neighborhoods and every DYCU rate. Cost: the figures are estimates, and the blend must be labeled.
2. **Use only DYCU's own 27 report areas.** DYCU published those figures itself, so no blending. Cost: only 27 areas, not the 190 neighborhoods people use, and no health or food measures.
3. **Keep tracts and reword them.** No new math. Cost: readers still don't know what a tract is.

**What we chose and why (Tarik, 2026-10-15, with Claude):**
Option 1. It answers in the unit people use, for every rate DYCU publishes. This revisits decision 035 ("never blend tracts"). The blend is labeled as approximate on every card, and the tract answer is one click away.

**What we gave up:**
- **Exactness.** We assume residents are spread evenly within a tract. Household rates are weighted by people, not households.
- **Counts and medians.** These can't be averaged across pieces, so they stay tract answers.
- **Small neighborhoods.** Places with fewer than 1,000 residents are left out and named on the card.
- **The City's property file** stays in tracts.
- **Change over time by neighborhood** isn't in this slice.

**How we'll know if this was right:**
- The City total built from the pieces is within 3% of the Census Bureau's City of Milwaukee population.
- The graded questions "Which neighborhoods have the highest rent burden?" and "Do neighborhoods with more renters have less internet at home?" reach the neighborhood answers.
- Nobody reports a neighborhood figure far from DYCU's own portrait for its 27 areas.

**What actually happened:**
