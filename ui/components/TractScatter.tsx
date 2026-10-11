"use client";
import { useEffect, useRef, useState } from "react";
import type { Header, Point } from "@/convex/tracts";
import { rangeText, scatterLabel, type Unit, unitOf, valueText } from "@/ui/lib/tractFormat";
import { axisTitle } from "@/ui/lib/tractSummary";
import { scales } from "@/ui/lib/tractScatter";
import styles from "./ask.module.css";

// The relate card's scatter (DESIGN.md "Analysis cards"). It is drawn at the pixel width it is given, so its words are
// the card's own small type at every screen size, never a picture shrunk to fit. Only the highlighted tracts carry
// error bars; the rest are plain dots, so three hundred ranges don't knot into a hairball.

type Col = Pick<Header, "code" | "name" | "column" | "meaning">;
type Props = {
  points: Point[]; a: Col; b: Col; cutA?: number; cutB?: number; aSide?: "high" | "low"; bSide?: "high" | "low";
  counts?: { fits: number; close: number }; big?: boolean;
};

// The figure's width and type size, read from the page; a first guess until it is measured.
function useBox() {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 360, fs: 14 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => setBox({ w: Math.round(el.clientWidth) || 360, fs: parseFloat(getComputedStyle(el).fontSize) || 14 });
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, ...box };
}

export function TractScatter({ points, a, b, cutA, cutB, aSide, bSide, counts, big }: Props) {
  const { ref, w: W, fs } = useBox();
  const [picked, setPicked] = useState<Point | null>(null);
  const H = Math.round(big ? Math.min(560, Math.max(320, W * 0.62)) : Math.max(220, W * 0.66));
  const L = Math.round(fs * 3.4), B = Math.round(fs * 1.8), T = Math.round(fs * 0.5), R = Math.round(fs * 0.8);
  const PW = Math.max(40, W - L - R), PH = Math.max(40, H - T - B);
  const s = scales(points, PW, PH, 8);
  const pa = unitOf(a.meaning), pb = unitOf(b.meaning);
  const mismatch = cutA !== undefined && cutB !== undefined;
  const r = big ? 1.25 : 1;
  const bar = (p: Point) => [
    p.a[1] !== null && p.a[2] !== null && <line key="x" x1={s.x(p.a[1])} x2={s.x(p.a[2])} y1={s.y(p.b[0])} y2={s.y(p.b[0])} />,
    p.b[1] !== null && p.b[2] !== null && <line key="y" x1={s.x(p.a[0])} x2={s.x(p.a[0])} y1={s.y(p.b[1])} y2={s.y(p.b[2])} />,
  ];
  const describe = (p: Point) =>
    `Tract ${p.tract}${p.neighborhood ? ` (${p.neighborhood})` : ""}: ${a.column} ${spell(p.a, pa)}, ${b.column} ${spell(p.b, pb)}`;
  // A tap on a dot names it under the plot in the big view; a hover names it everywhere. The marked dots (a handful)
  // also take keyboard focus there, Enter or Space naming them; the hundreds of grey ones don't, or Tab would never
  // leave the plot (every marked tract is in the table too).
  const dot = (p: Point, el: React.ReactElement) => (
    <g
      key={p.geoid}
      onClick={big ? () => setPicked(p) : undefined}
      className={big ? styles.tractHit : undefined}
      {...(big && p.mark ? {
        tabIndex: 0, role: "button", "aria-label": describe(p),
        onKeyDown: (e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setPicked(p); } },
      } : {})}
    >
      <title>{describe(p)}</title>
      {big && <circle cx={s.x(p.a[0])} cy={s.y(p.b[0])} r={9} fill="transparent" />}
      {el}
    </g>
  );
  // Axis numbers: the low and high ends, and the cutoff when there is one; an end too close to the cutoff gives way.
  const ticks = (lo: number, hi: number, cut: number | undefined, at: (v: number) => number, room: number) =>
    // A cutoff can equal an end (a third of tracts at zero): one label, one key.
    cut === undefined ? [lo, hi] : [...new Set([lo, cut, hi])].filter((v) => v === cut || Math.abs(at(v) - at(cut)) > room);
  const xt = ticks(s.domain.x[0], s.domain.x[1], mismatch ? cutA : undefined, s.x, fs * 3);
  const yt = ticks(s.domain.y[0], s.domain.y[1], mismatch ? cutB : undefined, s.y, fs * 1.4);
  // No counts means a column has no margin of error: no tract can be a clear match, so no corner claims one.
  const corner = mismatch && counts ? matchCorner(s, cutA, cutB, aSide, bSide, PW, PH) : null;
  return (
    <figure className={styles.tractPlot} data-scatter={big ? "big" : "card"}>
      <p className={styles.tractAxis}>{"↑ "}{axisTitle(b)}</p>
      <div ref={ref} className={styles.tractPlotBox}>
        <svg className={styles.tractScatter} width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={scatterLabel(points.length, a, b, mismatch ? counts : undefined)}>
          <g transform={`translate(${L} ${T})`}>
            {corner && <rect className={styles.tractCorner} {...corner.rect} />}
            {corner && corner.rect.width > fs * 11 && corner.rect.height > fs * 1.6 && <text className={styles.tractSvgText} {...corner.text}>Clear matches land here</text>}
            <rect className={styles.tractFrame} x={0} y={0} width={PW} height={PH} />
            {mismatch && <line className={styles.tractCut} x1={s.x(cutA)} x2={s.x(cutA)} y1={0} y2={PH} />}
            {mismatch && <line className={styles.tractCut} x1={0} x2={PW} y1={s.y(cutB)} y2={s.y(cutB)} />}
            {xt.map((v) => <text key={`x${v}`} className={styles.tractSvgText} x={s.x(v)} y={PH + fs * 1.2} textAnchor={v === xt[0] ? "start" : v === xt[xt.length - 1] ? "end" : "middle"}>{valueText(v, pa)}</text>)}
            {yt.map((v) => <text key={`y${v}`} className={styles.tractSvgText} x={-6} y={s.y(v)} textAnchor="end" dominantBaseline="middle">{valueText(v, pb)}</text>)}
            {points.filter((p) => !p.mark).map((p) =>
              dot(p, <circle className={p.unreliable ? styles.tractFaint : styles.tractDot} cx={s.x(p.a[0])} cy={s.y(p.b[0])} r={(p.unreliable ? 2 : 2.5) * r} />))}
            {points.filter((p) => p.mark).map((p) =>
              dot(p, <><g className={styles.tractBarsInk}>{bar(p)}</g><circle className={p.mark === "fits" ? styles.tractFit : styles.tractClose} cx={s.x(p.a[0])} cy={s.y(p.b[0])} r={4.5 * r} /></>))}
            {picked && <circle className={styles.tractPicked} cx={s.x(picked.a[0])} cy={s.y(picked.b[0])} r={8} />}
          </g>
        </svg>
      </div>
      <p className={`${styles.tractAxis} ${styles.tractAxisX}`}>{axisTitle(a)}{" →"}</p>
      {big && <p className={styles.tractCounts} aria-live="polite" data-picked>{picked ? describe(picked) : "Tap or click a dot to see which tract it is."}</p>}
    </figure>
  );
}

const spell = (t: [number, number | null, number | null], pct: Unit) => {
  const r = rangeText({ value: t[0], lo: t[1], hi: t[2] }, pct);
  return r.span ? `${r.value} ${r.span}` : r.value;
};

// The quarter the question asked about, shaded with the edition's band, and where its label sits (its far corner).
function matchCorner(s: ReturnType<typeof scales>, cutA: number, cutB: number, aSide: Props["aSide"], bSide: Props["bSide"], PW: number, PH: number) {
  const cx = s.x(cutA), cy = s.y(cutB);
  const right = aSide !== "low", bottom = bSide === "low";
  const rect = { x: right ? cx : 0, y: bottom ? cy : 0, width: right ? PW - cx : cx, height: bottom ? PH - cy : cy };
  const text = { x: right ? PW - 6 : 6, y: bottom ? PH - 6 : 6, dominantBaseline: bottom ? ("auto" as const) : ("hanging" as const), textAnchor: right ? ("end" as const) : ("start" as const) };
  return { rect, text };
}

export const TractLegend = () => (
  <ul className={styles.tractLegend}>
    <li><span className={`${styles.tractSw} ${styles.tractSwFit}`} />clear match (even at the edges of its margin of error)</li>
    <li><span className={`${styles.tractSw} ${styles.tractSwClose}`} />possible match</li>
    <li><span className={`${styles.tractSw} ${styles.tractSwDot}`} />other tracts</li>
  </ul>
);
