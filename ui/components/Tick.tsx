import styles from "./rundown.module.css";

export function Tick() {
  return (
    <>
      <svg className={styles.tick} viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 13 L9 19 L21 5" fill="none" stroke="var(--pencil)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="visually-hidden">opened before</span>
    </>
  );
}
