"use client";
import { useState } from "react";
import type { ResultRow as Row } from "@/convex/lib/types";
import { shortDate, subline, yearShort } from "@/ui/lib/format";
import { FamilyPreview } from "./FamilyPreview";
import { PencilMark } from "./PencilMark";
import { Tick } from "./Tick";
import styles from "./rundown.module.css";

export function ResultRow({ row, mode, circled, opened }: { row: Row; mode: "rundown" | "results"; circled: boolean; opened: boolean }) {
  const [open, setOpen] = useState(false);
  const panelId = `preview-${row.code}`;
  const sub = mode === "rundown" ? subline(row) : row.kind === "app" ? "web app" : subline({ ...row, years: [] });
  return (
    <li className={styles.row} data-code={row.code}>
      <button type="button" className={styles.rowHead} aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((o) => !o)}>
        <span className={styles.code}>{row.code}</span>
        <span className={styles.slug}>
          <span className={styles.name}>{sub ? `${row.name} —` : row.name}</span>
          {sub && <span className={styles.sub}>{sub}</span>}
        </span>
        <span className={styles.right}>
          <span className={styles.when}>
            {mode === "rundown" ? shortDate(row.latestModified) : yearShort(row.years)}
            {circled && <PencilMark />}
          </span>
          {opened && <Tick />}
        </span>
      </button>
      {open && <FamilyPreview id={panelId} familyKey={row.key} />}
    </li>
  );
}
