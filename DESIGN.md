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
---

# Design System: Cream City Almanac

## Overview

**Creative North Star: "The Marked-Up Rundown"**

The almanac is laid out like a radio newsroom's show rundown: one white sheet, a heavy condensed masthead, and every dataset family set as a single slugged row with a permanent code. Structure comes from ruled ink lines and alternating gray bands, never from boxes. The only color on the sheet is a producer's red grease pencil, drawn by hand onto the paper to say what changed since your last visit, what you have already opened, and which row you have open now.

Density is set for a reporter on a phone on deadline. Rows are tall enough to tap one-handed, codes are big enough to scan, and the first viewport carries the masthead, the slug entry, the newest rows, and the tab bar together. Desktop is deliberately compact: the same column, capped at 1280px, with type that stops growing at the approved comp's 1024px sizes, so more of the rundown shows above the fold instead of a phone layout blown up.

The world refuses the category default for data catalogs: card grids with rounded tag chips and dashboards of charts. It also refuses shadows, corner radii, gradients, and cards. Hierarchy is carried by rule weight, type voice, and banding alone.

**Key Characteristics:**
- White rundown paper, ink text, ink rules; one hand-drawn red.
- Bold condensed newsroom capitals for codes, headings, labels, buttons, and tabs over a plain sans for the data itself.
- Permanent codes and dates in lining tabular figures, aligned down the column.
- Two rule weights: a 2px ink rule opens a block, a 1px hairline divides inside it.
- Flat, square-cornered, ruled buttons. No shadows, radii, gradients, or cards.
- One motion: the grease-pencil circle draws itself on.

## Colors

Monochrome ink on white paper, with one hand-drawn red that never enters the stylesheet as a fill.

### Primary
- **Grease-Pencil Red** (#d7261e): the ink of the four raster grease-pencil plates and nothing else. The circle with "new" marks a date updated since the reader's last visit; the tick marks a family opened before; the arrow at the code plus the swash under the title mark the row open right now. A fourth meaning from the direction contract, a circled number for saved, is reserved for the Saved phase and has no plate yet. The token records the plates' ink so they can be redrawn in the same red; no CSS rule paints with it.

### Neutral
- **Rundown Paper** (#ffffff): the page ground, and the solid ground under anything pinned (the tab-bar dock, the sheet's download bar) so rows scroll cleanly beneath it. Also the selection text color.
- **Press Ink** (#111111): all primary text, every rule and hairline, ruled-button borders, the active tab's bar, filled place-by-year cells, the focus outline, the caret, and the selection background.
- **Rundown Band** (#ededea): the alternate-row band on the rundown, the search results, and the sheet's live-preview table; the guide lines of the sheet's strip chart. Never a panel or card ground.
- **Graphite** (#5c5c5c): secondary text only. The catalog line, the slug placeholder, inactive and coming-soon tabs, sheet sublines and "updated" dates, the credit line, and unavailable grid cells. It holds 6.7:1 on paper and 5.7:1 on the band (WCAG AA).

### Named Rules
**The Grease Pencil Rule.** Red exists only as hand-drawn raster plates with a fixed meaning each; it is never a text color, border, fill, hover, focus ring, or vector icon.

**The Ink-and-Paper Rule.** Everything structural and interactive is ink on white: text, rules, buttons, the active tab, filled cells, focus. Gray is for banding, chart guides, and secondary text, never for rules or borders.

## Typography

**Display Font:** Saira, variable, at its 50% width (with Saira Extra Condensed, Arial Narrow)
**Body Font:** Vazirmatn (with Helvetica Neue, Arial)
**Label/Mono Font:** Saira Extra Condensed (with Arial Narrow)

**Character:** Bold condensed newsroom capitals stamped over a plain, open sans. The capitals speak for the system, the sans speaks for the data, and the two never trade jobs. Karantina was tried during the build and removed; the pairing is settled.

### Hierarchy
- **Display** (Saira 900, width 50%, clamp(30px, 9.6vw, 98px), line-height 0.9, uppercase): the "Cream City Almanac" wordmark only, set on one line.
- **Headline** (Saira Extra Condensed 700, clamp(26px, 5.86vw, 60px), line-height 1): section titles such as UPDATED THIS SEASON, and the family name at the head of a dataset sheet.
- **Code** (Saira Extra Condensed 700, clamp(22px, 5.76vw, 59px), line-height 1, lining tabular figures): permanent row codes (V02, F02), the SLUG: label, and the code on a sheet header. On the compact results rows the code drops to clamp(18px, 3.5vw, 36px).
- **Title** (Saira Extra Condensed 700, clamp(17px, 3.4vw, 35px), line-height 1.05): family titles on search-result rows; the open row's title steps up to clamp(20px, 4.3vw, 44px).
- **Tab** (Saira Extra Condensed 700, clamp(16px, 3.9vw, 40px)): SEARCH / ASK / SAVED.
- **Masthead side** (Saira Extra Condensed 700, clamp(15px, 3.9vw, 40px), line-height 1.1, uppercase): TODAY'S RUNDOWN, or RUNDOWN with a result count, beside the wordmark.
- **Label** (Saira Extra Condensed 700, clamp(14px, 3.03vw, 31px)): column heads (CODE / SLUG / UPDATED), ruled buttons, sheet section headings, sheet download links.
- **Body** (Vazirmatn 400, clamp(16px, 2.93vw, 30px), line-height 1.3): row names and sublines, dates, the slug input, suggestion tags, explainers. Vazirmatn 500 sets the place-by-year grid and the column guide's field names; 700 marks the name of the open rundown row.
- **Body small** (Vazirmatn 400, clamp(14px, 2.54vw, 26px), line-height 1.3): the catalog line, search notices, grid cells, sheet sublines, glossary and preview tables.
- **Caption** (Vazirmatn 400, clamp(13px, 1.76vw, 18px)): the credit footer.

### Named Rules
**The Two Voices Rule.** Condensed capitals name things (codes, headings, labels, buttons, tabs); Vazirmatn carries the data (names, sublines, dates, explainers). A role never switches voice.

**The Tabular Figures Rule.** Codes, dates, years, and counts use tabular figures, and codes also lining figures, so every column of numbers aligns.

**The One Wordmark Rule.** Saira at 50% width and weight 900 is reserved for the wordmark. Nothing else uses the display face.

## Layout

One centered column, capped at 1280px, with a fluid side gutter (clamp(16px, 3.5vw, 36px)). Every size was measured from the approved comp at 1024px wide and expressed as a vw value with a phone floor and a cap at the comp's own 1024px value, so above 1024px the type and row heights stop growing and only the column widens to its cap.

The rundown is a three-column table: the code column (18%, at least 3.5ch), the slug column (the remainder), and a right column (20%, at least 6ch) for the updated date. Search results widen the right column to 30% (at least 9ch) so place sits over years on two short lines. A row opened in place drops a preview panel indented to the slug column, so the place-by-year grid and the one-line explainer sit directly under the row's title, with the action buttons below.

The masthead puts the wordmark left and the side label right, top-aligned, closed by a hairline. The suggestion tags split the width into three equal cells. Rundown rows hold a tall minimum (clamp(64px, 13.2vw, 135px)); result rows and tabs share the compact height (clamp(56px, 9.8vw, 100px)).

Pinned elements follow the device. On phones, and on any screen that is not wide landscape, the tab bar and credit line stay docked at the bottom of the home screen, as in the comp's first viewport. On wide landscape screens (1100px and up) the dock returns to the end of the page so it never covers the rundown. On a dataset sheet the download bar is the pinned element below 900px and sits in flow from 900px up; the sheet's tab bar is never pinned.

Vertical rhythm comes from the comp's measured paddings, not a stepped scale. Two fixed values recur: 12px between grouped actions, notices, and the back link, and a 44px floor on every touch target.

### Named Rules
**The Compact Desk Rule.** Desktop is the phone sheet given room, not a new layout: a 1280px column, type capped at the comp's 1024px sizes, and nothing pinned that would hide rows on a wide landscape screen.

## Elevation & Depth

The system is flat. There are no shadows anywhere, no tonal surfaces, and no layering beyond the pinned dock and download bar, which sit on solid paper over the rows they cover. Depth is replaced by rule weight: a 2px ink rule opens a block (section title, slug entry, sheet header, download bar, ruled buttons), and a 1px ink hairline divides inside it (masthead, catalog line, column heads, tag dividers, panels, tables, tab bar). The gray band separates alternate rows without any line at all.

### Named Rules
**The Ruled-Not-Raised Rule.** Nothing lifts off the page. Emphasis is a heavier rule, a heavier voice, or a red pencil mark, never a shadow; even the active tab is marked by a drawn 6px ink bar, not a glow or an underlay.

## Shapes

Corners are square everywhere (0px). Borders are full ink at one of the two rule weights; there are no tinted or partial-opacity borders. The only curves on the page are the hand-drawn grease-pencil plates, whose waxy, uneven stroke is the deliberate contrast to the ruled geometry. Vector marks are drawn, not typed: the arrow is a short 2px square-capped stroke in the current text color (mirrored for "back"), and an available place-year is a solid ink square (0.9em). An unavailable cell shows a graphite dash with a hidden text equivalent.

## Components

### Buttons
Ruled and flat, like a box drawn on the sheet with a marker.
- **Shape:** square corners (0px), a 2px ink rule border, no fill.
- **Ruled button:** label-voice capitals in ink, clamp(44px, 7.4vw, 76px) tall with clamp(14px, 4vw, 40px) side padding. Used for "Open sheet" (followed by the drawn arrow) and "CSV" in an opened row, grouped 12px apart.
- **Compact ruled button:** the same box at 44px tall with clamp(14px, 3vw, 28px) side padding, for the dataset sheet's download bar and the live preview's "Try again".
- **Hover / Focus:** no hover fill or color change. Focus is the system focus ring: a 3px ink outline offset 2px.

### Chips
- **Suggestion tags:** three plain-word searches in body type, divided by vertical hairlines with no other border, 44px tall. Hover underlines the word (0.18em offset). They disappear once a search is running.
- **Provenance tag:** a small boxed capital tag (HUB, DYCU, SOURCE, AI) at 0.8em of the surrounding text, in a 1px ink hairline box with 0.35em side padding, raised 0.1em. It follows every sourced or AI-written fact and carries its full meaning as a title.

### Cards / Containers
There are none. An opened row's preview is an indented region closed by a hairline, on the row's own ground. Dataset sheet sections are ruled blocks separated by hairlines, each led by a label-voice capital heading.

### Inputs / Fields
- **Slug entry:** the SLUG: label in code-voice capitals, then a borderless, transparent input on the same baseline, in body type, 44px minimum height, with a graphite placeholder ("What are you reporting on?") and an ink caret. The line is closed below by the 2px rule.
- **Focus:** the system focus ring (3px ink outline, 2px offset).

### Navigation
- **Tab bar:** three equal cells between two hairlines, tab-voice capitals, compact row height. Inactive and coming-soon tabs are graphite; the active tab is ink with a 6px ink bar drawn across its cell near the bottom edge (inset clamp(4px, 1.7vw, 17px)). ASK and SAVED are non-link placeholders titled "Coming soon" until their phases ship.
- **Back link (sheet):** the mirrored drawn arrow and "Rundown" in small body type, above a hairline.
- **Credit footer:** centered caption-size graphite link, "Built on Data You Can Use's public data", padded for the safe-area inset on phones.

### Rundown Row (signature)
The heart of the system: one dataset family per row, coded like an item on a show rundown.
- **Columns:** the code in code-voice capitals with lining tabular figures, lifted 0.19em so its cap top lines up with the slug's first line; the slug as the family name, a dash, and a subline whose segments ("29 neighborhoods", "2022–2024") never split across lines; and the updated date, right column, tabular.
- **Banding:** even rows take the band; there are no row dividers.
- **Marks:** circle-and-"new" around the date (updated since last visit), a tick after the right column (opened before). Opening a row adds the arrow plate before its code and the swash under its title, and sets the rundown title in Vazirmatn 700. Every plate is hidden from assistive tech and paired with visually hidden text that states its meaning.
- **Results variant:** compact row height, smaller code, the title in title-voice capitals, and place over years in the right column.
- **Loading:** empty ruled rows at full row height; no spinners or skeleton shimmer.

### Place-by-Year Grid
A hairline table of places down and years across, every cell at least 44px. A solid ink square means the year exists for that place; a graphite dash means it does not. Inside an opened row, a family with more than six places collapses to one summary line pointing to the full grid on the sheet.

### Masthead
The wordmark left, the side label right in masthead-side capitals, with today's date beneath it or the result count beside it in body type; closed by a hairline.

### Grease-Pencil Plates (signature)
Four transparent raster PNGs of red grease-pencil ink (circle-with-"new", tick, arrow, underline swash), trimmed to their ink and sized in em so they track the text they mark. Originals and their generation provenance live with the source assets; the shipped copies are served as static plates.
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
- **Do** cap the column at 1280px and let type stop at the comp's 1024px sizes on desktop.

### Don't:
- **Don't** use red for anything a stylesheet draws: text, borders, fills, hover, focus, or vector icons. Red is raster grease pencil only.
- **Don't** add shadows, corner radii, gradients, or cards.
- **Don't** present datasets as card grids with rounded tag chips or as dashboards of charts; a family is a ruled row or a ruled sheet.
- **Don't** animate anything besides the pencil circle drawing on.
- **Don't** pin the tab bar on wide landscape screens, or pin both the tab bar and the download bar on a sheet.
- **Don't** use Unicode glyphs in place of drawn icons.
- **Don't** use the display face for anything but the wordmark.
