# Cream City Almanac: Neighborhood Translator (Phase 4c) — Design

Approved in conversation 2026-10-10 (Tarik): the first job is neighborhood numbers in Ask (map later); when a name
exists in both DYCU's list and the City's, use the definition that matches the data; approach A (narrow at the City by
a rectangle, exact boundary check on our side); v1 scope (City point records by the City's 190 neighborhoods, DYCU's
28 neighborhoods stored as tract lists); Design Parts 1 (storage), 2 (Ask flow) and 3 (failures, privacy, testing,
rollout). Follows decision 023 (City data) and the layered translator Tarik described 2026-10-09.

## 1. Why

Reporters ask about neighborhoods ("robberies in Harambee this year"), but the City's crime, fire and EMS records carry
coordinates, not neighborhood names, and Ask can only count by the columns a dataset has (police district, ward). DYCU
defines its 28 neighborhoods as lists of census tracts, which nobody can see today. This phase gives the almanac a
shared answer to "which neighborhood is this in?" and lets Ask count City records by neighborhood, saying on every card
which definition it used.

## 2. Verified facts (2026-10-10)

- The City's official neighborhoods: ArcGIS layer `planning/special_districts/MapServer/4`, field `NEIGHBORHD`,
  190 features, names unique, upper case ("HARAMBEE", "BAY VIEW"), Polygon and MultiPolygon. `f=geojson&outSR=4326`
  returns the whole layer in latitude/longitude, 478 KB.
- City datasets with latitude/longitude columns (text): NIBRS Crime Data (`Address_Latitude`, `Address_Longitude`,
  110,461 rows), MFD Calls for Service Detail (`latitude`, `longitude`, 350,530), Fire Incident Detail (`Latitude`,
  `Longitude`, 101,748), Libraries (13). City Property Mailing List uses State Plane `X`/`Y` in feet and is out of scope.
- The City's SQL endpoint accepts `"col"::float` and numeric `BETWEEN`. Text comparison of negative longitudes is wrong
  (`'-87.95' > '-87.93'`), so rectangles must cast. Robberies (`120`) since 2026-01-01 inside a test rectangle returned
  57 rows with coordinates in one query.
- NIBRS has 764 records (0.7%) with no latitude (NULL); every non-null value matches `^-?[0-9]+(\.[0-9]+)?$`
  (109,697). The endpoint accepts `~` and `CASE`; the guarded cast
  `(CASE WHEN "col" ~ '^-?[0-9]+(\.[0-9]+)?$' THEN "col"::float END) BETWEEN …` returns the same 7,589 as the plain
  cast on a test rectangle.
- The endpoint returns at most **32,000 rows** per query (a `LIMIT 50000` returned 32,000).
- DYCU's reports state each definition as "Census tracts 71, 72, 79, 80 and 107 were used to define the Riverwest
  neighborhood for the purposes of this report", with line breaks inside names. Normalizing whitespace finds 25 of 28
  neighborhoods (110 tracts); the 3 missing are expected to be the combined names (e.g. "Burnham Park, Layton Park and
  Silver City"), whose definition changed across years. The 28 names in the neighborhood spreadsheets are the check.

## 3. Scope

In: a `neighborhoods` table (City boundaries + DYCU tract lists), refreshed by the Monday import; latitude/longitude
columns in City profiles; a `neighborhood` filter on `countRecords`; a definition line on the count card and on
DYCU portrait answers in Ask.

Out (each its own spec later): the map (OpenStreetMap basemap, MapLibre); ArcGIS layers as live data; rolling DYCU
tract-level data (food insecurity, poverty) up to neighborhoods ("Ask analyzes"); re-weighting DYCU tracts onto City
neighborhoods by census-block population; State Plane X/Y datasets.

## 4. Storage (Part 1)

### 4.1 The `neighborhoods` table

One row per neighborhood per definition:

| Field | City (190) | DYCU (28) |
|---|---|---|
| `definition` | `"city"` | `"dycu"` |
| `name` | title case for display ("Bay View") | DYCU's spelling ("Walker's Point") |
| `matchKey` | normalized name (see 5.2) | normalized name |
| `geometry` | GeoJSON Polygon/MultiPolygon, stored as a JSON string | — |
| `bbox` | `{ minLat, maxLat, minLon, maxLon }` | — |
| `tracts` | — | `[{ years: number[], tracts: string[] }]` (a new entry only when the list changed) |

Indexes: `by_definition_matchKey`.

### 4.2 Monday import

A new build step, after the City catalog step:

1. Fetch the City layer as GeoJSON (30 s timeout, existing retry helper). For each feature, compute the bbox and
   store the row. A feature with no geometry or an unreadable ring is skipped and named in the build notes.
2. Parse DYCU definitions from `docChunks` with whitespace normalized; accept a comma list of names. Group by
   neighborhood and report year. Check names against the 28 neighborhood-spreadsheet places (`placeKey`); a parsed
   name with no spreadsheet match, or a spreadsheet place with no parsed definition, goes in the build notes and is
   not stored.
3. Replace each definition's rows only when its fetch/parse succeeded. If the City layer is down, last week's City rows
   stay and the notes say so (same rule as City families).

### 4.3 Point in shape

`convex/lib/geo.ts`: `inBbox(point, bbox)` and `inShape(point, geometry)` by ray casting, even-odd across all rings, so
holes and multi-part shapes work. No new dependency.

## 5. Counting by neighborhood (Part 2)

### 5.1 Profiles learn point columns

`profileCity` records `latColumn` and `lonColumn` when a dataset has a column named like latitude (`lat`, `latitude`,
`*_latitude`) and one like longitude (`lon`, `long`, `longitude`, `*_longitude`), and a sample of up to 50 non-null
values falls inside Milwaukee's rough box (lat 42.8–43.3, lon −88.1 to −87.8). Otherwise both are null. Profiles that
name people (`namesPeople`) still get point columns: coordinates are never returned (5.4).

### 5.2 Matching the name

`countRecords` gains `neighborhood?: string`. The server normalizes it (lower case, `&` → `and`, `st.`/`st` → `saint`,
apostrophes and punctuation removed, spaces collapsed) and looks it up among `definition: "city"` rows:

- one exact `matchKey`: use it;
- none exact but one or more containing the input, or within edit distance 2: return status `choose` with up to
  5 names (the tool's existing pattern);
- nothing: status `no-neighborhood` with the 3 nearest names. Never a count.

If the dataset's profile has no point columns: status `no-locations` ("This dataset doesn't record locations, so it
can't be counted by neighborhood"). If the table has no City rows yet: status `unavailable`.

### 5.3 The query

The SQL builder (`convex/lib/citySql.ts`) adds, to the existing filters,
a guarded rectangle, `(CASE WHEN "lat" ~ '^-?[0-9]+(\.[0-9]+)?$' THEN "lat"::float END) BETWEEN :minLat AND :maxLat`
and the same for longitude (Postgres doesn't promise to check before it casts, so the check sits inside the CASE), and
selects the same guarded expressions `AS lat`, `AS lon` plus the date column and any group-by column, with `LIMIT 32000`. A second,
cheap query counts the same filters where either column is NULL or not numeric, for the no-location note. The server keeps rows where
`inShape` is true, then counts and groups them exactly as the existing count does (multi-valued offense codes included).

- 32,000 rows returned: status `too-broad` ("Too many records in this area to count at once; try a shorter period").
  No partial number.
- A value that isn't a number (blank, text) never reaches the cast; it is counted in the no-location note.

### 5.4 Privacy

Coordinates are fetched by the server action, tested, and discarded. They are never returned to the browser, stored,
logged, or given to the model. The tool result keeps today's shape: counts, groups, filters in words, period, coverage,
date column, caveats. No minimum-count suppression in v1 (neighborhoods are large; the City offsets crime points).

### 5.5 Cards and Ask's instructions

- Count card: a line under the caption, *"In Harambee (City of Milwaukee boundary)"*, and, when present,
  *"764 records have no location and aren't included."*
- DYCU portrait answers in Ask: a line *"Harambee as DYCU defines it: census tracts …"* (the tract list for that
  report's year).
- Ask's instructions: City records by neighborhood go through `countRecords` with `neighborhood`; DYCU neighborhood
  measures stay with the portrait tables; never move a number between definitions.

## 6. Errors and edge cases

- City data down mid-question: existing "The City's data didn't respond".
- Boundaries never loaded: `unavailable`; loaded once then the layer is down: last week's.
- A point exactly on a boundary: ray casting assigns it to one side consistently; not disclosed (ties are rare at
  coordinate precision).
- A neighborhood made of several parts: MultiPolygon handled; bbox spans all parts.
- Period outside the data's coverage: existing `outside-coverage` behavior, checked before any neighborhood query.

## 7. Testing

- Unit: `inShape` (inside, outside, inside a hole, second part of a MultiPolygon, point on an edge); bbox; name
  matching (case, `St.`/Saint, apostrophe, unclear → choose, none → no-neighborhood); SQL text with rectangle and casts;
  `too-broad` at exactly 32,000 rows; no-location note; profile detection (NIBRS, MFD, Fire yes; Mailing List X/Y no;
  a lat column with values outside Milwaukee no); DYCU parsing (line breaks, comma names, changed definitions,
  mismatches reported).
- Live smoke (free, read-only): add the guarded rectangle + offense + date shape and the no-location count to
  `scripts/city-sql-smoke.ts`.
- Report card (~$0.10): "How many robberies in Harambee this year?", "Fire calls in Riverwest by month this year", and
  a made-up neighborhood (must answer no-neighborhood, never a number).
- Browser: an Ask count card shows the "(City of Milwaukee boundary)" line.

## 8. Rollout

Same order as City data: Convex backend to production, then one production import (fills boundaries, re-profiles; no
AI explainers change, ≈ $0). Tarik runs both commands. Then push, PR, CI, merge on Tarik's word. Decision 024 (plain
English, "What actually happened" left for Tarik) and a DESIGN.md note for the card lines.

## 9. Open items for planning

- Confirm the 3 missing DYCU definitions' wording and parse them.
- Check `countRecords`' current grouping code reuses cleanly on fetched rows instead of SQL `GROUP BY`.
