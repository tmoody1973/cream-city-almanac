import styles from "./sheet.module.css";

const ROW = 30;
const LABEL_W = 120;
const WIDTH = 600;

export function StripChart({ field, series, scale }: { field: string; series: { label: string; values: number[] }[]; scale: { min: number; max: number } }) {
  const x = (v: number) => LABEL_W + ((v - scale.min) / (scale.max - scale.min)) * (WIDTH - LABEL_W - 10);
  return (
    <figure className={styles.chart}>
      <svg viewBox={`0 0 ${WIDTH} ${series.length * ROW + 24}`} role="img" aria-label={`Each dot is one area's ${field}, by year, on one shared scale from ${scale.min} to ${scale.max}`}>
        {series.map((s, i) => (
          <g key={s.label} transform={`translate(0 ${i * ROW + 16})`}>
            <text x="0" y="5" className={styles.chartLabel}>{s.label}</text>
            <line x1={LABEL_W} x2={WIDTH - 10} y1="0" y2="0" stroke="var(--band)" />
            {s.values.map((v, j) => (
              <circle key={j} cx={x(v)} cy="0" r="3" fill="var(--ink)" fillOpacity="0.35" />
            ))}
          </g>
        ))}
        <text x={LABEL_W} y={series.length * ROW + 20} className={styles.chartLabel}>{scale.min}</text>
        <text x={WIDTH - 10} y={series.length * ROW + 20} textAnchor="end" className={styles.chartLabel}>{scale.max}</text>
      </svg>
      <figcaption>{field}: every year on one shared scale</figcaption>
    </figure>
  );
}
