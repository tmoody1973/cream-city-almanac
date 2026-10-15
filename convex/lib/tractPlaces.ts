import { bboxOf, inBbox, inShape, type Bbox, type Geometry, type Point } from "./geo";

// A tract's City neighborhoods by share of its area (docs/superpowers/specs/2026-10-11-tract-neighborhood-names-design.md).
export type CityShare = { name: string; share: number };
export type Hood = { name: string; geometry: Geometry; bbox: Bbox };

const MIN_SHARE = 10; // percent of the tract
const MIN_POINTS = 200;
const GRIDS = [40, 80, 160];

// Points on a grid over the tract's box that fall inside the tract; a thin tract gets a finer grid.
// ponytail: sampled, about ±2% at 40×40; exact overlap would need a geometry library.
export function insidePoints(tract: Geometry): Point[] {
  const b = bboxOf(tract);
  let inside: Point[] = [];
  for (const n of GRIDS) {
    inside = [];
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const p = { lon: b.minLon + ((i + 0.5) * (b.maxLon - b.minLon)) / n, lat: b.minLat + ((j + 0.5) * (b.maxLat - b.minLat)) / n };
      if (inShape(p, tract)) inside.push(p);
    }
    if (inside.length >= MIN_POINTS) break;
  }
  return inside;
}

// Each point counts for the City neighborhood it falls in; neighborhoods under `min` percent of the tract (10 for display)
// are left out.
export function cityShares(tract: Geometry, hoods: Hood[], min = MIN_SHARE): CityShare[] {
  const inside = insidePoints(tract);
  if (!inside.length) return [];
  const counts = new Map<string, number>();
  for (const p of inside) {
    const h = hoods.find((x) => inBbox(p, x.bbox) && inShape(p, x.geometry));
    if (h) counts.set(h.name, (counts.get(h.name) ?? 0) + 1);
  }
  // Ordered by exact point counts before rounding, so two shares that round equal keep the larger one first.
  return [...counts]
    .sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))
    .map(([name, c]) => ({ name, share: Math.round((100 * c) / inside.length) }))
    .filter((s) => s.share >= min);
}

type Feature = { properties?: { GEOID?: unknown } | null; geometry?: { type?: unknown; coordinates?: unknown } | null };

// DYCU's tract outlines. A truncated answer is refused: a partial match would drop tracts without saying so.
export function parseTractShapes(geojson: unknown): { geoid: string; geometry: Geometry }[] {
  const fc = geojson as { features?: Feature[]; properties?: { exceededTransferLimit?: boolean }; exceededTransferLimit?: boolean } | null;
  if (fc?.properties?.exceededTransferLimit || fc?.exceededTransferLimit) throw new Error("the tract outline list was truncated");
  if (!Array.isArray(fc?.features)) throw new Error("tract outlines returned no features");
  return fc.features.flatMap((f) => {
    const geoid = String(f.properties?.GEOID ?? "");
    const g = f.geometry;
    if (!/^\d{11}$/.test(geoid) || !g || (g.type !== "Polygon" && g.type !== "MultiPolygon") || !Array.isArray(g.coordinates)) return [];
    return [{ geoid, geometry: { type: g.type, coordinates: g.coordinates } as Geometry }];
  });
}

export const allTractsUrl = (featureServerUrl: string) => `${featureServerUrl}/query?where=1%3D1&outFields=GEOID&outSR=4326&f=geojson`;

// E02's newest County map: every county tract, the same outlines the count cards' tract maps use.
export const newestCountyUrl = (members: { place: string; year: string; url: string }[]): string | null =>
  members.filter((m) => m.place === "County").sort((x, y) => Number(y.year.slice(0, 4)) - Number(x.year.slice(0, 4)))[0]?.url ?? null;
