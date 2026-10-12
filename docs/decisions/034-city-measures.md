# 034: Totals and medians from an approved list of City money columns

**Decision:** Ask can total, take the median of, and (when asked) average six hand-checked City money columns: back tax owed (real estate and personal property), City employee pay (gross and hourly), property sale prices, and total assessed value. Groups are hidden when they hold fewer than 5 records in files that name people.

**Why this came up:** "How much" questions (tax owed, what City employees earn, what homes sell for) are some of the most common accountability questions, and Ask could only count records. The money sits in text columns written three different ways, and some number-like columns (ZIPs, years, turnout percentages) must never be added up.

**Options:**
1. **An approved list** (chosen). Each entry names the column, its unit, the splits that make sense, its caveat, and whether the file names people. Cost: a new money question needs a list entry first.
2. **Any number-like column.** Cost: confident cards totaling ZIP codes, years or percentages.
3. **Elections in the same project.** Cost: every election file has different candidate columns; that work moved to the files-by-period project.

**What we chose and why (Tarik, 2026-10-12):** The list, with total and median on every card and the average only on request, because a few very large values pull an average away from what's typical. Groups under 5 records are hidden in files that name people. If that hides exactly one group, the next-smallest hides too, so no one can subtract the visible groups from the total to recover it. The final review found three ways around that, and Claude widened the rule: the hidden groups and a hidden "All other groups" line count as one set, which must be at least two lines with at least 5 records between them, and a card with fewer than 5 records in all hides its total too. The hourly rate never shows a total.

**What we gave up:**
- Only six measures to start.
- No election results yet.
- Some detail is hidden for privacy (single-person job titles).
- The tax files' ZIP is the owner's mailing ZIP, so those files split by aldermanic district instead.

**How we'll know if this was right:** How-much questions get a card instead of "I can't". The totals match the City's own reports when checked. No card exposes one person's figure.

**What actually happened:**
