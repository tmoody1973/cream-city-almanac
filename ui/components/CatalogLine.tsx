import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
import { asOfLabel } from "@/ui/lib/format";
import styles from "./rundown.module.css";

export type CatalogStatus = FunctionReturnType<typeof api.search.catalogStatus>;

export function CatalogLine({ status }: { status: CatalogStatus }) {
  if (status.asOf === null) return <p className={styles.catalogLine}>Catalog is being built for the first time.</p>;
  const parts = [`Catalog as of ${asOfLabel(status.asOf)}`];
  // Same words as the Hub's Collections filter, so the numbers visibly line up with getdata-dycu.hub.arcgis.com.
  if (status.counts) {
    parts.push(`${status.counts.rawData} raw data`, `${status.counts.reports} reports`, `${status.counts.visualizations} visualizations`);
  }
  if (status.lastRunFailed) parts.push("last refresh failed");
  return <p className={styles.catalogLine}>{parts.join(" · ")}</p>;
}
