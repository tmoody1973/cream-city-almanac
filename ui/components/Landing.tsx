import Link from "next/link";
import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
import { CreditFooter } from "./CreditFooter";
import { Masthead } from "./Masthead";
import { ProvenanceTag } from "./ProvenanceTag";
import { SiteNav } from "./SiteNav";
import styles from "./landing.module.css";

type Stats = FunctionReturnType<typeof api.catalog.landingStats>;
const EXAMPLE = "kids who can't afford food";

// The front door: what the almanac is, what it holds, why to trust it, and where to go next. Live numbers only.
export function Landing({ stats }: { stats: Stats }) {
  return (
    <div className={styles.page}>
      <Masthead side="" showDate={false} sideClassName={styles.side} nav={<SiteNav placement="masthead" current={null} />} />
      <main className={styles.main}>
        <h2 className={styles.headline}>A guide to Milwaukee&apos;s public data.</h2>
        <p className={styles.tagline}>Find it. Understand it. Check where it came from.</p>
        <form action="/search" method="get" className={styles.entry} role="search">
          <label htmlFor="landing-q" className={styles.entryLabel}>
            Topic:
          </label>
          <input id="landing-q" name="q" type="search" placeholder="What are you looking into?" className={styles.entryInput} />
          <button type="submit" className={styles.button}>
            Search
          </button>
        </form>

        <div className={styles.three}>
          <section>
            <h3 className={styles.heading}>Find it</h3>
            <p>Search in your own words across Data You Can Use and the City of Milwaukee.</p>
            <p className={styles.example}>
              <Link href={`/search?q=${encodeURIComponent(EXAMPLE)}`}>&ldquo;{EXAMPLE}&rdquo;</Link> → Food Insecurity Prevalence
            </p>
          </section>
          <section>
            <h3 className={styles.heading}>Understand it</h3>
            <p>Every dataset gets a plain-English sheet: what it measures, which places and years exist, the caveats, a map, and story angles.</p>
          </section>
          <section>
            <h3 className={styles.heading}>Check where it came from</h3>
            <p>Every fact says who wrote it. Numbers come from the data, never from the AI.</p>
            <p className={styles.example}>
              <ProvenanceTag source="DYCU" /> <ProvenanceTag source="HUB" /> <ProvenanceTag source="CITY" /> <ProvenanceTag source="AI" />
            </p>
          </section>
        </div>

        <div className={styles.pair}>
          <section>
            <h3 className={styles.heading}>The data</h3>
            <table className={styles.table} aria-label="What the almanac holds">
              <thead>
                <tr>
                  <th scope="col">Source</th>
                  <th scope="col">What&apos;s in it</th>
                  <th scope="col">Families</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">Data You Can Use</th>
                  <td>Neighborhood health, income and housing; reports read word by word</td>
                  <td className={styles.num} data-landing-count="dycu">
                    {stats.dycuFamilies}
                  </td>
                </tr>
                <tr>
                  <th scope="row">City of Milwaukee</th>
                  <td>Crime, fire and EMS calls, City services, property, elections, maps; {stats.cityLive} updated daily</td>
                  <td className={styles.num} data-landing-count="city">
                    {stats.cityFamilies}
                  </td>
                </tr>
              </tbody>
            </table>
            <p className={styles.example}>
              Refreshed every Monday. Updated this season:{" "}
              {stats.newest.map((n, i) => (
                <span key={n.code}>
                  {i ? " · " : ""}
                  <Link href={`/d/${n.code}`}>{n.name}</Link>
                </span>
              ))}
            </p>
          </section>
          <section>
            <h3 className={styles.heading}>Ask a question</h3>
            <p>Ask in plain English; the answer shows the number and its source.</p>
            {/* Task 4: <LandingAskSample code={stats.sampleCode} /> */}
            <p className={styles.example}>
              Free with sign-in · 30 questions a day · <Link href="/ask/guide">How to use Ask&nbsp;→</Link>
            </p>
          </section>
        </div>

        <section className={styles.block}>
          <h3 className={styles.heading}>Who it&apos;s for</h3>
          <ul className={styles.who} role="list">
            <li>
              <b>A reporter</b> checking a number on deadline
            </li>
            <li>
              <b>A nonprofit</b> writing a grant
            </li>
            <li>
              <b>A resident</b> curious about their block
            </li>
            <li>
              <Link href="/start-here" className={styles.cta}>Start here →</Link>
            </li>
          </ul>
        </section>
      </main>
      <p className={styles.fine}>
        Unofficial. Not affiliated with Data You Can Use or the City of Milwaukee. · <a href="https://github.com/tmoody1973/cream-city-almanac">Code on GitHub</a> ·
        Questions about the data: <a href="mailto:hub@datayoucanuse.org">hub@datayoucanuse.org</a>
      </p>
      <CreditFooter />
    </div>
  );
}
