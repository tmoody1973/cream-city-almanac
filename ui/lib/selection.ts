// Laptops get the two-pane layout. Keep this string identical to the CSS media query in rundown.module.css.
export const LAPTOP_QUERY = "(min-width: 1100px) and (orientation: landscape)";

const CODE = /^[A-Za-z]\d{2,3}$/;

export interface Selection {
  q: string;
  open: string | null;
}

export function parseSelection(search: string): Selection {
  const params = new URLSearchParams(search);
  const open = params.get("open")?.trim() ?? "";
  return { q: params.get("q")?.trim() ?? "", open: CODE.test(open) ? open.toUpperCase() : null };
}

export function selectionSearch({ q, open }: Selection): string {
  const params = new URLSearchParams();
  if (q.trim()) params.set("q", q.trim());
  if (open) params.set("open", open);
  const s = params.toString();
  return s ? `?${s}` : "";
}
