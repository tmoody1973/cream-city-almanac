# Cream City Almanac: City Neighborhood Names per Tract — Design

Approved in conversation 2026-10-11 (Tarik), section by section. This is Project B of four (A → B → C → D):
- A, follow-up buttons: live (PR #24).
- **B, City neighborhood names per tract**, and every DYCU area a tract belongs to (this spec).
- C, export and share.
- D, the neighborhood fact sheet.

## 1. Why
- **Unrecognizable names.** A tract row names only a DYCU report area ("United Community"), which is not a City neighborhood. A reader can't match it to a place they know.
- **Hidden names.** DYCU's 27 report areas cover 114 tracts, and 18 of those tracts are in more than one area. The card shows only the first match: tract 1860 shows "Harambee" and hides Hillside and Lindsay Heights.
- **Most tracts are unnamed.** Every tract outside DYCU's 114 shows "—", even inside the City.

## 2. Decisions (Tarik, 2026-10-11)
- **Two columns, biggest first.**
  - "Neighborhood": the City neighborhood covering most of the tract, with "+N" opening the rest.
  - "DYCU area": every DYCU area that lists the tract.
- **Names only.** Asking or filtering by City neighborhood ("poverty in Bay View's tracts") is a later project.
- **Weekly point counting.** The match is recomputed in the weekly data refresh by sampling points, with no new library.

## 3. What the reader sees
**Every tract table:** rankings, ties, too-uncertain rows, change, go-together and mismatch.

| Tract | Neighborhood | DYCU area | (measure) |
|---|---|---|---|
| 1860 | Hillside **+2** | Harambee, Hillside, Lindsay Heights | … |
| 45 | Arlington Heights **+1** | Harambee, United Community | … |
| 601 | — | — | … |

- **Neighborhood** shows the City neighborhood covering the largest share of the tract.
  - "+N" is a native disclosure (`<details>`/`<summary>`), opened by click or keyboard. It lists every kept neighborhood with its share: "Hillside 51% · Halyard Park 27% · Triangle North 13%".
  - Neighborhoods covering less than 10% of the tract are left out.
  - "—" means the tract is outside the City, or only slivers of it are inside.
- **DYCU area** lists every DYCU area whose definition for that year includes the tract, comma-separated, in DYCU's order. "—" means none.
- **Footer note** under each table: "Neighborhood: the City's official neighborhoods covering at least 10% of the tract, biggest first. DYCU area: the areas DYCU's reports group the tract into." It is followed by the existing "How neighborhoods work" link.
- **Scatter dot labels:** "Tract 1860 (mostly Hillside; DYCU: Harambee, Hillside, Lindsay Heights)". Either part is omitted when it is empty.
- **"Mostly" vs "partly":** "mostly X" only when X covers at least 50% of the tract; otherwise "partly X" (tract 1.01 is 42% Northridge, so "partly Northridge").
- **/how-it-works#neighborhoods** gains a plain-English section on how a tract gets its City neighborhoods: shapes matched weekly, the 10% rule, biggest first, "—" outside the City.
- **Ask's words:** one prompt rule. When Ask names a tract's place, it uses the first City neighborhood with the same "mostly"/"partly" rule, and it never calls a DYCU area a City neighborhood. Ask's tools are otherwise unchanged.
- **Phones:** the tables scroll sideways inside their card. At 390px the page itself never scrolls sideways.

## 4. How it's built
**Weekly, at the end of `refreshNeighborhoods` (`convex/build.ts`), after the City shapes are replaced:**
1. **Download the tract outlines.**
   - They come from DYCU's map server, at the `featureServerUrl` of E02's newest County member. That is the same lookup `convex/city.ts` uses for count-card tract maps; the address is not hard-coded.
   - One request: `where=1=1&outFields=GEOID&outSR=4326&f=geojson`. It returned 301 features (215 KB) on 2026-10-11.
2. **Match each tract.** A new pure function `cityShares(tract: Geometry, hoods: { name; geometry; bbox }[]): { name: string; share: number }[]` in `convex/lib/tractPlaces.ts`:
   - Lay a 40×40 grid of points over the tract's bounding box and keep the points inside the tract.
   - If fewer than 200 points are inside, double the grid (80, then 160) until there are at least 200 or the grid reaches 160×160.
   - For each point, find the first City neighborhood whose box and shape contain it.
   - A neighborhood's share is its points ÷ the tract's points, rounded to a whole percent.
   - Keep shares ≥ 10%, sorted biggest first; ties sort by name.
   - A tract with no points inside returns `[]`.
   - It reuses `bboxOf`, `inBbox` and `inShape` from `convex/lib/geo.ts`.
3. **Store the result** in a new table `tractNeighborhoods`: `{ geoid: string; city: { name: string; share: number }[] }`, indexed `by_geoid`. Tracts whose list is empty are not stored.
4. **Replace the table only when both the City shapes and the tract outlines were read in this run.** Otherwise last week's match stays, and the build notes say why ("Tract neighborhoods unavailable, kept last week's: …"). A run that matches no tracts at all counts as a failure.

**When a tract card is answered (`convex/tracts.ts`):**
- The match is loaded once per answer, as a `Map<geoid, city[]>`.
- `TractRow`, `ChangeRow` and the scatter's `Point` replace `neighborhood: string | null` with:
  - `city: { name: string; share: number }[]`, biggest first, possibly empty;
  - `dycu: string[]`, every DYCU area for that year, possibly empty.
- `neighborhoodFor` in `convex/lib/tractNames.ts` becomes `neighborhoodsFor`, which returns every match in definition order. Its year rule is unchanged: the figure's year, or the newest defined year for the City's current file.
- Ask receives the same fields. The existing check marks any name in Ask's words that is not in the tool results "unverified".

**UI (`ui/components/TractCards.tsx`, `ui/components/TractScatter.tsx`):**
- One small `Names` cell component renders the first neighborhood, plus the `<details>` list when there are more than one.
- The "DYCU area" cell joins `dycu` with ", ".

## 5. Edge cases
- **A tract number from an older census map** (2010 tracts) that is not on the 2020 map: Neighborhood shows "—", never a guess. The plan first lists which DYCU years use 2010 tracts and how many rows that affects.
- **Thin or tiny tracts:** the grid gets finer, as in §4.2. A tract with no points inside shows "—".
- **Holes and multi-part shapes** (lakefront, islands): handled by `inShape`, and pinned by a test.
- **Shares that don't add to 100%** (water, rail yards, land in no neighborhood): shown as they are.
- **The City redraws a boundary:** picked up at the next weekly build.
- **No match stored yet** (a preview before the dev build, or production before its first build after merge): "—" in Neighborhood everywhere, with no error.

## 6. Testing
- **Unit, `cityShares`:** synthetic squares.
  - Half and half gives 50/50.
  - A 9% piece is dropped and a 10% piece is kept.
  - A tract with a hole.
  - A tract fully outside gives `[]`.
  - A thin tract triggers the finer grid.
  - Equal shares sort by name.
- **Unit, `neighborhoodsFor`:** tract 1860 in 2023 returns Harambee, Hillside and Lindsay Heights, in definition order. A tract in no area returns `[]`.
- **Unit, the build rule:**
  - replaced when both downloads work;
  - kept, with a note, when either fails;
  - kept, with a note, when zero tracts match.
- **Unit, card text:**
  - the footer note;
  - the `<details>` list with shares;
  - "—" for empty;
  - scatter labels with either part empty;
  - "mostly" at 50% and "partly" at 49%.
- **Browser, on the PR preview** (signed in, scripted model):
  - a ranking card shows "Neighborhood" and "DYCU area" headers;
  - "+N" opens the share list by click and by keyboard (Enter);
  - at 390px the page's scroll width equals its viewport.
- **Real-data check after the dev build:**
  - 1860 lists Hillside first;
  - about 210 tracts are stored (237 overlapping minus 27 slivers-only, from the 2026-10-11 test);
  - the build notes show no tract-neighborhood failure.

## 7. Records and rollout
- **Decision 031:** weekly point counting, versus an exact geometry library, versus a committed file; plus the 10% rule. "What actually happened" is left blank for Tarik.
- **DESIGN.md:** a "Tract names" item.
- **/how-it-works#neighborhoods:** the section in §3.
- **Rollout:**
  - The schema gains one table, so the development database needs one push (with Tarik's OK), then one build run on dev so preview cards have names.
  - Production gets the table on merge (the Vercel build deploys Convex), and fills it at its next weekly build, or sooner if Tarik runs the build.

## 8. Out of scope
- Asking or filtering by City neighborhood.
- Names for suburban tracts.
- Outlines for older census maps.
- Showing shares anywhere except the "+N" list.
