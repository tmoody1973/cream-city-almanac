import type { ReactNode } from "react";
import styles from "./how.module.css";

// A grease-pencil teaching note: real text (readable, translatable) and the shared pencil-arrow plate.
// Phones: the note sits above its part, arrow down. Laptops: it moves into the margin, arrow toward the sheet.
export function PencilNote({ side, children }: { side: "left" | "right"; children: ReactNode }) {
  return (
    <p className={styles.note} data-side={side}>
      <span>{children}</span>
      <img className={styles.noteArrow} src="/plates/pencil-arrow.png" alt="" aria-hidden="true" width={216} height={197} />
    </p>
  );
}
