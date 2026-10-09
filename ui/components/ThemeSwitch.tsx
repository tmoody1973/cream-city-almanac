"use client";
import { useEffect, useState } from "react";
import styles from "./rundown.module.css";

type Theme = "auto" | "light" | "dark";
const CHOICES: [Theme, string][] = [["auto", "Auto"], ["light", "Light"], ["dark", "Dark"]];

// Footer switch. Auto follows the device; Light or Dark is remembered on this browser ("theme" in localStorage),
// and the inline script in app/layout.tsx applies it before the page draws.
export function ThemeSwitch() {
  const [theme, setTheme] = useState<Theme>("auto");
  useEffect(() => {
    const t = document.documentElement.dataset.theme;
    if (t === "light" || t === "dark") setTheme(t);
  }, []);
  const choose = (t: Theme) => {
    setTheme(t);
    if (t === "auto") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = t;
    try {
      if (t === "auto") localStorage.removeItem("theme");
      else localStorage.setItem("theme", t);
    } catch {
      // Storage blocked (private mode): the choice still holds for this page view.
    }
  };
  return (
    <div role="group" aria-label="Theme" className={styles.themeSwitch}>
      Theme:{" "}
      {CHOICES.map(([t, label], i) => (
        <span key={t}>
          {i > 0 && " · "}
          <button type="button" className={styles.themeButton} aria-pressed={theme === t} onClick={() => choose(t)}>
            {label}
          </button>
        </span>
      ))}
    </div>
  );
}
