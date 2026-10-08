"use client";
import { useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "@/convex/_generated/api";
import { SEARCH_TIMEOUT_MS } from "@/ui/lib/search";
import { OpenedMark } from "./OpenedMark";
import type { PortraitFocus } from "@/ui/lib/portrait";
import { SheetBody } from "./SheetBody";
import { SheetDownloads } from "./SheetDownloads";
import styles from "./rundown.module.css";
import sheetStyles from "./sheet.module.css";

export const SHEET_HEADING_ID = "sheet-heading";

export function SheetPane({
  code,
  focus,
  focusHeading,
  onFocused,
  explicit,
  onEscape,
  onShowNewest,
}: {
  code: string;
  focus?: PortraitFocus | null; // a neighborhood table a search result asked for
  focusHeading: boolean;
  onFocused: () => void;
  explicit: boolean; // the reader chose this item (an auto-opened item isn't "opened")
  onEscape: () => void;
  onShowNewest: () => void;
}) {
  const sheet = useQuery(api.catalog.familySheet, { code });
  const [stalled, setStalled] = useState(false);

  useEffect(() => {
    setStalled(false);
    if (sheet !== undefined) return;
    const timer = setTimeout(() => setStalled(true), SEARCH_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [sheet, code]);

  useEffect(() => {
    if (!focusHeading || !sheet) return;
    document.getElementById(SHEET_HEADING_ID)?.focus();
    onFocused();
  }, [focusHeading, sheet, onFocused]);

  const body =
    sheet === undefined ? (
      <p role="status" aria-busy={!stalled}>{stalled ? "Can't reach the catalog. Check your connection and try again." : "Loading…"}</p>
    ) : sheet === null ? (
      <div role="status">
        <p>No dataset with that code. It may have left DYCU&apos;s Hub.</p>
        <button type="button" className={sheetStyles.button} onClick={onShowNewest}>
          Show the newest
        </button>
      </div>
    ) : (
      <>
        {explicit && <OpenedMark code={sheet.family.code} />}
        {/* key: a new code remounts the sheet, so a slow preview from the previous row can never land here */}
        <SheetBody key={sheet.family.code} sheet={sheet} headingId={SHEET_HEADING_ID} focus={focus} />
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
