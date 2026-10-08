# 019: Ask launches with all five tools, open sign-up, no numbers in the AI's words, and nothing stored

**Decision:** The Ask chat's first version ships all five tools (find datasets, show a dataset, preview live data, read one number from a neighborhood table, quote a report passage) to anyone who signs up, within daily limits. The AI never writes figures in its own sentences; cards from the data carry every number. Conversations live only in the open browser tab. Report quotes cite the report's section, not a page. The model is Claude Sonnet 5.5.

**Why this came up:** Ask is the first place the almanac lets an AI talk to the public about data, and a wrong number in a reporter's story or a grant application is the failure that matters most. The original design left open which questions Ask should answer first, and its safety rule (flag any AI-written number that doesn't match the data) was looser than decision 003's promise of "never AI-typed numbers".

**Options:**
1. **Scope:** start with neighborhood numbers and finding data; finding data only; report passages and finding data; or all five tools at once. Cost of all five: the largest build and the most ways for an answer to go wrong at launch.
2. **Access:** anyone who signs up; an invite list first; or only Tarik and DYCU. Cost of open sign-up: strangers find the weak spots first.
3. **Numbers:** the AI may quote numbers it got from the data, and a checker flags the rest; or the AI writes no numbers and cards carry them all. Cost of no numbers: answers read a bit plainer ("the table is below").
4. **Memory:** keep chats with a history list; keep only the questions for quality; or keep nothing. Cost of keeping nothing: closing the tab loses the conversation.
5. **Citations:** page numbers would mean rebuilding how 279 report PDFs are read in; section names are already stored.

**What we chose and why:** All five tools, open sign-up, no numbers in prose, nothing stored, section citations, Sonnet 5.5 (Tarik; Claude recommended a narrower first scope, the rest were Claude's recommendations). No numbers in prose makes the safety check simple and strict: any figure in the AI's own words is wrong by definition, so nothing has to be matched. Keeping nothing protects reporters, whose questions can reveal what they're working on, and the shareable pane links already let an answer outlive the tab. Daily limits per person (30, or 200 for newsroom emails) and a $10 daily site budget bound the cost of opening it to everyone.

**What we gave up:** A smaller, safer first release; answers that read as naturally as a chatbot's; chat history until Saved (Phase 5); page-level citations; the cheaper model's lower cost per question.

**How we'll know if this was right:** On the Ask report card, the right table or passage comes back for most questions with zero unverified numbers; no one reports an Ask answer whose number doesn't match the app; the $10 budget is rarely hit; and people come back to Ask after their first session.

**What actually happened:**
