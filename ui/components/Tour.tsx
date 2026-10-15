"use client";

import { useEffect, useMemo, useState } from "react";
import { ACTIONS, EVENTS, Joyride, STATUS, type EventData, type Step } from "react-joyride";
import { markDone, pickTarget, safeStorage, type TourKey } from "@/ui/lib/tourState";
import type { TourStep } from "@/ui/lib/tourSteps";
import { TourTooltip } from "./TourTooltip";

// A target counts only if it is on screen now (the phone hides the masthead's links, a card may have no share link).
const visible = (sel: string) => {
  const el = document.querySelector(sel);
  return !!el && el.getClientRects().length > 0;
};

// One first-visit tour (spec 2026-10-14-start-here-and-tour §4). Controlled: we own the step index; finishing,
// skipping or Escape marks it done in this browser.
const resolve = (steps: TourStep[]): Step[] =>
  steps.flatMap((s) => { const target = pickTarget(s.targets, visible); return target ? [{ target, title: s.title, content: s.content }] : []; });

// DESIGN.md: the library's note otherwise carries a drop shadow and a fade-in, and a spinning loader while it waits.
const NO_SHADOW_NO_FADE = { floater: { filter: "none", transition: "none" } };

// The buttons' accessible names match what they say.
const LOCALE = { back: "Back", close: "Close", last: "Done", next: "Next", skip: "Skip tour" };

export default function Tour({ id, steps, onDone }: { id: TourKey; steps: TourStep[]; onDone?: (skipped: boolean) => void }) {
  const [resolved, setResolved] = useState<Step[]>([]);
  const [run, setRun] = useState(false);
  const [index, setIndex] = useState(0);
  const reduce = useMemo(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches, []);

  // Targets can arrive after the page (Ask's input is the chat library's own, mounted late): wait up to 5 s, checking
  // every 250 ms, for the first step's target; then fix the step list once. Nothing found: no tour this visit.
  useEffect(() => {
    let tries = 0;
    let timer: ReturnType<typeof setTimeout>;
    const attempt = () => {
      if (pickTarget(steps[0]?.targets ?? [], visible) || tries >= 20) {
        const r = resolve(steps);
        if (r.length) { setResolved(r); setRun(true); }
        return;
      }
      tries += 1;
      timer = setTimeout(attempt, 250);
    };
    attempt();
    return () => clearTimeout(timer);
  }, [steps]);

  // The current step's target wears the focus-ring outline while its note shows.
  useEffect(() => {
    if (!run) return;
    const sel = resolved[index]?.target;
    const el = typeof sel === "string" ? document.querySelector(sel) : null;
    el?.setAttribute("data-tour-active", "");
    return () => el?.removeAttribute("data-tour-active");
  }, [run, index, resolved]);

  const finish = (skipped: boolean) => {
    if (!run) return;
    setRun(false);
    markDone(id, safeStorage());
    onDone?.(skipped);
  };
  const onEvent = (d: EventData) => {
    if (d.status === STATUS.FINISHED) return finish(false);
    if (d.status === STATUS.SKIPPED || d.action === ACTIONS.CLOSE) return finish(true);
    if (d.type === EVENTS.STEP_AFTER || d.type === EVENTS.TARGET_NOT_FOUND) setIndex(d.index + (d.action === ACTIONS.PREV ? -1 : 1));
  };

  if (!resolved.length) return null;
  return (
    <Joyride
      run={run}
      stepIndex={index}
      steps={resolved}
      continuous
      onEvent={onEvent}
      tooltipComponent={TourTooltip}
      locale={LOCALE}
      styles={NO_SHADOW_NO_FADE}
      loaderComponent={null}
      options={{ skipBeacon: true, hideOverlay: true, spotlightRadius: 0, zIndex: 900, width: "min(380px, calc(100vw - 32px))", scrollDuration: reduce ? 0 : 300, dismissKeyAction: "close", overlayClickAction: false, arrowColor: "var(--paper)" }}
    />
  );
}
