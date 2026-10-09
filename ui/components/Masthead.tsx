import Link from "next/link";
import type { ReactNode } from "react";
import { PhoneMenu } from "./PhoneMenu";
import { TodayDate } from "./TodayDate";
import styles from "./rundown.module.css";

// The wordmark links home. Below laptop width the page name gives way to MENU (the menu marks the current page);
// `note` (today's date, a result count) stays under it on every screen.
export function Masthead({ side, showDate, nav, sideClassName, note }: { side: ReactNode; showDate: boolean; nav?: ReactNode; sideClassName?: string; note?: ReactNode }) {
  return (
    <header className={styles.masthead}>
      <h1 className={styles.wordmark}>
        <Link href="/" className={styles.wordmarkLink}>
          Cream City Almanac
        </Link>
      </h1>
      <div className={sideClassName ? `${styles.side} ${sideClassName}` : styles.side}>
        <span className={styles.sideName}>{side}</span>
        <PhoneMenu />
        {note && <span className={styles.sideNote}>{note}</span>}
        {showDate && <TodayDate className={styles.sideDate} />}
      </div>
      {nav}
    </header>
  );
}
