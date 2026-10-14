"use client";

import { cityCell, placeNote, populationLine, shareCell, verdictWord, zipExport, zipSource, zipTitle, ZIP_NOTES, type ZipOk } from "@/ui/lib/zipText";
import { ExportBar } from "./ExportBar";
import { ProvenanceTag } from "./ProvenanceTag";
import styles from "./ask.module.css";

// Who lives in one ZIP area, from the Census survey, beside Milwaukee (spec 2026-10-14-zip-profile §6).
function Rows({ caption, rows, zip }: { caption: string; rows: ZipOk["race"]; zip: string }) {
  return (
    <div className={styles.tractScroll} tabIndex={0} role="region" aria-label={`${caption}, scroll sideways for more`}>
      <table className={styles.excerptTable}>
        <caption>{caption}</caption>
        <thead><tr><th scope="col">Measure</th><th scope="col">ZIP {zip}</th><th scope="col">City of Milwaukee</th><th scope="col">Compared with the city</th></tr></thead>
        <tbody>
          {rows.map((x) => (
            <tr key={x.id}><th scope="row">{x.label}</th><td>{shareCell(x)}</td><td>{cityCell(x)}</td><td>{verdictWord(x.verdict)}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ZipCard({ r }: { r: ZipOk }) {
  const where = placeNote(r);
  return (
    <figure className={styles.excerpt} data-card="zip">
      <figcaption className={styles.excerptTitle}>{zipTitle(r)} <ProvenanceTag source="CENSUS" /></figcaption>
      {where && <p className={styles.source} data-place-note>{where}</p>}
      <p className={styles.source}>{populationLine(r.population)}</p>
      <Rows caption="Who lives here" rows={r.race} zip={r.zip} />
      <Rows caption="Living here" rows={r.facts} zip={r.zip} />
      {ZIP_NOTES.map((n) => <p key={n} className={styles.source}>{n}</p>)}
      <p className={styles.source} data-source>{zipSource(r.period)}</p>
      <ExportBar make={(ctx) => zipExport(r, ctx)} />
    </figure>
  );
}
