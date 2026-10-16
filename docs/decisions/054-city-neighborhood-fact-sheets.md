# 054: Fact sheets for every City neighborhood, built from census tracts

**Decision:** Every City of Milwaukee neighborhood gets a fact sheet. Data You Can Use (DYCU) profiles 27 areas; the other neighborhoods' sheets are built from the Census Bureau's census tract figures (small areas of about 4,000 people), each tract shared out by how much of it lies in the neighborhood. These sheets are tagged CENSUS and labeled approximate.

**Why this came up:**
- After decision 053, the home page leads with "Look up your Milwaukee neighborhood."
- But an address in Bay View, the East Side or most of the City reached a dead end: "Data You Can Use doesn't make a fact sheet for it."
- The headline promised something the site couldn't deliver for most residents.
- If we got this wrong, residents would see confident numbers for their neighborhood that don't match what's on the ground. They would also see two sheets for one place that disagree.

**Options:**
1. **Census tract figures, shared out to neighborhoods (chosen).** Covers every City neighborhood with the same nine figures DYCU's sheets show, using the method Ask's neighborhood answers already use (decision 052). Cost: every number is an estimate built on the assumption that residents are spread evenly within a tract, and it needs one new weekly fetch.
2. **DYCU's own tract-level datasets.** Keeps DYCU as the source. Cost: DYCU publishes only some of the nine figures by tract, so sheets would be shorter and uneven from figure to figure.
3. **A page with no demographics.** Only City facts (alder, ward, polling place). Cost: it doesn't answer "what's my neighborhood like," which is the question the home page now asks.

**What we chose and why (Tarik, 2026-10-16, with Claude):**
- Option 1, because it delivers what the home page promises, with the same figures and the same City comparison as DYCU's sheets.
- **Small neighborhoods.** Places under 1,000 residents get a page without figures, so no address dead-ends.
- **Years.** Only the newest five-year period, to keep the first version small.
- **DYCU first.** When a name exists in both DYCU's list and the City's, DYCU's sheet keeps the address. Its figures are DYCU's own, not built.

**What we gave up:**
- **Exactness.** A tract that's half park and half houses gets shared out as if people lived evenly across it.
- **Years.** No change-over-time on these sheets.
- **Two methods side by side.** Some sheets are DYCU's own; others are built from tracts. The source line and tag say which, but a reader comparing two sheets could miss that.
- **Small places.** Neighborhoods under 1,000 residents get no figures at all.

**How we'll know if this was right:**
- The people in every neighborhood, added up, come within 3% of the Census Bureau's City of Milwaukee total.
- For a DYCU area that's also a City neighborhood, the built poverty rate falls within the range DYCU publishes for it.
- Every City neighborhood name and address in the browser test opens a page.

**What actually happened:**
