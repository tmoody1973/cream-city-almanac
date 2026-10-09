"use client";
import { useRenderTool } from "@copilotkit/react-core/v2";
import { Fragment, useEffect } from "react";
import { z } from "zod";
import { passageBlocks } from "@/ui/lib/askPassage";
import { formatPortraitMargin, formatPortraitNumber } from "@/ui/lib/portrait";
import { LivePreview } from "./LivePreview";
import { ProvenanceTag } from "./ProvenanceTag";
import styles from "./ask.module.css";

// Laptop passes onOpen (the pane beside the notes shows the answer); a phone omits it (answers sit in the note).
type Open = ((search: string) => void) | undefined;
type Value = { estimate: string; moe: string | null } | null;
type NumberResult = {
  status: string; code: string; neighborhood: string; place: string; year: number | null; topic: string; slug: string;
  tableIdText: string; label: string; rowIndex: number; values: Value[]; groups: string[]; nearby: { label: string; values: Value[]; marked: boolean }[];
};

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
      href={onOpen ? `/?ask=1&${params}` : `/d/${code}${query ? `?${query}` : ""}`}
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

function NumberCard({ r, onOpen, callKey }: { r: NumberResult; onOpen: Open; callKey: string }) {
  const query = rowQuery(r);
  useOpenOnce(callKey, `open=${r.code}&${query}`, onOpen);
  const title = `${r.neighborhood}, ${r.year ?? "latest"} · ${r.topic}`;
  if (onOpen) {
    // Laptop: the table is open in the pane with this row outlined; the note keeps a reference the leader starts from.
    return (
      <p className={styles.reference} data-card="number">
        {title} · {r.label} <ProvenanceTag source="DYCU" /> <OpenLink code={r.code} query={query} onOpen={onOpen} anchor />
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

function SheetCard({ code, name, onOpen, callKey, preview }: { code: string; name: string; onOpen: Open; callKey: string; preview?: { members: { place: string | null; yearLabel: string | null; featureServerUrl: string | null }[]; fields: string[] } }) {
  useOpenOnce(callKey, `open=${code}`, onOpen);
  return (
    <div className={styles.reference} data-card={preview ? "preview" : "dataset"}>
      <p className={styles.referenceLine}>
        <span className={styles.code}>{code}</span> · {name} {preview && <ProvenanceTag source="HUB" />} <OpenLink code={code} onOpen={onOpen} anchor={Boolean(onOpen)} />
      </p>
      {preview && !onOpen && <LivePreview members={preview.members} fields={preview.fields} chartOnly />}
    </div>
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
    const r = parse<{ status: string; code: string; name: string; members: { place: string | null; yearLabel: string | null; featureServerUrl: string | null }[]; fields: string[] }>(props.result);
    if (!r) return <Failed />;
    if (r.status !== "ok") return null;
    return <SheetCard code={r.code} name={r.name} onOpen={onOpen} callKey={key("previewData", props as never)} preview={{ members: r.members, fields: r.fields }} />;
  } }, [onOpen]);

  useRenderTool({ name: "getNumber", parameters: z.object({ neighborhood: z.string() }), render: (props) => {
    if (props.status !== "complete") return <Busy />;
    const r = parse<NumberResult>(props.result);
    if (!r) return <Failed />;
    if (r.status !== "ok") return null; // the model picks from the choices and calls again
    return <NumberCard r={r} onOpen={onOpen} callKey={key("getNumber", props as never)} />;
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
