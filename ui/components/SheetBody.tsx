import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
import { shortDate, subline, yearSpan } from "@/ui/lib/format";
import { LivePreview } from "./LivePreview";
import { PlaceYearGrid } from "./PlaceYearGrid";
import { ProvenanceTag } from "./ProvenanceTag";
import styles from "./sheet.module.css";

// Long column names (Low_Confidence_Limit) wrap after underscores on phones instead of mid-word.
const breakable = (field: string) => field.split("_").flatMap((part, i, all) => (i < all.length - 1 ? [part + "_", <wbr key={i} />] : [part]));

export type SheetData = NonNullable<FunctionReturnType<typeof api.catalog.familySheet>>;
const DOWNLOAD_ORDER = ["CSV", "GeoJSON", "XLSX", "KML", "ZIP", "App"];

export function SheetBody({ sheet, headingId }: { sheet: SheetData; headingId?: string }) {
  const { family, card, members, grid, sources, fileLabel } = sheet;
  const latest = members[0];
  return (
    <>
      <header className={styles.header}>
        <span className={styles.code}>{family.code}</span>
        <h2 className={styles.name} id={headingId} tabIndex={headingId ? -1 : undefined}>
          {family.name}
        </h2>
        <p className={styles.sub}>{subline(family)}</p>
      </header>
      <div className={styles.lead}>
        <div className={styles.section}>
          <h3 className={`${styles.heading} ${styles.laptopOnly}`}>PLACE BY YEAR</h3>
          <PlaceYearGrid grid={grid} />
        </div>

        <section className={styles.section}>
          <h3 className={styles.heading}>WHAT IT MEASURES</h3>
          <p>{card?.explainer ?? latest?.title} {card && <ProvenanceTag source={card.explainerProvenance} />}</p>
        </section>
      </div>

      {card && card.glossary.length > 0 && (
        <section className={styles.section}>
          <h3 className={styles.heading}>COLUMN GUIDE</h3>
          <table className={styles.glossary} aria-label="Column guide">
            <tbody>
              {card.glossary.map((g) => (
                <tr key={g.field}>
                  <th scope="row"><code>{breakable(g.field)}</code></th>
                  <td>{g.meaning} <ProvenanceTag source={g.provenance} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {card && card.caveats.length > 0 && (
        <section className={styles.section}>
          <h3 className={styles.heading}>CAVEATS</h3>
          <ul>{card.caveats.map((c) => <li key={c}>{c} <ProvenanceTag source="AI" /></li>)}</ul>
        </section>
      )}

      {members.some((m) => m.featureServerUrl) && (
        <section className={styles.section}>
          <h3 className={styles.heading}>LIVE PREVIEW</h3>
          <LivePreview members={members} fields={card?.glossary.map((g) => g.field) ?? []} />
        </section>
      )}

      {card && card.storyAngles.length > 0 && (
        <section className={styles.section}>
          <h3 className={styles.heading}>STORY ANGLES</h3>
          <ul>{card.storyAngles.map((s) => <li key={s}>{s} <ProvenanceTag source="AI" /></li>)}</ul>
        </section>
      )}

      {sources.length > 0 && (
        <section className={styles.section}>
          <h3 className={styles.heading}>SOURCES</h3>
          {sources.map((s) => (
            <p key={s.name}>
              <a href={s.url}>{s.name}</a>: {s.summary} {s.limits} <ProvenanceTag source="SOURCE_SITE" />
            </p>
          ))}
        </section>
      )}

      <section className={styles.section}>
        <h3 className={styles.heading}>ALL VERSIONS</h3>
        <ol className={styles.versions}>
          {members.map((m) => (
            <li key={m.hubId}>
              <a href={m.landingPage}>{[m.place, m.yearLabel ?? yearSpan(m.years)].filter(Boolean).join(" · ") || m.title}</a>
              <span className={styles.updated}>updated {shortDate(m.modified)}</span>
              {DOWNLOAD_ORDER.filter((f) => m.downloads[f]).map((f) => (
                <a key={f} className={styles.dl} href={m.downloads[f]}>{f === "App" ? "Open app" : f}</a>
              ))}
              {m.fileUrl && fileLabel && <a className={styles.dl} href={m.fileUrl}>{fileLabel}</a>}
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
