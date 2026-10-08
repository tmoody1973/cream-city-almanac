# Fix Brief: Cream City Almanac (inventory)

Paste this into Claude Code inside this repo. **This brief is split into phases by severity — do not start Phase 2 until every Phase 1 acceptance criterion is checked off and you've re-run the audit to confirm it. Same gate between every later phase.** This isn't just pacing — a phase can change what a later fix should even look like (e.g. adding CI in Phase 1 changes how you verify a Phase 2 fix), so skipping ahead risks doing Phase 2 work against a moving target.

## Before you start

This repo is **Next.js 16 on Vercel with a Convex backend**. That's what the audit detected (`nextjs-vercel` and `convex`, flagged multi-surface), and it matches `package.json`, `vercel.json` and `convex/`. It's fine to ask Claude Code to explain any step before running it; that's how you learn what it's doing instead of trusting it blindly.

Because this repo deploys to both Vercel and Convex, the rollback fix below accounts for the fact that rolling back one doesn't roll back the other. The logging fix avoids Node-only loggers, which don't run in Convex's default runtime. Platform facts come from adapter notes last verified 2026-08-20.

The audit command used in every gate below:

```bash
python3 /Users/tarikmoody/.claude/plugins/cache/clean-code-toolkit/clean-code-toolkit/3.3.0/skills/prod-readiness-coach/scripts/prod_audit.py --repo .
```

Starting score: **86/100 (D — release blockers present)**.

---

## Phase 1: Release Blockers 🔴

**Acceptance criteria for this phase — all must be true before moving on:**
- [ ] A deliberate test error thrown in the browser *and* one thrown on the server both appear in Sentry within a minute.
- [ ] Sentry sends an alert (email or Slack) for a new issue.
- [ ] The audit (command above, with `--fail-on critical`) exits 0.

**Gate — do not proceed to Phase 2 until:**
1. Every checkbox above is true.
2. You've re-run: `python3 …/prod_audit.py --repo . --fail-on critical` and it exits 0 — **or** every finding still failing at that severity is one whose control genuinely lives outside this repo, and the human has added a waiver for it in `.prod-audit-waivers.json`. If you cannot reach 0 and cannot honestly waive, stop and say so. Do not add a file whose only purpose is to satisfy the scan.
3. Anything on the separate "Manual steps for a human" list tied to this phase (see below) has been done or explicitly deferred with the human's sign-off — an AI agent should not silently skip these and report the phase complete.

## 1. Get told when something breaks 🔴 Fix this first

**In plain English:** nothing alerts you when the site errors for a reader. Add Sentry to the website so crashes in the browser and on the server reach you as alerts, not as a reporter's email.

**What to ask Claude Code to do:**

> Add Sentry error tracking to the Next.js app. **Do not run `npx @sentry/wizard`** (it is interactive and hangs unattended). First fetch current Sentry docs for Next.js 16 via `npx ctx7@latest library "Sentry Next.js"`, then hand-write the files those docs require. Expect `@sentry/nextjs`, a client init (`instrumentation-client.ts`), server and edge inits wired through `instrumentation.ts`, and `next.config.ts` wrapped with `withSentryConfig`. Read the DSN from `NEXT_PUBLIC_SENTRY_DSN`, add it to `.env.example` (blank) and the README environment table, and never hardcode it. Set a low `tracesSampleRate` (0.1). Don't send user input such as search queries as tags. Add a temporary `/sentry-check` route that throws, verify an event arrives, then delete the route. Run `npm run typecheck`, `npm test` and `npm run build`; all must stay green. Convex-side exceptions: Convex offers Sentry exception reporting in its dashboard, which is plan-dependent, so leave that to the human (see manual steps). Do not add `@sentry/node` to Convex functions: none use `"use node"`, and Node-only SDKs don't run in Convex's default runtime.

**What you'll learn from this fix:** how teams hear about bugs before users do. The same three-file Sentry pattern applies to any Next.js app you build.

**How to know it worked:** the Sentry dashboard shows the test error with the page URL and browser, and you got an alert for it.

---

## Phase 2: Before You Share the Link 🟠

**Acceptance criteria for this phase — all must be true before moving on:**
- [ ] `docs/runbooks/incident.md` exists and covers: detecting an outage, the website-only rollback, the both-platforms rollback, rebuilding the catalog, and confirming recovery.
- [ ] README has an "Operations" section linking the runbook, with a two-line rollback summary and a backup note.
- [ ] The two `console.warn` calls in `convex/search.ts` emit labeled (JSON-shaped) log lines without the raw query text.
- [ ] The audit (with `--fail-on high`) exits 0, or each remaining high finding is honestly explained.

**Gate — do not proceed to Phase 3 until:**
1. Every checkbox above is true.
2. You've re-run: `python3 …/prod_audit.py --repo . --fail-on high` and it exits 0 — **or** every finding still failing at that severity is one whose control genuinely lives outside this repo, and the human has added a waiver for it in `.prod-audit-waivers.json`. If you cannot reach 0 and cannot honestly waive, stop and say so. Do not add a file whose only purpose is to satisfy the scan.
3. Anything on the separate "Manual steps for a human" list tied to this phase (see below) has been done or explicitly deferred with the human's sign-off — an AI agent should not silently skip these and report the phase complete.

## 2. Write the "break glass" sheet 🟠 Fix before sharing

**In plain English:** there's no written emergency checklist. Write one while things are calm, so an outage becomes steps to follow, not memory to reconstruct.

**What to ask Claude Code to do:**

> Create `docs/runbooks/incident.md` (new folder, next to the existing `docs/decisions/` and `docs/reviews/`). Sections:
> (1) **How to tell what's broken:** Sentry, the uptime monitor (once added), the Convex dashboard logs for deployment `spotted-tern-278`, the Vercel deployment list, and the CI `report-card` job.
> (2) **Website-only rollback:** `vercel rollback <deployment-url>` or the dashboard's Instant Rollback. Note that the project is on Vercel Pro, so any past deploy can be targeted, and that Instant Rollback keeps the env vars from that deploy's original build.
> (3) **Both-platforms rollback:** `git revert <bad-sha>` then push `main`. Each production build runs `npx convex deploy` (see `scripts/vercel-build.sh`), so this redeploys Convex functions and the site together.
> (4) **Schema compatibility rule:** schema changes must be additive (new optional fields, new tables), like the kept `familyCount`/`reportCount` fields in `convex/schema.ts`, so an older website still works against a newer backend.
> (5) **Catalog recovery:** `npx convex run --prod build:start` rebuilds from DYCU's Hub (about 25 minutes, about $1 of AI). A failed build never replaces the live catalog.
> (6) **Data questions** go to hub@datayoucanuse.org.
> (7) **Confirm recovery:** `/`, `/d/W01` and `/?q=asthma` load; `npx convex run --prod search:catalogStatus` shows `lastRunFailed: false`.
>
> Then add an "Operations" section to `README.md` linking the runbook, summarising both rollback paths in two lines, and stating that the catalog is rebuildable, so backups become required only when Phase 3 adds user data.

**What you'll learn from this fix:** runbooks turn "what do I do?!" into a checklist. You'll also learn why a two-platform app needs a rollback plan covering both.

**How to know it worked:** read the runbook start to finish without opening any other file. Every command is copy-pasteable, and the README links to it.

## 3. Roll back both platforms together 🟠 Fix before sharing

**In plain English:** Vercel's rollback button only undoes the website; your Convex backend stays on the newer code. Item 2's runbook is the fix. This item covers the one-line rule that keeps a partial rollback safe.

**What to ask Claude Code to do:**

> In `CLAUDE.md` (the project's AI guide), add one rule under a "Deploys" heading: "Convex schema changes must be additive (optional fields, new tables); never remove or rename a field in the same release as the code that stops using it. Roll back with `git revert` + push so Convex and Vercel move together; use Vercel Instant Rollback only for website-only problems." Verify that `docs/runbooks/incident.md` sections 2–4 say the same thing.

**What you'll learn from this fix:** when an app spans platforms, compatibility rules matter more than rollback buttons. Additive-only schema changes make either side safe to undo.

**How to know it worked:** the rule is in `CLAUDE.md`, and the runbook's two rollback paths name which one to use when.

## 4. Make logs searchable 🟠 Fix before sharing

**In plain English:** the backend's two warnings are free-text notes. Turn them into labeled lines that dashboards can count. Leave out readers' search text; those are story ideas.

**What to ask Claude Code to do:**

> In `convex/search.ts`, replace `console.warn(\`keyword search failed: …\`)` and `console.warn(\`search degraded to keywords: …\`)` with `console.warn(JSON.stringify({ event: "search.keyword_failed" | "search.degraded", reason: <error message>, queryLength: q.length }))`. Do not log the query text. Do not add pino or winston: they don't run in Convex's default runtime. Keep `scripts/make-fixtures.mjs` as is (a local script). Run `npx vitest run convex/search.test.ts` and `npx tsc --noEmit -p convex`; both green.

**What you'll learn from this fix:** structured logs are what makes "how often did search degrade this week?" a two-click question in the Convex dashboard.

**How to know it worked:** trigger a degraded search on dev (e.g. temporarily unset `AI_GATEWAY_API_KEY` on **dev only**, run one search, then set it back). The Convex dashboard log shows a JSON line with `event: "search.degraded"`.

---

## Phase 3: Hardening 🟡

**Acceptance criteria for this phase — all must be true before moving on:**
- [ ] `GET /api/health` returns 200 with `{ ok: true, asOf, lastRunFailed: false }` on production, and 503 when the catalog check fails.
- [ ] CI runs a dependency vulnerability scan, and it passes or every high finding is triaged in the PR.
- [ ] `.github/dependabot.yml` exists, and the first Dependabot PR (if any) runs CI.
- [ ] `npm run test:coverage` prints a coverage table.
- [ ] Production uses its own AI Gateway and Firecrawl keys (manual step done).
- [ ] The full audit shows no remaining medium findings, or each is explained.

**Gate — do not proceed until:**
1. Every checkbox above is true.
2. You've re-run the full audit (no `--fail-on`) and recorded the new score.
3. Anything on the separate "Manual steps for a human" list tied to this phase (see below) has been done or explicitly deferred with the human's sign-off — an AI agent should not silently skip these and report the phase complete.

## 5. Add a health check page 🟡 Soon

**In plain English:** add a tiny page made for robots that answers "alive, and the catalog responds," so a free uptime monitor can text you when it isn't.

**What to ask Claude Code to do:**

> Create `app/api/health/route.ts` (new; `app/` holds the routes). Export `GET` with `export const dynamic = "force-dynamic"`. Call `fetchQuery(api.search.catalogStatus, {})` from `convex/nextjs` with a 5-second timeout. Return `200 { ok: true, asOf, lastRunFailed }`, or `503 { ok: false }` on error or timeout. No secrets, no catalog data beyond those fields. Add a Playwright test in `e2e/` (import `test` from `./fixtures`) that requests `/api/health` and expects 200 with `ok: true`. Run `npm run e2e` and `npm run build`.

**What you'll learn from this fix:** the difference between "the server is up" and "the app works." A good health check tests one real dependency.

**How to know it worked:** `curl -s https://cream-city-almanac.vercel.app/api/health` prints `{"ok":true,…}`, and your uptime monitor shows green.

## 6. Scan libraries for known holes 🟡 Soon

**In plain English:** add an automatic check that compares your libraries against the public list of known security holes, on every change.

**What to ask Claude Code to do:**

> In `.github/workflows/ci.yml`, job `check`, add a step after `npm ci`: `npm audit --audit-level=high --omit=dev`. If it fails today, list each high advisory and propose the smallest upgrade. Don't use `npm audit fix --force`. Push on a branch, open a PR, and confirm `check` is green.

**What you'll learn from this fix:** supply-chain hygiene. Your code can be perfect and still ship a known hole through a library.

**How to know it worked:** the CI log shows the audit step passing.

## 7. Keep libraries current automatically ⚪ When convenient

**In plain English:** let a bot propose library updates weekly, so your CI tests them instead of updates piling up.

**What to ask Claude Code to do:**

> Create `.github/dependabot.yml` (new): ecosystems `npm` (directory `/`) and `github-actions` (directory `/`), schedule weekly, `open-pull-requests-limit: 5`, and a group combining minor and patch npm updates. Commit via a PR.

**What you'll learn from this fix:** small, frequent updates are safer than rare big ones.

**How to know it worked:** GitHub → Insights → Dependency graph → Dependabot shows the config, and update PRs appear with CI running on them.

## 8. Measure test coverage ⚪ When convenient

**In plain English:** see which parts of the code no test touches, so the next test goes where it helps most.

**What to ask Claude Code to do:**

> Add `@vitest/coverage-v8` (matching the installed `vitest` major) as a dev dependency. In `vitest.config.ts`, add `test.coverage` with `provider: "v8"`, `reporter: ["text", "html"]`, `include: ["convex/**", "ui/**"]` and `exclude: ["convex/_generated/**"]`. Add the script `"test:coverage": "vitest run --coverage"`. Don't add a failing threshold yet. Add `coverage/` to `.gitignore`.

**What you'll learn from this fix:** coverage is a map of blind spots, not a grade.

**How to know it worked:** `npm run test:coverage` prints a per-file table.

## 9. Separate production keys 🟡 Before Phase 3

**In plain English:** dev and production share the same AI and Firecrawl keys (copied at launch). Give production its own, so spending stays visible and a leak in one doesn't expose the other.

**What to ask Claude Code to do:**

> Once the human has created new production-only keys (manual step) and set them on the Convex production deployment, verify without printing values: `npx convex env list --prod | cut -d= -f1` shows both names. Then run `npx convex run --prod search:searchCatalog '{"query":"asthma"}'` and confirm `degraded: false`. Update `docs/runbooks/incident.md` with a "Rotating keys" section: set the new key with `pbpaste | npx convex env set --prod NAME`, verify search, then revoke the old key in its provider dashboard.

**What you'll learn from this fix:** environment separation, and how to rotate a secret without downtime.

**How to know it worked:** prod search works, and the AI Gateway dashboard shows usage under the new production key only.

---

## When you're done

Re-run the full audit (no `--fail-on`) and compare with the starting **86/100 (D)**. The release blocker and the rollback findings should be gone. Note the new score in `docs/LEARNING-LOG.md`, with what you expected and what happened.

## Manual steps for a human (not for the AI agent to execute)

1. **Phase 1. Create a Sentry account and project** (Next.js platform) and copy its DSN. Add `NEXT_PUBLIC_SENTRY_DSN` to Vercel (Production and Preview) and to your local `.env.local`. Set up an alert rule (email or Slack) for new issues. Signup and alert routing are human choices.
2. **Phase 1. Convex exception reporting.** In the Convex dashboard (deployment `spotted-tern-278`), check whether *Integrations → Exception Reporting* is available on your Convex plan. If it is, connect it to the same Sentry project. If it isn't, decide whether backend errors are covered well enough by Convex's logs plus the CI report card.
3. **Phase 2. Decide who hears about outages** (just you, or a newsroom Slack channel) and add it to the runbook.
4. **Phase 3. Sign up for a free uptime monitor** (e.g. Better Stack or UptimeRobot), point it at `/api/health`, and choose where alerts go.
5. **Phase 3. Create production-only keys** in the Vercel AI Gateway and Firecrawl dashboards, set them on Convex production in your own Terminal (`pbpaste | npx convex env set --prod AI_GATEWAY_API_KEY`, likewise for `FIRECRAWL_API_KEY`), then revoke the old shared keys from **production use only**. Dev keeps the originals.
6. **Any time. Enforce branch protection on admins.** Today admins (you) can push straight to `main`. For a stricter process, turn on "Include administrators" in GitHub → Settings → Branches. It's a process choice, not a technical fix.
7. **Phase 3 of the product (sign-in and saved chats). Backups.** When users can create content, decide a backup schedule (Convex snapshot exports, or Convex's backup feature if your plan includes it) and practice one restore. Until then the catalog is rebuildable from DYCU's Hub.
