import { describe, expect, it } from "vitest";
import { renderReport } from "../../convex/lib/report";

describe("renderReport", () => {
  it("summarizes counts, cost, mismatches and notes", () => {
    const md = renderReport({
      status: "completed",
      startedAt: Date.UTC(2026, 9, 12, 9),
      finishedAt: Date.UTC(2026, 9, 12, 9, 12),
      pending: 226,
      done: 40,
      skipped: 180,
      failed: 6,
      costUsd: 1.234,
      firecrawlCalls: 12,
      orphanChunksDeleted: 2,
      notes: ["report abc: Firecrawl 500"],
      mismatch: {
        unlinkedTabs: ["Milwaukee County Racial Demogra"],
        suspectLinks: [{ title: "2022 Milwaukee County Racial Demographics", tab: "Milwaukee County Racial and Eth" }],
        unmatchedHomeTitles: [],
        typoFixes: ["2024 Miwlaukee County Housing Tenure"],
      },
    });
    expect(md).toContain("# Catalog build: completed");
    expect(md).toContain("Items: 226 (40 written, 180 unchanged, 6 failed)");
    expect(md).toContain("Cost: $1.23");
    expect(md).toContain("- Milwaukee County Racial Demogra");
    expect(md).toContain("2022 Milwaukee County Racial Demographics → Milwaukee County Racial and Eth");
    expect(md).toMatch(/Home rows with no matching Hub dataset\n\n- none/);
    expect(md).toContain("- report abc: Firecrawl 500");
  });
});
