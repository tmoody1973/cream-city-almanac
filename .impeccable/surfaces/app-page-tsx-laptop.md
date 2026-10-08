---
version: 1
slug: "app-page-tsx-laptop"
primary_target: "app/page.tsx"
related_targets: ["app/d/[code]/page.tsx", "ui/components/SearchHome.tsx", "ui/components/SheetPane.tsx"]
---

# Surface brief: Laptop two-pane (home, results, sheets at ≥1100px landscape)

- **Scope / mode:** Laptop composition of the search home, results and dataset sheets. Mode: Operate. Phones unchanged.
- **Audience and job:** A reporter on a laptop searches, scans coded rows on the left, and reads the selected dataset's full sheet on the right without leaving the page.
- **Proof / content:** Live catalog only. The pane shows the real sheet (full explainer, all columns), so it runs longer than the comp's invented two-column dataset.
- **Constraints:** WCAG 2.2 AA; selection in the address (`?q=…&open=CODE`), Back/refresh restore it; `/d/CODE` on a laptop opens the two-pane view; red only as grease pencil.
- **Approved comps:** `.impeccable/mocks/laptop-b.webp` (Tarik chose B: newest item auto-opened) over `laptop-a.webp` (summary pane).
- **Unresolved:** the Ask chat (Phase 3) docks in the reserved right rail.

## Direction contract

THESIS: The rundown sheet spread across a desk: the list stays in view while the chosen item is read beside it. Refuses master–detail card UIs and modal drawers.

OWN-WORLD: Inherits DESIGN.md's Rundown world unchanged (white rundown paper, condensed newsroom capitals, thin black rules, gray banding, red only as grease pencil).

STORY: Arrive → the newest item is already open on the right; type a slug → the top result opens; click a row → its sheet replaces the pane, the row gets the grease-pencil arrow and swash; Back returns to the previous choice.

FIRST VIEWPORT: As laptop-b: wordmark left, SEARCH / ASK / SAVED tabs and HOW IT WORKS in the masthead; left: catalog line, one-line band, boxed SLUG and tags, UPDATED THIS SEASON rows; right: big code | name header, place-by-year grid beside WHAT IT MEASURES, column guide, live preview; a thin ASK "coming soon" rail.

FORM: Inherits the rundown sheet (seed key b5397139, Phase 2 roll); layout B chosen at comp review on 2026-10-07.

FINISH: hero and responsive gates forced with Tarik's explicit OK ("Accept it", 2026-10-07): the gap is real content length, not layout. Unreviewed and undocumented is unfinished.
