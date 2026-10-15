import { halfWidth, isUnreliable, quantile, relationship, spearman, type RangeKind, type TractValue } from "./tractStats";

// Neighborhood figures built from census tracts (spec 2026-10-15-neighborhood-answers §4): each tract's piece in a City
// neighborhood counts by its residents (population × share of the tract's area inside). Rates only; the caller checks.
export const MIN_RESIDENTS = 1_000;
export type Piece = { name: string; share: number };
export type NFigure = { name: string; value: number; lo: number | null; hi: number | null; kind: RangeKind | null; residents: number; tracts: number };
export type Built = { figures: NFigure[]; small: { name: string; residents: number }[]; thin: string[]; city: NFigure | null };
export type NVerdict = "higher" | "lower" | "same" | "uncertain" | "no-range";

type Part = { residents: number; v: TractValue };

// One weighted figure from its parts; a part with no range leaves the figure with none.
function combine(name: string, parts: Part[], residents: number): NFigure {
  const covered = parts.reduce((s, p) => s + p.residents, 0);
  const w = (p: Part) => p.residents / covered;
  const value = parts.reduce((s, p) => s + w(p) * p.v.value, 0);
  const halves = parts.map((p) => halfWidth(p.v));
  const ranged = halves.every((h) => h !== null);
  const half = ranged ? Math.sqrt(parts.reduce((s, p, i) => s + (w(p) * (halves[i] as number)) ** 2, 0)) : null;
  return { name, value, lo: half === null ? null : value - half, hi: half === null ? null : value + half, kind: parts[0]?.v.kind ?? null, residents: Math.round(residents), tracts: parts.length };
}

export function buildNeighborhoods(values: TractValue[], pieces: Map<string, Piece[]>, pops: Map<string, number>): Built {
  const byGeoid = new Map(values.map((x) => [x.geoid, x]));
  const total = new Map<string, number>();
  const parts = new Map<string, Part[]>();
  const cityParts: Part[] = [];
  let cityTotal = 0;
  for (const [geoid, ps] of pieces) {
    const pop = pops.get(geoid) ?? 0;
    const value = byGeoid.get(geoid);
    const inCity = (pop * Math.min(100, ps.reduce((s, p) => s + p.share, 0))) / 100;
    cityTotal += inCity;
    if (value && inCity > 0) cityParts.push({ residents: inCity, v: value });
    for (const p of ps) {
      const residents = (pop * p.share) / 100;
      total.set(p.name, (total.get(p.name) ?? 0) + residents);
      if (value && residents > 0) parts.set(p.name, [...(parts.get(p.name) ?? []), { residents, v: value }]);
    }
  }
  const figures: NFigure[] = [];
  const small: { name: string; residents: number }[] = [];
  const thin: string[] = [];
  for (const [name, residents] of [...total].sort((x, y) => x[0].localeCompare(y[0]))) {
    if (residents < MIN_RESIDENTS) { small.push({ name, residents: Math.round(residents) }); continue; }
    const ps = parts.get(name) ?? [];
    if (ps.reduce((s, p) => s + p.residents, 0) < residents / 2) { thin.push(name); continue; }
    figures.push(combine(name, ps, residents));
  }
  const cityCovered = cityParts.reduce((s, p) => s + p.residents, 0);
  const city = cityParts.length && cityCovered >= cityTotal / 2 ? combine("City of Milwaukee", cityParts, cityTotal) : null;
  return { figures, small, thin, city };
}

export const asValue = (f: NFigure): TractValue => ({ geoid: f.name, value: f.value, lo: f.lo, hi: f.hi, kind: f.kind });

export function versusCity(f: NFigure, city: NFigure | null): NVerdict | null {
  if (!city) return null;
  if (f.lo === null || f.hi === null) return "no-range";
  if (isUnreliable(asValue(f))) return "uncertain";
  return f.lo > city.value ? "higher" : f.hi < city.value ? "lower" : "same";
}

const usable = <T extends { a: NFigure; b: NFigure }>(p: T) => !isUnreliable(asValue(p.a)) && !isUnreliable(asValue(p.b));

// "b low (or high) despite a high (or low)": a against the thirds of neighborhoods, b against the city's figure.
export function nMismatch<T extends { name: string; a: NFigure; b: NFigure }>(pairs: T[], aSide: "high" | "low", bSide: "high" | "low", cityB: number) {
  const ok = pairs.filter(usable);
  const cutA = quantile(ok.map((p) => p.a.value).sort((x, y) => x - y), aSide === "high" ? 2 / 3 : 1 / 3);
  const onA = (f: NFigure) => (aSide === "high" ? f.value >= cutA : f.value <= cutA);
  const onB = (f: NFigure) => (bSide === "low" ? f.value < cityB : f.value > cityB);
  const clearA = (f: NFigure) => (aSide === "high" ? f.lo !== null && f.lo >= cutA : f.hi !== null && f.hi <= cutA);
  const clearB = (f: NFigure) => (bSide === "low" ? f.hi !== null && f.hi < cityB : f.lo !== null && f.lo > cityB);
  const margin = (p: T) => Math.min(aSide === "high" ? p.a.value - cutA : cutA - p.a.value, bSide === "low" ? cityB - p.b.value : p.b.value - cityB);
  const order = (xs: T[]) => [...xs].sort((x, y) => margin(y) - margin(x));
  const fits = ok.filter((p) => clearA(p.a) && clearB(p.b));
  const close = ok.filter((p) => !fits.includes(p) && onA(p.a) && onB(p.b));
  return { cutA, n: ok.length, fits: order(fits), close: order(close), uncertain: pairs.filter((p) => !usable(p)).map((p) => p.name) };
}

export function nTogether<T extends { a: NFigure; b: NFigure }>(pairs: T[]) {
  const ok = pairs.filter(usable);
  const rel = relationship(spearman(ok.map((p) => p.a.value), ok.map((p) => p.b.value)), ok.length);
  return { n: ok.length, strength: rel.strength, direction: rel.direction };
}
