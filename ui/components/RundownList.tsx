import type { ResultRow as Row } from "@/convex/lib/types";
import { ResultRow } from "./ResultRow";
import styles from "./rundown.module.css";

export function RundownList({ title, mode, rows, circled, opened }: { title?: string; mode: "rundown" | "results"; rows: Row[]; circled: Set<string>; opened: Set<string> }) {
  return (
    <section className={styles.list} aria-label={title ?? "Search results"}>
      {title && <h2 className={styles.sectionTitle}>{title}</h2>}
      <div className={styles.colHeads} aria-hidden="true">
        <span>CODE</span>
        <span>SLUG</span>
        <span>{mode === "rundown" ? "UPDATED" : "YEARS"}</span>
      </div>
      <ol className={styles.rows}>
        {rows.map((row) => (
          <ResultRow key={row.key} row={row} mode={mode} circled={circled.has(row.code)} opened={opened.has(row.code)} />
        ))}
      </ol>
    </section>
  );
}
