import type { CityShare } from "./tractPlaces";
import { isUnreliable, type TractValue } from "./tractStats";

// Tract questions limited to one neighborhood (docs/superpowers/specs/2026-10-12-tracts-by-neighborhood-design.md).
// Pure: no I/O. A tract is in a City neighborhood when its stored share (percent of the tract's area, ≥10) names it;
// DYCU's areas are whole tracts.
export type AreaMap = "city" | "dycu";
export type Area = { name: string; map: AreaMap };
export type AreaHead = Area & { tracts: number; partly: number };
export const PARTLY_UNDER = 90; // under this share, the header line counts a tract as "partly inside"
export const RELATE_MIN = 20; // the "go together" test needs this many tracts (relationship() in tractStats)

export function shareIn(row: { city: CityShare[]; dycu: string[] }, area: Area): number | null {
  if (area.map === "dycu") return row.dycu.includes(area.name) ? 100 : null;
  return row.city.find((c) => c.name === area.name)?.share ?? null;
}

export const areaHead = (area: Area, shares: number[]): AreaHead => ({ ...area, tracts: shares.length, partly: shares.filter((s) => s < PARTLY_UNDER).length });

// Each reliable tract's place across the whole place, in the ranking's direction ("12th highest of 210").
export function placeRanks(values: TractValue[], direction: "high" | "low") {
  const ok = values.filter((v) => !isUnreliable(v)).sort((x, y) => (direction === "high" ? y.value - x.value : x.value - y.value));
  // Equal figures share a place (1, 1, 3): exact City figures tie often.
  return { of: ok.length, position: new Map(ok.map((v) => [v.geoid, ok.findIndex((w) => w.value === v.value) + 1])) };
}
