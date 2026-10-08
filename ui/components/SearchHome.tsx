"use client";
import { useAction } from "convex/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { ResultRow, SearchResponse } from "@/convex/lib/types";
import { circledCodes, LAST_VISIT_KEY, OPENED_KEY, readOpened, safeStorage } from "@/ui/lib/marks";
import { SEARCH_TIMEOUT_MS, searchNotice, withTimeout, type SearchState } from "@/ui/lib/search";
import { LAPTOP_QUERY, parseSelection, selectionSearch } from "@/ui/lib/selection";
import { useLaptop } from "@/ui/lib/useLaptop";
import { CatalogLine, type CatalogStatus } from "./CatalogLine";
import { CreditFooter } from "./CreditFooter";
import { ExplainerBand } from "./ExplainerBand";
import { Masthead } from "./Masthead";
import { RundownList } from "./RundownList";
import { SheetPane } from "./SheetPane";
import { SiteNav } from "./SiteNav";
import { SlugBar } from "./SlugBar";
import styles from "./rundown.module.css";

const DEBOUNCE_MS = 350;
const LOADING_ROWS = 5;

export function SearchHome({ rundown, status }: { rundown: ResultRow[]; status: CatalogStatus }) {
  const search = useAction(api.search.searchCatalog);
  const router = useRouter();
  const laptop = useLaptop();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null); // an explicit choice, from a click or the address
  const [focusPane, setFocusPane] = useState(false);
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const [state, setState] = useState<SearchState>("idle");
  const [marks, setMarks] = useState({ circled: new Set<string>(), opened: new Set<string>() });
  const requestId = useRef(0);

  // The address is the source of truth on load and on Back / Forward.
  useEffect(() => {
    const restore = () => {
      const s = parseSelection(window.location.search);
      setQuery(s.q);
      setOpen(s.open);
    };
    restore();
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);

  useEffect(() => {
    const store = safeStorage();
    setMarks({ circled: circledCodes(rundown, store.get(LAST_VISIT_KEY)), opened: readOpened(store.get(OPENED_KEY)) });
    const save = () => store.set(LAST_VISIT_KEY, new Date().toISOString());
    window.addEventListener("pagehide", save);
    return () => window.removeEventListener("pagehide", save);
  }, [rundown]);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      requestId.current++;
      setResponse(null);
      setState("idle");
      return;
    }
    const id = ++requestId.current;
    setState("loading");
    const timer = setTimeout(() => {
      withTimeout(search({ query: q }), SEARCH_TIMEOUT_MS)
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
  const rows = searching ? response?.results ?? [] : rundown;
  const selected = open ?? (laptop ? rows[0]?.code ?? null : null);

  const onQueryChange = (value: string) => {
    setQuery(value);
    setOpen(null);
    window.history.replaceState(null, "", `${window.location.pathname}${selectionSearch({ q: value, open: null })}`);
  };

  const select = useCallback(
    (code: string, viaKeyboard: boolean) => {
      setOpen(code);
      setFocusPane(viaKeyboard);
      window.history.pushState(null, "", `${window.location.pathname}${selectionSearch({ q: query, open: code })}`);
    },
    [query],
  );

  // Phones: a laptop link to an item that isn't in this list opens that item's full sheet page.
  useEffect(() => {
    if (!open || window.matchMedia(LAPTOP_QUERY).matches) return;
    if (searching && !response) return;
    if (!rows.some((r) => r.code === open)) router.replace(`/d/${open}`);
  }, [open, rows, searching, response, router]);

  const backToRow = () => document.querySelector<HTMLButtonElement>(`li[data-code="${selected}"] button`)?.focus();
  const notice = searchNotice(state, response);
  const listProps = { selected, onSelect: laptop ? select : undefined, expandCode: laptop ? null : open };

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
        sideClassName={searching ? undefined : styles.sideRundown}
        nav={<SiteNav placement="masthead" current="search" />}
      />
      <div className={styles.split}>
        <main className={styles.main}>
          {!searching && <CatalogLine status={status} />}
          {!searching && <ExplainerBand />}
          <SlugBar value={query} onChange={onQueryChange} showTags={!searching} />
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
                <RundownList mode="results" rows={response.results} circled={new Set()} opened={marks.opened} {...listProps} />
              )
            )
          ) : (
            <RundownList title="UPDATED THIS SEASON" mode="rundown" rows={rundown} circled={marks.circled} opened={marks.opened} {...listProps} />
          )}
        </main>
        {laptop && selected && <SheetPane code={selected} focusHeading={focusPane} onEscape={backToRow} />}
        <aside className={styles.askRail} aria-label="Ask: coming soon">
          <span className={styles.askRailLabel}>ASK</span>
          <span>coming soon</span>
        </aside>
      </div>
      <div className={styles.dock}>
        <SiteNav placement="dock" current="search" />
        <CreditFooter />
      </div>
    </div>
  );
}
