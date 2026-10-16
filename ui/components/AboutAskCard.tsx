"use client";
import Link from "next/link";
import arrow from "@/assets/plates/about-arrow.png";
import { ProvenanceTag } from "./ProvenanceTag";
import { QUESTION, useRobberySample } from "./LandingAskSample";
import styles from "./about.module.css";

// Entry 3's live answer card: the same City count the front page shows, asked when the page opens. Until it arrives (or
// if it can't), the card is the question and a link to ask it, never a number.
export function AboutAskCard({ code }: { code: string | null }) {
  const { view, settled } = useRobberySample(code);
  return (
    <div className={styles.askCard} data-about-sample={settled ? "done" : "pending"}>
      <p className={styles.askQuestion}>{QUESTION}</p>
      {view.kind === "figure" ? (
        <div className={styles.askAnswer}>
          <p className={styles.askFigure}>{view.count}</p>
          <p className={styles.askCaption}>{view.caption}</p>
          <span className={styles.askTag}>
            <ProvenanceTag source="CITY" />
            <span className={styles.pencilNote} aria-hidden="true">
              who wrote it
              <img src={arrow.src} alt="" className={styles.pencilArrow} width={arrow.width} height={arrow.height} />
            </span>
          </span>
        </div>
      ) : (
        <p className={styles.askCaption}>
          <Link href={`/ask?prompt=${encodeURIComponent(QUESTION)}`}>See the count&nbsp;→</Link>
        </p>
      )}
    </div>
  );
}
