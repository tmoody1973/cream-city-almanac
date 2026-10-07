import type { Mismatch } from "./types";

export interface ReportInput {
  status: string;
  startedAt: number;
  finishedAt: number | null;
  pending: number;
  done: number;
  skipped: number;
  failed: number;
  costUsd: number;
  firecrawlCalls: number;
  orphanChunksDeleted: number;
  notes: string[];
  mismatch: Mismatch | null;
}

const list = (title: string, items: string[]) =>
  `### ${title}\n\n${items.length ? items.map((i) => `- ${i}`).join("\n") : "- none"}\n`;

export function renderReport(b: ReportInput): string {
  const lines = [
    `# Catalog build: ${b.status}`,
    "",
    `- Started: ${new Date(b.startedAt).toISOString()}`,
    `- Finished: ${b.finishedAt ? new Date(b.finishedAt).toISOString() : "not finished"}`,
    `- Items: ${b.pending} (${b.done} written, ${b.skipped} unchanged, ${b.failed} failed)`,
    `- Cost: $${b.costUsd.toFixed(2)} (estimated from token counts)`,
    `- Firecrawl calls: ${b.firecrawlCalls}`,
    `- Orphaned report chunks removed: ${b.orphanChunksDeleted}`,
  ];
  if (b.mismatch) {
    lines.push(
      "",
      "## Sheet vs Hub mismatches",
      "",
      list("Definition tabs no Home row links to", b.mismatch.unlinkedTabs),
      list(
        "Home rows whose tab name does not match the dataset (check these)",
        b.mismatch.suspectLinks.map((l) => `${l.title} → ${l.tab}`),
      ),
      list("Home rows with no matching Hub dataset", b.mismatch.unmatchedHomeTitles),
      list("Typos corrected in Hub titles", b.mismatch.typoFixes),
    );
  }
  if (b.notes.length) lines.push("", "## Notes", "", ...b.notes.map((n) => `- ${n}`));
  return lines.join("\n");
}
