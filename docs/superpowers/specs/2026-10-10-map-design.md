# Cream City Almanac: The Map (Phase 4d) — Design

Approved in conversation 2026-10-10 (Tarik): one map component used on Ask's count card and on dataset sheets;
incidents shown as shaded quarter-mile areas, never dots; small counts as a "1–4" band; OpenFreeMap streets; legend
v3 (three patterned bands, body-size legend, written summary); server-built incident cells and browser-fetched City
map layers; sheet maps with filters, open to everyone with a 10-minute cache and a site-wide limit; Design Parts 1–4.
Mockups (throwaway, real data) in `.superpowers/brainstorm/` (map-cells, map-placement, map-legend-v2/v3).

## 1. Why

Tarik asked how to present the City's ArcGIS map layers, and a count like "26 robberies in Harambee" is easier to trust
when you can see where they fall. The neighborhood boundaries are already stored (Phase 4c). This phase draws them,
the City's map layers, and incident patterns, without ever pointing at an address.

## 2. Verified facts (2026-10-10)

- NIBRS publishes exact street addresses and precise coordinates (e.g. "2211 N NEWHALL ST", 43.05968…, -87.89092…).
  The "crimes not shown at exact location" note belongs to the retired WIBR Monthly dataset, not NIBRS.
- Real Harambee counts since Jan 1, 2026 (City SQL + the City's map server for inside/outside): 26 robberies in 13
  quarter-mile cells, busiest 4 (so "hide under 5" would show nothing); 749 crimes in 30 cells, 24 with 5 or more,
  busiest 71.
- The City's SQL accepts grid aggregation:
  `SELECT floor(<guarded lat> / 0.0036) AS i, floor(<guarded lon> / 0.0049) AS j, COUNT(*) AS n … GROUP BY i, j`
  — 34,857 crime records (12 months, citywide) came back as 1,431 cells in one query.
- The City's ArcGIS server sends `Access-Control-Allow-Origin: *` (browser fetches allowed). 43 City datasets carry
  Esri layers (77 layers; 62 answer queries; WIBR Monthly's 10 do not). Max 2,000 features per request.
- OpenFreeMap styles `https://tiles.openfreemap.org/styles/positron` and `…/styles/dark` respond; MapLibre 4 draws
  them (verified in the mockups). Four simultaneous maps on one page broke WebGL in the mockup; two drew fine.

## 3. Scope

In: `CityMap` component; incident cells on Ask's count card; a WHERE section on City dataset sheets (incident map with
filters for the 4 located datasets; City map layers for the 43 layer datasets); a `mapCells` action with a 10-minute
cache and a site-wide limit; a public neighborhood-shape query.

Out: Ask counting from City map layers; a standalone /map page; DYCU tract roll-ups; drawing individual incidents.

## 4. The map component (Part 1)

`ui/components/CityMap.tsx`, client-only, loaded on demand (`next/dynamic`, no server render) so pages without a map
don't carry MapLibre. New dependency: `maplibre-gl`.

- Basemap: OpenFreeMap positron (day) / dark (night edition), following the site's theme.
- Layers, bottom to top: incident cells (bands below), City map layer (areas as ink outlines, routes as ink lines,
  places as small ink dots), neighborhood boundary (grease-pencil red, 3px; `--pencil` per theme).
- Bands, by pattern not faintness: 1–4 diagonal hatching in full ink; 5–19 cross-hatching; 20 or more solid ink at
  0.7 opacity. Pattern tiles tuned so cross-hatching reads evenly in both editions.
- Under the map: the legend as a `<ul>` at body size in full ink (swatch + words: "1–4 in an area", "5–19",
  "20 or more", "<Name> (City boundary)"); the summary sentence, e.g. "26 robberies in 13 quarter-mile areas; 0 had 5
  or more (busiest: 4)."; "Areas are quarter-mile squares, never addresses."; OpenStreetMap credit as a compact ⓘ.
- The map element has `role="img"` and an `aria-label` equal to the summary. It pans and zooms but never traps the
  keyboard; on touch, one finger scrolls the page and two fingers move the map (MapLibre cooperative gestures).
- Hover/tap on a 5+ cell shows its count; a 1–4 cell shows "1–4".

### Cell data (server → browser)

`{ size: { dLat: 0.0036, dLon: 0.0049 }, cells: [{ i, j, band, n? }], summary: { total, areas, fivePlus, busiest },
area: string | null }` — `n` only when ≥ 5. Never coordinates or addresses. The browser turns `(i, j)` into squares.

### Boundaries

`api.neighborhoods.cityShape({ name })` (public query) returns a City neighborhood's GeoJSON from the `neighborhoods`
table (public City data). Sizes are small enough to send as stored: median 1 KB, largest Lake Park 43 KB.

## 5. Ask's count card (Part 2)

- `countRecords`' ok result gains `map` (the cell data above). Neighborhood counts bin the points already tested
  against the boundary (no extra City query). Citywide counts run one grid query with the same WHERE (filters, period).
  The count and its map always describe the same records.
- Grouped counts map the whole count; the summary adds "(all months)" or "(all types)".
- One live map at a time: the newest count card renders its map; older cards show "Show map"; opening one closes the
  other; folded "Earlier count" cards never render a map.
- Map inside the card (~260px) under the figure, phone and laptop alike.
- No map when the dataset has no point columns ("No map: this dataset doesn't record locations."); refusals render
  as today; tiles down → cells and boundary on plain paper with "Street map unavailable".

## 6. Dataset sheets: WHERE (Part 3)

### 6.1 Located datasets (NIBRS, MFD Calls for Service, Fire Incident Detail, Libraries)

- Filters: What (the profile's category values; "All" default), When ("Last 12 months" default, "This year", from/to),
  Where ("Whole city" default, or one of the 190 City neighborhoods with suggestions). Labeled form controls.
- The figure for the current filters, then the map, legend and summary. Filters live in the address
  (`?type=…&from=…&to=…&area=…`) so a map can be shared.
- `api.map.mapCells({ code, from?, to?, filters?, neighborhood? })` — the same logic as `countRecords` (same profile
  checks, same refusals, same `too-broad`), returning `{ status, count, map }`. Whole city → one grid query.
  Neighborhood → exact-points path.
- Open to everyone. A `mapCache` table holds results by a hash of the normalized arguments for 10 minutes; identical
  requests never reach the City. A site-wide token bucket `mapCity` (60 City queries per minute, capacity 20) protects
  the City's server; when empty: "The map is busy; try again in a minute." (cached answers still serve).

### 6.2 City map-layer datasets (43)

- A layer picker when a dataset has several (defaults to the first); layers that don't answer show "This City map
  layer isn't responding."
- The browser queries the layer for the visible area (`geometry=<view envelope>&inSR=4326&outSR=4326&f=geojson`),
  re-querying after pan/zoom (debounced). Over 2,000 features (`exceededTransferLimit`) → "Zoom in to see <layer>."
- Click/tap a shape: a small label with up to 6 of its non-system fields.

## 7. Errors, privacy, accessibility (Part 4)

- City data down → "The City's data didn't respond. Try again shortly." (boundary still draws).
- Coordinates and addresses never leave the server; 1–4 cells show no exact count; the grid is fixed at a quarter
  mile at every zoom. City map layers are about places and are drawn as published.
- Accessibility: summary is both visible text and the map's description; legend is a list at body size in full ink;
  bands differ by pattern; filters are labeled; axe check on a sheet with a map in both editions.

## 8. Testing

- Unit: grid indexing and banding (1–4, 5–19, 20+); `n` withheld under 5; cell output contains no coordinates; grid
  SQL text; cache hit/miss/expiry; site-wide limit; layer envelope query and the 2,000 rule; summary sentence.
- Live smoke (free): the grid query with filters and the guarded casts.
- Browser: a count card shows a map whose summary matches the count; only the newest card's map is live; sheet
  filters change the figure, the summary and the address; a City-layer sheet draws and shows "Zoom in" on parcels;
  axe in both editions.
- Report card: one question asserts the final count's `map.summary.total` equals its `count`.

## 9. Rollout

New `mapCache` table (additive). Tarik runs `npx convex deploy`; no import. Then PR, CI, merge on Tarik's word.
Decision 025 (shaded quarter-mile areas, never dots; small counts as a band; OpenFreeMap; public map with cache) and a
DESIGN.md "Map" section with the v3 legend.

## 10. Open items for planning

- Which field to label City-layer shapes by when a layer has no obvious name field.
