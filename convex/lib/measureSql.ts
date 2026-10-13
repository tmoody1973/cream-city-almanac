import type { CityMeasure } from "./cityMeasures";
import type { CityProfile } from "./cityProfile";
import { quoteId } from "./cityProfile";
import { addDays, human, isDay, lit, MAX_GROUPS, RID, valueFilter } from "./citySql";
import { readDate } from "./spanSql";

// Totals, medians and averages of one approved money column (spec 2026-10-12-city-measures-design.md §5–6). Shape
// proven live on 2026-10-12 for all six measures: an inner SELECT reads the value once per row, the outer one groups
// and measures. Money is text ("128,459.22 "), so $, commas and spaces are stripped before the number check.
export type MeasureArgs = { from?: string; to?: string; filters?: { column: string; values?: string[] }[]; groupBy?: string };
export type MeasureBuilt =
  | { ok: true; groupSql: string | null; allSql: string; period: string; filterLabels: string[]; groupLabel: string | null; source?: string; note?: string; latestYear?: string; timeoutMs?: number }
  | { ok: false; status: "bad-dates"; from: string; to: string; reason?: string }
  | { ok: false; status: "bad-column"; column: string; columns: string[] }
  | { ok: false; status: "choose"; column: string; asked: string; choices: string[] };

const NUMBER = "^-?[0-9]+([.][0-9]+)?$";
const absent = (s: string | undefined) => !s || !s.trim();
const cleaned = (c: string) => `regexp_replace(${quoteId(c)}, '[$, ]', '', 'g')`;
const NO_DATES = "This file has no dates, so it can't be limited to a period. Leave out from and to.";
export const moneyValue = (c: string) => `CASE WHEN ${cleaned(c)} ~ ${lit(NUMBER)} THEN ${cleaned(c)}::float END`;

// Count, total, median and average of `v` from an inner SELECT; blank, unreadable and (when skipped) $0 values kept apart.
export function measureColumns(skipZero: boolean): string {
  const keep = skipZero ? "v IS NOT NULL AND v <> 0" : "v IS NOT NULL";
  return [
    `SUM(CASE WHEN ${keep} THEN 1 ELSE 0 END) AS n`,
    `SUM(CASE WHEN ${keep} THEN v END) AS total`,
    `percentile_cont(0.5) WITHIN GROUP (ORDER BY CASE WHEN ${keep} THEN v END) AS median`,
    `AVG(CASE WHEN ${keep} THEN v END) AS average`,
    "SUM(CASE WHEN v IS NULL THEN 1 ELSE 0 END) AS unreadable", // blank or unreadable: counted, never dropped
    "SUM(CASE WHEN v = 0 THEN 1 ELSE 0 END) AS zeros",
  ].join(", ");
}

export function buildMeasure(p: CityProfile, m: CityMeasure, a: MeasureArgs, today: string): MeasureBuilt {
  if (!RID.test(p.resourceId)) throw new Error("Not a CKAN resource id");
  const table = quoteId(p.resourceId);
  const askedFrom = absent(a.from) ? undefined : a.from!;
  const askedTo = absent(a.to) ? undefined : a.to!;
  if (askedFrom || askedTo) {
    // A period needs a date; a file without one refuses rather than quietly measuring everything.
    if (!m.date) return { ok: false, status: "bad-dates", from: a.from ?? "", to: a.to ?? "", reason: NO_DATES };
    if ((askedFrom && !isDay(askedFrom)) || (askedTo && !isDay(askedTo)) || (askedFrom && askedTo && askedFrom > askedTo)) {
      return { ok: false, status: "bad-dates", from: a.from ?? "", to: a.to ?? "" };
    }
  }

  const inner: string[] = [];
  const filterLabels: string[] = [];
  let period = askedFrom && askedTo ? `${human(askedFrom)} – ${human(askedTo)}` : askedFrom ? `since ${human(askedFrom)}` : askedTo ? `through ${human(askedTo)}` : "all records";
  // A snapshot file (the property file) keeps its current assessment only, as counts do.
  const current = p.snapshot && p.currentColumn ? p.categories.find((c) => c.column === p.currentColumn)?.values[0]?.value : undefined;
  if (current && p.currentColumn) {
    inner.push(`${quoteId(p.currentColumn)} = ${lit(current)}`);
    if (period === "all records") period = `${current} assessment`;
  }
  for (const f of a.filters ?? []) {
    const r = valueFilter(p, f);
    if (!r.ok) return r;
    inner.push(r.where);
    filterLabels.push(...r.labels);
  }

  const allowed = [...m.splits, ...(m.date ? ["year"] : [])];
  let g: string | null = null;
  let key: string | null = null;
  let groupLabel: string | null = null;
  if (a.groupBy?.trim()) {
    const asked = a.groupBy.trim().toLowerCase();
    const split = allowed.find((s) => s.toLowerCase() === asked);
    if (!split) return { ok: false, status: "bad-column", column: a.groupBy, columns: allowed };
    if (split === "year") { key = "to_char(d, 'YYYY')"; groupLabel = "year"; }
    else { g = quoteId(split); key = "g"; groupLabel = split; }
  }

  const v = moneyValue(m.column);
  const d = m.date ? `, ${readDate(m.date)} AS d` : "";
  const innerSql = (grouped: boolean) =>
    `SELECT ${v} AS v${grouped && g ? `, ${g} AS g` : ""}${d} FROM ${table}${inner.length ? ` WHERE ${inner.join(" AND ")}` : ""}`;
  const measures = measureColumns(m.skipZero);
  const outer: string[] = [];
  if (askedFrom) outer.push(`d >= ${lit(askedFrom)}`);
  if (askedTo) outer.push(`d < ${lit(addDays(askedTo, 1))}`);
  const where = outer.length ? ` WHERE ${outer.join(" AND ")}` : "";
  const allSql = `SELECT ${measures} FROM (${innerSql(false)}) s${where}`;
  const groupSql = key ? `SELECT ${key} AS g, ${measures} FROM (${innerSql(true)}) s${where} GROUP BY g ORDER BY ${groupLabel === "year" ? "g DESC" : "n DESC"} LIMIT ${MAX_GROUPS}` : null;
  void today; // ponytail: kept for parity with buildCount/buildSpan; measures have no "today" window yet
  return { ok: true, groupSql, allSql, period, filterLabels, groupLabel };
}
