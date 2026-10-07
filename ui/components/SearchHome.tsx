"use client";
import { useAction } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { ResultRow, SearchResponse } from "@/convex/lib/types";
import { circledCodes, LAST_VISIT_KEY, OPENED_KEY, readOpened, safeStorage } from "@/ui/lib/marks";
import { searchNotice, type SearchState } from "@/ui/lib/search";
import { CatalogLine, type CatalogStatus } from "./CatalogLine";
import { CreditFooter } from "./CreditFooter";
import { Masthead } from "./Masthead";
import { RundownList } from "./RundownList";
import { SlugBar } from "./SlugBar";
import { TabBar } from "./TabBar";
import styles from "./rundown.module.css";

const DEBOUNCE_MS = 350;
const LOADING_ROWS = 5;

export function SearchHome({ rundown, status }: { rundown: ResultRow[]; status: CatalogStatus }) {
  const search = useAction(api.search.searchCatalog);
  const [query, setQuery] = useState("");
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const [state, setState] = useState<SearchState>("idle");
  const [marks, setMarks] = useState({ circled: new Set<string>(), opened: new Set<string>() });
  const requestId = useRef(0);

  useEffect(() => {
    const store = safeStorage();
    setMarks({ circled: circledCodes(rundown, store.get(LAST_VISIT_KEY)), opened: readOpened(store.get(OPENED_KEY)) });
    const save = () => store.set(LAST_VISIT_KEY, new Date().toISOString());
    window.addEventListener("pagehide", save);
    const q = new URLSearchParams(window.location.search).get("q");
    if (q) setQuery(q);
    return () => window.removeEventListener("pagehide", save);
  }, [rundown]);

  useEffect(() => {
    const q = query.trim();
    window.history.replaceState(null, "", q ? `?q=${encodeURIComponent(q)}` : window.location.pathname);
    if (!q) {
      setResponse(null);
      setState("idle");
      return;
    }
    const id = ++requestId.current;
    setState("loading");
    const timer = setTimeout(() => {
      search({ query: q })
        .then((r) => {
          if (id !== requestId.current) return;
          setResponse(r);
          setState("idle");
        })
        .catch(() => {
          if (id === requestId.current) setState("error");
        });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, search]);

  const searching = query.trim().length > 0;
  const notice = searchNotice(state, response);
  return (
    <div className={styles.page}>
      <Masthead
        side={
          searching ? (
            <>
              RUNDOWN <span className={styles.sideCount}>· {response?.results.length ?? 0} results</span>
            </>
          ) : (
            "TODAY'S RUNDOWN"
          )
        }
        showDate={!searching}
      />
      <main className={styles.main}>
        {/* Results follow comp C: no catalog line or suggestions once a search is running. */}
        {!searching && <CatalogLine status={status} />}
        <SlugBar value={query} onChange={setQuery} showTags={!searching} />
        <p className={styles.notice} role="status">{notice ?? ""}</p>
        {searching ? (
          state === "loading" && !response ? (
            <ol className={styles.rows} aria-busy="true" aria-label="Loading results">
              {Array.from({ length: LOADING_ROWS }, (_, i) => (
                <li key={i} className={`${styles.row} ${styles.rowEmpty}`} />
              ))}
            </ol>
          ) : (
            response && response.results.length > 0 && (
              <RundownList mode="results" rows={response.results} circled={new Set()} opened={marks.opened} />
            )
          )
        ) : (
          <RundownList title="UPDATED THIS SEASON" mode="rundown" rows={rundown} circled={marks.circled} opened={marks.opened} />
        )}
      </main>
      <div className={styles.dock}>
        <TabBar />
        <CreditFooter />
      </div>
    </div>
  );
}
