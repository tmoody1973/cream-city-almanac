import { KINDS, type StopKind, type StopRow } from "./stops";

// The stop counts Ask shows (spec 2026-10-13-stop-search-design §5): periods, filters, groups, shares and field-
// interview rates, all from the stored counts. Pure. The AI never computes any of these.
export type StoredRow = StopRow & { period: string; year: number };
export type GroupBy = "year" | "quarter" | "race" | "sex" | "kind" | "found";
export type StopsArgs = {
  kind?: StopKind | "all"; from?: string; to?: string; groupBy?: GroupBy;
  filters?: { race?: string[]; sex?: string[]; frisked?: "yes" | "no"; searched?: "yes" | "no"; found?: string[] };
};
export type StopGroup = { label: string; n: number; share: number; frisked?: number | null; searched?: number | null; found?: number | null };
export type StopsResult =
  | { status: "ok"; kind: StopKind | "all"; period: string; total: number; groupBy: GroupBy | null; groups: StopGroup[]; rates: boolean; filters: string[]; source: string; notes: string[] }
  | { status: "refused"; reason: string }
  | { status: "choose"; column: "race" | "sex" | "found"; asked: string; choices: string[] };

export const RATE_FLOOR = 10;
export const PEOPLE_NOTE = "People per stop as MPD recorded them: a person stopped twice counts twice.";
export const RACE_NOTE = "Race and ethnicity are one group here: Hispanic when either MPD field says so.";
export const NOT_RATES = "These are counts, not rates per resident.";
const FI_ONLY = "Frisk, search and found are recorded for field interviews only.";
// MPD's 2024 files split at a system change, not at the quarter (checked 2026-10-13: "1-1 thru 2-19-2024", "2-20 thru 6-30-2024").
const SPLIT_2024 = "MPD's 2024 Q1 file covers Jan 1 – Feb 19, 2024, and its 2024 Q2 file Feb 20 – Jun 30, 2024.";
const KIND_LABEL: Record<StopKind, string> = { traffic: "Traffic stops", "field-interview": "Field interviews", "no-action": "No-action encounters" };

const quarters = (p: string) => [...p.slice(5).matchAll(/Q(\d)/g)].map((m) => Number(m[1]));
// A period's first or last quarter as year × 10 + quarter (2019-Q1Q2 → 20191 … 20192).
const at = (p: string, end: boolean) => { const q = quarters(p); return Number(p.slice(0, 4)) * 10 + (end ? q[q.length - 1] : q[0]); };
export const periodLabel = (p: string) => { const q = quarters(p); return `${p.slice(0, 4)} ${q.length > 1 ? `Q${q[0]}–Q${q[q.length - 1]}` : `Q${q[0]}`}`; };
// "2021" or "2021-Q3" as a quarter number; a year starts at Q1 and ends at Q4.
const bound = (s: string, end: boolean): number | null => {
  const m = /^(\d{4})(?:-Q([1-4]))?$/.exec(s.trim());
  return m ? Number(m[1]) * 10 + (m[2] ? Number(m[2]) : end ? 4 : 1) : null;
};
const round1 = (x: number) => Math.round(x * 10) / 10;
const rate = (num: number, den: number) => (den >= RATE_FLOOR ? round1((100 * num) / den) : null);
const sum = (rs: StoredRow[], p: (r: StoredRow) => boolean = () => true) => rs.filter(p).reduce((s, r) => s + r.n, 0);

const TABLE_WORD: Record<StopKind, string> = { traffic: "traffic-stop", "field-interview": "field-interview", "no-action": "no-action-encounter" };

export function summarize(rows: StoredRow[], periods: { period: string; status: string; missing?: string[] }[], a: StopsArgs): StopsResult {
  if (!rows.length) return { status: "refused", reason: "Stop counts haven't been built yet." };
  const kind = a.kind ?? "all";
  const f = a.filters ?? {};
  if (kind !== "field-interview" && (f.frisked || f.searched || f.found?.length || a.groupBy === "found")) return { status: "refused", reason: FI_ONLY };

  const byAt = (x: string, y: string) => at(x, false) - at(y, false);
  const stored = [...new Set(rows.map((r) => r.period))].sort(byAt);
  // The default range reaches every period the build knows, failed ones included, so a gap at either end is named.
  const known = [...new Set([...stored, ...periods.map((p) => p.period)])].sort(byAt);
  const help = `Periods are years ("2021") or quarters ("2021-Q3"); the data covers ${periodLabel(stored[0])} to ${periodLabel(stored[stored.length - 1])}.`;
  const lo = a.from ? bound(a.from, false) : at(known[0], false);
  const hi = a.to ? bound(a.to, true) : at(known[known.length - 1], true);
  if (lo === null || hi === null || lo > hi) return { status: "refused", reason: help };
  const overlaps = (p: string) => at(p, true) >= lo && at(p, false) <= hi;
  // The card's range is the periods that hold the asked kind (traffic stops end at 2023 Q4), never a stretch of zeros.
  const holds = (p: string) => kind === "all" || rows.some((r) => r.period === p && r.kind === kind);
  const inRange = stored.filter((p) => overlaps(p) && holds(p));
  const failed = periods.filter((p) => p.status === "failed" && !stored.includes(p.period) && overlaps(p.period));
  // Quarters whose City file lacks a kind's table (2024 has no comparable traffic-stop table): named, never silently short.
  const gaps = (kind === "all" ? KINDS : [kind]).flatMap((k) => {
    const ps = periods.filter((p) => p.missing?.includes(k) && overlaps(p.period)).map((p) => p.period).sort(byAt);
    return ps.length ? [`The City's files for ${ps.map(periodLabel).join(", ")} have no ${TABLE_WORD[k]} table comparable to earlier quarters, so ${KIND_LABEL[k].toLowerCase()} there aren't counted.`] : [];
  });
  const unread = failed.map((p) => `The City's file for ${periodLabel(p.period)} couldn't be read.`);
  if (!inRange.length) return { status: "refused", reason: [...unread, ...gaps].join(" ") || help };

  // Values: only stored ones, in any case; an unknown one offers the stored choices.
  const want: Partial<Record<"race" | "sex" | "found", Set<string>>> = {};
  for (const [col, asked] of [["race", f.race], ["sex", f.sex], ["found", f.found]] as const) {
    if (!asked?.length) continue;
    const known = [...new Set(rows.map((r) => r[col]).filter((v): v is string => v !== null))].sort();
    const set = new Set<string>();
    for (const x of asked) {
      const hit = known.find((k) => k.toLowerCase() === x.trim().toLowerCase());
      if (!hit) return { status: "choose", column: col, asked: x, choices: known };
      set.add(hit);
    }
    want[col] = set;
  }
  const keep = rows.filter((r) => inRange.includes(r.period) && (kind === "all" || r.kind === kind)
    && (!want.race || want.race.has(r.race)) && (!want.sex || want.sex.has(r.sex)) && (!want.found || (r.found !== null && want.found.has(r.found)))
    && (!f.frisked || r.frisked === f.frisked) && (!f.searched || r.searched === f.searched));
  const total = sum(keep);

  const g = a.groupBy ?? null;
  const rates = kind === "field-interview" && (g === "race" || g === "sex");
  const keyOf = (r: StoredRow) => (g === "year" ? String(r.year) : g === "quarter" ? r.period : g === "kind" ? r.kind : g ? String(r[g] ?? "Unknown") : "");
  const byKey = new Map<string, StoredRow[]>();
  if (g) for (const r of keep) byKey.set(keyOf(r), [...(byKey.get(keyOf(r)) ?? []), r]);
  const keys = [...byKey.keys()].sort((x, y) => (g === "year" ? Number(x) - Number(y) : g === "quarter" ? at(x, false) - at(y, false) : sum(byKey.get(y)!) - sum(byKey.get(x)!)));
  const groups: StopGroup[] = keys.map((k) => {
    const rs = byKey.get(k)!;
    const n = sum(rs);
    const searched = sum(rs, (r) => r.searched === "yes");
    return {
      label: g === "quarter" ? periodLabel(k) : g === "kind" ? KIND_LABEL[k as StopKind] : k,
      n, share: total ? round1((100 * n) / total) : 0,
      ...(rates ? {
        frisked: rate(sum(rs, (r) => r.frisked === "yes"), sum(rs, (r) => r.frisked === "yes" || r.frisked === "no")),
        searched: rate(searched, sum(rs, (r) => r.searched === "yes" || r.searched === "no")),
        found: rate(sum(rs, (r) => r.searched === "yes" && r.found !== null && r.found !== "None" && r.found !== "Unknown"), searched),
      } : {}),
    };
  });

  const first = periodLabel(inRange[0]), last = periodLabel(inRange[inRange.length - 1]);
  return {
    status: "ok", kind, total, groupBy: g, groups, rates,
    period: first === last ? first : `${first} – ${last}`,
    filters: [
      ...(want.race ?? []), ...(want.sex ?? []),
      ...(f.frisked ? [f.frisked === "yes" ? "frisked" : "not frisked"] : []),
      ...(f.searched ? [f.searched === "yes" ? "searched" : "not searched"] : []),
      ...[...(want.found ?? [])].map((x) => `found: ${x}`),
    ],
    source: `From MPD's quarterly stop-and-search data (${first} to ${last}), counted by the Almanac from the City's files.`,
    notes: [PEOPLE_NOTE, RACE_NOTE, ...unread, ...gaps, ...(inRange.some((p) => p === "2024-Q1" || p === "2024-Q2") ? [SPLIT_2024] : []), NOT_RATES],
  };
}
