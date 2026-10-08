// Ask's model must not write figures; any number in its words is marked unverified,
// except a year (1900–2099) or a dataset code like N03.
const NUMBER = /\b[A-Z]\d{2}\b|\d[\d,]*(?:\.\d+)?%?/g;

export function proseSegments(text: string): { text: string; unverified: boolean }[] {
  const out: { text: string; unverified: boolean }[] = [];
  let last = 0;
  for (const m of text.matchAll(NUMBER)) {
    const token = m[0];
    const allowed = /^[A-Z]\d{2}$/.test(token) || /^(19|20)\d{2}$/.test(token);
    if (allowed) continue;
    if (m.index > last) out.push({ text: text.slice(last, m.index), unverified: false });
    out.push({ text: token, unverified: true });
    last = m.index + token.length;
  }
  if (last < text.length) out.push({ text: text.slice(last), unverified: false });
  return out;
}
