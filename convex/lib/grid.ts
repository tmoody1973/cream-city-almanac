export interface PlaceYearGrid {
  places: string[];
  years: number[];
  cells: string[];
}

const FIRST = ["City", "County"];
const NO_PLACE = "Milwaukee";

export const cellKey = (place: string, year: number) => `${place}|${year}`;

function placeOrder(a: string, b: string): number {
  const ia = FIRST.indexOf(a);
  const ib = FIRST.indexOf(b);
  if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  return a.localeCompare(b);
}

export function placeYearGrid(members: { place: string | null; years: number[] }[]): PlaceYearGrid {
  const places = [...new Set(members.map((m) => m.place ?? NO_PLACE))].sort(placeOrder);
  const years = [...new Set(members.flatMap((m) => m.years))].sort((a, b) => a - b);
  const cells = [...new Set(members.flatMap((m) => m.years.map((y) => cellKey(m.place ?? NO_PLACE, y))))];
  return { places, years, cells };
}
