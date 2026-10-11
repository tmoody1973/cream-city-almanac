// A tract's DYCU neighborhood for a year, from the translator's definitions (DYCU's reports name the tracts). DYCU
// defines its 28 report neighborhoods only, so most tracts have none: the card shows "—", never a guess.
export type DycuDef = { name: string; tracts?: { years: number[]; tracts: string[] }[] };

export function neighborhoodFor(tract: string, year: number, defs: DycuDef[]): string | null {
  for (const d of defs) for (const entry of d.tracts ?? []) if (entry.years.includes(year) && entry.tracts.includes(tract)) return d.name;
  return null;
}

// The newest year DYCU's definitions cover: names for figures from a year DYCU hasn't defined (the City's current file).
export const latestDefYear = (defs: DycuDef[]) => Math.max(0, ...defs.flatMap((d) => (d.tracts ?? []).flatMap((e) => e.years)));
