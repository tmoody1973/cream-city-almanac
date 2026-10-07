import type { ParsedTitle } from "./types";

const TYPOS: [RegExp, string][] = [
  [/Miwlaukee/g, "Milwaukee"],
  [/Visisted/g, "Visited"],
  [/Prevelance/g, "Prevalence"],
  [/Spreadhseet/g, "Spreadsheet"],
];

// Same measure published under two names. Keys and values are lowercase.
const MEASURE_ALIASES: Record<string, string> = {
  "school proficiency rates": "school proficiency",
};

const YEAR_PREFIX = /^(\d{4})(?:\s*-\s*(\d{2,4}))?\s+(.+)$/;
const NEIGHBORHOOD_DOC = /^(.+?) (Neighborhood (?:Portrait Spreadsheet|Portrait|Change Over Time Report))$/;

export function fixTypos(title: string): string {
  return TYPOS.reduce((t, [re, fix]) => t.replace(re, fix), title);
}

export function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function measureKey(measure: string): string {
  const lower = measure.trim().toLowerCase();
  return slug(MEASURE_ALIASES[lower] ?? lower);
}

export function parseYears(start: string, end: string | undefined): { years: number[]; yearLabel: string } {
  const y1 = Number(start);
  if (!end) return { years: [y1], yearLabel: start };
  const y2 = end.length === 2 ? Math.floor(y1 / 100) * 100 + Number(end) : Number(end);
  if (!(y2 >= y1)) return { years: [y1], yearLabel: start };
  const years = y2 - y1 <= 5 ? Array.from({ length: y2 - y1 + 1 }, (_, i) => y1 + i) : [y1, y2];
  return { years, yearLabel: `${start}–${end}` };
}

export function parseTitle(raw: string): ParsedTitle {
  const title = fixTypos(raw).trim();
  const ym = YEAR_PREFIX.exec(title);
  let rest = ym ? ym[3] : title;
  const { years, yearLabel } = ym ? parseYears(ym[1], ym[2]) : { years: [] as number[], yearLabel: null };

  let place: string | null = null;
  if (rest.startsWith("Milwaukee County ")) {
    place = "County";
    rest = rest.slice("Milwaukee County ".length);
  } else if (rest.startsWith("Milwaukee ")) {
    place = "City";
    rest = rest.slice("Milwaukee ".length);
  }

  const nb = NEIGHBORHOOD_DOC.exec(rest);
  if (nb) {
    place = nb[1];
    rest = nb[2];
  }

  const measure = rest.trim();
  return { measure, measureKey: measureKey(measure), place, years, yearLabel };
}
