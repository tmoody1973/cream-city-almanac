# 040: Property questions read the City's yearly property files from 2005, by file year, citywide and by district

**Decision:** Ask can compare the City's Master Property File across assessment years (the City's yearly property-tax valuation of every parcel), 2005 through today's file (2026). It reads the chosen years' files as one table in the City's own database, labels each year by the City's file name, and answers citywide or for aldermanic districts. Neighborhoods and census tracts are not included.

**Why this came up:** Ask could only read today's property file, so "has the typical home value gone up since 2005?" or "how many owner-occupied homes each year?" had no answer, although the City publishes one property file per year. These are some of the most common accountability questions about housing. Getting it wrong costs credibility: a trend that mixes up years, or that adds the same parcels up once per year, would be false in a way readers can't see.

**Options:**
- **One query over the years (chosen).** The City's database reads the chosen years' files as one table (`UNION ALL`, its way of stacking several tables into one), so counts, totals and medians stay exact. Measured on 2026-10-13: all 21 files from 2005 to 2025 came back in 7.4 seconds. Cost: every year question waits several seconds, and the code has to rename each year's columns to one set.
- **One request per year, added up in code.** Simple, but 21 requests per question; the City blocks bursts of requests, and medians can't be added across requests.
- **Work out yearly figures in advance.** Instant answers, but only the figures chosen ahead of time: no "over $150,000", no other filters.

**What we chose and why (Tarik, 2026-10-13, with Claude):**
- **One query over the years,** reusing the approach crime history took (decision 039).
- **Start at 2005.** Before 2005 the files use two other layouts (the set of column names a file uses), alternating year to year; 1994 doesn't answer, 1981 is missing, 1989 holds 1,750 of about 159,000 parcels, and owner-occupancy is missing in about half the years.
- **Label each year by the City's file name, not the year field inside the file.** That field repeats four years and skips four (the files named 2005 and 2006 both say 2006, though their values differ). By file name the series runs in order and peaks in 2008, when the housing crash began. The card says so in one line.
- **Citywide and by district only.** The 2022–2025 files have no census tract column, and tract numbers changed in 2010 and 2020.
- **Several years are always shown year by year, and the headline figure is the newest year.** Adding counts across years would count each parcel once per year (about 3.4 million "properties" for 2005–2026).

**What we gave up:**
- Neighborhood and tract trends over time.
- Property history before 2005.
- Any column beyond assessed value, aldermanic district, owner-occupied and property class.
- Speed: a full 2005–2026 question takes several seconds.

**How we'll know if this was right:**
- Owner-occupied counts are continuous across the 2021/2022 layout switch (the City counted 93,220 and 93,369).
- The typical home value shows no jump at 2021/2022 beyond the City's 2022 revaluation.
- The graded real-AI question ("How has the typical home value in Milwaukee changed each year since 2005?") passes.

**What actually happened:**
