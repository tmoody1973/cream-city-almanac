# 048: City employee tenure is measured from the pay file, and a file that names people never sends a small group's times

**Decision:** Ask's "how long" measure gains two entries on the City's employee pay file:
- **time worked so far:** current employees, measured to the day the City last updated the file;
- **time worked before leaving:** people with a termination date.

At the same time, the "how long" tool now enforces a rule on the server: in any file that names people, a group of fewer than 10 gets no median (the middle value: half are above it, half below) and no 9-in-10 time, only its count.

**Why this came up:**
- "How long have City employees worked here?" is a common reporter question. The City's pay file has every employee's start and termination dates. It also has every employee's name.
- The "how long" card already wrote "too few to say" for groups under 10, but only on screen. The exact numbers still went to the AI, into the CSV download and into share links.
- On this file, a group of one person is that person's exact tenure in days. Departments with 1, 2, 3 and 4 employees exist.

**Options:**
- **A separate tenure tool.** Its own card and rules, and another tool for the AI to choose between.
- **Two entries in the existing list, plus a server-side rule (chosen).** Same card. The rule protects every people-file the tool ever reads, not just this one.
- **The entries without a server rule.** Simplest, but a filter to a one-person department would hand out that person's tenure. Rejected.

**What we chose and why (Tarik, 2026-10-14, with Claude):**
- **Both measures.**
- **A threshold of 10,** because it matches what the card already said, so the screen, the download, the share link and the AI all agree. The pay measures keep their own rule (groups under 5).

**What we gave up:**
- **Tenure for small groups:** a department or job title under 10 shows a count only.
- **First-day accuracy:** the City's "Start Date" may be when someone began their current job, not their first day with the City. The card says so.
- **Earlier years and re-hires:** this is one year's file (2025, updated March 2026), and someone rehired counts from their latest start.

**How we'll know if this was right:**
- The graded question "How long have City of Milwaukee employees worked for the City?" reaches the tenure measure.
- On live data, a filter to a two-person department returns a count and no times.
- No CSV or share link from a people-file ever contains a small group's time.

**What actually happened:**
