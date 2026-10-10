import type { FunctionReturnType } from "convex/server";
import Link from "next/link";
import type { api } from "@/convex/_generated/api";
import { shortDate, subline, versionLabel } from "@/ui/lib/format";
import { CityPreview } from "./CityPreview";
import { LivePreview } from "./LivePreview";
import { PlaceYearGrid } from "./PlaceYearGrid";
import type { PortraitFocus } from "@/ui/lib/portrait";
import { PortraitTables } from "./PortraitTables";
import { ProvenanceTag } from "./ProvenanceTag";
import styles from "./sheet.module.css";

// Long column names (Low_Confidence_Limit) wrap after underscores on phones instead of mid-word.
const breakable = (field: string) => field.split("_").flatMap((part, i, all) => (i < all.length - 1 ? [part + "_", <wbr key={i} />] : [part]));

export type SheetData = NonNullable<FunctionReturnType<typeof api.catalog.familySheet>>;
const DOWNLOAD_ORDER = ["CSV", "GeoJSON", "XLSX", "KML", "ZIP", "App"];
// A City package holds one file or 144 (an election's ward files); past a handful they fold behind a native toggle.
const INLINE_FILES = 6;
const MONTH_YEAR = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

function CityFiles({ files }: { files: SheetData["members"][number]["files"] }) {
  const links = files.map((f, i) => {
    const format = /^esri/i.test(f.format) ? "map layer" : f.format.toUpperCase();
    const label = f.name.toUpperCase() === format.toUpperCase() ? format : `${f.name} · ${format}`;
    return <a key={i} className={styles.dl} href={f.url}>{label}</a>;
  });
  if (files.length <= INLINE_FILES) return <>{links}</>;
  return (
    <details className={styles.files}>
      <summary className={styles.dl}>{files.length} files</summary>
      <div className={styles.fileList}>{links}</div>
    </details>
  );
}

export function SheetBody({ sheet, headingId, focus }: { sheet: SheetData; headingId?: string; focus?: PortraitFocus | null }) {
  const { family, card, members, grid, sources, fileLabel } = sheet;
  const latest = members[0];
  return (
    <>
      <header className={styles.header}>
        <span className={styles.code}>{family.code}</span>
        <h2 className={styles.name} id={headingId} tabIndex={headingId ? -1 : undefined}>
          {family.name}
        </h2>
        <p className={styles.sub}>{subline(family)}{family.source === "city" && <> <ProvenanceTag source="CITY" /></>}</p>
      </header>
      {family.kind === "page" ? (
        <section className={styles.section}>
          <p>
            A guide page on DYCU&apos;s Hub, not a dataset.{" "}
            {latest?.landingPage && (
              <a href={latest.landingPage}>
                Open it on the Hub <ProvenanceTag source="HUB" />
              </a>
            )}
          </p>
          <p>
            New here? <Link href="/start-here">Start here</Link>.
          </p>
        </section>
      ) : (
        <>
          {sheet.city?.note && (
            <section className={styles.section}>
              <p className={styles.note} data-city-note>{sheet.city.note}</p>
            </section>
          )}
          {sheet.city?.replacedBy && latest && (
            <section className={styles.section}>
              <p data-replaced-by>
                The City hasn&apos;t updated this since {MONTH_YEAR.format(new Date(latest.modified))}. For newer records, see{" "}
                <Link href={`/d/${sheet.city.replacedBy.code}`}>{sheet.city.replacedBy.code} {sheet.city.replacedBy.name}</Link>.
              </p>
            </section>
          )}
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

          {sheet.portraits && <PortraitTables index={sheet.portraits} focus={focus} />}

          {card && card.glossary.length > 0 && (
            <section className={styles.section}>
              <h3 className={styles.heading}>COLUMN GUIDE</h3>
              <table className={styles.glossary} aria-label="Column guide">
                {/* Laptops (comp B) get a header row and the tag in its own column; phones keep the tag inline. */}
                <thead className={styles.guideHead}>
                  <tr>
                    <th scope="col">COLUMN</th>
                    <th scope="col">DESCRIPTION</th>
                    <th scope="col">TAG</th>
                  </tr>
                </thead>
                <tbody>
                  {card.glossary.map((g) => (
                    <tr key={g.field}>
                      <th scope="row"><code>{breakable(g.field)}</code></th>
                      <td>
                        {g.meaning}
                        <span className={styles.tagInline}> <ProvenanceTag source={g.provenance} /></span>
                      </td>
                      <td className={styles.tagCell}><ProvenanceTag source={g.provenance} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {!(card && card.glossary.length > 0) && sheet.city && sheet.city.columns.length > 0 && (
            <section className={styles.section}>
              <h3 className={styles.heading}>COLUMN GUIDE</h3>
              <table className={styles.glossary} aria-label="Column guide">
                <tbody>
                  {sheet.city.columns.map((c) => (
                    <tr key={c}><th scope="row"><code>{breakable(c)}</code></th></tr>
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

          {sheet.city?.namesPeople && (
            <section className={styles.section}>
              <p className={styles.note}>Names private individuals. Shown as the City publishes it.</p>
            </section>
          )}

          {sheet.city?.datastoreId && (
            <section className={styles.section}>
              <h3 className={styles.heading}>LIVE PREVIEW</h3>
              <CityPreview datastoreId={sheet.city.datastoreId} dateColumn={sheet.city.dateColumn} />
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
                  <a href={m.landingPage}>{versionLabel(m, family.source === "city")}</a>
                  <span className={styles.updated}>updated {shortDate(m.modified)}</span>
                  {m.files.length > 0 ? <CityFiles files={m.files} /> : DOWNLOAD_ORDER.filter((f) => m.downloads[f]).map((f) => (
                    <a key={f} className={styles.dl} href={m.downloads[f]}>{f === "App" ? "Open app" : f}</a>
                  ))}
                  {m.fileUrl && fileLabel && <a className={styles.dl} href={m.fileUrl}>{fileLabel}</a>}
                </li>
              ))}
            </ol>
          </section>
        </>
      )}
    </>
  );
}
