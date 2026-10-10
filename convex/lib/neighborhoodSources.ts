import { bboxOf, type Bbox, type Geometry } from "./geo";
import { nameKey, titleCase } from "./neighborhoodNames";
import { placeKey } from "./portrait";

export type CityNeighborhood = { name: string; matchKey: string; geometry: string; bbox: Bbox };
export type DycuNeighborhood = { name: string; matchKey: string; tracts: { years: number[]; tracts: string[] }[] };

type Feature = { properties?: { NEIGHBORHD?: unknown } | null; geometry?: { type?: unknown; coordinates?: unknown } | null };

// The City's 190 official neighborhoods. A feature without a name or a polygon is skipped and named in the notes.
export function parseCityNeighborhoods(geojson: unknown): { rows: CityNeighborhood[]; skipped: string[] } {
  const features = (geojson as { features?: Feature[] } | null)?.features;
  if (!Array.isArray(features)) throw new Error("City neighborhoods layer returned no features");
  const rows: CityNeighborhood[] = [];
  const skipped: string[] = [];
  for (const f of features) {
    const raw = typeof f.properties?.NEIGHBORHD === "string" ? f.properties.NEIGHBORHD.trim() : "";
    const g = f.geometry;
    if (!raw || !g || (g.type !== "Polygon" && g.type !== "MultiPolygon") || !Array.isArray(g.coordinates)) {
      skipped.push(raw || "(unnamed)");
      continue;
    }
    const geometry = { type: g.type, coordinates: g.coordinates } as Geometry;
    const bbox = bboxOf(geometry);
    // bboxOf on a shape with no coordinates returns ±Infinity; such a shape cannot be counted, so it is skipped.
    if (![bbox.minLat, bbox.maxLat, bbox.minLon, bbox.maxLon].every(Number.isFinite)) {
      skipped.push(raw);
      continue;
    }
    rows.push({ name: titleCase(raw), matchKey: nameKey(raw), geometry: JSON.stringify(geometry), bbox });
  }
  return { rows, skipped };
}

// DYCU's reports say "Census tracts 71, 72, 79, 80 and 107 were used to define the Riverwest neighborhood …".
const TRACT = String.raw`\d+(?:\.\d+)?`;
const DEFINITION = new RegExp(
  String.raw`Census tracts? ((?:${TRACT}(?:, and |, | and ))*${TRACT}) (?:were|was) used to define the (.+?)(?: neighborhoods?)? for the purposes of this report`,
  "g",
);

export function parseDefinitions(text: string): { name: string; tracts: string[] }[] {
  const flat = text.replace(/\s+/g, " ");
  return [...flat.matchAll(DEFINITION)].map((m) => ({
    name: m[2].trim(),
    tracts: (m[1].match(/\d+(?:\.\d+)?/g) ?? []).sort((a, b) => Number(a) - Number(b)),
  }));
}

// DYCU renamed these between report years; each old name has the same tracts as the current one.
// ponytail: hand-kept, add a pair when a new report year renames a neighborhood.
const ALIASES: Record<string, string> = {
  "Layton Boulevard": "Burnham Park, Layton Park and Silver City",
  Westside: "Near West Side",
  "Little Menomonee River": "Little Menomonee River Parkway",
};

// One row per spreadsheet neighborhood (the 28 places DYCU publishes tables for); a new tracts entry only when the
// list changed. Names that match no place, and places with no definition, go in the build notes.
export function buildDycuNeighborhoods(
  found: { name: string; year: number | null; tracts: string[] }[],
  places: string[],
): { rows: DycuNeighborhood[]; notes: string[] } {
  const byKey = new Map(places.map((p) => [placeKey(p), p]));
  const lists = new Map<string, Map<string, Set<number>>>();
  const notes: string[] = [];
  const unmatched = new Set<string>();
  for (const f of found) {
    const key = placeKey(ALIASES[f.name] ?? f.name);
    if (!byKey.has(key)) { unmatched.add(f.name); continue; }
    const versions = lists.get(key) ?? new Map<string, Set<number>>();
    const years = versions.get(f.tracts.join(",")) ?? new Set<number>();
    if (f.year !== null) years.add(f.year);
    versions.set(f.tracts.join(","), years);
    lists.set(key, versions);
  }
  for (const name of unmatched) notes.push(`DYCU definition for "${name}" matches no neighborhood spreadsheet; not stored`);
  const rows: DycuNeighborhood[] = [];
  for (const [key, place] of [...byKey.entries()].sort((a, b) => a[1].localeCompare(b[1]))) {
    const versions = lists.get(key);
    if (!versions) { notes.push(`No DYCU tract definition found for ${place}`); continue; }
    const tracts = [...versions.entries()]
      .map(([list, years]) => ({ years: [...years].sort((a, b) => a - b), tracts: list.split(",") }))
      .sort((a, b) => (a.years[0] ?? 0) - (b.years[0] ?? 0));
    rows.push({ name: place, matchKey: key, tracts });
  }
  return { rows, notes };
}
