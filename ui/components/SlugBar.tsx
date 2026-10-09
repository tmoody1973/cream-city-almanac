import styles from "./rundown.module.css";

export const SUGGESTIONS = ["food insecurity", "rent burden", "air quality"];

export function SlugBar({ value, onChange, showTags }: { value: string; onChange: (v: string) => void; showTags: boolean }) {
  return (
    <>
      <form className={styles.slugForm} role="search" onSubmit={(e) => e.preventDefault()}>
        <label className={styles.slugLabel} htmlFor="slug">
          TOPIC:
        </label>
        <input
          id="slug"
          className={styles.slugInput}
          type="search"
          autoComplete="off"
          placeholder="What are you looking into?"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </form>
      {showTags && (
      <div className={styles.tags} aria-label="Suggested searches">
        {SUGGESTIONS.map((s) => (
          <button key={s} type="button" className={styles.tag} onClick={() => onChange(s)}>
            {s}
          </button>
        ))}
      </div>
      )}
    </>
  );
}
