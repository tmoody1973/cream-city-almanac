import type { FollowUp } from "@/ui/components/FollowUps";
import type { Header, NRankDetail, NRelateDetail, NRow } from "@/convex/tracts";
import type { NFigure } from "@/convex/lib/neighborhoodFigures";
import { exported, safeName, type CardExport, type Ctx } from "./cardExport";
import { plainMeaning, rangeText, unitOf, valueText } from "./tractFormat";

// Neighborhood answers' words and export (spec 2026-10-15-neighborhood-answers §6). Code writes every sentence and
// figure; names, never dataset codes or column names, appear in the words (codes stay in links and the CSV).
export type NDetail = NRankDetail | NRelateDetail;
export const CITY_NEIGHBORHOODS_LAYER = "https://milwaukeemaps.milwaukee.gov/arcgis/rest/services/planning/special_districts/MapServer/4";
const SITE = "https://www.creamcityalmanac.app";

const plain = (h: Pick<Header, "name">) => h.name.replace(/\s*\([^)]*\)/g, "").toLowerCase();
// Units come from DYCU's own words for the column, as on the tract cards: a "rate" can be per 1,000, not a percent.
const num = (v: number, h: Header) => valueText(v, unitOf(h.meaning));
function fig(f: Pick<NFigure, "value" | "lo" | "hi"> | null, h: Header): string {
  if (!f) return "—";
  const t = rangeText(f, unitOf(h.meaning));
  return f.lo === null || f.hi === null ? `${t.value} (no range published)` : t.span ? `${t.value} ${t.span}` : t.value;
}
const VERDICT = { higher: "clearly higher", lower: "clearly lower", same: "about the same", uncertain: "too uncertain to say", "no-range": "no range published" } as const;
const verdict = (r: NRow) => (r.verdict ? VERDICT[r.verdict] : "—");
const names = (rs: { name: string }[]) => `${rs.slice(0, 3).map((r) => r.name).join(", ")}${rs.length > 3 ? ` and ${rs.length - 3} more` : ""}`;

export function nLead(r: NDetail): { strong: string; rest: string | null } {
  if (r.tool === "rank-n") return { strong: `${r.direction === "high" ? "Highest" : "Lowest"} ${plain(r.header)}: ${names(r.top)}.`, rest: null };
  const a = plain(r.a), b = plain(r.b);
  if (r.mode === "relate") {
    if (r.strength === "too-few") return { strong: "Too few neighborhoods have both figures to say.", rest: null };
    if (r.strength === "little") return { strong: `Across neighborhoods, ${a} and ${b} show little pattern.`, rest: null };
    return { strong: `Neighborhoods with higher ${a} tend to have ${r.direction} ${b} (a ${r.strength} pattern).`, rest: null };
  }
  if (r.cutA === undefined) return { strong: "Too few neighborhoods have both figures to say.", rest: null };
  const phrase = `${r.aSide ?? "high"} ${a} with ${r.bSide ?? "low"} ${b}`;
  if (r.fits.length) return { strong: `${r.fits.length === 1 ? "Clearest lead" : "Clear matches"}: ${names(r.fits)}.`, rest: r.close.length ? `Possible: ${names(r.close)}.` : null };
  if (r.close.length) return { strong: `No neighborhood clearly has ${phrase}. Possible: ${names(r.close)}.`, rest: null };
  return { strong: `No neighborhood has ${phrase}.`, rest: null };
}

export const cityLine = (r: NDetail): string | null => {
  const city = r.tool === "rank-n" ? r.city : r.city.b;
  const h = r.tool === "rank-n" ? r.header : r.b;
  return city ? `City of Milwaukee: ${fig(city, h)}.` : null;
};

export function nTable(r: NDetail): { head: string[]; rows: string[][] } {
  if (r.tool === "rank-n") return { head: ["Neighborhood", r.header.name, "Compared with the city"], rows: r.top.map((x) => [x.name, fig(x, r.header), verdict(x)]) };
  const rows = [...r.fits.map((p) => [p.name, fig(p.a, r.a), fig(p.b, r.b), "clear match"]), ...r.close.map((p) => [p.name, fig(p.a, r.a), fig(p.b, r.b), "possible match"])];
  return { head: ["Neighborhood", r.a.name, r.b.name, "Match"], rows };
}

const headers = (r: NDetail) => (r.tool === "rank-n" ? [r.header] : [r.a, r.b]);
// The card counts the small neighborhoods and names three (Tarik, 2026-10-15: most are parks and institutions); the
// export (full) names them all.
function smallNote(small: { name: string }[], full: boolean): string {
  if (full || small.length <= 3) return `Left out (fewer than 1,000 residents): ${small.map((s) => s.name).join(", ")}.`;
  return `Left out: ${small.length} neighborhoods with fewer than 1,000 residents (${small.slice(0, 3).map((s) => s.name).join(", ")} and ${small.length - 3} more).`;
}

// DYCU's meanings start "Estimate - percentage of …"; the card reads "Percentage of …".
const meaningText = (m: string) => plainMeaning(m).replace(/^estimate\s*-\s*/i, "").replace(/^./, (c) => c.toUpperCase());
// "90% confidence (Census)" → "Ranges are the Census Bureau's margins of error, at 90% confidence."
function rangeNote(conf: string): string {
  const m = conf.match(/^(\d+%) confidence \((.+)\)$/);
  if (!m) return `Ranges are the margins of error: ${conf}.`;
  return `Ranges are the ${m[2] === "Census" ? "Census Bureau" : m[2]}'s margins of error, at ${m[1]} confidence.`;
}

export function nNotes(r: NDetail, full = false): string[] {
  const out = headers(r).map((h) => `${h.name}: ${meaningText(h.meaning)}`);
  out.push("Neighborhood figures are built from census areas, weighted by how many residents live in each part, so they're approximate.");
  if (r.tool === "relate-n" && r.mode === "mismatch" && r.cutA !== undefined) {
    out.push(`${r.aSide === "low" ? "Low" : "High"} ${plain(r.a)}: the third of neighborhoods with the ${r.aSide === "low" ? "least" : "most"} (${r.aSide === "low" ? "at or below" : "at or above"} ${num(r.cutA, r.a)}). ${r.bSide === "high" ? "High" : "Low"} ${plain(r.b)}: ${r.bSide === "high" ? "above" : "below"} the city's figure. "Clear" means a neighborhood's whole range is past both lines.`);
  } else {
    out.push("“Clearly higher” or “lower” means the neighborhood's whole range is above or below the city's figure.");
  }
  const conf = headers(r)[0].confidence;
  if (conf) out.push(rangeNote(conf));
  if (r.small.length) out.push(smallNote(r.small, full));
  const thin = r.thin ?? []; // answers stored before this field existed have none
  if (thin.length) out.push(`Left out (too little data): ${thin.join(", ")}.`);
  const uncertain = r.tool === "rank-n" ? r.uncertain.map((x) => x.name) : r.uncertain;
  if (uncertain.length) out.push(`Too uncertain to place: ${names(uncertain.map((name) => ({ name })))}.`);
  // One census area means its whole range, which is why a high figure can still be "about the same".
  const single = (r.tool === "rank-n" ? r.top : [...r.fits, ...r.close].map((p) => p.a)).filter((x) => x.tracts === 1);
  if (single.length) out.push(`${names(single)} ${single.length === 1 ? "comes" : "come"} from a single census area, so ${single.length === 1 ? "its range is" : "their ranges are"} wide.`);
  return out;
}

const credits = (r: NDetail) => headers(r).map((h) => `Data You Can Use: ${h.name}, ${h.place} ${h.year}. ${SITE}/d/${h.code}`);

// The City's neighborhood layer names areas in capitals ("HARAMBEE"); the stored names are title case.
export function nMap(r: NDetail): { url: string; fits: string[]; close: string[]; field: string; noun: string } | null {
  const fits = (r.tool === "rank-n" ? r.top : r.fits).map((x) => x.name.toUpperCase());
  const close = r.tool === "rank-n" ? [] : r.close.map((x) => x.name.toUpperCase());
  return fits.length || close.length ? { url: CITY_NEIGHBORHOODS_LAYER, fits, close, field: "NEIGHBORHD", noun: "neighborhood" } : null;
}

export function nExport(r: NDetail, ctx: Ctx): CardExport {
  const lead = nLead(r);
  const t = nTable(r);
  const raw = (f: NFigure | null) => [f?.value ?? null, f?.lo ?? null, f?.hi ?? null, f?.residents ?? null];
  const rows = r.tool === "rank-n" ? r.top.map((x) => [x.name, ...raw(x), x.verdict ?? ""]) : [...r.fits, ...r.close].map((p) => [p.name, ...raw(p.a), ...raw(p.b)]);
  const head = r.tool === "rank-n"
    ? ["Neighborhood", r.header.name, "Range low", "Range high", "Residents", "Compared with the city"]
    : ["Neighborhood", r.a.name, `${r.a.name} low`, `${r.a.name} high`, "Residents", r.b.name, `${r.b.name} low`, `${r.b.name} high`, "Residents"];
  return {
    title: r.tool === "rank-n" ? `Neighborhoods · ${r.header.name}` : `Neighborhoods · ${r.a.name} and ${r.b.name}`,
    lines: [lead.rest ? `${lead.strong} ${lead.rest}` : lead.strong, ...(cityLine(r) ? [cityLine(r) as string] : [])],
    csv: { head, rows },
    text: t,
    notes: [...nNotes(r, true), ...credits(r), exported(ctx)],
    filename: safeName(["neighborhoods", ...headers(r).map((h) => h.code)]),
  };
}

type RankArgs = { code: string; column: string; place: string; year: string; direction?: string };
type RelateArgs = { a: { code: string; column: string }; b: { code: string; column: string }; place: string; year: string; mode: "relate" | "mismatch"; aSide?: "high" | "low"; bSide?: "high" | "low" };

// The same question by census tract, with the codes and columns spelled out so the tract tool gets them right.
export function nFollowUps(args: RankArgs | RelateArgs, r: NDetail): FollowUp[] {
  if (r.tool === "rank-n") {
    const a = args as RankArgs;
    return [{ label: "BY CENSUS AREA", question: `Rank census tracts by ${r.header.name} (${a.code}, ${a.column}, ${a.place} ${a.year}), by census tract.` }];
  }
  const a = args as RelateArgs;
  const ids = `(${a.a.code} ${a.a.column}, ${a.b.code} ${a.b.column}, ${a.place} ${a.year})`;
  const question = r.mode === "mismatch"
    ? `Which census tracts have ${a.aSide ?? "high"} ${r.a.name} but ${a.bSide ?? "low"} ${r.b.name} ${ids}? By census tract.`
    : `Do ${r.a.name} and ${r.b.name} go together across census tracts ${ids}? By census tract.`;
  return [{ label: "BY CENSUS AREA", question }];
}
