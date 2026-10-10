# Handoff: Neighborhood translator (2026-10-10)

Merged to `main` locally (fast-forward, 22 commits ending `f0e642c`); production backend deployed and imported by Tarik before the push. Spec `docs/superpowers/specs/2026-10-10-neighborhood-translator-design.md`; plan `docs/superpowers/plans/2026-10-10-neighborhood-translator.md`; decision `docs/decisions/024-neighborhood-translator.md` ("What actually happened" is Tarik's); suggested learning entries in `docs/LEARNING-LOG.md`.

## What shipped

- Weekly build stores the City's 190 official neighborhood boundaries and DYCU's 27 neighborhoods as census-tract lists (`neighborhoods` table; refreshed in `finish`; a City outage keeps last week's).
- City profiles record latitude/longitude columns when 90% of a 50-point sample lands in Milwaukee: NIBRS crime, MFD calls for service, Fire Incident Detail, Libraries.
- Ask's `countRecords` takes `neighborhood`: the City returns matching records' coordinates inside the boundary's rectangle (guarded `CASE … ::float`), the server keeps those inside the exact shape, counts only. Unmatched names → `no-neighborhood` with the nearest three; unclear → `choose`; no locations → `no-locations`; City row limit or `records_truncated` → `too-broad`.
- Cards: "In Harambee (City of Milwaukee boundary)", "N matching records citywide have no location and aren't included.", and on DYCU numbers "Harambee as DYCU defines it: census tracts …".
- Final-review fix: MFD calls for service now count by period (`IncidentStarted`) and by `IncidentType`; event timestamps no longer take category slots (only MFD's profile changed across 68).

## Lessons from the real data

- The City accepts `~`, `CASE` and `::float`; coordinates are text, so negative longitudes must be compared as numbers.
- DYCU tract sentences include decimal tracts (3.03), one without the word "neighborhood", and renamed neighborhoods (Layton Boulevard, Westside, Little Menomonee River) — mapped by identical tract lists.
- `npm run ask:card -- --only=` is 1-based.
- Fire Incident Detail ends in 2021; for current fire/EMS questions use MFD calls for service (data lags about a month).

## Deferred small items (from the build ledger)

- Geometry: no concave-shape `inShape` test beyond one triangle; a reversed rectangle isn't rejected (callers use real shapes).
- Names: an empty `matchKey` would match every question; very short questions give noisy choices; choices aren't sorted by closeness; "St.Joseph" without a space normalizes oddly; City names print as "Mcgovern Park", "Town Of Lake"; no server-side length cap on `neighborhood`.
- Boundaries: one malformed feature aborts the whole City parse (last week's kept); duplicate place keys collapse; `ALIASES` lookup on a plain object; no guard against a boundary layer that shrinks; a database error is reported as "City neighborhoods unavailable".
- Profiles: a numeric-typed coordinate column would make the sample/guard SQL throw (all four located datasets are text today; it fails contained); a transient sample failure removes a dataset's locations until the next good build; a future category column named like "…_Closed" would be excluded.
- Counting: a whitespace-only `neighborhood` counts citywide (treated as no neighborhood); a boundary with a rectangle but no shape answers "unavailable" via an exception; between a production deploy and the next import, neighborhood questions say "The City's data didn't respond".
- Cards: a `choose` (including a neighborhood choice) shows no card if the model doesn't follow up; `getNumber` falls back to the newest tract list when a table's year has none (doesn't happen today: 2021–2024 all match).
- Tests: fake-model thefts/robberies blocks duplicate parsing; the robberies branch has no offline unit test.
- Cost: City feeds that refresh daily re-trigger AI explainers on every build (≈ $0.2–0.3 a run).

## Next

Map (OpenStreetMap basemap, MapLibre) and ArcGIS layers as live data — own spec; the `neighborhoods` table's boundaries are ready to draw. Then "Ask analyzes" (trends, tract roll-ups).
