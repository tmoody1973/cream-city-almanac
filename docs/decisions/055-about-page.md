# 055: Explain the Almanac on a page built from its own working parts

**Decision:** The product explainer is a page on the site, `/about` ("What's in the Almanac"). It's laid out as an almanac's numbered contents, and it uses the live address box, a real fact-sheet row and a live City count as its proof, instead of a separate brochure.

**Why this came up:**
- Tarik asked for a one-pager that explains the whole product to an average Milwaukee resident, with angles for journalists and nonprofits.
- A text version existed (`docs/marketing/cream-city-almanac-one-pager.md`), but a text file only describes the product. It can't show it working.
- If we got this wrong, the explainer would make claims a reader can't check, or it would duplicate the home page and go stale.

**Options:**
1. **A page on the site, built from live parts (chosen).** Every example on it is the real thing: type an address and it answers. Cost: it depends on live data loading, and every claim has to stay true as the product changes.
2. **Replace the home page with the explainer.** One front door. Cost: it undoes the home page Tarik just approved (decision 053), and a long explainer slows down people who came to use the product.
3. **A printable handout only.** Good for flyers and meetings. Cost: no live proof, and screenshots go out of date.

**What we chose and why (Tarik, 2026-10-16, with Claude):**
- Option 1, at `/about`, with the address box as the one action and live parts as the only proof. No screenshots, no testimonials, no invented numbers.
- Tarik picked the structure ("The Almanac's Contents") from three that impeccable dealt.
- He then ruled that the mockup is a layout reference, not a pixel target: the site's shared masthead and lettering stay. The laptop keeps the site's own type scale and gets its own two-column layout below the first view.

**What we gave up:**
- **Pixel match with the mockup.** The first view matches it at 85%. The image model drew a slightly different masthead and different numerals than the site uses.
- **A guaranteed number in entry 3.** If the City's data is slow, the card shows the question and a link instead of a count.
- **Upkeep.** The copy has to be updated when features ship. For example, fact sheets for every City neighborhood aren't mentioned yet, because they aren't live.

**How we'll know if this was right:**
- Given only the `/about` link, a Milwaukee resident can say what the Almanac is and look up their own address within a minute.
- Reporters and nonprofit staff who are sent the link can name one thing they'd use it for.
- Every claim on the page still matches the live product at each release. A browser test checks the page's working parts on every PR.

**What actually happened:**
