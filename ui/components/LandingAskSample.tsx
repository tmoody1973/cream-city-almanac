"use client";
import { useAction } from "convex/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/convex/_generated/api";
import { type SampleResult, sampleView } from "@/ui/lib/landingSample";
import { ProvenanceTag } from "./ProvenanceTag";
import styles from "./landing.module.css";

const QUESTION = "How many robberies in Harambee this year?";
// The NIBRS sheet's own "What" menu: column Offense_All, Robbery = 120 (the City's codes, same in every deployment).
const ROBBERY = { column: "Offense_All", values: ["120"] };

// A live count from the City, asked once when the page opens (the public map endpoint caches it ten minutes).
// Until it arrives (and with scripts off), or if it can't, the card is the question and a link to ask it;
// data-landing-sample says which (pending / done).
export function LandingAskSample({ code }: { code: string | null }) {
  const run = useAction(api.map.mapCells);
  const [result, setResult] = useState<SampleResult | null>(null);
  const [settled, setSettled] = useState(!code);
  useEffect(() => {
    if (!code) return;
    let live = true;
    const year = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" }).slice(0, 4);
    run({ code, from: `${year}-01-01`, filters: [ROBBERY], neighborhood: "Harambee" }).then(
      (r) => live && (setResult(r), setSettled(true)),
      () => live && setSettled(true),
    );
    return () => {
      live = false;
    };
  }, [code, run]);
  const view = sampleView(result);
  return (
    <div className={styles.sample} data-landing-sample={settled ? "done" : "pending"}>
      <p className={styles.sampleQ}>{QUESTION}</p>
      {view.kind === "figure" ? (
        <>
          <p className={styles.sampleFigure} data-landing-sample-count>
            {view.count}
          </p>
          <p className={styles.sampleCaption}>
            {view.caption} <ProvenanceTag source="CITY" />
          </p>
        </>
      ) : (
        <p className={styles.sampleCaption}>
          <Link href={`/ask?prompt=${encodeURIComponent(QUESTION)}`}>See the count&nbsp;→</Link>
        </p>
      )}
    </div>
  );
}
