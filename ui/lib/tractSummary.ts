// The one plain-English sentence each tract card leads with (decision 028). Code writes it from the server's verdict and
// counts, never the AI: the figures in it are the card's own, and its words can't overstate what the test found.
import { noMargin, plainMeaning } from "./tractFormat";

type Col = { name: string; column: string; meaning: string; place: string; year: string; confidence: string | null };

const LONGEST = 80; // a meaning longer than this reads as a paragraph, not a name
const COMMON_LEAD = /^(Percentage|Percent|Number|Median|Mean|Average|Total|Rate|Share|Count|Estimated|Proportion)\b/;

// A column's name in a sentence: DYCU's own meaning when it is a short phrase ("percentage of households with income
// below the poverty line"), else the dataset's name and the column. Only a leading word that is plainly a common noun
// is lowered ("Percentage", "Median"), so names ("Hispanic", "Black", "PM2.5") stay as DYCU wrote them.
export function subject(c: Pick<Col, "name" | "column" | "meaning">): string {
  const m = plainMeaning(c.meaning).replace(/^estimate\s*-\s*/i, "").replace(/^the\s+/i, "").trim();
  if (!m || m.length > LONGEST) return `${c.name} (${c.column})`;
  return COMMON_LEAD.test(m) ? m[0].toLowerCase() + m.slice(1) : m;
}

// A plot axis: the same words, capitalized, with the dataset code and column so the reader can find it on the sheet.
export function axisTitle(c: Pick<Col, "name" | "column" | "meaning"> & { code: string }): string {
  const s = subject(c);
  return s === `${c.name} (${c.column})` ? `${c.name} (${c.code} ${c.column})` : `${capital(s)} (${c.code} ${c.column})`;
}

export const placeName = (place: string) => (place === "County" ? "Milwaukee County" : place === "City" ? "the City of Milwaukee" : place);

const isAssessment = (year: string) => /assessment/i.test(year);
const yearIn = (year: string) => (isAssessment(year) ? year : `${year} data`);
// "2023 data" when both sides share a year; otherwise each named: "2026 assessment and 2023 survey".
const yearsIn = (a: { year: string }, b: { year: string }) =>
  a.year === b.year ? yearIn(a.year) : [a, b].map((s) => (isAssessment(s.year) ? s.year : `${s.year} survey`)).join(" and ");

const tracts = (n: number) => `${n} census ${n === 1 ? "tract" : "tracts"}`;
const are = (n: number, one: string, many: string) => `${n} ${n === 1 ? `is ${one}` : `are ${many}`}`;
const capital = (s: string) => s[0].toUpperCase() + s.slice(1);

type Relate = {
  mode: "relate" | "mismatch"; a: Col; b: Col; n: number;
  strength: "too-few" | "little" | "weak" | "moderate" | "strong"; direction: "higher" | "lower";
  aSide?: "high" | "low"; bSide?: "high" | "low"; cutA?: number; cutB?: number; fitsCount: number; closeCount: number;
};

export function relateSummary(r: Relate): string {
  const A = subject(r.a), B = subject(r.b);
  // A property side covers the City only, and its year is an assessment, not a survey.
  const place = r.a.place === "City" || r.b.place === "City" ? "City" : r.a.place;
  const where = `${placeName(place)} (${yearsIn(r.a, r.b)})`;
  if (r.mode === "mismatch") {
    if (r.cutA === undefined || r.cutB === undefined) return "There aren't enough census tracts with reliable figures for both to look for matches.";
    const third = (s?: "high" | "low") => (s === "low" ? "bottom" : "top");
    const looked = `We looked for census tracts in ${where} in the ${third(r.aSide)} third for the ${A} and the ${third(r.bSide)} third for the ${B}.`;
    const bare = noMargin([r.a, r.b]);
    if (bare) return `${looked} ${capital(bare)}, so no tract can be called a clear match.`;
    const close = r.closeCount;
    if (r.fitsCount === 0) return `${looked} Once the survey's margin of error is counted, none is a clear match${close ? `; ${are(close, "a possible match", "possible matches")}` : ""}.`;
    const more = close ? `, and ${close} more ${close === 1 ? "is a possible match" : "are possible matches"}` : "";
    return `${looked} ${are(r.fitsCount, "a clear match", "clear matches")}, even at the edges of the margin of error${more}.`;
  }
  if (r.strength === "too-few") return "There aren't enough census tracts with figures for both to say whether they go together.";
  // n counts the matched tracts with reliable figures on both, not every tract the header counts.
  const across = `Across ${tracts(r.n)} with reliable figures in ${where}`;
  if (r.strength === "little") return `${across}, the ${A} and the ${B} show little relationship.`;
  const tends = r.direction === "higher" ? "higher too" : "lower";
  return `${across}, where the ${A} is higher, the ${B} tends to be ${tends}. The pattern is ${r.strength}. That doesn't mean one causes the other.`;
}

// `inline` is how many of the ties the table shows itself (the rest fold under it).
export function rankSummary(r: { header: Col; direction: "high" | "low"; top: number; tieCount: number; unreliableCount: number; inline?: number }): string {
  const h = r.header;
  if (r.top === 0) {
    const why = r.unreliableCount ? `: ${r.unreliableCount} ${r.unreliableCount === 1 ? "tract's estimate is" : "tracts' estimates are"} too uncertain` : "";
    return `No census tract in ${placeName(h.place)} could be ranked on the ${subject(h)} (${yearIn(h.year)})${why}.`;
  }
  const which = r.top === 1 ? "This is the census tract" : `These are the ${tracts(r.top)}`;
  const lead = `${which} in ${placeName(h.place)} with the ${r.direction === "high" ? "highest" : "lowest"} ${subject(h)} (${yearIn(h.year)}).`;
  if (!h.confidence) return `${lead} There's no margin of error for this column, so tracts close in rank may really be tied.`;
  const shown = r.inline ?? 5;
  const first = r.tieCount > shown ? ` (the first ${shown} are in the table)` : "";
  const ties = r.tieCount ? ` ${r.tieCount} more ${r.tieCount === 1 ? "is" : "are"} within the margin of error of #${r.top}${first}, so read the top as a group, not an exact order.` : "";
  const u = r.unreliableCount;
  const left = u ? ` ${u} ${u === 1 ? "tract is left out because its estimate is" : "tracts are left out because their estimates are"} too uncertain.` : "";
  return lead + ties + left;
}

export function changeSummary(r: { header: Col; from: string; to: string; increases: number; decreases: number; none: number }): string {
  const h = r.header;
  const bare = noMargin([h]);
  if (bare) return `Can't tell which census tracts changed clearly from ${r.from} to ${r.to}, because ${bare}.`;
  const when = `From ${r.from} to ${r.to} in ${placeName(h.place)}, the ${subject(h)}`;
  if (r.increases + r.decreases === 0) return `${when} didn't change by more than the survey's margin of error in any of the ${tracts(r.none)} compared.`;
  const rose = r.increases ? `clearly rose in ${tracts(r.increases)}` : "";
  const fell = r.decreases ? `clearly fell in ${rose ? r.decreases : tracts(r.decreases)}` : "";
  const rest = r.none ? ` In the other ${r.none} compared, the change is smaller than the survey's margin of error.` : "";
  return `${when} ${[rose, fell].filter(Boolean).join(" and ")}.${rest}`;
}

const EXACT = "exact (City records)";
const NOTE = {
  value: "Assessed value is the City's figure for property taxes, not what a home would sell for.",
  owner: "'Owner-occupied' means the owner's mailing address is the property's address; an owner who gets mail elsewhere isn't counted.",
  built: "Year built is the main building's year.",
  city: "Property figures cover the City of Milwaukee; tracts on the City line count only their City part.",
  pattern: "A pattern across tracts doesn't tell you about any one home or family.",
};
// The property file's caveats for a card, in order, each once; nothing for a card without a property side.
export function propertyNotes(heads: { column: string; confidence: string | null }[]): string[] {
  const cols = heads.filter((h) => h.confidence === EXACT).map((h) => h.column);
  if (!cols.length) return [];
  const own = cols.flatMap((c) => (c === "owner_share" ? [NOTE.owner] : c === "median_year_built" ? [NOTE.built] : [NOTE.value]));
  return [...new Set([...own, NOTE.city, NOTE.pattern])];
}

export const propertyCountSummary = (r: { count: number; filters: string[]; period: string; of: { count: number; label: string } }) =>
  `${r.count.toLocaleString("en-US")} ${r.count === 1 ? "property" : "properties"} in the City of Milwaukee ${r.count === 1 ? "is" : "are"} ${r.filters.join(", ")} (${r.period}), out of ${r.of.count.toLocaleString("en-US")} ${r.of.label}. ${NOTE.value}`;
