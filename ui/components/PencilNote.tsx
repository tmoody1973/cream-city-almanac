import type { ReactNode } from "react";
import { LAPTOP_QUERY } from "@/ui/lib/selection";
import styles from "./how.module.css";

// Arrows cut from the approved comps: down on phones (how-phone.webp), toward the sheet on laptops (how-laptop.webp).
const LAPTOP_ARROW = { left: { src: "/plates/pencil-arrow-right.png", w: 81, h: 35 }, right: { src: "/plates/pencil-arrow-left.png", w: 101, h: 56 } };

// A grease-pencil teaching note: real text (readable, translatable) and a drawn arrow.
// Phones: the note sits above its part. Laptops: it moves into the margin.
export function PencilNote({ side, children }: { side: "left" | "right"; children: ReactNode }) {
  const laptop = LAPTOP_ARROW[side];
  return (
    <p className={styles.note} data-side={side}>
      <span>{children}</span>
      <picture className={styles.noteArrow}>
        <source media={LAPTOP_QUERY} srcSet={laptop.src} width={laptop.w} height={laptop.h} />
        <img src="/plates/pencil-arrow-down.png" alt="" aria-hidden="true" width={36} height={51} />
      </picture>
    </p>
  );
}
