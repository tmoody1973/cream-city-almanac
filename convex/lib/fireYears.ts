import { quoteId } from "./cityProfile";
import { lit, RID } from "./citySql";

// Fire Department calls by year (spec 2026-10-14-fire-history §4). Hand-kept: the City's 2015–2023 yearly Fire
// Incident Detail files never change; their columns were renamed in 2020 and their dates come in three shapes.
// 2024 on is the MFD Calls for Service file (a newer system), read from its stored profile.
export type DateShape = "iso" | "mdy4-minute" | "mdy2-ampm";
export type FireCols = { received: string; dispatched: string; arrived: string; type: string };
export type IncidentSource = { year: number; resourceId: string; cols: FireCols; shape: DateShape; toMinute: boolean };
export type YearQuery = { table: string; cols: FireCols; shape: DateShape; where: string[] };

const SPACED: FireCols = { received: "Date Received", dispatched: "Date Dispatched", arrived: "Date Arrived", type: "Final Call for Service Type" };
const UNDERSCORED: FireCols = { received: "Date_Received", dispatched: "Date_Dispatched", arrived: "Date_Arrived", type: "Final_Call_for_Service_Type" };
export const INCIDENT_YEARS: IncidentSource[] = [
  { year: 2015, resourceId: "97509bea-dfa4-435e-aa75-5499adf7bbe0", cols: SPACED, shape: "mdy4-minute", toMinute: true },
  { year: 2016, resourceId: "5d2d6ce8-e4f6-4c41-a800-31e4eface37f", cols: SPACED, shape: "mdy4-minute", toMinute: true },
  { year: 2017, resourceId: "25a3fb9e-161c-416e-82da-6837c704b643", cols: SPACED, shape: "mdy4-minute", toMinute: true },
  { year: 2018, resourceId: "18d887be-4254-4386-b9b4-f1a8c016db38", cols: SPACED, shape: "iso", toMinute: false },
  { year: 2019, resourceId: "99b49b76-50e6-4b13-b61d-20e94078b310", cols: SPACED, shape: "mdy4-minute", toMinute: true },
  { year: 2020, resourceId: "8aae2885-b3ac-4ba9-a1e3-daab4464c835", cols: UNDERSCORED, shape: "mdy2-ampm", toMinute: true },
  { year: 2021, resourceId: "d1068a0d-b118-4a29-99c3-ee56c9c6f461", cols: UNDERSCORED, shape: "iso", toMinute: false },
  { year: 2022, resourceId: "b184f543-ce98-429d-99a4-3a2dddda3d98", cols: UNDERSCORED, shape: "iso", toMinute: false },
  { year: 2023, resourceId: "d18ef942-9630-4b82-b5a1-61fad0af422a", cols: UNDERSCORED, shape: "iso", toMinute: false },
];
export const MFD_FAMILY = "city:mfd-calls-for-service-detail";
export const MFD_COLS: FireCols = { received: "IncidentStarted", dispatched: "FirstUnitDispatched", arrived: "FirstUnitArrived", type: "IncidentType" };
const MFD_FROM = 2024; // its first record is 2024-02-20 05:46:50; Jan 1 – Feb 19, 2024 is in neither file
export const LAST_TYPE_YEAR = 2023;

// Each shape's pattern; text that doesn't match (blank, "NULL", another shape) is NULL, never cast.
// ponytail: a matched but impossible date (Feb 30) would fail the year's query; none seen in the nine files.
const ISO = "^(19|20)[0-9]{2}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01]) [0-9]{2}:[0-9]{2}(:[0-9]{2}([.][0-9]+)?)?$";
const MDY4 = "^(0?[1-9]|1[0-2])/(0?[1-9]|[12][0-9]|3[01])/(19|20)[0-9]{2} [0-9]{1,2}:[0-5][0-9]$";
const MDY2 = "^(0[1-9]|1[0-2])/(0[1-9]|[12][0-9]|3[01])/[0-9]{2} (0[1-9]|1[0-2]):[0-5][0-9] [AP]M$";
export function readAt(col: string, shape: DateShape): string {
  const q = quoteId(col);
  if (shape === "iso") return `CASE WHEN ${q} ~ ${lit(ISO)} THEN ${q}::timestamp END`;
  if (shape === "mdy4-minute") return `CASE WHEN ${q} ~ ${lit(MDY4)} THEN to_timestamp(${q}, 'MM/DD/YYYY HH24:MI')::timestamp END`;
  return `CASE WHEN ${q} ~ ${lit(MDY2)} THEN to_timestamp(${q}, 'MM/DD/YY HH12:MI AM')::timestamp END`;
}

const checked = (rid: string) => {
  if (!RID.test(rid)) throw new Error("Not a CKAN resource id");
  return rid;
};
export const yearQuery = (s: IncidentSource): YearQuery => ({ table: checked(s.resourceId), cols: s.cols, shape: s.shape, where: [] });
export const mfdQuery = (resourceId: string, year: number): YearQuery => ({
  table: checked(resourceId),
  cols: MFD_COLS,
  shape: "iso",
  where: [`${quoteId(MFD_COLS.received)} LIKE ${lit(`${year}-%`)}`, `(${quoteId(MFD_COLS.type)} IS NULL OR ${quoteId(MFD_COLS.type)} <> 'Test')`],
});

const present = (c: string) => {
  const q = quoteId(c);
  return `(${q} IS NOT NULL AND ${q} <> '' AND upper(${q}) <> 'NULL')`;
};
const where = (y: YearQuery) => (y.where.length ? ` WHERE ${y.where.join(" AND ")}` : "");
const inner = (y: YearQuery) =>
  `SELECT ${readAt(y.cols.received, y.shape)} AS r, ${readAt(y.cols.dispatched, y.shape)} AS d, ${readAt(y.cols.arrived, y.shape)} AS a, ${present(y.cols.received)} AS hr, CASE WHEN upper(${quoteId(y.cols.type)}) = 'EMS' THEN 'ems' ELSE 'other' END AS g FROM ${quoteId(y.table)}${where(y)}`;
const mins = (t: "d" | "a") => `CASE WHEN ${t} >= r THEN date_part('epoch', ${t} - r) / 60 END`;
const MEASURES = [
  "COUNT(*) AS calls",
  `percentile_cont(0.5) WITHIN GROUP (ORDER BY ${mins("d")}) AS dmed`,
  `percentile_cont(0.9) WITHIN GROUP (ORDER BY ${mins("d")}) AS dp90`,
  "SUM(CASE WHEN d >= r THEN 1 ELSE 0 END) AS dn",
  `percentile_cont(0.5) WITHIN GROUP (ORDER BY ${mins("a")}) AS amed`,
  `percentile_cont(0.9) WITHIN GROUP (ORDER BY ${mins("a")}) AS ap90`,
  "SUM(CASE WHEN a >= r THEN 1 ELSE 0 END) AS an",
  "SUM(CASE WHEN hr AND r IS NULL THEN 1 ELSE 0 END) AS unreadable",
  "SUM(CASE WHEN d < r OR a < r THEN 1 ELSE 0 END) AS backwards",
].join(", ");
// The "all" row is its own query, so its medians are true medians, not a blend of the two groups'.
export const groupSql = (y: YearQuery) => `SELECT g, ${MEASURES} FROM (${inner(y)}) s GROUP BY g`;
export const allSql = (y: YearQuery) => `SELECT 'all' AS g, ${MEASURES} FROM (${inner(y)}) s`;
export const typesSql = (y: YearQuery) => `SELECT ${quoteId(y.cols.type)} AS t, COUNT(*) AS n FROM ${quoteId(y.table)}${where(y)} GROUP BY ${quoteId(y.cols.type)}`;

export type FireGroup = "all" | "ems" | "other";
export type Span = { median: number; p90: number; n: number };
export type FireStats = { group: FireGroup; calls: number; dispatch: Span | null; arrive: Span | null; unreadable: number; backwards: number };
const num = (x: unknown) => (x === null || x === undefined || x === "" ? null : Number(x));
const spanOf = (med: unknown, p90: unknown, n: unknown): Span | null => {
  const c = num(n) ?? 0;
  const m = num(med);
  const p = num(p90);
  return c > 0 && m !== null && p !== null ? { median: m, p90: p, n: c } : null;
};
export function parseStats(r: Record<string, unknown>): FireStats {
  return {
    group: r.g as FireGroup,
    calls: num(r.calls) ?? 0,
    dispatch: spanOf(r.dmed, r.dp90, r.dn),
    arrive: spanOf(r.amed, r.ap90, r.an),
    unreadable: num(r.unreadable) ?? 0,
    backwards: num(r.backwards) ?? 0,
  };
}

// "ems" and "EMS" are one type; the label is the spelling with the most calls. Blank types aren't a type.
export function mergeTypes(rows: Record<string, unknown>[]): { type: string; calls: number }[] {
  const by = new Map<string, { calls: number; spellings: Map<string, number> }>();
  for (const r of rows) {
    const t = typeof r.t === "string" ? r.t.trim() : "";
    if (!t) continue;
    const n = num(r.n) ?? 0;
    const e = by.get(t.toUpperCase()) ?? { calls: 0, spellings: new Map<string, number>() };
    e.calls += n;
    e.spellings.set(t, (e.spellings.get(t) ?? 0) + n);
    by.set(t.toUpperCase(), e);
  }
  return [...by.values()].map((e) => ({ type: [...e.spellings].sort((a, b) => b[1] - a[1])[0][0], calls: e.calls })).sort((a, b) => b.calls - a.calls);
}

export const mfdYears = (current: number) => Array.from({ length: Math.max(0, current - MFD_FROM + 1) }, (_, i) => MFD_FROM + i);
export const partialNote = (year: number, current: number) => (year === MFD_FROM ? "from Feb 20" : year === current ? "so far" : null);
