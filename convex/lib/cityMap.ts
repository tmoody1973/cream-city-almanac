// Where incidents happened, as quarter-mile areas: a fixed grid, three bands, exact counts only from 5 up. The map
// never gets a coordinate or an address; NIBRS publishes exact addresses, so these squares are the finest it shows.
export const CELL = { dLat: 0.0036, dLon: 0.0049 } as const;

export const cellOf = (lat: number, lon: number) => `${Math.floor(lat / CELL.dLat)},${Math.floor(lon / CELL.dLon)}`;
export const band = (n: number): 1 | 2 | 3 => (n < 5 ? 1 : n < 20 ? 2 : 3);

export type MapCell = { i: number; j: number; band: 1 | 2 | 3; n?: number };
export type MapData = {
  size: typeof CELL;
  cells: MapCell[];
  summary: { total: number; areas: number; fivePlus: number; busiest: number };
  area: string | null;
};

export function toMapData(counts: Map<string, number>, area: string | null): MapData {
  const cells: MapCell[] = [];
  let total = 0, fivePlus = 0, busiest = 0;
  for (const [key, n] of counts) {
    if (n <= 0) continue;
    const [i, j] = key.split(",").map(Number);
    cells.push(n >= 5 ? { i, j, band: band(n), n } : { i, j, band: 1 });
    total += n;
    if (n >= 5) fivePlus++;
    // busiest counts only areas of 5 or more: otherwise it would reveal an exact count under 5.
    if (n >= 5) busiest = Math.max(busiest, n);
  }
  return { size: CELL, cells, summary: { total, areas: cells.length, fivePlus, busiest }, area };
}
