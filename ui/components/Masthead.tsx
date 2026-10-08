import type { ReactNode } from "react";
import { TodayDate } from "./TodayDate";
import styles from "./rundown.module.css";

export function Masthead({ side, showDate, nav, sideClassName }: { side: ReactNode; showDate: boolean; nav?: ReactNode; sideClassName?: string }) {
  return (
    <header className={styles.masthead}>
      <h1 className={styles.wordmark}>Cream City Almanac</h1>
      <p className={sideClassName ? `${styles.side} ${sideClassName}` : styles.side}>
        {side}
        {showDate && <TodayDate className={styles.sideDate} />}
      </p>
      {nav}
    </header>
  );
}
