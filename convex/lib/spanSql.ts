import type { CityProfile } from "./cityProfile";
import { quoteId } from "./cityProfile";
import { addDays, dataSpan, human, isDay, lit, MAX_GROUPS, RID, valueFilter } from "./citySql";
import type { SpanPair } from "./spanPairs";

// The time between a pair's two dates, measured on the City's server (spec §2.1, §5, §6). Shape proven live
// 2026-10-12: an inner SELECT reads both dates once per row; the outer one groups and measures. The City refuses
// FILTER, trim and extract, and its firewall refuses "= 1"-style flags and `left(x, 4) >= '1900'`, so flags are
// booleans and the year floor (19xx or 20xx) sits inside the date patterns.
export type SpanArgs = { from?: string; to?: string; filters?: { column: string; values?: string[] }[]; groupBy?: string };
export type SpanBuilt =
  | { ok: true; groupSql: string | null; allSql: string; period: string; filterLabels: string[]; groupLabel: string | null; overlap: boolean; coverage: string | null; columns: string[] }
  | { ok: false; status: "bad-dates"; from: string; to: string }
  | { ok: false; status: "outside-coverage"; coverage: string }
  | { ok: false; status: "bad-column"; column: string; columns: string[] }
  | { ok: false; status: "choose"; column: string; asked: string; choices: string[] };

const ISO = "^(19|20)[0-9]{2}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])( [0-9]{2}:[0-9]{2}(:[0-9]{2}([.][0-9]+)?)?)?$";
const MDY = "^(0?[1-9]|1[0-2])/(0?[1-9]|[12][0-9]|3[01])/(19|20)[0-9]{2}$";
const PER = { days: 86400, minutes: 60 } as const;
const absent = (s: string | undefined) => !s || !s.trim();

// One date column, read by its shape; anything else (blank, the text NULL, a year before 1900, another shape) is NULL.
// ponytail: a matched but impossible date (Feb 30) would fail the whole query; none seen in the seven files.
export const readDate = (c: string) => {
  const q = quoteId(c);
  return `CASE WHEN ${q} ~ ${lit(ISO)} THEN ${q}::timestamp WHEN ${q} ~ ${lit(MDY)} THEN to_timestamp(${q}, 'MM/DD/YYYY')::timestamp END`;
};
const present = (c: string) => { const q = quoteId(c); return `(${q} IS NOT NULL AND ${q} <> '' AND upper(${q}) <> 'NULL')`; };

// Medians over a whole file are the heaviest queries Ask sends: on the Fire Department's 350,000 calls they took
// 9.5–10.5s on the City's server (2026-10-14), past the 10s default.
export const SPAN_QUERY_TIMEOUT_MS = 25_000;

export function buildSpan(p: CityProfile, pair: SpanPair, a: SpanArgs, today: string, asOf?: string): SpanBuilt {
  if (!RID.test(p.resourceId)) throw new Error("Not a CKAN resource id");
  const table = quoteId(p.resourceId);
  const askedFrom = absent(a.from) ? undefined : a.from!;
  const askedTo = absent(a.to) ? undefined : a.to!;
  if ((askedFrom && !isDay(askedFrom)) || (askedTo && !isDay(askedTo))) return { ok: false, status: "bad-dates", from: a.from ?? "", to: a.to ?? "" };
  if (askedFrom && askedTo && askedFrom > askedTo) return { ok: false, status: "bad-dates", from: askedFrom, to: askedTo };

  const inner: string[] = [];
  const filterLabels: string[] = [];
  for (const f of a.filters ?? []) {
    const r = valueFilter(p, f);
    if (!r.ok) return r;
    inner.push(r.where);
    filterLabels.push(...r.labels);
  }

  let g: string | null = null;
  let key: string | null = null;
  let label: string | null = null;
  let groupLabel: string | null = null;
  let overlap = false;
  if (a.groupBy?.trim().toLowerCase() === "year") {
    key = "to_char(f, 'YYYY')";
    label = "min(to_char(f, 'YYYY'))";
    groupLabel = "year";
  } else if (a.groupBy?.trim()) {
    const cat = p.categories.find((c) => c.column.toLowerCase() === a.groupBy!.trim().toLowerCase());
    if (!cat) return { ok: false, status: "bad-column", column: a.groupBy, columns: ["year", ...p.categories.map((c) => c.column)] };
    // A ';'-separated column counts a record once in each of its groups, so the groups overlap.
    g = cat.multi ? `unnest(string_to_array(${quoteId(cat.column)}, ';'))` : quoteId(cat.column);
    key = "upper(regexp_replace(g, '[^A-Za-z0-9]+', '', 'g'))"; // "NON-EMPLOYEE" and "Non Employee" are one group
    label = "min(g)";
    groupLabel = cat.column;
    overlap = Boolean(cat.multi);
  }

  // The period is on the parsed "from" date. Only a profile dated by that same column knows the data's range.
  const span = p.dateColumn === pair.from ? dataSpan(p, today) : null;
  const coverage = span ? `${human(span.min)} – ${human(span.max)}` : null;
  if (span && ((askedTo && askedTo < span.min) || (askedFrom && askedFrom > span.max))) return { ok: false, status: "outside-coverage", coverage: coverage! };
  const outer: string[] = [];
  if (askedFrom) outer.push(`f >= ${lit(askedFrom)}`);
  if (askedTo) outer.push(`f < ${lit(addDays(askedTo, 1))}`);
  const period = askedFrom && askedTo ? `${human(askedFrom)} – ${human(askedTo)}` : askedFrom ? `since ${human(askedFrom)}` : askedTo ? `through ${human(askedTo)}` : "all records";

  // An age (L2) runs to the end of its as-of day; a later "from" date is a record dated after it, never a negative age.
  const age = pair.kind === "age";
  const cutoff = age ? `${lit(addDays(asOf ?? today, 1))}::timestamp` : "";
  if (age && pair.openWhen) inner.push(`NOT ${present(pair.openWhen)}`);
  const innerSql = (grouped: boolean) =>
    `SELECT ${readDate(pair.from)} AS f, ${pair.kind === "between" ? `${readDate(pair.to)} AS t, ` : ""}${present(pair.from)} AS hf${pair.kind === "between" ? `, ${present(pair.to)} AS ht` : ""}${grouped && g ? `, ${g} AS g` : ""} FROM ${table}${inner.length ? ` WHERE ${inner.join(" AND ")}` : ""}`;
  const d = age ? `CASE WHEN f < ${cutoff} THEN date_part('epoch', ${cutoff} - f) / 86400 END` : `CASE WHEN t >= f THEN date_part('epoch', t - f) / ${PER[pair.unit]} END`;
  const measures = (age
    ? [
        `SUM(CASE WHEN f < ${cutoff} THEN 1 ELSE 0 END) AS cases`,
        `percentile_cont(0.5) WITHIN GROUP (ORDER BY ${d}) AS median`,
        `percentile_cont(0.9) WITHIN GROUP (ORDER BY ${d}) AS p90`,
        "0 AS open",
        "SUM(CASE WHEN hf AND f IS NULL THEN 1 ELSE 0 END) AS unreadable",
        `SUM(CASE WHEN f >= ${cutoff} THEN 1 ELSE 0 END) AS backwards`,
      ]
    : [
        "SUM(CASE WHEN t >= f THEN 1 ELSE 0 END) AS cases",
        `percentile_cont(0.5) WITHIN GROUP (ORDER BY ${d}) AS median`,
        `percentile_cont(0.9) WITHIN GROUP (ORDER BY ${d}) AS p90`,
        "SUM(CASE WHEN hf AND NOT ht THEN 1 ELSE 0 END) AS open",
        "SUM(CASE WHEN (hf AND f IS NULL) OR (ht AND t IS NULL) THEN 1 ELSE 0 END) AS unreadable",
        "SUM(CASE WHEN t < f THEN 1 ELSE 0 END) AS backwards",
      ]).join(", ");
  const where = outer.length ? ` WHERE ${outer.join(" AND ")}` : "";
  const allSql = `SELECT ${measures} FROM (${innerSql(false)}) s${where}`;
  const groupSql = key
    ? `SELECT ${key} AS k, ${label} AS label, ${measures} FROM (${innerSql(true)}) s${where} GROUP BY k ORDER BY ${groupLabel === "year" ? "k DESC" : "cases DESC"} LIMIT ${MAX_GROUPS}`
    : null;
  // The follow-up buttons offer these splits; a ;-separated column would overlap, so it isn't offered there.
  const columns = p.categories.filter((c) => !c.multi).map((c) => c.column);
  return { ok: true, groupSql, allSql, period, filterLabels, groupLabel, overlap, coverage, columns };
}
