import Link from "next/link";
import { AccountLink } from "./AccountLink";
import styles from "./rundown.module.css";

type Placement = "dock" | "masthead";

export function SiteNav({ placement, current }: { placement: Placement; current: "search" | "ask" | "how" | "start" | null }) {
  const dock = placement === "dock";
  const cls = (active: boolean) => (dock ? (active ? styles.tabActive : styles.tab) : active ? styles.mastTabActive : styles.mastTab);
  return (
    <nav className={dock ? styles.tabBar : styles.mastNav} aria-label={dock ? "Sections" : "Site"}>
      <Link className={cls(current === "search")} href="/" aria-current={current === "search" ? "page" : undefined}>
        SEARCH
      </Link>
      <Link className={cls(current === "ask")} href="/ask" aria-current={current === "ask" ? "page" : undefined}>
        ASK
      </Link>
      <span className={cls(false)} aria-disabled="true" title="Coming soon">
        SAVED
      </span>
      {!dock && (
        <Link className={cls(current === "start")} href="/start-here" aria-current={current === "start" ? "page" : undefined}>
          START HERE
        </Link>
      )}
      {!dock && (
        <Link className={cls(current === "how")} href="/how-it-works" aria-current={current === "how" ? "page" : undefined}>
          HOW IT WORKS
        </Link>
      )}
      {!dock && <AccountLink className={`${cls(false)} ${styles.navButton}`} />}
    </nav>
  );
}
