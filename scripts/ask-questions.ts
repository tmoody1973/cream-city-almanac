import { ASK_EXAMPLES } from "../lib/ask/examples";
import type { AskToolName } from "../lib/ask/tools";

// final: grade only the last call of the tool — the card the person reads as the answer (earlier counts fold away).
export interface AskQuestion { q: string; tool: AskToolName | AskToolName[]; expect: Record<string, string | number>; final?: boolean }

export const ASK_QUESTIONS: AskQuestion[] = [
  { q: "How many kids under 5 live in poverty in Harambee?", tool: "getNumber", expect: { neighborhood: "Harambee", slug: "poverty-status-by-age" } },
  { q: "What do renters pay in Lincoln Park?", tool: "getNumber", expect: { neighborhood: "Lincoln Park", slug: "rent-paid" } },
  { q: "How many households in Harambee have no car?", tool: "getNumber", expect: { slug: "vehicles-per-household" } },
  { q: "Employment by sex in Lincoln Park", tool: "getNumber", expect: { slug: "employment-status-by-sex" } },
  { q: "How old are the homes in Harambee?", tool: "getNumber", expect: { slug: "bedrooms-and-year" } },
  { q: "How do people in Harambee get to work?", tool: "getNumber", expect: { slug: "commute-method-and-time" } },
  { q: "Is there data on asthma in Milwaukee?", tool: "searchCatalog", expect: { code: "W01" } },
  { q: "Which datasets cover old housing?", tool: "searchCatalog", expect: { code: "H05" } },
  { q: "What has the air been like in Milwaukee lately?", tool: "previewData", expect: { code: "V02" } },
  { q: "Show me the daily air quality readings", tool: "previewData", expect: { code: "V02" } },
  { q: "What does the asthma prevalence dataset measure?", tool: "showDataset", expect: { code: "W01" } },
  { q: "What are the caveats on Housing Built Before 1950?", tool: "showDataset", expect: { code: "H05" } },
  { q: "What did the Harambee neighborhood report say about housing?", tool: "readReport", expect: {} },
  { q: "What are the key takeaways for Lincoln Park?", tool: "readReport", expect: {} },
  { q: "How should I interpret the neighborhood tables?", tool: "readReport", expect: {} },
  // The right answer is a refusal to combine rows (spec §5): any search is fine, no getNumber needed.
  { q: "Average poverty across all neighborhoods", tool: "searchCatalog", expect: {} },
  // No such place: the right answer says so without inventing one, whichever tool found that out.
  { q: "Poverty in Narnia", tool: ["getNumber", "searchCatalog"], expect: {} },
  { q: "Which neighborhood has the most renters?", tool: "searchCatalog", expect: {} },
  { q: "Educational attainment in Harambee", tool: "getNumber", expect: { slug: "educational-attainment" } },
  { q: "Race and ethnicity in Lincoln Park", tool: "getNumber", expect: { slug: "race-and-ethnicity" } },
  // Story angles: grounded in the datasets' sheets (showDataset), naming the codes they draw on, no figures.
  { q: "Give me story angles about old housing and health in Milwaukee", tool: "showDataset", expect: { code: "H05" } },
  { q: "What stories could I do with the daily air quality data?", tool: "showDataset", expect: { code: "V02" } },
  // City of Milwaukee (Phase 4): counts come from countRecords; a choose; a privacy refusal.
  { q: "How many robberies were reported in police district 6 this year?", tool: "countRecords", expect: {} },
  { q: "How many pothole requests did the City get each month this year?", tool: "countRecords", expect: {} },
  { q: "Count car break-ins in Milwaukee last month", tool: "countRecords", expect: {} },
  { q: "How many robberies were there in Harambee this year?", tool: "countRecords", expect: { area: "Harambee", filter: "Robbery", period: "Jan 1, 2026" }, final: true },
  { q: "How many fire calls were there in Riverwest each month this year?", tool: "countRecords", expect: { area: "Riverwest" } },
  { q: "How many burglaries were there in Gotham Heights this year?", tool: "countRecords", expect: { status: "no-neighborhood" } },
  { q: "Is there City data on vacant buildings?", tool: "searchCatalog", expect: {} },
  { q: "Who owns the property at 2263 N Lake Dr?", tool: ["searchCatalog", "showDataset"], expect: {} },
  // Ask analyzes (tract rankings, change over time, relationships): graded on the honest outcome, not a column name — the
  // last card is E02 and has margins (City's poverty columns have none, so a City answer can't claim a finding).
  { q: "Where is food insecurity low despite high poverty?", tool: "relateTracts", expect: { code: "E02", mode: "mismatch", confidence: "90% confidence (Census)" }, final: true },
  { q: "Which census tracts have the highest poverty rate?", tool: "rankTracts", expect: { code: "E02", confidence: "90% confidence (Census)" }, final: true },
  { q: "Where did poverty grow most from 2022 to 2023?", tool: "compareYears", expect: { code: "E02", confidence: "90% confidence (Census)" }, final: true },
  { q: "Is asthma higher where poverty is higher?", tool: "relateTracts", expect: { mode: "relate" }, final: true },
  // Guide examples that made room for the three above, kept on the card.
  { q: "What did the Harambee neighborhood report say about housing?", tool: "readReport", expect: {} },
  { q: "How many adults in Harambee finished high school?", tool: "getNumber", expect: { slug: "educational-attainment" } },
  { q: "How old are the homes in Harambee?", tool: "getNumber", expect: { slug: "bedrooms-and-year" } },
];

// The guide's examples (/ask/guide) are graded too: any not already above joins the card.
for (const e of ASK_EXAMPLES) if (!ASK_QUESTIONS.some((q) => q.q === e.question)) ASK_QUESTIONS.push({ q: e.question, tool: e.tool, expect: e.expect });
