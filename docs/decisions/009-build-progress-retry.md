# 009: The weekly catalog rebuild retries when its progress writes collide

**Decision:** When an item in the weekly rebuild finishes and its update to the shared progress record collides with other items' updates, it waits a random moment and tries again, up to 5 times. Any other kind of error still fails at once.

**Why this came up:** Each of the 226 items in a rebuild (46 dataset families and 180 report PDFs) ticks a counter on one shared "build" record when it finishes. Convex runs each update as a transaction (an all-or-nothing change) and retries on its own when two collide. During Phase 2 testing, those built-in retries ran out: once for 1 item, then for 6 items in the next run. Those items never reported back, so the rebuild never finished. The catalog data itself was already updated, but the site would have shown "last refresh failed" with no dataset counts until a 2-hour safety timer gave up. With the rebuild running weekly, that would have happened most weeks.

**Options:**
1. **Retry the collided update** a few more times with a random pause. Cost: a small amount of code; a very unlucky item could still fail after 5 tries.
2. **Restructure so items don't share one record** (each item writes its own row and a final step counts them). Cost: a bigger change to the Phase 1 pipeline, with more to test and more ways to break.
3. **Rely on the 2-hour safety timer.** Cost: false "refresh failed" banners most weeks.

**What we chose and why:** Option 1 (Claude). It is the smallest fix that targets the actual failure. The next rebuild after the fix finished 226 of 226 items, with 0 failures and $0 spent (unchanged items are skipped).

**What we gave up:** The shared-record design stays. If the catalog grows a lot, collisions get more likely and option 2 may be needed.

**How we'll know if this was right:** Weekly rebuilds keep finishing with every item counted, and the site never shows "last refresh failed" after a normal week.

**What actually happened:**
