// convex/lib/cityPoints.ts
import { inShape, type Geometry } from "./geo";
import { cellOf } from "./cityMap";

// The City returns at most this many rows per query; a full page means the answer would be partial.
export const POINTS_CAP = 32000;

// Counts the records whose point is inside the shape, by group and by quarter-mile cell. Coordinates are only read here, never kept.
export function tallyPoints(rows: { lat: unknown; lon: unknown; g?: unknown }[], shape: Geometry, multi: boolean) {
  let count = 0;
  const groups = new Map<string, number>();
  const cells = new Map<string, number>();
  for (const r of rows) {
    const lat = r.lat === null || r.lat === undefined ? NaN : Number(r.lat);
    const lon = r.lon === null || r.lon === undefined ? NaN : Number(r.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !inShape({ lat, lon }, shape)) continue;
    count++;
    const key = cellOf(lat, lon);
    cells.set(key, (cells.get(key) ?? 0) + 1);
    if (r.g === undefined) continue;
    const raw = String(r.g ?? "");
    for (const g of multi ? raw.split(";").map((s) => s.trim()).filter(Boolean) : [raw]) groups.set(g, (groups.get(g) ?? 0) + 1);
  }
  return { count, groups, cells };
}

// Same shape as the citywide card: date groups keep the newest (shown oldest first) with an "Earlier" remainder;
// column groups keep the biggest with an "Other" remainder, except when groups overlap (can't be summed).
export function rankGroups(groups: Map<string, number>, byDate: boolean, overlap: boolean, max: number) {
  const all = [...groups.entries()];
  const sorted = byDate ? all.sort((a, b) => b[0].localeCompare(a[0])) : all.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const kept = sorted.slice(0, max);
  const capped = sorted.length > max && !overlap;
  const other = capped ? sorted.slice(max).reduce((s, [, n]) => s + n, 0) : 0;
  return { top: byDate ? kept.reverse() : kept, other, capped };
}
