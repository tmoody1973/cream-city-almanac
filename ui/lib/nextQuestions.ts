// Next-question ideas under a card (docs/superpowers/specs/2026-10-11-follow-up-buttons-design.md §4). Code-built
// from the card's own settings and result: a button appears only when the card holds what it needs, and its question
// names the dataset code and column so Ask asks for exactly what the button meant. No figures of our own.
import type { FollowUp } from "@/ui/components/FollowUps";
import { EXACT, placeName, subject } from "./tractSummary";
import type { SpanOk } from "./spanText";
import type { MeasureOk } from "./measureText";

const MAX = 3;
export type Col = { code: string; name: string; column: string; meaning: string; place: string; year: string; confidence: string | null };
const ref = (h: Pick<Col, "code" | "column">) => `(${h.code} ${h.column})`;
const end = (d: "high" | "low") => (d === "high" ? "highest" : "lowest");
// An exact City figure's year label is "2026 assessment"; the tools take the year alone.
const yearOf = (h: Col) => (h.confidence === EXACT ? (h.year.match(/\d{4}/)?.[0] ?? h.year) : h.year);
const rankQ = (h: Col, d: "high" | "low", year = yearOf(h)) => `Rank census tracts by ${subject(h)}, ${end(d)} first, ${placeName(h.place)} ${year} ${ref(h)}.`;
const goesWith = (h: Col, year: string) => `What else goes with ${subject(h)} across ${placeName(h.place)} census tracts in ${year}? ${ref(h)}`;

export function rankFollowUps(h: Col, direction: "high" | "low"): FollowUp[] {
  const out: FollowUp[] = [{ label: direction === "high" ? "SHOW THE LOWEST" : "SHOW THE HIGHEST", question: rankQ(h, direction === "high" ? "low" : "high") }];
  // Exact City figures hold one assessment: no change over time.
  if (h.confidence !== EXACT) out.push({ label: "WHERE DID IT CHANGE?", question: `Where did ${subject(h)} change most in ${placeName(h.place)}, from an earlier year to ${h.year}? ${ref(h)}` });
  out.push({ label: "WHAT GOES WITH IT?", question: goesWith(h, yearOf(h)) });
  return out.slice(0, MAX);
}

export function changeFollowUps(h: Col, to: string): FollowUp[] {
  return [{ label: "RANK BY THIS", question: rankQ(h, "high", to) }, { label: "WHAT GOES WITH IT?", question: goesWith(h, to) }];
}

export type RelateIn = { mode: "relate" | "mismatch"; a: Col; b: Col; place: string; year: string; strength: "too-few" | "little" | "weak" | "moderate" | "strong"; aSide?: "high" | "low"; bSide?: "high" | "low" };
const side = (h: Col) => `${subject(h)} ${ref(h)}`;
const mismatchQ = (r: RelateIn, aSide: "high" | "low", bSide: "high" | "low") =>
  `Which census tracts in ${placeName(r.place)} (${r.year}) have ${aSide} ${side(r.a)} but ${bSide} ${side(r.b)}?`;

export function relateFollowUps(r: RelateIn): FollowUp[] {
  if (r.mode === "relate") {
    if (r.strength === "too-few") return [];
    return [{ label: "ONE HIGH, THE OTHER LOW", question: mismatchQ(r, "high", "low") }, { label: "THE OTHER WAY ROUND", question: mismatchQ(r, "low", "high") }];
  }
  const a = r.aSide ?? "high", b = r.bSide ?? "low";
  return [
    { label: "DO THEY GO TOGETHER?", question: `Does ${side(r.a)} go together with ${side(r.b)} across ${placeName(r.place)} census tracts in ${r.year}?` },
    { label: "FLIP THE SIDES", question: mismatchQ(r, a === "high" ? "low" : "high", b === "high" ? "low" : "high") },
  ];
}

export type CountArgsIn = { code: string; from?: string; to?: string; filters?: { column: string; values?: string[]; over?: number; under?: number }[]; groupBy?: string; neighborhood?: string };
export type CountIn = { code: string; name: string; filters: string[]; period: string; dateColumn: string | null; map: unknown | null; of?: unknown };
const countBase = (r: CountIn) => `Count ${r.code} ${r.name}${r.filters.length ? ` (${r.filters.join(", ")})` : ""}`;
// A year earlier; Feb 29 becomes Feb 28 (the year before has none).
const yearEarlier = (iso: string) => `${Number(iso.slice(0, 4)) - 1}${iso.slice(4, 10) === "-02-29" ? "-02-28" : iso.slice(4)}`;

export function countFollowUps(args: CountArgsIn, r: CountIn): FollowUp[] {
  const where = args.neighborhood ? ` in ${args.neighborhood}` : "";
  if (r.of) {
    const out: FollowUp[] = [{ label: "TYPICAL HOME VALUE BY TRACT", question: `Which census tracts have the highest typical home value in the City's Master Property File (${r.code})?` }];
    if (!args.groupBy) out.push({ label: "BY DISTRICT", question: `${countBase(r)}, ${r.period}, by aldermanic district.` });
    return out;
  }
  const out: FollowUp[] = [];
  if (r.dateColumn && !args.groupBy) out.push({ label: "BY MONTH", question: `${countBase(r)}${where}, ${r.period}, by month.` });
  if (args.from && args.to) out.push({ label: "SAME PERIOD A YEAR EARLIER", question: `${countBase(r)}${where}, from ${yearEarlier(args.from)} to ${yearEarlier(args.to)}.` });
  if (r.map && !args.neighborhood) out.push({ label: "IN A NEIGHBORHOOD", question: `${countBase(r)}, ${r.period}, in ` });
  return out.slice(0, MAX);
}

export const numberFollowUps = (r: { topic: string; label: string }): FollowUp[] => [{ label: "ANOTHER NEIGHBORHOOD", question: `${r.topic}: "${r.label}" in ` }];

const caveats = (r: { code: string; name: string }): FollowUp => ({ label: "WHAT ARE THE CAVEATS?", question: `What are the caveats on ${r.code} ${r.name}?` });

export function datasetFollowUps(r: { code: string; name: string; storyAngles?: string[] }): FollowUp[] {
  return [...(r.storyAngles?.length ? [{ label: "STORY ANGLES", question: `Give me story angles using ${r.code} ${r.name}.` }] : []), caveats(r)];
}

export function previewFollowUps(r: { code: string; name: string; fields: string[] }): FollowUp[] {
  const tract = r.fields.some((f) => f.toUpperCase() === "GEOID");
  return [...(tract ? [{ label: "RANK TRACTS ON THIS", question: `Which census tracts rank highest on ${r.code} ${r.name}?` }] : []), caveats(r)];
}

// The card's own filters and period, in the words count buttons use, so a follow-up asks about the same records.
type Scope = { from?: string; to?: string; filters?: { column: string; values?: string[] }[] };
const scope = (a: Scope) =>
  `${a.filters?.length ? ` where ${a.filters.map((f) => `${f.column} is ${(f.values ?? []).join(" or ")}`).join(" and ")}` : ""}${a.from || a.to ? `, ${[a.from && `from ${a.from}`, a.to && `to ${a.to}`].filter(Boolean).join(" ")}` : ""}`;
const filtered = (a: Scope) => new Set((a.filters ?? []).map((f) => f.column));

type SpanArgsIn = Scope & { code: string; groupBy?: string };
const spanBase = (r: SpanOk) => `How long did ${r.pair.things} take ${r.pair.toWhat} in ${r.name} (${r.code})`;
export function spanFollowUps(args: SpanArgsIn, r: SpanOk): FollowUp[] {
  const out: FollowUp[] = [];
  const base = `${spanBase(r)}${scope(args)}`;
  if (r.groupBy !== "year") out.push({ label: "BY YEAR", question: `${base}, by year?` });
  for (const c of r.columns.filter((c) => c !== r.groupBy && !filtered(args).has(c)).slice(0, 2)) out.push({ label: `BY ${c.replace(/_/g, " ").toUpperCase()}`, question: `${base}, by ${c}?` });
  return out.slice(0, MAX);
}

const measureBase = (r: MeasureOk) => `How much ${r.measure.name} in ${r.name} (${r.code})`;
export function measureFollowUps(args: Scope & { code: string; groupBy?: string }, r: MeasureOk): FollowUp[] {
  const where = scope(args);
  const out: FollowUp[] = r.splits.filter((s) => s !== r.groupBy && !filtered(args).has(s)).slice(0, 2).map((s) => ({ label: `BY ${s.replace(/_/g, " ").toUpperCase()}`, question: `${measureBase(r)}${where}, by ${s}?` }));
  if (!r.averageAsked) out.push({ label: "SHOW THE AVERAGE", question: `What is the average ${r.measure.name} in ${r.name} (${r.code})${where}${r.groupBy ? `, by ${r.groupBy}` : ""}?` });
  return out.slice(0, MAX);
}
