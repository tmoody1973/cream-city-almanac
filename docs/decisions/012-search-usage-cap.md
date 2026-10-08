# 012: Cap public search spending with one shared limit

**Decision:** Public meaning-based search can make at most 600 embedding calls an hour across all visitors, in bursts of up to 100. An embedding call is the paid AI request that turns a query into numbers so it can be compared by meaning. Past the cap, search falls back to word matching and says so. The weekly quality check doesn't count against the cap.

**Why this came up:** Search is public, with no sign-in, and every search that uses meaning costs a tiny amount of money. Without a cap, a script hammering the site could run up a bill. The first code review (Phase 1) flagged it as a must-fix before launch.

**Options:**
1. **No cap.** Cost: unbounded spend if someone abuses it.
2. **One shared limit for everyone** (a token bucket: a refilling allowance of calls). Cost: one heavy user can use up the allowance, and everyone gets word-only search until it refills.
3. **A limit per visitor.** Cost: Convex can't see who a visitor is without adding a proxy server in front of it. More moving parts.

**What we chose and why:** Option 2 (Claude, from the review finding). It bounds the worst case to about 600 calls an hour, a few cents. Search never breaks: it degrades to word matching with a plain notice. The Phase 2 code review then made sure the weekly quality check runs outside the cap, so a drained cap can't look like a search regression.

**What we gave up:** Fairness between visitors. The Phase 2 reviewer noted that one script calling about 10 times a minute could keep everyone on word-only search, and that each pause while typing spends a call. A small cache of recent queries' embeddings would cut both. Not built yet.

**How we'll know if this was right:** In normal weeks search never hits the cap, and embedding spend stays under a dollar a month. If reporters ever see the word-only notice, revisit per-visitor limits or the query cache.

**What actually happened:**
