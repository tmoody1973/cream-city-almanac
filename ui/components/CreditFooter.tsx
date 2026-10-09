import Link from "next/link";
import { AccountLink } from "./AccountLink";
import { ThemeSwitch } from "./ThemeSwitch";
import styles from "./rundown.module.css";

export function CreditFooter() {
  return (
    <footer className={styles.footer}>
      <a href="https://datayoucanuse.org">Built on Data You Can Use&apos;s public data</a>
      {" · "}
      <Link href="/start-here">Start here</Link>
      {" · "}
      <Link href="/how-it-works">How it works</Link>
      {" · "}
      <Link href="/ask/guide">How to use Ask</Link>
      <AccountLink className={styles.footerButton} labels={["Account", "Sign out"]} before=" · " between=" · " />
      <ThemeSwitch />
    </footer>
  );
}
