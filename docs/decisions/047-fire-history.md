# 047: Fire Department calls and response times by year are stored totals from 2015 to now, read from nine yearly files and the newer system's file

**Decision:** A weekly job reads the City's Fire Department files one year at a time and stores, for each year:
- **calls:** all, EMS, and everything else;
- **calls by type:** 2015–2023 only;
- **time to dispatch and time to arrive:** the median (the middle call: half took less time) and the time all but the slowest tenth beat.

Ask's new `fireHistory` tool reads those stored totals.

**Why this came up:**
- Ask's Fire Department answers read only one file, the 2021 one. "How many fire calls were there in 2018?" and "has response time changed since 2015?" couldn't be answered.
- The City publishes 2015–2023 as nine separate yearly files. In 2020 it renamed their columns, and its dates come in three different shapes.
- From 2024 it publishes from a new system (MFD Calls for Service), with different columns and only six broad call types.
- Getting this wrong means a trend line that compares numbers that don't mean the same thing.

**Options:**
- **Live reads across files.** Ask's existing count and "how long" tools would join whichever yearly files a question covers. Any filter or split would work. But it means about 1.4 million rows and four date shapes, and a median across many years would likely pass the City's time limit.
- **A stored yearly summary (chosen).** About 30 queries a week, a few seconds each, and instant answers. Only the stored slices can be asked about.
- **2015–2023 only.** Simpler, with no system change to explain, but nothing after 2023.

**What we chose and why (Tarik, 2026-10-14, with Claude):**
- **All three scopes:** calls per year by type, response times by year, and carrying on into 2024–2026.
- **The stored summary,** because the 2015–2023 files never change: they are read once and kept, and only the newer system's years are re-read each week. This is the same pattern as the stop-and-search counts.

**What we gave up:**
- **Filters beyond year, EMS-versus-other and call type.** "Auto fires in ZIP 53212 in 2017" isn't answerable.
- **Call types after 2023,** because the new system has only broad types.
- **Jan 1 – Feb 19, 2024,** which is in neither file.
- **Seconds in five years' times.** 2015–2017, 2019 and 2020 record times to the minute, so their medians are whole minutes.
- **One live-data run after merge** for Tarik.

**How we'll know if this was right:**
- 2021's stored medians match the live L1 measures from the same file (about 1.6 minutes to dispatch and 5.9 to arrive).
- The graded question "Has the Fire Department's time to arrive changed since 2015?" reaches the tool.
- Weekly builds note no failed years.

**What actually happened:**
