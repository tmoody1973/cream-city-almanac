# Cream City Almanac: Boundaries and Places — Design

Tarik approved this design in conversation on 2026-10-12, section by section. It is Project I in the build order for making the "Partly / Not yet" questions answerable:

- J: data fixes (done)
- F: totals and medians (live)
- G: tract questions by neighborhood (live)
- D: fact sheets (live)
- H: address lookup (live)
- **I: this spec**
- K: files split by period
- C2: share link
- L: more "how long" pairs

## 1. Why

Residents ask:
- "Who is my alder?"
- "Where do I vote, and is it accessible?"

Nonprofits and grant writers ask:
- "Which Targeted Investment Neighborhoods or NRSAs cover our area?"
- "Is this tract in a TID or an Opportunity Zone?"

The questions document (docs/research/2026-10-12-questions-by-audience.md) marks these **Partly** or **Not in Ask**: the boundary files exist, but nothing says which boundaries contain an address or overlap a place. Its gap list names "boundary overlap" (item 9).

## 2. What the exploration found (2026-10-12)

**The source.** The City of Milwaukee's map server (`https://milwaukeemaps.milwaukee.gov/arcgis/rest/services`) publishes every layer needed, with no key. Each layer is read with `<layer>/query?where=1%3D1&outFields=*&outSR=4326&f=geojson`.

| Kind | Layer | Shapes | Columns used |
|---|---|---|---|
| `district` (aldermanic) | `election/election_geography/MapServer/1` | 15 | `DISTRICT`, `ALDERPERSON` |
| `ward` | `election/election_wards/MapServer/1` | 356 | `WARD`, `POLLING_PL`, `ADDRESS`, `MAIN_ENTR`, `ACSBL_ENTR`, `MAIN_PKNG`, `ACSBL_PKNG` |
| `tin` | `planning/special_districts/MapServer/13` | 9 | `TIN`, `OPEN_DATE` |
| `nrsa` | `planning/special_districts/MapServer/21` | 2 | `NRSA` |
| `nsp` | `planning/special_districts/MapServer/22` | 19 | `NSP`, `AGENCY` |
| `tid` | `planning/special_districts/MapServer/8` | 79 | `TID`, `NAME` |
| `bid` | `planning/special_districts/MapServer/3` | 33 | `BID`, `BIDNAME` |
| `oz` (Opportunity Zone) | `planning/special_districts/MapServer/9` | 34 | `TRACTTEXT` (a 2010 census tract number) |

**What the layers contain:**
- **Size:** together 1.75 MB and 547 shapes; the largest shape is 99 KB. No layer was truncated.
- **TIDs:** all 79 are active; none has a dissolve date.
- **Wards:** the ward layer's district column (`ALD`) is empty for all 356 wards, so a ward's district comes from comparing shapes. Every ward has a polling place.
- **The separate polling place point layer** (`election_wards/MapServer/0`) repeats the ward layer's polling place columns, so it isn't needed.

**Already in the Almanac:**
- `inShape`, `inBbox` and `bboxOf` (`convex/lib/geo.ts`);
- `insidePoints` and `cityShares` (`convex/lib/tractPlaces.ts`): a grid of points sampled over a shape, about ±2%;
- the weekly `refreshNeighborhoods` (`convex/build.ts`), which keeps last week's shapes when the City fails, and reads DYCU's tract outlines from E02's newest County map;
- H's `placeAt` and `locate` (`convex/places.ts`), plus the place card (`ui/components/PlaceCard.tsx`) and the `/n` box (`ui/components/FindPlaceBox.tsx`);
- G's place parameters for Ask tools (`area` in `lib/ask/tools.ts`: `neighborhood` plus `map: "city" | "dycu"`).

## 3. Decisions (Tarik, 2026-10-12)

- **Boundaries:** all three groups:
  - civic (district and alder, ward and polling place);
  - investment areas (TIN, NRSA, NSP);
  - development districts (TID, BID, Opportunity Zone).
- **Reach:** address lookups **and** place questions in Ask.
- **How:** a weekly copy (approach A), not live City lookups.
- **The public `/n` box:** shows a results panel instead of jumping to the fact sheet.
- **Left out:** the reverse direction ("which neighborhoods does TID 41 cover?").

## 4. The data (weekly)

### Boundaries

`refreshBoundaries` runs in the weekly build after `refreshNeighborhoods`.

**Reading the layers:**
- It reads each of the eight layers separately.
- For each kind, the table's rows are replaced only when that layer was read, wasn't truncated (`exceededTransferLimit`), and returned at least one usable shape.
- Otherwise that kind keeps last week's rows, and the build notes say "<Kind> boundaries unavailable, kept last week's: <reason>".
- A feature without a usable polygon or name is skipped and named in a note, as for neighborhoods.

**The new table:**
```
boundaries: { kind: "district"|"ward"|"tin"|"nrsa"|"nsp"|"tid"|"bid"|"oz";
              name: string; details: Record<string, string>; geometry: string; bbox; fetchedAt: number }
  index by_kind
```

**Names and details:** text is trimmed, and `\r\n` is collapsed to a space.

| Kind | `name` | `details` |
|---|---|---|
| district | `District {DISTRICT}` | `alder` |
| ward | `Ward {WARD}` | `pollingPlace`, `pollingAddress`, `mainEntrance`, `accessibleEntrance`, `mainParking`, `accessibleParking` |
| tin | `{TIN} TIN` | `opened` (ISO date from `OPEN_DATE`, when present) |
| nrsa | `NRSA {NRSA}` | — |
| nsp | `NSP {NSP}: {AGENCY}` | `agency` |
| tid | `TID {TID}: {NAME}` | — |
| bid | `BID {BID}: {BIDNAME}` | — |
| oz | `Opportunity Zone (2010 tract {TRACTTEXT})` | — |

### Overlaps

After the boundaries, the build computes one overlap row per place:

```
boundaryOverlaps: { placeType: "tract"|"city"|"dycu"|"district"; place: string;
                    covers: { kind; name: string; share: number }[]; builtAt: number }
  index by_place ["placeType", "place"]
```

**The places:**

| Place type | Which places | `place` key | Shape |
|---|---|---|---|
| `tract` | every County tract in E02's newest County map | GEOID | the tract outline |
| `city` | every City neighborhood | `matchKey` | the stored shape |
| `dycu` | each DYCU area | `matchKey` | all of its newest year's tracts as one multipolygon |
| `district` | each aldermanic district | its number | the stored district shape |

**How shares are counted:**
1. `insidePoints(place)` samples points over the place.
2. For each kind, a point counts for **every** boundary of that kind that contains it, because TIDs and BIDs can overlap one another.
3. `share` is the rounded percent of the place's points.
4. Boundaries under 1% are dropped. (`cityShares` keeps its 10% for neighborhoods.)
5. A district's row doesn't list itself.

**When it's replaced:**
- The table is replaced only when the tract outlines were read and at least one place got a row.
- Otherwise last week's rows stay, with a note.
- Each overlap uses whatever boundaries are stored, including a kind kept from last week.

**Size:** about 530 rows.

### What is never stored

No address, nothing about a person, and nothing about a property.

## 5. The address answer

`placeAt` (H) gains a boundary step:
1. It reads the stored `boundaries`.
2. For each kind, it keeps every boundary whose bbox and then shape contain the point.
3. **Ward and district edges:** on a shared edge, a point gets exactly one ward and one district, by `inShape`'s half-open rule; the first match is kept.

The `ok` result gains:
```
boundaries: { asOf: number | null;                  // oldest fetchedAt among the kinds found; null when the table is empty
              district: { name; alder } | null;
              ward: { name; pollingPlace; pollingAddress; mainEntrance; accessibleEntrance; mainParking; accessibleParking } | null;
              investment: string[];                  // tin, nrsa, nsp names
              development: string[] }               // tid, bid, oz names
```

**Shown lines,** from one shared component `PlaceBoundaries`, used by both Ask's place card and the `/n` panel:
1. **The district:** "Aldermanic District 6 · Alder: {alder}".
2. **The ward:** "Ward 112 · Votes at {pollingPlace}, {pollingAddress}", then the accessible entrance and accessible parking texts, then the line "From the City's polling place list as of {asOf date}. Polling places can change before an election; confirm yours at myvote.wi.gov.", with myvote.wi.gov linked to `https://myvote.wi.gov`.
3. **"Investment areas:"** the names, or "None".
4. **"Development districts:"** the names, or "None".

**The special cases:**
- **An empty table** (`asOf` null): the block shows only "The City's boundary files haven't been loaded yet." It never says "None".
- **`inCity: false`:** the block shows "The City's boundaries (districts, wards, investment and development areas) don't cover this address." instead of the lines.

**Ask follow-up:** with a district, "Which wards are in District {n}, and where do they vote?".

**The `/n` box:**
- It no longer navigates. It shows a panel in its existing `role="status"` area.
- **The panel** holds:
  - the matched address;
  - "Open {area}'s fact sheet →" when `sheetFor(r)` gives a slug, or H's unprofiled-neighborhood message and link;
  - `PlaceBoundaries`;
  - the privacy line.
- **Refusals** show as before.

The Census request, the rate limits and the privacy line are unchanged.

## 6. Place questions: `boundariesFor`

**The Ask tool, `boundariesFor`.**

Its parameters:
- **Exactly one place:**
  - a `neighborhood` with G's `map` ("city" by default, "dycu" when the person says DYCU's area);
  - a `tract` (number or GEOID);
  - a `district` (1–15).
- **`kinds`, optional:** one or more of the eight kinds. Left out, it means all of them.

**The backend** is a Convex query in `convex/places.ts`:
1. **Resolve the place.**
   - Neighborhoods match by `placeKey`, as G does; DYCU areas match the same way.
   - A tract number becomes its County GEOID, `55079` plus the six-digit tract code: "88" → 55079008800, "88.01" → 55079008801, "1857" → 55079185700.
   - A district matches its number.
2. **Read the overlap row,** keep the asked kinds, and attach each ward's polling place details from `boundaries`.

It needs sign-in and rides Ask's existing limits. It makes no outside calls.

**The result:**
```
{ status: "ok"; place: { type; name }; asOf: number; covers: { kind; name; share; details? }[] }
| { status: "unknown-place"; suggestions: string[] }
| { status: "outside-city" }      // a County tract whose row lists nothing
| { status: "not-loaded" }        // no overlap rows yet
```

**The card,** `data-card="boundaries"`, shows:
1. **The heading:** the place name and its map ("City of Milwaukee boundary" or "DYCU's area").
2. **One group per kind,** in table order: district, ward, TIN, NRSA, NSP, TID, BID, Opportunity Zone.
   - Each entry is its name and its share. Share wording: `share >= 99` → "all of it"; `share < 5` → "a small part (under 5%)"; otherwise "about {share}%".
   - Wards with polling places show as a table: ward, share, polling place, accessible entrance.
3. **The footnote:** "Shares are estimated from a grid of points, about ±2%. From the City's boundary files as of {asOf date}." The myvote.wi.gov line follows when wards are shown.

**The refusal texts:**
- `unknown-place`: "I couldn't find that place. Did you mean: …?"
- `outside-city`: "The City's boundaries don't reach this tract."
- `not-loaded`: "The City's boundary files haven't been loaded yet."

**The prompt rule:**
- "Which TIN / NRSA / NSP / TID / BID / Opportunity Zone / ward / district is <place> in or overlaps <place>?", and "Who is the alder for District N?", call `boundariesFor`.
- An address goes to `findPlace`.

**The scripted test model:** "which tins overlap harambee" calls `boundariesFor({ neighborhood: "Harambee", kinds: ["tin"] })`.

## 7. Testing

**Unit (Vitest)**
- **The layer parser:** for each kind, names and details from a sample feature; `\r\n` trimmed; a missing name skipped; an empty or truncated layer refused.
- **`boundaryShares`:**
  - a boundary covering the left half of a square gives about 50%;
  - two overlapping boundaries both count;
  - a boundary under 1% is dropped;
  - a 3% boundary is kept.
- **Share wording:** 100 and 99 → "all of it"; 4 → "a small part (under 5%)"; 37 → "about 37%".

**Database (convex-test, the City's server faked)**
- `refreshBoundaries` stores all eight kinds.
- A layer returning 500 keeps last week's rows for that kind only, with a note.
- Overlap rows exist for a tract, a City neighborhood, a DYCU area and a district.
- An address inside a test district and ward gets them, plus the polling place details.
- An address outside the City gets `inCity: false` and no boundary lines.
- An empty `boundaries` table gives `asOf: null`.
- `boundariesFor`:
  - answers for a neighborhood, a DYCU area, a tract and a district;
  - `kinds` filters;
  - unknown, outside-city and not-loaded give their statuses.
- A lookup and a `boundariesFor` change no table.

**Browser (Playwright)**
- **The `/n` panel:** 2400 W Center St shows an aldermanic district, a ward with a polling place and the myvote.wi.gov link, on phone and desktop, against the real Census geocoder and a dev backend with boundaries loaded.
- **Ask:** the scripted "which TINs overlap Harambee" draws the boundaries card.

**Graded real-AI questions:** "Which TINs overlap Harambee?" and "Which wards are in District 6, and where do they vote?" must reach `boundariesFor`.

## 8. Docs

- **Decision 038:**
  - a weekly copy of the City's boundary files instead of live lookups;
  - why polling places carry a date and a myvote.wi.gov link;
  - why the overlap cut-off is 1% rather than 10%.
  - "What actually happened" is left blank.
- **/how-it-works:** one paragraph on boundaries: where they come from, how often they're refreshed, and that shares are estimates.
- **DESIGN.md:** the `PlaceBoundaries` block, the `/n` panel and the boundaries card.
- **The questions document:** these rows move to **Now**:
  - "Where is my polling place";
  - "Who is my alder";
  - "Which Targeted Investment Neighborhoods or NRSAs cover our area";
  - "Is my area in an Opportunity Zone, TID or BID".

## 9. Going live

Merging deploys the code, and the tables stay empty until a build runs. So after merge, `refreshBoundaries` runs once on production. It is a production data write: a few seconds, touching only the two new tables. Tarik runs it, or OKs it.

## 10. Out of scope

- **The reverse direction:** which places a boundary covers.
- **Election results by ward:** vote sums.
- **Redlining grades, zoning and historic districts.**
- **County supervisor, school board, state and federal districts:** the `election_geography` layers 2–8.
- **Anything about a property,** or storing an address.
