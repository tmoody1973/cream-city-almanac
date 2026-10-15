import type { HealthTopic } from "./healthCompass";
import { quantile, relationship, spearman } from "./tractStats";

// ZIP health's numbers (spec 2026-10-15-zip-health §4): 95% ranges from Health Compass's standard errors, verdicts against
// Milwaukee County, ranking, "go together", "low despite high", and matching a measure's plain words to a topic.
export const Z95 = 1.96;
export type Fig = { value: number; se: number | null };
export type Verdict = "higher" | "lower" | "same" | "uncertain" | "no-range";
export type Strength = "too-few" | "little" | "weak" | "moderate" | "strong";

export const rangeOf = (f: Fig) => (f.se === null ? null : { lo: f.value - Z95 * f.se, hi: f.value + Z95 * f.se });
export const tooUncertain = (f: Fig) => f.se !== null && (f.value === 0 ? f.se > 0 : f.se / Math.abs(f.value) > 0.4);

export function versus(zip: Fig, bench: Fig): Verdict {
  const r = rangeOf(zip);
  if (!r) return "no-range";
  if (tooUncertain(zip)) return "uncertain";
  return r.lo > bench.value ? "higher" : r.hi < bench.value ? "lower" : "same";
}

export function rankZips<T extends { a: Fig }>(lines: T[], direction: "high" | "low") {
  const uncertain = lines.filter((l) => tooUncertain(l.a));
  const rows = lines.filter((l) => !tooUncertain(l.a)).sort((x, y) => (direction === "high" ? y.a.value - x.a.value : x.a.value - y.a.value));
  return { rows, uncertain };
}

const usable = <T extends { a: Fig; b?: Fig }>(p: T): p is T & { b: Fig } => !!p.b && !tooUncertain(p.a) && !tooUncertain(p.b);

export function togetherZips<T extends { a: Fig; b?: Fig }>(pairs: T[]): { n: number; strength: Strength; direction: "higher" | "lower" } {
  const ok = pairs.filter(usable);
  const rel = relationship(spearman(ok.map((p) => p.a.value), ok.map((p) => p.b.value)), ok.length);
  return { n: ok.length, strength: rel.strength, direction: rel.direction };
}

// "measure low (or high) despite other high (or low)": measure against the county's figure, other against its thirds.
// Clear means the whole range is past its line; close means only the figure is.
export function mismatchZips<T extends { zip: string; a: Fig; b?: Fig }>(pairs: T[], side: "high" | "low", otherSide: "high" | "low", bench: number) {
  const ok = pairs.filter(usable);
  const cut = quantile(ok.map((p) => p.b.value).sort((x, y) => x - y), otherSide === "high" ? 2 / 3 : 1 / 3);
  const onA = (f: Fig) => (side === "low" ? f.value < bench : f.value > bench);
  const onB = (f: Fig) => (otherSide === "high" ? f.value >= cut : f.value <= cut);
  const clearA = (f: Fig) => { const r = rangeOf(f); return !!r && (side === "low" ? r.hi < bench : r.lo > bench); };
  const clearB = (f: Fig) => { const r = rangeOf(f); return !!r && (otherSide === "high" ? r.lo >= cut : r.hi <= cut); };
  const margin = (p: T & { b: Fig }) => Math.min(side === "low" ? bench - p.a.value : p.a.value - bench, otherSide === "high" ? p.b.value - cut : cut - p.b.value);
  const order = (xs: (T & { b: Fig })[]) => [...xs].sort((x, y) => margin(y) - margin(x));
  const fits = ok.filter((p) => clearA(p.a) && clearB(p.b));
  const close = ok.filter((p) => !fits.includes(p) && onA(p.a) && onB(p.b));
  return { cut, n: ok.length, fits: order(fits) as T[], close: order(close) as T[], uncertain: pairs.filter((p) => p.b && !usable(p)).map((p) => p.zip) };
}

// Words that say what kind of figure, not which one; "visits" and "visit" count as the same word.
const STOP = new Set(["the", "a", "an", "of", "in", "and", "or", "for", "to", "with", "by", "on", "rate", "rates", "percent", "share", "number", "how", "many", "much", "zip", "zips", "code", "codes", "where", "which", "is", "are", "low", "high", "most", "least"]);
const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean).map((w) => (w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w));
const core = (name: string) => new Set(words(name.replace(/\([^)]*\)/g, " ")).filter((w) => !STOP.has(w)));

export type TopicMatch = { status: "ok"; topic: HealthTopic } | { status: "choose"; choices: { key: string; name: string }[] } | { status: "not-found" };

// Code picks the topic, never the AI (spec §4): a name counts three, keywords and the description one; fewer extra name
// words wins a tie. One clear winner that covers every word answers; otherwise up to eight choices.
export function matchTopic(asked: string, topics: HealthTopic[]): TopicMatch {
  const exact = topics.find((t) => t.key.toLowerCase() === asked.trim().toLowerCase() || words(t.name).join(" ") === words(asked).join(" "));
  if (exact) return { status: "ok", topic: exact };
  const q = [...new Set(words(asked).filter((w) => !STOP.has(w)))];
  if (!q.length) return { status: "not-found" };
  const scored = topics.map((t) => {
    const name = core(t.name);
    const loose = new Set(words(`${t.name} ${t.keywords} ${t.description}`));
    const score = q.reduce((s, w) => s + (name.has(w) ? 3 : loose.has(w) ? 1 : 0), 0);
    const extra = [...name].filter((w) => !q.includes(w)).length;
    return { t, score, extra };
  }).filter((x) => x.score > 0).sort((x, y) => y.score - x.score || x.extra - y.extra || x.t.name.localeCompare(y.t.name));
  if (!scored.length) return { status: "not-found" };
  const [best, next] = scored;
  if (best.score === 3 * q.length && (!next || next.score < best.score || next.extra > best.extra)) return { status: "ok", topic: best.t };
  return { status: "choose", choices: scored.slice(0, 8).map(({ t }) => ({ key: t.key, name: t.name })) };
}
