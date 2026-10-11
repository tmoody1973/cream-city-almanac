import styles from "./ask.module.css";

// Laptop passes onOpen (the pane beside the notes shows the answer); a phone omits it (answers sit in the note).
export type Open = ((search: string) => void) | undefined;

export function OpenLink({ code, query = "", onOpen, label, anchor }: { code: string; query?: string; onOpen: Open; label?: string; anchor?: boolean }) {
  const params = `open=${code}${query ? `&${query}` : ""}`;
  return (
    <a
      className={styles.open}
      data-leader-anchor={anchor || undefined}
      href={onOpen ? `/search?ask=1&${params}` : `/d/${code}${query ? `?${query}` : ""}`}
      // Phone: the sheet opens in a new tab, so the conversation (paid for in questions) stays.
      {...(onOpen ? {} : { target: "_blank", rel: "noopener" })}
      onClick={onOpen ? (e) => { e.preventDefault(); onOpen(params); } : undefined}
    >
      {label ?? `Open ${code}`} →
    </a>
  );
}
