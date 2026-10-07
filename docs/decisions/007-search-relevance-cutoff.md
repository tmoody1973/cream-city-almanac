# 007: Search only shows results that actually match

**Decision:** Search hides weak matches in two ways. A dataset found by *meaning* must score at least 0.20 on similarity, a 0-to-1 measure of how close two pieces of text are in meaning. And a result must rank in the top 5 of at least one of the three rankings search combines (word matches, dataset cards, report text), or show up in two of them.

**Why this came up:** Meaning-based search (vector search, which finds text that *means* something similar rather than text that shares words) always returns its nearest neighbors, however far away they are. A search for "zzqqxxjj" returned 20 unrelated datasets, so the "nothing matched" message in the design could never appear. The design reviewer also flagged an off-topic tail on real searches: "kids who can't afford food" listed 20 results, the last ones unrelated. If we cut too hard, reporters miss the dataset they need. If we don't cut, they wade through noise and stop trusting the list.

**Options:**
1. **Show everything** (Phase 1 behavior). Cost: nonsense queries return 20 rows, and real queries end in an unrelated tail.
2. **A fixed similarity cutoff only.** Cost: it fixes nonsense queries but leaves the tail on real ones.
3. **A cutoff plus an "agreement" rule** across the three rankings. Cost: a dataset that only one ranking finds, and only at 6th place or lower, disappears.

**What we chose and why:** Option 3 (Claude, from measurements on the live catalog). The cutoff was set from data, not guessed. Nonsense queries topped out at 0.19, and the weakest real reporter question ("eviction") started at 0.23. The 26-question search report card stayed at 24 of 26 after each change, the same two misses as before. "kids who can't afford food" went from 20 results to 10. "asthma" went to 3. Tarik accepted the two arguably off-topic rows that remain for the food search (CDA Homebuyer Counseling Map, Neighborhood Portrait).

**What we gave up:** The margin between nonsense (0.19) and real questions (0.23) is thin. A very vague but real question could lose its meaning-based matches and fall back to word matches only. A rare dataset that only one ranking finds, deep in that list, won't show.

**How we'll know if this was right:** The weekly search report card stays at 80% or better. Reporters testing the live site don't report "I know that dataset exists but search didn't show it."

**What actually happened:**
