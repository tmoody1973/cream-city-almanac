# Cream City Almanac explainer video: design

**Date:** 2026-10-16
**Status:** Draft for Tarik's review
**Decided with Tarik (2026-10-16):** 90s wide + 30s vertical; on-screen words + music, no narration; general "coming next" for DNR; scenes rebuilt in motion, plus one real ego-browser recording of the address lookup; Claude picks a free library track and records its license page.

## Goal

A video for YouTube and social that tells an average Milwaukee resident, in 90 seconds, what Cream City Almanac is and what it can do, with a beat for journalists and one for nonprofits, and says Wisconsin DNR open data is coming next. It follows the story of `/about` ("What's in the Almanac").

Success: someone who has never heard of the Almanac can watch it muted and say (1) it's Milwaukee's public data in one place, (2) they can type their address, and (3) every number says where it came from.

## Deliverables

1. `CreamCityAlmanac` composition: 1920×1080, 30 fps, 90 s (2700 frames). Rendered to `video/out/cream-city-almanac-90s.mp4`.
2. `CreamCityAlmanacVertical` composition: 1080×1920, 30 fps, 30 s (900 frames). Rendered to `video/out/cream-city-almanac-30s-vertical.mp4`.
3. `Thumbnail` still: 1280×720 PNG for YouTube's custom thumbnail, `video/out/thumbnail-youtube.png`. `ThumbnailVertical` still: 1080×1920 PNG for the Instagram/TikTok/Shorts cover, `video/out/thumbnail-vertical.png`. Both show the wordmark "Cream City Almanac", C3a ("Look up your Milwaukee neighborhood."), a red grease-pencil circle, and the five source tags. (Added at Tarik's request, 2026-10-16.)
4. All are rendered only when Tarik asks. `video/out/` is git-ignored.

**Frame 0 is never blank.** Platforms that take frame 0 as the cover must get a designed frame: scene 1 opens with the six file names already on the page (they shuffle and pile up, rather than falling onto empty paper).

## Scenes (90 s wide)

Every on-screen sentence must appear in the Claims table below with its source.

| # | Frames | Scene | On screen |
|---|---|---|---|
| 1 | 0–239 (8 s) | Problem | Frame 0 already shows the words on paper; they shuffle and pile up: "Crime reports", "Fire calls", "Property records", "Voter turnout", "Health surveys", "Census figures". Then C1, C2. |
| 2 | 240–449 (7 s) | Reveal | Masthead "Cream City Almanac" draws on with a red grease-pencil rule. C3. |
| 3 | 450–899 (15 s) | Your address | The real recording (below) plays inside a ruled frame. Red-pencil circles mark neighborhood, alder, ward and polling place as each appears. C4, C5. |
| 4 | 900–1259 (12 s) | Fact sheet | Riverwest poverty rate as a bar beside the city's, each with its margin of error drawn as a range; the verdict label stamps in. C6, C7. |
| 5 | 1260–1739 (16 s) | Ask | Q1 types itself; an answer card builds with the count, a CITY tag and "as of" date. Then C8 lines flick past one by one. |
| 6 | 1740–2039 (10 s) | Trust | C9, C10. Tags DYCU, CITY, CENSUS, HCM, AI stamp in, each with its plain-English name (C11). |
| 7 | 2040–2399 (12 s) | Who it's for | Split screen. Left "For journalists": C12. Right "For nonprofits": C13. |
| 8 | 2400–2549 (5 s) | Coming next | C14. |
| 9 | 2550–2699 (5 s) | Start | "creamcityalmanac.app" large; C15. |

### Vertical (30 s)

Same scene components, laid out for 1080×1920, cut shorter: Problem (0–119, C1 only) → Reveal (120–239) → Address (240–479) → Ask (480–689, Q1 card only, no C8 list) → Trust tags (690–779, C10 + tags) → Coming next (780–839) → Start (840–899).

## Claims table

| ID | On-screen text | Source |
|---|---|---|
| C1 | Milwaukee publishes a lot of information about itself. | one-pager ¶1 |
| C2 | Most of it sits in spreadsheets only a data analyst would open. | one-pager ¶1 |
| C3 | Look up your Milwaukee neighborhood. Every number says where it came from. | one-pager tagline; /about lede |
| C3a | Look up your Milwaukee neighborhood. | one-pager tagline (first sentence of C3); thumbnails only |
| C4 | Type your address. See your neighborhood, alder, ward and polling place. | /about entry 1; one-pager |
| C5 | The Almanac doesn't keep your address. | one-pager "Type your address" |
| C6 | Your neighborhood's figures, next to the city's. | one-pager "Read your neighborhood's fact sheet" |
| C7 | Every City neighborhood has a fact sheet. | one-pager (fact sheets for every City neighborhood, decision 054) |
| Q1 | How many robberies in Harambee this year? | `QUESTION` in `ui/components/LandingAskSample.tsx` |
| C8 | Crime back to 2005 · Fire calls and response times since 2015 · How long vacant buildings have sat on the City's list · Health and food figures by ZIP code · Voter turnout | /about `CAN_ASK` (shortened, no new facts) |
| C9 | The AI picks the right tool. Code does the math. | one-pager "Why you can trust the numbers" |
| C10 | The AI never writes a number. | one-pager "Why you can trust the numbers" |
| C11 | Tag names: Data You Can Use · City of Milwaukee · U.S. Census Bureau · Health Compass Milwaukee · Written by AI | /about `TAGS` |
| C12 | The figure, its source and its caveats on one card. Export it or share a link. | one-pager "For journalists" |
| C13 | A one-page fact sheet with the city's figures alongside, for grant applications. | one-pager "For nonprofits" |
| C14 | Coming next: Wisconsin DNR open data on air, water and land. | Tarik, 2026-10-16 (general "coming next", no dataset names, no date) |
| C15 | Free. Start with your address. | one-pager "Good to know" (search and fact sheets open to everyone; Ask free with sign-in) |

Rules: no number appears unless it comes from the data snapshot. No testimonials, no invented people. Nothing about a specific property, owner or person. The address shown is Milwaukee City Hall (200 E Wells St), never a home.

## Look

From `DESIGN.md`: paper `#ffffff`, ink `#111111`, band `#ededea`, muted `#5c5c5c`, grease pencil `#d7261e`. Same four fonts as `app/layout.tsx`, loaded with `@remotion/google-fonts`: Saira (variable width, 50% width, weight 900) for the wordmark only; Saira Extra Condensed 700/900 for caps headlines; Caveat 600 for grease-pencil handwriting; Vazirmatn 400/500/700 for body. Ruled lines and red-pencil marks are the motion language: lines draw on, marks circle and underline, tags stamp. Text sizes follow Remotion's layout rules (headline ≥ 84 px, supporting ≥ 44 px at 1080 px wide; key text ≥ 80 px from the sides and ≥ 100 px from top and bottom).

## How it's built

1. **Data snapshot.** `video/scripts/snapshot.mjs` calls production's public endpoints with `ConvexHttpClient`: `factSheet.sheet({slug:"riverwest"})` for the poverty row, `catalog.landingStats` for the sample code, then `map.mapCells` with the same arguments `useRobberySample` uses (Harambee, `Offense_All` = 120, from Jan 1 of the current Chicago year). It writes `video/src/data.json` with the values and `asOf` (the date it ran). The prod URL is passed as `CONVEX_URL=https://spotted-tern-278.convex.cloud` (public, embedded in the live site's scripts; dev is a different deployment). If any call fails, the script exits non-zero and writes nothing.
2. **Recording.** ego-browser can send browser commands but can't listen for the screencast's frame events, so `video/scripts/record-address.mjs` (run through `ego-browser nodejs`) captures `page.screenshot()` in a tight loop while it types the City Hall address into the live `/about` page, saving numbered PNGs and their timestamps. ffmpeg assembles them at their real timing into `video/public/address.mp4` at 30 fps. Gate: if the loop reaches at least 15 captures per second, ego-browser's clip is used; below that, `video/scripts/record-address.playwright.mjs` records the same steps with Playwright's `recordVideo` (Playwright is already a dev dependency of the site) and that clip is used instead.
3. **Music.** One instrumental from a royalty-free library (YouTube Audio Library or Pixabay Music). File in `video/public/music.mp3`; `video/MUSIC.md` records the title, artist, source URL and the license page URL. Tarik checks the license before posting. Scene cuts land on the track's beats.
4. **Remotion project.** `video/` scaffolded with `npx create-video@latest --yes --blank --no-tailwind`, with its own `package.json`. One component per scene under `video/src/scenes/`, each also registered as its own composition in a `Scenes` folder so it can be previewed and trimmed alone. Wide and vertical layouts share components and read `useVideoConfig()` width/height.
5. **Isolation.** `video/` is outside the site's `tsconfig.json` include list and Vitest's include globs; `video/node_modules` and `video/out` are git-ignored; the Next build never touches it. Site CI is unaffected.

## Checks

- `npx tsc --noEmit` inside `video/` passes.
- A still of every scene in both layouts (`npx remotion still`), viewed at full size and at phone size, before the full render.
- Every visible sentence matches the Claims table (a small test reads the scene text constants and checks each against the table's IDs).
- `data.json` values match what `/about` shows on the day of the snapshot.

## Decision log

Write `docs/decisions/056-explainer-video.md`: rebuilt scenes plus one real recording, versus all screen recording. "What actually happened" left blank for Tarik.

## Out of scope

Narration and captions files, uploading or posting, other aspect ratios (1:1), localization, any change to the web app.
