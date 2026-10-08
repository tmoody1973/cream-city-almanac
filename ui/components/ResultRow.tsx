"use client";
import { Fragment, useEffect, useState } from "react";
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

export function ResultRow({
  row,
  mode,
  circled,
  opened,
  selected = false,
  onSelect,
  defaultOpen = false,
}: {
  row: Row;
  mode: "rundown" | "results";
  circled: boolean;
  opened: boolean;
  selected?: boolean;
  onSelect?: (code: string, viaKeyboard: boolean) => void;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  useEffect(() => {
    if (defaultOpen) setOpen(true);
  }, [defaultOpen]);
  const panelId = `preview-${row.code}`;
  const marked = onSelect ? selected : open;
  const sub = subline(row);
  const place = placeSummary(row.kind, row.places);
  return (
    <li className={styles.row} data-code={row.code}>
      <button
        type="button"
        className={styles.rowHead}
        aria-expanded={onSelect ? undefined : open}
        aria-controls={onSelect ? "sheet-pane" : panelId}
        aria-current={onSelect && selected ? "true" : undefined}
        onClick={(e) => (onSelect ? onSelect(row.code, e.detail === 0) : setOpen((o) => !o))}
      >
        <span className={styles.code}>
          {marked && <img className={styles.openArrow} src="/plates/pencil-arrow.png" alt="" aria-hidden="true" width={216} height={197} />}
          {row.code}
        </span>
        {mode === "results" ? (
          <>
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
              <span className={styles.name}>
                {row.name}
                {sub && <span className={styles.dash}> —</span>}
              </span>
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
      {!onSelect && open && <FamilyPreview id={panelId} familyKey={row.key} focus={row.snippet?.focus} />}
    </li>
  );
}
