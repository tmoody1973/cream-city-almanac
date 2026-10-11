import type { CityShare } from "@/convex/lib/tractPlaces";

// How a tract's place is said: "mostly" only when one City neighborhood covers at least half the tract.
const MOSTLY = 50;
export const cityWord = (c: CityShare) => `${c.share >= MOSTLY ? "mostly" : "partly"} ${c.name}`;
export const cityList = (city: CityShare[]) => city.map((c) => `${c.name} ${c.share}%`).join(" · ");
// ponytail: `undefined` is a card cached before tracts carried these lists (kept a day); it shows "—".
export const dycuText = (dycu?: string[]) => (dycu?.length ? dycu.join(", ") : "—");

export function placeLabel(city: CityShare[] = [], dycu: string[] = []): string {
  const parts = [city.length ? cityWord(city[0]) : "", dycu.length ? `DYCU: ${dycu.join(", ")}` : ""].filter(Boolean);
  return parts.length ? ` (${parts.join("; ")})` : "";
}
