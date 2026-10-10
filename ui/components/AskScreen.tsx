"use client";
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
  // On a laptop this screen only redirects: its panel must not mount, or it would take the guide's ?prompt= and
  // rewrite the address mid-redirect. A full load, not router.replace: Clerk's dev-key address cleanup lands as a
  // history change that the app router treats as a navigation to /ask, cancelling a pending soft redirect.
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    if (window.matchMedia(LAPTOP_QUERY).matches) window.location.replace(laptopAskHref(window.location.search));
    else setPhone(true);
  }, []);
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
