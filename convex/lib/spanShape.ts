import { MAX_GROUPS } from "./citySql";

export type SpanGroup = { label: string; cases: number; median: number | null; p90: number | null; open: number };
export type SpanAll = SpanGroup & { unreadable: number; backwards: number };

const count = (x: unknown) => { const n = Number(x); return Number.isFinite(n) ? n : 0; };
const time = (x: unknown) => (x === null || x === undefined || x === "" || !Number.isFinite(Number(x)) ? null : Number(x));

// The City's rows as numbers. A record with no group value is "(blank)". A group that measured nothing (0 cases: only
// open, unreadable or wrong-order dates, like a year group with no year) is dropped; the All row still counts those.
export function shapeSpan(groupRows: Record<string, unknown>[] | null, allRow: Record<string, unknown> | undefined, overlap: boolean, _byYear: boolean) {
  const groups: SpanGroup[] = (groupRows ?? [])
    .filter((r) => count(r.cases) > 0)
    .map((r) => ({ label: r.label === null || r.label === undefined || r.label === "" ? "(blank)" : String(r.label), cases: count(r.cases), median: time(r.median), p90: time(r.p90), open: count(r.open) }));
  const a = allRow ?? {};
  const all = { label: "All", cases: count(a.cases), median: time(a.median), p90: time(a.p90), open: count(a.open), unreadable: count(a.unreadable), backwards: count(a.backwards) };
  // Medians can't be combined, so the cut-off rest is a case count only; overlapping groups can't be summed at all.
  const cut = !overlap && (groupRows ?? []).length >= MAX_GROUPS;
  const other = cut ? Math.max(0, all.cases - groups.reduce((s, g) => s + g.cases, 0)) : 0;
  return { groups, other, all };
}
