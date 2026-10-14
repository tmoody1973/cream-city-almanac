"use client";

import { turnoutExport, turnoutText, type TurnoutOk } from "@/ui/lib/turnoutText";
import { ExportBar } from "./ExportBar";
import { ProvenanceTag } from "./ProvenanceTag";
import styles from "./ask.module.css";

// Milwaukee voter turnout, 2016–2022, from the City's election files (spec 2026-10-13-turnout-design §6).
export function TurnoutCard({ r }: { r: TurnoutOk }) {
  return (
    <figure className={styles.excerpt} data-card="turnout">
      <figcaption className={styles.excerptTitle}>{r.title} <ProvenanceTag source="CITY" /></figcaption>
      <div className={styles.tractScroll} tabIndex={0} role="region" aria-label={`${r.title}, scroll sideways for more`}>
        <table className={styles.excerptTable}>
          <thead><tr><th scope="col">{r.groupBy === "ward" ? "Ward" : "Election"}</th><th scope="col">Registered voters</th><th scope="col">Ballots cast</th><th scope="col">Turnout</th></tr></thead>
          <tbody>
            {r.rows.map((x) => (
              <tr key={x.label}><th scope="row">{x.label}</th><td>{x.registered.toLocaleString("en-US")}</td><td>{x.ballots.toLocaleString("en-US")}</td><td>{turnoutText(x.turnout)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      {r.notes.map((n) => <p key={n} className={styles.source}>{n}</p>)}
      <p className={styles.source} data-source>{r.source}</p>
      <ExportBar make={(ctx) => turnoutExport(r, ctx)} />
    </figure>
  );
}
