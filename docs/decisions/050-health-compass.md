# 050: Ask answers health "where" questions by ZIP code from Health Compass Milwaukee

**Decision:** Ask adds Health Compass Milwaukee as a source. Health Compass is the Milwaukee Health Care Partnership's data site, run by Ascension, Aurora, Children's Wisconsin and Froedtert ThedaCare, and powered by Metopio.
- **Stored weekly:** its figures for the 37 ZIP codes that touch Milwaukee County, for the county, and for the city.
- **Routing:** "where" questions about health, food, poverty and similar measures go to these ZIP answers.
- **Places:** each ZIP is named by the City neighborhoods inside it.
- **Credit:** every figure carries Health Compass's credit, the original source, the period and a link, on the card and in every download and share link.

**Why this came up:**
- Ask answered "Where is food insecurity low despite high poverty?" with census tracts, dataset codes and a list of 11 datasets. A reader doesn't know what a census tract (a small Census area of a few thousand people) is.
- Tarik ran the same question through a general AI agent. It answered by ZIP code from Health Compass:
  - one bold sentence naming the place;
  - each place's figures beside a citywide benchmark;
  - the cutoff stated plainly;
  - the survey question quoted;
  - one limitation;
  - its sources.

  Tarik preferred it. But the agent did its own arithmetic and slipped: it screened at 16% while saying 16.3%, which dropped one ZIP. It also showed no margins of error (the range the true value probably sits in).

**Options:**
- **Add Health Compass now, by ZIP (chosen).** Ask gains local measures it didn't have: the 2024 community survey, hospital emergency visits by ZIP, births and deaths. Cost: a new outside source to keep up with, whose API "may change without notice".
- **Link to Health Compass only.** Nothing new to maintain, but Ask still couldn't answer the question.
- **Keep tract answers and reword them.** This is still planned (neighborhood answers built from tracts), but it doesn't add the survey or hospital data.

**What we chose and why (Tarik, 2026-10-15, with Claude):**
- **ZIP codes, because people know them.** A census tract means nothing to most readers.
- **Code does the math with Health Compass's own standard errors** (the number a margin of error is built from). The card shows 95% ranges, and the AI never writes a number.
- **The card takes the agent's shape:** the answer first in bold, then the figures, the measure's own words, the cutoff and one limitation.
- **Credit stays attached everywhere the figures go.**

**What we gave up:**
- **Group breakdowns** (by race, sex or age), though Health Compass publishes some.
- **Health Compass's tract and town data, and older periods.**
- **A clean headline for the example question.** Once ranges are counted, the agent's "clearest lead" (ZIP 53208) is only a possible match: its food-hardship range reaches past the county's figure, and its poverty sits right at the cutoff for "high". The card says so rather than overstating it.
- **One answer for "food insecurity".** Two Health Compass measures fit the words equally (the 2024 survey and Feeding America's estimate), so Ask asks which one.

**How we'll know if this was right:**
- The graded questions reach the new ZIP tool, and questions that name census tracts still reach the tract tools.
- On dev, 53208's survey food hardship reads 9.71% with its range, against the county's 13.85%.
- Every export of the card carries the credit (a unit test fails otherwise).
- Readers ask follow-ups by ZIP, and nobody reports a ZIP figure that doesn't match Health Compass's own map.

**What actually happened:**
