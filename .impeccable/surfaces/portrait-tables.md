---
version: 1
slug: "portrait-tables"
primary_target: "ui/components/PortraitTables.tsx"
related_targets: ["ui/components/SheetBody.tsx", "ui/components/sheet.module.css", "convex/lib/portrait.ts"]
---

# Surface brief: What's in each spreadsheet (N03 sheet section)

- **Scope / mode:** A section on the N03 "Neighborhood Portrait Spreadsheet" sheet (phone page and laptop pane). Mode: Operate.
- **Audience and job:** A reporter picks a neighborhood and year and reads any of its 16 Census topics as Estimate ± margin of error, without downloading the file, and sees where DYCU's file has problems.
- **Proof / content:** DYCU's numbers exactly as written (Estimate and MOE); problems stated plainly; Census table links; topic explanations are fixed text Tarik approved 2026-10-08. Mockup numbers below the first rows are invented and never product truth.
- **Approved comps:** laptop `.impeccable/mocks/portraits-b-laptop.webp`, phone `.impeccable/mocks/portraits-a-phone.webp` (Tarik, 2026-10-08). Heading comes before the topics in the build (the laptop comp drew the topic strip above it).

## Direction contract

THESIS: A census table read like the rest of the rundown: ruled, plain, exact, with the source's flaws written on the sheet instead of hidden.

OWN-WORLD: The Rundown (DESIGN.md): white paper, ink, gray band, condensed capitals for headings, plain sans with tabular figures for numbers, boxed tags, no shadows or radii; red only as a grease-pencil mark.

STORY: Pick neighborhood and year → topics appear (missing ones say so) → pick a topic → the problem note (if any), the caption "Place, Year: Topic", the table with grouped Estimate / ± Margin columns, the margin-of-error line.

FIRST VIEWPORT: Laptop: as portraits-b-laptop (pickers, wrapped topic buttons, full-width table). Phone: as portraits-a-phone (pickers, two-column ruled topic list, table scrolling sideways in its own box if wide).

FORM: Inherits the rundown sheet (seed key b5397139); section directions A/B dealt by hand at plan time; Tarik chose laptop B + phone A.

FINISH: Comp-led build with the hero gate on laptop, the phone compared by eye, the independent finish review, and DESIGN.md updated.
