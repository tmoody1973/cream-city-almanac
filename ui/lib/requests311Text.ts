import type { Requests311Answer } from "@/lib/ask/tools";
import type { FollowUp } from "@/ui/components/FollowUps";
import { exported, safeName, type CardExport, type Ctx } from "./cardExport";

// City 311 requests for a place next to the city (spec 2026-10-20-311-by-neighborhood §5).
export type Requests311Ok = Extract<Requests311Answer, { status: "ok" }>;
type Fig = Requests311Ok["total"];

const GROUPS = {
  potholes: { word: "pothole", types: ["Potholes", "Pothole in Alley"] },
  streetlights: { word: "streetlight", types: ["Street Light Out", "Area Dark"] },
  dumping: { word: "dumping", types: ["Large Items Discarded on Private Property", "Scattered Litter and Debris on Private Property"] },
} as const;
type Group = keyof typeof GROUPS;
const groupOf = (types: string[]) => (Object.keys(GROUPS) as Group[]).find((g) => GROUPS[g].types.length === types.length && GROUPS[g].types.every((t) => types.includes(t)));
const typeWord = (r: Requests311Ok) => { const g = groupOf(r.types); return g ? GROUPS[g].word : r.types.length === 1 ? r.types[0] : "311"; };
const years = (r: Requests311Ok) => (r.from === r.to ? String(r.from) : `${r.from}–${r.to}`);
const placeName = (r: Requests311Ok) => (r.place.kind === "city" ? "Milwaukee" : r.place.name);

export const n = (x: number) => x.toLocaleString("en-US");
export const daysText = (d: number | null) => (d === null ? "—" : `${n(d)} ${d === 1 ? "day" : "days"}`);
export const requests311Title = (r: Requests311Ok) => {
  const w = typeWord(r);
  return `${w[0].toUpperCase()}${w.slice(1)} requests in ${placeName(r)}, ${years(r)}`;
};
export const comparison = (r: Requests311Ok): [string, Fig, Fig] => ["", r.total, r.city];
export const compareRows = (r: Requests311Ok): string[][] => [
  ["Requests", n(r.total.requests), n(r.city.requests)],
  ["Closed", n(r.total.closed), n(r.city.closed)],
  ["Median days to close", daysText(r.total.medianDays), daysText(r.city.medianDays)],
];
export function unplacedNote(r: Requests311Ok): string | null {
  const { noAddress, noMatch, outside } = r.unplaced;
  const all = noAddress + noMatch + outside;
  return all ? `${n(all)} requests couldn't be placed in a neighborhood: ${n(noAddress)} had no address, ${n(noMatch)} didn't match a map location, ${n(outside)} fell outside every City neighborhood. They count in the city's total.` : null;
}
export const sourceLine = (r: Requests311Ok) =>
  `City of Milwaukee 311 call center requests, placed by address with the Census Bureau's geocoder; addresses aren't kept. Counted ${new Date(r.counted).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}.`;
export const notesOf = (r: Requests311Ok) => [unplacedNote(r), r.place.dycuNote, r.caveat, sourceLine(r)].filter((x): x is string => !!x);

export function requests311Export(r: Requests311Ok, ctx: Ctx): CardExport {
  const byGroup = r.rows.length > 0;
  return {
    title: requests311Title(r),
    lines: [],
    csv: byGroup
      ? { head: ["", "Requests", "Closed", "Median days to close"], rows: r.rows.map((x) => [x.label, x.fig.requests, x.fig.closed, x.fig.medianDays]) }
      : { head: ["", placeName(r), "City"], rows: [["Requests", r.total.requests, r.city.requests], ["Closed", r.total.closed, r.city.closed], ["Median days to close", r.total.medianDays, r.city.medianDays]] },
    text: byGroup
      ? { head: ["", "Requests", "Closed", "Median days to close"], rows: r.rows.map((x) => [x.label, n(x.fig.requests), n(x.fig.closed), daysText(x.fig.medianDays)]) }
      : { head: ["", placeName(r), "City"], rows: compareRows(r) },
    notes: [...notesOf(r), exported(ctx)],
    filename: safeName(["311", typeWord(r), placeName(r), years(r)]),
  };
}

export function requests311FollowUps(r: Requests311Ok): FollowUp[] {
  const place = placeName(r);
  const g = groupOf(r.types);
  const others = (Object.keys(GROUPS) as Group[]).filter((x) => x !== g).slice(0, 2);
  return [
    { label: "BY YEAR", question: `${typeWord(r)} requests in ${place} each year since 2020` },
    ...others.map((x) => ({ label: x.toUpperCase(), question: `${GROUPS[x].word} requests in ${place}, ${years(r)}` })),
  ];
}
