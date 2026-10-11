import type { AskToolName } from "./tools";

// The guide's example questions (/ask/guide), one list for the page and the report card: every example is graded
// against the real model (npm run ask:card -- --examples) before it ships.
export type AskRole = "journalist" | "nonprofit" | "citizen";

export const ASK_ROLES: { id: AskRole; who: string; purpose: string }[] = [
  { id: "journalist", who: "A JOURNALIST", purpose: "Figures with their margins, what a report says, the caveats to check before you publish, and story angles." },
  { id: "nonprofit", who: "A NONPROFIT", purpose: "Grant-ready figures for a neighborhood, what a table covers, and a report's key takeaways." },
  { id: "citizen", who: "A CITIZEN", purpose: "How the air has been, what data exists on a topic, and how to read the tables." },
];

export const ASK_EXAMPLES: { role: AskRole; question: string; tool: AskToolName | AskToolName[]; expect: Record<string, string | number> }[] = [
  { role: "journalist", question: "Give me story angles about old housing and health in Milwaukee", tool: "showDataset", expect: { code: "H05" } },
  { role: "journalist", question: "What are the caveats on Housing Built Before 1950?", tool: "showDataset", expect: { code: "H05" } },
  { role: "journalist", question: "How many kids under 5 live in poverty in Harambee?", tool: "getNumber", expect: { neighborhood: "Harambee", slug: "poverty-status-by-age" } },
  { role: "journalist", question: "Where is food insecurity low despite high poverty?", tool: "relateTracts", expect: { mode: "mismatch" } },
  { role: "nonprofit", question: "How many households in Harambee have no car?", tool: "getNumber", expect: { slug: "vehicles-per-household" } },
  { role: "nonprofit", question: "What do renters pay in Lincoln Park?", tool: "getNumber", expect: { neighborhood: "Lincoln Park", slug: "rent-paid" } },
  { role: "nonprofit", question: "What are the key takeaways for Lincoln Park?", tool: "readReport", expect: {} },
  { role: "nonprofit", question: "Which census tracts have the highest poverty rate?", tool: "rankTracts", expect: { code: "E02" } },
  { role: "citizen", question: "Is asthma higher where poverty is higher?", tool: "relateTracts", expect: { mode: "relate" } },
  { role: "citizen", question: "What has the air been like in Milwaukee lately?", tool: "previewData", expect: { code: "V02" } },
  { role: "citizen", question: "Is there data on asthma in Milwaukee?", tool: "searchCatalog", expect: { code: "W01" } },
  { role: "citizen", question: "What does margin of error mean on these tables?", tool: "readReport", expect: {} },
];

export const examplesFor = (role: AskRole) => ASK_EXAMPLES.filter((e) => e.role === role);
