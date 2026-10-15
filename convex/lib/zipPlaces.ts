import type { Geometry } from "./geo";

// The Census Bureau's ZIP (ZCTA) outlines from TIGERweb (public, no key), matched to the City's neighborhoods the same way
// tracts are (decision 031; spec 2026-10-15-zip-health §3.2). The map draws them from the same layer.
export const ZCTA_LAYER = "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_Current/MapServer/2";

export function zctaUrl(zips: string[]): string {
  const ids = zips.filter((z) => /^\d{5}$/.test(z));
  return `${ZCTA_LAYER}/query?where=${encodeURIComponent(`GEOID IN (${ids.map((z) => `'${z}'`).join(",")})`)}&outFields=GEOID&outSR=4326&f=geojson`;
}

type Feature = { properties?: { GEOID?: unknown } | null; geometry?: { type?: unknown; coordinates?: unknown } | null };

// A truncated answer is refused: a partial match would drop ZIPs without saying so.
export function parseZipShapes(geojson: unknown): { zip: string; geometry: Geometry }[] {
  const fc = geojson as { features?: Feature[]; exceededTransferLimit?: boolean; properties?: { exceededTransferLimit?: boolean } } | null;
  if (fc?.exceededTransferLimit || fc?.properties?.exceededTransferLimit) throw new Error("the ZIP outline list was truncated");
  if (!Array.isArray(fc?.features)) throw new Error("ZIP outlines returned no features");
  return fc.features.flatMap((f) => {
    const zip = String(f.properties?.GEOID ?? "");
    const g = f.geometry;
    if (!/^\d{5}$/.test(zip) || !g || (g.type !== "Polygon" && g.type !== "MultiPolygon") || !Array.isArray(g.coordinates)) return [];
    return [{ zip, geometry: { type: g.type, coordinates: g.coordinates } as Geometry }];
  });
}
