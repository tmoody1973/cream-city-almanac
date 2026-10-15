import { INCIDENT_YEARS, LAST_TYPE_YEAR, type FireGroup, type Span } from "./fireYears";

// fireHistory's summary of the stored years (spec 2026-10-14-fire-history §6): code computes every figure.
export type StoredRow = { year: number; group: FireGroup; calls: number; dispatch: Span | null; arrive: Span | null; unreadable: number; backwards: number; source: "incident" | "mfd"; partial: string | null; toMinute: boolean };
export type StoredType = { year: number; type: string; calls: number };
export type FireArgs = { measure: "calls" | "dispatch" | "arrive"; group?: FireGroup; type?: string; from?: number; to?: number };
export type FireOut = { year: number; calls: number | null; median: number | null; p90: number | null; n: number | null; partial: string | null };
export type FireResult =
  | { status: "ok"; title: string; measure: FireArgs["measure"]; group: FireGroup; type: string | null; rows: FireOut[]; notes: string[]; source: string; types: string[] }
  | { status: "choose"; asked: string; choices: string[] }
  | { status: "refused"; reason: string };

export const FIRE_SOURCE = "City of Milwaukee: Fire Incident Detail (2015–2023) and MFD Calls for Service Detail (2024 on).";
const SYSTEM = "From 2024 the City publishes calls from a new system (MFD Calls for Service); years before and after are close but not identical.";
const GAP = "Jan 1 – Feb 19, 2024 isn't in either file, so 2024 is short.";
const MINUTE = "2015–2017, 2019 and 2020 record times to the minute, so their medians are whole minutes.";
const TYPES = "Call types end in 2023; the new system has only broad types.";
const NAME = { calls: "calls", dispatch: "time to dispatch", arrive: "time to arrive" } as const;
const GROUP_TAG = { all: "", ems: " · EMS", other: " · non-EMS calls" } as const;
const refused = (reason: string): FireResult => ({ status: "refused", reason });
const key = (s: string) => s.trim().toUpperCase();

// Types across all years, merged by spelling ("ems" = "EMS"), most calls first; the label is the commonest spelling.
function typeTotals(types: StoredType[]): { type: string; calls: number }[] {
  const by = new Map<string, { calls: number; spellings: Map<string, number> }>();
  for (const t of types) {
    const e = by.get(key(t.type)) ?? { calls: 0, spellings: new Map<string, number>() };
    e.calls += t.calls;
    e.spellings.set(t.type, (e.spellings.get(t.type) ?? 0) + t.calls);
    by.set(key(t.type), e);
  }
  return [...by.values()].sort((a, b) => b.calls - a.calls).map((e) => ({ type: [...e.spellings].sort((x, y) => y[1] - x[1])[0][0], calls: e.calls }));
}

// `attempted`: every year the refresh has tried (fireRefresh), failed ones included; with 2015–2023 always expected, a
// year with no stored rows is named in the notes instead of the card quietly starting or ending early.
export function summarize(rows: StoredRow[], types: StoredType[], a: FireArgs, attempted: number[] = []): FireResult {
  if (!rows.length) return refused("Fire Department history hasn't been built yet.");
  if (a.type?.trim() && a.measure !== "calls") return refused("Response times are by EMS versus other calls, not by call type.");
  const totals = typeTotals(types);
  let type: string | null = null;
  if (a.type?.trim()) {
    const hit = totals.find((t) => key(t.type) === key(a.type!));
    if (!hit) return { status: "choose", asked: a.type, choices: totals.slice(0, 12).map((t) => t.type) };
    type = hit.type;
  }
  const group: FireGroup = type ? "all" : a.group ?? "all";
  const years = [...new Set([...rows.map((r) => r.year), ...attempted, ...INCIDENT_YEARS.map((s) => s.year)])].sort((x, y) => x - y);
  const first = years[0];
  const last = years[years.length - 1];
  const lo = Math.max(a.from ?? first, first);
  let hi = Math.min(a.to ?? last, last);
  const notes: string[] = [];
  if (type && hi > LAST_TYPE_YEAR) {
    hi = LAST_TYPE_YEAR;
    notes.push(TYPES);
  }
  const picked = rows.filter((r) => r.group === group && r.year >= lo && r.year <= hi).sort((x, y) => x.year - y.year);
  if (!picked.length) return refused(`No Fire Department years in that range; the data runs ${first}–${last}.`);
  const out: FireOut[] = picked.map((r) => {
    if (type) {
      const hits = types.filter((t) => t.year === r.year && key(t.type) === key(type!));
      return { year: r.year, calls: hits.length ? hits.reduce((s, t) => s + t.calls, 0) : null, median: null, p90: null, n: null, partial: r.partial };
    }
    const s = a.measure === "calls" ? null : r[a.measure];
    return { year: r.year, calls: r.calls, median: s?.median ?? null, p90: s?.p90 ?? null, n: a.measure === "calls" ? null : s?.n ?? 0, partial: r.partial };
  });
  const ys = out.map((r) => r.year);
  const missing = years.filter((y) => y >= lo && y <= hi && !ys.includes(y));
  if (missing.length) notes.push(`No figures are stored for ${missing.join(", ")}.`);
  const absent = out.filter((r) => r.calls === null).map((r) => r.year);
  if (type && absent.length) notes.push(`${type} isn't a call type in ${absent.join(", ")}.`);
  if (ys.some((y) => y >= 2024) && ys.some((y) => y <= 2023)) notes.push(SYSTEM);
  if (ys.includes(2024)) notes.push(GAP);
  if (a.measure !== "calls") {
    if (picked.some((r) => r.toMinute)) notes.push(MINUTE);
    const bad = picked.reduce((s, r) => s + r.unreadable + r.backwards, 0);
    if (bad) notes.push(`${bad.toLocaleString("en-US")} records had unreadable times or times that run backwards and weren't measured.`);
  }
  const soFar = picked.find((r) => r.partial === "so far");
  if (soFar) notes.push(`${soFar.year} so far.`);
  const title = `Milwaukee Fire Department · ${type ? `${type} calls` : NAME[a.measure]}${type ? "" : GROUP_TAG[group]} · ${ys[0]}–${ys[ys.length - 1]}`;
  return { status: "ok", title, measure: a.measure, group, type, rows: out, notes, source: FIRE_SOURCE, types: totals.slice(0, 12).map((t) => t.type) };
}
