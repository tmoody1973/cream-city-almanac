# 033: How long things take, from chosen date pairs, measured live

**Decision:** Ask answers "how long" questions with a new tool that measures the time between two dates in seven hand-checked City pairs (complaints, 311, permits, fire response), live on the City's server, showing the median and the 9-in-10 per group.

**Why this came up:** A reporter asked how long complaints take to close and whether it varies by department. Ask found the right file but could only count records. Time to close, to issue or to arrive is a common accountability story, and the City publishes the dates.

**Options:**
1. **Chosen pairs, measured live** (chosen). A short list says which two dates in which file make a real span, in days or minutes, with its own caveat. Cost: a file is only measurable once someone adds it to the list.
2. **Any two date columns.** Cost: the AI could pair dates that don't mean a span (a license's start and expiry), and each file's quirks go unchecked.
3. **Work it out weekly and store it.** Cost: no custom periods or filters, and a week stale.

**What we chose and why (Tarik, 2026-10-12):** Chosen pairs, a median and a 9-in-10 rather than an average (a few years-long cases drag an average), split by one category or by year, measured live like City counts. A spike first proved the City's server could do it, and found its limits: it refuses some functions (FILTER, trim, extract), and its firewall refuses some query text, so the query is written around both.

**What we gave up:**
- Open cases aren't measured, so the slowest are missing and recent years look faster (the card says so).
- Unreadable or impossible dates are left out and counted, never guessed.
- Only seven pairs to start.
- The biggest file (Fire Department calls, 350,000 rows) may need a shorter period to answer in time.

**How we'll know if this was right:** Reporters' how-long questions get a card instead of "I can't". The complaints numbers match what the City reports when checked. No one finds a span that compares the wrong two dates.

**What actually happened:**
