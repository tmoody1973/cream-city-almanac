# Handoff: Start here page (2026-10-08)

Resume this in a fresh session. Branch `feat/start-here` (10 commits on `main`, latest `c39b05e`), nothing pushed, working tree clean.

## What this is

A `/start-here` page: three worked examples (a reporter, a nonprofit, a resident) with live excerpts of real data, then DYCU's own guide pages. Families of kind `page` (X01–X03) leave "Updated this season" and open as a "guide page on DYCU's Hub" block. Spec `docs/superpowers/specs/2026-10-08-start-here-design.md`; plan `docs/superpowers/plans/2026-10-08-start-here.md`; decision `docs/decisions/018-start-here.md`. Executed natively (superpowers:executing-plans).

**Ledger (source of truth for progress, rulings and deferred minors):** `.superpowers/sdd/2026-10-08-start-here/progress.md` (git-ignored; it survives on disk). Tasks 1–5 are recorded complete; Task 6's work is committed but not yet recorded, pending a clean test run.

## Done

- Tasks 1–5: guide pages out of the rundown plus the guide block; `catalog.startHere`; comps (Tarik picked laptop B + phone A); the page and its links (laptop masthead START HERE, home band "Start here →", footer); the reporter-search guard and report-card question (now 30 questions).
- Task 6 (design): hero gate forced at 80% and responsive (1440) forced at 80%, both on Tarik's words "Accept it" = the mockup's exact pixel positions are a reference, not a target. Finish review ("fix", 8 items): 7 fixed (StripChart draws at its own width so labels stay readable, which also helps every sheet's live preview; caption, divider, phone heading, phone guides label, excerpt heights; DESIGN.md + `.impeccable/design.json` updated); item 7 (HOW IT WORKS graphite) declined because DESIGN.md says "always ink".
- Final whole-branch code review ("with fixes"): Important 1–3 fixed in `c39b05e` (`canChart` gates the air chart, guide-without-link test, phone guide preview links to Start here and decides on kind). 10 minors deferred, listed in the ledger.

## Still to do, in order

1. **Run the suites when the Mac is calm.** Check `uptime` first; under heavy load (it hit 100–400 today from other apps, plus a reboot) browser tests time out and unit tests hit 5s timeouts — those failures are load, not code. Run `npx vitest run`, then `npm run e2e`. If the dev server is slow (client navigation after edits recompiles routes), test the production build instead: `npx next build && npx next start -p 3100`, then `BASE_URL=http://localhost:3100 npx playwright test --grep-invert @capture`.
2. **Red/green check for the phone guide-preview test** (`e2e/start.spec.ts`, "a guide page's phone preview links out and to Start here"), written after its fix: `git stash push ui/components/FamilyPreview.tsx`, run it on `--project=phone` (must fail), `git stash pop`, run again (must pass). Ledger the result.
3. **Record Task 6 complete** with the executing-plans `task-done` script (BASE `1a02772`, test command `npx vitest run`), then add the "Final: fixed …" verification results to the ledger.
4. **Design reviewer's verdict pass:** recapture first (`npx playwright test e2e/capture.spec.ts -g "Start here at the comp" --project=desktop`), then spawn a fresh reviewer with `/Users/tarikmoody/.claude/skills/impeccable/reference/degraded/finish-reviewer.md` in verdict mode, giving it the 8 findings and what was done (see the ledger's Task 6 lines). Record its disposition word verbatim with `impeccable build-phase finish --disposition <word>`.
5. **Task 7 (needs Tarik):** this branch changes Convex (`rundownRows` filter, `familyPreview`, `startHere`), and Vercel previews read production Convex. Ask him whether to deploy the backend first (`npx convex deploy -y`; the rundown change is visible on the live site immediately), as he chose for Phase 3a. Then push, open the PR, watch `check` and `e2e`, hand him the preview with a checklist, merge on his "merge", verify production, delete the plan workspace.
6. Leave decision 018's "What actually happened" blank for Tarik.

## Rules that held all session

No `Co-Authored-By` trailers; never run `prettier` on whole files; push Convex to dev (`npx convex dev --once`) before e2e after server changes; ask before production deploys, merges or anything outward-facing; the outreach drafts live outside the repo in `/Users/tarikmoody/Projects/dycu/outreach/` (the NPA Slack post is `2026-10-08-news-product-alliance-slack.md`).

## Open follow-ups outside this branch

- V02's own sheet chart caption still says "Each dot is one area" (pre-existing; Start here passes `unit="day"`).
- Deferred minors from Phase 3a (stale `portraitTables` rows, text-cell notes, build pacing, small inconsistencies, number edge cases) were offered as one GitHub issue, not yet filed.
- The 0.2 gibberish cutoff lets some nonsense queries through on older report passages (pre-existing).
