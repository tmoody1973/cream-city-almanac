import type { MapData } from "@/convex/lib/cityMap";

const r6 = (x: number) => Math.round(x * 1e6) / 1e6;

export function cellsToGeoJSON(d: MapData): GeoJSON.FeatureCollection<GeoJSON.Polygon, { band: number; label: string }> {
  return {
    type: "FeatureCollection",
    features: d.cells.map((c) => {
      const [y0, x0] = [r6(c.i * d.size.dLat), r6(c.j * d.size.dLon)];
      const [y1, x1] = [r6(y0 + d.size.dLat), r6(x0 + d.size.dLon)];
      return { type: "Feature", properties: { band: c.band, label: c.n ? String(c.n) : "1–4" }, geometry: { type: "Polygon", coordinates: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]] } };
    }),
  };
}

export function summarySentence(d: MapData, count: number): string {
  const s = d.summary;
  const head = `${s.total.toLocaleString("en-US")} records in ${s.areas} quarter-mile areas;`;
  // No area reached 5, so "busiest" is 0 by design: naming it would hint at an exact small count.
  const base = s.fivePlus === 0 ? `${head} none had 5 or more.` : `${head} ${s.fivePlus} had 5 or more (busiest: ${s.busiest}).`;
  const off = count - s.total;
  return off > 0 ? `${base} ${off.toLocaleString("en-US")} without a location aren't on the map.` : base;
}

// The 20-or-more band's opacity: the map layer and the key swatch both read this, so they can't drift apart.
export const SOLID_OPACITY = 0.7;

// What a square says when hovered or tapped: its count from 5 up, the "1–4" band below (the feature's label).
export const cellPopupText = (label: string) => `${label} in this area`;
