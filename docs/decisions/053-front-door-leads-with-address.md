# 053: The front door leads with your address, not the catalog

**Decision:** The home page now opens with "Look up your Milwaukee neighborhood." and the address box. The topic search moves just below it. A search that names one of DYCU's neighborhoods shows that neighborhood's fact sheet first. The first-visit tour no longer scrolls the headline off the screen.

**Why this came up:**
- On 2026-10-16 Claude walked through the live site as a first-time Milwaukee resident.
- The home page said "A guide to Milwaukee's public data." That describes the tool, not a resident's question.
- The most useful page for a resident, the neighborhood fact sheet, was linked only from the footer.
- Searching "Riverwest" returned a list of which years DYCU's files cover, not anything about Riverwest. A newcomer would conclude the site has nothing on their neighborhood.
- On load, the tour scrolled the page down about 214 pixels, so a first visitor never saw the headline at all.
- If we got this wrong, residents leave in the first ten seconds, and the reporters and nonprofits the page was first written for lose their clear entry point.

**Options:**
1. **Lead with the address (chosen).** One field every Milwaukeean can fill in without knowing any data terms. Cost: the catalog search drops to second place, and the headline speaks to residents first.
2. **One box for both an address and a topic.** The site would guess which one you typed. Cost: wrong guesses ("2024 crime" starts with a number, like an address), and harder to explain.
3. **Keep the headline, add the address box under it.** Least change. Cost: the first words still describe the tool, not the reader's question.

**What we chose and why (Tarik, 2026-10-16, with Claude):**
- Option 1, with the headline "Look up your Milwaukee neighborhood."
- The address box already worked on `/n`, so the home page reuses it as-is.
- The search line uses DYCU's own list of profiled neighborhoods, so it only appears when there is a real fact sheet to open.

**What we gave up:**
- **Most of the city still has no fact sheet.** The address box covers every City address, but a fact sheet exists only for DYCU's 27 areas. Bay View or the East Side gets the alder, ward and polling place, plus a pointer to Ask (which needs sign-in).
- **Professionals have a second-place entry.** Reporters and nonprofits now find the topic search second, under a resident-first headline.
- **Narrow matching.** The search line matches neighborhood names as whole words only, so a misspelled name gets no line.

**How we'll know if this was right:**
- A first visit on laptop and phone shows the site name, the headline and the address field without scrolling. A browser test checks this on every PR.
- Searching a profiled neighborhood's name leads with its fact sheet. Also checked by a browser test.
- Five Milwaukee residents who haven't seen the site, given only the home page, can each say what it's for and reach their own neighborhood within a minute. (The site has no visit analytics, so this is checked by asking people, not by counting.)

**What actually happened:**
