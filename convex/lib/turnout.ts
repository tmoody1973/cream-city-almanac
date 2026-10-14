import { quoteId } from "./cityProfile";
import { RID } from "./citySql";
import { parseCsv } from "./stops";

// Milwaukee's per-ward turnout, 2016–2022 (spec 2026-10-13-turnout-design §2, §4). The files differ too much to
// detect, so each election names its catalog family, the file holding its turnout, and how to read it. Pure.
export type ElectionType = "spring" | "primary" | "general";
export type Election = { key: string; label: string; type: ElectionType; familyKey: string; match: RegExp; reader: "table" | "sheet" | "report"; map: "2012" | "2022"; wards: number };
const OLD = { map: "2012" as const, wards: 327 };
export const ELECTIONS: Election[] = [
  { key: "2016-04", label: "April 2016 spring election", type: "spring", familyKey: "city:2016-spring-election-results", match: /voter turnout by ward/i, reader: "table", ...OLD },
  { key: "2016-11", label: "November 2016 general election", type: "general", familyKey: "city:election-2016-11-08", match: /VoterTurnoutbyWardNov82016\.csv/i, reader: "table", ...OLD },
  { key: "2017-02", label: "February 2017 primary", type: "primary", familyKey: "city:election-2017-02-21", match: /VoterTurnoutbyWardFeb212017\.csv/i, reader: "table", ...OLD },
  { key: "2018-04", label: "April 2018 spring election", type: "spring", familyKey: "city:2018-spring-election-results", match: /voter turnout by ward/i, reader: "table", ...OLD },
  { key: "2018-08", label: "August 2018 partisan primary", type: "primary", familyKey: "city:2018-partisan-primary", match: /\.xlsx$/i, reader: "sheet", ...OLD },
  { key: "2018-11", label: "November 2018 general election", type: "general", familyKey: "city:election-2018-11-06", match: /voter turnout/i, reader: "table", ...OLD },
  { key: "2019-04", label: "April 2019 spring election", type: "spring", familyKey: "city:2019-spring-election-results", match: /voter turnout by ward/i, reader: "table", ...OLD },
  { key: "2020-02", label: "February 2020 spring primary", type: "primary", familyKey: "city:2020-spring-primary-election-results", match: /voter turnout by ward/i, reader: "table", ...OLD },
  { key: "2020-04", label: "April 2020 spring election", type: "spring", familyKey: "city:2020-spring-election-results", match: /voter turnout by ward/i, reader: "table", ...OLD },
  { key: "2020-11", label: "November 2020 general election", type: "general", familyKey: "city:2020-general-election", match: /canvassed election results\.csv/i, reader: "report", ...OLD },
  { key: "2021-04", label: "April 2021 spring election", type: "spring", familyKey: "city:2021-spring-election", match: /\.xlsx$/i, reader: "sheet", ...OLD },
  { key: "2022-08", label: "August 2022 partisan primary", type: "primary", familyKey: "city:2022-partisan-primary", match: /2022 partisan primary/i, reader: "sheet", map: "2022", wards: 354 },
];

export type WardRow = { ward: number; registered: number; ballots: number };
export type Read = { ok: true; wards: WardRow[]; total: { registered: number; ballots: number } | null } | { ok: false; why: string };

const letters = (s: unknown) => String(s ?? "").toLowerCase().replace(/[^a-z]/g, "");
const isWard = (h: string) => ["ward", "wardno"].includes(letters(h));
const isRegistered = (h: string) => letters(h).startsWith("registeredvoters");
const isBallots = (h: string) => ["ballotscast", "ballotscasttotal"].includes(letters(h));
export function turnoutColumns(headers: string[]): { ok: true; ward: string; registered: string; ballots: string } | { ok: false; missing: string } {
  const ward = headers.find(isWard), registered = headers.find(isRegistered), ballots = headers.find(isBallots);
  if (!ward) return { ok: false, missing: "ward" };
  if (!registered) return { ok: false, missing: "registered voters" };
  if (!ballots) return { ok: false, missing: "ballots cast" };
  return { ok: true, ward, registered, ballots };
}

// "1", "Ward 1", "01", 1 → 1; "Total" → "total"; anything else (a header, "Ward 1A", blank) → null.
export function wardOf(cell: unknown): number | "total" | null {
  const s = String(cell ?? "").trim();
  if (/^total$/i.test(s)) return "total";
  const m = /^(?:ward\s*)?(\d{1,3})$/i.exec(s);
  return m ? Number(m[1]) : null;
}
const whole = (v: unknown): number | null => {
  const s = String(v ?? "").replace(/[,\s]/g, "");
  return /^\d+(\.0+)?$/.test(s) ? Number.parseInt(s, 10) : null;
};

export function tableSql(resourceId: string, cols: { ward: string; registered: string; ballots: string }): string {
  if (!RID.test(resourceId)) throw new Error("Not a CKAN resource id");
  return `SELECT ${quoteId(cols.ward)}::text AS ward, ${quoteId(cols.registered)}::text AS reg, ${quoteId(cols.ballots)}::text AS bal FROM ${quoteId(resourceId)}`;
}

// Ward rows → wards and the file's total row; a repeated ward or an unreadable number fails the election.
export function readTableRows(rows: { ward: unknown; reg: unknown; bal: unknown }[]): Read {
  const wards: WardRow[] = [];
  let total: { registered: number; ballots: number } | null = null;
  for (const r of rows) {
    const w = wardOf(r.ward);
    if (w === null) continue;
    const registered = whole(r.reg), ballots = whole(r.bal);
    if (w === "total") { if (registered !== null && ballots !== null) total = { registered, ballots }; continue; }
    if (registered === null || ballots === null) return { ok: false, why: `ward ${w} has an unreadable number` };
    if (wards.some((x) => x.ward === w)) return { ok: false, why: `ward ${w} is listed twice` };
    wards.push({ ward: w, registered, ballots });
  }
  return { ok: true, wards, total };
}

// A "General Turnout" sheet: the ward table may sit below a summary block whose "Registered Voters- Total" and
// "Ballots Cast- Total" labels are followed (a cell or two to the right) by the citywide totals.
export function readSheet(rows: string[][]): Read {
  const at = rows.findIndex((r) => turnoutColumns(r).ok);
  if (at < 0) return { ok: false, why: "no ward table with registered voters and ballots cast" };
  const c = turnoutColumns(rows[at]);
  if (!c.ok) return { ok: false, why: `no ${c.missing} column` };
  const idx = (h: string) => rows[at].indexOf(h);
  // A total row may say "Total" in the first column with the ward column blank (2021).
  const read = readTableRows(rows.slice(at + 1).map((r) => ({ ward: /^total$/i.test(String(r[0] ?? "").trim()) ? "Total" : r[idx(c.ward)], reg: r[idx(c.registered)], bal: r[idx(c.ballots)] })));
  if (!read.ok || read.total) return read;
  const stated = (label: string) => {
    for (const r of rows.slice(0, at)) {
      const i = r.findIndex((x) => letters(x) === label);
      if (i >= 0) { const v = r.slice(i + 1).map(whole).find((x) => x !== null); if (v !== undefined) return v; }
    }
    return null;
  };
  const registered = stated("registeredvoterstotal"), ballots = stated("ballotscasttotal");
  return { ...read, total: registered !== null && ballots !== null ? { registered, ballots } : null };
}

// The 2020 November canvass report: its first block of ward lines ("n,City of Milwaukee Ward,n,registered,ballots,
// blank,percent") is turnout; the 25 blocks after it are races, so reading stops at the end of the first block.
// Stated totals are on the "01 = REGISTERED VOTERS - TOTAL" and "02 = BALLOTS CAST - TOTAL" lines.
export function readReport(text: string): Read {
  const rows = parseCsv(text);
  const isWardLine = (r: string[]) => /^city of milwaukee ward$/i.test((r[1] ?? "").trim());
  const start = rows.findIndex(isWardLine);
  const after = start < 0 ? -1 : rows.slice(start).findIndex((r) => !isWardLine(r));
  const block = start < 0 ? [] : rows.slice(start, after < 0 ? undefined : start + after);
  const read = readTableRows(block.map((r) => ({ ward: r[2], reg: r[3], bal: r[4] })));
  if (!read.ok) return read;
  const stated = (re: RegExp) => { const r = rows.find((x) => re.test(x[0] ?? "")); return r ? r.slice(1).map(whole).find((x) => x !== null) ?? null : null; };
  const registered = stated(/^0?1 = REGISTERED VOTERS - TOTAL/i), ballots = stated(/^0?2 = BALLOTS CAST - TOTAL/i);
  return { ...read, total: registered !== null && ballots !== null ? { registered, ballots } : null };
}

// Before storing: the wards must add up to the file's own total (when it states one); fewer wards than the map's
// count marks the election partial.
export function checked(e: Election, r: Read): { ok: true; wards: WardRow[]; partial: boolean; count: number } | { ok: false; why: string } {
  if (!r.ok) return r;
  if (!r.wards.length) return { ok: false, why: "no ward rows" };
  const reg = r.wards.reduce((s, w) => s + w.registered, 0), bal = r.wards.reduce((s, w) => s + w.ballots, 0);
  if (r.total && (r.total.registered !== reg || r.total.ballots !== bal)) {
    return { ok: false, why: `wards add up to ${reg} registered and ${bal} ballots; the file's total says ${r.total.registered} and ${r.total.ballots}` };
  }
  return { ok: true, wards: r.wards, partial: r.wards.length < e.wards, count: r.wards.length };
}

const RESOURCE = /\/resource\/([0-9a-f-]{36})\//;
// The election's file among its family's catalog members: "<member title> <file name>" matches the entry's pattern.
export function sourceFile(e: Election, members: { title: string; files: { name: string; format: string; url: string }[] }[]): { url: string; resourceId: string | null } | null {
  for (const m of members) for (const f of m.files) {
    if (e.match.test(`${m.title} ${f.name}`) && f.url.startsWith("https://data.milwaukee.gov/")) return { url: f.url, resourceId: RESOURCE.exec(f.url)?.[1] ?? null };
  }
  return null;
}
