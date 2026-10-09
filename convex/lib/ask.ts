import { TOPICS } from "./portrait";

// Ask's day, limits and prices. Days are Milwaukee's (America/Chicago), so limits reset at local midnight.
export function chicagoDay(ms: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(ms);
}

export function dailyLimit(
  identity: { email?: string; emailVerified?: boolean },
  s: { askDailyLimit: number; askNewsroomLimit: number; askNewsroomDomains: string[] },
): number {
  const domain = identity.email?.split("@")[1]?.toLowerCase();
  return identity.emailVerified === true && domain && s.askNewsroomDomains.includes(domain) ? s.askNewsroomLimit : s.askDailyLimit;
}

export function costUsd(u: { inputTokens: number; outputTokens: number }, s: { askInputUsdPerToken: number; askOutputUsdPerToken: number }): number {
  return u.inputTokens * s.askInputUsdPerToken + u.outputTokens * s.askOutputUsdPerToken;
}

const norm = (s: string) => s.trim().toLowerCase().replace(/[\s_-]+/g, " ");

export function matchTopic(name: string): (typeof TOPICS)[number] | null {
  const n = norm(name);
  return TOPICS.find((t) => [t.topic, t.slug, ...(t.aliases ?? [])].some((x) => norm(x) === n)) ?? null;
}

// An exact label wins; otherwise one partial match; several are returned for the model to choose from.
// Some tables repeat a label under different sections ("30.0 to 34.9%" with and without a mortgage), so a repeated
// label is offered as "Section › Label", and that form picks exactly one row. Rows come back with their index.
export function pickRow<R extends { label: string; heading?: boolean }>(rows: R[], wanted: string): { row: R; index: number } | { choose: string[] } {
  let section = "";
  const named = rows.map((row, index) => {
    if (row.heading) section = row.label;
    return { row, index, full: section && !row.heading ? `${section} › ${row.label}` : row.label };
  });
  const w = norm(wanted);
  const qualified = named.filter((n) => norm(n.full) === w);
  if (qualified.length === 1) return { row: qualified[0].row, index: qualified[0].index };
  const exact = named.filter((n) => norm(n.row.label) === w);
  if (exact.length === 1) return { row: exact[0].row, index: exact[0].index };
  if (exact.length > 1) return { choose: exact.map((n) => n.full) };
  const partial = named.filter((n) => norm(n.row.label).includes(w));
  if (partial.length === 1) return { row: partial[0].row, index: partial[0].index };
  const options = partial.length ? partial : named;
  const repeated = (label: string) => options.filter((o) => o.row.label === label).length > 1;
  return { choose: options.map((n) => (repeated(n.row.label) ? n.full : n.row.label)) };
}

// A report's table of contents answers no question: chapter titles, then a column of bare page numbers.
export function isContentsPassage(section: string, text: string): boolean {
  if (/table of contents|^contents$/i.test(section.trim())) return true;
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  return lines.length > 0 && lines.filter((l) => /^\d{1,3}$/.test(l)).length / lines.length >= 0.3;
}
