"use client";
import { useEffect, useState } from "react";
import { fetchFeatures, fieldValue, headlineColumn, rowsUrl, sharedScale, valuesUrl, type FetchResult, type Features, isSystemColumn, chartSeries, formatCell } from "@/ui/lib/preview";
import { StripChart } from "./StripChart";
import styles from "./sheet.module.css";

type Member = { place: string | null; yearLabel: string | null; featureServerUrl: string | null };
const MAX_SERIES = 6;

export function LivePreview({ members, fields, chartOnly = false }: { members: Member[]; fields: string[]; chartOnly?: boolean }) {
  const sources = members.filter((m) => m.featureServerUrl).slice(0, MAX_SERIES);
  const latestUrl = sources[0]?.featureServerUrl ?? null;
  const headline = headlineColumn(fields);
  const [rows, setRows] = useState<FetchResult<Features> | null>(null);
  const [series, setSeries] = useState<{ label: string; values: number[] }[] | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!latestUrl) return;
    let live = true;
    fetchFeatures(rowsUrl(latestUrl)).then((r) => live && setRows(r));
    if (headline) {
      Promise.all(
        sources.map(async (m) => {
          const r = await fetchFeatures(valuesUrl(m.featureServerUrl!, headline));
          const values = r.ok ? r.data.features.map((f) => Number(fieldValue(f.attributes, headline))).filter(Number.isFinite) : [];
          return { label: [m.place, m.yearLabel].filter(Boolean).join(" "), values };
        }),
      )
        .then((s) => live && setSeries(chartSeries(s)))
        .catch(() => live && setSeries([]));
    }
    return () => {
      live = false;
    };
    // sources is derived from members; latestUrl and headline capture what changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestUrl, headline, attempt]);

  if (!latestUrl) return null;
  if (rows === null) return <p aria-busy="true">Loading preview from the Hub…</p>;
  if (!rows.ok) {
    const retry = () => {
      setRows(null);
      setSeries(null);
      setAttempt((a) => a + 1);
    };
    return (
      <div role="status">
        <p>Preview unavailable: the Hub isn&apos;t responding ({rows.reason}). The downloads below still work.</p>
        <button type="button" className={styles.button} onClick={retry}>Try again</button>
      </div>
    );
  }
  const first = rows.data.features.map((f) => f.attributes);
  const columns = Object.keys(first[0] ?? {}).filter((c) => !isSystemColumn(c));
  const scale = series ? sharedScale(series.map((s) => s.values)) : null;
  return (
    <>
      {!chartOnly && (
        <div className={styles.scroll} tabIndex={0} role="region" aria-label="First rows, scroll sideways for more columns">
          <table className={styles.rowsTable} aria-label="First rows from the Hub">
            <thead>
              <tr>{columns.map((c) => <th key={c} scope="col">{c}</th>)}</tr>
            </thead>
            <tbody>
              {first.map((row, i) => (
                <tr key={i}>{columns.map((c) => <td key={c}>{formatCell(row[c])}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {headline && series && scale && <StripChart field={headline} series={series} scale={scale} />}
    </>
  );
}
