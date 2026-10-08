import Link from "next/link";
import { Arrow } from "./Arrow";
import styles from "./rundown.module.css";

export function ExplainerBand() {
  return (
    <p className={styles.band}>
      Milwaukee data in plain English.{" "}
      <Link href="/how-it-works">
        How it works
        <Arrow />
      </Link>
    </p>
  );
}
