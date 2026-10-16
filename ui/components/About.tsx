import Link from "next/link";
import type { Est, Verdict } from "@/convex/lib/factMath";
import { margin, pct, verdictText } from "@/ui/lib/factText";
import { AboutAskCard } from "./AboutAskCard";
import { CreditFooter } from "./CreditFooter";
import { FindPlaceBox } from "./FindPlaceBox";
import { Masthead } from "./Masthead";
import { ProvenanceTag } from "./ProvenanceTag";
import { SiteNav } from "./SiteNav";
import styles from "./about.module.css";

export type RiverwestRow = { name: string; slug: string; rate: Est; city: Est; verdict: Verdict };

const CAN_ASK = [
  "Crime counts back to 2005, mapped and counted inside the City's own neighborhood boundaries",
  "Fire Department calls and response times since 2015",
  "How long City cases take, like 311 requests and permits, and how long vacant buildings have sat on the City's list",
  "Who lives in a ZIP code, and health, food and hospital-visit figures by ZIP code",
  "Which neighborhoods have the most of something, and whether two things go together, like renting and lack of home internet",
  "Voter turnout, police stops from 2019 to 2024, and how property values have changed since 2005",
];

const TAGS: { tag: "DYCU" | "CITY" | "CENSUS" | "HCM" | "AI"; says: string }[] = [
  { tag: "DYCU", says: "Data You Can Use, which publishes Milwaukee neighborhood data and reports" },
  { tag: "CITY", says: "the City of Milwaukee's open data" },
  { tag: "CENSUS", says: "the U.S. Census Bureau's survey" },
  { tag: "HCM", says: "Health Compass Milwaukee, from the Milwaukee Health Care Partnership" },
  { tag: "AI", says: "written by AI, like a plain-English summary, so you know to check it" },
];

function Entry({ n, title, id, children, className }: { n: number; title: string; id?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={className ? `${styles.entry} ${className}` : styles.entry} id={id} aria-label={title}>
      <span className={styles.num} aria-hidden="true">{n}</span>
      <div className={styles.body}>
        <h3 className={styles.title}>{title}</h3>
        {children}
      </div>
    </section>
  );
}

// "What's in the Almanac": the almanac's front matter, every entry a working part (direction contract in
// .impeccable/surfaces/app-about-page-tsx.md). Every number on the page is read from the data when it loads.
export function About({ sampleCode, cityLive, riverwest }: { sampleCode: string | null; cityLive: number; riverwest: RiverwestRow | null }) {
  return (
    <div className={styles.page}>
      <Masthead side="" showDate={false} sideClassName={styles.side} nav={<SiteNav placement="masthead" current={null} />} />
      <main className={styles.main}>
        <h2 className={styles.headline}>What&apos;s in the Almanac</h2>
        <p className={styles.lede}>Milwaukee&apos;s public data, looked up and explained. Every number says where it came from.</p>
        <div className={styles.entries}>
          <Entry n={1} title="Your address" id="address">
            <div className={styles.address}>
              <FindPlaceBox heading={false} compact />
            </div>
            <p className={`${styles.text} ${styles.after} ${styles.lookup}`}>You&apos;ll see which neighborhood you&apos;re in, your alder and aldermanic district, your voting ward, and your polling place, with notes on its accessible entrance and parking.</p>
          </Entry>
          <Entry n={2} title="Your neighborhood">
            {riverwest ? (
              <Link href={`/n/${riverwest.slug}`} className={styles.band} aria-label={`${riverwest.name}'s fact sheet: people in poverty ${pct(riverwest.rate)}, City of Milwaukee ${pct(riverwest.city)}, ${verdictText(riverwest.verdict)}`}>
                <span className={styles.cell}>
                  <span className={styles.cellLabel}>People in poverty · {riverwest.name}</span>
                  <span className={styles.rate}>{pct(riverwest.rate)}</span>
                  <span className={styles.margin}>{margin(riverwest.rate)}</span>
                </span>
                <span className={styles.cell}>
                  <span className={styles.cellLabel}>City of Milwaukee</span>
                  <span className={styles.rate}>{pct(riverwest.city)}</span>
                </span>
                <span className={styles.cell}>
                  <span className={styles.verdict}>
                    {verdictText(riverwest.verdict)}
                    {(riverwest.verdict === "lower" || riverwest.verdict === "higher") && (
                      <img src="/plates/about-underline.png" alt="" className={styles.pencilUnderline} width={1349} height={220} />
                    )}
                  </span>
                </span>
              </Link>
            ) : null}
            <p className={`${styles.text} ${styles.after}`}>For the 27 neighborhoods Data You Can Use profiles, a printable page shows poverty, income, renters, vacant homes, rent burden, car ownership and schooling, each next to the citywide figure, with a plain label: clearly higher, clearly lower, or about the same.</p>
            <p className={styles.text}>
              {riverwest ? <Link href={`/n/${riverwest.slug}`}>Open {riverwest.name}&apos;s fact sheet →</Link> : <Link href="/n">Neighborhood fact sheets →</Link>}
            </p>
          </Entry>
          <Entry n={3} title="Ask in plain English">
            <AboutAskCard code={sampleCode} />
            <p className={`${styles.text} ${styles.after}`}>Ask answers with a card that shows the number, its source, and its fine print.</p>
            <p className={styles.text}><Link href="/ask">Ask your own question →</Link></p>
          </Entry>
          <div className={styles.pair}>
              <Entry n={4} title="Search">
                <p className={styles.text}>Look up other places, topics or numbers.</p>
                <form action="/search" method="get" className={styles.search} role="search">
                  <label htmlFor="about-q" className="visually-hidden">Topic</label>
                  <input id="about-q" name="q" type="search" placeholder="kids who can't afford food" className={styles.searchInput} />
                  <button type="submit" className={styles.searchButton}>Search</button>
                </form>
                <p className={styles.small}>Every dataset has a plain-English page: what it measures, which years and places it covers, what to be careful about, and questions worth asking.</p>
              </Entry>
              <Entry n={5} title="How you know">
                <p className={styles.text}>See the sources for every number.</p>
                <p className={styles.small}>The AI reads your question and picks the right tool. Code does the math. The AI never writes a number.</p>
                <dl className={styles.tags}>
                  {TAGS.map((t) => (
                    <div key={t.tag} className={styles.tagRow}>
                      <dt><ProvenanceTag source={t.tag} /></dt>
                      <dd>{t.says}</dd>
                    </div>
                  ))}
                </dl>
              </Entry>
          </div>
          <Entry n={6} title="What you can ask">
            <ul className={`${styles.list} ${styles.canAsk}`}>
              {CAN_ASK.map((c) => <li key={c}>{c}</li>)}
            </ul>
            <p className={styles.small}>Survey figures come with their margin of error. Ask won&apos;t tell you anything about a specific property, owner or person; in City files that name people, it hides any group smaller than 10.</p>
            <p className={styles.text}><Link href="/ask">Ask a question →</Link> <span className={styles.muted}>Free with sign-in, up to 30 questions a day.</span></p>
          </Entry>
          <div className={styles.duo}>
          <Entry n={7} title="For reporters">
            <p className={styles.text}>You&apos;re on deadline and need a number you can stand behind. Ask gives you the figure with its source, its time period and its caveats on one card. Export it as a spreadsheet, plain text or an image, with the source notes already attached, or send a share link that anyone can open without signing in.</p>
            <p className={styles.text}>Every dataset page lists story angles to start from, and the caveats tell you what the data can and can&apos;t support before you write the sentence. Search also reads inside about 180 Data You Can Use reports, so you can find the passage that backs up a figure.</p>
          </Entry>
          <Entry n={8} title="For nonprofits">
            <p className={styles.text}>Grant applications want local numbers with a credible source. A neighborhood fact sheet gives you the headline figures next to the city&apos;s, with margins of error, and prints on one page. For something narrower, like Harambee&apos;s poverty numbers by age, open the neighborhood spreadsheet, pick the year and the table, and quote each estimate with its range and the Census table it came from.</p>
            <p className={styles.text}>Ask can compare neighborhoods for you (&ldquo;Which neighborhoods have the highest rent burden?&rdquo;), and entry 1 tells you which neighborhood, district and ward a site sits in.</p>
            <p className={styles.text}><Link href="/n">Neighborhood fact sheets →</Link></p>
          </Entry>
          </div>
        </div>
        <section className={styles.fine} aria-labelledby="good-to-know">
          <h3 id="good-to-know" className={styles.fineHead}>Good to know</h3>
          <ul className={styles.list}>
            <li>Search and fact sheets are open to everyone. Ask is free with a sign-in, up to 30 questions a day.</li>
            <li>The catalog refreshes every Monday, and {cityLive} City datasets update daily.</li>
            <li>Survey numbers are estimates, so read the range along with the number.</li>
            <li>Cream City Almanac is unofficial and isn&apos;t affiliated with Data You Can Use or the City of Milwaukee. Questions about the data itself go to Data You Can Use at <a href="mailto:hub@datayoucanuse.org">hub@datayoucanuse.org</a>.</li>
          </ul>
          <p className={styles.close}>
            <a href="#address">Start with entry 1: your address ↑</a> <Link href="/start-here">Start here: three real questions, step by step →</Link>
          </p>
        </section>
      </main>
      <CreditFooter />
    </div>
  );
}
