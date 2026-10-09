import Link from "next/link";
import { ASK_ROLES, examplesFor } from "@/lib/ask/examples";
import { DEFAULT_SETTINGS } from "@/convex/settings";
import { limitLine, SAMPLE_QUESTION } from "@/ui/lib/askGuide";
import { askHref } from "@/ui/lib/askPrompt";
import { NumberCard, type NumberResult } from "./AskCards";
import { CreditFooter } from "./CreditFooter";
import { Masthead } from "./Masthead";
import { PencilNote } from "./PencilNote";
import { SiteNav } from "./SiteNav";
import ask from "./ask.module.css";
import styles from "./guide.module.css";
import start from "./start.module.css";

const WONT = [
  "Guess or forecast a figure. If the data doesn't have it, Ask says so.",
  "Give opinions, or take a side on what the data means.",
  "Reach data outside Data You Can Use's catalog.",
  "Remember a conversation after you close the tab.",
];

export function AskGuide({ sample }: { sample: NumberResult | null }) {
  return (
    <div className={start.page}>
      <Masthead side="HOW TO USE ASK" showDate={false} sideClassName={start.side} nav={<SiteNav placement="masthead" current={null} />} />
      <main className={start.main}>
        <h2 className={start.headline}>HOW TO USE ASK</h2>
        <p className={start.lede}>
          Ask is a reference desk for Data You Can Use&apos;s data. It looks things up and points you to the exact table or
          report passage. Every figure comes from the data, never from the AI&apos;s own words.
        </p>

        <section className={styles.section} aria-labelledby="reading-heading">
          <h3 id="reading-heading" className={start.who}>READING AN ANSWER</h3>
          <div className={styles.sample}>
            <div className={styles.part}>
              <p className={`${ask.question} ${ask.firstQuestion}`}>{SAMPLE_QUESTION}</p>
            </div>
            <div className={styles.part}>
              <PencilNote side="right">the number comes from this card; its link opens the full table</PencilNote>
              <div className={ask.note}>
                <span className={ask.noteNumber} aria-hidden="true">1</span>
                <p className={ask.noteText}>Here is what the data shows.</p>
              </div>
              {sample ? (
                <NumberCard r={sample} onOpen={undefined} callKey="guide-sample" />
              ) : (
                <p className={start.missing}>Live data didn&apos;t load. The examples below still work.</p>
              )}
            </div>
            <div className={`${styles.part} ${styles.partMark}`}>
              <PencilNote side="right">a figure in the AI&apos;s own words gets marked like this</PencilNote>
              <p className={ask.noteText}>
                Example of the mark, with a made-up figure: about{" "}
                <mark className={ask.unverified} data-unverified>
                  1,234<span className={ask.unverifiedTag}>unverified</span>
                </mark>{" "}
                homes.
              </p>
            </div>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="roles-heading">
          <h3 id="roles-heading" className={start.who}>WHAT TO ASK</h3>
          <p className={styles.howTo}>Pick a question: it opens Ask with the question typed in. Nothing is sent until you press send.</p>
          <div className={start.examples}>
            {ASK_ROLES.map((r) => (
              <section key={r.id} className={start.example} data-role={r.id} aria-labelledby={`${r.id}-who`}>
                <h4 id={`${r.id}-who`} className={start.question}>{r.who}</h4>
                <p>{r.purpose}</p>
                <ul className={styles.questions}>
                  {examplesFor(r.id).map((e) => (
                    <li key={e.question}>
                      <Link href={askHref(e.question)}>{e.question}</Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </section>

        <section className={styles.section} aria-labelledby="wont-heading">
          <h3 id="wont-heading" className={start.who}>WHAT ASK WON&apos;T DO</h3>
          <ul className={styles.wont}>{WONT.map((w) => <li key={w}>{w}</li>)}</ul>
          <p>{limitLine(DEFAULT_SETTINGS)}</p>
        </section>
      </main>
      <CreditFooter />
    </div>
  );
}
