type Triple = [number, number | null, number | null];

// Linear scales for the relate card's scatter: the x/y extents include each point's range, y grows upward.
export function scales(points: { a: Triple; b: Triple }[], width: number, height: number, pad: number) {
  const ext = (k: "a" | "b"): [number, number] => {
    const all = points.flatMap((p) => p[k]).filter((v): v is number => v !== null);
    if (!all.length) return [0, 1];
    const lo = Math.min(...all);
    const hi = Math.max(...all);
    return hi > lo ? [lo, hi] : [lo - 1, hi + 1];
  };
  const [x0, x1] = ext("a");
  const [y0, y1] = ext("b");
  return {
    x: (v: number) => pad + ((v - x0) / (x1 - x0)) * (width - 2 * pad),
    y: (v: number) => height - pad - ((v - y0) / (y1 - y0)) * (height - 2 * pad),
  };
}
