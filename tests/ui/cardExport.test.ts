import { describe, expect, it } from "vitest";
import { csvCell, exportState, exported, safeName, sourceNote, toCsv, toText, type CardExport } from "../../ui/lib/cardExport";

const ctx = { origin: "https://almanac.test", date: "October 12, 2026" };
const e: CardExport = {
  title: "Highest pov_rate · County 2023",
  lines: ["One line."],
  csv: { head: ["Tract", "pov_rate (percent)", "Change"], rows: [["1860", 41.25, -3.75], ["93", null, 0]] },
  text: { head: ["Tract", "pov_rate"], rows: [["1860", "41.3%"]] },
  notes: ["A note, with a comma.", "Source: DYCU, E02: https://almanac.test/d/E02"],
  filename: "almanac_x",
};

describe("CSV cells", () => {
  it("quotes commas, quotes and line breaks", () => {
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("two\nlines")).toBe('"two\nlines"');
  });
  it("guards text a spreadsheet would run as a formula, never a number", () => {
    expect(csvCell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell("-")).toBe("'-");
    expect(csvCell("@x")).toBe("'@x");
    expect(csvCell(-3.75)).toBe("-3.75");
    expect(csvCell(null)).toBe("");
    expect(csvCell(Number.NaN)).toBe("");
  });
});

describe("CSV", () => {
  it("starts with the byte-order mark, then the table, a blank row, then title, lines and notes", () => {
    const csv = toCsv(e);
    expect(csv.startsWith("﻿Tract,pov_rate (percent),Change\r\n1860,41.25,-3.75\r\n93,,0\r\n\r\n")).toBe(true);
    expect(csv).toContain("\r\nHighest pov_rate · County 2023\r\nOne line.\r\n\"A note, with a comma.\"\r\n\"Source: DYCU, E02: https://almanac.test/d/E02\"\r\n");
  });
});

describe("text", () => {
  it("is the title and lines, the table with ' · ' between cells, then the notes", () => {
    expect(toText(e)).toBe("Highest pov_rate · County 2023\nOne line.\n\nTract · pov_rate\n1860 · 41.3%\n\nA note, with a comma.\nSource: DYCU, E02: https://almanac.test/d/E02");
  });
});

describe("names and notes", () => {
  it("makes a safe file name", () => {
    expect(safeName(["E02-pov_rate", "County-2023", "rank"])).toBe("almanac_E02-pov_rate_County-2023_rank");
    expect(safeName(["N03", "Lindsay Heights/2023?"])).toBe("almanac_N03_Lindsay-Heights-2023-");
  });
  it("writes the source and the export date", () => {
    expect(sourceNote("DYCU", "E02", "Households Living in Poverty", ctx)).toBe("Source: DYCU, E02 Households Living in Poverty: https://almanac.test/d/E02");
    expect(sourceNote("City of Milwaukee", "P32", null, ctx)).toBe("Source: City of Milwaukee, P32: https://almanac.test/d/P32");
    expect(exported(ctx)).toBe("Exported from Cream City Almanac on October 12, 2026.");
  });
});

describe("export state", () => {
  it("is ready once the full answer is here, expired only without it, else loading", () => {
    expect(exportState(true, false)).toBe("ready");
    expect(exportState(true, true)).toBe("ready");
    expect(exportState(false, true)).toBe("expired");
    expect(exportState(false, false)).toBe("loading");
  });
});
