import type { FunctionReturnType } from "convex/server";
import Link from "next/link";
import type { api } from "@/convex/_generated/api";
import { shortDate, subline, yearSpan } from "@/ui/lib/format";
import { Arrow } from "./Arrow";
import { CreditFooter } from "./CreditFooter";
import { LivePreview } from "./LivePreview";
import { Masthead } from "./Masthead";
import { OpenedMark } from "./OpenedMark";
import { PlaceYearGrid } from "./PlaceYearGrid";
import { ProvenanceTag } from "./ProvenanceTag";
import { TabBar } from "./TabBar";
import styles from "./sheet.module.css";

// Long column names (Low_Confidence_Limit) wrap after underscores on phones instead of mid-word.
const breakable = (field: string) => field.split("_").flatMap((part, i, all) => (i < all.length - 1 ? [part + "_", <wbr key={i} />] : [part]));

export type SheetData = NonNullable<FunctionReturnType<typeof api.catalog.familySheet>>;
const DOWNLOAD_ORDER = ["CSV", "GeoJSON", "XLSX", "KML", "ZIP", "App"];

export function DatasetSheet({ sheet }: { sheet: SheetData }) {
  const { family, card, members, grid, sources, fileLabel } = sheet;
  const latest = members[0];
  return (
    <div className={styles.page}>
      <OpenedMark code={family.code} />
      <Masthead side="RUNDOWN" showDate={false} />
      <main>
        <nav className={styles.back}><Link href="/">
            <Arrow direction="left" />
            Rundown
          </Link></nav>
        <header className={styles.header}>
          <span className={styles.code}>{family.code}</span>
          <h2 className={styles.name}>{family.name}</h2>
          <p className={styles.sub}>{subline(family)}</p>
        </header>
        <div className={styles.section}><PlaceYearGrid grid={grid} /></div>

        <section className={styles.section}>
          <h3 className={styles.heading}>WHAT IT MEASURES</h3>
          <p>{card?.explainer ?? latest?.title} {card && <ProvenanceTag source={card.explainerProvenance} />}</p>
        </section>

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
      </main>
      {latest && (
        <div className={styles.downloadBar}>
          {latest.downloads.CSV && <a className={styles.button} href={latest.downloads.CSV}>CSV</a>}
          {latest.downloads.App && <a className={styles.button} href={latest.downloads.App}>Open app</a>}
          {latest.fileUrl && fileLabel && <a className={styles.button} href={latest.fileUrl}>{fileLabel}</a>}
          <a className={styles.button} href={latest.landingPage}>View on Hub</a>
        </div>
      )}
      <TabBar />
      <CreditFooter />
    </div>
  );
}
