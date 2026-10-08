# Phase 2 build: every ruling and deferred finding

Generated from the build ledger on 2026-10-07. A **ruling** is a decision made during the build where the plan was wrong, silent, or in conflict. Each one names what it costs if it turns out wrong. **Deferred minors** are code-review findings judged not to block launch. They're listed for Tarik to decide on, not fixed.

## Rulings (45)

- Task 3: Ruling: brief Expected "15 tests" is a miscount of its own test code (4+4+5+1=14) — all 14 brief tests written verbatim and passing — cost if wrong: none (no test dropped)
- Task 4: Ruling: removed "baseUrl" from tsconfig — TypeScript 6 errors on it (TS5101) and fails `next build`; "paths" resolves relative to tsconfig without it — cost if wrong: none (typecheck + build green)
- Task 4: Ruling: kept Next's tsconfig rewrites (jsx react-jsx, esModuleInterop, .next/dev/types include) per plan Step 4 — cost if wrong: none
- Task 4: Ruling: smoke test was not red-first (shell page written in Step 2 before the test, as the plan orders) — config/scaffold exception; Task 5's test is the real RED — cost if wrong: smoke test proves less than it looks
- Task 4: Ruling: left esbuild/fsevents install scripts unapproved (npm's new allowScripts default) — both worked before; approving runs third-party scripts — cost if wrong: a later tool needing them fails loudly
- Task 4: Ruling: added *.tsbuildinfo to .gitignore (incremental build cache) — cost if wrong: none
- Task 1: Ruling: fixed the Phase 1 build stall in scope (commit 19cefb3) instead of deferring — second verification rebuild had 6 OCC failures (not rare), so the weekly cron would stall most weeks and the new catalog line would show "last refresh failed" with no counts; Task 1 Step 6 and Task 5's catalog-line test both need a completed build. Fix: retryOnConflict (5 attempts, jittered) around both markDone calls; other errors fail at once. Tests: tests/lib/retry.test.ts RED→GREEN, suite 154/154 — cost if wrong: a build item could still exhaust 5 jittered retries (watchdog still fails it after 2h)
- Task 5: Ruling: e2e row locator used filter({has}) which searches descendants, but data-code is on the <li> itself → 0 matches; changed to page.locator("li[data-code]") — cost if wrong: none
- Task 5: Ruling: codes/headings/labels use Saira Extra Condensed 700 (font-match rank on code-v02; top pick Road Rage rejected after opening the proof — distressed texture absent from the comp; Saira ranked above Bebas and has lining figures). Karantina 700 rendered codes with old-style digits ("Vo2"), hurting code legibility — cost if wrong: one font swap
- Task 5: Ruling: wordmark stays Karantina 400 (font-match rank 1, distance 0.53 vs League Gothic 0.71); its gate veto was a 6px ink offset, fixed with margin-left -0.06em — cost if wrong: none
- Task 5: Ruling: tab bar + credit in a sticky bottom dock (comp first viewport shows them with 5 rows; rundown has 10) — cost if wrong: ~100px of phone height taken by the dock
- Task 5: Ruling: active-tab bar drawn with ::after, not the plan's inset box-shadow (direction contract: no shadows) — cost if wrong: none
- Task 5: Ruling: browser surfaces themed (::selection ink/paper, input caret ink, underline offset) per craft floor — cost if wrong: none
- Task 5: Ruling: public/plates/pencil-mark.png is the approved plate trimmed to its ink (790x364 from 1024 square; source + sidecar unchanged in assets/plates) so it can be placed by em around the date — cost if wrong: re-trim
- Task 5: Ruling: capture spec waits for networkidle + all images complete (marks render after hydration, then load the plate; first capture missed it) — cost if wrong: none
- Task 5: Ruling: next.config devIndicators:false so the dev badge stays out of design captures — cost if wrong: none
- Task 5: Ruling: live name "Individuals with Bachelors Degree or Higher" shown instead of comp's "Bachelor's Degree or Higher" (plan ruling 1); wraps to 3 lines on desktop — cost if wrong: none
- Task 6: Ruling: added MIN_VECTOR_SCORE 0.20 relevance floor in runSearch (Phase 1 code) — vector search always returns nearest neighbours, so the spec §7 "no results" state could never occur ("zzqqxxjj" returned 20 unrelated datasets). Calibrated with new diagnostic evals:vectorScores on dev: nonsense max 0.187, real questions min 0.231. Test "returns nothing when no dataset is close in meaning or words" RED→GREEN; report card still 24/26 (same two Phase 1 misses) — cost if wrong: thin margin (0.187 vs 0.20); a very vague real query could lose its vector matches and fall back to keyword hits only
- Task 6: Ruling: results state follows comp C — catalog line and suggestion tags hidden while searching, compact result rows, bold name on the open row, "RUNDOWN · N results" with the count in body type — cost if wrong: catalog/stale banner not visible mid-search (home still shows it)
- Task 6: Ruling: comp C's red arrow + underline on the open row not built — direction contract allows red only for circle (updated), tick (opened), number (saved) — cost if wrong: open row slightly less marked (bold name carries it)
- Task 6: Ruling: results years column wraps (N02's 4 years overflowed the content edge at 1024 and would scroll sideways on phones) — cost if wrong: none
- Task 6: Ruling: added permanent capture "results state at the comp's size" → .impeccable/review/results-repro.png for comp C comparison — cost if wrong: none
- Task 7: Ruling: sheet page pins the download bar (spec §7 "sticky on phones") and leaves tab bar + credit in flow at the end — two stacked sticky bars would take ~160px of an 844px phone — cost if wrong: tab bar not reachable mid-sheet (← Rundown link at top)
- Task 7: Ruling: sheet.module.css adapted to Task 5 conventions (Saira caps via --font-caps; page inset with padding-inline gutter, sections 0 side padding) — cost if wrong: none
- Task 7: Ruling: fixed live chart showing only 1 of 3 years — W01's 2021/2022 layers return "Per_Asthma" for an outFields=per_asthma query; added fieldValue (case-insensitive) in ui/lib/preview, unit test RED→GREEN, plus e2e "the live chart plots every year…" — cost if wrong: none
- Task 7: Ruling: glossary field names get <wbr> after underscores (phone broke "Low_Confide/nce_Limit" mid-word) — cost if wrong: none
- Task 8: Ruling: sticky dock (tabs + credit) becomes static on wide landscape screens (min-width 1100px, landscape) — at 1440x900 it covered ~186px and left one rundown row visible; phones and the portrait comp size keep it pinned — cost if wrong: desktop users scroll to reach SEARCH/ASK/SAVED
- Task 8: Ruling: page column widened to min(1280px, 100%) (plan's prescribed responsive fix) — desktop score 62% → 65% — cost if wrong: more empty width per row on desktop
- Task 8: Ruling: responsive gate FORCED with Tarik's decision — he chose 'Compact desktop' and confirmed the sentence "Desktop doesn't need to match the phone comp's proportions. Keep it compact so the rundown rows show above the fold." Tool refused 3 reasons (no user quote / wording), accepted the 4th ('The user confirmed the comp is downgraded for desktop widths' + his quote). Desktop 65% (drift) — cost if wrong: desktop deviates from the comp's proportions by design
- Task 9: Ruling: keyboard test presses Tab once, not twice — the SLUG input is the first focusable element (plan anticipated adjusting the count) — cost if wrong: none. axe (wcag2a/aa, 21aa, 22aa) found no serious/critical issues on /, /?q=asthma, /d/W01, /d/N02 at either size, so no component fixes were needed
- fix 1 wordmark: Ruling: KEPT Karantina — measured League Gothic 47% contradicted, Anton 36% contradicted vs Karantina 55% drift on the wordmark region (hero comp-diff); Karantina is also font-match rank 1 — cost if wrong: wordmark stays at drift
- fix 2 pencil plates: Tarik approved ~$1 generation; generated pencil-arrow/underline/tick (gpt-image-2.5-flare), trimmed copies in public/plates with embedded provenance; arrow+swash on the open row (comp C), raster tick replaces vector tick — Ruling: red vocabulary extended to comp C's open-row arrow+underline (approved comp) — cost if wrong: more red than the contract's 3 marks
- fix 6 Ruling: relevantRanks (fused score ≥ 1/65: top-5 in one ranking or present in two), skipped in degraded keyword-only mode — unit test RED→GREEN; report card 24/26 unchanged; "kids who can't afford food" 20→10, "asthma" →3 — cost if wrong: a dataset found only at rank 6+ in a single ranking is hidden
- fix 1 Ruling: wordmark → Saira Extra Condensed 900 (-0.02em). Rendered comp vs Karantina/Bebas/Oswald 600+700/Antonio/Saira 900/Fjalla: Saira 900 closest in weight and rounded C/O/R; region score 53% drift vs Karantina 55% drift (tie) → character decides; Karantina removed — cost if wrong: wordmark ~15% wider than comp
- fix 6 Ruling: no further search change — N02's matching snippet is about poverty thresholds (relevant to "can't afford"); A02 is in two rankings; tuning further risks recall (report card is the guardrail) — cost if wrong: one weak row in that query
- Task 10: Ruling (TARIK, 2026-10-07, asked how to close the design review, chose "Fix wordmark, accept rest": "the explainer stays one complete sentence (not one line), and the food search's extra rows (CDA Homebuyer, Neighborhood Portrait) are accepted as is"). Declined the ~$0.90 AI one-liner card rebuild. — cost if wrong: explainer runs 3–5 lines; one weak row for that query
- Task 10: Ruling: decision records 007 (search relevance cutoff), 008 (compact desktop), 009 (build progress retry) written per Tarik decision-log rule; Task 16 decision records renumber to 010 (public launch) and 011 (search usage cap) — cost if wrong: renumber
- Final: fixed I-2 offline search endless loading — tests/ui/search.test withTimeout RED→GREEN; e2e "a dropped connection…" RED→GREEN on desktop; FamilyPreview stall message after 10s. Ruling: e2e skipped on phone — WebKit offline emulation keeps the open WebSocket alive (probe: navigator.onLine false, W01 still returned) — cost if wrong: WebKit-only offline regression uncaught
- Final: fixed I-3 report card used public cap — evals.test "never spends the public search cap…" RED→GREEN, suite 161/161; dev: report card 24/26, degraded 0. Ruling: Task 14 step 5 CI report-card check must also fail when degraded > 0 — cost if wrong: none
- Task 13: Ruling: bumped actions/checkout and setup-node v4 → v7 (CI annotated Node 20 deprecation; latest releases v7.0.1 / v7.0.0) — CI green — cost if wrong: none
- Task 14: Ruling: deploy via `convex deploy --env-file` (sourcing the key file with `. file` broke on the `|` in the key; CLI rejected the truncated key, nothing leaked; first temp key deleted and recreated) — temp key cli-first-deploy deleted after deploy — cost if wrong: none
- Task 15: Ruling: added "framework": "nextjs" to vercel.json — a project created via `vercel project add` has framework None, so the first production deploy served every route as 404 — cost if wrong: none
- Task 15: Ruling: live URL NOT added to the public README yet — Tarik's quiet launch (link not shared until the laptop version ships) — cost if wrong: README lacks the link until then
- Task 16: Ruling: env filter startsWith(environment,'Preview') instead of == 'Preview' — newer Vercel names it "Preview – <project>"; production deployment_status correctly skipped — cost if wrong: none
- Task 16: first preview run: 7 desktop failures. Root causes (measured): (1) extraHTTPHeaders sent the bypass header cross-origin; ArcGIS CORS allows only Content-Type/Authorization/X-Esri-Authorization → live preview table/chart empty; (2) preview toolbar (vercel.live feedback.js + /.well-known/vercel/jwe + login/validate) reloads desktop pages → networkidle never. Ruling: e2e/fixtures.ts routes headers by origin (preview: bypass+skip-toolbar; vercel.live: skip-toolbar only; nothing to ArcGIS/Convex); config extraHTTPHeaders removed — verified vs live preview 38 passed/6 skipped (was 31/7 failed, 8.1m → 26s); local 38/6

## Deferred minors (15)

- sheet .code has tabular but not lining-nums (Saira EC figures are lining by default; no visible effect)
- sheet section headings use 0.02em letter-spacing (one-off)
- strip chart labels fixed 12px and dots at 35% ink opacity (one-off, not a token)
- M1 late search response after clearing lands on home (requestId not bumped on clear)
- M2 degraded + zero keyword results shows "No datasets matched" without saying meaning search is off
- M3 preview timeout covers headers only and never aborts fetches (use AbortSignal.timeout)
- M4 familySheet queried twice per sheet render (React cache()); junk codes not pre-rejected
- M5 sheet's no-card fallback (member title) lacks a provenance tag
- M6 TabBar marks SEARCH aria-current on sheets; aria-controls targets a missing element while closed
- M8 Hub link schemes not whitelisted to https in parseDcat; empty landingPage self-links
- M9 retired-code 404 path untested
- M10 fake timers not restored in afterEach on failure
- M11 e2e pins live values (46/180, V02 first, 3 chart years) — will go red when DYCU publishes
- M12 .impeccable/build/state.json contains absolute local paths (repo goes public)
- M13 "← Rundown" drops the active ?q= search
