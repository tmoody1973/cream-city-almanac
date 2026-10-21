# 058: A 311 counting step that stops partway is undone and rerun on its own

**Decision.** Every saved 311 count remembers its value from before the current step. When Convex stops a step partway, a watchdog (a check scheduled to run later) rolls that step back and reruns it, up to 3 tries.

## Why this came up

The 311 count (decision 057) runs as a chain of steps of 5,000 requests each. On dev, Convex stopped one step after it had saved most of its counts ("Transient error while executing action"). That step never reached its own error handling, so the run sat at "running" and the chain stopped. Resuming the step by hand counted its 5,000 rows twice: 2020 came out 4,941 over the City's own total. The first production run is about 42 steps, and dev saw 1 stop in about 36, so production would likely hit at least one.

## Options

1. **Roll back and rerun automatically.** Each count row keeps its value from before the step. A rerun first puts back whatever the stopped try saved.
   - **Cost:** about two hours of work. The rows take roughly twice the space, since each keeps a copy of its earlier figures. The code is more involved: five small functions where there was one.
2. **No code: recount the whole file from row 0 whenever a step stops.**
   - **Cost:** about 40 minutes per retry for the 2020–2025 file, and someone has to notice the stop. A weekly count that stops leaves the 2026 counts a week old.
3. **Save each step in one transaction** (a single all-or-nothing write).
   - **Cost:** a step makes thousands of count rows, which is more than one Convex write is allowed to hold, so this doesn't fit.

## What we chose and why

**Option 1. Claude recommended it and Tarik approved it ("do your pick") on 2026-10-20.**
- A stop costs one rerun of one step (a few minutes), not a 40-minute recount, and no one has to watch for it.
- The step's totals and its move to the next step are saved together, so a duplicated end can't count twice.
- Each try of a step has a number, and only the newest try may save or end the run. A copy started by hand while another is still running (how the dev double count happened) can't write. Found in review.
- Each step is scheduled together with its watchdog, including the final "finish" step, so a step killed before its first save is still rerun. Found in review.

## What we gave up

- **Stored counts take about twice the room.** Each row keeps its figures from before the last step that touched it.
- **More moving parts:** begin, roll back, end, watchdog and finish, instead of one step function.
- **A stop is noticed after 15 minutes, not right away.** Convex ends any step at 10 minutes, so 15 minutes is the earliest a step can be called stopped.
- **After 3 stops on the same step, the run still fails.** The old counts stay live until the next weekly refresh.

## How we'll know if this was right

- After the dev recount, each year's citywide total equals the City's own count.
- A test that saves part of a step, then lets the watchdog fire, ends with exact counts. With the rollback turned off, it gives 107 instead of 7.
- Production runs finish without anyone resuming a step by hand.

## What actually happened

<!-- Tarik fills this in. -->
