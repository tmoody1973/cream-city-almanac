"use client";
import { useEffect, useState } from "react";
import styles from "./sheet.module.css";

const ROWS = 8;

// Newest rows straight from the City's datastore (CORS allows browsers). Shown as the City publishes them.
export function CityPreview({ datastoreId, dateColumn }: { datastoreId: string; dateColumn: string | null }) {
  const [data, setData] = useState<{ fields: string[]; records: Record<string, unknown>[] } | null | "error">(null);
  useEffect(() => {
    const params = new URLSearchParams({ resource_id: datastoreId, limit: String(ROWS), ...(dateColumn ? { sort: `${dateColumn} desc` } : {}) });
    fetch(`https://data.milwaukee.gov/api/3/action/datastore_search?${params}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((b) => setData({ fields: b.result.fields.map((f: { id: string }) => f.id).filter((f: string) => f !== "_id").slice(0, 6), records: b.result.records }))
      .catch(() => setData("error"));
  }, [datastoreId, dateColumn]);
  if (data === "error") return <p role="status">The City&apos;s live rows didn&apos;t load.</p>;
  if (!data) return <p aria-busy="true">Loading the City&apos;s newest rows…</p>;
  return (
    <div className={styles.scroll} data-city-preview tabIndex={0} role="region" aria-label="Newest rows from the City, scroll sideways for more">
      <table className={styles.rowsTable} aria-label="Newest rows from the City">
        <thead><tr>{data.fields.map((f) => <th key={f} scope="col">{f}</th>)}</tr></thead>
        <tbody>{data.records.map((r, i) => <tr key={i}>{data.fields.map((f) => <td key={f}>{String(r[f] ?? "")}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}
