import { editDistance } from "./neighborhoodNames";

// City 311 requests, counted by place (spec 2026-10-20-311-by-neighborhood). Pure: no I/O. Addresses pass through
// these functions on their way to the geocoder and are never returned in anything that gets stored.

export type Row311 = { id: number; created: string | null; closed: string | null; address: string | null; type: string | null };
export type Address = { street: string; city: string; state: string; zip: string };

// "2613 W CAPITOL DR, 3, MILWAUKEE, WI, 53206-1413": street first, city/state/ZIP last; anything between is a unit.
export function cleanAddress(raw: string | null): Address | null {
  const parts = String(raw ?? "").split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length < 4) return null;
  const zip = parts.at(-1)!.slice(0, 5);
  const street = parts[0];
  if (!/^\d{5}$/.test(zip) || !/^\d/.test(street)) return null;
  return { street, city: parts.at(-3)!, state: parts.at(-2)!, zip };
}

const q = (s: string) => `"${s.replace(/"/g, "")}"`;
export const toBatchCsv = (items: ({ key: string } & Address)[]) =>
  items.map((a) => [a.key, a.street, a.city, a.state, a.zip].map(q).join(",")).join("\n") + "\n";

// The Census batch reply: one line per address. A "Match" line carries "lon,lat" (one quoted field) and the state,
// county and tract codes; anything else ("No_Match", "Tie") places nothing.
export function parseBatchReply(csv: string): Map<string, { lat: number; lon: number; geoid: string } | null> {
  const out = new Map<string, { lat: number; lon: number; geoid: string } | null>();
  for (const line of csv.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const f = line.trim().replace(/^"|"$/g, "").split('","');
    const [lonS, latS] = (f[5] ?? "").split(",");
    const lat = Number(latS), lon = Number(lonS);
    const ok = f[2] === "Match" && Number.isFinite(lat) && Number.isFinite(lon) && /^\d{2}$/.test(f[8] ?? "") && /^\d{3}$/.test(f[9] ?? "") && /^\d{6}$/.test(f[10] ?? "");
    out.set(f[0], ok ? { lat, lon, geoid: `${f[8]}${f[9]}${f[10]}` } : null);
  }
  return out;
}

const DAY = 86_400_000;
const dayOf = (s: string | null) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s ?? ""));
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : null;
};
export const yearOf = (created: string | null) => { const d = dayOf(created); return d === null ? null : new Date(d).getUTCFullYear(); };

// 311 dates carry no time of day, so days are whole. A close before the open is closed but has no usable span.
export function daysToClose(created: string | null, closed: string | null): { closed: boolean; days: number | null } {
  const c = dayOf(closed);
  if (c === null) return { closed: false, days: null };
  const o = dayOf(created);
  const days = o === null ? null : Math.round((c - o) / DAY);
  return { closed: true, days: days !== null && days >= 0 ? days : null };
}

// Days to close as { days: count }: whole days add exactly, so a median over any merge is exact.
export type Hist = Record<string, number>;
export const addDays = (h: Hist, days: number): Hist => ({ ...h, [days]: (h[days] ?? 0) + 1 });
export const mergeHist = (a: Hist, b: Hist): Hist =>
  Object.entries(b).reduce((acc, [k, n]) => ({ ...acc, [k]: (acc[k] ?? 0) + n }), { ...a });

export function medianOf(h: Hist): number | null {
  const sorted = Object.entries(h).map(([k, n]) => [Number(k), n] as const).sort((a, b) => a[0] - b[0]);
  const total = sorted.reduce((s, [, n]) => s + n, 0);
  if (!total) return null;
  const at = (i: number) => { let seen = 0; for (const [d, n] of sorted) { seen += n; if (i < seen) return d; } return sorted.at(-1)![0]; };
  return (at(Math.floor((total - 1) / 2)) + at(Math.floor(total / 2))) / 2;
}

export const TYPE_GROUPS = {
  // The City retitled potholes over time: "Pothole" until 2023-11-12, then "Potholes"; "Pothole Alley Request" (2023–24),
  // then "Pothole in Alley". Every title of the same request counts, or a multi-year answer shows a false drop.
  potholes: ["Potholes", "Pothole", "Pothole in Alley", "Pothole Alley Request"],
  streetlights: ["Street Light Out", "Area Dark"],
  dumping: ["Large Items Discarded on Private Property", "Scattered Litter and Debris on Private Property"],
} as const satisfies Record<string, readonly string[]>;
const ALIASES: Record<string, keyof typeof TYPE_GROUPS> = {
  pothole: "potholes", potholes: "potholes",
  streetlight: "streetlights", streetlights: "streetlights", "street light": "streetlights", "street lights": "streetlights",
  dumping: "dumping", "illegal dumping": "dumping",
};

const words = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

// A type group, or the titles holding every asked word, or (never a guess) the closest titles to choose from.
export function resolveTypes(asked: string | undefined, known: string[]): { types: string[] } | { choices: string[] } {
  const a = words(asked ?? "").join(" ");
  if (!a) return { types: known };
  const group = ALIASES[a];
  if (group) return { types: TYPE_GROUPS[group].filter((t) => known.includes(t)) };
  const hits = known.filter((t) => { const w = words(t); return words(a).every((x) => w.includes(x)); });
  if (hits.length) return { types: hits };
  return { choices: [...known].sort((x, y) => editDistance(x.toLowerCase(), a) - editDistance(y.toLowerCase(), a)).slice(0, 8) };
}

// The years an answer covers: newest by default, "from" runs up to the newest, "to" back to the first; clamped to the
// counted years, and never a range wholly outside them (that would be a made-up 0). missing: years in range with no counts.
export function yearRange(asked: { from?: number; to?: number }, counted: number[]):
  { from: number; to: number; missing: number[] } | { outside: true; first: number; last: number } {
  const first = Math.min(...counted), last = Math.max(...counted);
  const from = Math.max(asked.from ?? (asked.to !== undefined ? first : last), first);
  const to = Math.min(asked.to ?? last, last);
  if (from > to) return { outside: true, first, last };
  const have = new Set(counted);
  return { from, to, missing: Array.from({ length: to - from + 1 }, (_, i) => from + i).filter((y) => !have.has(y)) };
}
