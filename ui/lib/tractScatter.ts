type Triple = [number, number | null, number | null];
type Pt = { a: Triple; b: Triple; unreliable?: boolean; mark?: "fits" | "close" | null };

// Linear scales for the relate card's scatter: the x/y extents cover the reliable points' values and the marked
// points' ranges, the only ranges drawn (unreliable points don't stretch the plot; they're clamped into it), and y
// grows upward. `domain` is each axis's low and high end.
// `cuts`: a mismatch's cutoffs, which come from the whole place and can fall outside a neighborhood's points; the axis
// stretches to include them so no tract sits under the wrong label.
export function scales(points: Pt[], width: number, height: number, pad: number, cuts: { a?: number; b?: number } = {}) {
  const reliable = points.filter((p) => !p.unreliable);
  const sized = reliable.length ? reliable : points;
  const ext = (k: "a" | "b"): [number, number] => {
    const all = [...sized.flatMap((p) => (p.mark ? p[k] : [p[k][0]])), cuts[k] ?? null].filter((v): v is number => v !== null);
    if (!all.length) return [0, 1];
    const lo = Math.min(...all);
    const hi = Math.max(...all);
    return hi > lo ? [lo, hi] : [lo - 1, hi + 1];
  };
  const [x0, x1] = ext("a");
  const [y0, y1] = ext("b");
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  return {
    domain: { x: [x0, x1], y: [y0, y1] },
    x: (v: number) => clamp(pad + ((v - x0) / (x1 - x0)) * (width - 2 * pad), pad, width - pad),
    y: (v: number) => clamp(height - pad - ((v - y0) / (y1 - y0)) * (height - 2 * pad), pad, height - pad),
  };
}

// The left margin a y axis needs: at least the room for "100.0%", more for longer labels like "$1,250,000". Width is
// estimated from the type size (a digit is about 0.62em), not measured; the 8 is the tick gap and a little air.
export const axisLabelRoom = (labels: string[], fs: number) => Math.round(Math.max(fs * 3.4, Math.max(0, ...labels.map((l) => l.length)) * fs * 0.62 + 8));
