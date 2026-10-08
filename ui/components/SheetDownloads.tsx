import type { SheetData } from "./SheetBody";
import styles from "./sheet.module.css";

export function SheetDownloads({ sheet }: { sheet: SheetData }) {
  const latest = sheet.members[0];
  if (!latest) return null;
  return (
    <>
      {latest.downloads.CSV && <a className={styles.button} href={latest.downloads.CSV}>CSV</a>}
      {latest.downloads.App && <a className={styles.button} href={latest.downloads.App}>Open app</a>}
      {latest.fileUrl && sheet.fileLabel && <a className={styles.button} href={latest.fileUrl}>{sheet.fileLabel}</a>}
      <a className={styles.button} href={latest.landingPage}>View on Hub</a>
    </>
  );
}
