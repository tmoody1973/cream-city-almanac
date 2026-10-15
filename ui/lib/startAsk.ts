// Start here's "What you can ask" (spec 2026-10-14-start-here-and-tour §3). Every question is in the graded set
// (scripts/ask-questions.ts), so the page never offers one the real AI hasn't been checked on.
export const START_ASK: { label: string; line: string; question: string }[] = [
  { label: "CITY RECORDS", line: "Counts, maps and totals from the City's live files.", question: "How many robberies were there in Harambee this year?" },
  { label: "HOW LONG", line: "How long City cases take, or have been open so far.", question: "How long have Milwaukee's vacant buildings been vacant?" },
  { label: "HISTORY", line: "Crime and home values back to 2005, police stops, voter turnout, and Fire Department calls since 2015.", question: "Has the Fire Department's time to arrive changed since 2015?" },
  { label: "NEIGHBORHOODS & ADDRESSES", line: "Fact sheets, and which neighborhood, district and ward an address is in.", question: "Which neighborhood is 2400 W Center St in?" },
  { label: "ZIP CODES", line: "Who lives in a ZIP code, beside Milwaukee.", question: "What is the demographic makeup of 53228?" },
  { label: "CENSUS TRACTS", line: "Rank tracts, see change over time, or where two measures go together.", question: "Where is food insecurity low despite high poverty?" },
  { label: "CITY EMPLOYEES", line: "How long people have worked for the City.", question: "How long have City of Milwaukee employees worked for the City?" },
];
