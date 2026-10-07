import { stripHtml } from "./text";
import type { HubItem, HubKind } from "./types";

export const HUB_FEED_URL = "https://getdata-dycu.hub.arcgis.com/api/feed/dcat-us/1.1.json";

const KIND_BY_PATH: Record<string, HubKind> = {
  datasets: "dataset",
  documents: "document",
  apps: "app",
  pages: "page",
};

interface DcatDistribution {
  format?: string;
  accessURL?: string;
  downloadURL?: string;
}

interface DcatEntry {
  title?: string;
  identifier?: string;
  landingPage?: string;
  description?: string;
  keyword?: string[];
  modified?: string;
  distribution?: DcatDistribution[];
}

export function parseDcat(feed: unknown): HubItem[] {
  const entries = (feed as { dataset?: unknown } | null)?.dataset;
  if (!Array.isArray(entries)) throw new Error("Hub feed has no dataset array");
  return entries.map((entry) => toHubItem(entry as DcatEntry));
}

function toHubItem(e: DcatEntry): HubItem {
  const hubId = /[?&]id=([0-9a-f]{32})/.exec(e.identifier ?? "")?.[1];
  if (!hubId) throw new Error(`Hub item has no ArcGIS id: ${e.identifier ?? e.title ?? "(unknown)"}`);
  const landingPage = e.landingPage ?? "";
  const path = /hub\.arcgis\.com\/([a-z]+)\//.exec(landingPage)?.[1] ?? "";
  const kind = KIND_BY_PATH[path] ?? "document";

  const downloads: Record<string, string> = {};
  let featureServerUrl: string | null = null;
  for (const d of e.distribution ?? []) {
    const url = d.accessURL ?? d.downloadURL;
    const format = d.format ?? "";
    if (!url || !format || format === "Web Page") continue;
    if (format === "ArcGIS GeoServices REST API") {
      if (kind === "dataset") featureServerUrl = url;
      else downloads.App = url;
      continue;
    }
    downloads[format] = url;
  }

  return {
    hubId,
    kind,
    title: (e.title ?? "").trim(),
    description: stripHtml(e.description ?? ""),
    keywords: e.keyword ?? [],
    modified: e.modified ?? "",
    landingPage,
    featureServerUrl,
    downloads,
  };
}
