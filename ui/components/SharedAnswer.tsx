"use client";
import Link from "next/link";
import type { CardExport } from "@/ui/lib/cardExport";
import { shareDate, type Shared } from "@/ui/lib/shareCard";
import { CreditFooter } from "./CreditFooter";
import { ExportBar } from "./ExportBar";
import { Masthead } from "./Masthead";
import { SiteNav } from "./SiteNav";
import fs from "./factSheet.module.css";
import styles from "./share.module.css";

// The shared page (spec 2026-10-14-share-link-design.md §4): the stored snapshot, drawn as the export's table, with
// the day it was shared. The snapshot's own "Exported from … on" line is left out here; the as-of line says it.
const EXPORTED = "Exported from Cream City Almanac on ";
// A figure ("265,664", "73.7%", "$2,400", "±120", "—") stays on one line, right-aligned; words wrap, so a phone needs no sideways scroll.
const FIGURE = /^(?:[-−+±$]*[\d,.]+%?|—)$/;

function CardBody({ e }: { e: CardExport }) {
  const figureCol = (j: number) => e.text.rows.length > 0 && e.text.rows.every((r) => FIGURE.test((r[j] ?? "").trim()));
  return (
    <>
      <h1 className={styles.title}>{e.title}</h1>
      {e.lines.map((l) => <p key={l} className={styles.line}>{l}</p>)}
      <div className={styles.scroll}>
        <table className={styles.table}>
          <thead><tr>{e.text.head.map((h, i) => <th key={i} scope="col" className={figureCol(i) ? styles.num : undefined}>{h}</th>)}</tr></thead>
          <tbody>{e.text.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className={FIGURE.test(c.trim()) ? styles.num : undefined}>{c}</td>)}</tr>)}</tbody>
        </table>
      </div>
      <ul className={styles.notes}>{e.notes.filter((n) => !n.startsWith(EXPORTED)).map((n) => <li key={n}>{n}</li>)}</ul>
    </>
  );
}

export function SharedAnswer({ shared, createdAt }: { shared: Shared; createdAt: number }) {
  const quote = "quote" in shared ? shared.quote.split("\n").filter((l) => !l.startsWith(EXPORTED)).join("\n") : null;
  return (
    <div className={fs.page}>
      <Masthead side={null} showDate={false} nav={<SiteNav placement="masthead" current={null} />} />
      <main className={fs.main}>
        <article className={styles.shared} data-shared>
          {"card" in shared ? <CardBody e={shared.card} /> : <p className={styles.quote}>{quote}</p>}
          <p className={styles.asOf} data-as-of>Shared from Cream City Almanac on {shareDate(createdAt)}. Numbers are as of that day.</p>
          {"card" in shared ? <ExportBar make={() => shared.card} /> : <ExportBar copy={() => shared.quote} />}
          <p><Link href="/ask">Ask your own question →</Link></p>
        </article>
      </main>
      <div className={fs.chrome}><CreditFooter /></div>
    </div>
  );
}
