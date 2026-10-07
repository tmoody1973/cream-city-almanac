---
version: 1
slug: "app-page-tsx"
primary_target: "app/page.tsx"
related_targets: []
---

# Surface brief: Search home (app/page.tsx)

- **Scope / mode:** Phone-first search home and results for Cream City Almanac. Mode: Operate.
- **Audience and job:** A Radio Milwaukee reporter on deadline finds the right DYCU dataset family, understands what it measures, and downloads it in under 60 seconds.
- **Proof / content:** Live catalog only (46 families, 180 reports): permanent codes, real places and years, Hub "last updated" dates, provenance tags. No invented data.
- **Constraints:** WCAG 2.2 AA; unofficial (credit line, no DYCU branding); red is reserved for grease-pencil marks.
- **Approved comps:** first viewport `.impeccable/mocks/home-b.webp` (approved); results state `.impeccable/mocks/home-c.webp`. Comp A (`home-a.webp`) is the direction's decision comp, kept as reference.
- **Unresolved:** dataset sheet page composition (inherits this world; no comp yet); Ask and Saved tabs are later phases.

## Direction contract

THESIS: Milwaukee's public data as the day's show rundown: every dataset family a slugged row with a permanent code. Refuses the category default of card grids with tag chips and dashboards of charts.

OWN-WORLD: White rundown paper; bold condensed newsroom capitals over a plain sans body; thin black rules; light gray #EDEDEA alternate banding; tabular figures for codes and years; red #D7261E only as hand-drawn grease-pencil marks (circle = updated, tick = opened, number = saved). Flat ruled buttons. No shadows, radii, gradients, or cards.

STORY: The reporter sees what DYCU just updated, types a slug in plain words, scans coded rows, taps one open in place to see which places and years exist and what it measures, then downloads the CSV or opens the full sheet.

FIRST VIEWPORT: As home-b: masthead wordmark left, TODAY'S RUNDOWN and date right; catalog-as-of line; SLUG entry line with three suggestion tags; UPDATED THIS SEASON table (CODE | SLUG | UPDATED), newest row's date circled in red; SEARCH / ASK / SAVED tab bar; credit footer. Results follow home-c: a tapped row expands in place to a place-by-year grid, a one-line explainer tagged AI, and Open sheet / CSV buttons.

FORM: Radio newsroom rundown sheet (Impeccable's pick, position 1 of the grounded list), seed key b5397139, kind pick.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
