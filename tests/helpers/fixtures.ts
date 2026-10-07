import { parseDcat } from "../../convex/lib/dcat";
import { groupItems } from "../../convex/lib/families";
import type { Family, HubItem } from "../../convex/lib/types";
import catalog from "../fixtures/hub-catalog.json";
import inventory from "../fixtures/dycu-inventory.xlsx.json";

export const hubCatalog: unknown = catalog;
export const inventoryBase64: string = inventory.base64;

export function inventoryBytes(): Uint8Array {
  return Uint8Array.from(atob(inventoryBase64), (c) => c.charCodeAt(0));
}

export function fixtureItems(): HubItem[] {
  return parseDcat(hubCatalog);
}

export function fixtureFamilies(): Family[] {
  return groupItems(fixtureItems());
}
