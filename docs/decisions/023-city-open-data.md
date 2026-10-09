# 023: The City of Milwaukee's open data joins the almanac, and Ask counts it live

**Decision:** Add the City of Milwaukee's open-data catalog (all 186 datasets, grouped into about 130 families, each with a code) to the almanac next to DYCU's data, and let Ask count City records live by date range, type and the City's own districts. A number appears only on a card, never in the AI's own words.

**Why this came up:** DYCU's data describes what neighborhoods are like (income, housing, age). The City's data records what happens in them: crimes, crashes, 311 requests (the City's non-emergency service line), permits, property sales. A reporter needs both, and the almanac only had the first. A recent food-insecurity story showed the appetite for answers ("how many, where, since when"), not just pointers to a file. The risk if we got it wrong: a confident number that doesn't match the City's own site, in a tool people will quote.

**Options for counting:**
1. **Ask the City live, through a fixed menu of questions (chosen).** Cost: a count only works while the City's website is up, and we can only offer filters we built.
2. **Copy the rows into our own database every night.** Cost: always available and fast, but big (millions of rows, a bill that grows) and up to a day stale.
3. **Let the AI write the database queries itself.** Cost: very flexible, but it can produce a confident wrong number with nothing to catch it. Ruled out.

**What we chose and why:** Option 1 (Claude recommended, Tarik approved). The menu lets us check every question the AI can ask, and the number comes from the City at the moment of asking, so it can't be stale. Other choices, all Tarik's:
- *Scope:* all 186 datasets, grouped into families, rather than a hand-picked few.
- *Filters:* only time, type, and the data's own districts (police district, aldermanic district). Neighborhoods come next, through a translator between the City's districts and DYCU's neighborhoods.
- *Privacy:* Ask counts and never looks up a named person. Some City files list people's names (property owners, for one); those stay on the sheet, as the City publishes them, with a note saying so.
- *Home page:* one list, not a separate section. City rows get a CITY tag, and daily feeds get a LIVE mark and don't count as "updated" every day.

**What live testing changed:**
- The City's server refuses some query features (`NULLIF`, `substr`), so we compare dates as plain ISO text (like `2026-01-31`) instead.
- The City publishes a "Current" and a "Historical" file for the same data, updated the same day. An early version counted the Historical file, which would have made crime counts "this year" come back zero. Counts now always use the Current file.
- 53 datasets had no City topic group and landed under the catch-all code until we also read topics from the owning department and the title.

**What we gave up:** Counts depend on the City's site being up. When it isn't, Ask says "The City's data didn't respond" and shows no number. There are no neighborhood counts yet. The City's data has quirks we report instead of fixing: a crime record dated 2027, a crash table with no rows. Reporting them keeps our numbers matching the City's own.

**How we'll know if this was right:** The weekly build keeps the City families and profiles current with no failures. The Ask report card's City questions keep passing. No reader reports a count that disagrees with the City's own data.

**What actually happened:**
