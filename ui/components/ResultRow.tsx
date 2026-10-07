"use client";
import { Fragment, useState } from "react";
import type { ResultRow as Row } from "@/convex/lib/types";
import { placeSummary, shortDate, subline, yearShort } from "@/ui/lib/format";
import { FamilyPreview } from "./FamilyPreview";
import { PencilMark } from "./PencilMark";
import { Tick } from "./Tick";
import styles from "./rundown.module.css";

// Segments ("29 neighborhoods", "2022–2024") never split; lines break only between them.
function Parts({ text }: { text: string }) {
  return text.split(" · ").map((part, i) => (
    <Fragment key={part}>
      {i > 0 && " · "}
      <span className={styles.nowrap}>{part}</span>
    </Fragment>
  ));
}

export function ResultRow({ row, mode, circled, opened }: { row: Row; mode: "rundown" | "results"; circled: boolean; opened: boolean }) {
  const [open, setOpen] = useState(false);
  const panelId = `preview-${row.code}`;
  const sub = subline(row);
  const place = placeSummary(row.kind, row.places);
  return (
    <li className={styles.row} data-code={row.code}>
      <button type="button" className={styles.rowHead} aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((o) => !o)}>
        <span className={styles.code}>
          {/* Comp C: the open row gets a grease-pencil arrow at its code and a swash under its title. */}
          {open && <img className={styles.openArrow} src="/plates/pencil-arrow.png" alt="" aria-hidden="true" width={484} height={442} />}
          {row.code}
        </span>
        {mode === "results" ? (
          <>
            {/* Comp C: a single-line title, with place and years together on the right. */}
            <span className={styles.slug}>
              <span className={styles.name}>{row.name}</span>
            </span>
            <span className={styles.right}>
              {place && <span className={styles.place}>{place}</span>}
              <span className={styles.years}>{yearShort(row.years)}</span>
              {opened && <Tick />}
            </span>
          </>
        ) : (
          <>
            <span className={styles.slug}>
              <span className={styles.name}>{sub ? `${row.name} —` : row.name}</span>
              {sub && (
                <span className={styles.sub}>
                  <Parts text={sub} />
                </span>
              )}
            </span>
            <span className={styles.right}>
              <span className={styles.when}>
                {shortDate(row.latestModified)}
                {circled && <PencilMark />}
              </span>
              {opened && <Tick />}
            </span>
          </>
        )}
      </button>
      {open && <FamilyPreview id={panelId} familyKey={row.key} />}
    </li>
  );
}
