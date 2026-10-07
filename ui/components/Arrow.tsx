import styles from "./rundown.module.css";

// A drawn arrow in the ink stroke (craft floor: no Unicode glyphs standing in for icons).
export function Arrow({ direction = "right" }: { direction?: "left" | "right" }) {
  return (
    <svg className={direction === "left" ? `${styles.arrow} ${styles.arrowLeft}` : styles.arrow} viewBox="0 0 20 12" aria-hidden="true">
      <path d="M1 6 H17 M12 1.5 L17.5 6 L12 10.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" />
    </svg>
  );
}
