"use client";

import Link from "next/link";
import type { Est } from "@/convex/lib/factMath";
import type { Figure, Headline, PortraitTable } from "@/convex/lib/factSheet";
import { BUILT_SOURCE, builtNote, CENSUS_SOURCE, NOT_LOADED, countLine, factSheetExport, margin, MARGIN_NOTE, MISSING, MISSING_BUILT, NO_CITY, NOTE_APPROX, pct, populationNote, portraitCell, smallLine, verdictText } from "@/ui/lib/factText";
import { CreditFooter } from "./CreditFooter";
import { ExportBar } from "./ExportBar";
import { FindPlaceBox } from "./FindPlaceBox";
import { Masthead } from "./Masthead";
import { ProvenanceTag } from "./ProvenanceTag";
import { SiteNav } from "./SiteNav";
import { TractMapSlot } from "./TractCards";
import styles from "./factSheet.module.css";

// A neighborhood fact sheet, built to the approved comp: .impeccable/mocks/fact-sheet-a-{laptop,phone,print}.webp
// ("the ledger"). Every word and number here is written by code from DYCU's portrait and the Census; no AI text.
export type SheetOk = {
  status: "ok"; slug: string; name: string; year: number; years: number[]; period: string;
  headlines: Headline[]; tables: PortraitTable[]; source: { title: string; landingPage: string } | null;
  map: { url: string; geoids: string[] } | null; cityFetchedAt: number | null;
  kind?: "census"; built?: { tracts: number }; loaded?: boolean;
};
export type SheetSmall = { status: "small"; slug: string; name: string; people: number; tracts: { number: string; share: number }[]; map: { url: string; geoids: string[] } | null };

const fetchedOn = (ms: number) => new Date(ms).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/Chicago" });
const estimate = (e: Est | null) => (e ? Math.round(e.estimate).toLocaleString("en-US") : "—");

function Rate({ f, big }: { f: Figure; big?: boolean }) {
  return (
    <>
      <span className={big ? styles.rate : styles.cityRate}>{pct(f.rate)}</span>
      {f.rate?.moe !== null && f.rate?.moe !== undefined && <span className={styles.margin}>{margin(f.rate)}</span>}
    </>
  );
}

// The verdict is printed type; the grease pencil only rings a clear difference (higher) or underlines it (lower).
function Verdict({ h }: { h: Headline }) {
  const words = verdictText(h.verdict);
  if (!words) return <span className={styles.muted}>{h.city ? "" : NO_CITY}</span>;
  const mark = h.verdict === "higher" ? styles.ring : h.verdict === "lower" ? styles.under : "";
  return <span className={`${styles.verdict} ${mark}`}>{words}</span>;
}

function Row({ h, name, missing }: { h: Headline; name: string; missing: string }) {
  return (
    <tr data-fact={h.id}>
      <th scope="row" className={styles.label}>{h.label}<span className={styles.meaning}>{h.meaning}</span></th>
      <td data-col={name}>
        {h.hood ? (<><Rate f={h.hood} big /><span className={styles.counts}>{countLine(h.hood)}</span></>) : <span className={styles.muted}>{missing}</span>}
      </td>
      <td data-col="City of Milwaukee" data-city>{h.city ? <Rate f={h.city} /> : <span className={styles.muted}>{NO_CITY}</span>}</td>
      <td data-col="Compared" data-verdict><Verdict h={h} /></td>
    </tr>
  );
}

function Tables({ tables, year }: { tables: PortraitTable[]; year: number }) {
  return (
    <details className={styles.tables}>
      <summary>All {tables.length} of DYCU&apos;s tables for {year}</summary>
      {tables.map((t) => (
        <section key={t.slug} className={styles.portrait}>
          <h4>{t.slug.replace(/-/g, " ")}</h4>
          {(t as PortraitTable & { issues?: string[] }).issues?.map((issue) => <p key={issue} className={styles.issue}>{issue}</p>)}
          <div className={styles.scroll} tabIndex={0} role="region" aria-label={`${t.slug.replace(/-/g, " ")}, scroll sideways for more`}>
            <table>
              {t.groups.some(Boolean) && <thead><tr><th scope="col" />{t.groups.map((g, i) => <th key={i} scope="col">{g}</th>)}</tr></thead>}
              <tbody>
                {t.rows.map((r, i) => (
                  <tr key={i} className={r.heading ? styles.heading : undefined}>
                    <th scope="row">{r.label}</th>
                    {r.values.map((v, j) => <td key={j}>{portraitCell(v)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </details>
  );
}

export function FactSheet({ s }: { s: SheetOk }) {
  const people = s.headlines.find((h) => h.isCount);
  const rows = s.headlines.filter((h) => !h.isCount);
  const missing = s.built ? MISSING_BUILT : MISSING;
  return (
    <div className={styles.page}>
      <div className={styles.chrome}>
        <Masthead side={null} showDate={false} nav={<SiteNav placement="masthead" current={null} />} />
      </div>
      <main className={styles.main}>
        <div className={styles.sheet}>
          <header className={styles.head}>
            <h2 className={styles.name}>{s.name}<span className={styles.kind}>Neighborhood fact sheet</span></h2>
            <p className={styles.period} data-period>
              {s.built ? <>{BUILT_SOURCE(s.period)} <ProvenanceTag source="CENSUS" /></> : <>{s.period} American Community Survey</>}
              <span className={styles.years}>
                {s.years.map((y) => (
                  <Link key={y} href={`/n/${s.slug}?year=${y}`} aria-current={y === s.year ? "page" : undefined} className={y === s.year ? styles.yearOn : styles.year}>{y}</Link>
                ))}
              </span>
            </p>
          </header>
          {people && (
            <p className={styles.people} data-fact={people.id}>
              <span className={styles.peopleNum}>{people.hood ? `${s.built ? "About " : ""}${estimate(people.hood.count)}` : missing}</span>
              <span className={styles.peopleLabel}>{people.label}</span>
            </p>
          )}
          <table className={styles.ledger}>
            <thead>
              <tr><th scope="col">Figure</th><th scope="col">{s.name}</th><th scope="col">City of Milwaukee</th><th scope="col">Compared</th></tr>
            </thead>
            <tbody>{rows.map((h) => <Row key={h.id} h={h} name={s.name} missing={missing} />)}</tbody>
          </table>
          <div className={styles.below}>
            {s.map && (
              <figure className={styles.map}>
                <TractMapSlot url={s.map.url} fits={s.map.geoids} height={220} />
                <figcaption>{s.built ? `The census tracts ${s.name} is built from` : `${s.name} as Data You Can Use defines it`}</figcaption>
              </figure>
            )}
            <div className={styles.notes}>
              {s.built && s.loaded === false && <p data-not-loaded>{NOT_LOADED}</p>}
              {s.built ? <p>{builtNote(s.name, s.built.tracts)}</p> : <p>{NOTE_APPROX} {MARGIN_NOTE}</p>}
              {!s.built && people?.hood && populationNote(s.tables) && <p className={styles.muted}>{populationNote(s.tables)}</p>}
              {s.tables.length > 0 && <Tables tables={s.tables} year={s.year} />}
            </div>
          </div>
        </div>
        <aside className={styles.aside}>
          <h3 className={styles.asideHead}>Sources</h3>
          {s.source ? <p><a href={s.source.landingPage}>Data You Can Use, {s.source.title}</a></p> : <p>{BUILT_SOURCE(s.period)}.</p>}
          <p>{CENSUS_SOURCE}, {s.period}.{s.cityFetchedAt ? ` Fetched ${fetchedOn(s.cityFetchedAt)}.` : ""}</p>
          <div className={styles.actions}>
            <button type="button" className={styles.print} onClick={() => window.print()}>Print or save as PDF</button>
            <ExportBar make={(ctx) => factSheetExport(s, ctx)} />
          </div>
        </aside>
      </main>
      <div className={styles.chrome}><CreditFooter /></div>
    </div>
  );
}

export function FactSheetSmall({ s }: { s: SheetSmall }) {
  return (
    <div className={styles.page}>
      <div className={styles.chrome}><Masthead side={null} showDate={false} nav={<SiteNav placement="masthead" current={null} />} /></div>
      <main className={styles.main}>
        <div className={styles.sheet}>
          <header className={styles.head}><h2 className={styles.name}>{s.name}<span className={styles.kind}>Neighborhood fact sheet</span></h2></header>
          <p data-small>{smallLine(s.people)}</p>
          {s.tracts.length > 0 && (
            <ul className={styles.areas}>{s.tracts.map((t) => <li key={t.number}>Census tract {t.number} ({t.share}% of its land)</li>)}</ul>
          )}
          {s.map && (
            <figure className={styles.map}>
              <TractMapSlot url={s.map.url} fits={s.map.geoids} height={220} />
              <figcaption>The census tracts {s.name} sits in</figcaption>
            </figure>
          )}
        </div>
      </main>
      <div className={styles.chrome}><CreditFooter /></div>
    </div>
  );
}

export function FactSheetIndex({ areas, cityAreas = [] }: { areas: { slug: string; name: string }[]; cityAreas?: { slug: string; name: string }[] }) {
  return (
    <div className={styles.page}>
      <Masthead side={null} showDate={false} nav={<SiteNav placement="masthead" current={null} />} />
      <main className={styles.index}>
        <h2 className={styles.name}>Neighborhood fact sheets</h2>
        <p>Data You Can Use profiles {areas.length} neighborhoods; every other City neighborhood has a sheet built from census tracts. Find yours from an address, or pick one:</p>
        <FindPlaceBox />
        <h3 className={styles.findLabel}>Data You Can Use&apos;s neighborhood portraits</h3>
        <ul className={styles.areas}>{areas.map((a) => <li key={a.slug}><Link href={`/n/${a.slug}`}>{a.name}</Link></li>)}</ul>
        {cityAreas.length > 0 && (
          <>
            <h3 className={styles.findLabel}>Every City neighborhood</h3>
            <p className={styles.muted}>Built from census tracts, so approximate.</p>
            <ul className={styles.areas}>{cityAreas.map((a) => <li key={a.slug}><Link href={`/n/${a.slug}`}>{a.name}</Link></li>)}</ul>
          </>
        )}
      </main>
      <CreditFooter />
    </div>
  );
}
