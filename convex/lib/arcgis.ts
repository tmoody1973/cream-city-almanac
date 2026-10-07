import type { Column } from "./types";

const SYSTEM_FIELDS = /^(objectid|fid|globalid|shape|shape__area|shape__length)$/i;

export async function fetchColumns(featureServerUrl: string): Promise<Column[]> {
  const res = await fetch(`${featureServerUrl}?f=json`);
  if (!res.ok) throw new Error(`FeatureServer ${res.status} for ${featureServerUrl}`);
  const body = await res.json();
  if (body.error) throw new Error(`FeatureServer error: ${body.error.message ?? "unknown"}`);
  return ((body.fields ?? []) as { name: string; alias?: string; type?: string }[])
    .filter((f) => !SYSTEM_FIELDS.test(f.name))
    .map((f) => ({ name: f.name, alias: f.alias ?? f.name, type: String(f.type ?? "").replace(/^esriFieldType/, "") }));
}

export function pdfUrl(hubId: string): string {
  return `https://www.arcgis.com/sharing/rest/content/items/${hubId}/data`;
}
