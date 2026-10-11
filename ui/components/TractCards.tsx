"use client";
import { useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import type { ChangeAnswer, Header, Point, RankDetail, RelateAnswer, RelateDetail, TractRow } from "@/convex/tracts";
import { changeText, isPercent, plainMeaning, rangeText, scatterLabel } from "@/ui/lib/tractFormat";
import { scales } from "@/ui/lib/tractScatter";
import { capTractIds } from "@/ui/lib/tractShapes";
import { CityMap } from "./CityMapLoader";
import { OpenLink, type Open } from "./OpenLink";
import { ProvenanceTag } from "./ProvenanceTag";
import styles from "./ask.module.css";

// Ask's three tract cards (spec §7). The tool result is the model's slim copy (<= 10 rows per list, plus totals); the
// card reads the full lists, header url/caveats, ids and points from tractDetail by key, and shows the totals meanwhile.

const range = (r: { value: number; lo: number | null; hi: number | null }, pct: boolean) => {
  const t = rangeText(r, pct);
  return t.span ? <>{t.value} <span className={styles.tractNb}>{t.span}</span></> : t.value;
};
const KIND = { rate: "a rate", count: "a count", value: "a value" } as const;
const STRENGTH = { little: "Little relationship", weak: "Weakly related", moderate: "Moderately related", strong: "Strongly related", "too-few": "Too few tracts to say (fewer than 20 matched)." } as const;
const TOO_FEW = STRENGTH["too-few"];

export type RankShown = RankDetail;
export type ChangeShown = ChangeAnswer;
export type RelateShown = RelateAnswer;

// The cached full answer for this card; `expired` once its ten minutes are up.
function useDetail(key: string) {
  const [now] = useState(() => Date.now());
  const d = useQuery(api.tracts.tractDetail, { key, now });
  return { detail: d && d.status === "ok" ? d : null, expired: d?.status === "expired", loading: d === undefined };
}

function Head({ h, title }: { h: Header | Omit<Header, "caveats" | "url">; title: string }) {
  return (
    <>
      <p className={styles.tractHead}>{title}</p>
      <p className={styles.tractMeta}>
        {h.code} <b>{h.column}</b> ({plainMeaning(h.meaning) || "no definition in the column guide"}, {KIND[h.kind]}) · {h.place} {h.year} · {h.n} tracts{h.leftOut ? `, ${h.leftOut} left out (no data)` : ""} <ProvenanceTag source="DYCU" />
      </p>
    </>
  );
}

function Fine({ heads, causal, lead, onOpen }: { heads: { code: string; confidence: string | null }[]; causal?: boolean; lead?: string; onOpen: Open }) {
  const levels = [...new Set(heads.map((h) => h.confidence ?? "no margin of error published"))];
  const bare = heads.some((h) => !h.confidence); // spec §5 rule 7
  return (
    <p className={styles.tractFine}>
      {lead && `${lead} `}Ranges: {levels.join("; ")}.{bare && " Without published ranges, findings can't be separated from noise."}{causal && " Related doesn't mean one causes the other."} Caveats:{" "}
      {heads.map((h, i) => <span key={h.code}>{i > 0 && " \u00b7 "}<OpenLink code={h.code} onOpen={onOpen} label={h.code} /></span>)}
    </p>
  );
}

const Table = ({ head, children }: { head: string[]; children: React.ReactNode }) => (
  <div className={styles.tractScroll} tabIndex={0} role="region" aria-label="Table, scroll sideways for more">
    <table className={styles.tractTable}>
      <thead><tr>{head.map((h, i) => <th key={i} scope="col">{h}</th>)}</tr></thead>
      <tbody>{children}</tbody>
    </table>
  </div>
);

// The highlighted tracts, hatched, on the map; near-misses outlined. The ids and url come from tractDetail, so the slot
// stays empty (and hidden) until the full answer arrives, and when nothing is highlighted.
function MapSlot({ url, fits, close = [] }: { url?: string; fits?: string[]; close?: string[] }) {
  const shown = url && fits?.length ? capTractIds(fits, close) : null;
  return (
    <div className={styles.tractMap} data-tract-map>
      {url && shown && (
        <>
          <CityMap tracts={{ url, fits: shown.fits, close: shown.close }} height={220} />
          {shown.capped && <p className={styles.tractCounts}>Showing the first 50 tracts on the map.</p>}
        </>
      )}
    </div>
  );
}

const TIES_INLINE = 5;

export function RankCard({ r, onOpen }: { r: RankShown; onOpen: Open }) {
  const { detail } = useDetail(r.key);
  const full = detail?.tool === "rank" ? detail : null;
  const h = full?.header ?? r.header;
  const pct = isPercent(h.meaning);
  const ties = full?.ties ?? r.ties;
  const unreliable = full?.unreliable ?? r.unreliable;
  const folded = ties.slice(TIES_INLINE);
  const foldedCount = r.tieCount - TIES_INLINE; // from the total, never the list
  const tieRow = (t: TractRow) => (
    <tr key={t.geoid} className={styles.tractTie}><td>=</td><td>{t.tract}</td><td>{t.neighborhood ?? "\u2014"} (within range of #10)</td><td className={styles.num}>{range(t, pct)}</td></tr>
  );
  const head = ["#", "Tract", "Neighborhood", h.column];
  return (
    <div className={`${styles.reference} ${styles.tractCard}`} data-card="tract-rank">
      <Head h={h} title={`${r.direction === "high" ? "Highest" : "Lowest"} ${h.column} \u00b7 ${h.place} ${h.year}`} />
      <Table head={head}>
        {r.top.map((t, i) => (
          <tr key={t.geoid}><td>{i + 1}</td><td>{t.tract}</td><td>{t.neighborhood ?? "\u2014"}</td><td className={styles.num}>{range(t, pct)}</td></tr>
        ))}
        {ties.slice(0, TIES_INLINE).map(tieRow)}
      </Table>
      {foldedCount > 0 && (
        <details className={styles.tractMore} data-ties>
          <summary>{foldedCount} more within range of #10</summary>
          <Table head={head}>{folded.map(tieRow)}</Table>
          {folded.length < foldedCount && <p className={styles.tractCounts}>{foldedCount - folded.length} more not listed.</p>}
        </details>
      )}
      {r.unreliableCount > 0 && (
        <details className={styles.tractMore}>
          <summary>{r.unreliableCount} unreliable: range too wide</summary>
          <Table head={head}>
            {unreliable.map((t) => (
              <tr key={t.geoid} className={styles.tractUnreliable}><td>{"\u2013"}</td><td>{t.tract}</td><td>{t.neighborhood ?? "\u2014"} (unreliable: range too wide)</td><td className={styles.num}>{range(t, pct)}</td></tr>
            ))}
          </Table>
          {r.unreliableCount > unreliable.length && <p className={styles.tractCounts}>{r.unreliableCount - unreliable.length} more not listed.</p>}
        </details>
      )}
      <MapSlot url={full?.header.url} fits={full?.highlighted} />
      <Fine heads={[h]} onOpen={onOpen} />
    </div>
  );
}

export function ChangeCard({ r, onOpen }: { r: ChangeShown; onOpen: Open }) {
  const { detail } = useDetail(r.key);
  const full = detail?.tool === "change" ? detail : null;
  const h = full?.header ?? r.header;
  const pct = isPercent(h.meaning);
  const changes = full?.changes ?? r.changes;
  return (
    <div className={`${styles.reference} ${styles.tractCard}`} data-card="tract-change">
      <Head h={h} title={`${h.column} \u00b7 ${h.place} ${r.from} \u2192 ${r.to}`} />
      <p className={styles.tractCounts}>
        <b>{r.increases} clear increases · {r.decreases} clear decreases · {r.none} no clear change</b>
        {r.unreliableCount > 0 && ` · ${r.unreliableCount} not compared (range too wide)`}
      </p>
      {changes.length > 0 ? (
        <Table head={["Tract", "Neighborhood", r.from, r.to, "Change"]}>
          {changes.map((c) => (
            <tr key={c.geoid}>
              <td>{c.tract}</td><td>{c.neighborhood ?? "\u2014"}</td>
              <td className={styles.num}>{range(c.from, pct)}</td><td className={styles.num}>{range(c.to, pct)}</td>
              <td className={styles.num}>{changeText(c.change, c.direction, pct)}</td>
            </tr>
          ))}
        </Table>
      ) : (
        <p className={styles.tractCounts}>No tract changed clearly.</p>
      )}
      {r.changeCount > changes.length && <p className={styles.tractCounts}>Showing the largest {changes.length} of {r.changeCount} clear changes.</p>}
      <MapSlot url={full?.header.url} fits={full?.highlighted} />
      <Fine heads={[h]} onOpen={onOpen} />
    </div>
  );
}

const W = 300, H = 220, PAD = 24;

function Scatter({ points, cutA, cutB, aSide, bSide, a, b, fits, close }: { points: Point[]; cutA?: number; cutB?: number; aSide?: "high" | "low"; bSide?: "high" | "low"; a: { code: string; column: string }; b: { code: string; column: string }; fits: number; close: number }) {
  const s = scales(points, W, H, PAD);
  const bar = (p: Point, cls?: string) => [
    p.a[1] !== null && p.a[2] !== null && <line key="x" className={cls} x1={s.x(p.a[1])} x2={s.x(p.a[2])} y1={s.y(p.b[0])} y2={s.y(p.b[0])} />,
    p.b[1] !== null && p.b[2] !== null && <line key="y" className={cls} x1={s.x(p.a[0])} x2={s.x(p.a[0])} y1={s.y(p.b[1])} y2={s.y(p.b[2])} />,
  ];
  const mismatch = cutA !== undefined && cutB !== undefined;
  const label = scatterLabel(points.length, a, b, mismatch ? { fits, close } : undefined);
  const plain = points.filter((p) => !p.mark);
  return (
    <svg className={styles.tractScatter} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      <rect className={styles.tractFrame} x={PAD} y={PAD} width={W - 2 * PAD} height={H - 2 * PAD} />
      {mismatch && (
        <>
          <line className={styles.tractCut} x1={s.x(cutA)} x2={s.x(cutA)} y1={PAD} y2={H - PAD} />
          <line className={styles.tractCut} x1={PAD} x2={W - PAD} y1={s.y(cutB)} y2={s.y(cutB)} />
          <text className={styles.tractSvgText} x={s.x(cutA) + (aSide === "low" ? -3 : 3)} y={PAD + 10} textAnchor={aSide === "low" ? "end" : "start"}>
            {aSide === "low" ? "← bottom" : "top"} third {a.column}{aSide === "low" ? "" : " →"}
          </text>
          <text className={styles.tractSvgText} x={W - PAD - 3} y={s.y(cutB) + (bSide === "low" ? 10 : -3)} textAnchor="end">
            {bSide === "low" ? "\u2193 bottom" : "\u2191 top"} third {b.column}
          </text>
        </>
      )}
      {plain.map((p) => (p.unreliable
        ? <circle key={p.geoid} className={styles.tractFaint} cx={s.x(p.a[0])} cy={s.y(p.b[0])} r={2} />
        : <g key={p.geoid}><g className={styles.tractBars}>{bar(p)}</g><circle className={styles.tractDot} cx={s.x(p.a[0])} cy={s.y(p.b[0])} r={2.5} /></g>))}
      {points.filter((p) => p.mark).map((p) => (
        <g key={p.geoid}>
          <g className={styles.tractBarsInk}>{bar(p)}</g>
          <circle className={p.mark === "fits" ? styles.tractFit : styles.tractClose} cx={s.x(p.a[0])} cy={s.y(p.b[0])} r={4.5} />
        </g>
      ))}
      <text className={styles.tractSvgText} x={PAD} y={H - 6}>{a.column} ({a.code}) {"→"}</text>
      <text className={styles.tractSvgText} x={10} y={PAD} transform={`rotate(90 10 ${PAD})`}>{b.column} ({b.code}) {"→"}</text>
    </svg>
  );
}

const Legend = () => (
  <ul className={styles.tractLegend}>
    <li><span className={`${styles.tractSw} ${styles.tractSwFit}`} />clearly fits (range clears both cutoffs)</li>
    <li><span className={`${styles.tractSw} ${styles.tractSwClose}`} />close, not clear</li>
    <li><span className={`${styles.tractSw} ${styles.tractSwDot}`} />other tracts</li>
  </ul>
);

export function RelateCard({ r, onOpen }: { r: RelateShown; onOpen: Open }) {
  const { detail, expired } = useDetail(r.key);
  const full: RelateDetail | null = detail?.tool === "relate" ? detail : null;
  const a = full?.a ?? r.a, b = full?.b ?? r.b;
  const fits = full?.fits ?? r.fits, close = full?.close ?? r.close;
  const points = full?.points ?? [];
  const pa = isPercent(a.meaning), pb = isPercent(b.meaning);
  const mismatch = r.mode === "mismatch";
  const gated = mismatch && r.cutA === undefined; // fewer than 20 reliable pairs: no cutoffs were drawn
  const side = (s?: "high" | "low") => (s === "low" ? "bottom" : "top");
  return (
    <div className={`${styles.reference} ${styles.tractCard}`} data-card="tract-relate">
      <Head h={a} title={`${a.name} vs. ${b.name}`} />
      <p className={styles.tractMeta}>
        {b.code} <b>{b.column}</b> ({plainMeaning(b.meaning) || "no definition in the column guide"}, {KIND[b.kind]}) · {b.place} {b.year} <ProvenanceTag source="DYCU" />
      </p>
      {!mismatch && (
        <>
          <p className={styles.tractVerdict}>{STRENGTH[r.strength]}</p>
          {r.strength !== "too-few" && r.strength !== "little" && (
            <p className={styles.tractCounts}>{b.column} is {r.direction} where {a.column} is higher · {"ρ"} = {r.rho.toFixed(2)}, {r.n} tracts</p>
          )}
          {r.strength === "little" && <p className={styles.tractCounts}>{"ρ"} = {r.rho.toFixed(2)}, {r.n} tracts</p>}
        </>
      )}
      {mismatch && (
        <p className={styles.tractVerdict}>
          {gated ? TOO_FEW : r.fitsCount === 0 ? `No tract clearly fits; ${r.closeCount} come close.` : `${r.fitsCount} clearly ${r.fitsCount === 1 ? "fits" : "fit"}; ${r.closeCount} come close, not clear.`}
        </p>
      )}
      {mismatch && !gated && <p className={styles.tractCounts}>Among {r.n} tracts with reliable figures.</p>}
      {r.unreliableCount > 0 && <p className={styles.tractCounts}>{r.unreliableCount} tracts have a range too wide to count (shown faint).</p>}
      {expired ? (
        <p className={styles.tractCounts}>This answer has expired; ask again.</p>
      ) : points.length ? (
        <>
          <Scatter points={points} cutA={r.cutA} cutB={r.cutB} aSide={r.aSide} bSide={r.bSide} a={a} b={b} fits={r.fitsCount} close={r.closeCount} />
          {mismatch && !gated && <Legend />}
        </>
      ) : (
        <p className={styles.busy} aria-busy="true">Drawing the plot…</p>
      )}
      {fits.length + close.length > 0 && (
        <Table head={["Tract", "Neighborhood", a.column, b.column, ""]}>
          {fits.map((p) => <PairRow key={p.a.geoid} p={p} pa={pa} pb={pb} label="clearly fits" />)}
          {close.map((p) => <PairRow key={p.a.geoid} p={p} pa={pa} pb={pb} label="close, not clear" tie />)}
        </Table>
      )}
      {(r.fitsCount > fits.length || r.closeCount > close.length) && (
        <p className={styles.tractCounts}>Showing {fits.length} of {r.fitsCount} that clearly fit and {close.length} of {r.closeCount} that come close.</p>
      )}
      <MapSlot url={full?.a.url} fits={full?.highlighted} close={full?.closeIds} />
      <Fine
        heads={[a, b]}
        causal
        onOpen={onOpen}
        lead={mismatch && !gated ? `Cutoffs: ${side(r.aSide)} third on ${a.column}, ${side(r.bSide)} third on ${b.column}.` : undefined}
      />
    </div>
  );
}

function PairRow({ p, pa, pb, label, tie }: { p: { a: TractRow; b: TractRow }; pa: boolean; pb: boolean; label: string; tie?: boolean }) {
  return (
    <tr className={tie ? styles.tractTie : undefined}>
      <td>{p.a.tract}</td><td>{p.a.neighborhood ?? "—"}</td>
      <td className={styles.num}>{range(p.a, pa)}</td><td className={styles.num}>{range(p.b, pb)}</td><td>{label}</td>
    </tr>
  );
}
