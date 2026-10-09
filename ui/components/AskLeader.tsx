"use client";
import { useEffect, useState, type RefObject } from "react";
import styles from "./ask.module.css";

type Line = { x1: number; y1: number; x2: number; y2: number } | null;

// Laptop margin notes: an ink leader from the newest note's reference to what it opened in the pane,
// the outlined row (row= in the address) or else the sheet's heading. Ink, never red (red is DYCU's teaching voice).
export function AskLeader({ container }: { container: RefObject<HTMLElement | null> }) {
  const [line, setLine] = useState<Line>(null);

  useEffect(() => {
    const root = container.current;
    if (!root) return;
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const anchors = root.querySelectorAll("[data-leader-anchor]");
        const from = anchors[anchors.length - 1];
        const pane = root.querySelector("#sheet-pane");
        const to = pane?.querySelector("[data-row-marked]") ?? pane?.querySelector("h1, h2");
        if (!from || !to || !pane) return setLine(null);
        const box = root.getBoundingClientRect();
        const b = to.getBoundingClientRect();
        const p = pane.getBoundingClientRect();
        // Leave the reference from the end of its line nearest the target, so the leader never crosses its words.
        const ref = from.closest("p") ?? from;
        const range = document.createRange();
        range.selectNodeContents(ref);
        const lines = [...range.getClientRects()].filter((r) => r.width > 0);
        const target = b.top + b.height / 2;
        const a = lines.reduce((best, r) => (Math.abs(r.top + r.height / 2 - target) < Math.abs(best.top + best.height / 2 - target) ? r : best), lines[0] ?? from.getBoundingClientRect());
        const lineEnd = Math.max(...lines.filter((r) => Math.abs(r.top - a.top) < 2).map((r) => r.right), a.right);
        // Hide the leader when either end has scrolled out of view.
        if (a.bottom < box.top || a.top > window.innerHeight || b.bottom < p.top || b.top > p.bottom) return setLine(null);
        setLine({ x1: lineEnd - box.left + 8, y1: a.top + a.height / 2 - box.top, x2: b.left - box.left - 4, y2: target - box.top });
      });
    };
    measure();
    const mo = new MutationObserver(measure);
    mo.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-row-marked", "data-leader-anchor"] });
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      cancelAnimationFrame(frame);
      mo.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [container]);

  if (!line) return null;
  return (
    <svg className={styles.leader} aria-hidden="true" data-leader>
      <defs>
        <marker id="ask-leader-head" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto">
          <path d="M1 1 L9 5 L1 9" fill="none" stroke="var(--ink)" strokeWidth="1.5" strokeLinecap="square" />
        </marker>
      </defs>
      <circle cx={line.x1} cy={line.y1} r="2.5" fill="var(--ink)" />
      <path
        d={`M${line.x1} ${line.y1} C ${line.x1 + 40} ${line.y1}, ${line.x2 - 40} ${line.y2}, ${line.x2} ${line.y2}`}
        fill="none"
        stroke="var(--ink)"
        strokeWidth="1"
        markerEnd="url(#ask-leader-head)"
      />
    </svg>
  );
}
