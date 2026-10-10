# 025: Show where incidents happened as quarter-mile areas, never dots

**Decision:** Maps show incidents as shaded quarter-mile squares in three bands (1–4, 5–19, 20 or more), never as dots at addresses, over OpenFreeMap streets; anyone can use the sheet map.

**Why this came up:** The City publishes crime records with exact street addresses. A map of dots would point at specific homes, sometimes a victim's. But a count is easier to trust when you can see where it falls.

**Options:**
- *Shaded quarter-mile areas, small counts as a band (chosen):* shows the pattern; a square is about three by three blocks; cells with 1–4 incidents show "1–4", not an exact number. Cost: no street-level detail.
- *Boundary only:* safest. Cost: tells a reporter nothing about where within the neighborhood.
- *Exact dots, as the City publishes:* most detailed. Cost: can point at a home.

**What we chose and why:** Shaded areas — Tarik's call, 2026-10-10 — after real Harambee numbers showed a stricter "hide under 5" rule would hide every robbery square. Streets from OpenFreeMap (free, no key); the sheet map is open to everyone, with a 10-minute cache (a saved copy of the answer, reused for 10 minutes) and a site-wide limit (a cap on how many City queries the whole site makes per minute) so the City's server isn't hammered.

**What we gave up:** Exact locations; OpenFreeMap is a small independent project, so if it goes down the streets go blank (our squares and boundaries still draw); public maps spend City queries we don't control (capped). The cap is site-wide because a Convex action can't see who is asking, so a determined script can still make the map say "busy" for everyone.

**How we'll know if this was right:** reporters use the map without asking for dots; the City's server never rate-limits us; the accessibility check passes in both editions.

**What actually happened:**
