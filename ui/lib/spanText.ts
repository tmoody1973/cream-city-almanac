import type { SpanResult } from "@/lib/ask/tools";

// The span card's words (spec 2026-10-12-time-spans-design.md §7), written by code from the server's numbers.
export type SpanOk = Extract<SpanResult, { status: "ok" }>;
export const MIN_CASES = 10;
const enough = (g: { cases: number; median: number | null }) => g.cases >= MIN_CASES && g.median !== null;

export function durationText(v: number | null, unit: "days" | "minutes"): string {
  if (v === null || !Number.isFinite(v)) return "too few to say";
  if (unit === "minutes") {
    if (v < 60) return `${(Math.round(v * 10) / 10).toFixed(1)} minutes`;
    const m = Math.round(v);
    return `${Math.floor(m / 60)} h ${m % 60} min`;
  }
  const d = v < 10 ? Math.round(v * 10) / 10 : Math.round(v);
  return `${d.toLocaleString("en-US")} ${d === 1 ? "day" : "days"}`;
}
// A group's median or 9-in-10, or "too few to say" under 10 cases.
export const cellTime = (g: { cases: number }, v: number | null, unit: "days" | "minutes") => (g.cases < MIN_CASES ? "too few to say" : durationText(v, unit));

export const spanTitle = (r: SpanOk) => [r.name, r.pair.name, ...(r.groupBy ? [`by ${r.groupBy === "year" ? "year" : r.groupBy}`] : [])].join(" · ");

export function spanSummary(r: SpanOk): string {
  const t = (v: number | null) => durationText(v, r.pair.unit);
  if (r.all.cases < MIN_CASES) return `Too few ${r.pair.things} were measured to say how long they took ${r.pair.toWhat} (${r.all.cases.toLocaleString("en-US")} measured).`;
  const head = `half of the ${r.pair.things} measured took ${t(r.all.median)} or less ${r.pair.toWhat}`;
  const ranked = r.groups.filter(enough).sort((a, b) => b.median! - a.median!);
  if (!r.groupBy || ranked.length < 2) return `${head[0].toUpperCase()}${head.slice(1)}; 9 in 10 took ${t(r.all.p90)} or less.`;
  const slow = ranked[0], fast = ranked.at(-1)!;
  return `Overall, ${head}. Slowest: ${slow.label} (${t(slow.median)}); fastest: ${fast.label} (${t(fast.median)}).`;
}

export function spanNotes(r: SpanOk): { warning: string | null; notes: string[] } {
  const a = r.all;
  const n = (x: number) => x.toLocaleString("en-US");
  const rows = a.cases + a.open + a.unreadable + a.backwards;
  const newest = r.groupBy === "year" ? r.groups[0] : undefined;
  return {
    // When more lack an end date than were measured (311: 17,175 vs 10,599), the times describe only the minority.
    warning: [
      ...(a.open > a.cases ? [`${n(a.open)} ${r.pair.things} have no end date, more than the ${n(a.cases)} measured, so these times describe only the ${r.pair.things} that have one.`] : []),
      ...(rows > 0 && a.unreadable * 5 > rows ? ["More than 1 in 5 dates here couldn't be read, so treat these times with caution."] : []),
    ].join(" ") || null,
    notes: [
      ...(a.open > 0 ? [r.pair.missing.replace("{n}", n(a.open))] : []),
      ...(a.unreadable > 0 ? [`${n(a.unreadable)} dates couldn't be read and were left out.`] : []),
      ...(a.backwards > 0 ? [`${n(a.backwards)} had the later date before the earlier one and were left out.`] : []),
      ...(r.overlap ? [`One of the ${r.pair.things} can count in more than one ${r.groupBy}.`] : []),
      ...(newest && newest.open > 0 ? ["Recent years look faster than they are: their slowest cases aren't closed yet."] : []),
      r.pair.caveat,
      ...(r.coverage ? [`The City's data here covers ${r.coverage}.`] : []),
      `Period: ${r.period}.`,
      ...(r.filters.length ? [`Only: ${r.filters.join(", ")}.`] : []),
      ...(r.groups.some((g) => g.cases < MIN_CASES) ? [`“Too few to say” means fewer than ${MIN_CASES} measured cases.`] : []),
    ],
  };
}

// The table's rows: each group, then the cut-off rest, flagged so a real group named "Other" keeps its times.
export type SpanRow = { label: string; cases: number; median: number | null; p90: number | null; open: number | null; rest: boolean };
export const spanRows = (r: SpanOk): SpanRow[] => [
  ...r.groups.map((g) => ({ ...g, rest: false })),
  ...(r.other > 0 ? [{ label: "All other groups", cases: r.other, median: null, p90: null, open: null, rest: true }] : []),
];
