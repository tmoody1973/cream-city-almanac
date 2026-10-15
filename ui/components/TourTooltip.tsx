"use client";

import type { TooltipRenderProps } from "react-joyride";
import { tooltipFooter } from "@/ui/lib/tourState";
import styles from "./tour.module.css";

// The tour's note, ruled like everything else on the sheet (DESIGN.md: no shadow, no radius, ink rules, ruled buttons).
export function TourTooltip({ backProps, index, primaryProps, size, skipProps, step, tooltipProps }: TooltipRenderProps) {
  const f = tooltipFooter(index, size);
  return (
    <div {...tooltipProps} className={styles.tour} data-tour-tooltip>
      {step.title && <p className={styles.title}>{step.title}</p>}
      <p className={styles.text}>{step.content}</p>
      <div className={styles.foot}>
        <span className={styles.count}>{f.counter}</span>
        <button {...skipProps} className={styles.button}>SKIP TOUR</button>
        {f.back && <button {...backProps} className={styles.button}>BACK</button>}
        <button {...primaryProps} className={styles.button}>{f.primary}</button>
      </div>
    </div>
  );
}
