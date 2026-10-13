import type { BoundariesResult, PlaceType } from "@/convex/places";
import type { BoundaryKind } from "@/convex/lib/boundaries";
import { asOfDate, BOUNDARIES_NOT_LOADED } from "./placeText";

export const BOUNDARY_GROUPS: Record<BoundaryKind, string> = {
  district: "Aldermanic districts", ward: "Voting wards",
  tin: "Targeted Investment Neighborhoods (TINs)", nrsa: "Neighborhood Revitalization Strategy Areas (NRSAs)", nsp: "Neighborhood Strategic Planning areas (NSPs)",
  tid: "Tax Incremental Districts (TIDs)", bid: "Business Improvement Districts (BIDs)", oz: "Opportunity Zones",
};
export const shareText = (share: number) => (share >= 99 ? "all of it" : share < 5 ? "a small part (under 5%)" : `about ${share}%`);
export const placeHeading = (p: { type: PlaceType; name: string }) =>
  p.type === "city" ? `${p.name} (City of Milwaukee boundary)` : p.type === "dycu" ? `${p.name} (DYCU's area)` : p.name;
export const boundariesFootnote = (asOf: number) => `Shares are estimated from a grid of points, about ±2%. From the City's boundary files as of ${asOfDate(asOf)}.`;
export function boundariesRefusal(r: Exclude<BoundariesResult, { status: "ok" }>): string {
  if (r.status === "outside-city") return "The City's boundaries don't reach this tract.";
  if (r.status === "not-loaded") return BOUNDARIES_NOT_LOADED;
  return r.suggestions.length
    ? `I couldn't find that place. Did you mean: ${r.suggestions.join(", ")}?`
    : "I couldn't find that place. Name one neighborhood, census tract or aldermanic district (1–15).";
}
