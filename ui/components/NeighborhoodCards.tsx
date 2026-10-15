"use client";

import type { NRankDetail, NRelateDetail } from "@/convex/tracts";
import { cityLine, nExport, nLead, nMap, nNotes, nTable, type NDetail } from "@/ui/lib/neighborhoodText";
import { CityMap } from "./CityMapLoader";
import { ExportBar } from "./ExportBar";
import { ProvenanceTag } from "./ProvenanceTag";
import styles from "./ask.module.css";

// Neighborhood answers built from census tracts (spec 2026-10-15-neighborhood-answers §6), shaped like the ZIP health card.
function NeighborhoodCard({ r, kind }: { r: NDetail; kind: "neighborhood-rank" | "neighborhood-relate" }) {
  const lead = nLead(r);
  const t = nTable(r);
  const map = nMap(r);
  const title = r.tool === "rank-n" ? `Neighborhoods · ${r.header.name}` : `Neighborhoods · ${r.a.name} and ${r.b.name}`;
  return (
    <figure className={styles.excerpt} data-card={kind}>
      <figcaption className={styles.excerptTitle}>{title} <ProvenanceTag source="DYCU" /></figcaption>
      <p className={styles.tractSummary} data-summary><strong>{lead.strong}</strong>{lead.rest && ` ${lead.rest}`}</p>
      {cityLine(r) && <p className={styles.source} data-city>{cityLine(r)}</p>}
      {t.rows.length > 0 && (
        <div className={styles.tractScroll} tabIndex={0} role="region" aria-label={`${title}, scroll sideways for more`}>
          <table className={styles.excerptTable}>
            <thead><tr>{t.head.map((h, i) => <th key={i} scope="col">{h}</th>)}</tr></thead>
            <tbody>{t.rows.map((row) => <tr key={row[0]}>{row.map((c, i) => (i === 0 ? <th key={i} scope="row">{c}</th> : <td key={i}>{c}</td>))}</tr>)}</tbody>
          </table>
        </div>
      )}
      {map && <div className={styles.tractMap} data-tract-map><CityMap tracts={map} height={220} /></div>}
      {nNotes(r).map((n) => <p key={n} className={styles.source}>{n}</p>)}
      <ExportBar make={(ctx) => nExport(r, ctx)} />
    </figure>
  );
}
export const NeighborhoodRankCard = ({ r }: { r: NRankDetail }) => <NeighborhoodCard r={r} kind="neighborhood-rank" />;
export const NeighborhoodRelateCard = ({ r }: { r: NRelateDetail }) => <NeighborhoodCard r={r} kind="neighborhood-relate" />;
