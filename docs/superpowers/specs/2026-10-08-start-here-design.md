# Cream City Almanac: Start Here — Design

**Status:** sections approved in conversation 2026-10-08; this document is the written spec for Tarik's review.
**Builds on:** `DESIGN.md` (The Rundown), the How it works page (`app/how-it-works`, `ui/components/HowItWorks.tsx`), Phase 3a (`docs/superpowers/specs/2026-10-08-neighborhood-spreadsheets-design.md`), decision 018 (this design's core choice).

## 1. Why

Tarik: "we should create use case page in plain english giving example how a journalist could use, or non-profit or a citizen." Then, looking at the rundown: DYCU's guide pages (X01 About the Data, X02 Getting Started, X03 Questions and Feedback) "should be located somewhere else that is more useful, since not really data, but more of explaining the data hub."

Both are orientation. How it works explains how the almanac is built and how to read one sheet; nothing yet shows a newcomer what *they* would do with it, and DYCU's own guides are filed among the datasets, where they crowd the "Updated this season" list and open near-empty sheets.

**Audience (Tarik's answer):** both first-time visitors who need a way in and people arriving from LinkedIn, DYCU or the News Product Alliance who want to see what's possible. So every example is a real walkthrough whose links work.

**Success:** a first-time visitor reads one example and, within a minute, knows what they'd type and what they'd get; the guide pages stop appearing as data.

## 2. Verified facts (2026-10-08)

- **Guide pages:** X01–X03 are families of kind `page`, topic Other, latest modified 2026-04-29 to 2026-05-20. `rundownRows` (`convex/search.ts`) takes the 10 most recently modified families of any kind, so X02 and X01 hold 2 of the 10 slots today. X02's AI explainer reads "This entry is a page titled 'Getting Started' rather than a dataset… Its description is an unfilled template placeholder"; its Hub landing page is `https://getdata-dycu.hub.arcgis.com/pages/DYCU::getting-started`.
- **Reporter example:** the search "older housing and asthma rates" returns W01 Asthma Prevalence 1st and H05 Housing Built Before 1950 3rd ("old houses and asthma" misses H05). H05 (County, 2022–2024) has the story angle "Are areas with older housing stock also areas where residents face higher housing burdens or maintenance problems?"; W01 (City and County, 2021–2023) has the caveat "These are modeled estimates produced by a methodology, not direct counts of people with asthma, so avoid saying how many people have asthma."
- **Nonprofit example:** Harambee has N03 files for 2021–2024. The 2024 Poverty Status by Age table (Census B17001) starts: Total 18,894 ± 1,504; Income in the past 12 months below poverty level 6,520 ± 790; Under 5 years 608 ± 252; it carries the note "Percentages and precision columns have formula errors in DYCU's file, so they aren't shown."
- **Resident example:** the search "air quality" returns V02 Daily Air Quality first. V02 (City, 2023–2025) has a live FeatureServer feed; its caveats include "Each value is a citywide daily average of sensor readings, so it can hide differences between neighborhoods" and a note that the number of sensors changed over time.
- **Existing surfaces to link from:** `ui/components/SiteNav.tsx` (masthead links; HOW IT WORKS set apart on laptops), `ui/components/ExplainerBand.tsx` (home one-liner), `ui/components/CreditFooter.tsx` (footer).

## 3. Scope

**In:** a Start here page at `/start-here`; links to it from the laptop masthead, the home band and the footer; guide pages out of "Updated this season"; a guide-page block replacing the AI sheet for kind `page`; one report-card question; decision 018.

**Out:** changing How it works' content; new AI writing of any kind; typed-in numbers; screenshots or video; more than three examples; the phone masthead or tab bar; stopping the weekly build from writing AI cards for guide pages (they're simply not shown).

## 4. The page: `/start-here` (phone and laptop, one order)

1. **START HERE** heading and a one-line opener ("Three people, three questions, and how each gets an answer here"; final words with the comps).
2. **Three worked examples**, each: who it is and their question in their own words; 3–4 plain numbered steps naming exactly what's on screen; a **live excerpt** of the real data; a **Try it** link to that exact view. Laptops set the excerpt beside the steps; phones below.
   - **A reporter.** "Do the neighborhoods with the most old housing also have the most asthma?" Steps: search "older housing and asthma rates"; open Asthma Prevalence (W01) and Housing Built Before 1950 (H05); read each sheet's caveats first; use the story angles as starting questions; download both CSVs and match them by census tract. Excerpt: H05's story angles (first two, AI tag) and W01's first caveat, with the tags they carry on their sheets. Try it: `/?q=older%20housing%20and%20asthma%20rates`.
   - **A nonprofit.** "Our grant application needs Harambee's poverty numbers, by age." Steps: open the Neighborhood Portrait Spreadsheet (N03); pick Harambee and the newest year, then Poverty Status by Age; quote each estimate with its margin of error and cite the Census table (B17001, linked on the sheet); for the story behind the numbers, read the Harambee Neighborhood Portrait report (N02). Excerpt: the first three rows of Harambee's newest Poverty Status by Age table with ± margins, its DYCU tag and its problem notes, captioned "Harambee, {year}: Poverty Status by Age". Try it: `/d/N03?place=harambee&year={year}&topic=poverty-status-by-age`.
   - **A resident.** "What has the air been like in Milwaukee lately?" Steps: search "air quality"; open Daily Air Quality (V02); the live preview charts every day's reading from DYCU's Hub, no download needed; read the caveat: a citywide daily average from community sensors, and the number of sensors changed over time. Excerpt: the live preview's chart of daily readings per year (its chart-only mode; the preview's rows are the feed's first rows, not the latest days). Try it: `/d/V02` (the sheet on phones, the two-pane view on laptops via the existing redirect; a `?q=…&open=V02` link only expands the row on phones).
3. **DYCU'S OWN GUIDES:** Getting Started, About the Data, Questions and Feedback, each linking straight to its Hub landing page from the catalog, with the HUB tag; no descriptions (DYCU's are empty templates). Then "Questions about the data itself: hub@datayoucanuse.org".
4. **A closing link:** "How the almanac works →" to `/how-it-works`.

**Rules:** numbers appear only inside excerpts, read live from the data; story angles and caveats appear exactly as on their sheets with their provenance tags; no new AI text; the excerpt's step text never quotes a specific angle (cards can be rewritten weekly).

**Links to the page:** laptop masthead START HERE beside HOW IT WORKS (both set apart from SEARCH / ASK / SAVED); the home band reads "Milwaukee data in plain English. Start here →" on every screen; the footer adds "Start here" beside "How it works".

## 5. Guide pages (families of kind `page`)

- **"Updated this season" lists data only:** `rundownRows` skips kind `page` and still returns 10 rows.
- **Search keeps them:** a search for "getting started" or "contact" still finds them.
- **Their sheet** (`/d/X0n`, the laptop pane, and the phone's inline preview) shows one block in place of the AI sheet: "A guide page on DYCU's Hub, not a dataset." with an "Open it on the Hub" link to the landing page (HUB tag) and a link to Start here. The AI explainer, grid, column guide and story angles are not shown for kind `page`.

## 6. Data

- One public query (`catalog.startHere`) gathers what the server-rendered page needs: H05's and W01's card angles and caveats (with provenance), Harambee's newest N03 file and its Poverty Status by Age table, V02's preview inputs (as `familySheet` provides them for the live preview), and the three guide pages' titles and Hub links. Families are looked up by key, not code.
- The page renders on the server and revalidates on the same schedule as How it works; the air readings load in the browser through the existing live-preview component.

## 7. Errors and edge cases

| Case | Behavior |
|---|---|
| A family, card or table isn't found | That example keeps its steps and Try it link and says "Live data didn't load"; nothing is filled in |
| Harambee's newest file has no tables yet | Use the newest year that has tables (the same rule the N03 sheet uses) |
| DYCU's Hub is down | The air preview shows its existing failure state with "Try again" |
| A card is rewritten | The excerpt shows the new text; the steps don't depend on it |
| A guide page's landing page is missing | The guide is listed without a link |

## 8. Testing

- **Browser (phone + laptop):** the page shows the three examples and the guides; the Harambee excerpt's first row equals the stored table's first row; the reporter excerpt shows H05's first angle and W01's first caveat as stored; each Try it link lands where its steps say (the reporter search shows W01 and H05 in the top five; N03 opens Harambee's poverty table; V02 opens); the guide links point at DYCU's Hub; no `page` family appears in "Updated this season"; `/d/X02` shows the guide block; the masthead (laptop), band and footer links reach `/start-here`; axe scan; no sideways scroll at 390, 1024 and 1440.
- **Unit / Convex:** `rundownRows` skips pages and still returns 10; `catalog.startHere` returns each example's data and degrades to nulls when something is missing.
- **Search report card:** add "older housing and asthma rates" (expects W01 or H05 in the top three). Known limit: the card passes on either; the browser test is what pins both in the top five.
- **Design:** comp diffs at the comps' sizes and the finish review disposition.

## 9. Design process

One Impeccable comp round for the page, phone and laptop (two directions, about 4 images, under $1, Tarik picks), then a comp-led build with the usual gates and the independent finish review; DESIGN.md updated with the page and the guide-page block.

## 10. Open items for planning

1. Read How it works' server rendering and revalidation, and the live-preview component's inputs, before writing `catalog.startHere`.
2. Decide whether the laptop masthead fits a fifth link at 1100px without wrapping; if not, the comp round settles the order and spacing.
3. Resolved in planning: the phone redirect does not fire for `/?q=air%20quality&open=V02` (V02 is in that search's rows), so the resident's Try it is `/d/V02`.
