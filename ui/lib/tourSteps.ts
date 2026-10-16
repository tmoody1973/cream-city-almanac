// The tours' words and targets (spec 2026-10-14-start-here-and-tour §4.3). Targets are stable data-tour attributes,
// except Ask's input (the chat library's own textarea). A step lists fallbacks; the first visible one is used.
export type TourStep = { targets: string[]; title: string; content: string };

export const FRONT_STEPS: TourStep[] = [
  { targets: ['[data-tour="address"] input'], title: "START WITH YOUR ADDRESS", content: "Type where you live to find your neighborhood, its alder and polling place. Or search a topic just below." },
  { targets: ['[data-tour="three"]'], title: "THREE WAYS IN", content: "Find the data, read what it means, and see where every number came from." },
  { targets: ['[data-tour="data"]'], title: "WHAT'S HERE", content: "DYCU's catalog and the City's open data, counted live." },
  { targets: ['[data-tour="ask"]'], title: "OR JUST ASK", content: "Ask in plain English. Code finds the numbers; the AI never writes one." },
  { targets: ['[data-tour="start"]'], title: "WORKED EXAMPLES", content: "Start here shows three people's questions, and what you can ask." },
];

export const ASK_STEPS: TourStep[] = [
  { targets: ['section[aria-label="Ask"] textarea', '[data-tour="ask-signin"]'], title: "ASK HERE", content: "Ask about Milwaukee in plain English: a neighborhood, a ZIP code, an address, a City record." },
  { targets: ['[data-tour="ask-examples"]'], title: "NOT SURE WHAT TO ASK?", content: "Examples for reporters, nonprofits and residents, each checked against real answers." },
];

export const ASK_CARD_STEPS: TourStep[] = [
  { targets: ['[data-tour-card="tag"]'], title: "WHERE IT CAME FROM", content: "Every number carries its source: DYCU, CITY, CENSUS, or AI for words written by AI." },
  { targets: ['[data-tour-card="export"]'], title: "TAKE IT WITH YOU", content: "Download the card as a spreadsheet, text, or a picture." },
  { targets: ['[data-tour-card="share"]'], title: "SHARE A LINK", content: "A link that shows this exact card to anyone, no sign-in needed." },
  { targets: ['[data-tour-card="next"]'], title: "KEEP GOING", content: "Next questions that keep this card's place and period." },
];
