import type { CountResult } from "@/lib/ask/tools";

// The measure card's words (spec 2026-10-12-city-measures-design.md §7), written by code from the server's numbers.
export type MeasureOk = Extract<CountResult, { status: "measured" }>;
type Unit = MeasureOk["measure"]["unit"];
export const MEASURE_HIDDEN = "fewer than 5 records";
const NAME_MIN = 10; // the sentence names a group only with this many records, like spans' "too few to say"

export function money(v: number | null, unit: Unit, style: "table" | "sentence"): string {
  if (v === null || !Number.isFinite(v)) return "—";
  const sign = v < 0 ? "-" : "";
  const a = Math.abs(v);
  if (unit === "dollars per hour") return `${sign}$${a.toFixed(2)}${style === "sentence" ? " an hour" : ""}`;
  // Round first, then pick the unit, so $999.96 million reads "$1.0 billion", never "$1000.0 million".
  const millions = Number((a / 1e6).toFixed(1));
  if (style === "sentence" && millions >= 1000) return `${sign}$${(a / 1e9).toFixed(1)} billion`;
  if (style === "sentence" && millions >= 1) return `${sign}$${millions.toFixed(1)} million`;
  return Number(a.toFixed(2)) >= 1000 ? `${sign}$${Math.round(a).toLocaleString("en-US")}` : `${sign}$${a.toFixed(2)}`;
}

export const measureTitle = (r: MeasureOk) => [r.name, r.measure.name, ...(r.groupBy ? [`by ${r.groupBy}`] : [])].join(" · ");

export function measureSummary(r: MeasureOk): string {
  const m = r.measure;
  const s = (v: number | null) => money(v, m.unit, "sentence");
  const n = r.all.n.toLocaleString("en-US");
  if (r.all.n === 0) return `No ${m.things} match.`;
  if (r.all.median === null && r.all.n < 5) return `Fewer than 5 ${m.things} match, so their figures are hidden to protect individuals.`;
  const head = m.summable ? `${n} ${m.things} total ${s(r.all.total)}; the median is ${s(r.all.median)}.` : `Across ${n} ${m.things}, the median is ${s(r.all.median)}.`;
  const shown = r.groups.filter((g) => !g.hidden && g.n >= NAME_MIN && g.label !== "(blank)");
  if (!r.groupBy || shown.length < 2) return head;
  const top = (k: "total" | "median") => [...shown].sort((a, b) => (b[k] ?? -Infinity) - (a[k] ?? -Infinity))[0];
  const med = top("median");
  const parts = [...(m.summable ? [`The largest total is ${top("total").label} (${s(top("total").total)})`] : []), `the highest median is ${med.label} (${s(med.median)})`];
  const sentence = parts.join("; ");
  return `${head} ${sentence[0].toUpperCase()}${sentence.slice(1)}.`;
}

export function measureNotes(r: MeasureOk): string[] {
  const a = r.all;
  const n = (x: number) => x.toLocaleString("en-US");
  const far = r.averageAsked && a.average !== null && a.median !== null && a.median !== 0 && Math.abs(a.average - a.median) > 0.25 * Math.abs(a.median);
  return [
    r.measure.caveat,
    ...(a.unreadable > 0 ? [`${n(a.unreadable)} records had no readable amount and were left out.`] : []),
    ...(r.measure.skipZero && a.zeros > 0 ? [`${n(a.zeros)} records with $0 were left out.`] : []),
    ...(r.groups.some((g) => g.hidden) || r.other?.hidden ? ["Some groups have fewer than 5 records, so their figures are hidden to protect individuals."] : []),
    ...(far ? ["A few large values pull the average away from the typical one; the median is the better guide."] : []),
    `Period: ${r.period}.`,
    ...(r.filters.length ? [`Only: ${r.filters.join(", ")}.`] : []),
  ];
}
