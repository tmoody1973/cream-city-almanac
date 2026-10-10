// The City's ArcGIS map layers, fetched by the browser (the City allows it) for the visible area only. These are
// places — routes, zones, districts — drawn as published. We draw at most 2,000 shapes: some City layers (parcels)
// would answer with 15,000+ and never say "too many" themselves, so we ask for 2,001 and treat 2,001 as "too many".
const DRAW_LIMIT = 2000;
type View = [[number, number], [number, number]];
const SYSTEM = /^(objectid|fid|globalid|shape.*)$/i;

export function layerQueryUrl(layerUrl: string, [[w, s], [e, n]]: View): string {
  const u = new URL(`${layerUrl.replace(/\/+$/, "")}/query`);
  for (const [k, v] of Object.entries({ where: "1=1", geometry: `${w},${s},${e},${n}`, geometryType: "esriGeometryEnvelope", inSR: "4326", outSR: "4326", spatialRel: "esriSpatialRelIntersects", outFields: "*", resultRecordCount: String(DRAW_LIMIT + 1), f: "geojson" })) u.searchParams.set(k, v);
  return u.toString();
}

export const labelFields = (props: Record<string, unknown>): [string, string][] =>
  Object.entries(props).filter(([k, v]) => !SYSTEM.test(k) && v !== null && v !== "").slice(0, 6).map(([k, v]) => [k, String(v)]);

// City text goes into popup HTML: escape it.
export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

// A request cancelled through `signal` rejects with its AbortError, never "down": the caller dropped it on purpose.
export async function fetchLayer(url: string, view: View, signal?: AbortSignal): Promise<{ status: "ok"; data: GeoJSON.FeatureCollection } | { status: "too-many" } | { status: "down" }> {
  try {
    const res = await fetch(layerQueryUrl(url, view), { signal });
    if (!res.ok) return { status: "down" };
    const body = (await res.json()) as GeoJSON.FeatureCollection & { exceededTransferLimit?: boolean; error?: unknown };
    if (body.error || !Array.isArray(body.features)) return { status: "down" };
    if (body.exceededTransferLimit || body.features.length > DRAW_LIMIT) return { status: "too-many" };
    return { status: "ok", data: { type: "FeatureCollection", features: body.features } };
  } catch (err) {
    if (signal?.aborted) throw err;
    return { status: "down" };
  }
}
