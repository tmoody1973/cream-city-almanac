import { formatPortraitNumber } from "../../convex/lib/portrait";

export { formatPortraitNumber };

// A margin reads ±n; a zero margin, or a text or error cell, is shown as written.
export function formatPortraitMargin(moe: string): string {
  const f = formatPortraitNumber(moe);
  return /^\d/.test(f) && Number(moe) !== 0 ? `±${f}` : f;
}

export interface PortraitIndex {
  neighborhoods: { key: string; label: string; files: { hubId: string; year: number | null }[] }[];
  initial: { hubId: string; tables: unknown[] } | null;
}
export interface PortraitFocus {
  place: string;
  year: number | null;
  topic: string;
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
