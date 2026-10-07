"use client";
import { useEffect, useState } from "react";
import type { ResultRow } from "@/convex/lib/types";
import { circledCodes, LAST_VISIT_KEY, OPENED_KEY, readOpened, safeStorage } from "@/ui/lib/marks";
import { CatalogLine, type CatalogStatus } from "./CatalogLine";
import { CreditFooter } from "./CreditFooter";
import { Masthead } from "./Masthead";
import { RundownList } from "./RundownList";
import { SlugBar } from "./SlugBar";
import { TabBar } from "./TabBar";
import styles from "./rundown.module.css";

export function SearchHome({ rundown, status }: { rundown: ResultRow[]; status: CatalogStatus }) {
  const [query, setQuery] = useState("");
  const [marks, setMarks] = useState({ circled: new Set<string>(), opened: new Set<string>() });

  useEffect(() => {
    const store = safeStorage();
    setMarks({ circled: circledCodes(rundown, store.get(LAST_VISIT_KEY)), opened: readOpened(store.get(OPENED_KEY)) });
    // Saved when the reader leaves, so reloads and React's dev double-render don't erase today's circles.
    const save = () => store.set(LAST_VISIT_KEY, new Date().toISOString());
    window.addEventListener("pagehide", save);
    return () => window.removeEventListener("pagehide", save);
  }, [rundown]);

  return (
    <div className={styles.page}>
      <Masthead side="TODAY'S RUNDOWN" showDate />
      <main className={styles.main}>
        <CatalogLine status={status} />
        <SlugBar value={query} onChange={setQuery} />
        <RundownList title="UPDATED THIS SEASON" mode="rundown" rows={rundown} circled={marks.circled} opened={marks.opened} />
      </main>
      <div className={styles.dock}>
        <TabBar />
        <CreditFooter />
      </div>
    </div>
  );
}
