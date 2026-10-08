export interface PortraitIndex {
  neighborhoods: { key: string; label: string; files: { hubId: string; year: number | null }[] }[];
  initial: { hubId: string; tables: unknown[] } | null;
}
export interface PortraitFocus {
  place: string;
  year: number | null;
  topic: string;
}

// Estimates and margins as whole numbers with commas; rates (between 0 and 1) to 3 places; anything else as written.
export function formatPortraitNumber(s: string): string {
  const t = s.trim();
  if (!/^-?\d+(\.\d+)?$/.test(t)) return s;
  const n = Number(t);
  if (n !== 0 && Math.abs(n) < 1) return n.toFixed(3);
  return Math.round(n).toLocaleString("en-US");
}

export function resolvePortraitFocus(index: PortraitIndex, params: URLSearchParams, topics: string[]) {
  const initialPlace = index.neighborhoods.find((n) => n.files.some((f) => f.hubId === index.initial?.hubId)) ?? index.neighborhoods[0];
  const place = index.neighborhoods.find((n) => n.key === params.get("place")) ?? initialPlace;
  const wantYear = Number(params.get("year"));
  const file = place.files.find((f) => f.year === wantYear) ?? (place === initialPlace && index.initial ? place.files.find((f) => f.hubId === index.initial!.hubId) : undefined) ?? place.files[0];
  const topic = topics.includes(params.get("topic") ?? "") ? params.get("topic")! : topics[0];
  return { place: place.key, hubId: file.hubId, topic };
}

export function portraitFocusQuery(focus?: PortraitFocus | null): string {
  if (!focus) return "";
  const p = new URLSearchParams({ place: focus.place, ...(focus.year ? { year: String(focus.year) } : {}), topic: focus.topic });
  return `?${p}`;
}

export const censusTableUrl = (id: string): string => `https://data.census.gov/table?q=${encodeURIComponent(id)}`;
