import type { AskToolName } from "../lib/ask/tools";

export interface AskQuestion { q: string; tool: AskToolName | AskToolName[]; expect: Record<string, string | number> }

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
];
