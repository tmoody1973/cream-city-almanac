import Link from "next/link";
import styles from "./rundown.module.css";

export function CreditFooter() {
  return (
    <footer className={styles.footer}>
      <a href="https://datayoucanuse.org">Built on Data You Can Use&apos;s public data</a>
      {" · "}
      <Link href="/how-it-works">How it works</Link>
    </footer>
  );
}
