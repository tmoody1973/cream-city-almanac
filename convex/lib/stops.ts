import { quoteId } from "./cityProfile";
import { RID } from "./citySql";

// MPD stop-and-search packages (spec 2026-10-13-stop-search-design §2, §4): titles → periods, which tables hold
// people, which columns, and how MPD's values become the Almanac's groups. Pure: no I/O. Only coded fields are read;
// narrative text, dates of birth and IDs never are.
export type StopKind = "traffic" | "field-interview" | "no-action";
export type YesNo = "yes" | "no" | "unknown";
export type StopRow = { kind: StopKind; race: string; sex: string; frisked: YesNo | null; searched: YesNo | null; found: string | null; n: number };
type Field = "race" | "eth" | "sex" | "frisked" | "searched" | "found";
export type Raw = Partial<Record<Field, unknown>> & { n: unknown };
export const KINDS: StopKind[] = ["traffic", "field-interview", "no-action"];

const ORD: Record<string, number> = { "1st": 1, "2nd": 2, "3rd": 3, "4th": 4 };
// "2021 4th Quarter - MPD Stop and Search Data" → 2021-Q4; the first package covers two quarters: 2019-Q1Q2.
export function periodOf(title: string): { period: string; year: number } | null {
  const m = /^(\d{4}) (1st|2nd|3rd|4th)(?: & (1st|2nd|3rd|4th))? Quarters? - MPD Stop and Search Data$/i.exec(title.trim());
  if (!m) return null;
  const qs = [m[2], m[3]].filter((q): q is string => Boolean(q)).map((q) => `Q${ORD[q.toLowerCase()]}`);
  return { period: `${m[1]}-${qs.join("")}`, year: Number(m[1]) };
}

// Table names change every few quarters ("Tracs Individual", "Tracs_Individual_REMCOL.csv", "…REDACTED TO POST 1.csv"):
// compare letters only, without the City's redaction and file-type words.
const squash = (s: string) => s.toLowerCase().replace(/\.csv$/, "").replace(/[^a-z]/g, "").replace(/redacted|remcol|topost/g, "");
const TABLES: Record<string, StopKind> = { tracsindividual: "traffic", tracsindividuals: "traffic", informfieldinterviewperson: "field-interview", informnoactionencounterperson: "no-action" };
export const kindOfTable = (name: string): StopKind | null => TABLES[squash(name)] ?? null;

const WANT: Record<StopKind, Partial<Record<Field, string>>> = {
  traffic: { race: "race", sex: "sex" },
  "field-interview": { race: "racedescription", eth: "ethnicitydescription", sex: "sexcode", frisked: "patdowndescription", searched: "searchperformeddescription", found: "searchresultsdescription" },
  "no-action": { race: "racedescription", eth: "ethnicitydescription", sex: "sexcode" },
};
const letters = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
// Each fact's column in this table ("race Description" or "race_Description"). Ethnicity is optional; any other
// missing column fails the table, naming it, so a renamed column never counts as nobody.
export function columnsFor(kind: StopKind, headers: string[]): { ok: true; cols: Partial<Record<Field, string>> } | { ok: false; missing: string } {
  const cols: Partial<Record<Field, string>> = {};
  for (const [f, want] of Object.entries(WANT[kind]) as [Field, string][]) {
    const h = headers.find((x) => letters(x) === want);
    if (h) cols[f] = h;
    else if (f !== "eth") return { ok: false, missing: want };
  }
  return { ok: true, cols };
}

const clean = (v: unknown) => { const s = String(v ?? "").trim(); return s.toUpperCase() === "NULL" ? "" : s; };
const TRAFFIC_RACE: Record<string, string> = { B: "Black", W: "White", H: "Hispanic", A: "Asian or Pacific Islander", I: "American Indian or Alaska Native" };
const RACE: Record<string, string> = {
  "BLACK/AFRICAN AMERICAN": "Black", WHITE: "White", H: "Hispanic", HISPANIC: "Hispanic", ASIAN: "Asian or Pacific Islander",
  "NATIVE HAWAIIAN OR OTHER PACIFIC ISLANDER": "Asian or Pacific Islander", "AMERICAN INDIAN OR ALASKAN NATIVE": "American Indian or Alaska Native",
};
// One race/ethnicity group (spec §3): Hispanic when either field says so, else the recorded race.
const raceOf = (kind: StopKind, race: unknown, eth: unknown) =>
  clean(eth).toUpperCase().startsWith("HISPANIC") ? "Hispanic" : ((kind === "traffic" ? TRAFFIC_RACE : RACE)[clean(race).toUpperCase()] ?? "Unknown");
const sexOf = (v: unknown) => ({ M: "Male", F: "Female" } as Record<string, string>)[clean(v).toUpperCase()] ?? "Unknown";
const yesNo = (v: unknown): YesNo => ({ YES: "yes", NO: "no" } as Record<string, YesNo>)[clean(v).toUpperCase()] ?? "unknown";
const foundOf = (v: unknown) => {
  const s = clean(v);
  if (!s) return "Unknown";
  if (s.toUpperCase() === "NONE") return "None";
  return s.toLowerCase().replace(/(^|[\s/-])([a-z])/g, (_, p: string, c: string) => p + c.toUpperCase());
};

// Raw groups (from the City's SQL or one CSV line each) → the Almanac's groups, added up where they merge.
export function tally(kind: StopKind, raw: Raw[]): StopRow[] {
  const fi = kind === "field-interview";
  const by = new Map<string, StopRow>();
  for (const r of raw) {
    const n = Number(r.n);
    if (!Number.isFinite(n) || n <= 0) continue;
    const row: StopRow = { kind, race: raceOf(kind, r.race, r.eth), sex: sexOf(r.sex), frisked: fi ? yesNo(r.frisked) : null, searched: fi ? yesNo(r.searched) : null, found: fi ? foundOf(r.found) : null, n };
    const key = [row.race, row.sex, row.frisked, row.searched, row.found].join("|");
    const old = by.get(key);
    by.set(key, old ? { ...old, n: old.n + n } : row);
  }
  return [...by.values()];
}

// One grouped count per queryable table: only the found columns, under fixed names, on a checked id.
export function groupSql(kind: StopKind, resourceId: string, cols: Partial<Record<Field, string>>): string {
  if (!RID.test(resourceId)) throw new Error("Not a CKAN resource id");
  const picked = Object.entries(cols) as [Field, string][];
  return `SELECT ${picked.map(([f, c]) => `${quoteId(c)} AS ${f}`).join(", ")}, COUNT(*) AS n FROM ${quoteId(resourceId)} GROUP BY ${picked.map((_, i) => i + 1).join(", ")}`;
}

// A CSV reader for MPD's files: quoted fields hold commas, doubled quotes and line breaks (narratives).
export function parseCsv(text: string): string[][] {
  const s = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

// One person table from a ZIP: its header (below a "Column1, Column2, …" placeholder row, as in 2023 Q4), then one
// person per line.
export function countCsv(kind: StopKind, text: string): { ok: true; rows: StopRow[] } | { ok: false; missing: string } {
  let rows = parseCsv(text).filter((r) => r.some((c) => c.trim() !== ""));
  if (rows[0]?.every((c) => /^Column\d+$/.test(c.trim()))) rows = rows.slice(1);
  const [headers = [], ...body] = rows;
  const c = columnsFor(kind, headers);
  if (!c.ok) return c;
  const at = (Object.entries(c.cols) as [Field, string][]).map(([f, h]) => [f, headers.indexOf(h)] as const);
  return { ok: true, rows: tally(kind, body.map((r) => ({ ...Object.fromEntries(at.map(([f, i]) => [f, r[i]])), n: 1 }))) };
}

const RESOURCE = /\/resource\/([0-9a-f-]{36})\//;
// The queryable person tables in a package (one per kind), from the catalog's file names and links.
export function stopTables(files: { name: string; url: string }[]): { kind: StopKind; resourceId: string }[] {
  const out: { kind: StopKind; resourceId: string }[] = [];
  for (const f of files) {
    const kind = kindOfTable(f.name);
    const id = RESOURCE.exec(f.url)?.[1];
    if (kind && id && !out.some((t) => t.kind === kind)) out.push({ kind, resourceId: id });
  }
  return out;
}

// The package's data ZIP: its one ZIP that isn't a lookup or dictionary bundle, on the City's own site.
export function dataZip(files: { name: string; format: string; url: string }[]): string | null {
  const zips = files.filter((f) => /^zip$/i.test(f.format) && !/lookup|dictionar/i.test(f.name));
  return zips.length === 1 && zips[0].url.startsWith("https://data.milwaukee.gov/") ? zips[0].url : null;
}
