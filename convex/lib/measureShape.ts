import { MAX_GROUPS } from "./citySql";

export type MeasureGroup = { label: string; n: number; total: number | null; median: number | null; average: number | null; hidden: boolean };
export type MeasureAll = { n: number; total: number | null; median: number | null; average: number | null; unreadable: number; zeros: number };
export type MeasureOther = { n: number; total: number | null; hidden: boolean };
export const MIN_GROUP = 5; // groups under this many records are hidden in files that name people

const count = (x: unknown) => { const n = Number(x); return Number.isFinite(n) ? n : 0; };
const amount = (x: unknown) => (x === null || x === undefined || x === "" || !Number.isFinite(Number(x)) ? null : Number(x));

// The City's rows as numbers. In a file that names people, a group under 5 records loses its figures; when that hides
// exactly one group, the next-smallest hides too, so the shown groups can't be subtracted from the All row to recover it.
export function shapeMeasure(groupRows: Record<string, unknown>[] | null, allRow: Record<string, unknown> | undefined, o: { namesPeople: boolean; byYear: boolean }) {
  const a = allRow ?? {};
  const all: MeasureAll = { n: count(a.n), total: amount(a.total), median: amount(a.median), average: amount(a.average), unreadable: count(a.unreadable), zeros: count(a.zeros) };
  const raw = (groupRows ?? [])
    .filter((r) => !(o.byYear && (r.g === null || r.g === undefined) && count(r.n) === 0))
    .map((r) => ({ label: r.g === null || r.g === undefined || r.g === "" ? "(blank)" : String(r.g), n: count(r.n), total: amount(r.total), median: amount(r.median), average: amount(r.average) }));
  const hide = new Set<number>();
  if (o.namesPeople) {
    raw.forEach((g, i) => { if (g.n < MIN_GROUP) hide.add(i); });
    if (hide.size === 1 && raw.length > 1) {
      const next = raw.map((g, i) => ({ g, i })).filter(({ i }) => !hide.has(i)).sort((x, y) => x.g.n - y.g.n)[0];
      if (next) hide.add(next.i);
    }
  }
  const groups: MeasureGroup[] = raw.map((g, i) => (hide.has(i) ? { ...g, total: null, median: null, average: null, hidden: true } : { ...g, hidden: false }));
  let other: MeasureOther | null = null;
  if ((groupRows ?? []).length >= MAX_GROUPS) {
    const n = all.n - raw.reduce((s, g) => s + g.n, 0);
    if (n > 0) {
      const hidden = o.namesPeople && n < MIN_GROUP;
      const total = all.total === null ? null : all.total - raw.reduce((s, g) => s + (g.total ?? 0), 0);
      other = { n, total: hidden ? null : total, hidden };
    }
  }
  return { groups, other, all };
}
