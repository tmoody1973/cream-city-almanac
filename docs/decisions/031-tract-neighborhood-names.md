# 031: City neighborhood names per tract, matched weekly by counting points

**Decision:** Each tract row names the City's official neighborhoods covering it (at least 10% of its area, biggest first) and every DYCU area that includes it. The match is recomputed in the weekly data refresh by counting grid points, with no new library.

**Why this came up:** Tract rows named only one DYCU report area, like "United Community", which isn't a City neighborhood, so readers couldn't place a tract. Eighteen of the 114 tracts DYCU names are in more than one area, and the card showed only the first. If we got this wrong, a card would put a tract in the wrong neighborhood, and a reporter could print it.

**Options:**
1. **Count points weekly.** Lay a grid of points over each tract and count which City neighborhood each lands in. About 40 lines on top of the existing shape helpers, accurate to about ±2%. Costs a few seconds of the weekly build.
2. **Exact overlap with a geometry library.** Exact percentages. Costs a new dependency and handling for the occasional malformed City shape, and the precision doesn't change which name comes first.
3. **Compute once and commit a file.** Simplest at run time. Goes stale without anyone noticing if the City redraws a boundary, and it's a second copy of shapes the build already refreshes.

**What we chose and why:** Option 1 (Tarik, on Claude's recommendation, 2026-10-11). It reuses the weekly refresh and the City shapes it already keeps. A throwaway test on real shapes put tract 1860 at Hillside 51%, Halyard Park 27%, Triangle North 13%. We also chose to drop neighborhoods under 10%: the City's and the Census Bureau's lines don't match exactly, and slivers would list neighborhoods a tract barely touches.

**What we gave up:** Shares are estimates (±2%), not surveyed areas. Tracts outside the City get no City name. Tract ids that aren't on the 2020 census map (a 2019 grocery file, a 2015–16 school file) show "—". Asking Ask "poverty in Bay View's tracts" still doesn't work; that's a later project.

**How we'll know if this was right:** After the first production build, every City tract in the top-10 poverty ranking shows a City neighborhood, the build notes show no "Tract neighborhoods unavailable" line, and nobody reports a tract named for a neighborhood it isn't in.

**What actually happened:**
