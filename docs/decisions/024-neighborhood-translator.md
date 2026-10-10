# 024: Count City records by neighborhood, naming the boundary

**Decision:** Ask counts City of Milwaukee records (crime, fire and EMS calls) inside a neighborhood using the City's official boundary, and every answer says which definition of the neighborhood it used.

**Why this came up:** Reporters ask about neighborhoods ("robberies in Harambee this year"), but City records carry map coordinates, not neighborhood names. DYCU defines its 27 neighborhoods (DYCU's spreadsheets list 28 names, two of which are the same place) as lists of census tracts (the small areas the Census Bureau counts people in), and the City draws its own 190 boundaries; the two "Harambee"s don't cover exactly the same ground. A wrong or silent choice would give a reporter a number for a different area than they think.

**Options:**
- *Match the data (chosen):* City records use the City's boundary; DYCU numbers use DYCU's tracts. Cost: two answers about "Harambee" can cover slightly different ground, so each card must say which.
- *Always DYCU's tracts:* matches DYCU's reports everywhere. Cost: only 27 neighborhoods can be asked about, and crime points would be tested against tract shapes we'd have to add.
- *Always the City's boundary:* covers all 190 names. Cost: DYCU-based numbers would be re-weighted and stop matching DYCU's own reports.

**How it counts:** the City's database returns the matching records inside the neighborhood's surrounding rectangle (just their coordinates), and the server keeps those inside the exact boundary. Only the count leaves the server. Records with no location are counted separately and said so.

**What we chose and why:** Match the data — Tarik's call, 2026-10-10 — because a reporter citing a number needs it to mean what its source means.

**What we gave up:** One name, two areas. A question so broad that the rectangle holds more than 32,000 records (the City's per-query limit) gets "try a shorter period" instead of a number.

**How we'll know if this was right:** the report card's neighborhood questions pass; no reader reports a neighborhood count that contradicts the City's own figures for that boundary.

**What actually happened:**
