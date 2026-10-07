import styles from "./rundown.module.css";

// The approved grease-pencil plate (assets/plates/pencil-mark.png); decorative, so the meaning is in hidden text.
export function PencilMark() {
  return (
    <>
      <img className={styles.pencil} src="/plates/pencil-mark.png" alt="" aria-hidden="true" width={1024} height={1024} />
      <span className="visually-hidden">updated since your last visit</span>
    </>
  );
}
