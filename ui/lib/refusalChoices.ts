// "Pick one:" options when Ask's tool couldn't tell what was meant (spec §5): only the options the server listed,
// each turning the original request into a full question with that one choice swapped in. At most eight.
import type { FollowUp } from "@/ui/components/FollowUps";
import type { CountArgsIn } from "./nextQuestions";
import { plainMeaning } from "./tractFormat";
import { placeName } from "./tractSummary";

const MAX = 8;
const CUT = 60;
type Slot = { place: string; year: string };
export type TractRefusal =
  | { status: "choose-column"; columns: { column: string; meaning: string; range: boolean }[]; dataset?: "a" | "b" }
  | { status: "choose-year"; available: Slot[] | { a: Slot[]; b: Slot[] }; shared?: Slot[]; year?: string; dataset?: "a" | "b" }
  | { status: string };

const clean = (meaning: string) => plainMeaning(meaning).replace(/^estimate\s*-\s*/i, "").trim();
const cut = (s: string) => (s.length > CUT ? `${s.slice(0, CUT - 1).trimEnd()}…` : s);
const columnLabel = (c: { column: string; meaning: string }) => (clean(c.meaning) ? `${cut(clean(c.meaning))} (${c.column})` : c.column);
const byMargin = <T extends { range: boolean }>(cols: T[]) => [...cols.filter((c) => c.range), ...cols.filter((c) => !c.range)];
const slots = (a: TractRefusal) => ("available" in a && Array.isArray(a.available) ? a.available : []);
const end = (d: "high" | "low") => (d === "high" ? "highest" : "lowest");

type RankArgs = { code: string; column: string; place: string; year: string; direction: "high" | "low"; cutoff?: number };
const rankQ = (a: RankArgs, column: string, words: string) =>
  `Rank census tracts by ${words}, ${end(a.direction)} first, ${placeName(a.place)} ${a.year} (${a.code} ${column}).`;

export function rankChoices(args: RankArgs, r: TractRefusal): FollowUp[] {
  if (r.status === "choose-column" && "columns" in r)
    return byMargin(r.columns).slice(0, MAX).map((c) => ({ label: columnLabel(c), question: rankQ(args, c.column, clean(c.meaning) || c.column) }));
  if (r.status === "choose-year")
    return slots(r).slice(0, MAX).map((s) => ({ label: `${s.place} ${s.year}`, question: rankQ({ ...args, place: s.place, year: s.year }, args.column, args.column) }));
  return [];
}

type ChangeArgs = { code: string; column: string; place: string; from: string; to: string };
const changeQ = (a: ChangeArgs, column: string, words: string) =>
  `Where did ${words} change most in ${placeName(a.place)} from ${a.from} to ${a.to}? (${a.code} ${column})`;

export function changeChoices(args: ChangeArgs, r: TractRefusal): FollowUp[] {
  if (r.status === "choose-column" && "columns" in r)
    return byMargin(r.columns).slice(0, MAX).map((c) => ({ label: columnLabel(c), question: changeQ(args, c.column, clean(c.meaning) || c.column) }));
  if (r.status === "choose-year") {
    // compareYears tags a refused second year with `year`; otherwise the first year is the one to change.
    const second = "year" in r && Boolean(r.year);
    return slots(r).filter((s) => s.place === args.place).slice(0, MAX)
      .map((s) => ({ label: s.year, question: changeQ(second ? { ...args, to: s.year } : { ...args, from: s.year }, args.column, args.column) }));
  }
  return [];
}

export type RelateArgs = { a: { code: string; column: string; cutoff?: number }; b: { code: string; column: string; cutoff?: number }; place: string; year: string; mode: "relate" | "mismatch"; aSide?: "high" | "low"; bSide?: "high" | "low" };
const sideText = (s: { code: string; column: string }, words?: string) => (words ? `${words} (${s.code} ${s.column})` : `${s.code} ${s.column}`);
function relateQ(a: RelateArgs, aWords?: string, bWords?: string) {
  const A = sideText(a.a, aWords), B = sideText(a.b, bWords);
  return a.mode === "mismatch"
    ? `Which census tracts in ${placeName(a.place)} (${a.year}) have ${a.aSide ?? "high"} ${A} but ${a.bSide ?? "low"} ${B}?`
    : `Does ${A} go together with ${B} across ${placeName(a.place)} census tracts in ${a.year}?`;
}

export function relateChoices(args: RelateArgs, r: TractRefusal): FollowUp[] {
  if (r.status === "choose-column" && "columns" in r) {
    const which = r.dataset ?? "a";
    return byMargin(r.columns).slice(0, MAX).map((c) => {
      const next = { ...args, [which]: { ...args[which], column: c.column } } as RelateArgs;
      const words = clean(c.meaning) || undefined;
      return { label: columnLabel(c), question: which === "a" ? relateQ(next, words) : relateQ(next, undefined, words) };
    });
  }
  // Two datasets: only a place and year both have can work. A property side has no years, so the server sends the DYCU
  // side's own list (tagged with that side) and every one of those works.
  if (r.status === "choose-year") {
    const list = "shared" in r && r.shared ? r.shared : "dataset" in r && r.dataset ? slots(r) : [];
    return list.slice(0, MAX).map((s) => ({ label: `${s.place} ${s.year}`, question: relateQ({ ...args, place: s.place, year: s.year }) }));
  }
  return [];
}

export type CountRefusal =
  | { status: "choose"; name: string; column: string; choices: string[] }
  | { status: "bad-column"; name: string; column: string; columns: string[] }
  | { status: "no-neighborhood"; name: string; nearest: string[] }
  | { status: string; name?: string };

function countQ(a: CountArgsIn, name: string) {
  const filters = (a.filters ?? []).map((f) =>
    f.values?.length ? `${f.column} is ${f.values.join(" or ")}` : [f.over !== undefined && `${f.column} over ${f.over}`, f.under !== undefined && `${f.column} under ${f.under}`].filter(Boolean).join(" and "));
  const parts = [
    filters.length ? ` where ${filters.join(" and ")}` : "",
    a.neighborhood ? ` in ${a.neighborhood}` : "",
    a.from || a.to ? `, ${a.from ? `from ${a.from}` : ""}${a.from && a.to ? " " : ""}${a.to ? `to ${a.to}` : ""}` : "",
    a.groupBy ? `, by ${a.groupBy}` : "",
  ];
  return `Count ${a.code} ${name}${parts.join("")}.`;
}

export function countChoices(args: CountArgsIn, r: CountRefusal): FollowUp[] {
  if (r.status === "choose" && "choices" in r) {
    return r.choices.slice(0, MAX).map((v) => ({
      label: v,
      question: countQ(r.column === "neighborhood"
        ? { ...args, neighborhood: v }
        : { ...args, filters: [...(args.filters ?? []).filter((f) => f.column !== r.column), { column: r.column, values: [v] }] }, r.name),
    }));
  }
  if (r.status === "bad-column" && "columns" in r) {
    return r.columns.slice(0, MAX).map((c) => ({
      label: c,
      question: countQ(args.groupBy === r.column
        ? { ...args, groupBy: c }
        : { ...args, filters: (args.filters ?? []).map((f) => (f.column === r.column ? { ...f, column: c } : f)) }, r.name),
    }));
  }
  if (r.status === "no-neighborhood" && "nearest" in r) return r.nearest.slice(0, MAX).map((n) => ({ label: n, question: countQ({ ...args, neighborhood: n }, r.name) }));
  return [];
}

export type NumberRefusal = { status: "no-neighborhood"; neighborhoods: string[] } | { status: "no-topic"; topics: string[] } | { status: "choose-row"; rows: string[] } | { status: string };
type NumberArgs = { neighborhood: string; topic: string; year?: number; row: string };
const numberQ = (a: NumberArgs) => `${a.topic}: "${a.row}" in ${a.neighborhood}${a.year ? ` (${a.year})` : ""}.`;

export function numberChoices(args: NumberArgs, r: NumberRefusal): FollowUp[] {
  const pick = (list: string[], set: (v: string) => NumberArgs) => list.slice(0, MAX).map((v) => ({ label: v, question: numberQ(set(v)) }));
  if (r.status === "no-neighborhood" && "neighborhoods" in r) return pick(r.neighborhoods, (v) => ({ ...args, neighborhood: v }));
  if (r.status === "no-topic" && "topics" in r) return pick(r.topics, (v) => ({ ...args, topic: v }));
  if (r.status === "choose-row" && "rows" in r) return pick(r.rows, (v) => ({ ...args, row: v }));
  return [];
}

type SpanArgsIn = { code: string; groupBy?: string; from?: string; to?: string; pair?: string };
type SpanRefusal = { status: string; code?: string; name?: string; pairs?: { id: string; name: string; from?: string; to?: string }[]; columns?: string[]; column?: string; choices?: string[] };
export function spanChoices(args: SpanArgsIn, r: SpanRefusal): FollowUp[] {
  const where = `${r.name ?? "this file"} (${r.code ?? args.code})`;
  if (r.status === "choose-pair" && r.pairs) return r.pairs.slice(0, MAX).map((p) => ({ label: p.name, question: `How long is the ${p.name} in ${where}? (pair ${p.id})` }));
  if (r.status === "bad-column" && r.columns) return r.columns.slice(0, MAX).map((c) => ({ label: c, question: `How long does it take in ${where}, by ${c}?` }));
  if (r.status === "choose" && r.choices && r.column) return r.choices.slice(0, MAX).map((v) => ({ label: v, question: `How long does it take in ${where}, only ${r.column} ${v}?` }));
  return [];
}

type MeasureRefusal = { status: string; code?: string; name?: string; measures?: { id: string; name: string }[]; columns?: string[]; column?: string; choices?: string[] };
export function measureChoices(r: MeasureRefusal, measureId?: string): FollowUp[] {
  const where = `${r.name ?? "this file"} (${r.code ?? ""})`;
  const keep = measureId ? ` (measure ${measureId})` : "";
  if (r.status === "choose-measure" && r.measures) return r.measures.slice(0, MAX).map((m) => ({ label: m.name, question: `How much ${m.name} in ${where}? (measure ${m.id})` }));
  if (r.status === "bad-column" && r.columns) return r.columns.slice(0, MAX).map((c) => ({ label: c, question: `How much in ${where}, by ${c}?${keep}` }));
  if (r.status === "choose" && r.choices && r.column) return r.choices.slice(0, MAX).map((v) => ({ label: v, question: `How much in ${where}, only ${r.column} ${v}?${keep}` }));
  return [];
}

// A refusal from countRecords: a how-much question gets how-much buttons that keep its measure; a count gets count buttons.
export function refusalChoicesFor(args: CountArgsIn & { measure?: { id: string } }, r: CountRefusal & MeasureRefusal): FollowUp[] {
  return args.measure ? measureChoices(r, args.measure.id) : countChoices(args, r);
}
