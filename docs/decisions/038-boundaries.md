# 038: The City's boundaries are copied weekly, and overlaps are estimated from a grid

**Decision:** The Almanac copies eight of the City of Milwaukee's boundary layers once a week: aldermanic districts, voting wards with their polling places, Targeted Investment Neighborhoods (TINs), Neighborhood Revitalization Strategy Areas (NRSAs), Neighborhood Strategic Planning areas (NSPs), Tax Incremental Districts (TIDs), Business Improvement Districts (BIDs) and Opportunity Zones. An address shows which of them it is in. Ask can say which ones cover a neighborhood, census tract or district, and about how much of it.

**Why this came up:** "Who is my alder?", "Where do I vote?" and "Which TINs cover our area?" were marked Partly or Not in Ask. The boundary files existed, but nothing connected them to an address or a place. Getting it wrong has a real cost: a wrong polling place sends someone to the wrong building on election day.

**Options:**
- **A weekly copy (chosen).** The build stores all eight layers (1.75 MB, 547 shapes) and precomputes, for every tract, neighborhood, DYCU area and district, which boundaries cover it. The cost: answers can be up to a week behind the City.
- **Ask the City live.** Eight map requests per address, and live intersect queries for place questions. Always current, but every lookup fails when the City's server does, and the City's service gives no "how much of it" share.
- **Mixed.** Live for addresses, a copy for place questions. Freshest addresses, but two paths to keep in agreement.

**What we chose and why (Tarik, 2026-10-12):**
- **A weekly copy.** It reuses the neighborhood refresh's rule that a failed layer keeps last week's copy.
- **The same overlap estimate as the tract-neighborhood match:** a grid of points, about ±2%.
- **A cut-off of 1%, not 10%.** A TID is often a small part of a tract, and hiding it would answer "is this tract in a TID?" wrongly.
- **Every polling place line is dated and links to myvote.wi.gov,** the state's official lookup.

**What we gave up:**
- **Boundaries can be a week old.** Polling places are the piece most likely to change close to an election.
- **Shares are estimates,** so the cards say "about 37%" rather than an exact figure.
- **The reverse question** ("which neighborhoods does TID 41 cover?") isn't answered yet.

**How we'll know if this was right:**
- The address panel's district and ward match the City's own address lookup for a sample of addresses.
- No polling place appears without its date and the myvote.wi.gov link.
- The weekly build notes show which layers, if any, failed.

**What actually happened:**
