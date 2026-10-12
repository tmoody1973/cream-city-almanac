import { MAX_GROUPS } from "./citySql";

export type MeasureGroup = { label: string; n: number; total: number | null; median: number | null; average: number | null; hidden: boolean };
export type MeasureAll = { n: number; total: number | null; median: number | null; average: number | null; unreadable: number; zeros: number };
export type MeasureOther = { n: number; total: number | null; hidden: boolean };
export const MIN_GROUP = 5; // groups under this many records are hidden in files that name people

const count = (x: unknown) => { const n = Number(x); return Number.isFinite(n) ? n : 0; };
const amount = (x: unknown) => (x === null || x === undefined || x === "" || !Number.isFinite(Number(x)) ? null : Number(x));

// The City's rows as numbers. In a file that names people, a group under 5 records loses its figures, and so does a
// cut-off "All other groups" line under 5. The hidden lines are one set: while it is a single line, or under 5 records
// together, the next-smallest group hides too, so nobody can subtract the shown lines from the All row to recover a
// person or a pair. Fewer than 5 records in all hides the All row's figures.
export function shapeMeasure(groupRows: Record<string, unknown>[] | null, allRow: Record<string, unknown> | undefined, o: { namesPeople: boolean; byYear: boolean }) {
  const a = allRow ?? {};
  const read: MeasureAll = { n: count(a.n), total: amount(a.total), median: amount(a.median), average: amount(a.average), unreadable: count(a.unreadable), zeros: count(a.zeros) };
  const raw = (groupRows ?? [])
    .filter((r) => !(o.byYear && (r.g === null || r.g === undefined) && count(r.n) === 0))
    .map((r) => ({ label: r.g === null || r.g === undefined || r.g === "" ? "(blank)" : String(r.g), n: count(r.n), total: amount(r.total), median: amount(r.median), average: amount(r.average) }));
  const restN = (groupRows ?? []).length >= MAX_GROUPS ? read.n - raw.reduce((t, g) => t + g.n, 0) : 0;
  const restHidden = o.namesPeople && restN > 0 && restN < MIN_GROUP;
  const hide = new Set<number>();
  if (o.namesPeople) {
    raw.forEach((g, i) => { if (g.n < MIN_GROUP) hide.add(i); });
    const lines = () => hide.size + (restHidden ? 1 : 0);
    const people = () => [...hide].reduce((t, i) => t + raw[i].n, restHidden ? restN : 0);
    while (lines() > 0 && (lines() === 1 || people() < MIN_GROUP)) {
      const next = raw.map((g, i) => ({ g, i })).filter(({ i }) => !hide.has(i)).sort((x, y) => x.g.n - y.g.n)[0];
      if (!next) break;
      hide.add(next.i);
    }
  }
  const groups: MeasureGroup[] = raw.map((g, i) => (hide.has(i) ? { ...g, total: null, median: null, average: null, hidden: true } : { ...g, hidden: false }));
  const total = read.total === null ? null : read.total - raw.reduce((t, g) => t + (g.total ?? 0), 0);
  const other: MeasureOther | null = restN > 0 ? { n: restN, total: restHidden ? null : total, hidden: restHidden } : null;
  const all = o.namesPeople && read.n > 0 && read.n < MIN_GROUP ? { ...read, total: null, median: null, average: null } : read;
  return { groups, other, all };
}

// What the model is sent: no total for a rate (a sum of hourly rates means nothing) and no average nobody asked for,
// so it can't repeat a figure the card leaves out.
export function forModel<T extends { groups: MeasureGroup[]; other: MeasureOther | null; all: MeasureAll }>(s: T, o: { summable: boolean; average: boolean }): T {
  const trim = <R extends { total: number | null; average?: number | null }>(r: R): R => ({ ...r, ...(o.summable ? {} : { total: null }), ...("average" in r && !o.average ? { average: null } : {}) });
  return { ...s, groups: s.groups.map(trim), other: s.other ? trim(s.other) : null, all: trim(s.all) };
}
