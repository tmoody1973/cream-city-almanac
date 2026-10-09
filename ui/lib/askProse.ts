// Ask's model must not write figures; any number in its words is marked unverified,
// except a year (1900–2099), a dataset code like N03, an identifier with letters glued to its digits
// (Census table B17001, PM2.5), or a number inside a quoted label that the data itself returned word for word
// ("Under 5 years"). Quoted text the data never said ("608 children under 5") is the model's own, and flags.
// Definitions are not figures either (Tarik, 2026-10-08):
// age bands ("ages 20 to 64", "18 and older"), survey periods ("5-year"), and table numbers ("Table 11").
// Names and dates the person asked about are not figures either: "police district 6", "ward 12", "ZIP 53212",
// "2263 N Lake Dr", "December 31, 2023".
const NUMBER = /\b[A-Z]\d{2}\b|(?<![A-Za-z\d.])\d+(?:,\d{3})*(?:\.\d+)?%?/g;
const QUOTE_MARK = /["“”]/g;
// A district, ward or month-day number is a name only when what follows can't be the thing counted: punctuation (not
// a digit group, so "district 1,200 homes" and "district 6.5%" stay counts), the end, a year, or a small word.
// "In ward 120 requests were filed" and "In March 31 robberies were reported" are counts.
const NAME_ENDS = String.raw`(?=[;:!?)\]]|[,.](?!\d)|\s*$|\s*[–—]|\s+(?:(?:19|20)\d{2}\b|(?:and|or|nor|but|to|through|until|is|was|were|are|has|had|have|in|on|at|of|for|the|this|that|when|with|from|by|as|than|while)\b))`;
const named = (re: RegExp) => new RegExp(re.source + NAME_ENDS, re.flags);
const DEFINITIONS = [
  /\b(?:ages?|aged)\s+\d+(?:\s*(?:to|–|-)\s*\d+)?/gi,
  /\b\d+(?:\s*(?:to|–|-)\s*\d+)?\s+(?:years?\s+)?(?:and|or)\s+(?:older|over)\b/gi,
  /\b\d+-(?:year|month|week|day)\b/gi,
  /\btable\s+\d+\b/gi,
  named(/\b(?:(?:police|aldermanic|council|school)\s+)?district\s+\d{1,3}/gi),
  named(/\bward\s+\d{1,3}/gi),
  /\bzip(?:\s+code)?\s+\d{5}\b/gi,
  /\b\d{1,5}\s+[NSEW]\.?\s+[A-Z][a-z]+/g, // a street address; the direction is what tells it from a count
  named(/\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+\d{1,2}/g),
];

// Every pair of quote marks is tried, so a stray inch mark (5") can't shift which quote closes which.
function quotedFromData(text: string, data: string): [number, number][] {
  const marks = [...text.matchAll(QUOTE_MARK)].map((m) => m.index);
  const spans: [number, number][] = [];
  for (let i = 0; i < marks.length; i++)
    for (let j = i + 1; j < marks.length; j++) {
      const inner = text.slice(marks[i] + 1, marks[j]);
      if (/[a-z]/i.test(inner) && data.includes(inner)) spans.push([marks[i], marks[j] + 1]);
    }
  return spans;
}

// "72 hours", "30 days", "12 months": a rule or lag the dataset documents, allowed only when the data says the same.
const DURATION = /\b\d+\s+(?:hours?|days?|weeks?|months?)\b/gi;
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").replace(/s$/, "");
function documentedDurations(text: string, data: string): [number, number][] {
  const said = new Set([...data.matchAll(DURATION)].map((m) => norm(m[0])));
  return [...text.matchAll(DURATION)].filter((m) => said.has(norm(m[0]))).map((m): [number, number] => [m.index, m.index + m[0].length]);
}

function allowedSpans(text: string, data: string): [number, number][] {
  const defined = DEFINITIONS.flatMap((re) => [...text.matchAll(re)]).map((m): [number, number] => [m.index, m.index + m[0].length]);
  return [...quotedFromData(text, data), ...defined, ...documentedDurations(text, data)];
}

// `data` is what the conversation's tools returned (their results as text); quoted labels must come from it.
export function proseSegments(text: string, data = ""): { text: string; unverified: boolean }[] {
  const allowed = allowedSpans(text, data);
  const out: { text: string; unverified: boolean }[] = [];
  let last = 0;
  for (const m of text.matchAll(NUMBER)) {
    const token = m[0];
    const ok = /^[A-Z]\d{2}$/.test(token) || /^(19|20)\d{2}$/.test(token) || allowed.some(([a, b]) => m.index >= a && m.index < b);
    if (ok) continue;
    if (m.index > last) out.push({ text: text.slice(last, m.index), unverified: false });
    out.push({ text: token, unverified: true });
    last = m.index + token.length;
  }
  if (last < text.length) out.push({ text: text.slice(last), unverified: false });
  return out;
}
