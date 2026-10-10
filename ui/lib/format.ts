import type { HubKind } from "../../convex/lib/types";

const MONTH_DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export function shortDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : MONTH_DAY.format(d);
}

export function asOfLabel(ms: number): string {
  return MONTH_DAY.format(new Date(ms));
}

export function todayLabel(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("weekday")} ${get("month")} ${get("day")}, ${get("year")}`;
}

export function yearSpan(years: number[]): string {
  const sorted = [...new Set(years)].sort((a, b) => a - b);
  const runs: number[][] = [];
  for (const y of sorted) {
    const last = runs[runs.length - 1];
    if (last && y === last[last.length - 1] + 1) last.push(y);
    else runs.push([y]);
  }
  return runs.map((r) => (r.length === 1 ? `${r[0]}` : `${r[0]}–${r[r.length - 1]}`)).join(", ");
}

const RANGE_MIN = 4; // runs this long read as "21–24"; shorter runs keep the comp's "22 · 23 · 24"

export function yearShort(years: number[]): string {
  if (!years.length) return "—";
  const two = (y: number) => String(y).slice(2);
  const runs: number[][] = [];
  for (const y of [...new Set(years)].sort((a, b) => a - b)) {
    const last = runs[runs.length - 1];
    if (last && y === last[last.length - 1] + 1) last.push(y);
    else runs.push([y]);
  }
  return runs.map((r) => (r.length >= RANGE_MIN ? `${two(r[0])}–${two(r[r.length - 1])}` : r.map(two).join(" · "))).join(" · ");
}

export function placeSummary(kind: HubKind, places: string[]): string {
  if (kind === "app") return "web app";
  if (kind === "page") return "Hub page";
  if (places.length > 3) return `${places.length} neighborhoods`;
  return places.join(" · ");
}

export function subline(row: { kind: HubKind; places: string[]; years: number[] }): string {
  return [placeSummary(row.kind, row.places), yearSpan(row.years)].filter(Boolean).join(" · ");
}

// A sentence ends at . ! or ? followed by a space, except after initials ("U.S.") or common abbreviations.
const SENTENCE = /^.*?(?<!\b(?:[A-Z]|vs|e\.g|i\.e|St|Dr|No|Mt))[.!?](?=\s|$)/;

export function firstSentence(text: string): string {
  return SENTENCE.exec(text.trim())?.[0] ?? text.trim();
}

const LEAD_IN = /^(?:this|the) (?:dataset|data set|data|map|dashboard|report|app|tool|spreadsheet) (?:measures|estimates|shows|tracks|counts|lists|maps|describes|reports)\s+/i;
const EXPLAINER_MAX = 160;
const MIN_CLAUSE = 40;

// End of the last top-level clause (a comma outside parentheses) that keeps the line within max.
function lastClauseEnd(text: string, max: number): number {
  let depth = 0;
  let end = -1;
  for (let i = 0; i < Math.min(text.length, max); i++) {
    const ch = text[i];
    if (ch === "(") depth++;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    else if (ch === "," && depth === 0 && i >= MIN_CLAUSE) end = i;
  }
  return end;
}

const PARENTHETICAL = /\s*\([^()]*\)/g;

// The in-place preview promises a one-line explainer: the first sentence without a "This dataset measures" lead-in.
// When that is long: cut at its last whole clause; failing that, drop the parenthetical definitions (the full sheet
// keeps them) and try again; failing that, show the whole sentence. Never a cut mid-word.
export function shortExplainer(text: string, max = EXPLAINER_MAX): string {
  const sentence = firstSentence(text).replace(LEAD_IN, "");
  const line = sentence.charAt(0).toUpperCase() + sentence.slice(1);
  if (line.length <= max) return line;
  const clause = lastClauseEnd(line, max);
  if (clause > 0) return `${line.slice(0, clause)}.`;
  const plain = line.replace(PARENTHETICAL, "");
  if (plain.length <= max) return plain;
  const plainClause = lastClauseEnd(plain, max);
  return plainClause > 0 ? `${plain.slice(0, plainClause)}.` : plain;
}

// A row in a sheet's ALL VERSIONS list. DYCU versions differ by place and year; City versions all sit in "City" with
// no years, so they go by the City's own word ("Current", "Historical") or their title.
export function versionLabel(m: { title: string; place: string | null; years: number[]; yearLabel: string | null }, city: boolean): string {
  if (city) {
    const word = m.title.match(/\((current|historical)\)\s*$/i)?.[1];
    return word ? word[0].toUpperCase() + word.slice(1).toLowerCase() : m.title.trim();
  }
  return [m.place, m.yearLabel ?? yearSpan(m.years)].filter(Boolean).join(" · ") || m.title;
}
