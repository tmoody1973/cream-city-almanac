import { fetchWithTimeout } from "./http";
import { stripHtml } from "./text";
import type { HubItem } from "./types";

// City of Milwaukee open data (CKAN). Public, no key; CORS allows browsers too.
export const CKAN_API = "https://data.milwaukee.gov/api/3/action/";
const PAGE = 1000;
const CATALOG_TIMEOUT_MS = 30_000;
const QUERY_TIMEOUT_MS = 10_000;

interface CkanResource { id: string; format?: string; url?: string; datastore_active?: boolean }
export interface CkanPackage {
  id: string; name: string; title: string; notes?: string | null; metadata_modified: string; metadata_created: string;
  tags?: { name: string }[]; groups?: { title: string }[]; resources: CkanResource[];
}

export function parseCkan(packages: CkanPackage[]): HubItem[] {
  return packages.map((p) => ({
    hubId: `city:${p.id}`,
    kind: "dataset",
    title: p.title.trim(),
    description: stripHtml(p.notes ?? ""),
    keywords: (p.tags ?? []).map((t) => t.name),
    modified: p.metadata_modified,
    landingPage: `https://data.milwaukee.gov/dataset/${p.name}`,
    featureServerUrl: null,
    downloads: Object.fromEntries(p.resources.filter((r) => r.url && r.format).map((r) => [r.format!.toUpperCase(), r.url!])),
    source: "city",
    datastoreId: p.resources.find((r) => r.datastore_active)?.id ?? null,
    created: p.metadata_created,
    groups: (p.groups ?? []).map((g) => g.title.trim()),
  }));
}

async function action<T>(name: string, params: Record<string, string | number>, timeoutMs: number): Promise<T> {
  const url = `${CKAN_API}${name}?${new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]))}`;
  const res = await fetchWithTimeout(url, {}, timeoutMs);
  if (!res.ok) throw new Error(`City API ${res.status} for ${name}`);
  const body = (await res.json()) as { success: boolean; result: T; error?: { message?: string } };
  if (!body.success) throw new Error(`City API error: ${body.error?.message ?? "unknown"}`);
  return body.result;
}

export async function fetchCityCatalog(): Promise<HubItem[]> {
  const all: CkanPackage[] = [];
  for (let start = 0; ; start += PAGE) {
    const r = await action<{ count: number; results: CkanPackage[] }>("package_search", { rows: PAGE, start }, CATALOG_TIMEOUT_MS);
    all.push(...r.results);
    if (all.length >= r.count || r.results.length === 0) break;
  }
  return parseCkan(all);
}

export async function datastoreFields(resourceId: string): Promise<{ id: string; type: string }[]> {
  const r = await action<{ fields: { id: string; type: string }[] }>("datastore_search", { resource_id: resourceId, limit: 0 }, QUERY_TIMEOUT_MS);
  return r.fields.filter((f) => f.id !== "_id");
}

export async function datastoreSql<T>(sql: string): Promise<T[]> {
  return (await action<{ records: T[] }>("datastore_search_sql", { sql }, QUERY_TIMEOUT_MS)).records;
}
