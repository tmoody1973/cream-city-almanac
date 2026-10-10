// Laptops get the two-pane layout. Keep this string identical to the CSS media query in rundown.module.css.
export const LAPTOP_QUERY = "(min-width: 1100px) and (orientation: landscape)";

const CODE = /^[A-Za-z]\d{2,3}$/;

export interface Selection {
  q: string;
  open: string | null;
  ask?: boolean; // the laptop's Ask column is open (ask=1)
}

export function parseSelection(search: string): Selection {
  const params = new URLSearchParams(search);
  const open = params.get("open")?.trim() ?? "";
  return { q: params.get("q")?.trim() ?? "", open: CODE.test(open) ? open.toUpperCase() : null, ...(params.get("ask") === "1" && { ask: true }) };
}

export function selectionSearch({ q, open, ask }: Selection): string {
  const params = new URLSearchParams();
  if (ask) params.set("ask", "1");
  if (q.trim()) params.set("q", q.trim());
  if (open) params.set("open", open);
  const s = params.toString();
  return s ? `?${s}` : "";
}

// The WHERE map's filters live in the address (what, when, from/to, where); every redirect between a sheet's two addresses carries them.
export const WHERE_KEYS = ["type", "when", "from", "to", "area"] as const;

export function whereParams(search: string): string {
  const from = new URLSearchParams(search);
  return new URLSearchParams(WHERE_KEYS.flatMap((k) => (from.get(k) ? [[k, from.get(k)!]] : []))).toString();
}

// Every address parameter the search screen reads. A request to / with any of these is a search link from before the
// landing page existed (or a share of one) and goes to /search unchanged; other parameters (campaign tags) stay home.
export const SEARCH_PARAMS = ["q", "open", "ask", "prompt", "row", "place", "year", "topic", "day", "month", "weekday"] as const;

export const isSearchAddress = (params: Record<string, string | string[] | undefined>) =>
  SEARCH_PARAMS.some((k) => params[k] !== undefined);
