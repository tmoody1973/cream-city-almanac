import { describe, expect, it } from "vitest";
import { asOfPhrase, countsLine, pdfReportsPhrase } from "../../ui/lib/how";

const status = {
  asOf: Date.UTC(2026, 9, 7, 18),
  lastRunFailed: false,
  running: false,
  counts: { rawData: 93, reports: 282, visualizations: 7 },
  pdfReports: 180,
};

describe("countsLine and friends omit missing values", () => {
  it("says the Hub's counts in the Hub's words", () => {
    expect(countsLine(status)).toBe("93 raw data · 282 reports · 7 visualizations");
    expect(pdfReportsPhrase(status)).toBe("the 180 report PDFs");
    expect(asOfPhrase(status)).toBe("Oct 7");
  });
  it("omits numbers when the catalog can't be reached", () => {
    expect(countsLine(null)).toBeNull();
    expect(pdfReportsPhrase(null)).toBe("the neighborhood report PDFs");
    expect(asOfPhrase(null)).toBeNull();
    expect(countsLine({ ...status, counts: null })).toBeNull();
  });
});
