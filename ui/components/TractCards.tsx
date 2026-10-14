"use client";
import { useQuery } from "convex/react";
import { type ReactNode, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { CityShare } from "@/convex/lib/tractPlaces";
import type { AreaHead } from "@/convex/lib/tractsIn";
import { areaLine, cityRankText, rankColumn, shareText } from "@/ui/lib/tractArea";
import type { ChangeAnswer, Header, RankDetail, RelateAnswer, RelateDetail, TractRow } from "@/convex/tracts";
import { cityList, dycuText, placesLabel } from "@/ui/lib/placeNames";
import { changeText, plainMeaning, rangeText, unitOf, type Unit } from "@/ui/lib/tractFormat";
import { EXACT, fineText, KIND } from "@/ui/lib/tractSummary";
import { capTractIds, MAX_TRACT_SHAPES } from "@/ui/lib/tractShapes";
import { changeExport, rankExport, relateExport } from "@/ui/lib/cardExport";
import { BARE_RANK, changeCardText, changeHead, rankCardText, rankHead, relateCardText, relateHead, TIES_INLINE } from "@/ui/lib/tractCardText";
import { BigView } from "./BigView";
import { CityMap } from "./CityMapLoader";
import { ExportBar } from "./ExportBar";
import { OpenLink, type Open } from "./OpenLink";
import { ProvenanceTag } from "./ProvenanceTag";
import { TractLegend, TractScatter } from "./TractScatter";
import styles from "./ask.module.css";

// Ask's three tract cards (spec §7). The tool result is the model's slim copy (<= 10 rows per list, plus totals); the
// card reads the full lists, header url/caveats, ids and points from tractDetail by key, and shows the totals meanwhile.
// Each card leads with one plain sentence that code writes from the verdict (ui/lib/tractSummary.ts, decision 028);
// EXPAND opens its plot, map and table at full size (BigView).

const range = (r: { value: number; lo: number | null; hi: number | null }, pct: Unit) => {
  const t = rangeText(r, pct);
  return t.span ? <>{t.value} <span className={styles.tractNb}>{t.span}</span></> : t.value;
};

export type RankShown = RankDetail;
export type ChangeShown = ChangeAnswer;
export type RelateShown = RelateAnswer;

// The cached full answer for this card; `expired` once its day is up. The first full answer is kept, so a later expiry
// never blanks a card already drawn.
function useDetail(key: string) {
  const [now] = useState(() => Date.now());
  const d = useQuery(api.tracts.tractDetail, { key, now });
  const [kept, setKept] = useState<typeof d | null>(null);
  if (d?.status === "ok" && kept === null) setKept(d);
  const detail = kept?.status === "ok" ? kept : d?.status === "ok" ? d : null;
  return { detail, expired: !detail && d?.status === "expired", loading: d === undefined };
}

// The property side is the City's own file; every other side is DYCU's.
const sourceOf = (h: { confidence: string | null }) => (h.confidence === EXACT ? "CITY" : "DYCU");

function Head({ h, title, summary, expand }: { h: Header | Omit<Header, "caveats" | "url">; title: string; summary: string; expand?: ReactNode }) {
  return (
    <>
      <div className={styles.tractTop}>
        <p className={styles.tractHead}>{title}</p>
        {expand}
      </div>
      <p className={styles.tractSummary} data-summary>{summary}</p>
      <p className={styles.tractMeta}>
        {h.code} <b>{h.column}</b> ({plainMeaning(h.meaning) || "no definition in the column guide"}, {KIND[h.kind]}) · {h.place} {h.year} · {h.n} census tracts{h.leftOut ? `, ${h.leftOut} left out (${h.leftOutWhy ?? "no data"})` : ""} <ProvenanceTag source={sourceOf(h)} />
      </p>
    </>
  );
}

// What a census tract is and how the card decided, folded away for whoever wants it.
const TRACT = "A census tract is a small area, usually 1,200 to 8,000 people, that the Census Bureau reports on. Most of these figures are survey estimates, so each comes with a range, its margin of error: the true value is probably inside it.";
const HowToRead = ({ children }: { children: string }) => (
  <details className={styles.tractMore} data-how>
    <summary>How to read this</summary>
    <p className={styles.tractCounts}>{TRACT} {children}</p>
  </details>
);

function Fine({ heads, causal, lead, onOpen }: { heads: { code: string; column: string; confidence: string | null }[]; causal?: boolean; lead?: string; onOpen: Open }) {
  return (
    <p className={styles.tractFine}>
      {fineText(heads, { causal, lead })}{" "}
      {/* A new tab, so the conversation stays where it is. */}
      <a href={NEIGHBORHOODS_HELP} target="_blank" rel="noopener">How neighborhoods work</a>. Caveats:{" "}
      {heads.map((h, i) => <span key={h.code}>{i > 0 && " \u00b7 "}<OpenLink code={h.code} onOpen={onOpen} label={h.code} /></span>)}
    </p>
  );
}

export const NEIGHBORHOODS_HELP = "/how-it-works#neighborhoods";

const Table = ({ head, title, children }: { head: string[]; title: string; children: React.ReactNode }) => (
  <div className={styles.tractScroll} tabIndex={0} role="region" aria-label={`${title}, scroll sideways for more`}>
    <table className={styles.tractTable}>
      <thead><tr>{head.map((h, i) => <th key={i} scope="col">{h}</th>)}</tr></thead>
      <tbody>{children}</tbody>
    </table>
  </div>
);

// The highlighted tracts, hatched, on the map; near-misses outlined. The ids and url come from tractDetail, so the slot
// stays empty (and hidden) until the full answer arrives, and when there is neither a highlighted nor a close tract.
const BIG_MAP = "min(62vh, 560px)";
function MapSlot({ url, fits, close = [], height = 220 }: { url?: string; fits?: string[]; close?: string[]; height?: number | string }) {
  const shown = url && (fits?.length || close.length) ? capTractIds(fits ?? [], close) : null;
  return (
    <div className={styles.tractMap} data-tract-map>
      {url && shown && (
        <>
          <CityMap tracts={{ url, fits: shown.fits, close: shown.close }} height={height} />
          {shown.capped && <p className={styles.tractCounts}>Showing the first {MAX_TRACT_SHAPES} tracts on the map.</p>}
        </>
      )}
    </div>
  );
}
export { MapSlot as TractMapSlot };

// The City neighborhood covering most of the tract; the rest, with shares, behind "+N" (a native disclosure: click,
// Enter or Space opens it). A card cached before tracts carried a City list shows "—".
function Places({ city }: { city?: CityShare[] }) {
  if (!city?.length) return <>{"\u2014"}</>;
  if (city.length === 1) return <>{city[0].name}</>;
  return (
    <details className={styles.places} data-places>
      <summary aria-label={placesLabel(city)}>{city[0].name} <span className={styles.placesMore}>+{city.length - 1}</span></summary>
      {cityList(city)}
    </details>
  );
}

// A tract's City neighborhoods, plus how much of it is in the card's neighborhood when the card is limited to one.
function Where({ t, area }: { t: { city: CityShare[]; share?: number }; area?: AreaHead }) {
  return <><Places city={t.city} />{area && t.share !== undefined && t.share < 100 && <span className={styles.tractShare}>{shareText(t.share, area.name)}</span>}</>;
}
const AreaLine = ({ area }: { area?: AreaHead }) => (area ? <p className={styles.tractMeta} data-area>{areaLine(area)}</p> : null);

export function RankCard({ r, onOpen }: { r: RankShown; onOpen: Open }) {
  const { detail, expired } = useDetail(r.key);
  const full = detail?.tool === "rank" ? detail : null;
  const h = full?.header ?? r.header;
  const pct = unitOf(h.meaning);
  const ties = full?.ties ?? r.ties;
  const unreliable = full?.unreliable ?? r.unreliable;
  const folded = ties.slice(TIES_INLINE);
  const foldedCount = r.tieCount - TIES_INLINE; // from the total, never the list
  const exact = h.confidence === EXACT; // exact City figures tie only when equal; there is no margin
  const tieRow = (t: TractRow) => (
    <tr key={t.geoid} className={styles.tractTie}><td>=</td><td>{t.tract}</td><td><Where t={t} area={area} /></td><td>{dycuText(t.dycu)} ({exact ? `same figure as #${r.top.length}` : `tied with #${r.top.length} within the margin of error`})</td><td className={styles.num}>{range(t, pct)}</td>{area && <td>{t.cityRank ? cityRankText(t.cityRank, r.direction) : "\u2014"}</td>}</tr>
  );
  const area = full?.area ?? r.area;
  const head = ["#", "Tract", "Neighborhood", "DYCU area", h.column, ...(area ? [rankColumn(h.place)] : [])];
  const { title, summary, bare } = rankHead({ ...r, header: h, area });
  const table = (
    <Table head={head} title={title}>
      {r.top.map((t, i) => (
        <tr key={t.geoid}><td>{i + 1}</td><td>{t.tract}</td><td><Where t={t} area={area} /></td><td>{dycuText(t.dycu)}</td><td className={styles.num}>{range(t, pct)}</td>{area && <td>{t.cityRank ? cityRankText(t.cityRank, r.direction) : "\u2014"}</td>}</tr>
      ))}
      {ties.slice(0, TIES_INLINE).map(tieRow)}
    </Table>
  );
  const expand = full && (
    <BigView title={title}>
      {() => (
        <>
          <p className={styles.tractSummary}>{summary}</p>
          <div className={styles.bigGrid}>
            <MapSlot url={full.header.url} fits={full.highlighted} height={BIG_MAP} />
            <div>{table}</div>
          </div>
        </>
      )}
    </BigView>
  );
  return (
    <div className={`${styles.reference} ${styles.tractCard}`} data-card="tract-rank">
      <Head h={h} title={title} summary={summary} expand={expand} />
      <AreaLine area={area} />
      {table}
      {bare && <p className={styles.tractCounts}>{BARE_RANK}</p>}
      {!bare && foldedCount > 0 && (
        <details className={styles.tractMore} data-ties>
          <summary>{exact ? `${foldedCount} more with the same figure as #${r.top.length}` : `${foldedCount} more tied with #${r.top.length} (within the margin of error)`}</summary>
          <Table head={head} title={`${title}: more tied with #${r.top.length}`}>{folded.map(tieRow)}</Table>
          {folded.length < foldedCount && <p className={styles.tractCounts}>{foldedCount - folded.length} more not listed.</p>}
        </details>
      )}
      {!bare && r.unreliableCount > 0 && (
        <details className={styles.tractMore}>
          <summary>{r.unreliableCount} too uncertain to rank</summary>
          <Table head={head} title={`${title}: too uncertain to rank`}>
            {unreliable.map((t) => (
              <tr key={t.geoid} className={styles.tractUnreliable}><td>{"\u2013"}</td><td>{t.tract}</td><td><Where t={t} area={area} /></td><td>{dycuText(t.dycu)} (too uncertain: margin of error too wide)</td><td className={styles.num}>{range(t, pct)}</td>{area && <td>{t.cityRank ? cityRankText(t.cityRank, r.direction) : "\u2014"}</td>}</tr>
            ))}
          </Table>
          {r.unreliableCount > unreliable.length && <p className={styles.tractCounts}>{r.unreliableCount - unreliable.length} more not listed.</p>}
        </details>
      )}
      <MapSlot url={full?.header.url} fits={full?.highlighted} />
      <HowToRead>
        {exact ? `Tracts with exactly the same figure as #${r.top.length} are listed beside it.` : `Tracts whose range overlaps the range of #${r.top.length} could really be #${r.top.length}, so they're listed as tied with it. A tract whose margin of error is large next to its estimate is too uncertain to rank, so it's left out of the list.`}
      </HowToRead>
      <Fine heads={[h]} onOpen={onOpen} />
      <ExportBar expired={expired} make={full && ((ctx) => rankExport(full, rankCardText(full), ctx))} />
    </div>
  );
}

export function ChangeCard({ r, onOpen }: { r: ChangeShown; onOpen: Open }) {
  const { detail, expired } = useDetail(r.key);
  const full = detail?.tool === "change" ? detail : null;
  const h = full?.header ?? r.header;
  const pct = unitOf(h.meaning);
  const changes = full?.changes ?? r.changes;
  const area = full?.area ?? r.area;
  const { title, summary, counts, bare } = changeHead({ ...r, header: h, area });
  const table = changes.length > 0 && (
    <Table head={["Tract", "Neighborhood", "DYCU area", r.from, r.to, "Change"]} title={title}>
      {changes.map((c) => (
        <tr key={c.geoid}>
          <td>{c.tract}</td><td><Where t={c} area={area} /></td><td>{dycuText(c.dycu)}</td>
          <td className={styles.num}>{range(c.from, pct)}</td><td className={styles.num}>{range(c.to, pct)}</td>
          <td className={styles.num}>{changeText(c.change, c.direction, pct)}</td>
        </tr>
      ))}
    </Table>
  );
  const expand = full && full.highlighted.length > 0 && (
    <BigView title={title}>
      {() => (
        <>
          <p className={styles.tractSummary}>{summary}</p>
          <div className={styles.bigGrid}>
            <MapSlot url={full.header.url} fits={full.highlighted} height={BIG_MAP} />
            <div>{table}</div>
          </div>
        </>
      )}
    </BigView>
  );
  return (
    <div className={`${styles.reference} ${styles.tractCard}`} data-card="tract-change">
      <Head h={h} title={title} summary={summary} expand={expand} />
      <AreaLine area={area} />
      {bare ? (
        <p className={styles.tractCounts}><b>Can't tell which tracts changed clearly: {bare}.</b></p>
      ) : (
        <p className={styles.tractCounts}>
          <b>{r.increases} clear increases · {r.decreases} clear decreases · {r.none} no clear change</b>
          {r.unreliableCount > 0 && ` · ${r.unreliableCount} not compared (too uncertain)`}
        </p>
      )}
      {r.note && <p className={styles.tractCounts}>{r.note}</p>}
      {table || (
        !bare && <p className={styles.tractCounts}>No tract changed clearly.</p>
      )}
      {r.changeCount > changes.length && <p className={styles.tractCounts}>Showing the largest {changes.length} of {r.changeCount} clear changes.</p>}
      <MapSlot url={full?.header.url} fits={full?.highlighted} />
      <HowToRead>
        {"A change counts as clear only when it is bigger than both years' margins of error combined, the Census Bureau's test. A smaller change could be survey noise, so it isn't listed."}
      </HowToRead>
      <Fine heads={[h]} onOpen={onOpen} />
      <ExportBar expired={expired} make={full && ((ctx) => changeExport(full, changeCardText(full), ctx))} />
    </div>
  );
}

export function RelateCard({ r, onOpen }: { r: RelateShown; onOpen: Open }) {
  const { detail, expired } = useDetail(r.key);
  const full: RelateDetail | null = detail?.tool === "relate" ? detail : null;
  const a = full?.a ?? r.a, b = full?.b ?? r.b;
  const fits = full?.fits ?? r.fits, close = full?.close ?? r.close;
  const points = full?.points ?? [];
  const pa = unitOf(a.meaning), pb = unitOf(b.meaning);
  const area = full?.area ?? r.area;
  const { title, summary, verdict, lead, mismatch, gated, bare } = relateHead({ ...r, a, b, area });
  const plot = (big?: boolean) => (
    <>
      <TractScatter points={points} cutA={r.cutA} cutB={r.cutB} aSide={r.aSide} bSide={r.bSide} a={a} b={b} counts={bare ? undefined : { fits: r.fitsCount, close: r.closeCount }} big={big} />
      {mismatch && !gated && !bare && <TractLegend />}
    </>
  );
  const table = fits.length + close.length > 0 && (
    <Table head={["Tract", "Neighborhood", "DYCU area", a.column, b.column, ""]} title={title}>
      {fits.map((p) => <PairRow key={p.a.geoid} p={p} pa={pa} pb={pb} label="clear match" area={area} />)}
      {close.map((p) => <PairRow key={p.a.geoid} p={p} pa={pa} pb={pb} label="possible match" tie area={area} />)}
    </Table>
  );
  const expand = full && !expired && points.length > 0 && (
    <BigView title={title}>
      {() => (
        <>
          <p className={styles.tractSummary}>{summary}</p>
          <div className={styles.bigGrid}>
            <div>{plot(true)}</div>
            <MapSlot url={full.a.url} fits={full.highlighted} close={full.closeIds} height={BIG_MAP} />
          </div>
          {table}
        </>
      )}
    </BigView>
  );
  const how = mismatch
    ? "Each measure is split into thirds across the tracts with reliable figures. A clear match is in the third you asked about on both measures, even at the edges of its margin of error. A possible match is there at its estimate, but its margin of error crosses a cutoff (the dashed lines on the plot)."
    : `To see whether two things go together, the tracts are put in order on each measure and the two orders are compared (Spearman's ρ = ${Number.isFinite(r.rho) ? r.rho.toFixed(2) : "not measurable"} across ${r.n} tracts; 1 means the same order, 0 no connection, −1 the opposite order). Below 0.2 is called little relationship, below 0.4 weak, below 0.6 moderate, and 0.6 or more strong.`;
  return (
    <div className={`${styles.reference} ${styles.tractCard}`} data-card="tract-relate">
      <Head h={a} title={title} summary={summary} expand={expand} />
      <AreaLine area={area} />
      <p className={styles.tractMeta}>
        {b.code} <b>{b.column}</b> ({plainMeaning(b.meaning) || "no definition in the column guide"}, {KIND[b.kind]}) · {b.place} {b.year} <ProvenanceTag source={sourceOf(b)} />
      </p>
      <p className={styles.tractVerdict}>
        {verdict}
      </p>
      {r.unreliableCount > 0 && <p className={styles.tractCounts}>{r.unreliableCount} tracts are too uncertain to count (shown faint).</p>}
      {expired ? (
        <p className={styles.tractCounts}>This answer has expired; ask again.</p>
      ) : points.length ? (
        plot()
      ) : (
        <p className={styles.busy} aria-busy="true">Drawing the plot…</p>
      )}
      {table}
      {(r.fitsCount > fits.length || r.closeCount > close.length) && (
        <p className={styles.tractCounts}>Showing {fits.length} of {r.fitsCount} clear matches and {close.length} of {r.closeCount} possible matches.</p>
      )}
      <MapSlot url={full?.a.url} fits={full?.highlighted} close={full?.closeIds} />
      {(mismatch ? !gated : r.strength !== "too-few") && <HowToRead>{how}</HowToRead>}
      <Fine heads={[a, b]} causal onOpen={onOpen} lead={lead} />
      <ExportBar expired={expired} make={full && ((ctx) => relateExport(full, relateCardText(full), ctx))} />
    </div>
  );
}

function PairRow({ p, pa, pb, label, tie, area }: { p: { a: TractRow; b: TractRow }; pa: Unit; pb: Unit; label: string; tie?: boolean; area?: AreaHead }) {
  return (
    <tr className={tie ? styles.tractTie : undefined}>
      <td>{p.a.tract}</td><td><Where t={p.a} area={area} /></td><td>{dycuText(p.a.dycu)}</td>
      <td className={styles.num}>{range(p.a, pa)}</td><td className={styles.num}>{range(p.b, pb)}</td><td>{label}</td>
    </tr>
  );
}
