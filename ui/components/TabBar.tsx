import Link from "next/link";
import styles from "./rundown.module.css";

export function TabBar() {
  return (
    <nav className={styles.tabBar} aria-label="Sections">
      <Link className={styles.tabActive} href="/" aria-current="page">
        SEARCH
      </Link>
      <span className={styles.tab} aria-disabled="true" title="Coming soon">
        ASK
      </span>
      <span className={styles.tab} aria-disabled="true" title="Coming soon">
        SAVED
      </span>
    </nav>
  );
}
