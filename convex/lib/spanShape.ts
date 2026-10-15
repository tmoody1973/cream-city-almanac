import { MAX_GROUPS } from "./citySql";

export type SpanGroup = { label: string; cases: number; median: number | null; p90: number | null; open: number };
export type SpanAll = SpanGroup & { unreadable: number; backwards: number };

const count = (x: unknown) => { const n = Number(x); return Number.isFinite(n) ? n : 0; };
const time = (x: unknown) => (x === null || x === undefined || x === "" || !Number.isFinite(Number(x)) ? null : Number(x));

// The City's rows as numbers. A record with no group value is "(blank)". A group whose cases are all still open stays
// (it may be the slowest); one with neither measured nor open cases, and a year group with no year (unreadable "from"
// dates), is dropped; the All row still counts those.
// Under this many cases a group's times aren't shown (spec 2026-10-14-employee-tenure §6). In a file that names people
// they aren't even sent: the AI, the card, the CSV and share links all get null, so no one's tenure leaks.
export const MIN_CASES = 10;

export function shapeSpan(groupRows: Record<string, unknown>[] | null, allRow: Record<string, unknown> | undefined, overlap: boolean, byYear: boolean, namesPeople = false) {
  const withheld = <G extends { cases: number; median: number | null; p90: number | null }>(g: G): G => (namesPeople && g.cases < MIN_CASES ? { ...g, median: null, p90: null } : g);
  const groups: SpanGroup[] = (groupRows ?? [])
    .filter((r) => (count(r.cases) > 0 || count(r.open) > 0) && !(byYear && (r.label === null || r.label === undefined)))
    .map((r) => ({ label: r.label === null || r.label === undefined || r.label === "" ? "(blank)" : String(r.label), cases: count(r.cases), median: time(r.median), p90: time(r.p90), open: count(r.open) }));
  const a = allRow ?? {};
  const all = { label: "All", cases: count(a.cases), median: time(a.median), p90: time(a.p90), open: count(a.open), unreadable: count(a.unreadable), backwards: count(a.backwards) };
  // In a file that names people, a group under 10 isn't shown at all (Tarik, 2026-10-14): its count with its label can
  // single someone out. Its cases join the rest, and a rest under 10 isn't shown either.
  const shown = namesPeople ? groups.filter((g) => g.cases >= MIN_CASES) : groups;
  // Medians can't be combined, so the cut-off rest is a case count only; overlapping groups can't be summed at all.
  const cut = !overlap && ((groupRows ?? []).length >= MAX_GROUPS || shown.length < groups.length);
  const rest = cut ? Math.max(0, all.cases - shown.reduce((s, g) => s + g.cases, 0)) : 0;
  const other = namesPeople && rest < MIN_CASES ? 0 : rest;
  return { groups: shown, other, all: withheld(all) };
}
