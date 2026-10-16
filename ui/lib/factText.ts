import type { Est, Verdict } from "@/convex/lib/factMath";
import type { Figure, Headline } from "@/convex/lib/factSheet";
import type { PortraitTable } from "@/convex/lib/factSheet";
import { exported, safeName, type CardExport, type Ctx } from "./cardExport";
import { formatPortraitMargin, formatPortraitNumber } from "./portrait";

export const NOTE_APPROX = "The neighborhood is part of the city, so this comparison is approximate.";
export const CENSUS_SOURCE = "U.S. Census Bureau, American Community Survey 5-year estimates, City of Milwaukee";
export const MARGIN_NOTE = "Figures are survey estimates; margins of error are at 90% confidence.";
export const MISSING = "Not in DYCU's file for this year";
export const NO_CITY = "City figure unavailable";
export const BUILT_SOURCE = (period: string) => `U.S. Census Bureau, ${period} American Community Survey · built from census tracts`;
export const builtNote = (name: string, tracts: number) =>
  `Built from ${tracts} census tract${tracts === 1 ? "" : "s"}, each counted by the share of its land in ${name}. Approximate: it assumes residents are spread evenly within a tract. Ranges are the Census Bureau's margins of error, at 90% confidence.`;
export const smallLine = (people: number) => `Too few residents (about ${people.toLocaleString("en-US")}) for reliable Census figures.`;
export const MISSING_BUILT = "Too few census answers here";
const n = (x: number) => Math.round(x).toLocaleString("en-US");
export const pct = (e: Est | null) => (e ? `${(e.estimate * 100).toFixed(1)}%` : "—");
export const margin = (e: Est | null) => (e?.moe === null || e?.moe === undefined ? "" : `± ${(e.moe * 100).toFixed(1)} points`);
export const countLine = (f: Figure) => (f.of ? `${n(f.count.estimate)} of ${n(f.of.estimate)}` : n(f.count.estimate));
const VERDICT: Record<Verdict, string> = { higher: "clearly higher than the city", lower: "clearly lower than the city", same: "about the same as the city (within the margin of error)", unknown: "" };
export const verdictText = (v: Verdict) => VERDICT[v];

type SheetOk = { name: string; slug: string; year: number; period: string; headlines: Headline[]; source: { title: string; landingPage: string } | null; built?: { tracts: number } };
export function factSheetExport(s: SheetOk, ctx: Ctx): CardExport {
  const rows = s.headlines.map((h) => [h.label, h.isCount ? "people" : "share (0 to 1)", h.hood?.rate?.estimate ?? h.hood?.count.estimate ?? null, h.hood?.rate?.moe ?? h.hood?.count.moe ?? null, h.city?.rate?.estimate ?? null, h.city?.rate?.moe ?? null, verdictText(h.verdict), h.hood?.count.estimate ?? null, h.hood?.of?.estimate ?? null]);
  return {
    title: `${s.name} fact sheet · ${s.period}`,
    lines: [`${s.name}, ${s.period} American Community Survey`, NOTE_APPROX, MARGIN_NOTE],
    csv: { head: ["Figure", "Unit", s.name, `${s.name} margin`, "City of Milwaukee", "City margin", "Compared with the city", `${s.name} count`, "Out of"], rows },
    text: { head: ["Figure", s.name, "City of Milwaukee", "Compared with the city"], rows: s.headlines.map((h) => [h.label, h.isCount ? (h.hood ? countLine(h.hood) : MISSING) : h.hood?.rate ? `${pct(h.hood.rate)} ${margin(h.hood.rate)}` : MISSING, h.isCount ? "" : h.city?.rate ? `${pct(h.city.rate)} ${margin(h.city.rate)}` : NO_CITY, verdictText(h.verdict)]) },
    notes: s.built
      ? [`Source: ${BUILT_SOURCE(s.period)}.`, builtNote(s.name, s.built.tracts), `City figures: ${CENSUS_SOURCE}, ${s.period}.`, `Sheet: ${ctx.origin}/n/${s.slug}`, exported(ctx)]
      : [`Source: Data You Can Use, ${s.source?.title}: ${s.source?.landingPage}`, `City figures: ${CENSUS_SOURCE}, ${s.period}.`, `Sheet: ${ctx.origin}/n/${s.slug}?year=${s.year}`, exported(ctx)],
    filename: safeName(["fact-sheet", s.slug, String(s.year)]),
  };
}

// The population note is true only when the age table has Male and Female columns (2022–2024); 2021 has one total column.
export function populationNote(tables: Pick<PortraitTable, "slug" | "groups">[]): string | null {
  const t = tables.find((x) => x.slug === "sex-and-age");
  return t && t.groups.length > 1 ? "People: DYCU's Total column is blank in its file, so this adds its Male and Female columns." : null;
}

// One of DYCU's table cells, formatted like the dataset sheet (thousands separators; a text margin shown as written).
export function portraitCell(v: { estimate: string; moe: string | null } | null): string {
  if (!v) return "";
  const n = formatPortraitNumber(v.estimate);
  return v.moe === null || v.moe.trim() === "" ? n : `${n} ${formatPortraitMargin(v.moe)}`;
}
