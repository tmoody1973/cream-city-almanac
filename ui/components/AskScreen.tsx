"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { LAPTOP_QUERY } from "@/ui/lib/selection";
import { AskPanel } from "./AskPanel";
import { CreditFooter } from "./CreditFooter";
import { Masthead } from "./Masthead";
import { SiteNav } from "./SiteNav";
import styles from "./ask.module.css";
import rundown from "./rundown.module.css";

// Phones: Ask is its own screen. Laptops: the notes column beside the pane, at /?ask=1.
export function AskScreen() {
  const router = useRouter();
  useEffect(() => {
    if (window.matchMedia(LAPTOP_QUERY).matches) router.replace("/?ask=1");
  }, [router]);
  return (
    <div className={styles.screen}>
      <Masthead side="ASK" showDate={false} sideClassName={styles.side} nav={<SiteNav placement="masthead" current="ask" />} />
      <main className={styles.screenMain}>
        <AskPanel />
      </main>
      <div className={rundown.dock}>
        <SiteNav placement="dock" current="ask" />
        <CreditFooter />
      </div>
    </div>
  );
}
