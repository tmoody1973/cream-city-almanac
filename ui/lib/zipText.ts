import type { ZipAnswer } from "@/lib/ask/tools";
import { exported, safeName, type CardExport, type Ctx } from "./cardExport";
import { margin, pct, verdictText } from "./factText";

// The ZIP card's words and export (spec 2026-10-14-zip-profile §6). Every figure comes from the tool.
export type ZipOk = Extract<ZipAnswer, { status: "ok" }>;
type Row = ZipOk["race"][number];

export const zipTitle = (r: Pick<ZipOk, "zip" | "period">) => `ZIP ${r.zip} · Census estimates, ${r.period}`;
export const zipSource = (period: string) => `U.S. Census Bureau, American Community Survey 5-year estimates, ${period}.`;
export const ZIP_NOTES = [
  "A Census ZIP area is close to, but not exactly, the post office's ZIP.",
  "These are survey estimates; each comes with a margin of error, the range the true number likely falls in (90% confidence).",
];

// Shown unless 95% or more of the ZIP's land is in the City. Land, not people.
export function placeNote(a: { cityShare: number; mainPlace: string }): string | null {
  if (a.cityShare >= 0.95) return null;
  const tail = "These figures cover the whole ZIP.";
  if (a.cityShare === 0) return `None of this ZIP's land is in the City of Milwaukee; the largest part is in ${a.mainPlace}. ${tail}`;
  const share = `About ${Math.round(a.cityShare * 100)}% of this ZIP's land is in the City of Milwaukee`;
  return a.mainPlace === "Milwaukee" ? `${share}; the rest is in neighboring communities. ${tail}` : `${share}; the largest part is in ${a.mainPlace}. ${tail}`;
}

export function zipRefusal(r: Exclude<ZipAnswer, { status: "ok" }>): string {
  switch (r.status) {
    case "outside": return `Ask has Census figures for the ZIP codes that touch Milwaukee County; ${r.zip} isn't one of them. Post-office-box ZIPs have no residents in the Census.`;
    case "bad-zip": return "Give a 5-digit ZIP code, like 53212.";
    case "busy": return "Census figures are busy right now; try again shortly.";
    default: return "Census figures are unavailable right now; try again later.";
  }
}

export const populationLine = (p: ZipOk["population"]) =>
  p ? `${Math.round(p.estimate).toLocaleString("en-US")} people${p.moe === null ? "" : ` (± ${Math.round(p.moe).toLocaleString("en-US")})`}` : "Population unavailable";
export const shareCell = (x: Row) => (x.zip?.rate ? `${pct(x.zip.rate)} ${margin(x.zip.rate)}`.trim() : "—");
export const cityCell = (x: Row) => pct(x.city?.rate ?? null);

// CSV holds the stored values, unrounded, like the fact sheet's: shares 0 to 1 with their margins.
export function zipExport(r: ZipOk, ctx: Ctx): CardExport {
  const rows = [...r.race, ...r.facts];
  const note = placeNote(r);
  return {
    title: zipTitle(r),
    lines: [populationLine(r.population), ...(note ? [note] : [])],
    csv: {
      head: ["Measure", "Unit", `ZIP ${r.zip}`, `ZIP ${r.zip} margin`, "City of Milwaukee", "City margin", "Compared with the city"],
      rows: [
        ["Population", "people", r.population?.estimate ?? null, r.population?.moe ?? null, null, null, ""],
        ...rows.map((x) => [x.label, "share (0 to 1)", x.zip?.rate?.estimate ?? null, x.zip?.rate?.moe ?? null, x.city?.rate?.estimate ?? null, x.city?.rate?.moe ?? null, verdictText(x.verdict)]),
      ],
    },
    text: { head: ["Measure", `ZIP ${r.zip}`, "City of Milwaukee", "Compared with the city"], rows: rows.map((x) => [x.label, shareCell(x), cityCell(x), verdictText(x.verdict)]) },
    notes: [...ZIP_NOTES, zipSource(r.period), exported(ctx)],
    filename: safeName(["zip", r.zip]),
  };
}
