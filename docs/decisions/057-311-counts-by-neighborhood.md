# 057: Count 311 requests by neighborhood, keeping counts only

**Decision.** Turn the addresses in each City 311 request into map points with the Census Bureau's free geocoder (a service that turns a street address into a location), count requests per neighborhood, Census tract, request type and year, then throw the addresses away.

## Why this came up

An Arlington Heights organizer asked for a training. Neighbors there had asked City staff about potholes, streetlights and dumping, and got no answers. The Almanac could count 311 requests citywide, but not for one neighborhood: the City publishes an address for each request but no map coordinates. Without a neighborhood count, the most useful answer for that room didn't exist.

## Options

1. **Geocode, keep only counts.** Each week, send the addresses to the Census geocoder, place each point in a neighborhood, store counts and days-to-close only.
   - **Cost:** a real build. About 70 minutes for the first run and about 15 minutes a week after. Around 1% of addresses don't match. About a fifth of rows have no address at all, so they can't be placed.
2. **Geocode and keep each request's point.** Any question becomes possible, including block level and maps.
   - **Cost:** the Almanac would hold the location of every resident's complaint. That runs against the project's rule that nothing about a person or an address is stored.
3. **Count by ZIP code,** which is already at the end of each address.
   - **Cost:** almost free. But a ZIP isn't a neighborhood, and organizers who know their boundaries would notice right away.

## What we chose and why

**Option 1. Tarik made the call on 2026-10-20.**
- It answers the organizers' real question (their neighborhood next to the city) without the Almanac becoming a store of where people complained.
- A test on 1,000 real rows matched 98.7% of the usable addresses in 15 seconds, so it's practical.

## What we gave up

- **No block-level or "which corner" answers, and no 311 maps.**
- **Counts lag up to a week** behind the City's daily file.
- **Some requests can never be placed:** rows with no address (about 22% in the test sample) and addresses the geocoder can't match. The card has to say how many, every time.

## How we'll know if this was right

- Citywide totals per year equal the City's own counts.
- An Arlington Heights pothole count for 2026 matches a hand check.
- The organizers' training uses the 311 neighborhood numbers, and they ask for more of this, not for block-level maps.

## What actually happened

<!-- Tarik fills this in. -->
