"use client";

import type { HealthOk } from "@/convex/lib/healthAnswer";
import { countyLine, creditsOf, leadOf, mapOf, notesOf, tableOf, zipHealthExport, zipHealthTitle } from "@/ui/lib/zipHealthText";
import { CityMap } from "./CityMapLoader";
import { ExportBar } from "./ExportBar";
import { ProvenanceTag } from "./ProvenanceTag";
import styles from "./ask.module.css";

// Health Compass figures by ZIP (spec 2026-10-15-zip-health §5): code's lead sentence, the rows, the measure's own words,
// the cutoff and limitation, and Health Compass's credit with a link (§6).
export function ZipHealthCard({ r }: { r: HealthOk }) {
  const lead = leadOf(r);
  const t = tableOf(r);
  const map = mapOf(r);
  return (
    <figure className={styles.excerpt} data-card="zip-health">
      <figcaption className={styles.excerptTitle}>{zipHealthTitle(r)} <ProvenanceTag source="HCM" /></figcaption>
      <p className={styles.tractSummary} data-summary><strong>{lead.strong}</strong>{lead.rest && ` ${lead.rest}`}</p>
      {countyLine(r) && <p className={styles.source} data-county>{countyLine(r)}</p>}
      {t.rows.length > 0 && (
        <div className={styles.tractScroll} tabIndex={0} role="region" aria-label={`${zipHealthTitle(r)}, scroll sideways for more`}>
          <table className={styles.excerptTable}>
            <thead><tr>{t.head.map((h, i) => <th key={i} scope="col">{h}</th>)}</tr></thead>
            <tbody>{t.rows.map((row) => <tr key={row.join("|")}>{row.map((c, i) => (i === 0 ? <th key={i} scope="row">{c}</th> : <td key={i}>{c}</td>))}</tr>)}</tbody>
          </table>
        </div>
      )}
      {map && <div className={styles.tractMap} data-tract-map><CityMap tracts={map} height={220} /></div>}
      {notesOf(r).map((n) => <p key={n} className={styles.source}>{n}</p>)}
      {creditsOf(r).map((lines) => (
        <p key={lines.join("|")} className={styles.source} data-credit>
          {lines.map((l, i) => (l.startsWith("https://") ? <a key={i} href={l}>{l}</a> : <span key={i}>{l}. </span>))}
        </p>
      ))}
      <ExportBar make={(ctx) => zipHealthExport(r, ctx)} />
    </figure>
  );
}
