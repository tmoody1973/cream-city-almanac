// A live City dataset's menu for counting: which column is the date, which are districts, the top values of each
// category column (offense codes, request types), its row count and date range. Only what's here can be counted.
// The City's SQL refuses casts and NULLIF, so dates are read as ISO text ("2026-06-16 14:51:00"), which sorts correctly.
const DATE_NAMES = ["incident_date", "creationdate", "casedate", "date", "issue_date", "dateissued", "reportdate", "calldate"];
const DISTRICT = /^(police_?district|ald(erman(ic)?)?_?(dist(rict)?)?|aldermanic_?district|ward|zip(_?code)?|zipcode)$/i;
// Columns that name or identify a person: they flag the dataset and are never offered for counting.
const PEOPLE = /owner|taxpayer|first_?name|last_?name|^name$|mail(ing)?_?addr|licensee|applicant|agent|contact|operator|dispatcher|call[_ ]?taker|changed[_ ]?by|officer|person[_ ]?id/i;
const NOT_CATEGORY = /(number|nbr|_nr|_num|_no$|key|_id|^id_|id$|objectid|addr|address|location|lat|long|desc|name|comment|narrative|^x$|^y$)/i;
// A date that says when a record expires or was last edited is not when it happened: better no date column.
const NOT_EVENT_DATE = /exp|expire|upd|edited|last|changed/i;
const MAX_CATEGORIES = 6;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}/;
const LAT = /^(lat|latitude|.+_latitude)$/i;
const LON = /^(lon|long|longitude|.+_longitude)$/i;
// Milwaukee with a margin. A dataset counts by neighborhood only when its points are really here.
export const MILWAUKEE_BOX = { minLat: 42.8, maxLat: 43.3, minLon: -88.1, maxLon: -87.8 };
const IN_MILWAUKEE_SHARE = 0.9;

export interface ProfilePlan { dateColumn: string | null; districtColumns: string[]; categoryColumns: string[]; namesPeople: boolean; latColumn: string | null; lonColumn: string | null }

export function planProfile(fields: { id: string; type: string }[]): ProfilePlan {
  const names = fields.map((f) => f.id);
  const dateColumn = names.find((n) => DATE_NAMES.includes(n.toLowerCase())) ?? names.find((n) => /date/i.test(n) && !NOT_EVENT_DATE.test(n)) ?? null;
  const districtColumns = names.filter((n) => DISTRICT.test(n) && !PEOPLE.test(n));
  const categoryColumns = fields
    .filter((f) => f.type === "text" && f.id !== dateColumn && !districtColumns.includes(f.id) && !PEOPLE.test(f.id) && !NOT_CATEGORY.test(f.id) && !/date|time/i.test(f.id))
    .map((f) => f.id)
    .slice(0, MAX_CATEGORIES);
  const latColumn = names.find((n) => LAT.test(n)) ?? null;
  const lonColumn = names.find((n) => LON.test(n)) ?? null;
  const both = latColumn && lonColumn;
  return {
    dateColumn, districtColumns, categoryColumns, namesPeople: names.some((n) => PEOPLE.test(n)),
    latColumn: both ? latColumn : null, lonColumn: both ? lonColumn : null,
  };
}

export const quoteId = (s: string) => `"${s.replace(/"/g, '""')}"`;

export function profileSql(rid: string, plan: ProfilePlan) {
  const t = quoteId(rid);
  return {
    count: `SELECT COUNT(*) AS n FROM ${t}`,
    range: plan.dateColumn
      ? `SELECT MIN(${quoteId(plan.dateColumn)}) AS lo, MAX(${quoteId(plan.dateColumn)}) AS hi FROM ${t} WHERE ${quoteId(plan.dateColumn)} <> ''`
      : null,
    tops: [...plan.districtColumns, ...plan.categoryColumns].map((c) => ({
      column: c,
      sql: `SELECT ${quoteId(c)} AS v, COUNT(*) AS n FROM ${t} GROUP BY ${quoteId(c)} ORDER BY n DESC LIMIT 200`,
      // For a ';'-separated column ("13A;120" is one incident with two offenses): its single values.
      multiSql: `SELECT unnest(string_to_array(${quoteId(c)}, ';')) AS v, COUNT(*) AS n FROM ${t} GROUP BY v ORDER BY n DESC LIMIT 200`,
    })),
    points: plan.latColumn && plan.lonColumn
      ? `SELECT ${quoteId(plan.latColumn)} AS lat, ${quoteId(plan.lonColumn)} AS lon FROM ${t} WHERE ${quoteId(plan.latColumn)} IS NOT NULL AND ${quoteId(plan.lonColumn)} IS NOT NULL LIMIT 50`
      : null,
  };
}

// A column holds several values per record when any of its top values is ';'-separated.
export const isMultiValued = <R extends { v: string | null }>(rows: R[]) => rows.some((r) => String(r.v ?? "").includes(";"));

export interface CityProfile {
  familyKey: string; resourceId: string; columns: { name: string; type: string }[]; dateColumn: string | null;
  districtColumns: string[]; categories: { column: string; values: { value: string; count: number }[]; multi?: boolean }[];
  rowCount: number; minDate: string | null; maxDate: string | null; namesPeople: boolean; signature: string; updatedAt: number;
  resourceName?: string | null; // the file counted, when the City offers several live files
  latColumn?: string | null; lonColumn?: string | null; // set only when the sampled points land in Milwaukee
}

export function assembleProfile(
  familyKey: string, resourceId: string, fields: { id: string; type: string }[], plan: ProfilePlan,
  count: { n: number | string } | undefined, range: { lo: string | null; hi: string | null } | undefined,
  tops: { column: string; rows: { v: string | null; n: number | string }[]; multi?: boolean }[], now: number,
  points: { lat: unknown; lon: unknown }[] = [],
): CityProfile {
  const iso = (d: string | null | undefined) => (d && ISO_DATE.test(d) ? d.slice(0, 10) : null);
  const minDate = iso(range?.lo);
  const maxDate = iso(range?.hi);
  const hasDates = minDate !== null && maxDate !== null;
  const inside = points.filter((p) => {
    const lat = Number(p.lat), lon = Number(p.lon);
    return Number.isFinite(lat) && Number.isFinite(lon) && lat >= MILWAUKEE_BOX.minLat && lat <= MILWAUKEE_BOX.maxLat && lon >= MILWAUKEE_BOX.minLon && lon <= MILWAUKEE_BOX.maxLon;
  }).length;
  const located = plan.latColumn && plan.lonColumn && points.length > 0 && inside / points.length >= IN_MILWAUKEE_SHARE;
  return {
    familyKey, resourceId, columns: fields.map((f) => ({ name: f.id, type: f.type })), dateColumn: hasDates ? plan.dateColumn : null,
    districtColumns: plan.districtColumns,
    categories: tops.map((t) => ({
      column: t.column,
      values: t.rows.filter((r) => r.v !== null && String(r.v).trim() !== "").map((r) => ({ value: String(r.v), count: Number(r.n) })),
      ...(t.multi ? { multi: true } : {}),
    })),
    rowCount: Number(count?.n ?? 0), minDate: hasDates ? minDate : null, maxDate: hasDates ? maxDate : null,
    namesPeople: plan.namesPeople, signature: fields.map((f) => f.id).sort().join(","), updatedAt: now,
    latColumn: located ? plan.latColumn : null, lonColumn: located ? plan.lonColumn : null,
  };
}
