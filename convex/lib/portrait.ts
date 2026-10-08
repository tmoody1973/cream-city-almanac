import { readWorkbook, type Sheet } from "./xlsx";

// One DYCU Neighborhood Portrait spreadsheet tab, tidied. Numbers stay exactly as written in DYCU's file.
export interface PortraitValue {
  estimate: string;
  moe: string | null;
}
export interface PortraitRow {
  label: string;
  heading: boolean;
  values: (PortraitValue | null)[];
}
export interface PortraitTable {
  slug: string;
  topic: string;
  tab: string;
  order: number;
  tableIds: string[];
  tableIdText: string;
  vintage: string | null;
  groups: string[];
  rows: PortraitRow[];
  issues: string[];
}

// The 16 topics, in DYCU's tab order. `about` is fixed text (Tarik reviews it in Task 5), never AI-written.
export const TOPICS: { slug: string; topic: string; about: string; aliases?: string[] }[] = [
  { slug: "race-and-ethnicity", topic: "Race and Ethnicity", about: "How many residents identify with each race, and whether they are Hispanic or Latino." },
  { slug: "sex-and-age", topic: "Sex and Age", about: "Residents by age group, for everyone and for males and females." },
  { slug: "poverty-status-by-age", topic: "Poverty Status by Age", about: "How many residents live below the federal poverty line, by age." },
  { slug: "household-characteristics", topic: "Household Characteristics", about: "How households are made up, such as families, people living alone, and household size." },
  { slug: "vehicles-per-household", topic: "Vehicles per Household", about: "How many vehicles households have, including households with none." },
  { slug: "employment-status-by-sex", topic: "Employment Status by Sex", about: "Whether working-age residents are employed, unemployed or not in the labor force, by sex." },
  { slug: "commute-method-and-time", topic: "Commute Method and Time", about: "How workers get to work and how long the trip takes." },
  { slug: "employment-sector", topic: "Employment Sector", about: "The kinds of industries employed residents work in." },
  { slug: "educational-attainment", topic: "Educational Attainment", about: "The highest level of school adults have finished." },
  { slug: "occupancy-and-tenure", topic: "Occupancy and Tenure", about: "How many homes are occupied or vacant, and whether they are owned or rented." },
  { slug: "units-in-structure", topic: "Units in Structure", about: "Homes by building type, from single-family houses to large apartment buildings." },
  { slug: "bedrooms-and-year", topic: "Bedrooms and Year", about: "Homes by number of bedrooms and the year the building was built.", aliases: ["Bedroom and Year"] },
  { slug: "rent-paid", topic: "Rent Paid", about: "What renters pay each month, including utilities (gross rent)." },
  { slug: "mortgage-status-and-cost", topic: "Mortgage Status and Cost (SMOC)", about: "Homeowners' monthly costs, with and without a mortgage (selected monthly owner costs)." },
  { slug: "owner-costs-share-of-income", topic: "Mortgage Status (SMOCAPI)", about: "Homeowners' monthly costs as a share of household income." },
  { slug: "household-income", topic: "Household Income", about: "Households by yearly income range." },
];

const ESTIMATE = /Estimate$/;
const MOE = /(^|[\s.])MOE$/;
const DERIVED = /(%|Percent|(^|[\s.])SE$|(^|[\s.])CV)/;
const TABLE_ID = /\b(?:B|C|S|DP)\d{4,5}[A-Z]?\b/g;

const norm = (s: string) => s.trim().toLowerCase();

export function topicFor(tab: string): { slug: string; topic: string; known: boolean } {
  const t = TOPICS.find((x) => norm(x.topic) === norm(tab) || (x.aliases ?? []).some((a) => norm(a) === norm(tab)));
  if (t) return { slug: t.slug, topic: t.topic, known: true };
  return { slug: norm(tab).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""), topic: tab.trim(), known: false };
}

export function tableIdsOf(text: string): string[] {
  return [...new Set([...text.matchAll(TABLE_ID)].map((m) => m[0]))];
}

// Neighborhood groups are listed in different orders across years; sorted parts make one key.
export function placeKey(place: string): string {
  return place
    .toLowerCase()
    .replace(/[’']/g, "")
    .split(/,|\band\b/)
    .map((p) => p.trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""))
    .filter(Boolean)
    .sort()
    .join("-");
}

export function parsePortrait(bytes: Uint8Array): PortraitTable[] {
  return readWorkbook(bytes).map((sheet, i) => readPortraitSheet(sheet, i));
}

export function readPortraitSheet(sheet: Sheet, order: number): PortraitTable {
  const { slug, topic, known } = topicFor(sheet.name);
  const issues: string[] = known ? [] : ["This tab isn't one we've seen before, so it's shown as found."];
  const cells = sheet.rows.map((r) => r.map((c) => (c ?? "").trim()));
  const h = cells.findIndex((r) => r.slice(1).some((c) => ESTIMATE.test(c)));
  const base = { slug, topic, tab: sheet.name, order, tableIds: [] as string[], tableIdText: "", vintage: null as string | null };
  if (h < 0) return { ...base, groups: [], rows: [], issues: [...issues, "No table header was found in DYCU's file."] };

  const meta = new Map(
    cells.slice(0, h).filter((r) => r[0]).map((r) => [r[0].replace(/:\s*$/, "").toUpperCase(), r[1] ?? ""] as const),
  );
  const header = cells[h];
  // Merged group titles sit one row above the header, starting at each group's Estimate column.
  const titles = h > 0 && !cells[h - 1][0] ? cells[h - 1] : [];
  const starts = header.flatMap((c, i) => (i > 0 && ESTIMATE.test(c) ? [i] : []));
  const groups = starts.map((s, g) => {
    const end = starts[g + 1] ?? header.length;
    const moe = header.findIndex((c, i) => i > s && i < end && MOE.test(c));
    const prefix = header[s].replace(ESTIMATE, "").replace(/[.\s]+$/, "").replace(/\./g, " ").trim();
    return { name: prefix || titles[s] || "", estimate: s, moe: moe < 0 ? null : moe };
  });
  const names = groups.map((g, i) => g.name || (groups.length > 1 ? (i === 0 ? "All" : `Group ${i + 1}`) : ""));

  const body = cells.slice(h + 1).filter((r) => r[0]);
  const rows: PortraitRow[] = body.map((r) => {
    const values = groups.map((g) => {
      const estimate = r[g.estimate] ?? "";
      return estimate === "" ? null : { estimate, moe: g.moe === null ? null : r[g.moe] || null };
    });
    return { label: r[0], heading: values.every((v) => v === null), values };
  });

  const derived = header.flatMap((c, i) => (i > 0 && DERIVED.test(c) ? [i] : []));
  if (body.some((r) => derived.some((i) => (r[i] ?? "").startsWith("#")))) {
    issues.push("Percentages and precision columns have formula errors in DYCU's file, so they aren't shown.");
  }
  names.forEach((name, i) => {
    const estimates = rows.filter((r) => !r.heading).flatMap((r) => (r.values[i] ? [r.values[i]!.estimate] : []));
    if (estimates.length && estimates.every((e) => Number(e) === 0)) {
      issues.push(
        name
          ? `The ${name} columns are 0 for every row in DYCU's file; this may be missing data.`
          : "Every estimate is 0 in DYCU's file; this may be missing data.",
      );
    }
  });
  if (rows.some((r) => r.values.some((v) => v && (v.estimate.startsWith("#") || (v.moe ?? "").startsWith("#"))))) {
    issues.push("Some estimates or margins have errors in DYCU's file; they're shown as written.");
  }

  const tableIdText = meta.get("TABLE ID") ?? "";
  return { ...base, tableIds: tableIdsOf(tableIdText), tableIdText, vintage: meta.get("VINTAGE") || null, groups: names, rows, issues };
}

const MAX_PASSAGE_CHARS = 1500;

// One search passage per neighborhood x year x topic. It leads with the place so a search for it ranks.
export function portraitPassage(place: string, year: number | null, t: PortraitTable): string {
  const lines = t.rows
    .filter((r) => !r.heading)
    .map((r) => {
      const parts = r.values.flatMap((v, i) =>
        v ? [`${t.groups[i] ? `${t.groups[i]} ` : ""}${v.estimate}${v.moe ? ` ± ${v.moe}` : ""}`] : [],
      );
      return `${r.label}: ${parts.join("; ")}`;
    });
  const head = `${place}${year ? ` ${year}` : ""} · ${t.topic}${t.tableIdText ? ` (${t.tableIdText})` : ""}`;
  return [head, ...lines].join("\n").slice(0, MAX_PASSAGE_CHARS);
}
