type Triple = [number, number | null, number | null];
type Pt = { a: Triple; b: Triple; unreliable?: boolean };

// Linear scales for the relate card's scatter: the x/y extents include each reliable point's range (unreliable points
// don't stretch the plot; they're clamped into it), and y grows upward.
export function scales(points: Pt[], width: number, height: number, pad: number) {
  const reliable = points.filter((p) => !p.unreliable);
  const sized = reliable.length ? reliable : points;
  const ext = (k: "a" | "b"): [number, number] => {
    const all = sized.flatMap((p) => p[k]).filter((v): v is number => v !== null);
    if (!all.length) return [0, 1];
    const lo = Math.min(...all);
    const hi = Math.max(...all);
    return hi > lo ? [lo, hi] : [lo - 1, hi + 1];
  };
  const [x0, x1] = ext("a");
  const [y0, y1] = ext("b");
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  return {
    x: (v: number) => clamp(pad + ((v - x0) / (x1 - x0)) * (width - 2 * pad), pad, width - pad),
    y: (v: number) => clamp(height - pad - ((v - y0) / (y1 - y0)) * (height - 2 * pad), pad, height - pad),
  };
}
