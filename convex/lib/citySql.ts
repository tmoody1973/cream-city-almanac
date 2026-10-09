import type { CityProfile } from "./cityProfile";
import { quoteId } from "./cityProfile";
import { isOffenseColumn, offenseCodes, offenseName } from "./nibrs";

// Turns Ask's checked arguments into the City's PostgreSQL. Only profiled columns and profiled values get in;
// identifiers are double-quoted, literals single-quoted with quotes doubled. Constructs are limited to what the City's
// datastore allows (verified by scripts/city-sql-smoke.ts): no NULLIF, no :: casts, no substr. City dates are ISO text
// ("2026-06-16 14:51:00"), which sorts correctly as text, so the period filter is a plain text comparison.
export const MAX_GROUPS = 24;
const RID = /^[0-9a-f-]{36}$/;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export interface CountArgs { from?: string; to?: string; filters?: { column: string; values: string[] }[]; groupBy?: string }
export type Built =
  | { ok: true; totalSql: string; groupSql: string | null; futureSql: string | null; period: string; filterLabels: string[]; groupLabel: string | null }
  | { ok: false; status: "choose"; column: string; asked: string; choices: string[] }
  | { ok: false; status: "bad-column"; column: string; columns: string[] }
  | { ok: false; status: "bad-dates"; from: string; to: string };

const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;
const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (day: string, n: number) => isoDay(new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000));
const human = (day: string) => { const [y, m, d] = day.split("-").map(Number); return `${MONTHS[m - 1]} ${d}, ${y}`; };
// A real calendar day only: "2025-02-30" and "2025-13-45" are treated as absent.
const validDay = (s: string | undefined) => {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
  const t = Date.parse(`${s}T00:00:00Z`); // NaN for month 13; rolls over for Feb 30, which the round-trip catches
  return Number.isFinite(t) && isoDay(new Date(t)) === s ? s : undefined;
};

export const groupLabelFor = (column: string, value: string) => (isOffenseColumn(column) ? offenseName(value) : value);
const filterLabel = (column: string, value: string, districts: string[]) =>
  isOffenseColumn(column) ? offenseName(value) : districts.includes(column) ? `${column.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase())} ${value}` : value;

export function buildCount(p: CityProfile, a: CountArgs, today: string): Built {
  if (!RID.test(p.resourceId)) throw new Error("Not a CKAN resource id");
  const table = quoteId(p.resourceId);
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
      const hits = exact ? [exact] : viaOffense;
      if (hits.length === 0) {
        const word = asked.trim().toLowerCase();
        const near = word ? cat.values.filter((v) => groupLabelFor(cat.column, v.value).toLowerCase().includes(word)).map((v) => groupLabelFor(cat.column, v.value)) : [];
        return { ok: false, status: "choose", column: cat.column, asked, choices: near.length ? near.slice(0, 8) : top() };
      }
      picked.push(...hits);
    }
    const uniq = [...new Set(picked)];
    where.push(`${quoteId(cat.column)} IN (${uniq.map(lit).join(", ")})`);
    filterLabels.push(...uniq.map((v) => filterLabel(cat.column, v, p.districtColumns)));
  }

  let period = "all records";
  let futureSql: string | null = null;
  if (p.dateColumn) {
    const askedTo = validDay(a.to);
    const askedFrom = validDay(a.from);
    const to = askedTo && askedTo < today ? askedTo : today;
    const from = askedFrom ?? addDays(to, -365);
    if (from > to) return { ok: false, status: "bad-dates", from, to };
    const d = quoteId(p.dateColumn);
    const others = where.join(" AND ");
    where.unshift(`${d} >= ${lit(from)} AND ${d} < ${lit(addDays(to, 1))}`);
    period = `${human(from)} – ${human(to)}${!askedFrom && !askedTo ? " (last 12 months)" : ""}`;
    if (to === today) futureSql = `SELECT COUNT(*) AS n FROM ${table} WHERE ${d} > ${lit(addDays(today, 1))}${others ? ` AND ${others}` : ""}`;
  }
  const whereSql = where.length ? ` WHERE ${where.join(" AND ")}` : "";
  const totalSql = `SELECT COUNT(*) AS n FROM ${table}${whereSql}`;

  let groupSql: string | null = null;
  let groupLabel: string | null = null;
  if (a.groupBy === "month" || a.groupBy === "year") {
    if (p.dateColumn) {
      groupSql = `SELECT left(${quoteId(p.dateColumn)}, ${a.groupBy === "month" ? 7 : 4}) AS g, COUNT(*) AS n FROM ${table}${whereSql} GROUP BY g ORDER BY g DESC LIMIT ${MAX_GROUPS}`;
      groupLabel = a.groupBy;
    }
  } else if (a.groupBy) {
    const cat = menu.get(a.groupBy.toLowerCase());
    if (!cat) return { ok: false, status: "bad-column", column: a.groupBy, columns: ["month", "year", ...p.categories.map((c) => c.column)] };
    groupSql = `SELECT ${quoteId(cat.column)} AS g, COUNT(*) AS n FROM ${table}${whereSql} GROUP BY g ORDER BY n DESC LIMIT ${MAX_GROUPS}`;
    groupLabel = cat.column;
  }
  return { ok: true, totalSql, groupSql, futureSql, period, filterLabels, groupLabel };
}
