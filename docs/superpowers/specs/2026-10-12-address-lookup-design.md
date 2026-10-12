# Cream City Almanac: Address Lookup — Design

Tarik approved this design in conversation on 2026-10-12, section by section. It is Project H in the build order for making the "Partly / Not yet" questions answerable:

- J: data fixes (done)
- F: totals and medians (live)
- G: tract questions by neighborhood (live)
- D: fact sheets (live)
- **H: this spec**
- I: boundaries and places
- K: files split by period
- C2: share link
- L: more "how long" pairs

## 1. Why

Residents and nonprofits start from an address:
- "Which neighborhood is my address in?"
- "What census tract is 2nd and Center?"
- "Is asthma higher where I live?"

Ask works at the tract, neighborhood and district level, and people don't know which of those they live in. The questions document (docs/research/2026-10-12-questions-by-audience.md) marks "by address" **Not in Ask** for several questions.

H answers only **which places an address is in**, then points to those places' figures. It never shows anything about a property: no owner, no assessment, no record. That boundary is the one in the questions document (line 234), and it stays.

## 2. What the exploration found (2026-10-12)

**The Census Bureau's geocoder** (`geocoding.geo.census.gov/geocoder/geographies/onelineaddress`) is free and needs no key. One request with `benchmark=Public_AR_Current&vintage=Current_Current&layers=Census Tracts` returns:
- the matched address;
- the coordinates;
- the 2020 census tract GEOID.

Checked results:

| Asked | Matched | Tract |
|---|---|---|
| "2400 W Center St, Milwaukee, WI" | "2400 W CENTER ST, MILWAUKEE, WI, 53206" | 55079008800 |
| "N 2nd St and W Center St, Milwaukee, WI" (an intersection) | "N 2ND ST & W CENTER ST, MILWAUKEE, WI, 53212" | 55079185700 |

A made-up address returns zero matches.

**The City of Milwaukee's own geocoder** isn't at the address tried, and it isn't needed.

**Already in the Almanac:**
- City neighborhood shapes: the `neighborhoods` rows where `definition` is "city", with `geometry` and `bbox`;
- `inShape` and `inBbox` (`convex/lib/geo.ts`);
- DYCU's area lists, through `neighborhoodsFor(tract, year, defs)` and `latestDefYear` (`convex/lib/tractNames.ts`) plus `tractNumber` (`convex/lib/tractData.ts`);
- fact sheet matching (`convex/factSheet.ts`, by `placeKey`);
- rate-limit buckets (`convex/limits.ts`).

## 3. Decisions (Tarik, 2026-10-12)

- **Scope:** the census tract, the City neighborhood and DYCU's area. Aldermanic district, ward and TIN/NRSA come with Project I's boundary files.
- **Where:** in Ask (a new tool and card), plus a "Find your neighborhood" box on the fact sheet index (`/n`).
- **How:** the Census geocoder, live, chosen over the City property file. The typed address goes to the Census Bureau, and the page says so. The Almanac does the neighborhood and DYCU-area matching itself and never stores the address.

## 4. The lookup (`convex/lib/geocode.ts`, `convex/places.ts`)

`locate(ctx, address)` runs these steps in order:

1. **Input.** The address is trimmed and must be 3–200 characters. Otherwise the result is `bad-address`, and the Census is not called.
2. **Geocode.** One request to the Census geographies endpoint, with a 10-second timeout.
   - A timeout, a network error or a non-200 reply is `unavailable`.
   - Zero matches is `no-match`.
   - With several matches, the first is used and its matched address is shown, so the person can check it.
3. **City neighborhood.** The first City neighborhood whose bbox and then shape (`inBbox`, then `inShape`) contains the point. This is the one neighborhood the address is in, not a share.
4. **Where the address is.**
   - **Inside a City neighborhood:** `inCity: true`.
   - **No City neighborhood, but the tract GEOID starts with 55079 (Milwaukee County):** `inCity: false`, with the tract only.
   - **Otherwise:** `outside-county`.
5. **DYCU area.**
   - Names come from `neighborhoodsFor(tractNumber(geoid), latestDefYear(defs), defs)`.
   - Each name gets a fact sheet `slug` when it matches a DYCU portrait area (`placeKey`), and `null` otherwise.
6. **The result:**

   ```
   { status: "ok"; matched: string; tract: { geoid: string; number: string };
     neighborhood: string | null; inCity: boolean;
     dycu: { name: string; slug: string | null }[] }
   ```

   The other statuses are `bad-address`, `no-match`, `unavailable`, `outside-county` and `busy`.

**Nothing is stored.** `locate` reads the database only. Errors are logged by status, never with the address. No property, owner or assessment field is fetched or returned.

**Rate limits:**
- **Ask:** a new per-person bucket, `askPlace` (60 per hour, capacity 20, like `askCity`).
- **The public box:** a new site-wide bucket, `placePublic` (60 per minute, capacity 20, like `mapCity`).

**Two entry points:**
- `api.places.findPlace` is an action for Ask. It requires sign-in, uses `askPlace`, and returns the result.
- `api.places.placeForBox` is an action for the `/n` box. It is public, uses `placePublic`, and returns the same result.

## 5. Ask

- **The tool:** `findPlace({ address })`. Its description says:
  - it finds the census tract, the City neighborhood and DYCU's area for an address or intersection in Milwaukee;
  - the address goes to the U.S. Census Bureau's geocoder;
  - it never gives property information;
  - what each refusal means.
- **The prompt gains one rule:** "which neighborhood / tract / area is <address> in", or "where I live" with an address, calls `findPlace`. For property questions (owner, value, permits at an address), point to the City's Address Search, as now.
- **The card**, `data-card="place"`, shows:
  - the matched address, with "(as the U.S. Census Bureau matched it)";
  - the tract: "Census tract 88", with a button "How does tract 88 rank on poverty?";
  - the City neighborhood: "Harambee (City of Milwaukee boundary)", with buttons "Robberies in Harambee this year" and "Harambee's tracts by poverty";
  - DYCU's area, with "Open the fact sheet →" when it has a slug;
  - the line "This address was sent to the U.S. Census Bureau's geocoder to find its location; Cream City Almanac doesn't keep it."
- **The refusal texts:**
  - `no-match`: "The Census Bureau couldn't find that address. Try the house number, street name and ZIP code."
  - `outside-county`: "That address is outside Milwaukee County."
  - `unavailable`: "The address service didn't respond. Try again shortly."
  - `bad-address`: "Type a street address or an intersection, like 2400 W Center St."
- **The scripted test model:** "what neighborhood is 2400 W Center St in" calls `findPlace({ address: "2400 W Center St, Milwaukee, WI" })`.

## 6. The `/n` box

- **The form:** "Find your neighborhood". A text field and a button, above the list of 27 areas, with the privacy line beneath.
- **On submit:** it calls `placeForBox`.
  - **The first DYCU area has a slug:** it goes to `/n/<slug>`.
  - **A City neighborhood DYCU doesn't profile:** "That address is in the City's {neighborhood} neighborhood, which Data You Can Use doesn't profile. Ask about its census tracts →", linking to `/ask` with a starter question.
  - **Outside the City:** "That address is in Milwaukee County but outside the City of Milwaukee (census tract {n})."
  - **The other statuses** show the texts in §5.
- **Styling** follows the fact sheet index (DESIGN.md "Fact sheet"). It needs no new comp: one input and one button in the site's existing form style.

## 7. Testing

**Unit (Vitest)**
- `geocodeUrl`: the address is encoded, and the benchmark, vintage and layer are present.
- `parseGeocode`: a match, an intersection, no match, and a malformed reply.
- Input checks: too short, too long, trimmed.

**Database (convex-test, the Census geocoder faked)**
- A Harambee-style address inside a test City neighborhood square resolves to its tract, neighborhood and DYCU area with a slug.
- A point outside every City neighborhood, with a 55079 tract, gives `inCity: false`.
- A non-55079 tract gives `outside-county`.
- No match, and the service down (500 or a throw), give their statuses.
- `findPlace` needs sign-in, and its rate limit gives `busy`.
- `placeForBox` works without sign-in.
- **No table changes after a lookup.**

**Browser (Playwright)**
- The `/n` box: "2400 W Center St, Milwaukee, WI" lands on `/n/harambee`. This uses the real Census geocoder; the test is skipped when it is unreachable.
- An address outside DYCU's areas shows the message.
- Ask's scripted "what neighborhood is 2400 W Center St in?" draws the place card, on phone and desktop.

**Graded real-AI question:** "Which neighborhood is 2400 W Center St in?" must reach `findPlace`.

## 8. Docs

- **Decision 037:** the address lookup uses the Census geocoder and answers only which places an address is in. It covers what is sent where, and why there is no property information. "What actually happened" is left blank.
- **/how-it-works:** one line saying that address lookups send the address to the U.S. Census Bureau's geocoder and that the Almanac doesn't keep it.
- **DESIGN.md:** a note on the place card and the `/n` box.

## 9. Out of scope

- Aldermanic district, ward, polling place, TIN/NRSA and zoning by address (Project I, and zoning later).
- Anything about a property: owner, value, permits, violations.
- Points of interest near an address ("grocery near me").
- Saving or remembering a person's address.
