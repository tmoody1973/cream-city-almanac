import type { CityProfile } from "./cityProfile";
import { quoteId } from "./cityProfile";
import { isOffenseColumn, offenseCodes, offenseName } from "./nibrs";
import type { Bbox } from "./geo";
import { POINTS_CAP } from "./cityPoints";
import { CELL } from "./cityMap";

// Turns Ask's checked arguments into the City's PostgreSQL. Only profiled columns and profiled values get in;
// identifiers are double-quoted, literals single-quoted with quotes doubled. Constructs are limited to what the City's
// datastore allows (verified by scripts/city-sql-smoke.ts): no NULLIF, no substr, and `::float` only inside a numeric
// CASE guard. City dates are ISO text
// ("2026-06-16 14:51:00"), which sorts correctly as text, so the period filter is a plain text comparison.
export const MAX_GROUPS = 24;
const RID = /^[0-9a-f-]{36}$/;
// Offense words wider than this ("theft" is six codes) ask which one instead of counting them all.
const MAX_OFFENSE_CODES = 5;
// Only a plain code ("120", "23H") goes inside a LIKE pattern, so no value can carry a wildcard or a quote into it.
const LIKE_SAFE = /^[0-9A-Z]{2,4}$/;
export const NUMERIC = "^-?[0-9]+(\\.[0-9]+)?$";
const num = (c: string) => `(CASE WHEN ${quoteId(c)} ~ ${lit(NUMERIC)} THEN ${quoteId(c)}::float END)`;
const coord = (n: number) => { if (!Number.isFinite(n)) throw new Error("Neighborhood rectangle is not numeric"); return String(n); };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export interface CountArgs { from?: string; to?: string; filters?: { column: string; values: string[] }[]; groupBy?: string }
export type Built =
  | { ok: true; totalSql: string; groupSql: string | null; futureSql: string | null; period: string; filterLabels: string[]; groupLabel: string | null; overlap: boolean; dateColumn: string | null; coverage: string | null; points: { sql: string; missingSql: string } | null; gridSql: string | null }
  | { ok: false; status: "no-locations" }
  | { ok: false; status: "outside-coverage"; coverage: string }
  | { ok: false; status: "choose"; column: string; asked: string; choices: string[] }
  | { ok: false; status: "bad-column"; column: string; columns: string[] }
  | { ok: false; status: "bad-dates"; from: string; to: string };

const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;
const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (day: string, n: number) => isoDay(new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000));
const human = (day: string) => { const [y, m, d] = day.split("-").map(Number); return `${MONTHS[m - 1]} ${d}, ${y}`; };
// A real calendar day only: "2025-02-30" and "2025-13-45" are not.
const isDay = (s: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const t = Date.parse(`${s}T00:00:00Z`); // NaN for month 13; rolls over for Feb 30, which the round-trip catches
  return Number.isFinite(t) && isoDay(new Date(t)) === s;
};
const absent = (s: string | undefined) => !s || !s.trim();

// The days the data covers. The profile is a week old at most, so a feed whose newest record was within a month of
// profiling is treated as running to today; one that had stopped well before then ends at its last record.
// ponytail: a 31-day heuristic; a live MAX() per count would be exact at the cost of one more City query.
function dataSpan(p: CityProfile, today: string): { min: string; max: string } | null {
  if (!p.minDate || !p.maxDate) return null;
  const ongoing = p.maxDate >= addDays(isoDay(new Date(p.updatedAt)), -31);
  return { min: p.minDate, max: ongoing || p.maxDate > today ? today : p.maxDate };
}

export const groupLabelFor = (column: string, value: string) => (isOffenseColumn(column) ? offenseName(value) : value);
const filterLabel = (column: string, value: string, districts: string[]) =>
  isOffenseColumn(column) ? offenseName(value) : districts.includes(column) ? `${column.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase())} ${value}` : value;

export function buildCount(p: CityProfile, a: CountArgs, today: string, area?: Bbox): Built {
  if (!RID.test(p.resourceId)) throw new Error("Not a CKAN resource id");
  const table = quoteId(p.resourceId);
  // A date that was given but isn't a real day is refused, never quietly replaced by the default window.
  if ((!absent(a.from) && !isDay(a.from!)) || (!absent(a.to) && !isDay(a.to!))) return { ok: false, status: "bad-dates", from: a.from ?? "", to: a.to ?? "" };
  if (area && !(p.latColumn && p.lonColumn)) return { ok: false, status: "no-locations" };
  const menu = new Map(p.categories.map((c) => [c.column.toLowerCase(), c]));
  const where: string[] = [];
  const filterLabels: string[] = [];
  for (const f of a.filters ?? []) {
    const cat = menu.get(f.column.toLowerCase());
    if (!cat) return { ok: false, status: "bad-column", column: f.column, columns: p.categories.map((c) => c.column) };
    const top = () => cat.values.slice(0, 8).map((v) => groupLabelFor(cat.column, v.value));
    // Never silently widen: a filter with nothing to filter on asks the user to choose.
    if (f.values.length === 0) return { ok: false, status: "choose", column: cat.column, asked: "", choices: top() };
    const known = new Map(cat.values.map((v) => [v.value.toLowerCase(), v.value]));
    const picked: string[] = [];
    for (const asked of f.values) {
      const exact = known.get(asked.trim().toLowerCase());
      const viaOffense = isOffenseColumn(cat.column) ? offenseCodes(asked).filter((c) => known.has(c.toLowerCase())) : [];
      if (!exact && viaOffense.length > MAX_OFFENSE_CODES) {
        return { ok: false, status: "choose", column: cat.column, asked, choices: viaOffense.slice(0, 8).map((c) => groupLabelFor(cat.column, c)) };
      }
      const hits = exact ? [exact] : viaOffense;
      if (cat.multi && hits.some((h) => !LIKE_SAFE.test(h))) {
        return { ok: false, status: "choose", column: cat.column, asked, choices: cat.values.filter((v) => LIKE_SAFE.test(v.value)).slice(0, 8).map((v) => groupLabelFor(cat.column, v.value)) };
      }
      if (hits.length === 0) {
        const word = asked.trim().toLowerCase();
        const near = word ? cat.values.filter((v) => groupLabelFor(cat.column, v.value).toLowerCase().includes(word)).map((v) => groupLabelFor(cat.column, v.value)) : [];
        return { ok: false, status: "choose", column: cat.column, asked, choices: near.length ? near.slice(0, 8) : top() };
      }
      picked.push(...hits);
    }
    const uniq = [...new Set(picked)];
    // A ';'-separated column ("13A;120") matches a record holding the code anywhere in its list.
    where.push(cat.multi
      ? `(${uniq.map((v) => `';' || ${quoteId(cat.column)} || ';' LIKE ${lit(`%;${v};%`)}`).join(" OR ")})`
      : `${quoteId(cat.column)} IN (${uniq.map(lit).join(", ")})`);
    filterLabels.push(...uniq.map((v) => filterLabel(cat.column, v, p.districtColumns)));
  }

  let period = "all records";
  let futureSql: string | null = null;
  let coverage: string | null = null;
  if (p.dateColumn) {
    const askedTo = absent(a.to) ? undefined : a.to;
    const askedFrom = absent(a.from) ? undefined : a.from;
    const span = dataSpan(p, today);
    // With no dates asked, the window is the 12 months up to the data's end (today, for a feed still updating).
    let to = askedTo ? (askedTo < today ? askedTo : today) : askedFrom || !span ? today : span.max;
    let from = askedFrom ?? addDays(to, -365);
    if (from > to) return { ok: false, status: "bad-dates", from, to };
    const notes = askedFrom || askedTo ? [] : [to === today ? "last 12 months" : "the data's latest 12 months"];
    if (span) {
      coverage = `${human(span.min)} – ${human(span.max)}`;
      if (to < span.min || from > span.max) return { ok: false, status: "outside-coverage", coverage };
      if (from < span.min || to > span.max) {
        from = from < span.min ? span.min : from;
        to = to > span.max ? span.max : to;
        notes.push("clamped to the data's range");
      }
    }
    const d = quoteId(p.dateColumn);
    const others = where.join(" AND ");
    where.unshift(`${d} >= ${lit(from)} AND ${d} < ${lit(addDays(to, 1))}`);
    period = `${human(from)} – ${human(to)}${notes.length ? ` (${notes.join("; ")})` : ""}`;
    if (to === today) futureSql = `SELECT COUNT(*) AS n FROM ${table} WHERE ${d} > ${lit(addDays(today, 1))}${others ? ` AND ${others}` : ""}`;
  }
  const whereSql = where.length ? ` WHERE ${where.join(" AND ")}` : "";
  const totalSql = `SELECT COUNT(*) AS n FROM ${table}${whereSql}`;

  let groupSql: string | null = null;
  let groupLabel: string | null = null;
  let overlap = false;
  if (a.groupBy === "month" || a.groupBy === "year") {
    if (!p.dateColumn) return { ok: false, status: "bad-column", column: a.groupBy, columns: p.categories.map((c) => c.column) };
    groupSql = `SELECT left(${quoteId(p.dateColumn)}, ${a.groupBy === "month" ? 7 : 4}) AS g, COUNT(*) AS n FROM ${table}${whereSql} GROUP BY g ORDER BY g DESC LIMIT ${MAX_GROUPS}`;
    groupLabel = a.groupBy;
  } else if (a.groupBy) {
    const cat = menu.get(a.groupBy.toLowerCase());
    if (!cat) return { ok: false, status: "bad-column", column: a.groupBy, columns: ["month", "year", ...p.categories.map((c) => c.column)] };
    // A record with several values counts once in each of its groups, so the groups overlap.
    const g = cat.multi ? `unnest(string_to_array(${quoteId(cat.column)}, ';'))` : quoteId(cat.column);
    groupSql = `SELECT ${g} AS g, COUNT(*) AS n FROM ${table}${whereSql} GROUP BY g ORDER BY n DESC LIMIT ${MAX_GROUPS}`;
    groupLabel = cat.column;
    overlap = Boolean(cat.multi);
  }
  let points: { sql: string; missingSql: string } | null = null;
  if (area && p.latColumn && p.lonColumn) {
    const [lat, lon] = [p.latColumn, p.lonColumn];
    const box = `${num(lat)} BETWEEN ${coord(area.minLat)} AND ${coord(area.maxLat)} AND ${num(lon)} BETWEEN ${coord(area.minLon)} AND ${coord(area.maxLon)}`;
    const g = groupLabel === "month" || groupLabel === "year" ? `, left(${quoteId(p.dateColumn!)}, ${groupLabel === "month" ? 7 : 4}) AS g` : groupLabel ? `, ${quoteId(groupLabel)} AS g` : "";
    const filtered = where.length ? `${where.join(" AND ")} AND ` : "";
    const unplaced = `(${quoteId(lat)} IS NULL OR ${quoteId(lon)} IS NULL OR NOT (${quoteId(lat)} ~ ${lit(NUMERIC)} AND ${quoteId(lon)} ~ ${lit(NUMERIC)}))`;
    points = {
      sql: `SELECT ${num(lat)} AS lat, ${num(lon)} AS lon${g} FROM ${table} WHERE ${filtered}${box} LIMIT ${POINTS_CAP}`,
      missingSql: `SELECT COUNT(*) AS n FROM ${table} WHERE ${filtered}${unplaced}`,
    };
  }
  // Citywide quarter-mile counts: the same filters and period, binned by cell, with no rectangle.
  let gridSql: string | null = null;
  if (p.latColumn && p.lonColumn) {
    const [lat, lon] = [num(p.latColumn), num(p.lonColumn)];
    const filtered = where.length ? `${where.join(" AND ")} AND ` : "";
    gridSql = `SELECT floor(${lat} / ${CELL.dLat}) AS i, floor(${lon} / ${CELL.dLon}) AS j, COUNT(*) AS n FROM ${table} WHERE ${filtered}${lat} IS NOT NULL AND ${lon} IS NOT NULL GROUP BY i, j`;
  }
  return { ok: true, totalSql, groupSql, futureSql, period, filterLabels, groupLabel, overlap, dateColumn: p.dateColumn, coverage, points, gridSql };
}
