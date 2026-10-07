# 003: Add an AI "Ask" tab whose answers show real data, never AI-typed numbers

**Decision:** Search stays the home screen. A separate Ask tab holds an AI chat (built with CopilotKit, a toolkit for chat interfaces that can show app components inside the conversation). The AI picks *which* dataset to show; the app fills in every fact, number, and link from the catalog or the Hub.

**Why this came up:** Tarik proposed a chat where people could ask questions and get answers with generative UI (real interface pieces, like cards and download buttons, appearing inside the chat). The risk: AI models invent plausible-looking numbers and links. For a newsroom, one invented number that makes it to air is worse than having no chat at all.

**Options:**
1. **Chat as the home screen:** biggest wow. Cost: every interaction costs money and takes seconds; quick browsing gets worse.
2. **One box that guesses whether you're searching or asking:** slick. Cost: it will sometimes guess wrong.
3. **Search home plus a separate Ask tab:** searches stay free and instant; only chat messages cost money. Cost: one more tab to discover.

**What we chose and why:** Option 3 (Tarik's choice, on Claude's recommendation). The rule "the AI picks, the catalog fills in" came from Claude: tools take only an ID, so the AI can't type a broken link into a card. A server check marks any number in the AI's text that didn't come from that turn's data as **unverified**.

**What we gave up:** A chat that can do arithmetic across datasets. In v1 it won't compute a county figure from neighborhood-level (census tract) data, because averaging percentages across tracts of different sizes gives wrong answers.

**How we'll know if this was right:** Zero unverified numbers in a sample of 20 real chats, and reporters use Ask for questions search can't answer, not as a slower search.

**What actually happened:**
