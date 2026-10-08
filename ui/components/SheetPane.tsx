"use client";
import { useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "@/convex/_generated/api";
import { SEARCH_TIMEOUT_MS } from "@/ui/lib/search";
import { OpenedMark } from "./OpenedMark";
import { SheetBody } from "./SheetBody";
import { SheetDownloads } from "./SheetDownloads";
import styles from "./rundown.module.css";
import sheetStyles from "./sheet.module.css";

export const SHEET_HEADING_ID = "sheet-heading";

export function SheetPane({ code, focusHeading, onEscape }: { code: string; focusHeading: boolean; onEscape: () => void }) {
  const sheet = useQuery(api.catalog.familySheet, { code });
  const [stalled, setStalled] = useState(false);

  useEffect(() => {
    setStalled(false);
    if (sheet !== undefined) return;
    const timer = setTimeout(() => setStalled(true), SEARCH_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [sheet, code]);

  useEffect(() => {
    if (focusHeading && sheet) document.getElementById(SHEET_HEADING_ID)?.focus();
  }, [focusHeading, sheet]);

  const body =
    sheet === undefined ? (
      <p role="status" aria-busy={!stalled}>{stalled ? "Can't reach the catalog. Check your connection and try again." : "Loading…"}</p>
    ) : sheet === null ? (
      <p role="status">No dataset with that code. It may have left DYCU&apos;s Hub.</p>
    ) : (
      <>
        <OpenedMark code={sheet.family.code} />
        {/* key: a new code remounts the sheet, so a slow preview from the previous row can never land here */}
        <SheetBody key={sheet.family.code} sheet={sheet} headingId={SHEET_HEADING_ID} />
        <div className={sheetStyles.paneDownloads}>
          <SheetDownloads sheet={sheet} />
        </div>
      </>
    );

  return (
    <section id="sheet-pane" className={styles.sheetPane} aria-label="Dataset sheet" onKeyDown={(e) => e.key === "Escape" && onEscape()}>
      {body}
    </section>
  );
}
