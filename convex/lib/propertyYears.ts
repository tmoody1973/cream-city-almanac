import type { CityMeasure } from "./cityMeasures";
import { YEARLY } from "./cityFamilies";
import { quoteId, type CityProfile } from "./cityProfile";
import { groupLabelFor, lit, MAX_GROUPS, num, numberLabel, RID, type Built } from "./citySql"; // Built: buildYearCount's return type
import { measureColumns, type MeasureBuilt } from "./measureSql";

// The City's yearly property files (spec 2026-10-13-property-history-design §4–5): which columns each layout uses for
// the four facts that carry across years. A layout is recognized only when all four of its columns are there.
export type Layout = "classic" | "short" | "long";
export type YearFile = { year: number; resourceId: string; layout: Layout };

export const LAYOUTS: Record<Layout, { value: string; district: string; owner: string; ownerYes: string; cls: string }> = {
  classic: { value: "C_A_TOTAL", district: "GEO_ALDER", owner: "OWN_OCPD", ownerYes: "O", cls: "C_A_CLASS" },
  short: { value: "AssessValu", district: "DistrictNa", owner: "IsOwnerOcc", ownerYes: "1", cls: "PrevNonExe" }, // 2022–23: every name cut to 10 letters
  long: { value: "TotalAssessedValue", district: "DistrictName", owner: "IsOwnerOccupied", ownerYes: "1", cls: "PrevNonExemptClass" },
};

export function layoutOf(fields: { id: string }[]): Layout | null {
  const have = new Set(fields.map((f) => f.id));
  return (Object.keys(LAYOUTS) as Layout[]).find((l) => {
    const c = LAYOUTS[l];
    return [c.value, c.district, c.owner, c.cls].every((x) => have.has(x));
  }) ?? null;
}

const YEAR_NAME = /MPROP (\d{4})$/;
const RESOURCE = /\/resource\/([0-9a-f-]{36})\//;
// The catalog keeps each file's name and download link; the link carries the file's id.
// ponytail: a second file with the same year is ignored (first wins); the City has never published two.
export function yearFiles(files: { name: string; url: string }[], from: number): { year: number; resourceId: string }[] {
  const byYear = new Map<number, string>();
  for (const f of files) {
    const y = YEAR_NAME.exec(f.name.trim())?.[1];
    const id = RESOURCE.exec(f.url)?.[1];
    if (!y || !id || Number(y) < from || byYear.has(Number(y))) continue;
    byYear.set(Number(y), id);
  }
  return [...byYear].map(([year, resourceId]) => ({ year, resourceId })).sort((a, b) => a.year - b.year);
}

export const YEAR_TIMEOUT_MS = 25_000; // the full 2005–2026 span took 7.4 s on 2026-10-13; the default 10 s is too close
export type YearArgs = { years: { from: number; to: number }; from?: string; to?: string; filters?: { column: string; values?: string[]; over?: number; under?: number }[]; groupBy?: string };

const YEAR_COLUMNS = ["C_A_TOTAL", "GEO_ALDER", "OWN_OCPD", "C_A_CLASS"];
const DISTRICT_NOTE = "District lines are redrawn after each census, so a district number can cover a different area in different years.";
const EARLIER = "Earlier yearly files use different column layouts, and some years are missing or incomplete.";
const YEARS_ONLY = "Years apply to the City's property file only.";
const NOT_DATES = "Use years for assessment years; from and to are sale dates.";
// The values each carried fact offers, and how the card names them.
const VALUES: Record<string, { values: string[]; label: (v: string) => string }> = {
  GEO_ALDER: { values: Array.from({ length: 15 }, (_, i) => String(i + 1)), label: (v) => groupLabelFor("GEO_ALDER", v) },
  OWN_OCPD: { values: ["O"], label: () => "owner-occupied" },
  C_A_CLASS: { values: ["1", "5"], label: (v) => (v === "1" ? "residential" : "condominiums") },
};

const where = (parts: string[]) => (parts.length ? ` WHERE ${parts.join(" AND ")}` : "");

// What a question asks of each year's file: filters on the carried facts (applied inside each file, in that file's own
// column names), and whether the district comes along for a district group.
export type YearFilters = { district?: string[]; owner?: boolean; cls?: string[]; byDistrict?: boolean };

// One table of the chosen years' files (spec §5): each file gives only its year tag, its value already read as a number
// (`v`), and its district when grouped by it, with the filters applied inside it. Live check 2026-10-13: selecting every
// fact and filtering outside the union took 52 s and a 7,400-character address (the City refuses past ~8,000);
// this shape gives the same figures in 4 s at 4,700 (reading the number after stacking the files was 24 s). Today's file keeps only its current assessment, as counts without
// years do. Only fixed text, checked ids, integer years and listed values enter the SQL.
// The address grows ~300 characters a year; past 6,000 the City client sends the SQL in a POST body (ckan.ts).
export function yearSource(p: CityProfile, picked: YearFile[], f: YearFilters = {}): string {
  if (!picked.length) throw new Error("No property files for those years");
  return `(${picked.map((y) => {
    if (!RID.test(y.resourceId)) throw new Error("Not a CKAN resource id");
    if (!Number.isInteger(y.year)) throw new Error("Not an assessment year");
    const c = LAYOUTS[y.layout];
    if (!c) throw new Error("Unknown layout");
    const year = lit(String(y.year));
    const inList = (col: string, vs: string[]) => `${quoteId(col)} IN (${vs.map(lit).join(", ")})`;
    const conds = [
      ...(y.resourceId === p.resourceId ? [`"YR_ASSMT" = ${year}`] : []),
      ...(f.district?.length ? [inList(c.district, f.district)] : []),
      ...(f.owner ? [`${quoteId(c.owner)} = ${lit(c.ownerYes)}`] : []),
      ...(f.cls?.length ? [inList(c.cls, f.cls)] : []),
    ];
    return `SELECT ${year} AS "yr", ${num(c.value)} AS v${f.byDistrict ? `, ${quoteId(c.district)} AS "GEO_ALDER"` : ""} FROM ${quoteId(y.resourceId)}${where(conds)}`;
  }).join(" UNION ALL ")}) AS t`;
}

type Scope = { picked: YearFile[]; period: string; source: string | undefined; latest: string | undefined; notes: string[] };
// Refusals shared by counts (Built) and measures (MeasureBuilt); each helper returns only the kinds both can carry.
type BadDates = { ok: false; status: "bad-dates"; from: string; to: string; reason?: string };
type Outside = { ok: false; status: "outside-coverage"; coverage: string; note?: string };
type BadColumn = { ok: false; status: "bad-column"; column: string; columns: string[] };
type Choose = { ok: false; status: "choose"; column: string; asked: string; choices: string[] };

// The years asked, checked and clamped to the stored files; the card's period, source line and notes.
function scope(p: CityProfile, a: YearArgs): Scope | BadDates | Outside {
  const { from, to } = a.years;
  const bad = (reason?: string): BadDates => ({ ok: false, status: "bad-dates", from: String(from), to: String(to), ...(reason ? { reason } : {}) });
  const files = p.years ?? [];
  if (!files.length) return bad(YEARS_ONLY);
  if ((a.from && a.from.trim()) || (a.to && a.to.trim())) return bad(NOT_DATES);
  if (!Number.isInteger(from) || !Number.isInteger(to) || from > to) return bad();
  const lo = files[0].year, hi = files[files.length - 1].year;
  if (to < lo || from > hi) return { ok: false, status: "outside-coverage", coverage: `${lo} – ${hi} assessments`, ...(to < lo ? { note: EARLIER } : {}) };
  const [f, t] = [Math.max(from, lo), Math.min(to, hi)];
  const picked = files.filter((y) => y.year >= f && y.year <= t);
  const clamped = f !== from || t !== to ? " (clamped to the files' range)" : "";
  const period = f === t ? `${f} assessment${clamped}` : `${f} – ${t} assessments${clamped}`;
  const past = picked.filter((y) => y.resourceId !== p.resourceId).map((y) => y.year);
  const now = picked.find((y) => y.resourceId === p.resourceId)?.year;
  const span = past.length ? (past[0] === past[past.length - 1] ? `${past[0]}` : `${past[0]}–${past[past.length - 1]}`) : "";
  const source = !past.length ? undefined
    : past.length === 1 && now === undefined ? `From the City's ${past[0]} property file.`
    : `From the City's yearly property files (${span})${now !== undefined ? ` and its current file (${now})` : ""}.`;
  const have = new Set(picked.map((y) => y.year));
  const missing = Array.from({ length: t - f + 1 }, (_, i) => f + i).filter((y) => !have.has(y));
  const notes = [YEARLY[p.familyKey]?.note ?? "", ...(missing.length ? [`The City has no usable file for ${missing.join(", ")}.`] : [])].filter(Boolean);
  return { picked, period, source, latest: picked.length > 1 ? String(picked[picked.length - 1].year) : undefined, notes };
}

// A values filter on a carried fact: only the values that fact offers get in.
function yearFilter(f: { column: string; values?: string[] }): { ok: true; column: string; values: string[]; labels: string[] } | BadColumn | Choose {
  const col = YEAR_COLUMNS.find((c) => c.toLowerCase() === f.column.toLowerCase());
  const fact = col ? VALUES[col] : undefined;
  if (!col || !fact) return { ok: false, status: "bad-column", column: f.column, columns: YEAR_COLUMNS };
  const asked = (f.values ?? []).map((v) => v.trim());
  const wrong = asked.find((v) => !fact.values.includes(v));
  if (!asked.length || wrong !== undefined) return { ok: false, status: "choose", column: col, asked: wrong ?? "", choices: fact.values.slice(0, 8) };
  const uniq = [...new Set(asked)];
  return { ok: true, column: col, values: uniq, labels: uniq.map(fact.label) };
}

function filtersFor(a: YearArgs): { filters: YearFilters; numbers: string[]; labels: string[] } | BadColumn | Choose {
  const filters: YearFilters = {};
  const numbers: string[] = [], labels: string[] = [];
  for (const f of a.filters ?? []) {
    if (f.over !== undefined || f.under !== undefined) {
      if (f.column.toLowerCase() !== "c_a_total") return { ok: false, status: "bad-column", column: f.column, columns: YEAR_COLUMNS };
      for (const [op, x] of [[">", f.over], ["<", f.under]] as const) {
        if (x === undefined) continue;
        if (!Number.isFinite(x)) return { ok: false, status: "bad-column", column: f.column, columns: YEAR_COLUMNS };
        numbers.push(`v ${op} ${x}`);
        labels.push(numberLabel("C_A_TOTAL", op === ">" ? "over" : "under", x));
      }
      continue;
    }
    const r = yearFilter(f);
    if (!r.ok) return r;
    if (r.column === "GEO_ALDER") filters.district = r.values;
    else if (r.column === "OWN_OCPD") filters.owner = true;
    else filters.cls = r.values;
    labels.push(...r.labels);
  }
  return { filters, numbers, labels };
}

// The group: a span is always by year (adding years would count each parcel once per year); district for one year only.
function groupFor(a: YearArgs, multi: boolean): { key: '"yr"' | '"GEO_ALDER"' | null; label: "year" | "GEO_ALDER" | null } | BadColumn {
  const asked = a.groupBy?.trim().toLowerCase();
  if (!asked) return multi ? { key: '"yr"', label: "year" } : { key: null, label: null };
  if (asked === "year") return { key: '"yr"', label: "year" };
  if (asked === "geo_alder") return multi ? { ok: false, status: "bad-column", column: a.groupBy!, columns: ["year"] } : { key: '"GEO_ALDER"', label: "GEO_ALDER" };
  return { ok: false, status: "bad-column", column: a.groupBy!, columns: ["year", "GEO_ALDER"] };
}

export function buildYearCount(p: CityProfile, a: YearArgs): Built {
  const s = scope(p, a);
  if ("ok" in s) return s;
  const fl = filtersFor(a);
  if ("ok" in fl) return fl;
  const multi = s.picked.length > 1;
  const g = groupFor(a, multi);
  if ("ok" in g) return g;
  const table = yearSource(p, s.picked, { ...fl.filters, byDistrict: g.label === "GEO_ALDER" });
  const value = fl.numbers.length ? ["v > 0", ...fl.numbers] : [];
  const newest = s.latest ? [`"yr" = ${lit(s.latest)}`] : [];
  const notes = [...s.notes, ...(fl.filters.district && multi ? [DISTRICT_NOTE] : [])];
  return {
    ok: true,
    totalSql: `SELECT COUNT(*) AS n FROM ${table}${where([...value, ...newest])}`,
    groupSql: g.key ? `SELECT ${g.key} AS g, COUNT(*) AS n FROM ${table}${where(value)} GROUP BY g ORDER BY ${g.label === "year" ? "g DESC" : "n DESC"} LIMIT ${MAX_GROUPS}` : null,
    futureSql: null, period: s.period, filterLabels: fl.labels, groupLabel: g.label, overlap: false, dateColumn: null, coverage: null,
    points: null, gridSql: null, tractSql: null, files: "only",
    ofSql: fl.numbers.length ? `SELECT COUNT(*) AS n FROM ${table}${where(["v > 0", ...newest])}` : null,
    note: notes.join(" ") || null, timeoutMs: YEAR_TIMEOUT_MS,
    ...(s.source ? { source: s.source } : {}), ...(s.latest ? { latestYear: s.latest } : {}),
  };
}

// The assessed-value measure by year (or by district for one year); its summary row is the newest year (spec §5).
export function buildYearMeasure(p: CityProfile, m: CityMeasure, a: YearArgs): MeasureBuilt {
  const bad = (): MeasureBuilt => ({ ok: false, status: "bad-dates", from: String(a.years.from), to: String(a.years.to), reason: YEARS_ONLY });
  if (m.column !== "C_A_TOTAL") return bad();
  const s = scope(p, a);
  if ("ok" in s) return s.status === "outside-coverage" ? { ok: false, status: "bad-dates", from: String(a.years.from), to: String(a.years.to), reason: `The City's property files here cover ${s.coverage}.${s.note ? ` ${s.note}` : ""}` } : s;
  const fl = filtersFor({ ...a, filters: a.filters?.map(({ column, values }) => ({ column, values })) });
  if ("ok" in fl) return fl;
  const multi = s.picked.length > 1;
  const g = groupFor(a, multi);
  if ("ok" in g) return g;
  // The plain number check (in yearSource), not the money cleanup: assessed values are plain digits, and stripping $ and
  // commas from 3.4 million values made the query 52 s live. A value it can't read is counted as unreadable on the card.
  const table = yearSource(p, s.picked, { ...fl.filters, byDistrict: g.label === "GEO_ALDER" });
  const measures = measureColumns(m.skipZero);
  const key = g.label === "year" ? '"yr"' : g.label ? '"GEO_ALDER"' : null;
  const notes = [...s.notes, ...(fl.filters.district && multi ? [DISTRICT_NOTE] : [])];
  return {
    ok: true, period: s.period, filterLabels: fl.labels, groupLabel: g.label,
    allSql: `SELECT ${measures} FROM ${table}${s.latest ? ` WHERE "yr" = ${lit(s.latest)}` : ""}`,
    groupSql: key ? `SELECT ${key} AS g, ${measures} FROM ${table} GROUP BY g ORDER BY ${g.label === "year" ? "g DESC" : "n DESC"} LIMIT ${MAX_GROUPS}` : null,
    note: notes.join(" "), timeoutMs: YEAR_TIMEOUT_MS,
    ...(s.source ? { source: s.source } : {}), ...(s.latest ? { latestYear: s.latest } : {}),
  };
}
