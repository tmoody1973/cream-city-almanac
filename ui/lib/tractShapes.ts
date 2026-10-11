// The highlighted tracts' outlines from the dataset's own FeatureServer. Ids are checked before they go in the
// where clause: only 11-digit tract ids, so nothing else can be injected into DYCU's query.
export function tractShapesUrl(featureServerUrl: string, geoids: string[]): string | null {
  if (!geoids.length || geoids.some((g) => !/^\d{11}$/.test(g))) return null;
  const where = `GEOID IN (${geoids.map((g) => `'${g}'`).join(",")})`;
  return `${featureServerUrl}/query?where=${encodeURIComponent(where)}&outFields=GEOID&outSR=4326&f=geojson`;
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
