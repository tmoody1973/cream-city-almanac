import type { ResultRow as Row } from "@/convex/lib/types";
import { ResultRow } from "./ResultRow";
import styles from "./rundown.module.css";

export function RundownList({
  title,
  mode,
  rows,
  circled,
  opened,
  selected = null,
  onSelect,
  expandCode = null,
}: {
  title?: string;
  mode: "rundown" | "results";
  rows: Row[];
  circled: Set<string>;
  opened: Set<string>;
  selected?: string | null;
  onSelect?: (code: string, viaKeyboard: boolean) => void;
  expandCode?: string | null;
}) {
  return (
    <section className={title ? styles.list : styles.results} aria-label={title ?? "Search results"}>
      {title && <h2 className={styles.sectionTitle}>{title}</h2>}
      <div className={styles.colHeads} aria-hidden="true">
        <span>CODE</span>
        <span>SLUG</span>
        <span>{mode === "rundown" ? "UPDATED" : "YEARS"}</span>
      </div>
      <ol className={mode === "results" ? `${styles.rows} ${styles.rowsResults}` : styles.rows}>
        {rows.map((row) => (
          <ResultRow
            key={row.key}
            row={row}
            mode={mode}
            circled={circled.has(row.code)}
            opened={opened.has(row.code)}
            selected={row.code === selected}
            onSelect={onSelect}
            defaultOpen={row.code === expandCode}
          />
        ))}
      </ol>
    </section>
  );
}
