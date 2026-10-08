import Link from "next/link";
import { shortExplainer } from "@/ui/lib/format";
import { headlineColumn, isSystemColumn } from "@/ui/lib/preview";
import { LivePreview } from "./LivePreview";
import { PencilNote } from "./PencilNote";
import { PlaceYearGrid } from "./PlaceYearGrid";
import { ProvenanceTag } from "./ProvenanceTag";
import type { SheetData } from "./SheetBody";
import styles from "./how.module.css";

const GUIDE_ROWS = 2;

// A real dataset sheet, cut down to its four teaching parts, each with a grease-pencil note (comp: Annotated Sheet).
export function AnnotatedSheet({ sheet }: { sheet: SheetData }) {
  const { family, card, members, grid } = sheet;
  const fields = card?.glossary.map((g) => g.field) ?? [];
  // Teach the measured column first (per_asthma), then the next real one; never the Hub's bookkeeping columns.
  const headline = headlineColumn(fields);
  const guide = (card?.glossary ?? [])
    .filter((g) => !isSystemColumn(g.field))
    .sort((a, b) => Number(b.field === headline) - Number(a.field === headline))
    .slice(0, GUIDE_ROWS);
  const csv = members.find((m) => m.downloads.CSV)?.downloads.CSV;
  return (
    <figure className={styles.annotated} aria-label={`Example: how to read ${family.code} ${family.name}`}>
      <div className={styles.part}>
        <div className={styles.notesTop}>
          <PencilNote side="left">every year &amp; place DYCU publishes</PencilNote>
          <PencilNote side="right">who wrote this: DYCU, the Hub, the source, or AI</PencilNote>
        </div>
        <div className={styles.sheetHead}>
          <span className={styles.code}>{family.code}</span>
          <span className={styles.name}>{family.name}</span>
        </div>
        <div className={styles.gridRow}>
          <PlaceYearGrid grid={grid} />
          <p className={styles.explainer}>
            {shortExplainer(card?.explainer ?? family.name)} {card && <ProvenanceTag source={card.explainerProvenance} />}
          </p>
        </div>
      </div>
      {guide.length > 0 && (
        <table className={styles.guide} aria-label="Column guide, first rows">
          <caption className={styles.partHead}>COLUMN GUIDE</caption>
          <tbody>
            {guide.map((g) => (
              <tr key={g.field}>
                <th scope="row">{g.field}</th>
                <td>
                  {g.meaning} <ProvenanceTag source={g.provenance} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className={styles.part}>
        <PencilNote side="left">live rows from DYCU&apos;s Hub</PencilNote>
        <p className={styles.partHead}>LIVE PREVIEW</p>
        <LivePreview members={members} fields={fields} chartOnly />
      </div>
      <div className={styles.part}>
        <PencilNote side="left">download the real data</PencilNote>
        <div className={styles.actions}>
          {csv && (
            <a className={styles.button} href={csv}>
              CSV
            </a>
          )}
          <Link className={styles.button} href={`/d/${family.code}`}>
            OPEN SHEET
          </Link>
        </div>
      </div>
    </figure>
  );
}
