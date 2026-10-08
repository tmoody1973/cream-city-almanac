# How Production-Ready Is Cream City Almanac?

*A plain-English walkthrough — no jargon left untranslated.*

## The short version

Your app is in good shape where it counts most for a project this age: every change is checked automatically, secrets are out of the code, tests run on a phone and a desktop, and AI tools have clear house rules. The score reads "D" for one reason. If something breaks for a real reader, nothing tells you; you'd find out when someone emails. You told me a day of downtime is an inconvenience today (it's a copy of DYCU's public data, rebuilt weekly), so this is a "fix before Phase 3 brings real accounts" list, not a fire.

**Score: 86/100 (D — release blockers present)**

This is a *repository controls score*: it measures which safety habits have evidence in the code. It doesn't run your app, and it doesn't certify anything as "production ready."

## What's already solid ✅

- **AI tools get a proper welcome guide.** `CLAUDE.md` and `AGENTS.md` tell any AI coding assistant how this project works, so each session starts with the right context instead of guessing. Most projects skip this.
- **Every change is checked before it ships.** GitHub runs the typecheck, the 164 unit tests and a production build on every push and pull request. Branch protection on `main` requires that check for pull requests, and a second job grades search quality against the live site.
- **Testing is real, not decorative.** Unit tests, plus browser tests on an iPhone and a desktop, including accessibility checks. They also run against every Vercel preview before it can merge.

## Looks fine, but only from a text match

- **No passwords or keys in the code (secrets).** The tool saw a hint of this, not proof: it only scans today's files. I went further this session. I ran `git log --all -p` through key patterns across every commit (0 matches), and GitHub's GitGuardian check passed independently on both pull requests. Count this one as confirmed.
- **A speed bump on search (rate limiting).** The tool saw a hint of this, not proof. I confirmed it: `convex/limits.ts` caps meaning-search at 600 calls an hour, and the test "the 101st search in a burst falls back to keywords" proves it on every CI run. Confirmed.
- **Tracking numbers on requests (correlation IDs).** The tool saw a hint, and this one is **not real**. The `requestId` in `ui/components/SearchHome.tsx` stops an old search result from overwriting a newer one. It's a useful guard, but it's not a tracking number that follows a request through your logs.

## Conflicting signals

- The tool credited request-tracking IDs, but there's no logging system for them to be written into. As explained just above, the IDs it found aren't tracking IDs at all. So don't count either as a win: the logging gap below is real.

## What needs attention, ranked by urgency

### Nobody gets told when something breaks

**What we checked:** whether a crash-alert service (error tracking, like Sentry) watches the app.

**What we found:** none is set up. Convex and Vercel keep logs in their dashboards, but nothing alerts you, and logs fade after a while.

**Why it matters:** if a dataset sheet starts failing for every reader on Tuesday, you learn about it when a reporter emails you, or never. In Phase 3, signed-in users and saved chats raise the cost of every hour you don't know.

**The concept, in one paragraph:** error tracking is a smoke alarm for code. When something throws an error in a reader's browser or on the server, the tool records it, with the page, the browser and what led up to it, and messages you. You fix problems before people complain, and you see patterns ("this breaks only on Safari") that a single bug report never shows.

**How urgent is this really?** It's the one release blocker. Do it before you share the link, and certainly before Phase 3 adds accounts.

### Logs are scattered sticky notes

**What we checked:** whether the app writes logs in a consistent, searchable format (structured logging).

**What we found:** three plain `console.warn`/`console.log` lines: two in `convex/search.ts` (when search falls back to keywords) and one in a local script.

**Why it matters:** when search degrades you'd want to answer "how often, since when, for which queries?" Free-text notes make that guesswork.

**The concept, in one paragraph:** structured logging means every log line is a little form with labeled fields (`event`, `query`, `reason`) instead of a sentence. Dashboards can then count, filter and graph them. One caution specific to your stack: the classic Node loggers (pino, winston) don't work inside Convex's default runtime, so the fix is labeled log lines plus your error tracker's logging, not a new logging library.

**How urgent is this really?** Worth doing alongside error tracking. On its own, low pain at today's traffic.

### No "what to do when it breaks" sheet

**What we checked:** whether there's a runbook (a written emergency checklist).

**What we found:** none in the repo.

**Why it matters:** at 2 a.m. (or mid-deadline) you'd be reconstructing which dashboard, which command and which order from memory. With two platforms, that's where mistakes happen.

**The concept, in one paragraph:** a runbook is a "break glass" sheet: how to tell what's broken, how to undo the last deploy, who to tell, and how to confirm it's fixed. Writing it while calm turns an outage from improvisation into a checklist. It's also good portfolio material.

**How urgent is this really?** Before sharing the link. It's an hour of writing.

### Two places to undo, and they don't undo together

**What we checked:** whether the app lives in more than one place that deploys separately, and whether there's a plan that undoes them together (multi-surface deployment, coordinated rollback).

**What we found:** yes. The website is on Vercel and the backend is on Convex. Each production deploy updates both, but Vercel's one-click "Instant Rollback" only puts the *website* back. The Convex code stays on the newer version. Nothing in the repo explains how to roll back both.

**Why it matters:** if a bad change ships, clicking rollback in Vercel can leave an old website talking to a newer backend. Usually that's fine. Sometimes it breaks in a new way, mid-incident.

**The concept, in one paragraph:** when an app is split across platforms, "undo" must cover every piece. Your setup has a built-in safe path: because each production build deploys Convex too, **reverting the bad commit on GitHub and pushing** rolls *both* back together. Vercel's Instant Rollback is the fast path only for website-only problems. You're on Vercel Pro (I read it from your account), so it can target any past deploy. Also note: Instant Rollback reuses the old deploy's settings, so it won't pick up a rotated key.

**How urgent is this really?** Write it into the runbook before sharing the link; the fix is documentation, not code.

### No health check page

**What we checked:** whether there's a tiny page (like `/health`) that says "I'm alive and the database answers" (a health check endpoint).

**What we found:** none.

**Why it matters:** without one, a free uptime monitor can't tell you when the site or the catalog is down; you'd find out from a reader.

**The concept, in one paragraph:** a health check is a page made for robots. It does one cheap real check (here: ask Convex for the catalog status) and answers OK or not-OK. Uptime services ping it every few minutes and text you on failure. It pairs naturally with error tracking: one catches crashes, the other catches "nothing loads at all."

**How urgent is this really?** Nice soon; cheap to add.

### Dev and production share the same keys

**What we checked:** whether practice and real environments use separate logins (environment-specific config).

**What we found:** the scanner found no clear separation in the repo. In fact the databases *are* separate (dev and prod Convex deployments), but at launch you chose to copy the dev AI-Gateway and Firecrawl keys to production, so both share the same keys.

**Why it matters:** a runaway experiment in dev spends from the same AI budget as the live site. And you can't cut off one without the other if a key leaks.

**The concept, in one paragraph:** separate keys per environment are like separate cards for home and business. The spending stays legible, and cancelling one doesn't stop the other. Rotating to new production-only keys is a five-minute job in the Vercel and Firecrawl dashboards.

**How urgent is this really?** Low today (small sums, just you). Do it before Phase 3 or before anyone else gets dev access.

### Rollback and backups aren't written down

**What we checked:** whether the README explains undoing a deploy and restoring data (backups).

**What we found:** neither is documented.

**Why it matters:** less than it sounds, for a reason worth writing down. Your catalog is *rebuildable*: one weekly-build run recreates it from DYCU's Hub (about 25 minutes and about $1 of AI). Today there's no user data that only exists here. That changes in Phase 3, when saved chats and notes become someone's only copy.

**The concept, in one paragraph:** a backup plan answers two questions: how much data could we lose, and how long until we're back? For a rebuildable catalog the answers are "nothing" and "under an hour." Once users create content, you need real snapshots (Convex can export the whole database) and a tested restore.

**How urgent is this really?** Document now (it's short). Real backups become required in Phase 3.

### Dependencies aren't checked for known security holes

**What we checked:** whether CI runs a vulnerability scan on your libraries.

**What we found:** no such step.

**Why it matters:** if a library you use gets a published security hole, nothing flags it. You'd only learn from news.

**The concept, in one paragraph:** a vulnerability scan compares your exact library versions (your lockfile) against a public list of known holes. `npm audit` does this in seconds. Adding it to CI makes the check automatic rather than something to remember.

**How urgent is this really?** Medium; a one-line CI step.

### No automatic library updates

**What we checked:** whether a bot proposes dependency updates (Dependabot/Renovate).

**What we found:** none configured.

**Why it matters:** updates pile up silently. Months later, one big upgrade is far riskier than many small ones.

**The concept, in one paragraph:** Dependabot opens a pull request when an update or security fix is available. Your CI then tests it automatically, so most updates become "glance and merge."

**How urgent is this really?** Low; pairs with the scan above.

### Test coverage isn't measured

**What we checked:** whether the project tracks what share of code its tests exercise.

**What we found:** no coverage setting.

**Why it matters:** you have lots of tests; coverage would show which corners have none.

**The concept, in one paragraph:** coverage is a smoke alarm for untested code, not a grade. A report that highlights untested files tells you where the next test pays off most.

**How urgent is this really?** Low.

---

## Your next-lesson roadmap

1. **Learn how teams find out about bugs before users do:** add error tracking (Sentry) to the website and connect it to alerts. About an hour, including signup.
2. **Learn to write the "break glass" sheet:** a short runbook covering how to tell what's broken, the safe two-platform rollback (revert on GitHub), and the rebuild-from-Hub recovery.
3. **Learn what uptime monitoring is for:** add a `/health` page and point a free uptime monitor at it.
4. **Learn supply-chain hygiene:** add `npm audit` to CI and turn on Dependabot.
5. **Before Phase 3, learn environment separation:** create production-only keys and rotate them in.
6. **When accounts arrive, learn backups for real:** scheduled Convex exports plus one practiced restore.

---

*This audit was generated by a static-analysis tool — it reads your code and config files, it doesn't run your app. Some findings may need a quick human double-check. Full technical findings with file-level evidence and best-practice citations are in the companion report.*
