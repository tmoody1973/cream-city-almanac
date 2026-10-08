import { formatPortraitNumber, TOPICS } from "../../convex/lib/portrait";

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

export interface PortraitTopicItem {
  slug: string;
  topic: string;
  ids: string;
  state: "present" | "missing";
}

// The topic list: DYCU's 16 in tab order, marking any the file lacks, then any tab the reader didn't recognize.
// A file with no tables read yet lists nothing rather than calling every topic missing.
export function portraitTopics(tables?: { slug: string; topic: string; tableIds: string[] }[]): PortraitTopicItem[] {
  if (!tables) return TOPICS.map((t) => ({ slug: t.slug, topic: t.topic, ids: "", state: "present" }));
  if (tables.length === 0) return [];
  const bySlug = new Map(tables.map((t) => [t.slug, t]));
  const known = TOPICS.map((t): PortraitTopicItem => {
    const found = bySlug.get(t.slug);
    return { slug: t.slug, topic: t.topic, ids: found?.tableIds.join(", ") ?? "", state: found ? "present" : "missing" };
  });
  const extra = tables
    .filter((t) => !TOPICS.some((x) => x.slug === t.slug))
    .map((t): PortraitTopicItem => ({ slug: t.slug, topic: t.topic, ids: t.tableIds.join(", "), state: "present" }));
  return [...known, ...extra];
}

const FOCUS_KEYS = ["place", "year", "topic", "row"] as const;

// The table choice in an address (place, year, topic, and a row Ask marked), to carry through a redirect.
export function portraitParams(search: string): string {
  const from = new URLSearchParams(search);
  return new URLSearchParams(FOCUS_KEYS.flatMap((k) => (from.get(k) ? [[k, from.get(k)!]] : []))).toString();
}
