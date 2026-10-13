"use client";

import { RATE_HEADS, rateText, stopsExport, stopsTitle, type StopsOk } from "@/ui/lib/stopsText";
import { ExportBar } from "./ExportBar";
import { ProvenanceTag } from "./ProvenanceTag";
import styles from "./ask.module.css";

// People MPD stopped, from the Almanac's counts of the City's quarterly files (spec 2026-10-13-stop-search-design §6).
export function StopsCard({ r }: { r: StopsOk }) {
  return (
    <figure className={styles.excerpt} data-card="stops">
      <figcaption className={styles.excerptTitle}>{stopsTitle(r)} <ProvenanceTag source="CITY" /></figcaption>
      <p className={styles.countFigure} data-count>{r.total.toLocaleString("en-US")} people</p>
      {r.groups.length > 0 && (
        <div className={styles.tractScroll} tabIndex={0} role="region" aria-label={`${stopsTitle(r)}, scroll sideways for more`}>
          <table className={styles.excerptTable}>
            <thead>
              <tr><th scope="col">{r.groupBy}</th><th scope="col">People</th><th scope="col">Share</th>{r.rates && RATE_HEADS.map((h) => <th key={h} scope="col">{h}</th>)}</tr>
            </thead>
            <tbody>
              {r.groups.map((g) => (
                <tr key={g.label}>
                  <th scope="row">{g.label}</th><td>{g.n.toLocaleString("en-US")}</td><td>{g.share}%</td>
                  {r.rates && <><td>{rateText(g.frisked)}</td><td>{rateText(g.searched)}</td><td>{rateText(g.found)}</td></>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {r.notes.map((n) => <p key={n} className={styles.source}>{n}</p>)}
      <p className={styles.source} data-source>{r.source}</p>
      <ExportBar make={(ctx) => stopsExport(r, ctx)} />
    </figure>
  );
}
