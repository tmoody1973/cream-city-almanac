# 010: Build the Ask chat before Saved items

**Decision:** After the laptop layout, Phase 3 is sign-in (Clerk) plus the Ask chat (CopilotKit). Saved items become Phase 4.

**Why this came up:** The spec ordered Clerk + Saved first, then Ask. Both need sign-in. Ask is the feature that shows what this product does differently, for the newsroom and for the portfolio, and Saved is a smaller convenience. Building Saved first would delay the headline feature for little gain.

**Options:**
1. **Spec order: Saved, then Ask.** Cost: the headline feature arrives one phase later.
2. **Ask first, then Saved.** Cost: Ask's "save this dataset" tool waits for Phase 4, so early chat users can't save from the chat.

**What we chose and why:** Option 2 (Tarik, on Claude's recommendation). Sign-in moves into the Ask phase, because every chat limit is per person: 30 questions a day, 200 for newsroom emails, and a $10 daily cap across everyone.

**What we gave up:** Saving datasets, from the chat or from the sheet, comes one phase later.

**How we'll know if this was right:** Reporters use Ask in the first weeks after Phase 3 ships, and nobody asks for saving before Phase 4 lands.

**What actually happened:**
