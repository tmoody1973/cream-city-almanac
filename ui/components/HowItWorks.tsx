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

export function HowItWorks({ status, example }: { status: CatalogStatus | null; example: SheetData | null }) {
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
          {/* First on phones, so a first-time visitor reads what this is before anything else; laptops follow the comp's order. */}
          <section className={`${styles.section} ${styles.whatItIs}`}>
            <h3 className={styles.heading}>WHAT IT IS</h3>
            <p>
              An unofficial, phone-first way to find, understand and download Milwaukee&apos;s public data from Data You Can Use. Search
              in your own words; every fact shows where it came from.
            </p>
          </section>

          <section className={styles.section}>
            <h3 className={styles.heading}>EACH WEEK</h3>
            <ol className={styles.steps}>
              <li>Read DYCU&apos;s Hub catalog and its inventory sheet.</li>
              <li>Group the yearly and geographic versions of each measure into one family with a permanent code, like F02.</li>
              <li>Read {pdfReportsPhrase(status)} so search can match the text inside them.</li>
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
            <p>Every fact carries a tag saying who wrote it:</p>
            <ul className={styles.tags}>
              <li><ProvenanceTag source="DYCU" /> DYCU&apos;s own definition, from its inventory sheet.</li>
              <li><ProvenanceTag source="HUB" /> From DYCU&apos;s Hub listing.</li>
              <li><ProvenanceTag source="SOURCE_SITE" /> From the source agency&apos;s own website.</li>
              <li><ProvenanceTag source="AI" /> Written by AI from the facts above, and always labeled.</li>
            </ul>
            <p>Numbers on a sheet come from the Hub&apos;s data, never from the AI.</p>
          </section>

          <section className={styles.section}>
            <h3 className={styles.heading}>HOW SEARCH WORKS</h3>
            <p>
              Type what you&apos;re reporting on, in your own words. Search matches meaning (text that means something similar) and exact
              words, then ranks what agrees. Try <Link href={`/?q=${encodeURIComponent(EXAMPLE_QUERY)}`}>{EXAMPLE_QUERY}</Link>: it finds
              Food Insecurity Prevalence.
            </p>
            <p>When nothing is close, it says so instead of listing unrelated data.</p>
          </section>

          <section className={`${styles.section} ${styles.later}`}>
            <h3 className={styles.heading}>WHERE THE DATA COMES FROM</h3>
            <p>
              DYCU&apos;s ArcGIS Hub, the public website where Data You Can Use publishes its data
              {counts ? `: ${counts}, in the Hub's own words.` : "."}
            </p>
            <p>Refreshed weekly and never altered. Downloads come straight from the Hub.</p>
          </section>

          <section className={`${styles.section} ${styles.later}`}>
            <h3 className={styles.heading}>HOW IT&apos;S BUILT</h3>
            <p>
              Next.js on Vercel; Convex for the database, search and the weekly job; Claude through the Vercel AI Gateway; Firecrawl to
              read PDFs. A weekly automated check grades search on {QUESTIONS.length} reporter-style questions. Every trade-off is in{" "}
              <a href={DECISION_LOG}>the decision log</a>.
            </p>
          </section>

          <section className={`${styles.section} ${styles.later} ${styles.colophon}`}>
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
