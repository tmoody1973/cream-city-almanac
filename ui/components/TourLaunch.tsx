"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { clearDone, nextAskStage, replayKeys, safeStorage, shouldRun } from "@/ui/lib/tourState";
import { ASK_CARD_STEPS, ASK_STEPS, FRONT_STEPS } from "@/ui/lib/tourSteps";

// The tour library loads only in the browser, and only when a tour will run.
const Tour = dynamic(() => import("./Tour"), { ssr: false });
const forcedReplay = () => new URLSearchParams(window.location.search).get("tour") === "1";

export function FrontTour() {
  const [start, setStart] = useState(false);
  useEffect(() => {
    const s = safeStorage();
    const forced = forcedReplay();
    if (forced) for (const k of replayKeys("front")) clearDone(k, s);
    setStart(shouldRun("front", s, forced));
  }, []);
  return start ? <Tour id="front" steps={FRONT_STEPS} /> : null;
}

// Stage 2's targets: the newest on-screen card with a live export bar (not an expired one), and the follow-up buttons
// under it.
function tagNewestCard(): boolean {
  const bars = [...document.querySelectorAll('[data-card] [data-export=""]')].filter((el) => el.getClientRects().length > 0);
  const bar = bars[bars.length - 1];
  const card = bar?.closest("[data-card]");
  if (!bar || !card) return false;
  document.querySelectorAll("[data-tour-card]").forEach((el) => el.removeAttribute("data-tour-card"));
  card.querySelector("abbr")?.setAttribute("data-tour-card", "tag");
  bar.setAttribute("data-tour-card", "export");
  card.querySelector("[data-share]")?.setAttribute("data-tour-card", "share");
  const next = document.querySelectorAll('[data-follow-ups="next"]');
  next[next.length - 1]?.setAttribute("data-tour-card", "next");
  return true;
}

// Ask (spec §4.3): stage 1 on the first visit; stage 2 the first time a full answer card appears.
export function AskTours() {
  const [stage, setStage] = useState<"ask" | "ask-card" | null>(null);
  const [cardReady, setCardReady] = useState(false);
  useEffect(() => {
    const s = safeStorage();
    const forced = forcedReplay();
    if (forced) for (const k of replayKeys("ask")) clearDone(k, s);
    setStage(nextAskStage(s, forced));
  }, []);
  useEffect(() => {
    if (stage !== "ask-card" || cardReady) return;
    if (tagNewestCard()) {
      setCardReady(true);
      return;
    }
    const watch = new MutationObserver(() => { if (tagNewestCard()) { watch.disconnect(); setCardReady(true); } });
    watch.observe(document.body, { childList: true, subtree: true });
    return () => watch.disconnect();
  }, [stage, cardReady]);
  if (stage === "ask") return <Tour id="ask" steps={ASK_STEPS} onDone={() => setStage(nextAskStage(safeStorage(), false))} />;
  if (stage === "ask-card" && cardReady) return <Tour id="ask-card" steps={ASK_CARD_STEPS} />;
  return null;
}
