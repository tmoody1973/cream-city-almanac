// The honesty rules for tract comparisons (docs/superpowers/specs/2026-10-10-ask-analyzes-design.md §5). Pure: no I/O.
export type RangeKind = "moe90" | "ci95";
export type TractValue = { geoid: string; value: number; lo: number | null; hi: number | null; kind: RangeKind | null };
export type Pair = { geoid: string; a: TractValue; b: TractValue };

export const halfWidth = (v: TractValue) => (v.lo === null || v.hi === null ? null : (v.hi - v.lo) / 2);

// Census guidance: an estimate whose coefficient of variation passes 40% is unreliable. A CDC interval uses its half-width.
export function isUnreliable(v: TractValue): boolean {
  const h = halfWidth(v);
  if (h === null) return false;
  if (v.value === 0) return h > 0;
  const spread = v.kind === "moe90" ? h / 1.645 : h;
  return spread / Math.abs(v.value) > 0.4;
}

export const overlaps = (a: TractValue, b: TractValue) =>
  a.lo !== null && a.hi !== null && b.lo !== null && b.hi !== null && a.lo <= b.hi && b.lo <= a.hi;

export function rankValues(values: TractValue[], direction: "high" | "low", top = 10) {
  const unreliable = values.filter(isUnreliable);
  const sorted = values.filter((v) => !isUnreliable(v)).sort((x, y) => (direction === "high" ? y.value - x.value : x.value - y.value));
  const head = sorted.slice(0, top);
  const last = head.at(-1);
  const ties = last ? sorted.slice(top).filter((v) => overlaps(v, last)) : [];
  return { top: head, ties, unreliable };
}

// The Census Bureau's test for comparing two estimates (90% margins); CDC intervals use their half-widths.
export function changeOf(a: TractValue, b: TractValue): "increase" | "decrease" | "none" {
  const ha = halfWidth(a);
  const hb = halfWidth(b);
  if (ha === null || hb === null) return "none";
  const diff = b.value - a.value;
  if (Math.abs(diff) <= Math.sqrt(ha * ha + hb * hb)) return "none";
  return diff > 0 ? "increase" : "decrease";
}

function ranks(xs: number[]): number[] {
  const order = xs.map((x, i) => [x, i] as const).sort((p, q) => p[0] - q[0]);
  const out = new Array<number>(xs.length);
  for (let i = 0; i < order.length; ) {
    let j = i;
    while (j + 1 < order.length && order[j + 1][0] === order[i][0]) j++;
    for (let k = i; k <= j; k++) out[order[k][1]] = (i + j) / 2 + 1;
    i = j + 1;
  }
  return out;
}

// Spearman's rank correlation: Pearson on average ranks, so ties are handled and a few extreme tracts don't dominate.
export function spearman(xs: number[], ys: number[]): number {
  const rx = ranks(xs);
  const ry = ranks(ys);
  const n = rx.length;
  const mx = rx.reduce((s, x) => s + x, 0) / n;
  const my = ry.reduce((s, y) => s + y, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    num += (rx[i] - mx) * (ry[i] - my);
    dx += (rx[i] - mx) ** 2;
    dy += (ry[i] - my) ** 2;
  }
  return dx === 0 || dy === 0 ? 0 : num / Math.sqrt(dx * dy);
}

export function relationship(rho: number, n: number) {
  const a = Math.abs(rho);
  const strength = n < 20 ? "too-few" : a < 0.2 ? "little" : a < 0.4 ? "weak" : a < 0.6 ? "moderate" : "strong";
  return { strength, direction: rho >= 0 ? "higher" : "lower" } as { strength: "too-few" | "little" | "weak" | "moderate" | "strong"; direction: "higher" | "lower" };
}

export function quantile(sorted: number[], p: number): number {
  const pos = (sorted.length - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

const onSide = (x: number, side: "high" | "low", cut: number) => (side === "high" ? x >= cut : x <= cut);
const clears = (v: TractValue, side: "high" | "low", cut: number) =>
  v.lo !== null && v.hi !== null && (side === "high" ? v.lo >= cut : v.hi <= cut);

export function mismatch(pairs: Pair[], aSide: "high" | "low", bSide: "high" | "low") {
  const ok = pairs.filter((p) => !isUnreliable(p.a) && !isUnreliable(p.b));
  const sa = ok.map((p) => p.a.value).sort((x, y) => x - y);
  const sb = ok.map((p) => p.b.value).sort((x, y) => x - y);
  const cutA = quantile(sa, aSide === "high" ? 2 / 3 : 1 / 3);
  const cutB = quantile(sb, bSide === "high" ? 2 / 3 : 1 / 3);
  const fits = ok.filter((p) => clears(p.a, aSide, cutA) && clears(p.b, bSide, cutB));
  const close = ok.filter((p) => onSide(p.a.value, aSide, cutA) && onSide(p.b.value, bSide, cutB) && !fits.includes(p));
  return { cutA, cutB, fits, close };
}
