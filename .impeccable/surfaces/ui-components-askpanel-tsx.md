---
version: 1
slug: "ui-components-askpanel-tsx"
primary_target: "ui/components/AskPanel.tsx"
related_targets: ["app/ask/page.tsx","ui/components/AskCards.tsx","ui/components/ask.module.css","ui/components/SearchHome.tsx"]
---

# Surface brief: Ask

- **Scope / mode:** The Ask chat (Phase 3b): laptop in the list column (39%) beside the sheet pane with the rail as its close control; phone at `/ask` with masthead and tab bar. Mode: Operate.
- **Audience and job:** Reporters, nonprofits and residents with a question, not a keyword. They type it and get the real table row, dataset or report passage with its source; the AI never types a figure.
- **Proof / content:** Live data only: the stored N03 table row (estimate ± margin, DYCU tag, Census table), V02's live chart, report passages quoted with report and section. Signed-out shows "Sign in to ask"; "N of 30 questions left today"; "Don't paste private source info".
- **Approved comps:** laptop `.impeccable/mocks/ask-laptop.webp` (margin notes, Tarik 2026-10-08, from the surface round), phone `.impeccable/mocks/ask-a-phone.webp` (table excerpt inline, Tarik 2026-10-08). Both comps invent masthead details (laptop: none; phone: an extra top-right link); the build keeps the real mastheads. The phone comp's 'Open the full table' stays.
- **Unresolved:** where search results and report passages sit (rulings: inside the note as compact ruled rows / quotes).

## Direction contract

THESIS: The AI annotates the almanac rather than talking over it: short numbered notes in the margin, each pointing with an ink leader at the real sheet or row it opened; it refuses the chat-bubble transcript with answers boxed in the conversation.

OWN-WORLD: The Rundown (DESIGN.md): white paper, ink, gray band, condensed capitals for codes and numerals, plain sans notes, hairlines and the 2px rule, boxed provenance tags; leaders and the row outline in ink, never red (red stays DYCU's teaching voice).

STORY: Ask a question → a gray band holds it → a numbered note says where the answer is → an ink leader runs into the pane and the exact row is outlined → Open keeps the address shareable.

FIRST VIEWPORT: Laptop: as ask-laptop (notes column left, N03 Harambee poverty table open in the pane with "Under 5 years" outlined, leader from note 2, input pinned at the column foot). Phone: as ask-a-phone (notes, inline table excerpt under note 2 with the row outlined, input above the tab bar).

FORM: Margin notes, candidate 6 of my seven ranked structures; surface seed key 80625b67 (dealt 3, 1, 6; Tarik locked 6).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
