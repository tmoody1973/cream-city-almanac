import { CITY_GEO, COUNTY_GEO, modalPeriods, type HealthFigure, type HealthLayer, type HealthTopic } from "./healthCompass";
import { matchTopic, mismatchZips, rangeOf, rankZips, togetherZips, versus, type Strength, type Verdict } from "./healthMath";
import { checkZip, COUNTY_ZIPS } from "./zips";

export const MIN_RESIDENTS = 1_000;

// One ZIP-health answer from the stored copy (spec 2026-10-15-zip-health §4). Pure, so it tests without a database.
export type HealthPlace = { layer: HealthLayer; geo: string; population?: number | null; figures: HealthFigure[] };
export type HealthData = { topics: HealthTopic[]; places: HealthPlace[]; hoods: Record<string, string[]>; asOf: number | null };
export type HealthArgs = { mode: "one" | "rank" | "together" | "mismatch"; measure: string; zip?: string; direction?: "high" | "low"; side?: "high" | "low"; other?: string; otherSide?: "high" | "low" };
export type FigOut = { value: number; se: number | null; lo: number | null; hi: number | null; period: string };
export type ZipLine = { zip: string; places: string[]; town: string; a: FigOut; b?: FigOut; verdict?: Verdict };
type Base = { status: "ok"; measure: HealthTopic; county: FigOut | null; asOf: number | null; periods: Record<string, string>; small: { zip: string; population: number }[] };
export type HealthOk =
  | (Base & { mode: "one"; zip: ZipLine; city: FigOut | null })
  | (Base & { mode: "rank"; direction: "high" | "low"; rows: ZipLine[]; uncertain: ZipLine[] })
  | (Base & { mode: "together"; other: HealthTopic; n: number; strength: Strength; direction: "higher" | "lower"; rows: ZipLine[] })
  | (Base & { mode: "mismatch"; other: HealthTopic; side: "high" | "low"; otherSide: "high" | "low"; cut: number; n: number; fits: ZipLine[]; close: ZipLine[]; uncertain: string[] });
export type HealthResult =
  | HealthOk
  | { status: "choose"; which: "measure" | "other"; words: string; choices: { key: string; name: string }[] }
  | { status: "not-found"; which: "measure" | "other"; words: string }
  | { status: "bad-zip" | "outside"; zip: string }
  | { status: "no-data"; zip: string; measure: string }
  | { status: "refused"; reason: string }
  | { status: "unavailable" };

export function answer(a: HealthArgs, d: HealthData): HealthResult {
  if (!d.topics.length || !d.places.length) return { status: "unavailable" };
  const m = matchTopic(a.measure, d.topics);
  if (m.status === "choose") return { status: "choose", which: "measure", words: a.measure, choices: m.choices };
  if (m.status === "not-found") return { status: "not-found", which: "measure", words: a.measure };
  const measure = m.topic;
  const fig = (geo: string, key: string): FigOut | null => {
    const f = d.places.find((p) => p.geo === geo)?.figures.find((x) => x.topic === key);
    if (!f) return null;
    const r = rangeOf(f);
    return { value: f.value, se: f.se, lo: r?.lo ?? null, hi: r?.hi ?? null, period: f.period };
  };
  const line = (zip: string, fa: FigOut, fb?: FigOut): ZipLine => ({ zip, places: d.hoods[zip] ?? [], town: COUNTY_ZIPS[zip]?.mainPlace ?? "", a: fa, ...(fb ? { b: fb } : {}) });
  // ZIPs with almost no residents (53295, the VA Medical Center: 114) stay out of rankings and comparisons, named on the card.
  const tiny = d.places.filter((p) => p.layer === "zip" && typeof p.population === "number" && p.population < MIN_RESIDENTS).map((p) => ({ zip: p.geo, population: p.population as number })).sort((x, y) => x.zip.localeCompare(y.zip));
  const zips = d.places.filter((p) => p.layer === "zip" && !tiny.some((s) => s.zip === p.geo)).map((p) => p.geo).sort();
  const county = fig(COUNTY_GEO, measure.key);
  // Each measure's most common ZIP period: the period its credit and notes name, whatever the rows shown.
  const zipPlaces = d.places.filter((p) => p.layer === "zip");
  const periodsOf = (...keys: string[]) => { const all = modalPeriods(zipPlaces.flatMap((p) => p.figures)); return Object.fromEntries(keys.filter((k) => all[k]).map((k) => [k, all[k]])); };
  const base = { status: "ok" as const, measure, county, asOf: d.asOf, periods: periodsOf(measure.key), small: tiny };
  const judged = (l: ZipLine): ZipLine => (county ? { ...l, verdict: versus(l.a, county) } : l);

  if (a.mode === "one") {
    const z = checkZip(a.zip ?? "");
    if (!z) return { status: "bad-zip", zip: (a.zip ?? "").trim() };
    if (!COUNTY_ZIPS[z]) return { status: "outside", zip: z };
    const f = fig(z, measure.key);
    if (!f) return { status: "no-data", zip: z, measure: measure.name };
    return { ...base, small: tiny.filter((s) => s.zip === z), mode: "one", zip: judged(line(z, f)), city: fig(CITY_GEO, measure.key) };
  }
  if (a.mode === "rank") {
    const all = zips.flatMap((z) => { const f = fig(z, measure.key); return f ? [line(z, f)] : []; });
    if (!all.length) return { status: "refused", reason: `Health Compass has no ZIP figures for ${measure.name}.` };
    const direction = a.direction ?? "high";
    const { rows, uncertain } = rankZips(all, direction);
    return { ...base, mode: "rank", direction, rows: rows.map(judged), uncertain };
  }
  if (!a.other) return { status: "refused", reason: "Name the second measure to compare it with." };
  const o = matchTopic(a.other, d.topics);
  if (o.status === "choose") return { status: "choose", which: "other", words: a.other, choices: o.choices };
  if (o.status === "not-found") return { status: "not-found", which: "other", words: a.other };
  const other = o.topic;
  if (other.key === measure.key) return { status: "refused", reason: "Pick two different measures." };
  const pairs = zips.flatMap((z) => { const fa = fig(z, measure.key); const fb = fig(z, other.key); return fa && fb ? [line(z, fa, fb)] : []; });
  if (a.mode === "together") {
    return { ...base, periods: periodsOf(measure.key, other.key), mode: "together", other, ...togetherZips(pairs), rows: [...pairs].sort((x, y) => y.a.value - x.a.value) };
  }
  if (!county) return { status: "refused", reason: `Health Compass has no Milwaukee County figure for ${measure.name}, so ZIPs can't be compared with it.` };
  const side = a.side ?? "low";
  const otherSide = a.otherSide ?? "high";
  return { ...base, periods: periodsOf(measure.key, other.key), mode: "mismatch", other, side, otherSide, ...mismatchZips(pairs, side, otherSide, county.value) };
}
