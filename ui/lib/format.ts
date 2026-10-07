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
  if (places.length > 3) return `${places.length} neighborhoods`;
  return places.join(" · ");
}

export function subline(row: { kind: HubKind; places: string[]; years: number[] }): string {
  return [placeSummary(row.kind, row.places), yearSpan(row.years)].filter(Boolean).join(" · ");
}

export function firstSentence(text: string): string {
  return /^.*?[.!?](?=\s|$)/.exec(text.trim())?.[0] ?? text.trim();
}

const LEAD_IN = /^(?:this|the) (?:dataset|data set|data|map|dashboard|report|app|tool|spreadsheet) (?:measures|estimates|shows|tracks|counts|lists|maps|describes|reports)\s+/i;
const EXPLAINER_MAX = 100;

// The in-place preview promises a one-line explainer: first sentence, no "This dataset measures" lead-in,
// cut at a word boundary.
export function shortExplainer(text: string, max = EXPLAINER_MAX): string {
  const sentence = firstSentence(text).replace(LEAD_IN, "");
  const line = sentence.charAt(0).toUpperCase() + sentence.slice(1);
  if (line.length <= max) return line;
  const cut = line.slice(0, max - 1);
  return `${cut.slice(0, cut.lastIndexOf(" ")).replace(/[\s,;:–—-]+$/, "")}…`;
}
