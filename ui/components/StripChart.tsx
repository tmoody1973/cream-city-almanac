import { useEffect, useRef, useState } from "react";
import { formatScale } from "@/ui/lib/preview";
import styles from "./sheet.module.css";

const ROW = 30;
const WIDTH = 600; // until the figure is measured
const MIN_WIDTH = 240;

// `unit` names what one dot is: one area for tract and neighborhood data, one day for daily readings.
// The drawing is as wide as its box (one unit = one pixel), so labels keep their size on every screen.
export function StripChart({ field, series, scale, unit = "area" }: { field: string; series: { label: string; values: number[] }[]; scale: { min: number; max: number }; unit?: string }) {
  const box = useRef<HTMLElement>(null);
  const [width, setWidth] = useState(WIDTH);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(MIN_WIDTH, Math.round(entry.contentRect.width))));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const labelW = Math.min(120, Math.round(width * 0.25));
  const x = (v: number) => labelW + ((v - scale.min) / (scale.max - scale.min)) * (width - labelW - 10);
  return (
    <figure className={styles.chart} ref={box}>
      <svg viewBox={`0 0 ${width} ${series.length * ROW + 24}`} role="img" aria-label={`Each dot is one ${unit}'s ${field}, by year, on one shared scale from ${formatScale(scale.min)} to ${formatScale(scale.max)}`}>
        {series.map((s, i) => (
          <g key={s.label} transform={`translate(0 ${i * ROW + 16})`}>
            <text x="0" y="5" className={styles.chartLabel}>{s.label}</text>
            <line x1={labelW} x2={width - 10} y1="0" y2="0" stroke="var(--band)" />
            {s.values.map((v, j) => (
              <circle key={j} cx={x(v)} cy="0" r="3" fill="var(--ink)" fillOpacity="0.35" />
            ))}
          </g>
        ))}
        <text x={labelW} y={series.length * ROW + 20} className={styles.chartLabel}>{formatScale(scale.min)}</text>
        <text x={width - 10} y={series.length * ROW + 20} textAnchor="end" className={styles.chartLabel}>{formatScale(scale.max)}</text>
      </svg>
      <figcaption>Each dot is one {unit}. Every row shares one scale.</figcaption>
    </figure>
  );
}
