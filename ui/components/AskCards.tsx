"use client";
import { useRenderTool } from "@copilotkit/react-core/v2";
import { useAction } from "convex/react";
import { createContext, Fragment, type ReactElement, type ReactNode, useContext, useEffect, useState } from "react";
import { z } from "zod";
import { countCoverage, outsideCoverage } from "@/ui/lib/askCount";
import { passageBlocks } from "@/ui/lib/askPassage";
import { propertyCountSummary } from "@/ui/lib/tractSummary";
import { formatPortraitMargin, formatPortraitNumber } from "@/ui/lib/portrait";
import { api } from "@/convex/_generated/api";
import { boundaryParams, changeParams, countParams, rankParams, relateParams, spanParams, stopsParams, turnoutParams, zipParams, fireParams, zipHealthParams, type ZipHealthAnswer, type StopsAnswer, type TurnoutAnswer, type ZipAnswer, type FireAnswer, type SheetResult, type PlaceAnswer, type BoundariesAnswer, type ChangeResult, type CountForModel, type CountResult, type RankResult, type RelateResult, type SpanResult } from "@/lib/ask/tools";
import { CityMap } from "./CityMapLoader";
import { LivePreview } from "./LivePreview";
import { OpenLink, type Open } from "./OpenLink";
import { ProvenanceTag } from "./ProvenanceTag";
import { ChangeCard, NEIGHBORHOODS_HELP, RankCard, RelateCard, TractMapSlot } from "./TractCards";
import { FollowUps, type FollowUp } from "./FollowUps";
import { ExportBar } from "./ExportBar";
import { ShareLink, ShareScope } from "./ShareLink";
import { countExport, measureExport, numberExport, quoteText, spanExport } from "@/ui/lib/cardExport";
import { areaFollowUps, noTractsText, tooFewText } from "@/ui/lib/tractArea";
import { MEASURE_HIDDEN, measureNotes, measureSummary, measureTitle, money, type MeasureOk } from "@/ui/lib/measureText";
import { spanCells, spanColumns, spanNotes, spanRows, spanSummary, spanTitle, type SpanOk } from "@/ui/lib/spanText";
import { changeFollowUps, countFollowUps, datasetFollowUps, numberFollowUps, previewFollowUps, rankFollowUps, relateFollowUps, spanFollowUps, measureFollowUps } from "@/ui/lib/nextQuestions";
import { changeChoices, countChoices, numberChoices, rankChoices, relateChoices, spanChoices, measureChoices, refusalChoicesFor } from "@/ui/lib/refusalChoices";
import { FactSheetCard } from "./FactSheetCard";
import { PlaceCard } from "./PlaceCard";
import { BoundariesCard } from "./BoundariesCard";
import { StopsCard } from "./StopsCard";
import { TurnoutCard } from "./TurnoutCard";
import { ZipCard } from "./ZipCard";
import { ZipHealthCard } from "./ZipHealthCard";
import { zipHealthChoices, zipHealthFollowUps, zipHealthRefusal } from "@/ui/lib/zipHealthText";
import { FireHistoryCard } from "./FireHistoryCard";
import { fireChoices, fireFollowUps } from "@/ui/lib/fireText";
import { zipRefusal } from "@/ui/lib/zipText";
import { turnoutFollowUps } from "@/ui/lib/turnoutText";
import { stopsChoices, stopsFollowUps } from "@/ui/lib/stopsText";
import { boundariesRefusal } from "@/ui/lib/boundaryText";
import { placeFollowUps, placeRefusal } from "@/ui/lib/placeText";
import styles from "./ask.module.css";

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
      <>
        <p className={styles.reference} data-card="number">
          {title} · {r.label} <ProvenanceTag source="DYCU" />
          {r.definition && <span className={styles.source} data-definition> {r.neighborhood} as DYCU defines it: {r.definition}</span>} <OpenLink code={r.code} query={query} onOpen={onOpen} anchor />
        </p>
        <ExportBar make={(ctx) => numberExport(r, ctx)} />
      </>
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
      <ExportBar make={(ctx) => numberExport(r, ctx)} />
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

// Sheet-card calls repeated later in the same question (ui/lib/askNotes.ts earlierSheetIds): they draw nothing,
// so each dataset shows one card per answer.
export const EarlierSheets = createContext<Set<string>>(new Set());
function Once({ id, children }: { id?: string; children: ReactNode }) {
  const earlier = useContext(EarlierSheets);
  return id && earlier.has(id) ? null : children;
}

// Lookups on the way to an answer (ui/lib/askNotes.ts lookupIds); the Ask panel provides them. A folded search draws
// nothing; a folded sheet draws one line, and never opens the side column (the analysis card keeps it).
export const Lookups = createContext<Set<string>>(new Set());
function Lookup({ id, folded = null, children }: { id?: string; folded?: ReactNode; children: ReactNode }) {
  const lookups = useContext(Lookups);
  return id && lookups.has(id) ? folded : children;
}
const DatasetUsed = ({ code, name, onOpen }: { code: string; name: string; onOpen: Open }) => (
  <p className={styles.source} data-card="dataset-used">Dataset used: {name} <OpenLink code={code} onOpen={onOpen} label="Open the sheet" /></p>
);

// The conversation's newest count (Note provides it) and the map the reader picked with "Show map" (AskPanel holds it).
export const NewestCount = createContext<string | null>(null);
export const MapPick = createContext<{ picked: { id: string; newest: string | null } | null; pick: (id: string, newest: string | null) => void }>({ picked: null, pick: () => {} });

function CountMap({ r, id, args }: { r: CountOk; id?: string; args?: CountArgs }) {
  const newest = useContext(NewestCount);
  const { picked, pick } = useContext(MapPick);
  if (!r.map) return <p className={styles.source} data-map-message>{r.mapError || r.of ? "No map for this count." : "No map: this dataset doesn't record locations."}</p>;
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
      {r.of && <p className={styles.tractSummary} data-summary>{propertyCountSummary({ ...r, of: r.of, period: r.latestYear ? `${r.latestYear} assessment` : r.period })}</p>}
      <p className={styles.countFigure} data-count>{r.count.toLocaleString("en-US")}{r.latestYear ? ` in ${r.latestYear}` : ""}</p>
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
      {"note" in r && r.note && <p className={styles.source} data-count-note>{r.note}</p>}
      {r.area && <p className={styles.source} data-area>In {r.area}</p>}
      {r.area && <p className={styles.source}><a href={NEIGHBORHOODS_HELP} target="_blank" rel="noopener">How neighborhoods work</a></p>}
      {r.noLocation > 0 && <p className={styles.source} data-no-location>{r.noLocation.toLocaleString("en-US")} matching records citywide have no location and aren&apos;t included.</p>}
      {r.tractMap && !noMap ? (
        <>
          <p className={styles.source}>Census tracts where more than half of the properties are {r.filters.join(", ")}: {r.tractMap.total}{r.tractMap.total > r.tractMap.ids.length ? ` (the first ${r.tractMap.ids.length} are drawn)` : ""}.</p>
          <TractMapSlot url={r.tractMap.url} fits={r.tractMap.ids} />
        </>
      ) : (
        !noMap && <CountMap r={r} id={id} args={args} />
      )}
      {r.futureExcluded > 0 && <p className={styles.source}>{r.futureExcluded.toLocaleString("en-US")} records dated in the future were left out.</p>}
      {r.caveat && <p className={styles.source}>{r.caveat} <ProvenanceTag source="AI" /></p>}
      <OpenLink code={r.code} onOpen={onOpen} label="Open the data" />
      {!noMap && <ExportBar make={(ctx) => countExport(r, ctx)} />}
    </figure>
  );
}

// How long things take between an approved pair's dates (spec 2026-10-12-time-spans-design.md §7): every time here
// comes from the City's server through code, never the AI.
function SpanCard({ r, onOpen }: { r: SpanOk; onOpen: Open }) {
  const { warning, notes } = spanNotes(r);
  const rows = spanRows(r);
  return (
    <figure className={styles.excerpt} data-card="span">
      <figcaption className={styles.excerptTitle}>{spanTitle(r)} <ProvenanceTag source="CITY" /></figcaption>
      {warning && <p className={styles.failed} data-span-warning><b>{warning}</b></p>}
      <p className={styles.tractSummary} data-summary>{spanSummary(r)}</p>
      {/* A phone scrolls the table inside the card, never the page (the tract tables' pattern). */}
      <div className={styles.tractScroll} tabIndex={0} role="region" aria-label={`${spanTitle(r)}, scroll sideways for more`}>
      <table className={styles.excerptTable}>
        <thead>
          <tr><th scope="col">{r.groupBy === "year" ? "Year" : r.groupBy ?? ""}</th>{spanColumns(r).map((c) => <th key={c} scope="col">{c}</th>)}</tr>
        </thead>
        <tbody>
          {[...rows, { ...r.all, rest: false }].map((g, i) => (
            <tr key={i}><th scope="row">{g.label}</th>{spanCells(r, g).map((c, j) => <td key={j}>{c}</td>)}</tr>
          ))}
        </tbody>
      </table>
      </div>
      {notes.map((n) => <p key={n} className={styles.source}>{n}</p>)}
      <OpenLink code={r.code} onOpen={onOpen} label="Open the data" />
      <ExportBar make={(ctx) => spanExport(r, ctx)} />
    </figure>
  );
}

// A total / median of an approved City money column (spec 2026-10-12-city-measures-design.md §7): every figure comes
// from the City's server through code, never the AI; small groups are hidden in files that name people.
function MeasureCard({ r, onOpen }: { r: MeasureOk; onOpen: Open }) {
  const m = r.measure, avg = r.averageAsked;
  const cell = (v: number | null, hidden: boolean) => (hidden ? MEASURE_HIDDEN : money(v, m.unit, "table"));
  const rows = [
    ...r.groups.map((g) => ({ ...g, rest: false })),
    ...(r.other ? [{ label: "All other groups", n: r.other.n, total: r.other.total, median: null, average: null, hidden: r.other.hidden, rest: true }] : []),
  ];
  return (
    <figure className={styles.excerpt} data-card="measure">
      <figcaption className={styles.excerptTitle}>{measureTitle(r)} <ProvenanceTag source="CITY" /></figcaption>
      <p className={styles.tractSummary} data-summary>{measureSummary(r)}</p>
      <div className={styles.tractScroll} tabIndex={0} role="region" aria-label={`${measureTitle(r)}, scroll sideways for more`}>
        <table className={styles.excerptTable}>
          <thead>
            <tr>
              <th scope="col">{r.groupBy ?? ""}</th><th scope="col">Records</th>
              {m.summable && <th scope="col">Total</th>}<th scope="col">Median</th>{avg && <th scope="col">Average</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((g, i) => (
              <tr key={i}>
                <th scope="row">{g.label}</th><td>{g.n.toLocaleString("en-US")}</td>
                {m.summable && <td>{cell(g.total, g.hidden)}</td>}
                <td>{g.rest ? "" : cell(g.median, g.hidden)}</td>
                {avg && <td>{g.rest ? "" : cell(g.average, g.hidden)}</td>}
              </tr>
            ))}
            {!r.latestYear && ( // across years, "All" would repeat the newest year
              <tr>
                <th scope="row">All</th><td>{r.all.n.toLocaleString("en-US")}</td>
                {m.summable && <td>{money(r.all.total, m.unit, "table")}</td>}
                <td>{money(r.all.median, m.unit, "table")}</td>{avg && <td>{money(r.all.average, m.unit, "table")}</td>}
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {measureNotes(r).map((n) => <p key={n} className={styles.source}>{n}</p>)}
      <OpenLink code={r.code} onOpen={onOpen} label="Open the data" />
      <ExportBar make={(ctx) => measureExport(r, ctx)} />
    </figure>
  );
}

// A broad first count folds away (EarlierCounts); only the count the reader sees gets next questions.
function CountFollowUps({ items, id }: { items: FollowUp[]; id?: string }) {
  const earlier = useContext(EarlierCounts);
  return id && earlier.has(id) ? null : <FollowUps items={items} id={id} />;
}

const key = (name: string, props: { toolCallId?: string; result?: string }) => props.toolCallId ?? `${name}:${props.result ?? ""}`;

export function AskCards({ onOpen }: { onOpen?: (search: string) => void }) {
  useRenderTool({ name: "searchCatalog", parameters: z.object({ query: z.string() }), render: (props) => {
    if (props.status !== "complete") return <Busy />;
    const r = parse<{ rows: { code: string; name: string; places: string[]; years: number[] }[] }>(props.result);
    if (!r) return <Failed />;
    return (
      <Lookup id={props.toolCallId}>
        <ol className={styles.rows} data-card="datasets">
          {r.rows.map((row) => (
            <li key={row.code}>
              <span className={styles.code}>{row.code}</span> {row.name} <OpenLink code={row.code} onOpen={onOpen} />
            </li>
          ))}
        </ol>
      </Lookup>
    );
  } }, [onOpen]);

  useRenderTool({ name: "showDataset", parameters: z.object({ code: z.string() }), render: (props) => {
    if (props.status !== "complete") return <Busy />;
    const r = parse<{ status: string; code: string; name: string; storyAngles?: string[] }>(props.result);
    if (!r) return <Failed />;
    if (r.status !== "ok") return null;
    return (
      <Lookup id={props.toolCallId} folded={<DatasetUsed code={r.code} name={r.name} onOpen={onOpen} />}>
        <Once id={props.toolCallId}><SheetCard code={r.code} name={r.name} onOpen={onOpen} callKey={key("showDataset", props as never)} /></Once>
        <Once id={props.toolCallId}><FollowUps items={datasetFollowUps(r)} id={props.toolCallId} /></Once>
      </Lookup>
    );
  } }, [onOpen]);

  useRenderTool({ name: "previewData", parameters: z.object({ code: z.string() }), render: (props) => {
    if (props.status !== "complete") return <Busy />;
    const r = parse<{ status: string; city?: boolean; code: string; name: string; members: { place: string | null; yearLabel: string | null; featureServerUrl: string | null }[]; fields: string[] }>(props.result);
    if (!r) return <Failed />;
    if (r.status !== "ok") return null;
    return (
      <>
        <Once id={props.toolCallId}><SheetCard code={r.code} name={r.name} onOpen={onOpen} callKey={key("previewData", props as never)} preview={{ members: r.members, fields: r.fields }} source={r.city ? "CITY" : "HUB"} /></Once>
        <Once id={props.toolCallId}><FollowUps items={previewFollowUps({ code: r.code, name: r.name, fields: r.fields })} id={props.toolCallId} /></Once>
      </>
    );
  } }, [onOpen]);

  useRenderTool({ name: "findPlace", parameters: z.object({ address: z.string() }), render: (props) => {
    if (props.status !== "complete") return <Busy />;
    const r = parse<PlaceAnswer>(props.result);
    if (!r) return <Failed />;
    if (r.status !== "ok") return <p className={styles.failed} data-card="place-refusal">{placeRefusal(r.status)}</p>;
    return <><PlaceCard r={r} /><FollowUps items={placeFollowUps(r)} id={props.toolCallId} /></>;
  } }, []);

  useRenderTool({ name: "boundariesFor", parameters: boundaryParams, render: (props) => {
    if (props.status !== "complete") return <Busy />;
    const r = parse<BoundariesAnswer>(props.result);
    if (!r) return <Failed />;
    if (r.status !== "ok") return <p className={styles.failed} data-card="boundaries-refusal">{boundariesRefusal(r)}</p>;
    return <BoundariesCard r={r} />;
  } }, []);

  useRenderTool({ name: "factSheet", parameters: z.object({ neighborhood: z.string() }), render: (props) => {
    if (props.status !== "complete") return <Busy />;
    const r = parse<SheetResult>(props.result);
    if (!r) return <Failed />;
    if (r.status !== "ok") return <FollowUps pick items={r.nearest.map((n) => ({ label: n, question: `Give me a fact sheet for ${n}.` }))} id={props.toolCallId} />;
    return <FactSheetCard r={r} />;
  } }, []);

  useRenderTool({ name: "countStops", parameters: stopsParams, render: (props) => {
    if (props.status !== "complete") return <Busy />;
    const r = parse<StopsAnswer>(props.result);
    if (!r) return <Failed />;
    if (r.status === "choose") return <FollowUps pick items={stopsChoices(props.parameters as never, r)} id={props.toolCallId} />;
    if (r.status === "refused") return <p className={styles.failed} data-card="stops-refusal">{r.reason}</p>;
    return <><ShareScope tool="countStops" args={props.parameters}><StopsCard r={r} /></ShareScope><FollowUps items={stopsFollowUps(r)} id={props.toolCallId} /></>;
  } }, []);

  useRenderTool({ name: "countTurnout", parameters: turnoutParams, render: (props) => {
    if (props.status !== "complete") return <Busy />;
    const r = parse<TurnoutAnswer>(props.result);
    if (!r) return <Failed />;
    if (r.status === "refused") return <p className={styles.failed} data-card="turnout-refusal">{r.reason}</p>;
    return <><ShareScope tool="countTurnout" args={props.parameters}><TurnoutCard r={r} /></ShareScope><FollowUps items={turnoutFollowUps(props.parameters as never, r)} id={props.toolCallId} /></>;
  } }, []);

  useRenderTool({ name: "zipProfile", parameters: zipParams, render: (props) => {
    if (props.status !== "complete") return <Busy />;
    const r = parse<ZipAnswer>(props.result);
    if (!r) return <Failed />;
    if (r.status !== "ok") return <p className={styles.failed} data-card="zip-refusal">{zipRefusal(r)}</p>;
    return <ZipCard r={r} />;
  } }, []);

  useRenderTool({ name: "zipHealth", parameters: zipHealthParams, render: (props) => {
    if (props.status !== "complete") return <Busy />;
    const r = parse<ZipHealthAnswer>(props.result);
    if (!r) return <Failed />;
    if (r.status === "choose") return <FollowUps pick items={zipHealthChoices(r)} id={props.toolCallId} />;
    if (r.status !== "ok") return <p className={styles.failed} data-card="zip-health-refusal">{zipHealthRefusal(r)}</p>;
    return <><ShareScope tool="zipHealth" args={props.parameters}><ZipHealthCard r={r} /></ShareScope><FollowUps items={zipHealthFollowUps(r)} id={props.toolCallId} /></>;
  } }, []);

  useRenderTool({ name: "fireHistory", parameters: fireParams, render: (props) => {
    if (props.status !== "complete") return <Busy />;
    const r = parse<FireAnswer>(props.result);
    if (!r) return <Failed />;
    if (r.status === "choose") return <FollowUps pick items={fireChoices(r)} id={props.toolCallId} />;
    if (r.status === "refused") return <p className={styles.failed} data-card="fire-refusal">{r.reason}</p>;
    return <><ShareScope tool="fireHistory" args={props.parameters}><FireHistoryCard r={r} /></ShareScope><FollowUps items={fireFollowUps(r)} id={props.toolCallId} /></>;
  } }, []);

  useRenderTool({ name: "getNumber", parameters: z.object({ neighborhood: z.string() }), render: (props) => {
    if (props.status !== "complete") return <Busy />;
    const r = parse<NumberResult>(props.result);
    if (!r) return <Failed />;
    // A refusal lists neighborhoods, topics or rows: the model asks in words, and the reader can pick one here.
    if (r.status !== "ok") return <FollowUps pick items={numberChoices(props.parameters as never, r as never)} id={props.toolCallId} />;
    return (
      <>
        <ShareScope tool="getNumber" args={props.parameters}><NumberCard r={r} onOpen={onOpen} callKey={key("getNumber", props as never)} /></ShareScope>
        <FollowUps items={numberFollowUps({ topic: r.topic, label: r.label })} id={props.toolCallId} />
      </>
    );
  } }, [onOpen]);

  useRenderTool({ name: "countRecords", parameters: countParams, render: (props) => {
    if (props.status !== "complete") return <Busy />;
    const r = parse<CountForModel>(props.result);
    if (!r) return <Failed />;
    if (r.status === "measured") return <><ShareScope tool="countRecords" args={props.parameters}><MeasureCard r={r} onOpen={onOpen} /></ShareScope><FollowUps items={measureFollowUps(props.parameters as never, r)} id={props.toolCallId} /></>;
    if (r.status === "choose-measure") return <FollowUps pick items={measureChoices(r)} id={props.toolCallId} />;
    if (r.status === "ok") return <><ShareScope tool="countRecords" args={props.parameters}><CountOrEarlier r={r} id={props.toolCallId} onOpen={onOpen} args={props.parameters} /></ShareScope><CountFollowUps items={countFollowUps(props.parameters as never, r)} id={props.toolCallId} /></>;
    if (r.status === "outside-coverage") return <p className={styles.failed} data-card="count-outside">{outsideCoverage(r)} <OpenLink code={r.code} onOpen={onOpen} /></p>;
    if (r.status === "unavailable") return <p className={styles.failed}>The City&apos;s data didn&apos;t respond. Try again shortly.</p>;
    if (r.status === "not-live") return <p className={styles.failed}>{r.name} can&apos;t be counted live.{r.note ? ` ${r.note}` : ""} <OpenLink code={r.code} onOpen={onOpen} /></p>;
    if (r.status === "busy") return <p className={styles.failed}>City counts are busy for your account; try again shortly.</p>;
    if (r.status === "no-neighborhood") return <><p className={styles.failed} data-card="count-no-neighborhood">No City neighborhood is called &ldquo;{r.asked}&rdquo;.{r.nearest.length ? ` Nearest: ${r.nearest.join(", ")}.` : ""}</p><FollowUps pick items={countChoices(props.parameters as never, r as never)} id={props.toolCallId} /></>;
    if (r.status === "no-locations") return <p className={styles.failed}>{r.name} doesn&apos;t record locations, so it can&apos;t be counted by neighborhood. <OpenLink code={r.code} onOpen={onOpen} /></p>;
    if (r.status === "no-number-filter") return <p className={styles.failed}>Totals can&apos;t be limited to a range of {r.column} yet. Ask without &ldquo;over&rdquo; or &ldquo;under&rdquo;, or count the records instead.</p>;
    if (r.status === "too-broad") return <p className={styles.failed}>Too many {r.name} records{r.area ? ` in ${r.area}` : ""} to count at once; try a shorter period or a filter.</p>;
    // choose / bad-column offer the server's options to pick; bad-dates / not-found / not-city have none (the model asks or retries).
    return <FollowUps pick items={refusalChoicesFor(props.parameters as never, r as never)} id={props.toolCallId} />;
  } }, [onOpen]);

  useRenderTool({ name: "timeSpan", parameters: spanParams, render: (props) => {
    if (props.status !== "complete") return <Busy />;
    const r = parse<SpanResult>(props.result);
    if (!r) return <Failed />;
    if (r.status === "ok") return <><ShareScope tool="timeSpan" args={props.parameters}><SpanCard r={r} onOpen={onOpen} /></ShareScope><FollowUps items={spanFollowUps(props.parameters as never, r)} id={props.toolCallId} /></>;
    if (r.status === "unavailable") return <p className={styles.failed}>The City&apos;s data didn&apos;t respond. Try again shortly.</p>;
    if (r.status === "too-broad") return <p className={styles.failed}>Too many {r.name} records to measure at once; try a shorter period.</p>;
    if (r.status === "busy") return <p className={styles.failed}>City questions are busy for your account; try again shortly.</p>;
    if (r.status === "private") return <p className={styles.failed} data-card="span-private">{r.reason}</p>;
    if (r.status === "outside-coverage") return <p className={styles.failed}>{r.name}: the City&apos;s data here covers {r.coverage}, so there is nothing to measure for that period. <OpenLink code={r.code} onOpen={onOpen} /></p>;
    // no-pair, not-found, not-city and not-live are said by the model; the rest offer their options to pick.
    return <FollowUps pick items={spanChoices(props.parameters as never, r as never)} id={props.toolCallId} />;
  } }, [onOpen]);

  // The three tract tools: the model handles refusals in words; only an unreachable DYCU gets a line of its own.
  const tractCard = <T extends { status: string }>(result: unknown, id: string | undefined, card: (r: Extract<T, { status: "ok" }>) => ReactElement, next: (r: Extract<T, { status: "ok" }>) => FollowUp[], choices: (r: T) => FollowUp[]): ReactElement | null => {
    const r = parse<T>(result);
    if (!r) return <Failed />;
    if (r.status === "unavailable") return <p className={styles.source}>DYCU&apos;s data didn&apos;t respond. Try again shortly.</p>;
    if (r.status === "busy") return <p className={styles.failed}>Tract analyses are busy for your account; try again shortly.</p>;
    if (r.status === "ok") return <>{card(r as Extract<T, { status: "ok" }>)}<FollowUps items={next(r as Extract<T, { status: "ok" }>)} id={id} /></>;
    if (r.status === "no-tracts") return <p className={styles.failed} data-card="tract-no-tracts">{noTractsText(r as never)}</p>;
    if (r.status === "too-few-tracts") return <><p className={styles.failed} data-card="tract-too-few">{tooFewText(r as never)}</p><FollowUps pick items={choices(r)} id={id} /></>;
    // A refusal the model words; its listed options (columns, place/years) can be picked here.
    return <FollowUps pick items={choices(r)} id={id} />;
  };
  useRenderTool({ name: "rankTracts", parameters: rankParams, render: (props) => props.status !== "complete" ? <Busy /> : tractCard<RankResult>(props.result, props.toolCallId, (r) => <ShareScope tool="rankTracts" args={props.parameters}><RankCard r={r} onOpen={onOpen} /></ShareScope>, (r) => areaFollowUps(rankFollowUps(r.header, r.direction), r.area), (r) => rankChoices(props.parameters as never, r as never)) }, [onOpen]);
  useRenderTool({ name: "compareYears", parameters: changeParams, render: (props) => props.status !== "complete" ? <Busy /> : tractCard<ChangeResult>(props.result, props.toolCallId, (r) => <ShareScope tool="compareYears" args={props.parameters}><ChangeCard r={r} onOpen={onOpen} /></ShareScope>, (r) => areaFollowUps(changeFollowUps(r.header, r.to), r.area), (r) => changeChoices(props.parameters as never, r as never)) }, [onOpen]);
  useRenderTool({ name: "relateTracts", parameters: relateParams, render: (props) => props.status !== "complete" ? <Busy /> : tractCard<RelateResult>(props.result, props.toolCallId, (r) => <ShareScope tool="relateTracts" args={props.parameters}><RelateCard r={r} onOpen={onOpen} /></ShareScope>, (r) => areaFollowUps(relateFollowUps({ mode: r.mode, a: r.a, b: r.b, place: (props.parameters as { place: string }).place, year: (props.parameters as { year: string }).year, strength: r.strength, aSide: r.aSide, bSide: r.bSide }), r.area), (r) => relateChoices(props.parameters as never, r as never)) }, [onOpen]);

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
            <ExportBar copy={(ctx) => quoteText(p, ctx)} />
          </figure>
        ))}
        {r.passages.length > 0 && <div className={styles.exportBar}><ShareLink tool="readReport" args={props.parameters} /></div>}
      </>
    );
  } }, [onOpen]);

  return null;
}
