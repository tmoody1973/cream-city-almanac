"use client";

import Link from "next/link";
import type { SheetResult } from "@/lib/ask/tools";
import { countLine, MISSING, NO_CITY, pct, verdictText } from "@/ui/lib/factText";
import styles from "./ask.module.css";

type SheetOk = Extract<SheetResult, { status: "ok" }>;

// Ask's fact-sheet card: three headlines beside the City's, written by code, and the link to the printable sheet.
export function FactSheetCard({ r }: { r: SheetOk }) {
  return (
    <div className={`${styles.reference} ${styles.tractCard}`} data-card="fact-sheet">
      <p className={styles.tractVerdict}>{r.name} · fact sheet · {r.period}</p>
      <div className={styles.tractScroll} tabIndex={0} role="region" aria-label={`${r.name} fact sheet, scroll sideways for more`}>
        <table className={styles.tractTable}>
          <thead><tr><th scope="col">Figure</th><th scope="col">{r.name}</th><th scope="col">City of Milwaukee</th><th scope="col">Compared</th></tr></thead>
          <tbody>
            {r.headlines.map((h) => (
              <tr key={h.id}>
                <th scope="row">{h.label}</th>
                <td>{h.hood?.rate ? <>{pct(h.hood.rate)}<br /><span className={styles.tractMeta}>{countLine(h.hood)}</span></> : MISSING}</td>
                <td>{h.city?.rate ? pct(h.city.rate) : NO_CITY}</td>
                <td>{verdictText(h.verdict)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={styles.source}><Link href={`/n/${r.slug}`}>Open the fact sheet →</Link></p>
    </div>
  );
}
