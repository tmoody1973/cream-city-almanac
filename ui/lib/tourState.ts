// The first-visit tours' memory and small decisions (spec 2026-10-14-start-here-and-tour §4.4). Pure, so they test
// without a browser; the components pass the real localStorage through safeStorage().
export type TourKey = "front" | "ask" | "ask-card";
export type KeyStore = { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void };
const KEY = (k: TourKey) => `almanac:tour:${k}`;

// null when the browser blocks storage: no tour then, rather than one on every visit.
export function safeStorage(): KeyStore | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function shouldRun(key: TourKey, s: KeyStore | null, forced: boolean): boolean {
  if (forced) return true;
  if (!s) return false;
  try {
    return s.getItem(KEY(key)) !== "done";
  } catch {
    return false;
  }
}

export function markDone(key: TourKey, s: KeyStore | null): void {
  try { s?.setItem(KEY(key), "done"); } catch { /* storage blocked: the tour simply shows again next time */ }
}

export function clearDone(key: TourKey, s: KeyStore | null): void {
  try { s?.removeItem(KEY(key)); } catch { /* storage blocked */ }
}

export const replayKeys = (page: "front" | "ask"): TourKey[] => (page === "front" ? ["front"] : ["ask", "ask-card"]);

// Ask's two stages: the empty state first, then the first answer card; never the card stage before stage 1 is done.
export function nextAskStage(s: KeyStore | null, forced: boolean): "ask" | "ask-card" | null {
  if (shouldRun("ask", s, forced)) return "ask";
  return shouldRun("ask-card", s, false) ? "ask-card" : null;
}

export const tooltipFooter = (index: number, size: number) => ({
  counter: `${index + 1} OF ${size}`,
  back: index > 0,
  primary: (index === size - 1 ? "DONE" : "NEXT") as "NEXT" | "DONE",
});

export const pickTarget = (targets: string[], isVisible: (sel: string) => boolean): string | null => targets.find(isVisible) ?? null;
