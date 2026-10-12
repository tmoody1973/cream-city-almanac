# Is This a New Way to Build Data Portals? A Research Brief

Cream City Almanac · drafted 2026-10-12 · prepared by Claude for Tarik Moody

This brief asks whether Cream City Almanac's design is a new way to build public data portals, what published research says about each part of it, and where the purpose and market might be. It was assembled in one session from web research. Each source is marked by how closely it was checked (see "How to read the sources" at the end), and a claim is only as strong as its weakest source.

## The short answer

Partly new. Each ingredient has research behind it, and several are standard practice: plain-language search, citing sources, showing margins of error. What is uncommon is the combination, built around one rule that most published systems don't follow:

> **The AI chooses which question to ask the data. Tested code does the math. The answer card carries the uncertainty and the source.**

Most research prototypes and commercial tools let the language model produce, retrieve or reason about the numbers itself. The best published evidence (Google's DataGemma, below) shows why that is risky. Even when the model is handed the right data, the conclusions it writes from that data go wrong 6–20% of the time. Cream City Almanac's answer is to keep the model out of both the numbers and the sentence that summarizes them.

The defensible claim isn't "a new kind of portal". It is narrower: **for public numbers that get published, verifiability should beat breadth, and this is a working design that does that.** The claim still needs evidence that only Cream City Almanac can produce (section 7).

## 1. The design, in six rules

1. **The AI routes; code computes.** The model reads the question and picks one of a fixed set of tested tools:
   - find datasets;
   - read a dataset sheet;
   - one neighborhood figure;
   - count City records;
   - rank, compare or relate census tracts;
   - measure how long things take;
   - quote a report.

   Each tool returns numbers computed by code against DYCU's or the City's data. The card shows those numbers, never the model's. A figure the model writes in its own words is marked "unverified".
2. **Uncertainty is part of the answer.** Margins of error appear on every survey figure, and tracts are listed as statistically tied when their ranges overlap. The card says "can't tell" when a column has no margin and "too few to say" under 10 cases. Cases still open, or with unreadable dates, are counted and shown.
3. **Every fact is labeled by who wrote it:** DYCU, the City, the source agency, or AI.
4. **Two neighborhood maps, translated.** DYCU's report areas and the City's official neighborhoods differ. Each card says which one it used, and every census tract is named in both.
5. **Unmet demand is recorded.** Searches that find nothing are logged, which builds a map of what people want that isn't published.
6. **Privacy by default.** Crime appears as quarter-mile squares, never addresses. The property file never lists owners. Only totals leave the City's server.

## 2. The problem is real: people can't find or use portal data

- **Findability is the core failure.** The European Data Portal reports that re-users struggle to find data mostly because of poor metadata and weak search, not because the data is missing. *(summary)*
- **People bypass portals.** In a study of Philippine portals, participants still relied heavily on Google. A 21-person usability study concluded that citizens need localized search and "visualized, contextualized, and processed content for better sensemaking". *(summary)*
- **Municipal portals fail too.** A study of geodata users in Colombia and Spain found access barriers raised "over and over again", including difficulty downloading data. *(summary)*

**What this supports:** a front door that answers in plain language and explains what it found. These studies are small (13–40 participants) and from different countries. None measures a US city portal directly.

## 3. The landscape: AI interfaces to open government data (2024–2026)

Research on putting language models in front of open data is active and recent. The common designs:

| System | How it answers | Trade-off |
|---|---|---|
| OGD4All (geospatial open data) | The model searches metadata, then writes and runs its own analysis code in a sandbox; tested on a 199-question benchmark | Broad coverage; correctness depends on generated code |
| Talk to Open Data (Greek national portal) | Retrieval-augmented answers over a chosen dataset | Authors flag "real-time calculations and deterministic responses" as the hard problem |
| VayuChat (air quality) | Plain-language answers with the code it ran | Transparent code, but the model still writes it |
| TAGIFY | AI-generated tags to improve findability | Helps search, doesn't answer questions |
| Review of LLMs and open government data (2025) | Surveys the field, including the Aragón Open Data Assistant and a ChatGPT study on statistics.gov.scot | |

*(OGD4All, Talk to Open Data, VayuChat: abstracts and summaries. Review and TAGIFY: titles and references only.)*

**Where Cream City Almanac sits:** it gives up the breadth of "the model writes the code" for numbers that come from fixed, tested queries. Every new kind of question is an engineering project; "how long things take" took about a day. In return, a wrong number traces to a bug that a test can catch, not to a model's improvisation.

## 4. How accurate are language models with statistics?

### 4.1 Google's DataGemma: the best direct evidence (paper read, results tables checked)

Radhakrishnan et al., "Knowing When to Ask: Bridging Large Language Models and Data" (arXiv 2409.13741, 2024), connect Google's Gemma models to Data Commons, a large public statistics store. They test two methods on 101 hand-written queries:

| Measure | 7B model | 27B model | Source |
|---|---|---|---|
| The model's own statistic was accurate (no retrieval) | 4.9% | 16.7% | Table 2 |
| With RIG (the model asks Data Commons and the retrieved statistic is used): accurate | 57.7% | 58.8% | Table 2 |
| With RAG (data fetched and given to the model first): statistics quoted accurately | 98.6% | 98.9% | Table 5 |
| With RAG: conclusions drawn from those statistics accurate | 71.9% | 76.4% | Table 5 |
| With RAG: conclusions wrong | 6.1% | 19.5% | Table 5 |
| Share of queries RAG could answer with statistics | 24% | 29% | Table 7 |
| Gemini 1.5 Pro baseline: share answered / accuracy of its statistics | 9% / 39% | | Table 7 |

The authors note that most evaluations were done by the team that wrote the paper, on 101 queries. They call the results early.

**What this means for Cream City Almanac:**
- **Handing the model real data fixes the numbers but not the reasoning.** With retrieval, quoted statistics were about 99% accurate. The conclusions drawn from them were wrong up to 1 time in 5.
  - Cream City Almanac's card leads with a summary sentence written by code from the server's verdict (decision 028), never by the model.
  - That's a direct answer to the failure this paper measures.
- **Coverage is the other limit.** Even Google's store could answer only 24–29% of the test questions. Cream City Almanac has the same limit, and handles it by refusing in plain words ("this file has no from-and-to dates to measure", "too few to say") rather than guessing.

### 4.2 Text-to-SQL and tool use

- **Queries the AI writes fail systematically.** Research on text-to-SQL (the AI writes a database query) finds errors are systematic, not random. The most common is picking the wrong tables. One thesis found the same questions failed consistently in at least 76% of cases. *(summaries)*
- **Tools add their own failure modes.** Studies find tool-calling agents can hallucinate more, because of the added complexity. A 2026 preprint names "tool bypass": the model produces an answer instead of calling the tool. *(summaries)*
- **The defenses are in the design.** Cream City Almanac gives the model a small set of tested tools, never raw SQL. The card shows only tool output. A browser test checks that a number the model types itself is marked "unverified".

**Gap:** no study found compares tool-computed and model-generated statistics on the same civic questions. Cream City Almanac could run that comparison (section 7).

## 5. Disclaimers don't fix a confident wrong answer

New York City's MyCity business chatbot told owners they could take workers' tips and refuse housing vouchers. Both are illegal. It also said stores could go cashless, which the city banned in 2020. It carried a "Beta" label and a warning that it "may occasionally produce incorrect, harmful or biased content". The mayor kept it online. *(The Markup with THE CITY, April 2024; news coverage)*

**Lesson:** a warning label is not a design. Cream City Almanac's answer is structural: the model never states the number, and every fact carries who wrote it.

## 6. Uncertainty in neighborhood data

- **Tract estimates are noisy.** Spielman, Folch and Nagle (*Applied Geography*, 2014) found tract-level margins of error in the American Community Survey are on average 75% larger than the corresponding 2000 long-form estimates, sometimes "so imprecise that they are difficult to use". *(abstract)*
- **The noise is worst where the stakes are highest.** Folch and colleagues (*Demography*, 2016) found uncertainty is higher in lower-income areas, even after accounting for the number of responses. A working-paper version reports that a third of small-area estimates have higher-than-recommended errors. *(abstract)*
- **Practitioners struggle with it.** Jurjevich et al. (*Journal of the American Planning Association*, 2018) found uncertainty is "magnified" for small areas, subgroups and cross-tabulations, and studied how planners cope. *(abstract)*
- **Guidance exists; evidence doesn't.** The Census Bureau's journalist handbook and Journalist's Resource both tell reporters to report the margin of error with every figure.

**What this supports:** Cream City Almanac's ties-within-the-margin ranking, its "can't tell" verdicts, and its "How to read this" notes.

**Research gap:** no empirical study was found on how journalists or readers interpret different ways of presenting margins of error. That is a contribution Cream City Almanac is positioned to make.

## 7. Intermediaries: the role Cream City Almanac plays

- **"Infomediaries".** Janssen and Zuiderwijk describe businesses that sit between open data publishers and users. They found six models among Dutch cases: single-purpose apps, interactive apps, information aggregators, comparison models, open data repositories and service platforms. *(summary)*
- **A common definition.** Shaharudin, van Loenen and Janssen propose it: third parties that supply specialized resources to improve the supply, flow or use of open data. *(summary)*
- **Non-profit intermediaries reduce barriers.** A 2022 systematic review (Pilshchikova, Zuiderwijk and Janssen) found they lower open data usability barriers, by requesting data from government and by building applications. *(summary)*
- **The open question is sustainability.** A 2026 article calls for research on what makes intermediary business models succeed. *(summary)*

**Where Cream City Almanac fits:** it is an intermediary built on top of another one. Data You Can Use's own website says it serves as "Milwaukee's representative to the Urban Institute's National Neighborhood Indicators Partnership" (NNIP), a peer network of community data intermediaries. NNIP's own site describes it as "a learning network in 30 cities". Data You Can Use was created in 2016 and has hosted an NNIP meeting in Milwaukee. *(organizations' own sites; blog)*

Older counts of NNIP cities run higher (37 by 2012; 35 in 2014; "more than three dozen"). NNIP's current description says 30.

**The fragility is real and was seen this session.** An intermediary inherits every upstream failure:
- **Traffic crashes:** the City's crash file is listed at 122 MB but is a 34-byte file holding only its header, and its queryable copy has 0 rows.
- **311:** the data is split into a current file and a historical one, and only the current file is queried today.
- **The City's server and firewall** refuse certain functions and query patterns.

## 8. Where government statistics are heading

- **The Commerce Department** started "AI-ready" open data work (guidelines January 2025, with a working group chaired by Census's chief scientist) because AI tools return incorrect or fabricated statistics. *(summary)*
- **The federal statistics committee report** FCSM 25-03, *AI-Ready Federal Statistical Data: An Extension of Communicating Data Quality* (Hoppe, Gonzalez, Mirel, Schmitt, May 2025), says more Americans now get answers from AI chatbots that draw on public data. It argues for enriching statistical APIs with metadata and context, and for a cross-agency effort on standards. *(front matter and summary)*

  That matches Cream City Almanac's column guides and its rule that DYCU's definitions are the authority.
- **The Census Bureau** has an internal AI-inventory record of a planned conversational search for data.census.gov. *(planning record; not confirmed live)*
- **An independent Census tool project** states the core insight plainly: an AI connected to the Census API "can return correct numbers, but correct numbers are not the same as valid analysis". *(concept document)*
- **The UK Data Service's CORDIAL-AI pilot** translates plain-language questions into precise API queries. *(blog)*

**What this means:** the people who publish the data are moving toward the same problem from the supply side. Cream City Almanac demonstrates the demand side, locally.

## 9. What's new and what isn't

| Feature | Common elsewhere? | Notes |
|---|---|---|
| Plain-language search over a catalog | Yes | Every study and vendor is doing this |
| AI summaries of datasets | Yes | Cream City Almanac labels them as AI-written |
| Citing the source of a number | Yes | Standard |
| **Model routes, code computes; the model never states a number** | Uncommon | Most systems let the model produce, retrieve or reason about numbers (sections 3 and 4) |
| **Summary sentence written by code, not the model** | Uncommon | Directly addresses DataGemma's 6–20% wrong conclusions |
| **Statistical ties and "can't tell" as answers** | Rare in AI tools | Grounded in the ACS uncertainty research (section 6) |
| **Per-fact authorship labels (DYCU / City / AI)** | Uncommon | A structural answer to the MyCity lesson |
| **Two neighborhood maps translated per tract** | Rare | Most tools choose one geography |
| **Unmet-demand log** | Rare in public portals | Valuable to data publishers |
| Privacy by default (squares, no owners) | Varies | Common in crime mapping; less so in AI tools |

## 10. Purpose and potential market

**Purpose:** make public numbers you can ask about and check, for people who publish or act on them.

**Who it serves** (from the questions document, `docs/research/2026-10-12-questions-by-audience.md`):
- **Local reporters.** Their numbers are shrinking, which raises the value of tools that do checking work.
  - Medill's *State of Local News 2025* counts 213 counties as news deserts. About 50 million Americans have limited or no access to local news. Newspaper closures ran at more than two a week. *(news coverage of the report)*
  - About 42,000 working journalists remain, per AP coverage of Medill's findings.
  - A separate 2025 Local Journalist Index counts 26,840 "local journalist equivalents", about 8.2 per 100,000 people.
  - These measures differ; don't combine them.
- **Nonprofits and grant writers,** who need defensible neighborhood numbers and show change to funders.
- **Residents,** who want to know what the data says about where they live.
- **Data publishers** (DYCU, City data teams), who gain a map of unmet demand and a channel that keeps their definitions intact.

**Where the pattern could travel:**
- **Community data intermediaries.** NNIP describes itself as a network in 30 cities. Any city with a community data partner and an open data portal has both halves of what Cream City Almanac connects.
- **City open data programs.** No authoritative national count was found:
  - a 2015 study found portals in 40 of the 100 largest US cities;
  - a 2018 study sampled 112 local portals;
  - the crowdsourced US City Open Data Census scored 36 cities.

**Possible models (hypotheses, none validated):**
1. **Civic infrastructure funded by foundations or local news funders,** as many intermediaries are.
2. **A version run by or licensed to community data intermediaries** in other NNIP cities.
3. **Newsroom partnerships,** where the card and its export become a standard way to cite local data.
4. **Paid services for data publishers:** demand reports, AI-readiness checks of their files (the crash and 311 findings are examples).

## 11. Costs and risks

- **Breadth is slow.** Each new kind of question is a tested tool. A code-writing system answers more on day one.
- **Upstream fragility:** empty files, split files, firewall rules, codes that differ between databases (citizen complaints is P01 in development and P24 live).
- **Thin evidence:**
  - 13 graded guide questions (each run once against the real model);
  - browser tests that use a scripted model;
  - no user study;
  - no accuracy comparison.
- **Cost per question:** about $0.05–0.11 in today's graded runs (two to three model calls each).
- **The model's tool choice is the weak link.** A wrong tool or a skipped tool still produces a confident reply, even if the card is right. The "unverified" marker catches figures the model types itself, but not a wrong choice of tool.

## 12. Evidence to gather next

1. **Accuracy comparison.** Run the ~120 questions in the questions document through Cream City Almanac, a general chatbot and a text-to-SQL baseline. Count wrong, unsupported and refused numbers. This fills the gap in section 4.2.
2. **Margin-of-error user study.** Five to eight reporters and nonprofit staff read tract cards. Do they cite ties correctly, and do they report the range? This fills the gap in section 6.
3. **Unmet-demand report.** Analyze what Milwaukee users search for and can't find, and publish it with DYCU.
4. **A wider graded set.** Grade more than the 13 guide questions, with several phrasings each, and track the share that reach the right tool.

Possible venues: the Computation + Journalism Symposium and the Digital Government Research conference (dg.o). A write-up with DYCU could also go to the NNIP network.

## 13. Open questions

- Will people trust a card that says "can't tell" more or less than one that gives a single number?
- How much breadth is enough? Which "Not yet" questions matter most to real users? (The gaps list in the questions document is a ranked guess.)
- Can the tool set grow fast enough to keep up, or does it need a supervised path for questions no tool covers?
- Who pays for an intermediary built on top of an intermediary?

---

## How to read the sources

- **paper read:** the claim was checked against the paper's own text and tables in this session.
- **abstract** or **summary:** the claim comes from an abstract, a search summary or secondary coverage. Read the full source before quoting it.
- **planning record** or **concept document:** not an official or confirmed public statement.

## Sources

**Portals and usability**
- [Barriers in working with Open Data (data.europa.eu)](https://data.europa.eu/en/datastories/barriers-working-open-data)
- [From Access to Effective Use: Open Data Portals for Everyday Citizens](https://comet.dlsu.edu.ph/papers/od-access)
- [Civic Technologies: Research, Practice and Open Challenges (arXiv 2012.00515)](https://arxiv.org/pdf/2012.00515)
- [Roadblocks Hindering the Reuse of Open Geodata in Colombia and Spain](https://0-doi-org.brum.beds.ac.uk/10.3390/ijgi7010006)

**AI interfaces to open data**
- [OGD4All (arXiv)](https://arxiv.org/html/2602.00012v3)
- [Talk to Open Data (Springer)](https://link.springer.com/chapter/10.1007/978-3-032-18487-0_2)
- [VayuChat (arXiv)](https://arxiv.org/pdf/2511.01046)
- [TAGIFY (arXiv)](https://arxiv.org/pdf/2407.18764)
- [A Review on the Use of LLMs in the Context of Open Government Data](https://www.researchgate.net/publication/395953303_A_Review_on_the_Use_of_Large_Language_Models_in_the_Context_of_Open_Government_Data)
- [Keywords are not always the key (arXiv)](https://arxiv.org/pdf/2509.14457)

**Statistics accuracy, text-to-SQL and tools**
- [Knowing When to Ask: Bridging Large Language Models and Data (DataGemma paper, PDF)](https://docs.datacommons.org/papers/DataGemma-FullPaper.pdf) (paper read; arXiv 2409.13741)
- [DataGemma announcement (Google)](https://blog.google/technology/ai/google-datagemma-ai-llm/)
- [Grounding AI in reality with Data Commons (Google Research)](https://research.google/blog/grounding-ai-in-reality-with-a-little-help-from-data-commons/)
- [Before Generation, Align it! (Text-to-SQL hallucination)](https://arxiv.org/abs/2405.15307v1)
- [Error and Reliability Analysis of Open Source LLMs for Text-to-SQL (Chalmers)](https://odr.chalmers.se/items/4b5252a4-771c-4084-b47c-548334c1d285/full)
- [Tool-induced reasoning hallucinations (arXiv)](https://arxiv.org/pdf/2511.10899)
- [GROUND: governed semantic definitions for enterprise analytics (arXiv)](https://arxiv.org/pdf/2608.26157)

**Government chatbots**
- [Malfunctioning NYC AI chatbot (The Markup)](https://themarkup.org/news/2024/04/02/malfunctioning-nyc-ai-chatbot-still-active-despite-widespread-evidence-its-encouraging-illegal-behavior)
- [Same investigation (THE CITY)](https://www.thecity.nyc/2024/04/02/malfunctioning-nyc-ai-chatbot-still-active-false-information/)

**Uncertainty in census data**
- [Patterns and causes of uncertainty in the ACS (Spielman, Folch, Nagle)](https://pmc.ncbi.nlm.nih.gov/articles/PMC4232960/)
- [Spatial variation in the quality of ACS estimates (Folch et al.)](https://experts.nau.edu/en/publications/spatial-variation-in-the-quality-of-american-community-survey-est/)
- [Navigating statistical uncertainty: planners and ACS data (Jurjevich et al.)](https://experts.nau.edu/en/publications/navigating-statistical-uncertainty-how-urban-and-regional-planner/)
- [ACS Journalist Handbook, ch. 2 (Census Bureau)](https://www.census.gov/content/dam/Census/library/publications/2020/acs/acs_journalist_handbook_2020_ch2.pdf)
- [Margin of error: a guide for journalists (Journalist's Resource)](https://journalistsresource.org/media/margin-error-journalists-surveys-polls/)
- [Communicating margins of error in map pop-ups (Esri)](https://www.esri.com/arcgis-blog/products/arcgis-living-atlas/mapping/effective-ways-to-communicate-margins-of-error-through-pop-ups)

**Intermediaries and NNIP**
- [Infomediary business models (The Living Library)](https://thelivinglib.org/infomediary-business-models-for-connecting-open-data-providers-and-users)
- [How do non-profit open data intermediaries enhance open data usability? (TU Delft)](https://research.tudelft.nl/en/publications/how-do-non-profit-open-data-intermediaries-enhance-open-data-usab/)
- [Open data intermediaries (Springer, 2026)](https://link.springer.com/article/10.1007/s12525-026-00882-3)
- [Q&A with NNIP director Kathryn Pettit (Brookings)](https://www.brookings.edu/articles/building-neighborhood-data-to-inform-policy-a-qa-with-kathryn-pettit-director-of-the-national-neighborhood-indicators-partnership-nnip/)
- [National Neighborhood Indicators Partnership (ICMA)](https://icma.org/articles/article/national-neighborhood-indicators-partnership)
- [Urban Institute joins NNIP (UNC Charlotte, 2014)](https://inside.charlotte.edu/news-features/2014-08-05/urban-institute-joins-national-neighborhood-indicator-partnership/)
- [NNIP convening hosted by Data You Can Use (Johnson Center)](https://johnsoncenter.org/blog/were-better-together-a-reflection-on-the-national-neighborhood-indicators-partnership-nnip-convening/)
- [Guide to Data Chats (Urban Institute)](https://www.urban.org/research/publication/guide-data-chats-convening-community-conversations-about-data)
- [Data You Can Use (Urban Milwaukee)](https://urbanmilwaukee.com/business/data-you-can-use/)
- [Data You Can Use (its own site)](https://datayoucanuse.org/)
- [NNIP partner profile: Milwaukee](https://neighborhoodindicators.org/partner/127.html)
- [NNIP story: Amani neighborhood traffic safety](https://www.neighborhoodindicators.org/library/stories/milwaukee%E2%80%99s-amani-neighborhood-uses-data-target-traffic-safety-and-build)

**Federal direction**
- [Preparing open data for the age of AI (Commerce)](https://www.commerce.gov/news/blog/2024/01/preparing-open-data-age-ai)
- [FCSM 25-03: AI-Ready Federal Statistical Data (PDF)](https://www.fcsm.gov/assets/files/docs/FCSM.25.03_AI-Ready-Extension-Data-Quality.pdf)
- [Open Census MCP server concept of operations](https://glama.ai/mcp/servers/@brockwebb/open-census-mcp-server/blob/702a267ab23ee4d1532fc9fe88f9b2458ce5922b/docs/requirements/conops.md)
- [Bringing census flow data to life with LLMs (UK Data Service)](https://blog.ukdataservice.ac.uk/census-data-and-cordial-ai/)

**Market context**
- [News deserts hit new high (Medill, 2025)](https://www.medill.northwestern.edu/news/2025/news-deserts-hit-new-high-and-50-million-have-limited-access-to-local-news-study-finds.html)
- [State of local news coverage (Fortune, 2025)](https://www.fortune.com/2025/10/21/medill-state-of-local-news-crisis-local-journalism-news-deserts)
- [New report maps a shortage of local journalists (Nieman Lab, 2025)](https://www.niemanlab.org/2025/07/new-report-maps-a-severe-shortage-of-local-journalists-in-the-u-s/)
- [Here's how many journalists cover your town (Axios, 2025)](https://www.axios.com/2025/07/22/local-journalists-npr-pbs)
- [A survey of municipal open data repositories in the US (Wilson and Cong)](https://ideas.repec.org/a/igg/jepr00/v9y2020i4p1-22.html)
- [Open data portals in the 100 largest US cities (Tai and Mossberger, APPAM 2015)](https://appam.confex.com/appam/2015/webprogram/Paper14384.html)
- [Local open data portal metadata (Xiao, Jeng and He, 2018)](https://d-scholarship.pitt.edu/36734/)
- [About the US City Open Data Census](https://us-cities.survey.okfn.org/about/index.html)
