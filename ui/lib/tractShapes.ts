// The highlighted shapes' outlines. Ids are checked before they go in the where clause: tract ids or ZIPs (GEOID), or the
// City layer's neighborhood names (letters, digits, spaces and . ' & - /; quotes doubled), so nothing else is injected.
// When the outlines can't be drawn: "Neighborhood map unavailable." on a neighborhood card.
export const mapNote = (noun?: string) => `${noun ? noun[0].toUpperCase() + noun.slice(1) : "Tract"} map unavailable.`;

export function tractShapesUrl(featureServerUrl: string, ids: string[], field = "GEOID"): string | null {
  const ok = field === "GEOID" ? (g: string) => /^(\d{11}|\d{5})$/.test(g) : (g: string) => /^[A-Z0-9 .'&\/-]{1,60}$/.test(g);
  // ponytail: an id that fails the check is dropped, not the whole map; nothing unchecked reaches the query.
  const safe = ids.filter(ok);
  if (!safe.length) return null;
  const where = `${field} IN (${safe.map((g) => `'${g.replace(/'/g, "''")}'`).join(",")})`;
  return `${featureServerUrl}/query?where=${encodeURIComponent(where)}&outFields=${field}&outSR=4326&f=geojson`;
}

export const MAX_TRACT_SHAPES = 50;

// Rank, change and relate can highlight hundreds; the map draws the first 50 as ordered (highlighted before close).
export function capTractIds(fits: string[], close: string[], max = MAX_TRACT_SHAPES) {
  const f = fits.slice(0, max);
  const c = close.slice(0, max - f.length);
  return { fits: f, close: c, capped: f.length + c.length < fits.length + close.length };
}

type Pos = number[];
const walk = (c: unknown, each: (p: Pos) => void): void => {
  if (Array.isArray(c) && typeof c[0] === "number") each(c as Pos);
  else if (Array.isArray(c)) for (const x of c) walk(x, each);
};

// [[west, south], [east, north]] of every shape, or null when there is nothing to bound.
export function geojsonBounds(fc: GeoJSON.FeatureCollection): [[number, number], [number, number]] | null {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const f of fc.features) {
    walk((f.geometry as { coordinates?: unknown } | null)?.coordinates, ([x, y]) => { w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y); });
  }
  return w === Infinity ? null : [[w, s], [e, n]];
}

// The map's caption: "Map of 2 highlighted tracts, 1 close", or ZIPs.
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
export const shapeSummary = ({ fits, close, noun = "tract" }: { fits: string[]; close: string[]; noun?: string }) =>
  fits.length ? `Map of ${plural(fits.length, `highlighted ${noun}`)}${close.length ? `, ${close.length} close` : ""}` : `Map of ${plural(close.length, `close ${noun}`)}`;
