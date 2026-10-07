import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
import { asOfLabel } from "@/ui/lib/format";
import styles from "./rundown.module.css";

export type CatalogStatus = FunctionReturnType<typeof api.search.catalogStatus>;

export function CatalogLine({ status }: { status: CatalogStatus }) {
  if (status.asOf === null) return <p className={styles.catalogLine}>Catalog is being built for the first time.</p>;
  const parts = [`Catalog as of ${asOfLabel(status.asOf)}`];
  if (status.families !== null) parts.push(`${status.families} datasets`);
  if (status.reports !== null) parts.push(`${status.reports} neighborhood reports`);
  if (status.lastRunFailed) parts.push("last refresh failed");
  return <p className={styles.catalogLine}>{parts.join(" · ")}</p>;
}
