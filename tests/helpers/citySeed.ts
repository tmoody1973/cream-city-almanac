import type { GenericMutationCtx } from "convex/server";
import type { DataModel } from "../../convex/_generated/dataModel";

// The NIBRS crime dataset as City count tests see it: family, AI card and a live profile. Shared by
// convex/city.test.ts and convex/shares.test.ts.
export const RID = "87843297-a6fa-46d4-ba5d-cb342fb2d3bb";
export const reader = { subject: "u1", issuer: "test", tokenIdentifier: "test|u1" };

export async function seedNibrs(ctx: GenericMutationCtx<DataModel>, withProfile = true) {
  await ctx.db.insert("families", { key: "city:nibrs-crime-data", code: "P01", name: "NIBRS Crime Data", kind: "dataset", topic: "Public Safety", keywords: [], places: ["City"], years: [], latestModified: "2023-01-05", baseSearchText: "", searchText: "", dictionaryTab: null, source: "city", live: true });
  await ctx.db.insert("cards", { familyKey: "city:nibrs-crime-data", inputHash: "h", explainer: "x", explainerProvenance: "AI", hubSummary: "", glossary: [], caveats: ["These are reported incidents, not all crime."], storyAngles: [], basic: false, embedding: new Array(1536).fill(0) });
  if (withProfile) await ctx.db.insert("cityProfiles", { familyKey: "city:nibrs-crime-data", resourceId: RID, columns: [], dateColumn: "Incident_Date", latColumn: "Address_Latitude", lonColumn: "Address_Longitude", districtColumns: ["Police_District"], categories: [{ column: "Police_District", values: [{ value: "6", count: 5 }] }, { column: "Offense_All", values: [{ value: "120", count: 5 }, { value: "13A", count: 3 }], multi: true }], rowCount: 10, minDate: "2024-01-01", maxDate: "2026-10-08", namesPeople: false, resourceName: "2025", signature: "s", updatedAt: 0 });
}
