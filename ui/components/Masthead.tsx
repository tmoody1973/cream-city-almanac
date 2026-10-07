import type { ReactNode } from "react";
import { TodayDate } from "./TodayDate";
import styles from "./rundown.module.css";

export function Masthead({ side, showDate }: { side: ReactNode; showDate: boolean }) {
  return (
    <header className={styles.masthead}>
      <h1 className={styles.wordmark}>Cream City Almanac</h1>
      <p className={styles.side}>
        {side}
        {showDate && <TodayDate className={styles.sideDate} />}
      </p>
    </header>
  );
}
