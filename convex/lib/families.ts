import { topicOf } from "./codes";
import { measureKey, parseTitle } from "./titles";
import type { Card, Family, FamilyInput, HubItem, Member } from "./types";

export interface ItemOverride {
  hubId: string;
  measure: string | null;
  place: string | null;
  years: number[] | null;
}

interface Group {
  names: Map<string, number>;
  latest: { name: string; modified: string };
  members: Member[];
}

export function groupItems(items: HubItem[], overrides: ItemOverride[] = []): Family[] {
  const byHub = new Map(overrides.map((o) => [o.hubId, o]));
  const groups = new Map<string, Group>();

  for (const item of items) {
    const parsed = parseTitle(item.title);
    const o = byHub.get(item.hubId);
    const measure = o?.measure ?? parsed.measure;
    const key = `${item.kind}:${measureKey(measure)}`;
    const member: Member = {
      hubId: item.hubId,
      kind: item.kind,
      title: item.title,
      landingPage: item.landingPage,
      place: o?.place ?? parsed.place,
      years: o?.years ?? parsed.years,
      yearLabel: parsed.yearLabel,
      modified: item.modified,
      featureServerUrl: item.featureServerUrl,
      downloads: item.downloads,
      description: item.description,
      keywords: item.keywords,
    };
    const group: Group = groups.get(key) ?? { names: new Map(), latest: { name: measure, modified: "" }, members: [] };
    group.names.set(measure, (group.names.get(measure) ?? 0) + 1);
    if (item.modified >= group.latest.modified) group.latest = { name: measure, modified: item.modified };
    group.members.push(member);
    groups.set(key, group);
  }

  return [...groups.entries()].map(([key, g]) => toFamily(key, g)).sort((a, b) => a.key.localeCompare(b.key));
}

function toFamily(key: string, g: Group): Family {
  const top = Math.max(...g.names.values());
  const tied = [...g.names.entries()].filter(([, n]) => n === top).map(([name]) => name);
  const name = tied.includes(g.latest.name) ? g.latest.name : [...tied].sort()[0];
  const places = [...new Set(g.members.map((m) => m.place).filter((p): p is string => p !== null))].sort();
  const years = [...new Set(g.members.flatMap((m) => m.years))].sort((a, b) => a - b);
  const base = {
    key,
    name,
    kind: g.members[0].kind,
    topic: topicOf(g.members),
    keywords: byFrequency(g.members.flatMap((m) => m.keywords)),
    places,
    years,
    latestModified: g.members.reduce((max, m) => (m.modified > max ? m.modified : max), ""),
    members: g.members,
  };
  return { ...base, baseSearchText: searchTextFor(base) };
}

function byFrequency(values: string[]): string[] {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([v]) => v);
}

export function searchTextFor(f: {
  name: string;
  places: string[];
  years: number[];
  keywords: string[];
  members: Member[];
}): string {
  const descriptions = [...new Set(f.members.map((m) => m.description.slice(0, 300)).filter(Boolean))];
  return [f.name, f.places.join(" "), f.years.join(" "), f.keywords.join(" "), ...descriptions]
    .join(" ")
    .replace(/\s+/g, " ")
    .slice(0, 8000);
}

export function searchTextWithCard(base: string, card: Pick<Card, "explainer" | "glossary">): string {
  return [base, card.explainer, ...card.glossary.map((g) => `${g.field} ${g.meaning}`)]
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 12000);
}

export function toFamilyInput(f: Family, dictionaryTab: string | null): FamilyInput {
  return { ...f, dictionaryTab };
}

export function isPdfFamily(f: Pick<Family, "key" | "kind">): boolean {
  return f.kind === "document" && !f.key.endsWith("-spreadsheet");
}

// Every item updates one shared progress row (builds), so items must not all finish at once: 180 simultaneous
// updates exhausted Convex's write retries in a real build. Unchanged reports (which just skip) go 250ms apart;
// reports that need a Firecrawl read go spacingMs apart to respect the plan's rate limit.
// ponytail: one hot progress row; per-item outcome rows + a periodic checker if builds grow to thousands of items.
const SKIP_STAGGER_MS = 250;

export function reportDelays(
  reports: { hubId: string; modified: string }[],
  indexed: Map<string, string>,
  spacingMs: number,
): { hubId: string; delayMs: number }[] {
  let readSlot = 0;
  let skipSlot = 0;
  return reports.map((r) =>
    indexed.get(r.hubId) === r.modified
      ? { hubId: r.hubId, delayMs: skipSlot++ * SKIP_STAGGER_MS }
      : { hubId: r.hubId, delayMs: readSlot++ * spacingMs },
  );
}

export interface HubCounts {
  rawData: number;
  reports: number;
  visualizations: number;
}

// Counts members the way the Hub's own Collections filter does: datasets are "Raw Data", documents and the
// Hub's help pages are "Reports", apps are "Visualizations". Lets the home page line up with the Hub exactly.
export function hubCounts(families: Pick<Family, "members">[]): HubCounts {
  const members = families.flatMap((f) => f.members);
  return {
    rawData: members.filter((m) => m.kind === "dataset").length,
    reports: members.filter((m) => m.kind === "document" || m.kind === "page").length,
    visualizations: members.filter((m) => m.kind === "app").length,
  };
}
