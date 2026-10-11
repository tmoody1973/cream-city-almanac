# Cream City Almanac: Ask Analyzes — Design

Approved in conversation 2026-10-10 (Tarik), section by section: all four question types (mismatches, "do they go
together", rankings, change over time) in one spec and one build; Ask picks the column and the card always shows it;
answers at tract level, labeled with neighborhood names; numbers fetched live from DYCU and cached 10 minutes
(approach A); the honesty rules, cards and plumbing below. Mockups (throwaway):
`.superpowers/brainstorm/75320-1791668714/content/analyze-cards.html`.

## 1. Why

A reporter asked Ask: "neighborhoods where food insecurity is low despite high poverty." Ask answered "I can't answer
this directly" because it may read one number at a time and never match or rank tracts itself. The data to answer it
exists: 32 of DYCU's 46 dataset families are census-tract tables keyed by the same `GEOID`, so hundreds of pairs can be
lined up exactly. The almanac's rule stays: every number comes from the data and sits on a card, never in the AI's
words.

## 2. Scope

- **In:** DYCU tract datasets (families whose fields include `GEOID`; 32 today). Four question types through three
  tools: `rankTracts` (rankings), `compareYears` (change over time), `relateTracts` (do they go together; mismatches).
- **Out:** City of Milwaukee records (counted by point and boundary, a different kind of question); combining tracts
  into neighborhood estimates; color-scale (choropleth) maps; causal claims.

## 3. Words the reader sees

- Tool verdict words (relate): "little relationship", "weakly related", "moderately related", "strongly related",
  each with "higher … where … is higher" or "lower … where … is higher" for direction.
- Mismatch result labels: "clearly fits" and "close, not clear"; none found → "No tract clearly fits; N come close."
- Rankings: "within range of #10"; "unreliable: range too wide".
- Change: "clear increase", "clear decrease", "no clear change"; header line "N clear increases · N clear decreases ·
  N no clear change".
- Every relate card: "Related doesn't mean one causes the other."
- Errors: "DYCU's data didn't respond. Try again shortly."; "Too few tracts to say (fewer than 20 matched)."

## 4. The tools (what Ask can call)

All three are signed-in only (Ask), rate-limited per person (a new `askTracts` token bucket shaped like `askCity`:
60 per hour, bursts of 20), and return a compact result to the model (verdict, counts, at most the top 10 rows) plus a
cache key the card uses to fetch the full detail.

| Tool | Arguments | Returns (to the model) |
|---|---|---|
| `rankTracts` | `code`, `column`, `place` ("City" or "County"), `year`, `direction` ("high" or "low") | the column's label and kind, tract count, top 10 rows (tract, neighborhood, value, range, flags), ties, unreliable count, `key` |
| `compareYears` | `code`, `column`, `place`, `from` (year), `to` (year) | counts of clear increases / decreases / no clear change, the clear changes (≤ 10, largest first), `key` |
| `relateTracts` | `a: {code, column}`, `b: {code, column}`, `place`, `year`, `mode` ("relate" or "mismatch"), for mismatch `aSide` and `bSide` ("high" or "low") | verdict (relate) or the clearly-fits and close-not-clear tracts (mismatch, ≤ 10 each), matched and left-out counts, `key` |

**Checks, before any math** (each a status the model reads and acts on, like `countRecords`'s):
- `not-found` — no such dataset; `not-tract` — the family has no `GEOID` field.
- `choose-column` — the column isn't a numeric field of that dataset; returns the numeric columns (from
  `convex/lib/arcgis.ts` `fetchColumns` types) with their plain-English definitions from the family's column guide.
- `choose-year` — that place/year doesn't exist (for `relateTracts`: the two datasets share no place/year); returns
  each dataset's available place/years and, for two datasets, the ones they share (E02 × F02 → City 2022, County 2023).
- `unavailable` — DYCU's server failed or timed out. `busy` — the person's limit is spent.

## 5. The honesty rules (server code, not the AI)

1. **Ranges.** A value's range comes from the data: a `<column>_moe` field (case-insensitive) → value ± moe, labeled
   "90% confidence (Census)"; `Low_Confidence_Limit` / `High_Confidence_Limit` → those limits, labeled "95% confidence
   (CDC)". Neither → no range; the card says "no margin of error found for this column", and no tie, clear-change or mismatch claim
   is made for that column (rule 7).
2. **Unreliable.** For ACS-style moe ranges, a tract is unreliable when its coefficient of variation exceeds 40%:
   `(moe / 1.645) / value > 0.40` (a value of 0 with a positive moe is unreliable). For CDC limits: half-width /
   value > 0.40. Unreliable tracts are shown (greyed, with the reason) and never count as findings or rank in the top 10.
3. **Ranking ties.** After sorting reliable tracts by value, any tract outside the top 10 whose range overlaps #10's
   range is listed below the line as "within range of #10".
4. **Change.** Same tract `GEOID` in both years. A change is clear when `|v2 − v1| > √(moe1² + moe2²)` (ACS 90%
   comparison); CDC ranges use half-widths in place of moe. Otherwise "no clear change". Different place geographies
   (City vs County) are never compared across years.
5. **Relationship.** Spearman rank correlation ρ over matched reliable tracts; fewer than 20 → "too few". Words by |ρ|:
   < 0.2 little, < 0.4 weak, < 0.6 moderate, ≥ 0.6 strong; direction by sign. The card shows ρ and n.
6. **Mismatch.** Cutoffs are the thirds of each column's reliable values (the 2/3 quantile for "high", 1/3 for "low").
   A tract **clearly fits** only if its whole range is on its side of both cutoffs (for "high": lower bound ≥ cutoff;
   for "low": upper bound ≤ cutoff). A tract whose value fits but whose range crosses a cutoff is **close, not clear**.
7. **No range published** (rule 1): rankings and relationships still run; the card says findings can't be separated
   from noise, and mismatch/change tools return every tract as "close, not clear" / "no clear change" with that note.
8. **Caveats travel.** The card links each dataset's sheet caveats, names both confidence levels when they differ, and
   (relate) carries "Related doesn't mean one causes the other."

## 6. Tract names

`GEOID` = `55079` (Milwaukee County) + 6-digit tract; tract number = that 6-digit value ÷ 100 without trailing zeros
(`55079160101` → 1601.01, `55079180500` → 1805, `55079009000` → 90). The neighborhood translator's DYCU definitions
(`neighborhoods` table, `definition: "dycu"`, `tracts` per year range) give the name: the DYCU neighborhood whose tract
list for that year contains the tract. No match → "—" (DYCU defines tracts for its 28 report neighborhoods only, so
many tracts show "—"; naming the rest by City boundary is a later upgrade, not this build). Never invent a name.

## 7. The cards and the map (mockups approved)

Each card sits in Ask's hairline box under the AI's 1–3 sentences:
- **Header:** the exact column and its plain-English definition, "a rate" or "a count", place, year(s), tracts compared
  and left out, the DYCU tag.
- **relateTracts:** a scatter plot (one dot per tract, error bars, dashed lines at the thirds in mismatch mode;
  clearly-fits = solid dots, close-not-clear = hollow rings, others small grey dots), the map beside it (clearly-fits
  hatched, close-not-clear outlined, the boundary in grease-pencil red), then a table of the named tracts.
- **rankTracts:** table of the top 10 with ranges; ties below the line in grey; unreliable in italic grey with the
  reason; the ten hatched on the map.
- **compareYears:** the counts line, then only the clear changes (both years' ranges and the change); changed tracts
  hatched on the map.
- **Footer:** confidence levels, caveat links, the causation line (relate).
- House rules (DESIGN.md): no color scales or gradients; patterns and words carry meaning; tabular lining figures;
  the map's labels use paper and ink; key at body size.
- Tract shapes: the browser fetches the highlighted tracts' polygons from the dataset's own FeatureServer
  (`where=GEOID IN (…)`, `f=geojson`, `outSR=4326`), drawn as a CityMap tract layer; failure → the table and scatter
  still show, with "Tract map unavailable."
- The scatter's full detail (every matched tract) comes from the cached result by `key`, never through the conversation
  (the 64 KB request cap; see PR #15's C1).

## 8. Plumbing

- `convex/lib/tractStats.ts` — pure math: ranges, reliability, ties, change test, Spearman, thirds, mismatch. No I/O.
- `convex/lib/tractNames.ts` — `GEOID` → tract number; tract → DYCU neighborhood name for a year.
- `convex/tracts.ts` — the three actions: check → fetch rows (`<featureServerUrl>/query?where=1=1&outFields=GEOID,<col>,<range cols>&returnGeometry=false&f=json`, paging on `exceededTransferLimit`, 2,000 per page) → math → store the full result in `mapCache` under a `tracts:` key (24 hours; the key names the day) → return the compact result. A public query `tractDetail({ key })` reads the cached full result for the card (expired → `{ status: "expired" }`, and the card asks the person to re-ask).
- `lib/ask/tools.ts` — the three tool definitions (zod parameters with bounds); `lib/ask/prompt.ts` — when to use
  them, "pick a rate over a count when comparing places", and the same number rules as today.
- `ui/components/AskCards.tsx` (+ a new `TractCards.tsx` if it grows past ~400 lines) — the three cards;
  `ui/components/CityMap.tsx` — a tract layer (hatched / outlined polygons).
- Limits: `askTracts` per person; DYCU fetches are cached per (url, columns) for 10 minutes.

## 9. Testing

- Unit (`tests/…tractStats.test.ts`): every rule in §5 with hand-built cases — a tie at #10, an unreliable tract, a
  noise-level change and a clear one, ρ on a known set, a mismatch that clears its range and one that doesn't, no-range
  columns, fewer than 20 tracts, CDC half-widths.
- Unit: `GEOID` → tract number; tract → DYCU name by year; "—" when unmatched.
- Convex (`convex/tracts.test.ts`): each tool's checks and statuses with recorded DYCU responses (no live calls);
  compact result size under 8 KB for 300 tracts; detail served by key.
- E2E (fake model scripts): each card draws (scatter, table, map layer); unverified-number marking still applies.
- Report card: new questions — "Where is food insecurity low despite high poverty?" (relateTracts mismatch, E02 × F02,
  City 2022 or County 2023), "Which tracts have the highest poverty?" (rankTracts, E02 pov_rate), "Where did rent burden
  grow most from 2022 to 2024?" (compareYears), "Is asthma higher where poverty is higher?" (relateTracts relate).

## 10. Rollout and docs

Backend: three actions, one query, one rate-limit bucket; no schema change (reuses `mapCache`). Vercel production
builds deploy Convex first (`scripts/vercel-build.sh`). Decision 027 (Ask analyzes tracts; the honesty rules; what we
gave up: tract-level only, many tracts unnamed, mixed 90%/95% confidence). DESIGN.md: an "Analysis cards" section.
Ask guide (`/ask/guide`): one example per question type.
