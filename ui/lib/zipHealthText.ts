import type { FollowUp } from "@/ui/components/FollowUps";
import type { TractShapes } from "@/ui/components/CityMap";
// Value imports are relative: shareCard runs this inside Convex, whose bundler resolves "@/" only for erased type imports.
import { creditLines, type HealthTopic } from "../../convex/lib/healthCompass";
import type { FigOut, HealthOk, HealthResult, ZipLine } from "@/convex/lib/healthAnswer";
import { ZCTA_LAYER } from "../../convex/lib/zipPlaces";
import { exported, safeName, type CardExport, type Ctx } from "./cardExport";

// ZIP health's words and export (spec 2026-10-15-zip-health §5–§6). Every figure comes from the tool; code writes the
// lead sentence; Health Compass's credit goes everywhere the figures go.

// "Food Insecurity (2024 Food Insecurity)" → "food insecurity"; acronyms stay ("ALICE").
export const label = (t: Pick<HealthTopic, "name">) =>
  t.name.replace(/\s*\([^)]*\)/g, "").trim().split(/\s+/).map((w) => (w.length > 1 && w === w.toUpperCase() ? w : w.toLowerCase())).join(" ");
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const num = (v: number, t: HealthTopic) =>
  t.units.startsWith("%") ? `${v.toFixed(t.decimals)}%` : v.toLocaleString("en-US", { minimumFractionDigits: t.decimals, maximumFractionDigits: t.decimals });
export const figText = (f: FigOut | undefined | null, t: HealthTopic) =>
  !f ? "—" : f.lo === null || f.hi === null ? `${num(f.value, t)} (no range published)` : `${num(f.value, t)} (${num(f.lo, t)}–${num(f.hi, t)})`;
export const placeText = (l: ZipLine) => (l.places.length ? `${l.places.slice(0, 2).join(", ")}${l.places.length > 2 ? " and more" : ""}` : l.town || "—");
const zipList = (ls: ZipLine[]) => `${ls.slice(0, 3).map((l) => l.zip).join(", ")}${ls.length > 3 ? ` and ${ls.length - 3} more` : ""}`;
const VERDICT = { higher: "clearly higher", lower: "clearly lower", same: "about the same", uncertain: "too uncertain to say", "no-range": "no range published" } as const;
const verdictText = (l: ZipLine) => (l.verdict ? VERDICT[l.verdict] : "—");

export function leadOf(r: HealthOk): { strong: string; rest: string | null } {
  const m = label(r.measure);
  if (r.mode === "one") {
    const z = r.zip.zip;
    switch (r.zip.verdict) {
      case "higher": case "lower": return { strong: `${z} is clearly ${r.zip.verdict} than Milwaukee County on ${m}.`, rest: null };
      case "same": return { strong: `${z} is about the same as Milwaukee County on ${m}.`, rest: null };
      case "uncertain": return { strong: `${z}'s ${m} figure is too uncertain to compare with the county.`, rest: null };
      case "no-range": return { strong: `${z}'s ${m} figure has no range published, so it can't be compared with the county.`, rest: null };
      default: return { strong: `Health Compass has no Milwaukee County figure to compare ${z} with.`, rest: null };
    }
  }
  if (r.mode === "rank") return { strong: `${r.direction === "high" ? "Highest" : "Lowest"} ${m}: ${zipList(r.rows.slice(0, 3))}.`, rest: null };
  const o = label(r.other);
  if (r.mode === "together") {
    if (r.strength === "too-few") return { strong: "Too few ZIP codes have both figures to say.", rest: null };
    if (r.strength === "little") return { strong: `Across ZIP codes, ${m} and ${o} show little pattern.`, rest: null };
    return { strong: `ZIP codes with higher ${o} tend to have ${r.direction} ${m} (a ${r.strength} pattern).`, rest: null };
  }
  const phrase = `${r.otherSide} ${o} with ${r.side} ${m}`;
  if (r.fits.length) {
    return {
      strong: `${r.fits.length === 1 ? "Clearest lead" : "Clear matches"}: ${zipList(r.fits)}.`,
      rest: `${cap(o)} is ${r.otherSide} there, and ${m} is ${r.side === "low" ? "lower" : "higher"} than across Milwaukee County.${r.close.length ? ` Possible: ${zipList(r.close)}.` : ""}`,
    };
  }
  if (r.close.length) {
    const one = r.close.length === 1;
    return { strong: `No ZIP clearly has ${phrase}. Possible: ${zipList(r.close)}.`, rest: `${one ? "Its" : "Their"} figures point that way, but ${one ? "its" : "their"} ranges overlap the cutoffs.` };
  }
  return { strong: `No ZIP has ${phrase}.`, rest: null };
}

export function zipHealthTitle(r: HealthOk): string {
  if (r.mode === "one") return `ZIP ${r.zip.zip} · ${r.measure.name}`;
  if (r.mode === "rank") return `ZIP codes · ${r.measure.name}`;
  return `ZIP codes · ${r.measure.name} and ${r.other.name}`;
}

export function tableOf(r: HealthOk): { head: string[]; rows: string[][] } {
  const M = cap(label(r.measure));
  if (r.mode === "one") {
    return { head: ["", `ZIP ${r.zip.zip}`, "Milwaukee County", "City of Milwaukee", "Compared with the county"], rows: [[M, figText(r.zip.a, r.measure), figText(r.county, r.measure), figText(r.city, r.measure), verdictText(r.zip)]] };
  }
  if (r.mode === "rank") {
    return { head: ["ZIP", "Where", M, "Compared with the county"], rows: r.rows.slice(0, 10).map((l) => [l.zip, placeText(l), figText(l.a, r.measure), verdictText(l)]) };
  }
  const O = cap(label(r.other));
  if (r.mode === "together") return { head: ["ZIP", "Where", M, O], rows: r.rows.map((l) => [l.zip, placeText(l), figText(l.a, r.measure), figText(l.b, r.other)]) };
  const row = (l: ZipLine, word: string) => [l.zip, placeText(l), figText(l.a, r.measure), figText(l.b, r.other), word];
  return { head: ["ZIP", "Where", M, O, "Match"], rows: [...r.fits.map((l) => row(l, "clear match")), ...r.close.map((l) => row(l, "possible match"))] };
}

const topicsOf = (r: HealthOk) => (r.mode === "one" || r.mode === "rank" ? [r.measure] : [r.measure, r.other]);
const periodOf = (r: HealthOk, t: HealthTopic) => {
  const lines = r.mode === "one" ? [r.zip] : r.mode === "rank" ? r.rows : r.mode === "together" ? r.rows : [...r.fits, ...r.close];
  const f = t.key === r.measure.key ? r.county ?? lines[0]?.a : lines[0]?.b;
  return f?.period ?? "";
};

// One line per dataset kind, from Health Compass's own source fields (spec §5).
export function limitationOf(t: HealthTopic): string | null {
  const src = t.sources.join(" ");
  if (t.team === "milwaukee-health-partnership") return `${t.name} is a survey: figures come from the people who answered, and ZIPs with few answers have wide ranges.`;
  if (/American Community Survey/.test(src)) return `${t.name} is a Census Bureau survey estimate; the range shows its uncertainty.`;
  if (/PLACES/.test(src)) return `${t.name} is a modeled estimate, not a count.`;
  return null;
}

const asOfText = (ms: number) => new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "America/Chicago" }).format(ms);

export function notesOf(r: HealthOk): string[] {
  const out = topicsOf(r).map((t) => `${t.name}: ${t.description} Units: ${t.units}.`);
  if (r.mode === "mismatch") {
    const o = label(r.other), m = label(r.measure);
    out.push(
      `${cap(r.otherSide)} ${o}: the third of ZIP codes with the ${r.otherSide === "high" ? "most" : "least"} (${r.otherSide === "high" ? "at or above" : "at or below"} ${num(r.cut, r.other)}). ${cap(r.side)} ${m}: ${r.side === "low" ? "below" : "above"} Milwaukee County's ${num(r.county!.value, r.measure)}. "Clear" means a ZIP's whole range is past both lines.`,
    );
  } else if (r.mode !== "together") {
    out.push("“Clearly higher” or “lower” means the ZIP's whole range is above or below Milwaukee County's figure.");
  }
  out.push("Ranges are 95%: each figure plus or minus 1.96 standard errors, as Health Compass publishes them.");
  const uncertain = r.mode === "rank" ? r.uncertain.map((l) => l.zip) : r.mode === "mismatch" ? r.uncertain : [];
  if (uncertain.length) out.push(`Too uncertain to use: ${uncertain.join(", ")}.`);
  for (const t of topicsOf(r)) { const l = limitationOf(t); if (l) out.push(l); }
  if (r.mode !== "one") out.push("Where: the City's neighborhoods covering at least 10% of the ZIP; outside the City, the ZIP's main town.");
  if (r.asOf) out.push(`Health Compass figures as of ${asOfText(r.asOf)}.`);
  return out;
}

// Health Compass's credit for each measure on the card (spec §6).
export const creditsOf = (r: HealthOk): string[][] => topicsOf(r).map((t) => creditLines(t, periodOf(r, t)));

export function mapOf(r: HealthOk): TractShapes | null {
  const fits = r.mode === "one" ? [r.zip.zip] : r.mode === "rank" ? r.rows.slice(0, 10).map((l) => l.zip) : r.mode === "mismatch" ? r.fits.map((l) => l.zip) : [];
  const close = r.mode === "mismatch" ? r.close.map((l) => l.zip) : [];
  return fits.length || close.length ? { url: ZCTA_LAYER, fits, close, noun: "ZIP" } : null;
}

const fig = (f: FigOut | null | undefined) => [f?.value ?? null, f?.se ?? null, f?.lo ?? null, f?.hi ?? null, f?.period ?? ""];

export function zipHealthExport(r: HealthOk, ctx: Ctx): CardExport {
  const lead = leadOf(r);
  const keys = topicsOf(r).map((t) => t.key);
  const figHead = (name: string) => [name, `${name} standard error`, `${name} range low`, `${name} range high`, `${name} period`];
  const lines = r.mode === "one" ? [r.zip] : r.mode === "rank" ? r.rows : r.mode === "together" ? r.rows : [...r.fits, ...r.close];
  const t = tableOf(r);
  return {
    title: zipHealthTitle(r),
    lines: [lead.rest ? `${lead.strong} ${lead.rest}` : lead.strong],
    csv: {
      head: ["ZIP", "Where", ...figHead(r.measure.name), ...(r.mode === "one" || r.mode === "rank" ? [] : figHead(r.other.name)), "Milwaukee County", "Milwaukee County standard error"],
      rows: lines.map((l) => [l.zip, placeText(l), ...fig(l.a), ...(r.mode === "one" || r.mode === "rank" ? [] : fig(l.b)), r.county?.value ?? null, r.county?.se ?? null]),
    },
    text: t,
    notes: [...notesOf(r), ...creditsOf(r).flat(), exported(ctx)],
    filename: safeName(["zip-health", ...keys, ...(r.mode === "one" ? [r.zip.zip] : [])]),
  };
}

export function zipHealthFollowUps(r: HealthOk): FollowUp[] {
  const every = { label: "EVERY ZIP", question: `Which ZIP codes have the highest ${r.measure.name}?` };
  if (r.mode === "one") return [every, { label: `MORE ON ${r.zip.zip}`, question: `What is the demographic makeup of ${r.zip.zip}?` }];
  if (r.mode === "rank") {
    const top = r.rows[0]?.zip;
    return top ? [{ label: `${top} VS COUNTY`, question: `How does ${top} compare with the county on ${r.measure.name}?` }, { label: `MORE ON ${top}`, question: `What is the demographic makeup of ${top}?` }] : [];
  }
  const first = r.mode === "mismatch" ? (r.fits[0] ?? r.close[0])?.zip : undefined;
  return [every, ...(first ? [{ label: `MORE ON ${first}`, question: `What is the demographic makeup of ${first}?` }] : [])];
}

export const zipHealthChoices = (r: Extract<HealthResult, { status: "choose" }>): FollowUp[] =>
  r.choices.map((c) => ({ label: c.name.toUpperCase(), question: `Answer that with Health Compass's "${c.name}".` }));

export function zipHealthRefusal(r: Exclude<HealthResult, HealthOk | { status: "choose" }>): string {
  switch (r.status) {
    case "not-found": return `Health Compass has no measure matching “${r.words}”. It covers health, hospital visits, food, income and housing by ZIP code.`;
    case "bad-zip": return "Give a 5-digit ZIP code, like 53212.";
    case "outside": return `Ask has Health Compass figures for the ZIP codes that touch Milwaukee County; ${r.zip} isn't one of them.`;
    case "no-data": return `Health Compass has no ${r.measure} figure for ${r.zip}.`;
    case "refused": return r.reason;
    default: return "Health figures aren't loaded yet; try again later.";
  }
}
