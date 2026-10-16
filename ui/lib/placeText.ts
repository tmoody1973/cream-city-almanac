import type { FollowUp } from "@/ui/components/FollowUps";
import type { PlaceResult } from "@/convex/places";

export const PLACE_PRIVACY = "This address was sent to the U.S. Census Bureau's geocoder to find its location; Cream City Almanac doesn't keep it.";
// The same promise in a line, for the /about page's compact box.
export const PLACE_PRIVACY_SHORT = "Sent to the U.S. Census Bureau to find it; never kept.";
// In Ask the address is also part of the question the AI reads, like everything typed there.
export const PLACE_PRIVACY_ASK = "This address was sent to the U.S. Census Bureau's geocoder to find its location, and, like every question here, to the AI; Cream City Almanac doesn't keep it.";
// A point outside every neighborhood shape may still be in the City (lakefront, port, river gaps): never say it isn't.
export const notInCityText = (tract: string) => `Not inside one of the City of Milwaukee's neighborhood boundaries (census tract ${tract}).`;
// What the boundary block shows. Wards tile the City, so a ward or district found means the address is in the City even
// when it falls in a gap between neighborhood shapes (lakefront, river): never call that "not covered".
export function boundariesShown(r: Extract<PlaceResult, { status: "ok" }>): "lines" | "not-covered" | "not-loaded" {
  if (r.boundaries.asOf === null) return "not-loaded";
  return r.boundaries.district || r.boundaries.ward ? "lines" : "not-covered";
}
export const BOUNDARIES_NOT_LOADED = "The City's boundary files haven't been loaded yet.";
export const BOUNDARIES_NOT_COVERED = "The City's boundaries (districts, wards, investment and development areas) don't cover this address.";
export const asOfDate = (ms: number) => new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Chicago" });
export const POLLING_CONFIRM = "Polling places can change before an election; confirm yours at";
export const pollingNote = (asOf: number) => `From the City's polling place list as of ${asOfDate(asOf)}. ${POLLING_CONFIRM} myvote.wi.gov.`;
const REFUSALS: Record<Exclude<PlaceResult["status"], "ok">, string> = {
  "no-match": "The Census Bureau couldn't find that address. Try the house number, street name and ZIP code.",
  unavailable: "The address service didn't respond. Try again shortly.",
  "outside-county": "That address is outside Milwaukee County.",
  "bad-address": "Type a street address or an intersection, like 2400 W Center St.",
  busy: "Address lookups are busy right now; try again shortly.",
};
export const placeRefusal = (s: Exclude<PlaceResult["status"], "ok">) => REFUSALS[s];

// The fact sheet an address should open: the DYCU area named like its City neighborhood (a tract can be in two areas),
// else the first area that has a sheet.
export const sheetFor = (r: Extract<PlaceResult, { status: "ok" }>) =>
  (r.dycu.find((d) => d.slug && d.name === r.neighborhood) ?? r.dycu.find((d) => d.slug))?.slug ?? null;

// Questions about the places, never the property.
export function placeFollowUps(r: Extract<PlaceResult, { status: "ok" }>): FollowUp[] {
  // No "rank this one tract" button: no tool places a single tract; the neighborhood's tracts list each with its rank.
  const out: FollowUp[] = [];
  if (r.neighborhood) {
    out.push({ label: "CRIME HERE", question: `How many robberies were there in ${r.neighborhood} this year?` });
    out.push({ label: "ITS TRACTS", question: `What's the poverty rate in ${r.neighborhood}'s tracts?` });
  }
  if (r.boundaries.district) out.push({ label: "ITS WARDS", question: `Which wards are in ${r.boundaries.district.name}, and where do they vote?` });
  return out;
}

// A City neighborhood DYCU doesn't profile has no fact sheet; Ask can still count City records inside its boundary.
export const askAboutArea = (neighborhood: string) => {
  const question = `How many robberies in ${neighborhood} this year?`;
  return {
    text: `That address is in the City's ${neighborhood} neighborhood. Data You Can Use doesn't make a fact sheet for it, but Ask can count City records there.`,
    question,
    href: `/ask?prompt=${encodeURIComponent(question)}`,
  };
};
