"use client";

import { useId } from "react";
import type { TooltipRenderProps } from "react-joyride";
import { tooltipFooter } from "@/ui/lib/tourState";
import styles from "./tour.module.css";

// The tour's note, ruled like everything else on the sheet (DESIGN.md: no shadow, no radius, ink rules, ruled buttons).
export function TourTooltip({ backProps, index, primaryProps, size, skipProps, step, tooltipProps }: TooltipRenderProps) {
  const f = tooltipFooter(index, size);
  const id = useId();
  // The library makes this an alertdialog; its title names it and its text describes it, so both are read out.
  return (
    <div {...tooltipProps} aria-labelledby={`${id}-t`} aria-describedby={`${id}-d`} className={styles.tour} data-tour-tooltip>
      {step.title && <p id={`${id}-t`} className={styles.title}>{step.title}</p>}
      <p id={`${id}-d`} className={styles.text}>{step.content}</p>
      <div className={styles.foot}>
        <span className={styles.count}>{f.counter}</span>
        <button {...skipProps} className={styles.button}>SKIP TOUR</button>
        {f.back && <button {...backProps} className={styles.button}>BACK</button>}
        <button {...primaryProps} className={styles.button}>{f.primary}</button>
      </div>
    </div>
  );
}
