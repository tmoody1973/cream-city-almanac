import type { StopsAnswer } from "@/lib/ask/tools";
import type { FollowUp } from "@/ui/components/FollowUps";
import { exported, safeName, type CardExport, type Ctx } from "./cardExport";

// The stops card's words and export (spec 2026-10-13-stop-search-design §6), written by code from the stored counts.
export type StopsOk = Extract<StopsAnswer, { status: "ok" }>;
export const RATE_HEADS = ["Frisked", "Searched", "Found something (of searched)"];
const KIND_WORDS = { all: "All stops", traffic: "Traffic stops", "field-interview": "Field interviews", "no-action": "No-action encounters" } as const;
export const rateText = (x: number | null | undefined) => (x === null || x === undefined ? "too few to say" : `${x}%`);

export const stopsTitle = (r: StopsOk) => ["MPD stops", KIND_WORDS[r.kind], r.period, ...r.filters, ...(r.groupBy ? [`by ${r.groupBy}`] : [])].join(" · ");

export function stopsExport(r: StopsOk, ctx: Ctx): CardExport {
  const rows = r.groups.length ? r.groups : [{ label: "Total", n: r.total, share: 100 }];
  return {
    title: stopsTitle(r),
    lines: [],
    csv: { head: [r.groupBy ?? "", "People", "Share (%)", ...(r.rates ? RATE_HEADS.map((h) => `${h} (%)`) : [])], rows: rows.map((g) => [g.label, g.n, g.share, ...(r.rates ? [g.frisked ?? null, g.searched ?? null, g.found ?? null] : [])]) },
    text: { head: [r.groupBy ?? "", "People", "Share", ...(r.rates ? RATE_HEADS : [])], rows: rows.map((g) => [g.label, g.n.toLocaleString("en-US"), `${g.share}%`, ...(r.rates ? [rateText(g.frisked), rateText(g.searched), rateText(g.found)] : [])]) },
    notes: [...r.notes, r.source, exported(ctx)],
    filename: safeName(["MPD-stops", r.kind, r.groupBy ?? "total"]),
  };
}

// Next questions keep the card's kind, period and filters.
export function stopsFollowUps(r: StopsOk): FollowUp[] {
  const kind = r.kind === "all" ? "" : ` in ${KIND_WORDS[r.kind].toLowerCase()}`;
  const scope = `${r.filters.length ? ` (${r.filters.join(", ")})` : ""}, ${r.period}`;
  const out: FollowUp[] = [];
  if (r.groupBy !== "race") out.push({ label: "BY RACE", question: `Who did MPD stop${kind}${scope}, by race?` });
  if (r.groupBy !== "year") out.push({ label: "BY YEAR", question: `How many people did MPD stop${kind}${scope}, by year?` });
  if (r.kind !== "field-interview") out.push({ label: "FIELD INTERVIEWS: FRISKS AND SEARCHES BY RACE", question: `In MPD field interviews, ${r.period}, who was frisked and searched, by race?` });
  return out.slice(0, 3);
}

type StopsArgsIn = {
  kind?: "traffic" | "field-interview" | "no-action" | "all"; from?: string; to?: string; groupBy?: string;
  filters?: { race?: string[]; sex?: string[]; frisked?: "yes" | "no"; searched?: "yes" | "no"; found?: string[] };
};
// The asked question in words, so a pick button asks the same thing with the chosen value.
export function stopsQuestion(a: StopsArgsIn): string {
  const f = a.filters ?? {};
  const kind = a.kind && a.kind !== "all" ? ` in ${KIND_WORDS[a.kind].toLowerCase()}` : "";
  const filters = [
    ...(f.race ?? []), ...(f.sex ?? []),
    ...(f.frisked ? [f.frisked === "yes" ? "frisked" : "not frisked"] : []), ...(f.searched ? [f.searched === "yes" ? "searched" : "not searched"] : []),
    ...(f.found ?? []).map((x) => `found: ${x}`),
  ];
  const when = a.from || a.to ? `, from ${a.from ?? "the start"} to ${a.to ?? "the latest"}` : "";
  return `How many people did MPD stop${kind}${filters.length ? ` (${filters.join(", ")})` : ""}${when}${a.groupBy ? `, by ${a.groupBy}` : ""}?`;
}

export const stopsChoices = (a: StopsArgsIn, r: { column: "race" | "sex" | "found"; choices: string[] }): FollowUp[] =>
  r.choices.slice(0, 8).map((c) => ({ label: c, question: stopsQuestion({ ...a, filters: { ...(a.filters ?? {}), [r.column]: [c] } }) }));
