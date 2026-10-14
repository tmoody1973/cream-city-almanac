# 045: "How long has it been open?" is answered as an age to an as-of date, for vacant buildings and open complaints

**Decision:** Ask's "how long" measure gains a second kind of entry, an **age**: how long the cases still open have been open, measured from each case's start date to an as-of date. Two entries use it:
- **vacant buildings,** registered as vacant, measured to today;
- **police and fire complaints** with no close date, measured to the City's last update of that file.

It never answers "how long did it stay open", because the data doesn't say when these cases end.

**Why this came up:** The questions list planned "how long do buildings stay vacant". The City's Vacant Buildings file lists only buildings vacant now, with the date each was registered, and has no end date (decision 044). Getting this wrong means publishing an invented "time vacant", or calling an age a duration. A building registered two years ago and still vacant has been vacant *at least* two years so far. That isn't how long vacancies last.

**Options:**
- **A separate "how long open" tool.** Clean, but a second card and a second choice for the AI between two similar tools, which is where wrong answers come from.
- **An "open only" switch on every existing pair.** Few new lines, but it would offer ages where "open" means something else: 311 requests mostly never get a close date, and an "open" fire call is a cancelled one.
- **Age entries in the existing list (chosen).** Same tool, same card, wording that says "so far" and "as of".

**What we chose and why (Tarik, 2026-10-14, with Claude):**
- **Age entries,** one per file where "open" really means waiting.
- **Vacant buildings are measured to today,** since the City refreshes that file daily.
- **Open complaints are measured to the City's last update of the file,** since it hasn't changed since early 2026 and today would add months the file can't see.
- **311 is left out.** Even January 2026 requests were 65% "open", so "open" there means "never closed in the data", not "still waiting".

**What we gave up:**
- How long buildings stayed vacant, which needs an end date the City doesn't publish.
- The age of open 311 requests.
- Precision to the day: an age runs to the end of the as-of day, so it can read up to a day long.

**Found while building:**
- **A stale date in the catalog.** The catalog's dataset-level "last modified" date for the complaints file read 2019. With it, all 104 open complaints looked "dated after the as-of date" and none were measured. The as-of date now comes from the file's own record, which read March 13, 2026. Why the dataset-level date is stale is still open.
- **The AI read one field literally.** In the first graded run, it read the "dated after the as-of date" count as "dates that run backwards" and repeated the card's numbers. Ask's tool description now says what that count means for an age, and the prompt says not to restate the card's times.

**How we'll know if this was right:**
- On live data, the vacant median (about 1.8 years) agrees with the registration years: about half the buildings were registered in 2025–2026.
- The graded question reaches the vacant age, and the reply doesn't call it a duration.
- No one reads an age card as "how long vacancies last".

**What actually happened:**
