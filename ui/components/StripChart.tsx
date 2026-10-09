import { useEffect, useRef, useState } from "react";
import { dayShade, formatScale } from "@/ui/lib/preview";
import styles from "./sheet.module.css";

const ROW = 30;
const WIDTH = 600; // until the figure is measured
const MIN_WIDTH = 240;
const DAYS = 366;

type Series = { label: string; values: number[]; days?: number[] };

// `unit` names what one dot is: one area for tract and neighborhood data.
// Daily readings (series with days) run January to December, one mark per day, stronger ink for a higher reading
// ("stronger", not "darker": in dark mode the ink is light):
// a year of days can't be told apart as dots placed by value, and 366 dots overlap at any screen width.
// The drawing is as wide as its box (one unit = one pixel), so labels keep their size on every screen.
export function StripChart({ field, series, scale, unit = "area" }: { field: string; series: Series[]; scale: { min: number; max: number }; unit?: string }) {
  const box = useRef<HTMLElement>(null);
  const [width, setWidth] = useState(WIDTH);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(MIN_WIDTH, Math.round(entry.contentRect.width))));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const daily = series.some((s) => s.days);
  const labelW = Math.min(120, Math.round(width * 0.25));
  const span = width - labelW - 10;
  const x = (v: number) => labelW + ((v - scale.min) / (scale.max - scale.min)) * span;
  const step = span / DAYS;
  const xDay = (d: number) => labelW + (d - 1) * step;
  const range = `${formatScale(scale.min)} to ${formatScale(scale.max)}`;
  const description = daily
    ? `Each mark is one day, January to December. A stronger mark means a higher reading, on one shared scale from ${range}`
    : `Each dot is one ${unit}'s ${field}, by year, on one shared scale from ${range}`;
  return (
    <figure className={styles.chart} ref={box}>
      <svg viewBox={`0 0 ${width} ${series.length * ROW + 24}`} role="img" aria-label={description}>
        {series.map((s, i) => (
          <g key={s.label} transform={`translate(0 ${i * ROW + 16})`}>
            <text x="0" y="5" className={styles.chartLabel}>{s.label}</text>
            <line x1={labelW} x2={width - 10} y1="0" y2="0" stroke="var(--band)" />
            {s.days
              ? s.values.map((v, j) => (
                  <rect key={j} x={xDay(s.days![j])} y="-7" width={Math.max(1, step)} height="14" fill="var(--ink)" fillOpacity={dayShade(v, scale)} />
                ))
              : s.values.map((v, j) => <circle key={j} cx={x(v)} cy="0" r="3" fill="var(--ink)" fillOpacity="0.35" />)}
          </g>
        ))}
        <text x={labelW} y={series.length * ROW + 20} className={styles.chartLabel}>{daily ? "Jan 1" : formatScale(scale.min)}</text>
        <text x={width - 10} y={series.length * ROW + 20} textAnchor="end" className={styles.chartLabel}>{daily ? "Dec 31" : formatScale(scale.max)}</text>
      </svg>
      <figcaption>
        {daily
          ? `Each mark is one day, January to December. A stronger mark means a higher reading (${range}); every row shares one scale.`
          : `Each dot is one ${unit}. Every row shares one scale.`}
      </figcaption>
    </figure>
  );
}
