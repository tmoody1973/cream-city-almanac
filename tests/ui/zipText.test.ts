import { describe, expect, it } from "vitest";
import { placeNote, verdictWord, ZIP_NOTES, zipExport, zipRefusal, zipTitle, type ZipOk } from "../../ui/lib/zipText";

const fig = (rate: number) => ({ rate: { estimate: rate, moe: 0.02 }, count: { estimate: 100, moe: 10 }, of: { estimate: 1000, moe: 10 } });
const r: ZipOk = {
  status: "ok", zip: "53228", period: "2020–2024", cityShare: 0.1, mainPlace: "Greenfield", population: { estimate: 14250, moe: 512 },
  race: [{ id: "white", label: "White (not Hispanic)", meaning: "Share of residents.", zip: fig(0.72), city: null, verdict: "unknown" }],
  facts: [{ id: "poverty", label: "People in poverty", meaning: "", zip: fig(0.08), city: fig(0.24), verdict: "lower" }],
};
const ctx = { origin: "https://x", date: "October 14, 2026" };

describe("ZIP card words (Z1)", () => {
  it("titles the card with the ZIP and survey years", () => {
    expect(zipTitle(r)).toBe("ZIP 53228 · Census estimates, 2020–2024");
  });
  it("says where the ZIP is unless nearly all of it is in the City (review focus 5)", () => {
    expect(placeNote({ cityShare: 0.1, mainPlace: "Greenfield" })).toBe("About 10% of this ZIP's land is in the City of Milwaukee; the largest part is in Greenfield. These figures cover the whole ZIP.");
    expect(placeNote({ cityShare: 0.5, mainPlace: "Milwaukee" })).toBe("About 50% of this ZIP's land is in the City of Milwaukee; the rest is in neighboring communities. These figures cover the whole ZIP.");
    expect(placeNote({ cityShare: 0.94, mainPlace: "Milwaukee" })).toMatch(/^About 94%/);
    expect(placeNote({ cityShare: 0.95, mainPlace: "Milwaukee" })).toBeNull();
    expect(placeNote({ cityShare: 0, mainPlace: "Cudahy" })).toBe("None of this ZIP's land is in the City of Milwaukee; the largest part is in Cudahy. These figures cover the whole ZIP.");
  });
  it("words each refusal", () => {
    expect(zipRefusal({ status: "outside", zip: "60601" })).toMatch(/touch Milwaukee County; 60601 isn't one of them/);
    expect(zipRefusal({ status: "bad-zip", zip: "5322" })).toMatch(/5-digit ZIP/);
    expect(zipRefusal({ status: "unavailable", zip: "53228" })).toBe("Census figures are unavailable right now; try again later.");
    expect(zipRefusal({ status: "busy" })).toMatch(/busy/);
  });
  it("exports every row with shares, margins, Milwaukee and the comparison, and the notes", () => {
    const e = zipExport(r, ctx);
    expect(e.title).toBe("ZIP 53228 · Census estimates, 2020–2024");
    expect(e.lines[0]).toBe("14,250 people (± 512)");
    expect(e.csv.head).toEqual(["Measure", "Unit", "ZIP 53228", "ZIP 53228 margin", "City of Milwaukee", "City margin", "Compared with the city"]);
    expect(e.csv.rows).toEqual([
      ["Population", "people", 14250, 512, null, null, ""],
      ["White (not Hispanic)", "share (0 to 1)", 0.72, 0.02, null, null, ""],
      ["People in poverty", "share (0 to 1)", 0.08, 0.02, 0.24, 0.02, "clearly lower than the city"],
    ]);
    expect(e.text.rows[1]).toEqual(["People in poverty", "8.0% ± 2.0 points", "24.0%", "clearly lower"]);
    expect(e.text.rows[0][2]).toBe("—");
    expect(e.notes).toEqual(expect.arrayContaining([expect.stringMatching(/close to, but not exactly, the post office's ZIP/), "U.S. Census Bureau, American Community Survey 5-year estimates, 2020–2024."]));
    expect(e.filename).toBe("almanac_zip_53228");
  });
});

describe("ZIP card on a phone (Z1 review)", () => {
  it("uses short comparison words, with one note for what they mean", () => {
    expect([verdictWord("higher"), verdictWord("lower"), verdictWord("same"), verdictWord("unknown")]).toEqual(["clearly higher", "clearly lower", "about the same", "—"]);
    expect(ZIP_NOTES).toContain("\u201cClearly higher\u201d or \u201clower\u201d means the gap is bigger than both margins of error; \u201cabout the same\u201d means it isn't.");
  });
});
