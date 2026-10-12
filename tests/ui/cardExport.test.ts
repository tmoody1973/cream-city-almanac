import { describe, expect, it } from "vitest";
import { changeExport, csvCell, exportState, exported, rankExport, relateExport, safeName, sourceNote, toCsv, toText, type CardExport } from "../../ui/lib/cardExport";
import type { ChangeDetail, Header, RankDetail, RelateDetail, TractRow } from "../../convex/tracts";
import { EXACT } from "../../ui/lib/tractSummary";

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


const pov: Header = { code: "E02", name: "Households Living in Poverty", column: "pov_rate", meaning: "Percentage of households with income below the poverty line", kind: "rate", place: "County", year: "2023", n: 210, leftOut: 0, confidence: "90% confidence (Census)", url: "https://x.test/0", caveats: ["Five-year estimates."] };
const tractRow = (geoid: string, tract: string, value: number, extra: Partial<TractRow> = {}): TractRow => ({ geoid, tract, city: [], dycu: [], value, lo: value - 2, hi: value + 2, unreliable: false, ...extra });
const hillside = tractRow("55079186000", "1860", 41.25, { city: [{ name: "Hillside", share: 51 }, { name: "Halyard Park", share: 27 }, { name: "Triangle North", share: 13 }], dycu: ["Harambee", "Hillside", "Lindsay Heights"] });
const card = { title: "Highest pov_rate · County 2023", lines: ["Summary sentence."], fine: " Ranges are margins of error: 90% confidence (Census)." };

describe("rank export", () => {
  const d: RankDetail = {
    status: "ok", tool: "rank", header: pov, direction: "high", top: [hillside],
    ties: [tractRow("55079009300", "93", 40, { city: [{ name: "Uptown", share: 50 }, { name: "Washington Heights", share: 50 }] })], tieCount: 1,
    unreliable: [tractRow("55079000101", "1.01", 39, { unreliable: true, lo: 10, hi: 68 })], unreliableCount: 1, highlighted: [], key: "k",
  };
  const e = rankExport(d, card, ctx);
  it("lists every ranked, tied and too-uncertain tract with stored values", () => {
    expect(e.csv.head).toEqual(["Rank", "Tract", "GEOID", "City neighborhoods", "DYCU areas", "pov_rate (percent)", "Low", "High", "Status"]);
    expect(e.csv.rows).toEqual([
      [1, "1860", "55079186000", "Hillside 51%; Halyard Park 27%; Triangle North 13%", "Harambee, Hillside, Lindsay Heights", 41.25, 39.25, 43.25, "ranked"],
      [null, "93", "55079009300", "Uptown 50%; Washington Heights 50%", "", 40, 38, 42, "tied"],
      [null, "1.01", "55079000101", "", "", 39, 10, 68, "too uncertain"],
    ]);
  });
  it("shows the card's rounding in text, with = for a tie and – for too uncertain", () => {
    expect(e.text.head).toEqual(["#", "Tract", "Neighborhood", "DYCU area", "pov_rate", "Status"]);
    expect(e.text.rows[0]).toEqual(["1", "1860", "Hillside 51% · Halyard Park 27% · Triangle North 13%", "Harambee, Hillside, Lindsay Heights", "41.3% (39.3–43.3%)", "ranked"]);
    expect(e.text.rows[1][0]).toBe("=");
    expect(e.text.rows[2][0]).toBe("–");
    expect(e.text.rows[2][2]).toBe("—");
  });
  it("carries the card's title, its dataset line, summary, fine print, caveats and source", () => {
    expect(e.title).toBe("Highest pov_rate · County 2023");
    expect(e.lines).toEqual(["E02 pov_rate (Percentage of households with income below the poverty line, a rate) · County 2023 · 210 census tracts", "Summary sentence."]);
    expect(e.notes).toEqual([
      "Ranges are margins of error: 90% confidence (Census).",
      "Caveat (E02): Five-year estimates.",
      "Source: DYCU, E02 Households Living in Poverty: https://almanac.test/d/E02",
      "Exported from Cream City Almanac on October 12, 2026.",
    ]);
    expect(e.filename).toBe("almanac_E02-pov_rate_County-2023_rank");
  });
});

describe("change export", () => {
  const d: ChangeDetail = {
    status: "ok", tool: "change", header: pov, note: "Neighboring releases share four years of responses.", from: "2022", to: "2023",
    increases: 0, decreases: 1, none: 5, unreliableCount: 0, changeCount: 1, highlighted: [], key: "c",
    changes: [{ geoid: "55079186000", tract: "1860", city: hillside.city, dycu: hillside.dycu, from: tractRow("55079186000", "1860", 45), to: hillside, change: -3.75, direction: "decrease" }],
  };
  const e = changeExport(d, { ...card, title: "pov_rate · County 2022 → 2023" }, ctx);
  it("gives both years' values and ranges, the change and its direction", () => {
    expect(e.csv.head).toEqual(["Tract", "GEOID", "City neighborhoods", "DYCU areas", "2022 pov_rate (percent)", "2022 low", "2022 high", "2023 pov_rate (percent)", "2023 low", "2023 high", "Change", "Direction"]);
    expect(e.csv.rows[0]).toEqual(["1860", "55079186000", "Hillside 51%; Halyard Park 27%; Triangle North 13%", "Harambee, Hillside, Lindsay Heights", 45, 43, 47, 41.25, 39.25, 43.25, -3.75, "decrease"]);
    expect(toCsv(e)).toContain(",-3.75,decrease\r\n");
    expect(e.text.rows[0][5]).toContain("3.8 points (clear decrease)");
  });
  it("keeps the card's note on years and names the file by both years", () => {
    expect(e.notes).toContain("Neighboring releases share four years of responses.");
    expect(e.filename).toBe("almanac_E02-pov_rate_County-2022-2023_change");
  });
});

describe("relate export", () => {
  const value: Header = { code: "H28", name: "Master Property File", column: "median_assessed", meaning: "Median assessed value", kind: "value", place: "County", year: "2023", n: 200, leftOut: 0, confidence: EXACT, url: "u", caveats: [] };
  const point = (geoid: string, tract: string, a: number, b: number, mark: "fits" | "close" | null, unreliable = false) =>
    ({ geoid, tract, city: geoid === hillside.geoid ? hillside.city : [], dycu: geoid === hillside.geoid ? hillside.dycu : [], a: [a, a - 5, a + 5] as [number, number, number], b: [b, b, b] as [number, number, number], unreliable, mark });
  const d: RelateDetail = {
    status: "ok", tool: "relate", mode: "mismatch", a: pov, b: value, n: 3, unreliableCount: 1, rho: 0.1, strength: "weak", direction: "higher",
    aSide: "high", bSide: "high", cutA: 30, cutB: 80000, fits: [], fitsCount: 1, close: [], closeCount: 1,
    points: [point("55079000101", "1.01", 30, 90000, null), point("55079186000", "1860", 41.25, 60000, "fits"), point("55079009300", "93", 40, 70000, "close", true)],
    highlighted: [], closeIds: [], key: "r",
  };
  const e = relateExport(d, { ...card, title: "Households Living in Poverty vs. Master Property File" }, ctx);
  it("lists clear matches, then possible ones, then the rest, with both sides", () => {
    expect(e.csv.head).toEqual(["Tract", "GEOID", "City neighborhoods", "DYCU areas", "E02 pov_rate (percent)", "E02 low", "E02 high", "H28 median_assessed (dollars)", "H28 low", "H28 high", "Match", "Status"]);
    expect(e.csv.rows.map((r) => r[0])).toEqual(["1860", "93", "1.01"]);
    expect(e.csv.rows[1].slice(-2)).toEqual(["possible match", "too uncertain"]);
  });
  it("shows an exact City figure without a range, and names both sources", () => {
    expect(e.text.rows[0][4]).toBe("$60,000");
    expect(e.text.rows[1][5]).toBe("possible match (too uncertain)");
    expect(e.lines[1]).toBe("H28 median_assessed (Median assessed value, a value) · County 2023");
    expect(e.notes).toContain("Source: City of Milwaukee, H28 Master Property File: https://almanac.test/d/H28");
    expect(e.notes).toContain("Source: DYCU, E02 Households Living in Poverty: https://almanac.test/d/E02");
    expect(e.filename).toBe("almanac_E02-pov_rate_H28-median_assessed_County-2023_relate");
  });
});
