import type { ElectionType } from "./turnout";

// countTurnout's math (spec 2026-10-13-turnout-design §5): code computes every figure; the AI writes none.
export type StoredElection = { election: string; label: string; type: ElectionType; map: "2012" | "2022"; wards: number; of: number; partial: boolean; status: "read" | "failed" };
export type TurnoutArgs = { type?: ElectionType | "all"; from?: number; to?: number; ward?: number; groupBy?: "election" | "ward"; order?: "lowest" | "highest" };
export type TurnoutRow = { label: string; type: ElectionType | null; registered: number; ballots: number; turnout: number | null; partial?: boolean };
export type TurnoutResult =
  | { status: "ok"; title: string; groupBy: "election" | "ward"; rows: TurnoutRow[]; notes: string[]; source: string }
  | { status: "refused"; reason: string };

export const RANK_FLOOR = 50;
const RANK_N = 10;
const REG = "Registered voters is the City's count on election day.";
const MIX = "Turnout differs by type of election: November general elections draw far more voters than spring or primary ones, so compare like with like.";
const REDRAW = "Ward lines were redrawn in 2022, so a ward number before and after names a different area.";
const SOURCE = "From the City of Milwaukee's election results files (2016–2022), read by the Almanac.";
const YEARS = "Turnout is available for elections from 2016 to 2022.";
const pct = (b: number, r: number) => (r > 0 ? Math.round((1000 * b) / r) / 10 : null);
const yearOf = (election: string) => Number(election.slice(0, 4));

type WardIn = { election: string; ward: number; registered: number; ballots: number };
export function summarize(rows: WardIn[], elections: StoredElection[], a: TurnoutArgs): TurnoutResult {
  if (!rows.length) return { status: "refused", reason: "Turnout hasn't been built yet." };
  const from = a.from ?? 2016, to = a.to ?? 2022;
  if (!Number.isInteger(from) || !Number.isInteger(to) || from > to || to < 2016 || from > 2022) return { status: "refused", reason: YEARS };
  const type = a.type ?? "all";
  const inRange = (e: StoredElection) => yearOf(e.election) >= from && yearOf(e.election) <= to && (type === "all" || e.type === type);
  const read = elections.filter((e) => e.status === "read" && inRange(e)).sort((x, y) => x.election.localeCompare(y.election));
  const failed = elections.filter((e) => e.status === "failed" && inRange(e));
  const groupBy = a.groupBy ?? "election";
  if (a.order && groupBy !== "ward") return { status: "refused", reason: "Lowest or highest wards need groupBy ward and one election." };
  if (groupBy === "ward" && read.length !== 1) return { status: "refused", reason: "Ward lists are for one election at a time: pick one election, or ask for one ward across elections." };
  if (!read.length) return { status: "refused", reason: failed.length ? failed.map((e) => `The City's file for ${e.label} couldn't be read.`).join(" ") : YEARS };

  const byElection = new Map<string, WardIn[]>();
  for (const r of rows) byElection.set(r.election, [...(byElection.get(r.election) ?? []), r]);
  if (a.ward !== undefined && !read.some((e) => (byElection.get(e.election) ?? []).some((w) => w.ward === a.ward))) {
    const max = Math.max(...read.map((e) => e.of));
    return { status: "refused", reason: `Ward ${a.ward} isn't on the ward map of the elections asked (${from}–${to}: wards 1–${max}).` };
  }

  const notes = [REG];
  let out: TurnoutRow[];
  if (groupBy === "ward") {
    const e = read[0];
    const wards = byElection.get(e.election) ?? [];
    const ranked = wards.filter((w) => w.registered >= RANK_FLOOR).map((w) => ({ label: `Ward ${w.ward}`, type: null, registered: w.registered, ballots: w.ballots, turnout: pct(w.ballots, w.registered) }));
    ranked.sort((x, y) => (a.order === "highest" ? (y.turnout ?? 0) - (x.turnout ?? 0) : (x.turnout ?? 0) - (y.turnout ?? 0)));
    out = a.order ? ranked.slice(0, RANK_N) : ranked;
    if (ranked.length < wards.length) notes.push(`Wards with fewer than ${RANK_FLOOR} registered voters are left out of the ranking.`);
  } else {
    // One ward: only the elections whose map has it (ward 340 exists from 2022 only).
    const shown = a.ward === undefined ? read : read.filter((e) => (byElection.get(e.election) ?? []).some((w) => w.ward === a.ward));
    out = shown.map((e) => {
      const ws = (byElection.get(e.election) ?? []).filter((w) => a.ward === undefined || w.ward === a.ward);
      const registered = ws.reduce((s, w) => s + w.registered, 0), ballots = ws.reduce((s, w) => s + w.ballots, 0);
      const partial = e.partial && a.ward === undefined;
      return { label: partial ? `${e.label} (wards 1–${e.wards} of ${e.of} only)` : e.label, type: e.type, registered, ballots, turnout: pct(ballots, registered), ...(partial ? { partial: true } : {}) };
    });
    if (new Set(shown.map((e) => e.type)).size > 1) notes.push(MIX);
    if (a.ward === undefined) for (const e of shown.filter((x) => x.partial)) notes.push(`The City's ${e.label} file lists only ${e.wards} of the city's ${e.of} wards, so its citywide figure undercounts.`);
    if (a.ward !== undefined && new Set(shown.map((e) => e.map)).size > 1) notes.push(REDRAW);
  }
  notes.push(...failed.map((e) => `The City's file for ${e.label} couldn't be read.`));
  const types = type === "all" ? "all elections" : `${type} elections`;
  const years = read.length === 1 ? read[0].label : `${yearOf(read[0].election)}–${yearOf(read[read.length - 1].election)}`;
  return { status: "ok", title: ["Milwaukee voter turnout", types, years, ...(a.ward !== undefined ? [`ward ${a.ward}`] : [])].join(" · "), groupBy, rows: out, notes, source: SOURCE };
}
