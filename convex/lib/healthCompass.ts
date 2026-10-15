import { z } from "zod";
import { COUNTY_ZIPS } from "./zips";

// Health Compass Milwaukee (healthcompassmilwaukee.org), the Milwaukee Health Care Partnership's data site, powered by
// Metopio (spec 2026-10-15-zip-health §3). Pure: reading its API, picking one figure per topic, and the credit line every
// figure carries (§6).
export const HC_API = "https://healthcompassmilwaukee.org/api/v1";
export const HC_SITE = "https://healthcompassmilwaukee.org";
export const HC_CREDIT = "Health Compass Milwaukee (Milwaukee Health Care Partnership), powered by Metopio";
export const HC_HEADERS: Record<string, string> = { "User-Agent": "CreamCityAlmanac/1.0 (+https://www.creamcityalmanac.app)" };
export const COUNTY_GEO = "55079";
export const CITY_GEO = "5553000";

export type HealthLayer = "zip" | "county" | "place";
export type HealthTopic = { key: string; name: string; description: string; units: string; decimals: number; isCount: boolean; keywords: string; team: string | null; sources: string[] };
export type HealthFigure = { topic: string; period: string; value: number; se: number | null };
export type RawRow = { g: string; l: string; a: string; p: string; d: string; v: number | null; se?: number | null };

export const topicUrl = (key: string) => `${HC_SITE}/topics/${encodeURIComponent(key)}`;
export const placeUrl = (layer: HealthLayer, geo: string) => `${HC_API}/data/?layer=${layer}&geography=${encodeURIComponent(geo)}`;

const Dataset = z.object({ source: z.string().nullish(), notes: z.string().nullish(), dataset: z.object({ name: z.string().nullish() }).passthrough().nullish() }).passthrough();
const Topic = z.object({
  key: z.string().min(1), name: z.string().min(1), description: z.string().nullish(), units: z.string().nullish(), format: z.string().nullish(),
  is_count: z.boolean().nullish(), keywords: z.string().nullish(), team: z.string().nullish(), datasets: z.array(Dataset).nullish(),
}).passthrough();
const TopicsPage = z.object({ next: z.string().nullish(), results: z.array(Topic) }).passthrough();
const Row = z.object({ g: z.string(), l: z.string(), a: z.string(), p: z.string(), d: z.string(), v: z.number().nullable(), se: z.number().nullish() }).passthrough();
const DataPage = z.object({ results: z.array(Row) }).passthrough();

const clean = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
const decimalsOf = (format: string | null | undefined) => Number(/(\d+)\s+decimal/.exec(format ?? "")?.[1] ?? 0);

export function parseTopicsPage(json: unknown): { next: string | null; topics: HealthTopic[] } {
  const p = TopicsPage.safeParse(json);
  if (!p.success) throw new Error("Health Compass topics changed shape");
  const topics = p.data.results.map((t) => ({
    key: t.key, name: clean(t.name), description: clean(t.description), units: clean(t.units), decimals: decimalsOf(t.format),
    isCount: Boolean(t.is_count), keywords: clean(t.keywords), team: t.team ?? null,
    sources: [...new Set((t.datasets ?? []).map((d) => [clean(d.source), clean(d.dataset?.name), clean(d.notes)].filter(Boolean).join(" · ")).filter(Boolean))],
  }));
  return { next: p.data.next ?? null, topics };
}

export function parseDataPage(json: unknown): RawRow[] {
  const p = DataPage.safeParse(json);
  if (!p.success) throw new Error("Health Compass figures changed shape");
  return p.data.results.map(({ g, l, a, p: pop, d, v, se }) => ({ g, l, a, p: pop, d, v, se: se ?? null }));
}

const PERIOD = /^(\d{4})(?:-(\d{4}))?$/;
const end = (d: string) => Number(PERIOD.exec(d)![2] ?? PERIOD.exec(d)![1]);
const span = (d: string) => end(d) - Number(PERIOD.exec(d)![1]);

// One figure per topic for a place: the whole population, the newest end year, and on a tie the longer (steadier) span.
// prefer names a period per topic (the ZIPs' own, for the county and city), taken when the place has it, so a ZIP is
// never compared with a county figure from another year when a same-year one exists.
export function pickFigures(rows: RawRow[], prefer: Record<string, string> = {}): HealthFigure[] {
  const best = new Map<string, RawRow>();
  for (const r of rows) {
    if (r.p !== "" || r.v === null || !Number.isFinite(r.v) || !PERIOD.test(r.d)) continue;
    const b = best.get(r.a);
    const want = prefer[r.a];
    if (b && want && b.d === want) continue;
    if (!b || (want && r.d === want) || end(r.d) > end(b.d) || (end(r.d) === end(b.d) && span(r.d) > span(b.d))) best.set(r.a, r);
  }
  return [...best.values()].sort((x, y) => x.a.localeCompare(y.a)).map((r) => ({ topic: r.a, period: r.d, value: r.v as number, se: r.se ?? null }));
}

// Each topic's most common period among some figures (ties: the newer end year).
export function modalPeriods(figures: HealthFigure[]): Record<string, string> {
  const counts = new Map<string, Map<string, number>>();
  for (const f of figures) {
    const c = counts.get(f.topic) ?? new Map<string, number>();
    c.set(f.period, (c.get(f.period) ?? 0) + 1);
    counts.set(f.topic, c);
  }
  return Object.fromEntries([...counts].map(([topic, c]) => [topic, [...c].sort((x, y) => y[1] - x[1] || end(y[0]) - end(x[0]))[0][0]]));
}

// The credit every Health Compass figure keeps, wherever it goes (spec §6). Sources are Health Compass's own words.
export const creditLines = (t: HealthTopic, period: string): string[] => [
  HC_CREDIT,
  ...(t.sources.length ? [`Source: ${t.sources.join("; ")}`] : []),
  `Period: ${period}`,
  topicUrl(t.key),
];

// The places Ask keeps figures for: every county ZIP, the county and the city.
export const healthTargets = (): { layer: HealthLayer; geo: string }[] => [
  ...Object.keys(COUNTY_ZIPS).map((geo) => ({ layer: "zip" as const, geo })),
  { layer: "county", geo: COUNTY_GEO },
  { layer: "place", geo: CITY_GEO },
];

// The week's copy from what the download script uploaded: Health Compass's own answers, parsed and picked here so the
// rules live in one place. ZIPs first; the county and city take each topic's most common ZIP period when they have it.
// Every place must be present: a partial week is refused, never stored.
export function buildCopy(topicPages: unknown, uploaded: unknown): { topics: HealthTopic[]; places: { layer: HealthLayer; geo: string; figures: HealthFigure[] }[] } {
  if (!Array.isArray(topicPages) || !Array.isArray(uploaded)) throw new Error("Health Compass upload changed shape");
  const topics = topicPages.flatMap((p) => parseTopicsPage(p).topics);
  if (!topics.length) throw new Error("Health Compass listed no topics");
  const byGeo = new Map(uploaded.map((p) => [String((p as { geo?: unknown } | null)?.geo), p as { data?: unknown }]));
  const raw = healthTargets().map((t) => {
    const p = byGeo.get(t.geo);
    if (!p) throw new Error(`Health Compass upload is missing ${t.geo}`);
    return { ...t, rows: parseDataPage(p.data) };
  });
  const zipFigures = raw.filter((p) => p.layer === "zip").map((p) => ({ layer: p.layer, geo: p.geo, figures: pickFigures(p.rows) }));
  const prefer = modalPeriods(zipFigures.flatMap((p) => p.figures));
  const places = [...zipFigures, ...raw.filter((p) => p.layer !== "zip").map((p) => ({ layer: p.layer, geo: p.geo, figures: pickFigures(p.rows, prefer) }))];
  const onZips = new Set(zipFigures.flatMap((p) => p.figures.map((f) => f.topic)));
  const kept = topics.filter((t) => onZips.has(t.key));
  if (!kept.length) throw new Error("no topic had a ZIP figure");
  const keys = new Set(kept.map((t) => t.key));
  return { topics: kept, places: places.map((p) => ({ ...p, figures: p.figures.filter((f) => keys.has(f.topic)) })) };
}
