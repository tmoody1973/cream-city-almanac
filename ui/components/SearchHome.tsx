"use client";
import { useAction } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { ResultRow, SearchResponse } from "@/convex/lib/types";
import { circledCodes, LAST_VISIT_KEY, OPENED_KEY, readOpened, safeStorage } from "@/ui/lib/marks";
import { SEARCH_TIMEOUT_MS, searchNotice, withTimeout, type SearchState } from "@/ui/lib/search";
import { portraitFocusQuery, portraitParams, type PortraitFocus } from "@/ui/lib/portrait";
import { LAPTOP_QUERY, parseSelection, selectionSearch } from "@/ui/lib/selection";
import { useLaptop } from "@/ui/lib/useLaptop";
import { AskPanel } from "./AskPanel";
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
  const [askOpen, setAskOpen] = useState(false); // laptop: the Ask column replaces the list (ask=1)
  // One-shot: set by a keyboard choice, cleared by the pane once it has moved focus (or by a new search).
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
      setAskOpen(Boolean(s.ask));
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

  // A neighborhood table a search result asked for; the auto-shown top row asks for its own.
  const [picked, setPicked] = useState<PortraitFocus | null>(null);
  const paneFocus = open ? picked : rows[0]?.snippet?.focus ?? null;

  const onQueryChange = (value: string) => {
    setQuery(value);
    setOpen(null);
    setPicked(null);
    setFocusPane(false);
    window.history.replaceState(null, "", `${window.location.pathname}${selectionSearch({ q: value, open: null, ask: askOpen })}`);
  };

  const select = (code: string, viaKeyboard: boolean) => {
    const already = code === open;
    setOpen(code);
    setFocusPane(viaKeyboard);
    // The address already names this row, with any neighborhood picks made in its sheet; keep them.
    if (already) return;
    // A spreadsheet passage match opens the table it came from.
    const focus = rows.find((r) => r.code === code)?.snippet?.focus;
    setPicked(focus ?? null);
    const url = `${window.location.pathname}${selectionSearch({ q: query, open: code, ask: askOpen })}${focus ? `&${portraitFocusQuery(focus).slice(1)}` : ""}`;
    // Choosing the row that's already shown doesn't add a Back step.
    if (code === selected) window.history.replaceState(null, "", url);
    else window.history.pushState(null, "", url);
  };

  const showNewest = () => {
    setOpen(null);
    window.history.replaceState(null, "", `${window.location.pathname}${selectionSearch({ q: query, open: null, ask: askOpen })}`);
  };

  // Phones: a laptop link to an item that isn't in this list, or to a neighborhood table, opens that item's sheet page.
  useEffect(() => {
    if (!open || window.matchMedia(LAPTOP_QUERY).matches) return;
    if (searching && !response) return;
    const choice = portraitParams(window.location.search);
    if (choice || !rows.some((r) => r.code === open)) router.replace(`/d/${open}${choice ? `?${choice}` : ""}`);
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
        {laptop && askOpen ? (
          <div className={styles.main}>
            <AskPanel />
          </div>
        ) : (
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
        )}
        {laptop && selected && (
          <SheetPane
            code={selected}
            focus={paneFocus}
            focusHeading={focusPane}
            onFocused={() => setFocusPane(false)}
            explicit={open !== null}
            onEscape={backToRow}
            onShowNewest={showNewest}
          />
        )}
        <aside className={styles.askRail}>
          <a
            className={styles.askRailLabel}
            href={`/${selectionSearch({ q: query, open, ask: !askOpen })}`}
            aria-label={askOpen ? "Close Ask" : "Open Ask"}
            onClick={(e) => {
              e.preventDefault();
              const next = !askOpen;
              setAskOpen(next);
              window.history.pushState(null, "", `${window.location.pathname}${selectionSearch({ q: query, open, ask: next })}`);
            }}
          >
            {askOpen ? (
              <>
                <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
                  <path d="M2 2 L14 14 M14 2 L2 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" />
                </svg>
                CLOSE
              </>
            ) : (
              "ASK"
            )}
          </a>
        </aside>
      </div>
      <div className={styles.dock}>
        <SiteNav placement="dock" current="search" />
        <CreditFooter />
      </div>
    </div>
  );
}
