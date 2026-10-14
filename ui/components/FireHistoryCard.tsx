"use client";

import { fireCells, fireExport, fireHead, type FireOk } from "@/ui/lib/fireText";
import { ExportBar } from "./ExportBar";
import { ProvenanceTag } from "./ProvenanceTag";
import styles from "./ask.module.css";

// Fire Department calls and response times by year, from stored totals (spec 2026-10-14-fire-history §7).
export function FireHistoryCard({ r }: { r: FireOk }) {
  return (
    <figure className={styles.excerpt} data-card="fire-history">
      <figcaption className={styles.excerptTitle}>{r.title} <ProvenanceTag source="CITY" /></figcaption>
      <div className={styles.tractScroll} tabIndex={0} role="region" aria-label={`${r.title}, scroll sideways for more`}>
        <table className={styles.excerptTable}>
          <thead><tr>{fireHead(r).map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
          <tbody>
            {r.rows.map((x) => {
              const [label, ...cells] = fireCells(r, x);
              return <tr key={x.year}><th scope="row">{label}</th>{cells.map((c, i) => <td key={i}>{c}</td>)}</tr>;
            })}
          </tbody>
        </table>
      </div>
      {r.notes.map((n) => <p key={n} className={styles.source}>{n}</p>)}
      <p className={styles.source} data-source>{r.source}</p>
      <ExportBar make={(ctx) => fireExport(r, ctx)} />
    </figure>
  );
}
