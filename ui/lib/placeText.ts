import type { FollowUp } from "@/ui/components/FollowUps";
import type { PlaceResult } from "@/convex/places";

export const PLACE_PRIVACY = "This address was sent to the U.S. Census Bureau's geocoder to find its location; Cream City Almanac doesn't keep it.";
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
  const out: FollowUp[] = [{ label: `TRACT ${r.tract.number}`, question: `How does census tract ${r.tract.number} rank on poverty in Milwaukee County?` }];
  if (r.neighborhood) {
    out.push({ label: "CRIME HERE", question: `How many robberies were there in ${r.neighborhood} this year?` });
    out.push({ label: "ITS TRACTS", question: `What's the poverty rate in ${r.neighborhood}'s tracts?` });
  }
  return out;
}
