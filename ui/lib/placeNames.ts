import type { CityShare } from "@/convex/lib/tractPlaces";

// How a tract's place is said: "mostly" only when the first City neighborhood covers at least half the tract and more
// than the next one (an even split is "partly").
const MOSTLY = 50;
export const cityWord = (city: CityShare[]) =>
  `${city[0].share >= MOSTLY && city[0].share > (city[1]?.share ?? 0) ? "mostly" : "partly"} ${city[0].name}`;
// "+2" read aloud: the first name and how many more are folded under it.
export const placesLabel = (city: CityShare[]) =>
  `${city[0].name}, and ${city.length - 1} more City neighborhood${city.length > 2 ? "s" : ""}`;
export const cityList = (city: CityShare[]) => city.map((c) => `${c.name} ${c.share}%`).join(" · ");
// ponytail: `undefined` is a card cached before tracts carried these lists (kept a day); it shows "—".
export const dycuText = (dycu?: string[]) => (dycu?.length ? dycu.join(", ") : "—");

export function placeLabel(city: CityShare[] = [], dycu: string[] = []): string {
  const parts = [city.length ? cityWord(city) : "", dycu.length ? `DYCU: ${dycu.join(", ")}` : ""].filter(Boolean);
  return parts.length ? ` (${parts.join("; ")})` : "";
}
