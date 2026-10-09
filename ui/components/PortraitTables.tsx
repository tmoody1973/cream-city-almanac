"use client";
import { useQuery } from "convex/react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import { TOPICS } from "@/convex/lib/portrait";
import { censusTableUrl, formatPortraitMargin, formatPortraitNumber, portraitFocusQuery, portraitTopics, resolvePortraitFocus, type PortraitFocus } from "@/ui/lib/portrait";
import type { PortraitRow } from "@/convex/lib/portrait";
import { LAPTOP_QUERY } from "@/ui/lib/selection";
import { ProvenanceTag } from "./ProvenanceTag";
import type { SheetData } from "./SheetBody";
import styles from "./sheet.module.css";

type Index = NonNullable<SheetData["portraits"]>;
type Focus = { place: string; hubId: string; topic: string };
const SLUGS = TOPICS.map((t) => t.slug);
const ABOUT = new Map(TOPICS.map((t) => [t.slug, t.about]));

// One neighborhood's Census tables, exactly as DYCU published them (approved comps: portraits-b-laptop, portraits-a-phone).
// Rows split at each section heading, so every heading heads only its own block.
const sectionsOf = (rows: PortraitRow[]) =>
  rows.reduce<PortraitRow[][]>((acc, r) => (r.heading || !acc.length ? [...acc, [r]] : [...acc.slice(0, -1), [...acc[acc.length - 1], r]]), []);

export function PortraitTables({ index, focus: requested }: { index: Index; focus?: PortraitFocus | null }) {
  const [focus, setFocus] = useState<Focus>(() => resolvePortraitFocus(index, new URLSearchParams(), SLUGS));
  // The address picks the table, unless a search result in the laptop pane asks for one; the pickers change it after.
  const requestedQuery = portraitFocusQuery(requested);
  // A row Ask pointed at (row=label), outlined until the reader picks another table.
  const [marked, setMarked] = useState<string | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(requestedQuery || window.location.search);
    setFocus(resolvePortraitFocus(index, params, SLUGS));
    setMarked(params.get("row"));
  }, [index, requestedQuery]);

  const place = index.neighborhoods.find((n) => n.key === focus.place) ?? index.neighborhoods[0];
  const file = place.files.find((f) => f.hubId === focus.hubId) ?? place.files[0];
  const isInitial = file.hubId === index.initial?.hubId;
  const loaded = useQuery(api.catalog.portraitTables, isInitial ? "skip" : { hubId: file.hubId });
  const tables = isInitial ? index.initial!.tables : loaded;
  const table = useMemo(() => tables?.find((t) => t.slug === focus.topic) ?? tables?.[0], [tables, focus.topic]);
  const shown = useRef<HTMLDivElement>(null);
  // Bring a row Ask pointed at into view once its table has rendered.
  useEffect(() => {
    if (marked) document.querySelector("[data-row-marked]")?.scrollIntoView({ block: "center" });
  }, [marked, tables]);
  const topics = portraitTopics(tables);

  const go = (next: Focus) => {
    setFocus(next);
    setMarked(null);
    const params = new URLSearchParams(window.location.search);
    params.delete("row");
    const year = index.neighborhoods.find((n) => n.key === next.place)?.files.find((f) => f.hubId === next.hubId)?.year;
    params.set("place", next.place);
    if (year) params.set("year", String(year));
    else params.delete("year");
    params.set("topic", next.topic);
    window.history.replaceState(null, "", `${window.location.pathname}?${params}`);
  };

  return (
    <section className={styles.section} aria-labelledby="portrait-heading">
      <h3 id="portrait-heading" className={styles.heading}>
        WHAT&apos;S IN EACH SPREADSHEET
      </h3>
      <p>
        Each file is one neighborhood&apos;s numbers from the Census Bureau&apos;s American Community Survey (5-year estimates), as DYCU
        published them. <ProvenanceTag source="DYCU" />
      </p>
      <div className={styles.portraitPickers}>
        <label>
          Neighborhood:
          <select
            value={place.key}
            onChange={(e) => {
              const n = index.neighborhoods.find((x) => x.key === e.target.value)!;
              // Keep the year being read when the new neighborhood has it.
              const same = n.files.find((f) => f.year === file.year) ?? n.files[0];
              go({ place: n.key, hubId: same.hubId, topic: focus.topic });
            }}
          >
            {index.neighborhoods.map((n) => (
              <option key={n.key} value={n.key}>
                {n.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Year:
          <select value={file.hubId} onChange={(e) => go({ place: place.key, hubId: e.target.value, topic: focus.topic })}>
            {place.files.map((f) => (
              <option key={f.hubId} value={f.hubId}>
                {f.year ?? "Undated"}
              </option>
            ))}
          </select>
        </label>
      </div>
      <ol className={styles.portraitTopics}>
        {topics.map((t) =>
          t.state === "present" ? (
            <li key={t.slug}>
              <button
                type="button"
                aria-pressed={table?.slug === t.slug}
                onClick={() => {
                  go({ place: place.key, hubId: file.hubId, topic: t.slug });
                  // Narrow screens list the topics above the table: show the table that was picked.
                  if (!window.matchMedia(LAPTOP_QUERY).matches) requestAnimationFrame(() => shown.current?.scrollIntoView({ block: "start" }));
                }}
              >
                <span>{t.topic}</span>
                {t.ids && <span className={styles.portraitIds}>{t.ids}</span>}
              </button>
            </li>
          ) : (
            <li key={t.slug} className={styles.portraitMissing}>
              {t.topic}: not in this year&apos;s file
            </li>
          ),
        )}
      </ol>
      {tables === undefined ? (
        <p role="status" aria-busy="true">
          Loading…
        </p>
      ) : !table ? (
        <p role="status">DYCU&apos;s file for this year hasn&apos;t been read yet. Try another year, or download the file.</p>
      ) : (
        <div ref={shown}>
          {table.issues.map((issue) => (
            <p key={issue} className={styles.portraitIssue}>
              {issue}
            </p>
          ))}
          <div className={styles.portraitScroll} role="region" aria-label="Table, scroll sideways for more columns" tabIndex={0}>
            <table className={styles.portraitTable}>
              <caption className={styles.portraitCaption}>
                {place.label}, {file.year ?? "undated"}: {table.topic}
              </caption>
              {table.groups.length > 1 && (
                <>
                  <colgroup span={1} />
                  {table.groups.map((g) => (
                    <colgroup key={g} span={2} />
                  ))}
                </>
              )}
              <thead>
                {table.groups.length > 1 && (
                  <tr>
                    <th scope="col" rowSpan={2}>
                      <span className="visually-hidden">Variable</span>
                    </th>
                    {table.groups.map((g) => (
                      <th key={g} scope="colgroup" colSpan={2}>
                        {g}
                      </th>
                    ))}
                  </tr>
                )}
                <tr>
                  {table.groups.length <= 1 && (
                    <th scope="col">
                      <span className="visually-hidden">Variable</span>
                    </th>
                  )}
                  {table.groups.map((g) => (
                    <Fragment key={g}>
                      <th scope="col">Estimate</th>
                      <th scope="col">± Margin</th>
                    </Fragment>
                  ))}
                </tr>
              </thead>
              {sectionsOf(table.rows).map((rows, si) => (
                <tbody key={si}>
                  {rows.map((r, i) =>
                    r.heading ? (
                      <tr key={i} data-row-marked={r.label === marked || undefined} className={r.label === marked ? styles.markedRow : undefined}>
                        <th scope="rowgroup" colSpan={1 + table.groups.length * 2}>
                          {r.label}
                        </th>
                      </tr>
                    ) : (
                      <tr key={i} data-row-marked={r.label === marked || undefined} className={r.label === marked ? styles.markedRow : undefined}>
                        <th scope="row">{r.label}</th>
                        {r.values.map((v, j) => (
                          <Fragment key={j}>
                            <td>{v ? formatPortraitNumber(v.estimate) : ""}</td>
                            <td>{v?.moe ? formatPortraitMargin(v.moe) : ""}</td>
                          </Fragment>
                        ))}
                      </tr>
                    ),
                  )}
                </tbody>
              ))}
            </table>
          </div>
          <p>
            {ABOUT.get(table.slug)}{" "}
            {table.tableIds.map((id, i) => (
              <Fragment key={id}>
                {i > 0 && ", "}
                <a href={censusTableUrl(id)}>{id}</a>
              </Fragment>
            ))}{" "}
            {table.tableIds.length > 0 && <ProvenanceTag source="SOURCE_SITE" />}
          </p>
          <p className={styles.portraitNote}>
            Margin of error: the range the true number likely falls in, at the Census Bureau&apos;s 90% confidence level.
          </p>
        </div>
      )}
    </section>
  );
}
