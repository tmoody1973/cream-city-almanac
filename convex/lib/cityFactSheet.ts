import { shareOf, sumOf, versus, type Est } from "./factMath";
import { cityFigure, FACTS, type Figure, type Headline } from "./factSheet";
import { MIN_RESIDENTS } from "./neighborhoodFigures";

// A City neighborhood's fact sheet figures, built from census tracts (spec 2026-10-16-city-neighborhood-fact-sheets §5).
// Each tract counts by the share of its land in the neighborhood (0–100), which assumes residents spread evenly in it.
export type Piece = { geoid: string; share: number };
export const BUILT_PEOPLE_MEANING = "Residents, from the Census Bureau's census tract counts, each tract shared out by its land in the neighborhood.";

const scaled = (e: Est, f: number): Est => ({ estimate: e.estimate * f, moe: e.moe === null ? null : e.moe * f });

export function buildCityFigures(pieces: Piece[], values: Map<string, Record<string, Est>>, pops: Map<string, number>, city: Record<string, Est> | undefined):
  { status: "small"; people: number } | { status: "ok"; people: number; headlines: Headline[] } {
  const residents = (p: Piece) => (pops.get(p.geoid) ?? 0) * (p.share / 100);
  const people = Math.round(pieces.reduce((t, p) => t + residents(p), 0));
  if (people < MIN_RESIDENTS) return { status: "small", people };
  const headlines = FACTS.map((e): Headline => {
    if (!e.census) {
      const hood: Figure = { rate: null, count: { estimate: people, moe: null }, of: null };
      return { id: e.id, label: e.label, meaning: BUILT_PEOPLE_MEANING, isCount: true, hood, city: null, verdict: "unknown" };
    }
    const pick = e.census;
    const codes = [...pick.parts, pick.of];
    const usable = pieces.filter((p) => codes.every((c) => values.get(p.geoid)?.[c]));
    // The thin rule (decision 052): tracts with every value must hold at least half of the residents.
    const covered = usable.reduce((t, p) => t + residents(p), 0);
    const total = (code: string) => sumOf(usable.map((p) => scaled(values.get(p.geoid)![code], p.share / 100)));
    let hood: Figure | null = null;
    if (usable.length && covered >= people / 2) {
      const count = sumOf(pick.parts.map(total));
      const of = total(pick.of);
      hood = { rate: shareOf(count, of), count, of };
    }
    const c = cityFigure(e, city);
    return { id: e.id, label: e.label, meaning: e.meaning, isCount: false, hood, city: c, verdict: hood?.rate && c?.rate ? versus(hood.rate, c.rate) : "unknown" };
  });
  return { status: "ok", people, headlines };
}
