"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { clearDone, replayKeys, safeStorage, shouldRun } from "@/ui/lib/tourState";
import { FRONT_STEPS } from "@/ui/lib/tourSteps";

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
