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

export function yearShort(years: number[]): string {
  return years.length ? [...years].sort((a, b) => a - b).map((y) => String(y).slice(2)).join(" · ") : "—";
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
