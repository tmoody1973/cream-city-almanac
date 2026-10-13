# 039: Crime counts read the City's Historical and Current files as one, from 2005; 311's older file isn't joined

**Decision:** When a crime count's period reaches before 2024, the Almanac reads the City's Historical crime file together with its Current one, as a single table in the City's own database, and counts from Jan 1, 2005. The City's 311 files are not joined: counts stay on the 2026 file, with a note saying why.

**Why this came up:** The City publishes crime in two files: "Current" from Jan 1, 2024 and "Historical" before it. Ask only ever read Current, so "robberies in 2019" was refused and "robberies 2022–2024" quietly counted only 2024. Change over time is one of the most common questions about crime. Getting it wrong costs credibility: a count that silently drops years, or one that mixes incomplete years, produces a false trend.

**Options:**
- **One query over both files (chosen).** The City's database reads the two files as one (`UNION ALL`, which it accepts), so totals, breakdowns and maps stay exact. The cost: every count query has to name "the files for this period" instead of one file.
- **Count each file and add in code.** Simple for totals, but medians and "how long" answers can't be added across files, so they'd be wrong or refused across the seam.
- **One file per question.** Smallest, but "2019–2024" would be refused, and comparing years would take two counts.

**What we chose and why (Tarik, 2026-10-12):**
- **Read both files as one,** for crime only.
- **Start at 2005.** The Historical file holds 2 to 140 stray records a year for 1991–2004, then 39,000–75,000 a year. "Crimes in 1995: 6" would be technically true and practically false.
- **Don't join 311.** Its older file holds about 20,000 requests a month in mid-2020, then about 300 a month from December 2020 through 2025, against about 2,900 a month in 2026. Joining it would make a gap in the City's file look like a 90% drop in requests.

**What we gave up:**
- **Crime before 2005,** even the records that exist.
- **311 history** until the City fills its older file.
- **The other split datasets** (stop-and-search quarters, elections, the property file by year) wait for their own projects.

**How we'll know if this was right:**
- A count of robberies by year from 2019 shows every year with a plausible number.
- The 2023/2024 seam shows no jump that isn't in the City's own data.
- A note in the build report flags it if the City ever changes one file's columns.

**What actually happened:**
