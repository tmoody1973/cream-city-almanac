"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { laptopAskHref } from "@/ui/lib/askPrompt";
import { LAPTOP_QUERY } from "@/ui/lib/selection";
import { AskPanel } from "./AskPanel";
import { Masthead } from "./Masthead";
import { SiteNav } from "./SiteNav";
import styles from "./ask.module.css";
import rundown from "./rundown.module.css";

// Phones: Ask is its own screen. Laptops: the notes column beside the pane, at /?ask=1.
export function AskScreen() {
  const router = useRouter();
  // On a laptop this screen only redirects: its panel must not mount, or it would take the guide's ?prompt= and
  // rewrite the address mid-redirect.
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    if (window.matchMedia(LAPTOP_QUERY).matches) router.replace(laptopAskHref(window.location.search));
    else setPhone(true);
  }, [router]);
  return (
    <div className={styles.screen}>
      <Masthead side="ASK" showDate={false} sideClassName={styles.side} nav={<SiteNav placement="masthead" current="ask" />} />
      <main className={styles.screenMain}>
        {phone && <AskPanel />}
      </main>
      {/* Comp ask-a-phone: only the tab bar under the question field. */}
      <div className={rundown.dock}>
        <SiteNav placement="dock" current="ask" />
      </div>
    </div>
  );
}
