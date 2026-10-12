// A tract's DYCU areas for a year, from the translator's definitions (DYCU's reports name the tracts). A tract can be
// in several (1860 is in Harambee, Hillside and Lindsay Heights); most tracts are in none, and the card shows "—".
export type DycuDef = { name: string; tracts?: { years: number[]; tracts: string[] }[] };

export const neighborhoodsFor = (tract: string, year: number, defs: DycuDef[]): string[] =>
  defs.filter((d) => (d.tracts ?? []).some((e) => e.years.includes(year) && e.tracts.includes(tract))).map((d) => d.name);

// The newest year DYCU's definitions cover: names for figures from a year DYCU hasn't defined (the City's current file).
export const latestDefYear = (defs: DycuDef[]) => Math.max(0, ...defs.flatMap((d) => (d.tracts ?? []).flatMap((e) => e.years)));

// The years DYCU defines an area for, oldest first: what a "no tracts this year" refusal names.
export const areaYears = (defs: DycuDef[], name: string): number[] =>
  [...new Set(defs.filter((d) => d.name === name).flatMap((d) => (d.tracts ?? []).flatMap((e) => e.years)))].sort((a, b) => a - b);
