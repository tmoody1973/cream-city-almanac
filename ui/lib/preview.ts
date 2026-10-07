export const PREVIEW_TIMEOUT_MS = 8000;
const HEADLINE = /^(per_|pct|percent|rate|median|avg)/i;

export function rowsUrl(featureServerUrl: string, limit = 10): string {
  const params = new URLSearchParams({ where: "1=1", outFields: "*", returnGeometry: "false", resultRecordCount: String(limit), f: "json" });
  return `${featureServerUrl}/query?${params}`;
}

export function valuesUrl(featureServerUrl: string, field: string): string {
  const params = new URLSearchParams({ where: "1=1", outFields: field, returnGeometry: "false", resultRecordCount: "2000", f: "json" });
  return `${featureServerUrl}/query?${params}`;
}

export function headlineColumn(fields: string[]): string | null {
  return fields.find((f) => HEADLINE.test(f)) ?? null;
}

// Layers for different years spell the same column differently (per_asthma vs Per_Asthma); ArcGIS accepts
// any case in outFields but answers with the layer's own spelling.
export function fieldValue(attributes: Record<string, unknown>, field: string): unknown {
  if (field in attributes) return attributes[field];
  const key = Object.keys(attributes).find((k) => k.toLowerCase() === field.toLowerCase());
  return key === undefined ? undefined : attributes[key];
}

export function sharedScale(series: number[][]): { min: number; max: number } | null {
  const all = series.flat().filter(Number.isFinite);
  if (all.length === 0) return null;
  const min = all.reduce((m, v) => Math.min(m, v), Infinity);
  const max = all.reduce((m, v) => Math.max(m, v), -Infinity);
  return min === max ? { min: min - 1, max: max + 1 } : { min, max };
}

export type FetchResult<T> = { ok: true; data: T } | { ok: false; reason: string };

export async function fetchJson<T>(url: string, ms = PREVIEW_TIMEOUT_MS, fetchImpl: typeof fetch = fetch): Promise<FetchResult<T>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("timeout")), ms);
    });
    const res = await Promise.race([fetchImpl(url), timeout]);
    if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` };
    const body = await res.json();
    if (body?.error) return { ok: false, reason: String(body.error.message ?? "ArcGIS error") };
    return { ok: true, data: body as T };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(timer);
  }
}
