import type { FollowUp } from "@/ui/components/FollowUps";
import type { AreaHead } from "@/convex/lib/tractsIn";

// The words a tract card uses when it is limited to one neighborhood (spec 2026-10-12-tracts-by-neighborhood §5).
type AreaIn = { name: string; map: "city" | "dycu" };
export const areaPhrase = (a: AreaIn) => (a.map === "dycu" ? `DYCU's ${a.name} area` : a.name);
export function areaLine(a: AreaHead): string {
  const which = a.map === "dycu" ? `${a.name} (DYCU's area)` : `${a.name} (City of Milwaukee boundary)`;
  return `${which} · ${a.tracts} ${a.tracts === 1 ? "tract" : "tracts"}${a.partly ? `, ${a.partly} partly inside` : ""}`;
}
export const shareText = (share: number, name: string) => `${share}% of this tract is in ${name}`;
const ordinal = (n: number) => {
  const v = n % 100;
  return `${n}${v >= 11 && v <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th"}`;
};
export const cityRankText = (r: { position: number; of: number }, direction: "high" | "low") => `${ordinal(r.position)} ${direction === "high" ? "highest" : "lowest"} of ${r.of}`;
export const onlyIn = (a: AreaIn) => `Only the tracts in ${areaPhrase(a)}.`;
export const withArea = (items: FollowUp[], area?: AreaIn): FollowUp[] => (area ? items.map((f) => ({ ...f, question: `${f.question} ${onlyIn(area)}` })) : items);
export function noTractsText(r: { name: string; map: "city" | "dycu"; years?: number[] }): string {
  if (r.map === "dycu") return `DYCU's ${r.name} area has no tracts in this dataset's year${r.years?.length ? `; DYCU defines it for ${r.years.join(", ")}` : ""}.`;
  return `${r.name} covers less than 10% of every census tract it touches, so no tract can stand for it. Try a larger neighborhood nearby, or count City records inside its boundary.`;
}
export const tooFewText = (r: { name: string; n: number; needed: number }) => `Too few tracts in ${r.name} to tell whether these go together (it takes ${r.needed}; ${r.name} has ${r.n}).`;
