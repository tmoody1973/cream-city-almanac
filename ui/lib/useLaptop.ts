"use client";
import { useSyncExternalStore } from "react";
import { LAPTOP_QUERY } from "./selection";

function subscribe(onChange: () => void) {
  const media = window.matchMedia(LAPTOP_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

// False during server rendering and hydration; CSS lays out the panes, this only switches click behavior.
export function useLaptop(): boolean {
  return useSyncExternalStore(subscribe, () => window.matchMedia(LAPTOP_QUERY).matches, () => false);
}
