# 046: Ask answers ZIP-code questions from the Census survey's ZIP areas, live, beside Milwaukee

**Decision:** When someone asks about a ZIP code, Ask asks the U.S. Census Bureau's American Community Survey for that ZIP's Census area, while the person waits. A ZIP code tabulation area is the Census Bureau's version of a ZIP, built from census blocks. The card shows:
- population and race and ethnicity;
- the fact sheets' 8 measures, such as poverty, renters and households with no car;
- Milwaukee's figure beside each one.

It covers the 37 ZIP areas that touch Milwaukee County.

**Why this came up:** A real question, "what is the demographic makeup of 53228", got a refusal. DYCU's tables are by census tract, neighborhood, aldermanic district and ward, never by ZIP. The refusal was honest but unhelpful, because people think in ZIP codes. 53228 also turned out to be mostly not Milwaukee: by land, it is 89% Greenfield and 10% City of Milwaukee. An answer that ignored that would mislead.

**Options:**
- **The Census survey's ZIP areas, live (chosen).** Real estimates with margins of error, the same survey the fact sheets compare against. But it brings a third source into Ask beside DYCU and the City.
- **Adding up DYCU's tract figures for the tracts inside the ZIP.** It stays DYCU's data, but tracts cross ZIP lines. Splitting them by land area assumes people are spread evenly, which they aren't, and margins of error combine badly when estimates are added.
- **A better refusal only.** No new source, but the question still goes unanswered.

**What we chose and why (Tarik, 2026-10-14, with Claude):**
- **The ZIP areas, with Milwaukee beside each figure,** because a number alone means little.
- **Every ZIP that touches Milwaukee County,** matching what the address lookup covers. Each card says how much of the ZIP is in the City.
- **Live per question, not stored weekly:** no new table and no data step after release, like the City counts.
- **A new CENSUS tag,** so a reader can tell these figures from DYCU's and the City's.

**What we gave up:**
- A single-source story: the Almanac now answers from DYCU, the City and the Census.
- An answer when the Census is down: the card says "try again later".
- People-based shares: "how much of this ZIP is in the City" is by land, not by residents.
- Exactness: a Census ZIP area is close to, but not the same as, the post office's ZIP. Post-office-box ZIPs have no area at all.
- Milwaukee's race figures appear only after the next weekly city refresh (or a manual run).

**How we'll know if this was right:**
- The graded question "What is the demographic makeup of 53228?" reaches the ZIP tool, and the reply leads with "mostly Greenfield".
- On dev, a real 53228 lookup returns a population in the tens of thousands, with race shares that add up to about 100%.
- In the first month, the logs show few or no "Census unavailable" failures.

**What actually happened:**
