"use client";
import { useContext } from "react";
import { NewestTurn, PromptFill, RetriedCalls } from "./askFill";
import styles from "./ask.module.css";

export type FollowUp = { label: string; question: string };

// Next-question ideas (under a card) or "Pick one:" options (under a refusal). Code-built (ui/lib/nextQuestions.ts,
// ui/lib/refusalChoices.ts); a click fills the question box and never sends. Newest answer only.
export function FollowUps({ items, id, pick }: { items: FollowUp[]; id?: string; pick?: boolean }) {
  const newest = useContext(NewestTurn);
  const retried = useContext(RetriedCalls);
  const { fill } = useContext(PromptFill);
  if (!items.length || !id || !newest.has(id) || (pick && retried.has(id))) return null;
  return (
    <div className={styles.followUps} role="group" aria-label={pick ? "Pick one. Each fills the question box" : "Next questions. Each fills the question box"} data-follow-ups={pick ? "pick" : "next"}>
      {pick && <span className={styles.pickLabel}>Pick one:</span>}
      {items.map((f) => (
        <button key={f.label + f.question} type="button" className={styles.expand} onClick={() => fill(f.question)}>
          {f.label}
        </button>
      ))}
    </div>
  );
}
