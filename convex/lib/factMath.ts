// The Census Bureau's approximations for derived ACS estimates (Understanding and Using ACS Data, appendix). Pure.
// Margins are at 90% confidence; a null margin means the source gave none, and nothing derived from it gets one.
export type Est = { estimate: number; moe: number | null };

export function sumOf(xs: Est[]): Est {
  const estimate = xs.reduce((t, x) => t + x.estimate, 0);
  const moe = xs.some((x) => x.moe === null) ? null : Math.sqrt(xs.reduce((t, x) => t + (x.moe as number) ** 2, 0));
  return { estimate, moe };
}

// p = X / Y. When the part under the square root goes negative, the Census guide says to use the ratio form.
export function shareOf(part: Est, of: Est): Est | null {
  if (!(of.estimate > 0)) return null;
  const p = part.estimate / of.estimate;
  if (part.moe === null || of.moe === null) return { estimate: p, moe: null };
  const inner = part.moe ** 2 - p ** 2 * of.moe ** 2;
  return { estimate: p, moe: Math.sqrt(inner >= 0 ? inner : part.moe ** 2 + p ** 2 * of.moe ** 2) / of.estimate };
}

export type Verdict = "higher" | "lower" | "same" | "unknown";
// A neighborhood against the city: different only when the gap is larger than both margins combined.
export function versus(n: Est, c: Est): Verdict {
  if (n.moe === null || c.moe === null) return "unknown";
  const gap = n.estimate - c.estimate;
  if (!(Math.abs(gap) > Math.sqrt(n.moe ** 2 + c.moe ** 2))) return "same";
  return gap > 0 ? "higher" : "lower";
}
