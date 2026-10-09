---
name: Cream City Almanac
description: Milwaukee's public data as the day's show rundown, ruled in ink on white paper and marked up in red grease pencil.
colors:
  pencil: "#d7261e"
  paper: "#ffffff"
  ink: "#111111"
  band: "#ededea"
  muted: "#5c5c5c"
typography:
  display:
    fontFamily: "Saira, 'Saira Extra Condensed', 'Arial Narrow', sans-serif"
    fontSize: "clamp(30px, 9.6vw, 98px)"
    fontWeight: 900
    lineHeight: 0.9
    letterSpacing: "normal"
    fontVariation: '"wdth" 50'
  headline:
    fontFamily: "'Saira Extra Condensed', 'Arial Narrow', sans-serif"
    fontSize: "clamp(26px, 5.86vw, 60px)"
    fontWeight: 700
    lineHeight: 1
  title:
    fontFamily: "'Saira Extra Condensed', 'Arial Narrow', sans-serif"
    fontSize: "clamp(17px, 3.4vw, 35px)"
    fontWeight: 700
    lineHeight: 1.05
  code:
    fontFamily: "'Saira Extra Condensed', 'Arial Narrow', sans-serif"
    fontSize: "clamp(22px, 5.76vw, 59px)"
    fontWeight: 700
    lineHeight: 1
    fontFeature: '"lnum", "tnum"'
  label:
    fontFamily: "'Saira Extra Condensed', 'Arial Narrow', sans-serif"
    fontSize: "clamp(14px, 3.03vw, 31px)"
    fontWeight: 700
  tab:
    fontFamily: "'Saira Extra Condensed', 'Arial Narrow', sans-serif"
    fontSize: "clamp(16px, 3.9vw, 40px)"
    fontWeight: 700
  masthead-side:
    fontFamily: "'Saira Extra Condensed', 'Arial Narrow', sans-serif"
    fontSize: "clamp(15px, 3.9vw, 40px)"
    fontWeight: 700
    lineHeight: 1.1
  body:
    fontFamily: "Vazirmatn, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "clamp(16px, 2.93vw, 30px)"
    fontWeight: 400
    lineHeight: 1.3
  body-small:
    fontFamily: "Vazirmatn, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "clamp(14px, 2.54vw, 26px)"
    fontWeight: 400
    lineHeight: 1.3
  caption:
    fontFamily: "Vazirmatn, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "clamp(13px, 1.76vw, 18px)"
    fontWeight: 400
    lineHeight: 1.3
  site-link:
    fontFamily: "'Saira Extra Condensed', 'Arial Narrow', sans-serif"
    fontSize: "clamp(22px, 2.1vw, 32px)"
    fontWeight: 700
    lineHeight: 1
  note:
    fontFamily: "Caveat, 'Comic Sans MS', cursive"
    fontSize: "clamp(15px, 3vw, 30px)"
    fontWeight: 600
    lineHeight: 1.3
rounded:
  none: "0px"
spacing:
  gap: "12px"
  touch: "44px"
  gutter: "clamp(16px, 3.5vw, 36px)"
  row-compact: "clamp(56px, 9.8vw, 100px)"
  row: "clamp(64px, 13.2vw, 135px)"
components:
  button-ruled:
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "0 clamp(14px, 4vw, 40px)"
    height: "clamp(44px, 7.4vw, 76px)"
  button-ruled-compact:
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "0 clamp(14px, 3vw, 28px)"
    height: "{spacing.touch}"
  slug-label:
    textColor: "{colors.ink}"
    typography: "{typography.code}"
  slug-input:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.none}"
    height: "{spacing.touch}"
  suggestion-tag:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.none}"
    padding: "4px 8px"
    height: "{spacing.touch}"
  section-title:
    textColor: "{colors.ink}"
    typography: "{typography.headline}"
  rundown-row:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    height: "{spacing.row}"
  rundown-row-alt:
    backgroundColor: "{colors.band}"
  results-row:
    typography: "{typography.title}"
    height: "{spacing.row-compact}"
  row-code:
    textColor: "{colors.ink}"
    typography: "{typography.code}"
  provenance-tag:
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "0 0.35em"
  grid-cell:
    typography: "{typography.body-small}"
    height: "clamp(44px, 6.4vw, 66px)"
    width: "clamp(44px, 8.2vw, 84px)"
  grid-cell-on:
    backgroundColor: "{colors.ink}"
    size: "0.9em"
  tab:
    textColor: "{colors.muted}"
    typography: "{typography.tab}"
    height: "{spacing.row-compact}"
  tab-active:
    textColor: "{colors.ink}"
  download-bar:
    backgroundColor: "{colors.paper}"
    padding: "12px 0"
  site-link:
    textColor: "{colors.muted}"
    typography: "{typography.site-link}"
  site-link-active:
    textColor: "{colors.ink}"
  sheet-pane:
    backgroundColor: "{colors.paper}"
    padding: "0 clamp(16px, 3.5vw, 36px)"
  ask-rail:
    textColor: "{colors.muted}"
    typography: "{typography.body-small}"
    rounded: "{rounded.none}"
    padding: "20px 8px"
  part-head:
    backgroundColor: "{colors.band}"
    textColor: "{colors.ink}"
    padding: "6px 12px"
  teaching-note:
    textColor: "{colors.pencil}"
    typography: "{typography.note}"
---

# Design System: Cream City Almanac

## Overview

**Creative North Star: "The Marked-Up Rundown"**

The almanac is laid out like a radio newsroom's show rundown: one white sheet, a heavy condensed masthead, and every dataset family set as a single slugged row with a permanent code. Structure comes from ruled ink lines and alternating gray bands, never from cards; the only boxes are 1px hairline ones around things you enter or pick (the slug entry, tags, the spreadsheet section's selects and topic chips), its problem notes, and the ruled data table. The only color on the sheet is a producer's red grease pencil, drawn by hand onto the paper to say what changed since your last visit, what you have already opened, and which row you have open now; on How it works the same pencil writes the teaching notes in the margins of a real sheet.

Density is set for a reporter on a phone on deadline. Rows are tall enough to tap one-handed, codes are big enough to scan, and the first viewport carries the masthead, the slug entry, the newest rows, and the tab bar together. Between phone and laptop the layout stays deliberately compact: the same column, capped at 1280px, with type that stops growing at the approved comp's 1024px sizes. A laptop is its own layout, not a phone blown up: the rundown on the left, the selected dataset's full sheet beside it, and a narrow rail that opens Ask in the list's place, all measured from the approved laptop comp at 1536px.

The world refuses the category default for data catalogs: card grids with rounded tag chips and dashboards of charts. It also refuses shadows, corner radii, gradients, and cards. Hierarchy is carried by rule weight, type voice, and banding alone.

**Key Characteristics:**
- White rundown paper, ink text, ink rules; one hand-drawn red.
- Bold condensed newsroom capitals for codes, headings, labels, buttons, and tabs over a plain sans for the data itself.
- Permanent codes and dates in lining tabular figures, aligned down the column.
- Two rule weights: a 2px ink rule opens a block, a 1px hairline divides inside it.
- Flat, square-cornered, ruled buttons. No shadows, radii, gradients, or cards.
- One motion: the grease-pencil circle draws itself on.
- On laptops, list and sheet side by side, with the selection kept in the address.

## Colors

Monochrome ink on white paper, with one hand-drawn red that never enters the stylesheet as a fill.

### Primary
- **Grease-Pencil Red** (#d7261e): the producer's grease pencil and nothing else. On the rundown it is raster plates with fixed meanings: the circle with "new" marks a date updated since the reader's last visit; the tick marks a family the reader opened before (only one they chose; an item opened for them automatically, like the laptop's newest-item sheet, is never ticked); the arrow at the code plus the swash under the title mark the row open, or selected, right now. On How it works it is the hand-lettered teaching notes and their drawn arrows; those notes are the one place a stylesheet uses the red, as their text color (`--pencil`). A circled number for saved is reserved for the Saved phase and has no plate yet.

### Neutral
- **Rundown Paper** (#ffffff): the page ground, and the solid ground under anything pinned (the tab-bar dock, the sheet's download bar) so rows scroll cleanly beneath it. Also the selection text color.
- **Press Ink** (#111111): all primary text, every rule and hairline, ruled-button borders, the active tab's bar, filled place-by-year cells, the focus outline, the caret, and the selection background.
- **Rundown Band** (#ededea): the alternate-row band on the rundown, the search results, and the sheet's live-preview table; the guide lines of the sheet's strip chart; heading bands, meaning the laptop column guide's header row and, on How it works, the annotated sheet's header and its part headings. Never a panel or card ground.
- **Graphite** (#5c5c5c): secondary text only. The catalog line, the slug placeholder, inactive and coming-soon tabs and site links, Ask's status line, sheet sublines and "updated" dates, the credit line, and unavailable grid cells. It holds 6.7:1 on paper and 5.7:1 on the band (WCAG AA).

### Night edition (dark mode)
The same five tokens, redefined; nothing else in the stylesheet changes. Dark applies when the device asks for it and the reader hasn't picked Light in the footer's Theme switch, or when the reader picks Dark (remembered on that browser, applied before the page draws).
- **Night Paper** (#141413): the page ground. Near-black, not black.
- **Night Ink** (#ecebe6): text, rules, filled cells, focus. Stops short of white to cut glare: 15.4:1 on Night Paper.
- **Night Band** (#242422): banding and heading bands. Graphite on it holds 6.1:1.
- **Night Graphite** (#a3a29c): secondary text, 7.2:1 on Night Paper.
- **Night Pencil** (#ff6b5e): the teaching notes' text only (6.6:1). The red plates stay raster red: 3.7:1 on Night Paper and 3.1:1 on Night Band, above the 3:1 graphics need.

Charts encode with ink strength, so in dark mode a higher reading is brighter; captions say "stronger", never "darker". Clerk's windows take the tokens through `--clerk-color-*` in `app/globals.css`. Every page is checked with axe in both themes.

### Named Rules
**The Grease Pencil Rule.** Red is the producer's hand only: the raster plates (circle = updated, tick = opened by the reader, arrow + swash = open or selected now) and the hand-lettered teaching notes on How it works. It is never a border, fill, hover, focus ring, vector icon, or any other text.

**The Red Number Rule.** A red number means saved. Teaching notes are never numbered, and no other red mark carries a figure.

**The Ink-and-Paper Rule.** Everything structural and interactive is ink on paper (white, or near-black at night): text, rules, buttons, the active tab, filled cells, focus. Gray is for banding, chart guides, and secondary text, never for rules or borders.

## Typography

**Display Font:** Saira, variable, at its 50% width (with Saira Extra Condensed, Arial Narrow)
**Body Font:** Vazirmatn (with Helvetica Neue, Arial)
**Label/Mono Font:** Saira Extra Condensed (with Arial Narrow)
**Note Font:** Caveat 600 (with Comic Sans MS, cursive), for teaching notes only

**Character:** Bold condensed newsroom capitals stamped over a plain, open sans. The capitals speak for the system, the sans speaks for the data, and the two never trade jobs. Karantina was tried during the build and removed; the pairing is settled. A third hand, Caveat, appears only as the grease pencil's writing on How it works.

### Hierarchy
- **Display** (Saira 900, width 50%, clamp(30px, 9.6vw, 98px), line-height 0.9, uppercase): the "Cream City Almanac" wordmark only, set on one line.
- **Headline** (Saira Extra Condensed 700, clamp(26px, 5.86vw, 60px), line-height 1): section titles such as UPDATED THIS SEASON, and the family name at the head of a dataset sheet.
- **Code** (Saira Extra Condensed 700, clamp(22px, 5.76vw, 59px), line-height 1, lining tabular figures): permanent row codes (V02, F02), the TOPIC: label, and the code on a sheet header. On the compact results rows the code drops to clamp(18px, 3.5vw, 36px).
- **Title** (Saira Extra Condensed 700, clamp(17px, 3.4vw, 35px), line-height 1.05): family titles on search-result rows; the open row's title steps up to clamp(20px, 4.3vw, 44px).
- **Tab** (Saira Extra Condensed 700, clamp(16px, 3.9vw, 40px)): SEARCH / ASK / SAVED.
- **Masthead side** (Saira Extra Condensed 700, clamp(15px, 3.9vw, 40px), line-height 1.1, uppercase): TODAY'S RUNDOWN, or RUNDOWN with a result count, beside the wordmark.
- **Label** (Saira Extra Condensed 700, clamp(14px, 3.03vw, 31px)): column heads (CODE / DATASET / UPDATED), ruled buttons, sheet section headings, sheet download links.
- **Body** (Vazirmatn 400, clamp(16px, 2.93vw, 30px), line-height 1.3): row names and sublines, dates, the slug input, suggestion tags, explainers. Vazirmatn 500 sets the place-by-year grid and the column guide's field names; 700 marks the name of the open rundown row.
- **Body small** (Vazirmatn 400, clamp(14px, 2.54vw, 26px), line-height 1.3): the catalog line, search notices, grid cells, sheet sublines, glossary and preview tables.
- **Caption** (Vazirmatn 400, clamp(13px, 1.76vw, 18px)): the credit footer.
- **Site link** (Saira Extra Condensed 700, clamp(22px, 2.1vw, 32px), line-height 1): SEARCH / ASK / SAVED / HOW IT WORKS in the laptop masthead.
- **Note** (Caveat 600, clamp(15px, 3vw, 30px), line-height 1.3; clamp(20px, 1.9vw, 29px) at line-height 1.15 on laptops; red): the teaching notes on How it works, set on a line rising a few degrees (-4° on phones, -6° on laptops).

On laptops the page redefines the type scale from the 1536px comp (px ÷ 15.36 = vw): body clamp(15px, 1.2vw, 18px), small clamp(13px, 1vw, 16px), label clamp(14px, 1.1vw, 17px), code clamp(24px, 2.15vw, 33px), heading clamp(24px, 2.2vw, 34px), and the wordmark clamp(64px, 6vw, 92px) at 54% width. Every row title in the laptop list, rundown or results, takes the condensed capitals at clamp(19px, 1.65vw, 25px). Inside the sheet pane the code grows to clamp(52px, 4.8vw, 74px), the family name to clamp(34px, 3.2vw, 50px), and section headings to clamp(22px, 1.95vw, 30px), while its download links and buttons stay at a reading size, clamp(15px, 1.2vw, 18px).

### Named Rules
**The Two Voices Rule.** Condensed capitals name things (codes, headings, labels, buttons, tabs, site links, and family titles wherever a list is scanned at a glance: search results, and every laptop row); Vazirmatn carries the data (phone rundown names, sublines, dates, explainers). A role never switches voice within a layout.

**The Teacher's Hand Rule.** Handwriting belongs to the grease pencil alone: Caveat 600 in red, tilted a few degrees, for the teaching notes on How it works. It is real text, never an image of words, and never names, labels, or data.

**The Tabular Figures Rule.** Codes, dates, years, and counts use tabular figures, and codes also lining figures, so every column of numbers aligns.

**The One Wordmark Rule.** Saira at 50% width and weight 900 is reserved for the wordmark. The only other use of the display face is Start here's page headings at weight 900 and 62% width: START HERE on every screen, and DYCU'S OWN GUIDES on laptops only, as comp B draws it. On phones comp A sets DYCU'S OWN GUIDES as a band label, like the A RESIDENT bands above it.

## Layout

Below the laptop query, one centered column, capped at 1280px, with a fluid side gutter (clamp(16px, 3.5vw, 36px)). Every size was measured from the approved comp at 1024px wide and expressed as a vw value with a phone floor and a cap at the comp's own 1024px value, so above 1024px the type and row heights stop growing and only the column widens to its cap.

The rundown is a three-column table: the code column (18%, at least 3.5ch), the slug column (the remainder), and a right column (20%, at least 6ch) for the updated date. Search results widen the right column to 30% (at least 9ch) so place sits over years on two short lines. A row opened in place drops a preview panel indented to the slug column, so the place-by-year grid and the one-line explainer sit directly under the row's title, with the action buttons below.

The masthead puts the wordmark left and the side label right, top-aligned, closed by a hairline. The suggestion tags split the width into three equal cells. Rundown rows hold a tall minimum (clamp(64px, 13.2vw, 135px)); result rows and tabs share the compact height (clamp(56px, 9.8vw, 100px)).

Pinned elements follow the device. On phones, and on any screen that is not a laptop, the tab bar and credit line stay docked at the bottom of the home screen, as in the comp's first viewport. On a dataset sheet the download bar is the pinned element below 900px and sits in flow from 900px up; the sheet's tab bar is never pinned.

On the home screen, the one-line explainer band ("Milwaukee data in plain English. How it works", with the drawn arrow) sits between the catalog line and the slug entry, and disappears while a search runs.

Vertical rhythm comes from the comp's measured paddings, not a stepped scale. Two fixed values recur: 12px between grouped actions, notices, and the back link, and a 44px floor on every touch target.

### Laptop two-pane
A laptop is a screen at least 1100px wide in landscape (`(min-width: 1100px) and (orientation: landscape)`). That one query is shared, character for character, by every stylesheet and by the script that decides click behavior; it is never retuned per component. There the page drops its 1280px cap and splits into three columns: the list (39%), the selected dataset's full sheet (the remainder), and a narrow Ask rail (6%).

- **List:** the same rundown and results, re-measured from the laptop comp. Rows hold at least 96px, banding starts on the first row, the CODE / DATASET / UPDATED heads and the tab bar are gone, and the date hugs the row's right edge with 44px kept clear for the pencil's "new". The slug entry and each suggestion tag become hairline boxes; the 2px rules under the slug line and over the section title drop away.
- **Sheet pane:** sticky at the top of the window, at most the window's height, scrolling on its own, divided from the list by a hairline. The download bar pins to the pane's bottom edge.
- **Ask rail:** a hairline-outlined strip that stays beside the pane (sticky 12px from the top, the window's height less 24px). ASK in condensed capitals opens Ask in the list's column (`?ask=1`); open, it shows a drawn cross over a small condensed CLOSE that brings the list back.
- **Selection:** the newest item in the list opens in the pane on arrival. Choosing a row replaces it and records the choice in the address (`?q=…&open=CODE`), so a link, a reload, or Back and Forward restore the same view; choosing the already-open row adds no Back step. On a phone, a laptop link to an item that is not in the list opens that item's own sheet page.
- **Site links** move into the masthead; the bottom tab bar is phone-only and the dock holds only the credit line, in flow at the page end.

### How it works
One column on phones: a page headline, a one-line lede, the annotated sheet with each teaching note above the part it explains, then the explanatory sections stacked. On laptops the headline and lede are inset 6vw, the annotated sheet is centered at about 59vw with roughly 17vw of margin on each side for the notes, and the sections run in three columns, with LIMITS AND CREDITS spanning all three as three text columns.

### Named Rules
**The Compact Desk Rule.** Between phone and laptop, the screen is the phone sheet given room: a 1280px column, type capped at the comp's 1024px sizes.

**The Own Laptop Rule.** A laptop gets its own composition, measured from its own comp, never the phone layout stretched: list and sheet side by side, its own type scale, nothing pinned over the list, and site links in the masthead instead of a tab bar.

**The Address Rule.** What is searched and what is open live in the address, so every view can be linked, reloaded, and stepped back through.

## Elevation & Depth

The system is flat. There are no shadows anywhere, no tonal surfaces, and no layering beyond the pinned dock, the download bars, and the laptop's sticky sheet pane and Ask rail, which sit on solid paper and are divided from what they cover by a rule or hairline. Depth is replaced by rule weight: a 2px ink rule opens a block (section title, slug entry, sheet header, download bar, ruled buttons), and a 1px ink hairline divides inside it (masthead, catalog line, column heads, tag dividers, panels, tables, tab bar). The gray band separates alternate rows without any line at all.

### Named Rules
**The Ruled-Not-Raised Rule.** Nothing lifts off the page. Emphasis is a heavier rule, a heavier voice, or a red pencil mark, never a shadow; even the active tab is marked by a drawn 6px ink bar, not a glow or an underlay.

## Shapes

Corners are square everywhere (0px). Borders are full ink at one of the two rule weights; there are no tinted or partial-opacity borders. The only curves on the page are the hand-drawn grease-pencil plates and the pencil's handwriting, whose waxy, uneven stroke is the deliberate contrast to the ruled geometry. Vector marks are drawn, not typed: the arrow is a short 2px square-capped stroke in the current text color (mirrored for "back"), and an available place-year is a solid ink square (0.9em). An unavailable cell shows a graphite dash with a hidden text equivalent.

## Components

### Buttons
Ruled and flat, like a box drawn on the sheet with a marker.
- **Shape:** square corners (0px), a 2px ink rule border, no fill.
- **Ruled button:** label-voice capitals in ink, clamp(44px, 7.4vw, 76px) tall with clamp(14px, 4vw, 40px) side padding. Used for "Open sheet" (followed by the drawn arrow) and "CSV" in an opened row, grouped 12px apart.
- **Compact ruled button:** the same box at 44px tall with clamp(14px, 3vw, 28px) side padding, for the dataset sheet's download bar and the live preview's "Try again".
- **Hover / Focus:** no hover fill or color change. Focus is the system focus ring: a 3px ink outline offset 2px.

### Chips
- **Suggestion tags:** three plain-word searches in body type, divided by vertical hairlines with no other border, 44px tall. Hover underlines the word (0.18em offset). They disappear once a search is running.
- **Provenance tag:** a small boxed capital tag (HUB, DYCU, SOURCE, CITY, AI) at 0.8em of the surrounding text, in a 1px ink hairline box with 0.35em side padding, raised 0.1em. It follows every sourced or AI-written fact and carries its full meaning as a title.
- **CITY tag and LIVE mark:** CITY is one more provenance tag, titled "From the City of Milwaukee's open data", and marks anything that comes from the City's catalog or its live data: it follows a City family's name on the rundown and in results, sits in the sheet's subline, and ends the City count card's caption. LIVE is a different thing: a small ruled caps mark (`.live` in `rundown.module.css`) on a City family the City refreshes daily, placed after the name and the CITY tag, a 1px ink hairline box in condensed caps at 0.7em. A LIVE family does not count as "updated" from its daily refreshes, so it never takes the circle-and-"new"; it is re-dated only when the dataset's columns change.

### Cards / Containers
There are none. An opened row's preview is an indented region closed by a hairline, on the row's own ground. Dataset sheet sections are ruled blocks separated by hairlines, each led by a label-voice capital heading.

### Inputs / Fields
- **Topic entry:** the TOPIC: label in code-voice capitals, then a borderless, transparent input on the same baseline, in body type, 44px minimum height, with a graphite placeholder ("What are you looking into?") and an ink caret. The line is closed below by the 2px rule.
- **Neighborhood / Year selects:** native selects in a square 1px ink hairline box, 44px tall, body type on paper, with the chevron drawn as a 2px ink stroke; the label sits inline before it in bold body type with a colon. A select is capped at 17.5em; at 480px and narrower each label sits above a full-width select.
- **Focus:** the system focus ring (3px ink outline, 2px offset).

### Navigation
- **Tab bar (phones only):** three equal cells between two hairlines, tab-voice capitals, compact row height. Inactive and coming-soon tabs are graphite; the active tab is ink with a 6px ink bar drawn across its cell near the bottom edge (inset clamp(4px, 1.7vw, 17px)). ASK and SAVED are non-link placeholders titled "Coming soon" until their phases ship. On How it works no tab is active. Laptops never show it.
- **Phone menu (below laptop width):** the masthead's right corner holds a ruled MENU button (44px) in place of the page name; today's date or a search's result count stays under it in body type. MENU opens a native modal dialog: a full-screen paper sheet with a MENU / CLOSE × head over a 2px rule, then ruled 60px rows in tab capitals (SEARCH, ASK, START HERE, HOW IT WORKS; the current page underlined 3px), then ACCOUNT and SIGN OUT (or SIGN IN), then the Theme switch. It closes itself before opening Clerk's windows, and focus returns to MENU. The wordmark links home on every screen.
- **Masthead site links (laptops):** SEARCH / ASK / SAVED, then START HERE and HOW IT WORKS, in site-link capitals to the right of the wordmark, clamp(20px, 2.6vw, 40px) apart. Inactive and coming-soon links are graphite; the current page is ink, underlined by a 4px ink bar 6px below the words. START HERE and HOW IT WORKS are always ink, each set apart by a short hairline drawn outside the link, so the current-page bar underlines only its words. On phones, How it works marks itself instead by underlining the masthead's side label (3px, 0.2em offset). Signed in, ACCOUNT and SIGN OUT follow as one ink pair behind a single hairline, set smaller (16–22px) as utility, and the spacing tightens to clamp(12px, 1.5vw, 40px) so every label stays on one line from 1100px; on phones the pair lives in the footer.
- **Back link (sheet):** the mirrored drawn arrow and "Rundown" in small body type, above a hairline.
- **Explainer band (home):** one line, "Milwaukee data in plain English." then a "How it works" link with the drawn arrow, kept on one line. On phones it is small body type closed by a hairline; on laptops it sits at body size with no rule. Hidden while searching.
- **Credit footer:** centered caption-size graphite links, "Built on Data You Can Use's public data · How it works", padded for the safe-area inset on phones.

### Rundown Row (signature)
The heart of the system: one dataset family per row, coded like an item on a show rundown.
- **Columns:** the code in code-voice capitals with lining tabular figures, lifted 0.19em so its cap top lines up with the slug's first line; the slug as the family name, a dash, and a subline whose segments ("29 neighborhoods", "2022–2024") never split across lines; and the updated date, right column, tabular.
- **Banding:** even rows take the band; there are no row dividers.
- **Marks:** circle-and-"new" around the date (updated since last visit), a tick after the right column (opened before, by the reader's own choice). Opening a row on a phone, or selecting it on a laptop, adds the arrow plate before its code and the swash under its title; on phones it also sets the rundown title in Vazirmatn 700. The laptop's auto-opened newest row gets the arrow and swash but is never recorded as opened. Every plate is hidden from assistive tech and paired with visually hidden text that states its meaning.
- **Results variant:** compact row height, smaller code, the title in title-voice capitals, and place over years in the right column.
- **Loading:** empty ruled rows at full row height; no spinners or skeleton shimmer.

### Place-by-Year Grid
A hairline table of places down and years across, every cell at least 44px. A solid ink square means the year exists for that place; a graphite dash means it does not. Inside an opened row, a family with more than six places collapses to one summary line pointing to the full grid on the sheet.

### Masthead
The wordmark left, the side label right in masthead-side capitals, with today's date beneath it or the result count beside it in body type; closed by a hairline. On laptops the masthead centers vertically, the TODAY'S RUNDOWN label and date step aside for the site links (the result count still shows while searching), and the wordmark widens to 54%.

### Sheet Pane (laptop)
The selected dataset's full sheet, the same content as its own page, re-set for a column beside the list.
- **Header:** the code and the family name on one line, divided by a hairline; the subline drops, since place and years sit in the grid right below. Closed by the 2px rule.
- **Lead:** when the pane itself is at least 680px wide (a container query on the pane, so it tracks the pane, not the window), the place-by-year grid, headed PLACE BY YEAR, sits beside WHAT IT MEASURES with a hairline between them; narrower, they stack.
- **Column guide:** one hairline box with a header row (COLUMN / DESCRIPTION / TAG) in condensed capitals on the band; field names in the body face; the provenance tag in its own hugging TAG column instead of inline.
- **Downloads:** ruled buttons under the 2px rule, pinned to the pane's bottom edge.
- **States:** "Loading…" while the sheet arrives, a plain can't-reach-the-catalog line if it stalls, and for an unknown code a note with a "Show the newest" ruled button. Escape returns focus to the selected row.

### Ask (margin notes)
The almanac's reference desk, from the approved comps `.impeccable/mocks/ask-laptop.webp` and `ask-a-phone.webp`. The AI annotates the almanac rather than talking over it: each question sits in a gray band in bold body type, and each answer is a short numbered note (a large Saira Extra Condensed 900 numeral beside plain-sans words) that points at the real sheet or row. A hairline closes each note before the next question. The model's words carry no figures; the sheet or excerpt carries every number.
- **Laptops:** Ask takes the list's column (39%), a window tall less the masthead, sticky like the pane; the notes scroll and the question field sits at the column's foot under the 2px rule. A number answer opens its table in the pane with the row outlined by a 2px ink rule and its figures in bold, and an ink leader (1px, with an origin dot and an open arrowhead) runs from the note's condensed "Open CODE →" link into that row; a dataset answer points the leader at the sheet's heading. The pane scrolls only as far as the row needs.
- **Phones:** `/ask` is one viewport tall: the masthead, the scrolling notes, the field, and the tab bar (no credit line). A number answer shows a three-row excerpt of the real table under its note, the asked row outlined, the header row on the band, a short ink drop arrow from the note, then "Census table" and "Open the full table →".
- **Results inside notes:** search results as compact ruled rows with Open links; report passages as quotes in a hairline frame with report name and section; the live chart for daily readings on phones.
- **Unverified figures:** a number in the model's words that is not a year, a dataset code, an identifier, a quoted row label or a definition (age band, survey period, table number) gets a dotted underline and a small boxed "unverified" tag in graphite. Never red.
- **Status line:** one graphite line under the field: "N of M questions left today · Don't paste private source info · Sign out", Sign out an underlined text button.
- **Signed out:** a one-line invitation and a ruled "Sign in to ask" button (Clerk's modal).
- Leaders and outlines are ink, never red: red is DYCU's teaching voice, not the AI's.

### City Sheet and City Count Card
The City of Milwaukee's open data joins the almanac as one more kind of row, not a separate section: a City family sits in the same rundown and search results with a CITY tag, and the daily feeds carry the LIVE mark. Codes keep the rundown's letters: P Public Safety, B Elections, C City Services, G Maps, and H for the City's housing and property data (sharing the letter with DYCU's housing).
- **City sheet:** the same sheet as any family, with the CITY tag in the subline. When the dataset's profile flags people's names, the note "Names private individuals. Shown as the City publishes it." sits above the preview in small body type. The LIVE PREVIEW is the City's newest rows, fetched in the reader's browser straight from the City, in the same banded table as DYCU's preview. The COLUMN GUIDE uses the City's own column names and descriptions, and falls back to the column names alone when the City gives no glossary.
- **City count card (Ask):** the excerpt card's style, one hairline box. The caption is "name · filters · period" in label size, ending in the CITY tag. The count is the card's one big figure, in caps figures (`.countFigure`, clamp(36px, 6vw, 56px), tabular), so the eye lands on it. A grouped question ("by month") adds a ruled group table under the count: date groups run oldest to newest and any remainder is one last row, "Earlier" for dates or "Other" for types. Under the table, small graphite notes say how many future-dated records were left out and repeat the dataset's own caveat. "Open the data" is the card's only link and goes to the dataset's sheet.
- **The count is the card's, never the model's:** the card is filled from the City live, so a number appears only on a card. If the City does not respond the card says "The City's data didn't respond." and shows no figure. Ask only counts and never looks up a named person.

### Annotated Sheet (signature, How it works)
A real dataset sheet, cut to its four teaching parts and marked up by the grease pencil like a page from the producer's desk.
- **Header band:** the code and the family name in condensed capitals on the band, between hairlines.
- **Parts:** the place-by-year grid beside the explainer (hairline between, with its provenance tag); the column guide (first two real columns, field names in condensed capitals, hairline rows and a hairline after the name column); the live preview's chart; then CSV and OPEN SHEET ruled buttons between hairlines. Part headings (COLUMN GUIDE, LIVE PREVIEW) sit on gray bands in condensed capitals (clamp(18px, 3vw, 28px)).
- **Teaching notes:** short hand-lettered phrases in the note voice and red, each with a thin drawn arrow plate. On phones a note sits above its part with a downward arrow (1.3em); on laptops it moves into the margin, its arrow pointing toward the sheet (about 4 to 5vw long). The notes are a paragraph of real text; the arrow is hidden from assistive tech.

### Neighborhood Spreadsheet Section (N03 sheet)
One neighborhood's Census tables, exactly as DYCU published them, on the phone page and in the laptop pane. One order on every screen: the label-voice heading; a lead with the DYCU tag; the Neighborhood and Year selects; the topics; the problem notes; the table's caption and ruled table; the topic's one-line explanation with its Census table links (SOURCE tag); the margin-of-error line in small graphite.
- **Topics (phones):** a ruled list in a hairline box, two columns when each can hold 14em and one otherwise, reading down each column in DYCU's tab order; each row is the topic name and its Census table IDs in graphite tabular figures. The topic in view takes the band and bold.
- **Topics (laptops):** a wrapped strip of hairline-boxed chips, 44px tall, 12px apart (14px between rows). The chip in view takes the band and condensed bold capitals, and the grease-pencil topic arrow lands on its top-right corner.
- **A topic missing from the year's file** is listed in graphite as "Topic: not in this year's file", never hidden.
- **Problem notes:** one hairline-boxed line of small body type per issue in DYCU's file, above the table, in plain words.
- **Table:** a full 1px ink hairline grid with the caption above it, column-group heads in condensed capitals, Estimate and ± Margin heads in body type, row labels left (at least 8em), figures right-aligned in tabular figures. Phones band both head rows and every second body row and set the Total row in bold; laptops band only the Total row. Wide tables scroll sideways inside their own box; words break only between words.
- **Numbers:** DYCU's Estimate and margin, never computed or filled: whole numbers with commas, decimals DYCU wrote to three places or fewer as written, longer computed decimals rounded by size (under 1 to three places, under 10 to two, otherwise whole). A margin reads ±n; a zero margin prints 0; text and error cells appear as written.
- **Caption scale:** on phones the caption is label size in capitals, never above the section heading; on laptops it is 0.8 of label size in title case.
- **Behavior:** the choice lives in the address (`place`, `year`, `topic`); on screens below the laptop query, choosing a topic brings its notes and table into view.

### Start Here (orientation page)
Three people, three real questions, and DYCU's own guides, at `/start-here`. One order on every screen: the page headline and a one-line lede; then a reporter, a nonprofit and a resident, each with a band label (A REPORTER), the question in large condensed capitals, numbered steps whose links go to the exact view they name, a live excerpt in a hairline box, and a "Try it" link; then DYCU'S OWN GUIDES and "How the almanac works".
- **Laptops:** the three people sit side by side in ruled columns (494 : 474 : 496), each excerpt box ends at its content (comp B; stretching them left the resident box with an empty band), a rule closes each column's steps, and every "Try it" sits on the same baseline with one thick bar under the words and the arrow. The guides row is four ruled columns (heading, the three Hub links with HUB tags, the contact line, How the almanac works), closed by a rule.
- **Phones:** one column; steps are ruled rows with condensed numerals; the guides open with a band label.
- **Excerpts are live, never typed:** story angles and caveats appear exactly as on their sheets with their AI tags; the neighborhood table shows its first rows with the DYCU tag and its problem notes; the air readings come through the live preview's strip chart, which for daily readings (a dataset with a Day column) runs January to December, one thin mark per day, darker for a higher reading, since 366 dots placed by value overlap into a bar. Excerpt labels and the table caption are gray-band labels in bold body type. When data doesn't load, the example keeps its steps and link and says so.

### How to Use Ask (`/ask/guide`)

Start here's layout and type: wordmark-lettered headline, lede, banded section heads (READING AN ANSWER, WHAT TO ASK, WHAT ASK WON'T DO); three ruled role columns on laptops (A JOURNALIST, A NONPROFIT, A CITIZEN), stacked on phones. The sample answer is built from Ask's own parts: the first-question band, note 1 with figure-free prose, the phone number card filled live from `getNumber`, and one line showing the unverified mark on a made-up figure that says so. Grease-pencil notes sit in the right margin on laptops (the sample holds 560px with 280px of margin; the mark's note is lifted so its arrow meets the line) and above each part on phones. Example questions are ruled ink links that open Ask with the question typed in, never sent; Ask's empty panel, Start here, the footer and the phone menu link here.

### Guide Pages (DYCU's Hub pages)
Families of kind `page` are DYCU's guides to its Hub, not data: they stay out of "Updated this season", stay findable in search, and their sheet and phone preview show one line, "A guide page on DYCU's Hub, not a dataset.", with an "Open it on the Hub" link and its HUB tag (plus "New here? Start here." on the sheet).

### Grease-Pencil Plates (signature)
Transparent raster PNGs of red grease-pencil ink, trimmed to their ink and sized in em so they track the text they mark: the circle-with-"new", tick, arrow, and underline swash on the rundown, three thin arrows (down, pointing right, pointing left) for the teaching notes, cut from the approved How it works comps, and the topic arrow, the selected-now arrow turned to come in from the upper right onto a topic chip's corner. Originals and their generation provenance live with the source assets; the shipped copies are served as static plates.
- **Motion:** the circle draws itself on once when the rundown loads, revealed left to right by a clip-path in 12 stepped frames over 600ms after a 250ms delay, like a pencil stroke filmed frame by frame. Under reduced-motion preferences it appears already drawn.

**The One Motion Rule.** The pencil circle drawing on is the only animation in the system; nothing else fades, slides, or transitions, and reduced motion removes even that.

## Do's and Don'ts

### Do:
- **Do** open every block with the 2px ink rule and divide inside it with 1px ink hairlines; let the band separate alternate rows.
- **Do** set codes, dates, years, and counts in tabular figures, with codes in Saira Extra Condensed 700 and lining figures.
- **Do** give every grease-pencil plate a visually hidden text equivalent and hide the image itself from assistive tech.
- **Do** keep every touch target at 44px or taller.
- **Do** tag every sourced or AI-written fact with the boxed provenance tag.
- **Do** draw icons as inline strokes in the current text color, like the 2px square-capped arrow.
- **Do** cap the column at 1280px and let type stop at the comp's 1024px sizes below the laptop query.
- **Do** use the one laptop query, `(min-width: 1100px) and (orientation: landscape)`, everywhere a laptop rule is needed, and keep it identical to `LAPTOP_QUERY`.
- **Do** keep the search and the open item in the address on laptops (`?q=…&open=CODE`).
- **Do** write teaching notes as real text in Caveat 600 and red, tilted a few degrees, with a drawn arrow plate pointing at the part they explain.
- **Do** tick only what the reader chose to open; an item opened for them is marked as selected, never as opened.

### Don't:
- **Don't** use red for anything a stylesheet draws except the teaching notes' text: no red borders, fills, hover, focus, vector icons, or other text. Everywhere else red is a raster grease-pencil plate.
- **Don't** number a teaching note or put a figure in any red mark but the saved number.
- **Don't** show the bottom tab bar on laptops, or stretch the phone column across a laptop screen.
- **Don't** add shadows, corner radii, gradients, or cards.
- **Don't** present datasets as card grids with rounded tag chips or as dashboards of charts; a family is a ruled row or a ruled sheet.
- **Don't** animate anything besides the pencil circle drawing on.
- **Don't** pin both the tab bar and the download bar on a sheet.
- **Don't** use Unicode glyphs in place of drawn icons.
- **Don't** use the display face for anything but the wordmark.
