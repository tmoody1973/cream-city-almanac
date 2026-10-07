import styles from "./rundown.module.css";

// Grease-pencil tick plate (assets/plates/pencil-tick.png, trimmed): the "opened before" mark.
export function Tick() {
  return (
    <>
      <img className={styles.tick} src="/plates/pencil-tick.png" alt="" aria-hidden="true" width={664} height={529} />
      <span className="visually-hidden">opened before</span>
    </>
  );
}
