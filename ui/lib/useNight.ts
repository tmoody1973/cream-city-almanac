"use client";
import { useSyncExternalStore } from "react";

// The night edition: the footer switch's data-theme, or the system setting when no choice is saved.
const night = () => {
  const t = document.documentElement.dataset.theme;
  return t ? t === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
};
function subscribe(onChange: () => void) {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const obs = new MutationObserver(onChange);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  media.addEventListener("change", onChange);
  return () => { obs.disconnect(); media.removeEventListener("change", onChange); };
}
export const useNight = () => useSyncExternalStore(subscribe, night, () => false);
