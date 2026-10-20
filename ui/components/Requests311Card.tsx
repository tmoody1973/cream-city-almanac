import { compareRows, daysText, n, notesOf, requests311Export, requests311Title, type Requests311Ok } from "@/ui/lib/requests311Text";
import { ExportBar } from "./ExportBar";
import { ProvenanceTag } from "./ProvenanceTag";
import styles from "./ask.module.css";

// City 311 requests for a place next to the city, from stored counts (spec 2026-10-20-311-by-neighborhood §5).
export function Requests311Card({ r }: { r: Requests311Ok }) {
  const title = requests311Title(r);
  const place = r.place.kind === "city" ? "Milwaukee" : r.place.name;
  const byGroup = r.rows.length > 0;
  return (
    <figure className={styles.excerpt} data-card="requests-311">
      <figcaption className={styles.excerptTitle}>{title} <ProvenanceTag source="CITY" /></figcaption>
      <div className={styles.tractScroll} tabIndex={0} role="region" aria-label={`${title}, scroll sideways for more`}>
        <table className={styles.excerptTable}>
          {byGroup ? (
            <>
              <thead><tr><th scope="col"></th><th scope="col">Requests</th><th scope="col">Closed</th><th scope="col">Median days to close</th></tr></thead>
              <tbody>{r.rows.map((x) => <tr key={x.label}><th scope="row">{x.label}</th><td>{n(x.fig.requests)}</td><td>{n(x.fig.closed)}</td><td>{daysText(x.fig.medianDays)}</td></tr>)}</tbody>
            </>
          ) : (
            <>
              <thead><tr><th scope="col"></th><th scope="col">{place}</th>{r.place.kind !== "city" && <th scope="col">City</th>}</tr></thead>
              <tbody>{compareRows(r).map(([label, mine, city]) => <tr key={label}><th scope="row">{label}</th><td>{mine}</td>{r.place.kind !== "city" && <td>{city}</td>}</tr>)}</tbody>
            </>
          )}
        </table>
      </div>
      {notesOf(r).map((x) => <p key={x} className={styles.source}>{x}</p>)}
      <ExportBar make={(ctx) => requests311Export(r, ctx)} />
    </figure>
  );
}
