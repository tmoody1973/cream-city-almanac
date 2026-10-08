# 014: Add City of Milwaukee open data after the Ask chat

**Decision:** City of Milwaukee open data (data.milwaukee.gov) becomes Phase 4, after the Ask chat (Phase 3) and before saved items (now Phase 5). Phase 3 builds Ask's tools so they don't care which source a dataset comes from, so the City's data can plug in later.

**Why this came up:** Data You Can Use describes what Milwaukee's neighborhoods are like: health, income and housing, mostly yearly summaries and reports. The City's portal records what happens: individual crimes, traffic crashes, fire and EMS calls, call-center requests, permits and the Master Property File. A reporter often needs both. Tarik wants one comprehensive data tool.

**Options:**
1. **City data after Ask.** Cost: Ask's first version answers from DYCU's data and reports only.
2. **City data before Ask.** Cost: Ask ships a full phase later, and its first version must also handle counting large record files (every crime, every property), which is the riskiest kind of number for an AI to get wrong.
3. **A small search-only step for City data first, then Ask over both.** Cost: two smaller releases and more coordination between them.

**What we chose and why:** Option 1 (Tarik, on Claude's recommendation). Ask is already designed and runs on data the app already has, so it ships sooner. Building its tools source-agnostic (they take a dataset ID, not "a DYCU dataset") keeps the later City step from forcing a rewrite.

**What we gave up:** For one phase, Ask can't answer questions about crime, crashes, permits or property. Questions that need both sources wait until after Phase 4.

**How we'll know if this was right:** Phase 4 adds City datasets without changing Ask's tool definitions, only their data sources. If adding the City forces Ask's tools to be redesigned, the source-agnostic design failed.

**What actually happened:**
