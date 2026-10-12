// The U.S. Census Bureau's geocoder (spec 2026-10-12-address-lookup §4): an address or intersection → its location and
// 2020 census tract, in one request. Free, no key. Pure: building the request and reading the reply.
const GEOCODER = "https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress";

export function checkAddress(raw: string): string | null {
  const a = raw.trim().replace(/\s+/g, " ");
  return a.length >= 3 && a.length <= 200 ? a : null;
}

// The geocoder needs a city; a bare street address means Milwaukee here.
export const withCity = (a: string) => (/\bmilwaukee\b|\bwi\b|\bwisconsin\b|\b53\d{3}\b/i.test(a) ? a : `${a}, Milwaukee, WI`);

export const geocodeUrl = (a: string) =>
  `${GEOCODER}?address=${encodeURIComponent(a)}&benchmark=Public_AR_Current&vintage=Current_Current&layers=Census%20Tracts&format=json`;

export type Geocoded = { matched: string; lat: number; lon: number; geoid: string | null };
type Match = { matchedAddress?: string; coordinates?: { x?: number; y?: number }; geographies?: Record<string, { GEOID?: string }[]> };

export function parseGeocode(body: unknown): Geocoded | null {
  const matches = (body as { result?: { addressMatches?: Match[] } })?.result?.addressMatches;
  if (!Array.isArray(matches)) throw new Error("Geocoder reply had no result");
  const m = matches[0];
  if (!m) return null;
  const lon = Number(m.coordinates?.x), lat = Number(m.coordinates?.y);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error("Geocoder match had no coordinates");
  return { matched: String(m.matchedAddress ?? ""), lat, lon, geoid: m.geographies?.["Census Tracts"]?.[0]?.GEOID ?? null };
}
