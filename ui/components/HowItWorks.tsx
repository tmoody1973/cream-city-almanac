import Link from "next/link";
import { Fragment } from "react";
import { QUESTIONS } from "@/convex/lib/evalQuestions";
import { asOfPhrase, countsLine, pdfReportsPhrase } from "@/ui/lib/how";
import { AnnotatedSheet } from "./AnnotatedSheet";
import type { CatalogStatus } from "./CatalogLine";
import { CreditFooter } from "./CreditFooter";
import { Masthead } from "./Masthead";
import { ProvenanceTag } from "./ProvenanceTag";
import type { SheetData } from "./SheetBody";
import { SiteNav } from "./SiteNav";
import styles from "./how.module.css";

const DECISION_LOG = "https://github.com/tmoody1973/cream-city-almanac/tree/main/docs/decisions";
const AUTHOR = "https://github.com/tmoody1973";
const EXAMPLE_QUERY = "kids who can't afford food";
const NEIGHBORHOOD_QUERY = "Lincoln Park employment status by sex";

type Area = { name: string; tracts: string[]; years: number[] };
const tractList = (t: string[]) => (t.length > 1 ? `${t.slice(0, -1).join(", ")} and ${t.at(-1)}` : t.join(""));

export function HowItWorks({ status, example, areas }: { status: CatalogStatus | null; example: SheetData | null; areas: Area[] | null }) {
  const riverwest = areas?.find((a) => a.name === "Riverwest");
  const harambee = areas?.find((a) => a.name === "Harambee");
  const counts = countsLine(status);
  const asOf = asOfPhrase(status);
  return (
    <div className={styles.page}>
      <Masthead side="HOW IT WORKS" showDate={false} sideClassName={styles.side} nav={<SiteNav placement="masthead" current="how" />} />
      <main className={styles.main}>
        <h2 className={styles.headline}>How to read a dataset in&nbsp;60&nbsp;seconds</h2>
        <p className={styles.lede}>
          Unofficial. Built on Data You Can Use&apos;s public data
          {counts ? (
            <>
              :{" "}
              {counts.split(" · ").map((part, i) => (
                <Fragment key={part}>
                  {i > 0 && " · "}
                  <span className={styles.nowrap}>{part}</span>
                </Fragment>
              ))}
              .
            </>
          ) : (
            "."
          )}
        </p>
        {example && <AnnotatedSheet sheet={example} />}

        <div className={styles.sections}>

          <section className={styles.section}>
            <h3 className={styles.heading}>EACH WEEK</h3>
            <ol className={styles.steps}>
              <li>Read DYCU&apos;s Hub catalog and its inventory sheet.</li>
              <li>Group the yearly and geographic versions of each measure into one family with a permanent code, like F02.</li>
              <li>Read {pdfReportsPhrase(status)} so search can match the text inside them.</li>
              <li>
                Open the Neighborhood Portrait spreadsheets, one per neighborhood and year, and store their tables, so the{" "}
                <Link href="/d/N03">N03 sheet</Link> shows any neighborhood&apos;s numbers without a download.
              </li>
              <li>
                Ask AI (Claude) to write each family&apos;s plain-English explainer, column guide, caveats and story angles. DYCU&apos;s own
                definitions always win.
              </li>
              <li>Index everything for search by meaning and by exact words.</li>
            </ol>
            <p>A failed week never replaces the live catalog.{asOf ? ` Data as of ${asOf}.` : ""}</p>
          </section>

          <section className={styles.section}>
            <h3 className={styles.heading}>WHAT THE AI DOES</h3>
            <p>
              See <a href="/how-ask-works.html">the diagram of how Ask answers a question</a>: the AI picks a tested tool, code does
              the math, and every number on the card comes from that code.
            </p>
            <p>Every fact carries a tag saying who wrote it:</p>
            <ul className={styles.tags}>
              <li><ProvenanceTag source="DYCU" /> DYCU&apos;s own definition, from its inventory sheet.</li>
              <li><ProvenanceTag source="HUB" /> From DYCU&apos;s Hub listing.</li>
              <li><ProvenanceTag source="SOURCE_SITE" /> From the source agency&apos;s own website.</li>
              <li><ProvenanceTag source="AI" /> Written by AI from the facts above, and always labeled.</li>
            </ul>
            <p>Numbers on a sheet come from the Hub&apos;s data, never from the AI.</p>
            <p>
              Ask&apos;s number cards can be exported as a CSV, as plain text or as an image. Each export copies the card: its figures, its
              fine print, the dataset&apos;s caveats and the source. The AI doesn&apos;t write any of it.
            </p>
            <p>
              Ask can also say how long things take in a few City files, like complaints, 311 requests, permits and fire calls. The median is
              the middle case: half took less time. The &ldquo;9 in 10&rdquo; time is how long all but the slowest tenth took. Cases still
              open aren&apos;t counted, so the slowest ones are missing, and the card says how many.
            </p>
            <p>
              Ask can also add up a few City money columns, like back property tax owed, City employee pay and property sale prices. It
              shows the total and the median (the middle value), and the average only when you ask for it. In files that name people,
              groups of fewer than 5 records are hidden so no one&apos;s figure can be singled out.
            </p>
            <p>
              Spreadsheet numbers appear as DYCU wrote them, Estimate ± margin of error, with any problems in DYCU&apos;s file noted
              above the table. No AI touches them.
            </p>
          </section>

          <section className={styles.section}>
            <h3 className={styles.heading}>HOW SEARCH WORKS</h3>
            <p>
              Type what you&apos;re reporting on, in your own words. Search matches meaning (text that means something similar) and exact
              words, then ranks what agrees. Try <Link href={`/search?q=${encodeURIComponent(EXAMPLE_QUERY)}`}>{EXAMPLE_QUERY}</Link>: it finds
              Food Insecurity Prevalence. Try <Link href={`/search?q=${encodeURIComponent(NEIGHBORHOOD_QUERY)}`}>{NEIGHBORHOOD_QUERY}</Link>
              : it opens that neighborhood&apos;s table.
            </p>
            <p>When nothing is close, it says so instead of listing unrelated data.</p>
          </section>

          {/* The two neighborhood maps (decision 024). Examples come from the same table the tract cards name tracts from. */}
          <section className={styles.section} id="neighborhoods">
            <h3 className={styles.heading}>WHAT &ldquo;NEIGHBORHOOD&rdquo; MEANS HERE</h3>
            <p>Milwaukee has more than one map of its neighborhoods, and this site uses two.</p>
            <p>
              <strong>The City&apos;s map.</strong> The City of Milwaukee draws 190 official neighborhoods. When Ask counts City records
              (crimes, fire calls, 311 requests), it keeps the records whose location falls inside the City&apos;s boundary, and the card
              says &ldquo;City of Milwaukee boundary.&rdquo;
            </p>
            <p>
              <strong>DYCU&apos;s report areas.</strong> Data You Can Use publishes its numbers (poverty, rent, health) by census tract, a
              small area the Census Bureau counts, usually 1,200 to 8,000 people. For its Neighborhood Portraits, DYCU groups tracts into
              {areas?.length ? ` ${areas.length}` : ""} report areas it chose with its neighborhood partners.
              {riverwest ? ` Riverwest, for example, is tracts ${tractList(riverwest.tracts)}.` : ""} Some names are DYCU&apos;s own, like
              United Community, and aren&apos;t on the City&apos;s map.
            </p>
            <p>
              <strong>Same name, different ground.</strong> Harambee on the City&apos;s map and Harambee in DYCU&apos;s reports
              {harambee ? ` (${harambee.tracts.length} tracts)` : ""} don&apos;t cover exactly the same streets. So a number never moves
              from one map to the other: a City count stays with the City&apos;s boundary, a DYCU number with DYCU&apos;s tracts, and every
              card names which one it used.
            </p>
            <p>
              <strong>On the tract cards,</strong> each tract shows two names. <em>Neighborhood</em> is the City&apos;s: every official
              neighborhood covering at least 10% of the tract, biggest first (tap &ldquo;+2&rdquo; to see the rest with their shares). Each
              week the site lays a fine grid of points over every tract and counts which City neighborhood each point falls in.{" "}
              <em>DYCU area</em> lists every DYCU report area that includes the tract; some tracts are in two or three. A tract outside
              the City, or in no DYCU area, shows &ldquo;&mdash;&rdquo;; the site never guesses a name.
            </p>
            {areas && areas.length > 0 && (
              <details className={styles.areas}>
                <summary>Which tracts make up each DYCU area</summary>
                <ul>
                  {areas.map((a) => (
                    <li key={a.name} data-area={a.name}>
                      <strong>{a.name}</strong>: tracts {tractList(a.tracts)}
                      {a.years.length > 0 && <span className={styles.areaYears}> ({Math.min(...a.years)}&ndash;{Math.max(...a.years)} reports)</span>}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </section>
          <section className={styles.section}>
            <h3 className={styles.heading}>WHAT IT IS</h3>
            <p>
              An unofficial, phone-first way to find, understand and download Milwaukee&apos;s public data from Data You Can Use. Search
              in your own words; every fact shows where it came from.
            </p>
          </section>

          <section className={styles.section}>
            <h3 className={styles.heading}>WHERE THE DATA COMES FROM</h3>
            <p>
              DYCU&apos;s ArcGIS Hub, the public website where Data You Can Use publishes its data
              {counts ? `: ${counts}, in the Hub's own words.` : "."}
            </p>
            <p>Refreshed weekly and never altered. Downloads come straight from the Hub.</p>
          </section>

          <section className={styles.section}>
            <h3 className={styles.heading}>HOW IT&apos;S BUILT</h3>
            <p>
              Next.js on Vercel; Convex for the database, search and the weekly job; Claude through the Vercel AI Gateway; Firecrawl to
              read PDFs. A weekly automated check grades search on {QUESTIONS.length} reporter-style questions. Every trade-off is in{" "}
              <a href={DECISION_LOG}>the decision log</a>.
            </p>
          </section>

          <section className={`${styles.section} ${styles.colophon}`}>
            <h3 className={styles.heading}>LIMITS AND CREDITS</h3>
            <p>Unofficial; not affiliated with Data You Can Use.{asOf ? ` Data as of ${asOf}.` : ""}</p>
            <p>
              Questions about the data itself go to DYCU: <a href="mailto:hub@datayoucanuse.org">hub@datayoucanuse.org</a>.
            </p>
            <p>
              Built by <a href={AUTHOR}>Tarik Moody</a>.
            </p>
          </section>
        </div>
      </main>
      <SiteNav placement="dock" current={null} />
      <CreditFooter />
    </div>
  );
}
