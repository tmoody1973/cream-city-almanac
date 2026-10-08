import { parseDcat } from "../../convex/lib/dcat";
import { groupItems } from "../../convex/lib/families";
import type { Family, HubItem } from "../../convex/lib/types";
import catalog from "../fixtures/hub-catalog.json";
import inventory from "../fixtures/dycu-inventory.xlsx.json";
import portrait2021 from "../fixtures/portrait-2021.xlsx.json";
import portrait2023 from "../fixtures/portrait-2023.xlsx.json";

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

// Real DYCU Neighborhood Portrait spreadsheets: 2021 layout (Silver City group) and 2022+ layout (Walker's Point, 2023).
export function portraitBytes(year: 2021 | 2023): Uint8Array {
  const b64 = (year === 2021 ? portrait2021 : portrait2023).base64;
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}
