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

// Table names change every few quarters ("Tracs Individual", "Tracs_Individual_REMCOL.csv", "…REDACTED TO POST 1.csv",
// "…PersonV1- Redacted", "…Person Formatted- Redacted", "…Person_FIXED_…"): compare the start of the name, letters only,
// without the City's redaction and file-type words. "Tracs Contact Summary Individual" and the officer tables don't match.
const squash = (s: string) => s.toLowerCase().replace(/\.csv$/, "").replace(/[^a-z]/g, "").replace(/redacted|remcol|topost/g, "");
const PREFIXES: [string, StopKind][] = [["tracsindividual", "traffic"], ["informfieldinterviewperson", "field-interview"], ["informnoactionencounterperson", "no-action"]];
// From 2024 Q2, MPD publishes one combined file per kind (one row per person, the same columns). Matched exactly, so the
// older stop-level "…_Joined" files never are. The combined traffic file isn't used: it counts people differently from
// the older person table, so 2024 traffic stops are left uncounted rather than break the series.
const COMBINED: Record<string, StopKind> = { informfieldinterview: "field-interview", informnoactionencounter: "no-action" };
export const kindOfTable = (name: string): StopKind | null => {
  const k = squash(name);
  return COMBINED[k] ?? PREFIXES.find(([p]) => k.startsWith(p))?.[1] ?? null;
};
// A kind's table among several files: the person table wins, because older packages also hold a stop-level table with
// the combined file's name ("Inform Field Interview", 2019 Q1–Q2), which has no race column.
const isPerson = (name: string) => PREFIXES.some(([p]) => squash(name).startsWith(p));
export function pickTable<T>(items: T[], name: (x: T) => string, kind: StopKind): T | undefined {
  const hits = items.filter((x) => kindOfTable(name(x)) === kind);
  return hits.find((x) => isPerson(name(x))) ?? hits[0];
}

// A table loaded with placeholder columns ("Column1", "Column2", …, as 2021 Q1's field interviews are in the City's
// database): the real names are in its first row. Returns real name → placeholder, or null for a normal table.
export function headerRow(fields: string[], first: Record<string, unknown>): Record<string, string> | null {
  const ids = fields.filter((f) => f !== "_id");
  if (!ids.length || !ids.every((f) => /^Column\d+$/.test(f))) return null;
  return Object.fromEntries(ids.map((f) => [String(first[f] ?? "").trim(), f]).filter(([real]) => real));
}
export const firstRowSql = (resourceId: string) => {
  if (!RID.test(resourceId)) throw new Error("Not a CKAN resource id");
  return `SELECT * FROM ${quoteId(resourceId)} ORDER BY "_id" LIMIT 1`;
};

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

// One grouped count per queryable table: only the found columns, under fixed names, on a checked id. `headerId` leaves
// out a placeholder table's header row by its own row id, so a person whose race cell is blank (NULL) still counts.
export function groupSql(kind: StopKind, resourceId: string, cols: Partial<Record<Field, string>>, headerId?: number): string {
  if (!RID.test(resourceId)) throw new Error("Not a CKAN resource id");
  if (headerId !== undefined && !Number.isInteger(headerId)) throw new Error("Not a row id");
  const picked = Object.entries(cols) as [Field, string][];
  const where = headerId !== undefined ? ` WHERE "_id" <> ${headerId}` : "";
  return `SELECT ${picked.map(([f, c]) => `${quoteId(c)} AS ${f}`).join(", ")}, COUNT(*) AS n FROM ${quoteId(resourceId)}${where} GROUP BY ${picked.map((_, i) => i + 1).join(", ")}`;
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
  const linked = files.filter((f) => RESOURCE.test(f.url));
  return KINDS.flatMap((kind) => {
    const f = pickTable(linked, (x) => x.name, kind);
    return f ? [{ kind, resourceId: RESOURCE.exec(f.url)![1] }] : [];
  });
}

// The package's data ZIP: its one ZIP that isn't a lookup or dictionary bundle, on the City's own site.
export function dataZip(files: { name: string; format: string; url: string }[]): string | null {
  const zips = files.filter((f) => /^zip$/i.test(f.format) && !/lookup|dictionar/i.test(f.name));
  return zips.length === 1 && zips[0].url.startsWith("https://data.milwaukee.gov/") ? zips[0].url : null;
}
