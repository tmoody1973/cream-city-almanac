# 013: On laptops, show the list and the dataset side by side

**Decision:** At laptop sizes (at least 1100px wide, in landscape) the home page becomes two panes. The rundown or search results stay on the left; the chosen dataset's full sheet sits on the right, and the newest item opens there on arrival. The choice lives in the address (`/?q=asthma&open=W01`), so a link, a refresh and the Back button all bring back the same view. Phones keep the one-column design unchanged.

**Why this came up:** Phase 2 designed for phones and gave laptops the phone layout in a wider column (decision 008). Newsroom reporters dig on laptops, and most people who open a portfolio link see it on a laptop first. On a wide screen, opening a dataset meant leaving the list.

**Options:**
1. **Keep the wider phone layout.** Cost: wasted screen; every dataset opens a new page and you lose your place in the list.
2. **A pop-over panel (a drawer) for the sheet.** Cost: it covers the list, so comparing results still means opening and closing.
3. **Two panes, with the choice in the address.** Cost: more code (a selection model, a redirect from `/d/CODE` to the two-pane view, keyboard focus moves between panes) and a second layout to keep matched to its design.

**What we chose and why:** Option 3 (Tarik picked the layout, comp B with the newest item auto-opened; Claude proposed putting the choice in the address). The list never disappears, and a reporter can send a colleague a link that opens exactly the dataset they mean.

**What we gave up:** The laptop design matches its mockup less closely than the phone did (69% on the automated comparison against a 72% bar). The mockup was drawn with an invented dataset that has a two-line explainer and two columns; real datasets run much longer, so the lower half of the right pane can't sit where the mockup puts it. Tarik accepted that on 2026-10-07. Two existing laptop-size tests were reworded because a click now opens the right pane instead of expanding the row.

**How we'll know if this was right:** Reporters on laptops open several datasets per search without the Back button, and shared `?open=` links land on the dataset the sender meant. If people keep opening `/d/CODE` pages in new tabs instead, the pane isn't doing its job.

**What actually happened:**
