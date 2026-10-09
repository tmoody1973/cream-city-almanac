import { searchTextFor } from "./families";
import { slug } from "./titles";
import type { Family, HubItem, Member } from "./types";

// City of Milwaukee datasets: "(Current)" and "(Historical)" versions are one family; election files ("2016 Nov 8,
// County Clerk") group by election date. Daily feeds are LIVE: dated by their newest creation, so the daily refresh
// doesn't flood "Updated this season" (a column change re-dates them, in the build's profile step).
export const LIVE_DAYS = 7;
const VERSION = /\s*\((current|historical)\)\s*$/i;
const ELECTION = /^\s*(\d{4}) ([A-Z][a-z]{2}) (\d{1,2})\s*,/;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const GROUP_TOPIC: [RegExp, string][] = [
  [/election/i, "Elections"],
  [/public safety/i, "Public Safety"],
  [/housing|property/i, "Housing"],
  [/city services/i, "City Services"],
  [/maps?\b/i, "Maps"],
];

export function cityTopic(groups: string[]): string {
  for (const [re, topic] of GROUP_TOPIC) if (groups.some((g) => re.test(g))) return topic;
  return "Other";
}

// The member counts and the profile read from: Current and Historical tie on `modified` (both refresh nightly), so a
// "(Current)" title wins; otherwise the newest modified. Only members with a queryable resource qualify, and the
// sort is stable, so a full tie keeps the catalog's order (the Member doesn't carry `created`).
export function cityRepresentative<M extends { title: string; modified: string; datastoreId?: string | null }>(members: M[]): M | undefined {
  const queryable = members.filter((m) => m.datastoreId);
  return queryable.find((m) => /\(current\)/i.test(m.title)) ?? [...queryable].sort((a, b) => b.modified.localeCompare(a.modified))[0];
}

function keyAndName(title: string): { key: string; name: string; years: number[] } {
  const e = title.match(ELECTION);
  if (e) {
    const month = MONTHS.indexOf(e[2]) + 1;
    const date = `${e[1]}-${String(month).padStart(2, "0")}-${e[3].padStart(2, "0")}`;
    return { key: `city:election-${date}`, name: `Election results, ${e[2]} ${Number(e[3])}, ${e[1]}`, years: [Number(e[1])] };
  }
  const name = title.replace(VERSION, "").trim();
  return { key: `city:${slug(name)}`, name, years: [] };
}

export function groupCityItems(items: HubItem[], now: Date): Family[] {
  const groups = new Map<string, { name: string; years: Set<number>; items: HubItem[] }>();
  for (const item of items) {
    const { key, name, years } = keyAndName(item.title);
    const g = groups.get(key) ?? { name, years: new Set<number>(), items: [] };
    years.forEach((y) => g.years.add(y));
    g.items.push(item);
    groups.set(key, g);
  }
  const liveSince = new Date(now.getTime() - LIVE_DAYS * 86_400_000).toISOString();
  return [...groups.entries()].map(([key, g]) => {
    const members: Member[] = g.items.map((i) => ({
      hubId: i.hubId, kind: i.kind, title: i.title, landingPage: i.landingPage, place: "City",
      years: [...g.years], yearLabel: g.years.size ? [...g.years].join(", ") : null, modified: i.modified,
      featureServerUrl: null, downloads: i.downloads, description: i.description, keywords: i.keywords,
      source: "city", datastoreId: i.datastoreId ?? null,
    }));
    const live = g.items.some((i) => i.datastoreId && i.modified >= liveSince);
    const newest = (pick: (i: HubItem) => string) => g.items.reduce((max, i) => (pick(i) > max ? pick(i) : max), "");
    const base = {
      key, name: g.name, kind: "dataset" as const, topic: cityTopic(g.items.flatMap((i) => i.groups ?? [])),
      keywords: [...new Set(g.items.flatMap((i) => i.keywords))], places: ["City"], years: [...g.years].sort(),
      latestModified: live ? newest((i) => i.created ?? i.modified) : newest((i) => i.modified),
      members, source: "city" as const, live,
    };
    return { ...base, baseSearchText: searchTextFor(base) };
  }).sort((a, b) => a.key.localeCompare(b.key));
}
