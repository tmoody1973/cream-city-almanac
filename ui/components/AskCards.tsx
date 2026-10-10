"use client";
import { useRenderTool } from "@copilotkit/react-core/v2";
import { useAction } from "convex/react";
import { createContext, Fragment, useContext, useEffect, useState } from "react";
import { z } from "zod";
import { countCoverage, outsideCoverage } from "@/ui/lib/askCount";
import { passageBlocks } from "@/ui/lib/askPassage";
import { formatPortraitMargin, formatPortraitNumber } from "@/ui/lib/portrait";
import { api } from "@/convex/_generated/api";
import { countParams, type CountForModel, type CountResult } from "@/lib/ask/tools";
import { CityMap } from "./CityMapLoader";
import { LivePreview } from "./LivePreview";
import { ProvenanceTag } from "./ProvenanceTag";
import styles from "./ask.module.css";

// Laptop passes onOpen (the pane beside the notes shows the answer); a phone omits it (answers sit in the note).
type Open = ((search: string) => void) | undefined;
type Value = { estimate: string; moe: string | null } | null;
export type NumberResult = {
  status: string; code: string; neighborhood: string; place: string; year: number | null; topic: string; slug: string;
  tableIdText: string; definition: string | null; label: string; rowIndex: number; values: Value[]; groups: string[]; nearby: { label: string; values: Value[]; marked: boolean }[];
};

type CountOk = Extract<CountForModel, { status: "ok" }>;
type CountArgs = z.infer<typeof countParams>;

const parse = <T,>(result: unknown): T | null => {
  try {
    return typeof result === "string" ? (JSON.parse(result) as T) : null;
  } catch {
    return null;
  }
};

// Each result opens the pane once; history re-rendering never re-opens it.
const opened = new Set<string>();
function useOpenOnce(key: string | null, search: string | null, onOpen: Open) {
  useEffect(() => {
    if (!onOpen || !key || !search || opened.has(key)) return;
    opened.add(key);
    onOpen(search);
  }, [key, search, onOpen]);
}

function OpenLink({ code, query = "", onOpen, label, anchor }: { code: string; query?: string; onOpen: Open; label?: string; anchor?: boolean }) {
  const params = `open=${code}${query ? `&${query}` : ""}`;
  return (
    <a
      className={styles.open}
      data-leader-anchor={anchor || undefined}
      href={onOpen ? `/search?ask=1&${params}` : `/d/${code}${query ? `?${query}` : ""}`}
      // Phone: the sheet opens in a new tab, so the conversation (paid for in questions) stays.
      {...(onOpen ? {} : { target: "_blank", rel: "noopener" })}
      onClick={onOpen ? (e) => { e.preventDefault(); onOpen(params); } : undefined}
    >
      {label ?? `Open ${code}`} →
    </a>
  );
}

// A report passage as DYCU wrote it: paragraphs, bullet lists, tables and rules (Firecrawl's markdown, rendered).
function PassageText({ text }: { text: string }) {
  return (
    <div className={styles.passageText}>
      {passageBlocks(text).map((b, i) =>
        b.kind === "p" ? (
          <p key={i}>{b.text}</p>
        ) : b.kind === "list" ? (
          <ul key={i}>{b.items.map((item, j) => <li key={j}>{item}</li>)}</ul>
        ) : b.kind === "rule" ? (
          <hr key={i} />
        ) : (
          <div key={i} className={styles.passageScroll} tabIndex={0} role="region" aria-label="Table from the report, scroll sideways for more">
            <table>
              <tbody>
                {b.rows.map((row, j) => (
                  <tr key={j}>{row.map((cell, k) => (k === 0 ? <th key={k} scope="row">{cell}</th> : <td key={k}>{cell}</td>))}</tr>
                ))}
              </tbody>
            </table>
          </div>
        ),
      )}
    </div>
  );
}

const Busy = () => <p className={styles.busy} aria-busy="true">Looking it up…</p>;
const Failed = () => <p className={styles.failed}>This didn&apos;t load. Ask again to retry.</p>;
const rowQuery = (r: NumberResult) => new URLSearchParams({ place: r.place, ...(r.year ? { year: String(r.year) } : {}), topic: r.slug, row: String(r.rowIndex) }).toString();

export function NumberCard({ r, onOpen, callKey }: { r: NumberResult; onOpen: Open; callKey: string }) {
  const query = rowQuery(r);
  useOpenOnce(callKey, `open=${r.code}&${query}`, onOpen);
  const title = `${r.neighborhood}, ${r.year ?? "latest"} · ${r.topic}`;
  if (onOpen) {
    // Laptop: the table is open in the pane with this row outlined; the note keeps a reference the leader starts from.
    return (
      <p className={styles.reference} data-card="number">
        {title} · {r.label} <ProvenanceTag source="DYCU" />
        {r.definition && <span className={styles.source} data-definition> {r.neighborhood} as DYCU defines it: {r.definition}</span>} <OpenLink code={r.code} query={query} onOpen={onOpen} anchor />
      </p>
    );
  }
  return (
    <figure className={styles.excerpt} data-card="number">
      {/* The note's short ink leader into its excerpt (comp ask-a-phone). */}
      <svg className={styles.drop} viewBox="0 0 12 28" width="12" height="28" aria-hidden="true">
        <path d="M6 0 V26 M1.5 21 L6 26.5 L10.5 21" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="square" />
      </svg>
      <figcaption className={styles.excerptTitle}>{title} <ProvenanceTag source="DYCU" /></figcaption>
      {r.definition && <p className={styles.source} data-definition>{r.neighborhood} as DYCU defines it: {r.definition}</p>}
      <table className={styles.excerptTable}>
        <thead>
          <tr>
            <th scope="col"><span className="visually-hidden">Row</span></th>
            {r.groups.map((g, i) => (
              <Fragment key={i}>
                <th scope="col">{g ? `${g} estimate` : "Estimate"}</th>
                <th scope="col">± Margin</th>
              </Fragment>
            ))}
          </tr>
        </thead>
        <tbody>
          {(r.nearby ?? []).map((row) => (
            <tr key={row.label} className={row.marked ? styles.markedRow : undefined} data-row-marked={row.marked || undefined}>
              <th scope="row">{row.label}</th>
              {row.values.map((v, i) => (
                <Fragment key={i}>
                  <td>{v ? formatPortraitNumber(v.estimate) : ""}</td>
                  <td>{v?.moe ? formatPortraitMargin(v.moe) : ""}</td>
                </Fragment>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className={styles.source}>Census table {r.tableIdText}</p>
      <OpenLink code={r.code} query={query} onOpen={onOpen} label="Open the full table" />
    </figure>
  );
}

function SheetCard({ code, name, onOpen, callKey, preview, source = "HUB" }: { code: string; name: string; onOpen: Open; callKey: string; preview?: { members: { place: string | null; yearLabel: string | null; featureServerUrl: string | null }[]; fields: string[] }; source?: "HUB" | "CITY" }) {
  useOpenOnce(callKey, `open=${code}`, onOpen);
  return (
    <div className={styles.reference} data-card={preview ? "preview" : "dataset"}>
      <p className={styles.referenceLine}>
        <span className={styles.code}>{code}</span> · {name} {preview && <ProvenanceTag source={source} />} <OpenLink code={code} onOpen={onOpen} anchor={Boolean(onOpen)} />
      </p>
      {preview && source === "HUB" && !onOpen && <LivePreview members={preview.members} fields={preview.fields} chartOnly />}
    </div>
  );
}

// The count calls that came before a question's last count (ui/lib/askNotes.ts earlierCountIds); the Ask panel
// provides them, and those cards fold to one line so a broad first count never reads as the answer.
export const EarlierCounts = createContext<Set<string>>(new Set());

// The conversation's newest count (Note provides it) and the map the reader picked with "Show map" (AskPanel holds it).
export const NewestCount = createContext<string | null>(null);
export const MapPick = createContext<{ picked: { id: string; newest: string | null } | null; pick: (id: string, newest: string | null) => void }>({ picked: null, pick: () => {} });

function CountMap({ r, id, args }: { r: CountOk; id?: string; args?: CountArgs }) {
  const newest = useContext(NewestCount);
  const { picked, pick } = useContext(MapPick);
  if (!r.map) return <p className={styles.source} data-map-message>{r.mapError ? "No map for this count." : "No map: this dataset doesn't record locations."}</p>;
  // A pick lasts until a newer count arrives; then the newest card is live again.
  const live = picked && picked.newest === newest ? picked.id === id : id === newest;
  if (!live) return <button type="button" className={styles.textButton} onClick={() => id && pick(id, newest)} data-show-map>Show map</button>;
  // A grouped count ("by month") maps all of its groups together.
  const months = /^[A-Z][a-z]{2} \d{4}$|^\d{4}$/.test(r.groups[0]?.label ?? "");
  const together = r.groups.length > 0 ? `Counts cover all ${months ? "months" : "types"} together.` : undefined;
  return args ? <LiveCountMap args={args} count={r.count} boundary={r.map.area} after={together} /> : null;
}

// The conversation holds no cells (lib/ask/tools.ts withoutCells): they come from the map cache countRecords just
// filled, a free hit. After 10 minutes they're recomputed under the public map's limit.
function LiveCountMap({ args, count, boundary, after }: { args: CountArgs; count: number; boundary: string | null; after?: string }) {
  const run = useAction(api.map.mapCells);
  const [got, setGot] = useState<{ ask: string; r: CountResult } | null>(null);
  const { groupBy: _groupBy, ...where } = args; // groups don't change the cells; countRecords stored them ungrouped
  const ask = JSON.stringify(where);
  useEffect(() => {
    let gone = false;
    run(JSON.parse(ask)).then(
      (r) => { if (!gone) setGot({ ask, r }); },
      () => { if (!gone) setGot({ ask, r: { status: "unavailable" } as CountResult }); },
    );
    return () => { gone = true; };
  }, [run, ask]);
  const r = got?.ask === ask ? got.r : null;
  if (!r) return <p className={styles.source} data-map-message aria-busy="true">Loading map…</p>;
  if (r.status === "busy") return <p className={styles.source} data-map-message>The map is busy; try again in a minute.</p>;
  if (r.status !== "ok" || !r.map) return <p className={styles.source} data-map-message>The City&apos;s data didn&apos;t respond. Try again shortly.</p>;
  return <CityMap cells={r.map} count={count} boundary={boundary} after={after} />;
}

function CountOrEarlier({ r, id, onOpen, args }: { r: CountOk; id?: string; onOpen: Open; args?: CountArgs }) {
  const earlier = useContext(EarlierCounts);
  if (!id || !earlier.has(id)) return <CountCard r={r} id={id} onOpen={onOpen} args={args} />;
  return (
    <details className={styles.earlierCount} data-earlier-count>
      <summary>Earlier count: {[r.name, r.area, ...r.filters, r.period].filter(Boolean).join(" · ")}</summary>
      <CountCard r={r} onOpen={onOpen} noMap />
    </details>
  );
}

// A City count: the number lives here, never in the model's words. Filters in plain words, the period, what the
// data covers, and caveats.
function CountCard({ r, id, onOpen, noMap, args }: { r: CountOk; id?: string; onOpen: Open; noMap?: boolean; args?: CountArgs }) {
  const covers = countCoverage(r);
  return (
    <figure className={styles.excerpt} data-card="count">
      <figcaption className={styles.excerptTitle}>
        {[r.name, ...r.filters, r.period].join(" · ")} <ProvenanceTag source="CITY" />
      </figcaption>
      <p className={styles.countFigure} data-count>{r.count.toLocaleString("en-US")}</p>
      {r.groups.length > 0 && (
        <table className={styles.excerptTable}>
          <tbody>
            {r.groups.map((g) => (
              <tr key={g.label}><th scope="row">{g.label}</th><td>{g.count.toLocaleString("en-US")}</td></tr>
            ))}
            {r.other > 0 && <tr><th scope="row">{r.otherLabel ?? "Other"}</th><td>{r.other.toLocaleString("en-US")}</td></tr>}
          </tbody>
        </table>
      )}
      {r.overlap && r.groups.length > 0 && <p className={styles.source}>An incident can count in more than one group.</p>}
      {covers && <p className={styles.source} data-coverage>{covers}</p>}
      {r.area && <p className={styles.source} data-area>In {r.area}</p>}
      {r.noLocation > 0 && <p className={styles.source} data-no-location>{r.noLocation.toLocaleString("en-US")} matching records citywide have no location and aren&apos;t included.</p>}
      {!noMap && <CountMap r={r} id={id} args={args} />}
      {r.futureExcluded > 0 && <p className={styles.source}>{r.futureExcluded.toLocaleString("en-US")} records dated in the future were left out.</p>}
      {r.caveat && <p className={styles.source}>{r.caveat} <ProvenanceTag source="AI" /></p>}
      <OpenLink code={r.code} onOpen={onOpen} label="Open the data" />
    </figure>
  );
}

const key = (name: string, props: { toolCallId?: string; result?: string }) => props.toolCallId ?? `${name}:${props.result ?? ""}`;

export function AskCards({ onOpen }: { onOpen?: (search: string) => void }) {
  useRenderTool({ name: "searchCatalog", parameters: z.object({ query: z.string() }), render: (props) => {
    if (props.status !== "complete") return <Busy />;
    const r = parse<{ rows: { code: string; name: string; places: string[]; years: number[] }[] }>(props.result);
    if (!r) return <Failed />;
    return (
      <ol className={styles.rows} data-card="datasets">
        {r.rows.map((row) => (
          <li key={row.code}>
            <span className={styles.code}>{row.code}</span> {row.name} <OpenLink code={row.code} onOpen={onOpen} />
          </li>
        ))}
      </ol>
    );
  } }, [onOpen]);

  useRenderTool({ name: "showDataset", parameters: z.object({ code: z.string() }), render: (props) => {
    if (props.status !== "complete") return <Busy />;
    const r = parse<{ status: string; code: string; name: string }>(props.result);
    if (!r) return <Failed />;
    if (r.status !== "ok") return null;
    return <SheetCard code={r.code} name={r.name} onOpen={onOpen} callKey={key("showDataset", props as never)} />;
  } }, [onOpen]);

  useRenderTool({ name: "previewData", parameters: z.object({ code: z.string() }), render: (props) => {
    if (props.status !== "complete") return <Busy />;
    const r = parse<{ status: string; city?: boolean; code: string; name: string; members: { place: string | null; yearLabel: string | null; featureServerUrl: string | null }[]; fields: string[] }>(props.result);
    if (!r) return <Failed />;
    if (r.status !== "ok") return null;
    return <SheetCard code={r.code} name={r.name} onOpen={onOpen} callKey={key("previewData", props as never)} preview={{ members: r.members, fields: r.fields }} source={r.city ? "CITY" : "HUB"} />;
  } }, [onOpen]);

  useRenderTool({ name: "getNumber", parameters: z.object({ neighborhood: z.string() }), render: (props) => {
    if (props.status !== "complete") return <Busy />;
    const r = parse<NumberResult>(props.result);
    if (!r) return <Failed />;
    if (r.status !== "ok") return null; // the model picks from the choices and calls again
    return <NumberCard r={r} onOpen={onOpen} callKey={key("getNumber", props as never)} />;
  } }, [onOpen]);

  useRenderTool({ name: "countRecords", parameters: countParams, render: (props) => {
    if (props.status !== "complete") return <Busy />;
    const r = parse<CountForModel>(props.result);
    if (!r) return <Failed />;
    if (r.status === "ok") return <CountOrEarlier r={r} id={props.toolCallId} onOpen={onOpen} args={props.parameters} />;
    if (r.status === "outside-coverage") return <p className={styles.failed} data-card="count-outside">{outsideCoverage(r)} <OpenLink code={r.code} onOpen={onOpen} /></p>;
    if (r.status === "unavailable") return <p className={styles.failed}>The City&apos;s data didn&apos;t respond. Try again shortly.</p>;
    if (r.status === "not-live") return <p className={styles.failed}>{r.name} can&apos;t be counted live.{r.note ? ` ${r.note}` : ""} <OpenLink code={r.code} onOpen={onOpen} /></p>;
    if (r.status === "busy") return <p className={styles.failed}>City counts are busy for your account; try again shortly.</p>;
    if (r.status === "no-neighborhood") return <p className={styles.failed} data-card="count-no-neighborhood">No City neighborhood is called &ldquo;{r.asked}&rdquo;.{r.nearest.length ? ` Nearest: ${r.nearest.join(", ")}.` : ""}</p>;
    if (r.status === "no-locations") return <p className={styles.failed}>{r.name} doesn&apos;t record locations, so it can&apos;t be counted by neighborhood. <OpenLink code={r.code} onOpen={onOpen} /></p>;
    if (r.status === "too-broad") return <p className={styles.failed}>Too many {r.name} records in {r.area} to count at once; try a shorter period.</p>;
    return null; // choose / bad-column / bad-dates / not-found / not-city: the model asks or retries
  } }, [onOpen]);

  useRenderTool({ name: "readReport", parameters: z.object({ question: z.string() }), render: (props) => {
    if (props.status !== "complete") return <Busy />;
    const r = parse<{ status: string; passages: { quote: string; section: string; report: string; code: string }[] }>(props.result);
    if (!r) return <Failed />;
    if (r.status === "busy") return <p className={styles.failed}>Report search is busy for your account; try again shortly.</p>;
    return (
      <>
        {r.passages.map((p) => (
          <figure key={p.quote} className={styles.passage} data-card="passage">
            <blockquote><PassageText text={p.quote} /></blockquote>
            <figcaption>
              {p.report}, <i>{p.section}</i> <OpenLink code={p.code} onOpen={onOpen} />
            </figcaption>
          </figure>
        ))}
      </>
    );
  } }, [onOpen]);

  return null;
}
