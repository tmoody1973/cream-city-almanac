// Ask's model must not write figures; any number in its words is marked unverified,
// except a year (1900–2099), a dataset code like N03, an identifier with letters glued to its digits
// (Census table B17001, PM2.5), or a number inside a quoted row label ("Under 5 years").
// A quoted bare figure ("608") is still a figure. Definitions are not figures either (Tarik, 2026-10-08):
// age bands ("ages 20 to 64", "18 and older"), survey periods ("5-year"), and table numbers ("Table 11").
const NUMBER = /\b[A-Z]\d{2}\b|(?<![A-Za-z\d.])\d+(?:,\d{3})*(?:\.\d+)?%?/g;
const QUOTED = /["“][^"”]*["”]/g;
const DEFINITIONS = [
  /\b(?:ages?|aged)\s+\d+(?:\s*(?:to|–|-)\s*\d+)?/gi,
  /\b\d+(?:\s*(?:to|–|-)\s*\d+)?\s+(?:years?\s+)?(?:and|or)\s+(?:older|over)\b/gi,
  /\b\d+-(?:year|month|week|day)\b/gi,
  /\btable\s+\d+\b/gi,
];

function allowedSpans(text: string): [number, number][] {
  const quoted = [...text.matchAll(QUOTED)].filter((m) => /[a-z]/i.test(m[0]));
  const defined = DEFINITIONS.flatMap((re) => [...text.matchAll(re)]);
  return [...quoted, ...defined].map((m) => [m.index, m.index + m[0].length]);
}

export function proseSegments(text: string): { text: string; unverified: boolean }[] {
  const allowed = allowedSpans(text);
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
