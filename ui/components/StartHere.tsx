import type { FunctionReturnType } from "convex/server";
import Link from "next/link";
import type { ReactNode } from "react";
import type { api } from "@/convex/_generated/api";
import { formatPortraitMargin, formatPortraitNumber } from "@/ui/lib/portrait";
import { canChart } from "@/ui/lib/preview";
import { Arrow } from "./Arrow";
import { CreditFooter } from "./CreditFooter";
import { LivePreview } from "./LivePreview";
import { Masthead } from "./Masthead";
import { ProvenanceTag } from "./ProvenanceTag";
import { SiteNav } from "./SiteNav";
import styles from "./start.module.css";

type Data = FunctionReturnType<typeof api.catalog.startHere>;
const REPORTER_QUERY = "older housing and asthma rates";
const EXCERPT_ROWS = 3;

const NotLoaded = () => <p className={styles.missing}>Live data didn&apos;t load. The steps and the Try it link still work.</p>;

function Example({ id, who, question, steps, excerpt, tryHref }: { id: string; who: string; question: string; steps: ReactNode[]; excerpt: ReactNode; tryHref: string }) {
  return (
    <section className={styles.example} data-example={id} aria-labelledby={`${id}-who`}>
      <h3 id={`${id}-who`} className={styles.who}>{who}</h3>
      <p className={styles.question}>{question}</p>
      <ol className={styles.steps}>{steps.map((s, i) => <li key={i}><span>{s}</span></li>)}</ol>
      <div className={styles.excerpt}>{excerpt}</div>
      <p className={styles.try}><Link href={tryHref}>Try it<Arrow /></Link></p>
    </section>
  );
}

export function StartHere({ data }: { data: Data | null }) {
  const housing = data?.reporter.housing;
  const asthma = data?.reporter.asthma;
  const table = data?.nonprofit;
  const air = data?.resident;
  return (
    <div className={styles.page}>
      <Masthead side="START HERE" showDate={false} sideClassName={styles.side} nav={<SiteNav placement="masthead" current="start" />} />
      <main className={styles.main}>
        <h2 className={styles.headline}>START HERE</h2>
        <p className={styles.lede}>Three people, three questions, and how each gets an answer here.</p>
        <p className={styles.try}><Link href="/ask/guide">Prefer to ask in plain English? How to use Ask<Arrow /></Link></p>

        <div className={styles.examples}>
        <Example
          id="reporter"
          who="A REPORTER"
          question="Do the neighborhoods with the most old housing also have the most asthma?"
          steps={[
            <>Search <Link href={`/?q=${encodeURIComponent(REPORTER_QUERY)}`}>{REPORTER_QUERY}</Link>. Asthma Prevalence and Housing Built Before 1950 come up.</>,
            <>Read each sheet&apos;s caveats first: they say what the numbers can and can&apos;t support.</>,
            <>Use the story angles as starting questions.</>,
            <>Download both CSVs and match them by census tract.</>,
          ]}
          excerpt={
            housing?.angles.length || asthma?.caveat ? (
              <>
                {housing && housing.angles.length > 0 && (
                  <>
                    <p className={styles.excerptLabel}>{housing.code} story angles</p>
                    <ul>{housing.angles.map((a) => <li key={a}>{a} <ProvenanceTag source="AI" /></li>)}</ul>
                  </>
                )}
                {asthma?.caveat && (
                  <>
                    <p className={styles.excerptLabel}>{asthma.code} caveat</p>
                    <p>{asthma.caveat} <ProvenanceTag source="AI" /></p>
                  </>
                )}
              </>
            ) : <NotLoaded />
          }
          tryHref={`/?q=${encodeURIComponent(REPORTER_QUERY)}`}
        />

        <Example
          id="nonprofit"
          who="A NONPROFIT"
          question="Our grant application needs Harambee's poverty numbers, by age."
          steps={[
            <>Open the <Link href="/d/N03">Neighborhood Portrait Spreadsheet</Link> (N03).</>,
            <>Pick Harambee and the newest year, then Poverty Status by Age.</>,
            <>Quote each estimate with its margin of error, and cite the Census table linked on the sheet.</>,
            <>For the story behind the numbers, read Harambee&apos;s <Link href="/d/N02">Neighborhood Portrait</Link> report.</>,
          ]}
          excerpt={
            table ? (
              <>
                {table.table.issues.map((i) => <p key={i} className={styles.issue}>{i}</p>)}
                <table className={styles.table}>
                  <caption>{table.place}, {table.year}: {table.table.topic}</caption>
                  <thead><tr><th scope="col"><span className="visually-hidden">Variable</span></th><th scope="col">Estimate</th><th scope="col">± Margin</th></tr></thead>
                  <tbody>
                    {table.table.rows.filter((r) => !r.heading).slice(0, EXCERPT_ROWS).map((r) => (
                      <tr key={r.label}>
                        <th scope="row">{r.label}</th>
                        <td>{r.values[0] ? formatPortraitNumber(r.values[0].estimate) : ""}</td>
                        <td>{r.values[0]?.moe ? formatPortraitMargin(r.values[0].moe) : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p><ProvenanceTag source="DYCU" /> Census table {table.table.tableIds.join(", ")}</p>
              </>
            ) : <NotLoaded />
          }
          tryHref={table ? `/d/N03?place=harambee&year=${table.year}&topic=poverty-status-by-age` : "/d/N03"}
        />

        <Example
          id="resident"
          who="A RESIDENT"
          question="What has the air been like in Milwaukee lately?"
          steps={[
            <>Search <Link href="/?q=air%20quality">air quality</Link> and open Daily Air Quality (V02).</>,
            <>The live preview charts every day&apos;s reading, straight from DYCU&apos;s Hub. No download needed.</>,
            <>Read the caveat before comparing days or years.</>,
          ]}
          excerpt={
            air && canChart(air.fields, air.members) ? (
              <>
                <p className={styles.excerptLabel}>{air.code} daily readings</p>
                <LivePreview members={air.members} fields={air.fields} chartOnly unit="day" />
                {air.caveat && <p>{air.caveat} <ProvenanceTag source="AI" /></p>}
              </>
            ) : <NotLoaded />
          }
          tryHref="/d/V02"
        />
        </div>

        <section className={styles.guides} aria-labelledby="guides-heading">
          <h3 id="guides-heading" className={styles.guidesHeading}>DYCU&apos;S OWN GUIDES</h3>
          <ul>
            {(data?.guides ?? []).map((g) => (
              <li key={g.code}>{g.url ? <a href={g.url}>{g.name}</a> : g.name} <ProvenanceTag source="HUB" /></li>
            ))}
          </ul>
          <p>Questions about the data itself: <a href="mailto:hub@datayoucanuse.org">hub@datayoucanuse.org</a></p>
          <p className={styles.try}><Link href="/how-it-works">How the almanac works<Arrow /></Link></p>
        </section>
      </main>
      <CreditFooter />
    </div>
  );
}
