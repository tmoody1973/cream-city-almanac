// Neighborhood shapes in GeoJSON order ([lon, lat]) and the two tests a count needs: is a point in the rectangle
// around a shape (cheap, done by the City's SQL), and is it inside the shape itself (exact, done here).
export type Point = { lat: number; lon: number };
export type Bbox = { minLat: number; maxLat: number; minLon: number; maxLon: number };
export type Geometry = { type: "Polygon"; coordinates: number[][][] } | { type: "MultiPolygon"; coordinates: number[][][][] };

const parts = (g: Geometry): number[][][][] => (g.type === "Polygon" ? [g.coordinates] : g.coordinates);

export function bboxOf(g: Geometry): Bbox {
  const b = { minLat: Infinity, maxLat: -Infinity, minLon: Infinity, maxLon: -Infinity };
  for (const poly of parts(g)) for (const ring of poly) for (const [lon, lat] of ring) {
    b.minLat = Math.min(b.minLat, lat); b.maxLat = Math.max(b.maxLat, lat);
    b.minLon = Math.min(b.minLon, lon); b.maxLon = Math.max(b.maxLon, lon);
  }
  return b;
}

export const inBbox = (p: Point, b: Bbox) => p.lat >= b.minLat && p.lat <= b.maxLat && p.lon >= b.minLon && p.lon <= b.maxLon;

// Even-odd ray casting across every ring of every part: crossing a hole's ring flips the answer back to outside.
// The half-open comparison (yi > lat) !== (yj > lat) puts a point on a shared edge in exactly one neighbor.
export function inShape(p: Point, g: Geometry): boolean {
  let inside = false;
  for (const poly of parts(g)) for (const ring of poly) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > p.lat !== yj > p.lat && p.lon < ((xj - xi) * (p.lat - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}
