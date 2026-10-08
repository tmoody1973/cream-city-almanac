import type { CatalogStatus } from "@/ui/components/CatalogLine";
import { asOfLabel } from "./format";

export function countsLine(status: CatalogStatus | null): string | null {
  const c = status?.counts;
  return c ? `${c.rawData} raw data · ${c.reports} reports · ${c.visualizations} visualizations` : null;
}

export function pdfReportsPhrase(status: CatalogStatus | null): string {
  return typeof status?.pdfReports === "number" ? `the ${status.pdfReports} report PDFs` : "the neighborhood report PDFs";
}

export function asOfPhrase(status: CatalogStatus | null): string | null {
  return status?.asOf ? asOfLabel(status.asOf) : null;
}
