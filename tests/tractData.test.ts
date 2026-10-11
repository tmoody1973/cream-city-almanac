import { afterEach, describe, expect, it, vi } from "vitest";
import { columnKind, fetchTractRows, isNumericField, normalizeGeoid, parseRows, rangeColumns, rowsUrl, tractNumber } from "../convex/lib/tractData";
import { neighborhoodFor } from "../convex/lib/tractNames";

afterEach(() => vi.unstubAllGlobals());

describe("columns", () => {
  it("finds a Census margin or a CDC interval, case-insensitively", () => {
    expect(rangeColumns("pov_rate", ["GEOID", "pov_rate", "POV_RATE_MOE"])).toEqual({ kind: "moe90", moe: "POV_RATE_MOE" });
    expect(rangeColumns("per_insecure", ["GEOID", "per_insecure", "Low_Confidence_Limit", "High_Confidence_Limit"])).toEqual({ kind: "ci95", lo: "Low_Confidence_Limit", hi: "High_Confidence_Limit" });
    expect(rangeColumns("households", ["GEOID", "households"])).toBeNull();
  });
  it("pairs a count or rate with its margin by DYCU's definitions, only when the margin field is present", () => {
    const glossary = [
      { field: "per_broadband", meaning: "Estimate - percentage of households with a broadband internet subscription of any kind" },
      { field: "per_broad_moe", meaning: "Margin of Error - percentage of households with a broadband internet subscription of any kind" },
      { field: "per_no_vehicle", meaning: "Estimate - percentage of households without access to a vehicle Calculation: (no_vehicle / households)*100" },
      { field: "per_noveh_moe", meaning: "Margin of Error - percentage of households without access to a vehicle" },
    ];
    expect(rangeColumns("per_broadband", ["GEOID", "per_broadband", "per_broad_moe"], glossary)).toEqual({ kind: "moe90", moe: "per_broad_moe" });
    expect(rangeColumns("per_no_vehicle", ["GEOID", "per_no_vehicle", "PER_NOVEH_MOE"], glossary)).toEqual({ kind: "moe90", moe: "PER_NOVEH_MOE" });
    expect(rangeColumns("per_no_vehicle", ["GEOID", "per_no_vehicle"], glossary)).toBeNull();
    expect(rangeColumns("per_broadband", ["per_broadband", "x_moe"], [{ field: "per_broadband", meaning: "Estimate - a" }, { field: "x_moe", meaning: "Margin of Error - b" }])).toBeNull();
  });
  it("prefers the exact _moe name, and reads CDC limits without the suffix", () => {
    expect(rangeColumns("a", ["a", "a_moe", "per_x_moe"], [{ field: "a", meaning: "Estimate - q" }, { field: "per_x_moe", meaning: "Margin of Error - q" }])).toEqual({ kind: "moe90", moe: "a_moe" });
    expect(rangeColumns("v", ["v", "Low_Confidence", "High_Confidence"])).toEqual({ kind: "ci95", lo: "Low_Confidence", hi: "High_Confidence" });
  });
  it("calls a column a rate, a count or a value from its name and meaning", () => {
    expect(columnKind("pov_rate", "Share of households in poverty")).toBe("rate");
    expect(columnKind("per_insecure", "Percent of adults")).toBe("rate");
    expect(columnKind("households", "Number of households")).toBe("count");
    expect(columnKind("med_age", "Median age")).toBe("value");
  });
  it("reads DYCU's real definitions", () => {
    expect(columnKind("median_income", "Estimate - median household income for households")).toBe("value");
    expect(columnKind("diversity_index", "Estimate - diversity index of the population")).toBe("value");
    expect(columnKind("households", "Estimate - total number of households")).toBe("count");
    expect(columnKind("poverty", "Estimate - number of households with income below the poverty line")).toBe("count");
    expect(columnKind("pov_rate", "Estimate - Percentage of households with income below the poverty line")).toBe("rate");
    expect(columnKind("per_insecure", "Estimate - percentage of population 18 years or older who are food insecure")).toBe("rate");
    expect(columnKind("mod_units", "Estimate - moderate income housing units")).toBe("value");
  });
  it("accepts number field types only", () => {
    expect(isNumericField({ name: "pov_rate", alias: "", type: "Double" })).toBe(true);
    expect(isNumericField({ name: "GEOID", alias: "", type: "String" })).toBe(false);
  });
});

describe("tract ids", () => {
  it("normalizes numbers and bare tract codes to 11 digits, and rejects junk", () => {
    expect(normalizeGeoid(55079160101)).toBe("55079160101");
    expect(normalizeGeoid("160101")).toBe("55079160101");
    expect(normalizeGeoid(" 55079180500 ")).toBe("55079180500");
    expect(normalizeGeoid("abc")).toBeNull();
    expect(normalizeGeoid(null)).toBeNull();
    expect(normalizeGeoid("55133200100")).toBeNull();
    expect(normalizeGeoid(55133200100)).toBeNull();
  });
  it("reads a tract number the way DYCU writes it", () => {
    expect(tractNumber("55079160101")).toBe("1601.01");
    expect(tractNumber("55079180500")).toBe("1805");
    expect(tractNumber("55079009000")).toBe("90");
  });
  it("names a tract from DYCU's definition for that year, else null", () => {
    const defs = [{ name: "Harambee", tracts: [{ years: [2021, 2022, 2023, 2024], tracts: ["1860", "90"] }] }];
    expect(neighborhoodFor("90", 2022, defs)).toBe("Harambee");
    expect(neighborhoodFor("90", 2019, defs)).toBeNull();
    expect(neighborhoodFor("1805", 2022, defs)).toBeNull();
  });
});

describe("rows", () => {
  it("leaves out blanks and Census jam values, and builds ranges", () => {
    const features = [
      { attributes: { GEOID: "55079160101", pov_rate: 40, pov_rate_moe: 6 } },
      { attributes: { GEOID: "55079180500", pov_rate: -666666666, pov_rate_moe: -222222222 } },
      { attributes: { GEOID: "55079009000", pov_rate: null, pov_rate_moe: 1 } },
      { attributes: { GEOID: "bad", pov_rate: 5, pov_rate_moe: 1 } },
    ];
    expect(parseRows(features, "pov_rate", { kind: "moe90", moe: "pov_rate_moe" })).toEqual({
      values: [{ geoid: "55079160101", value: 40, lo: 34, hi: 46, kind: "moe90" }],
      leftOut: 3,
    });
  });
  it("keeps the value but gives no range for a negative or sentinel margin", () => {
    const r = (moe: unknown) => parseRows([{ attributes: { GEOID: "55079160101", pov_rate: 40, pov_rate_moe: moe } }], "pov_rate", { kind: "moe90", moe: "pov_rate_moe" });
    const none = { values: [{ geoid: "55079160101", value: 40, lo: null, hi: null, kind: null }], leftOut: 0 };
    expect(r(-5)).toEqual(none);
    expect(r(-222222222)).toEqual(none);
    expect(r(Infinity)).toEqual(none);
    expect(r(0)).toEqual({ values: [{ geoid: "55079160101", value: 40, lo: 40, hi: 40, kind: "moe90" }], leftOut: 0 });
  });
  it("keeps the value but gives no range for a backwards or unusable CDC interval", () => {
    const ci = { kind: "ci95", lo: "Low", hi: "High" } as const;
    const r = (lo: unknown, hi: unknown) => parseRows([{ attributes: { GEOID: "55079160101", v: 15, Low: lo, High: hi } }], "v", ci);
    const none = { values: [{ geoid: "55079160101", value: 15, lo: null, hi: null, kind: null }], leftOut: 0 };
    expect(r(20, 10)).toEqual(none);
    expect(r(null, 10)).toEqual(none);
    expect(r(10, 20)).toEqual({ values: [{ geoid: "55079160101", value: 15, lo: 10, hi: 20, kind: "ci95" }], leftOut: 0 });
  });
  it("keeps a CDC range only when the value sits inside it", () => {
    const ci = { kind: "ci95", lo: "Low", hi: "High" } as const;
    const out = parseRows([{ attributes: { GEOID: "55079160101", v: 30, Low: 10, High: 20 } }], "v", ci);
    expect(out.values).toEqual([{ geoid: "55079160101", value: 30, lo: null, hi: null, kind: null }]);
  });
  it("asks for only the fields it needs, a page at a time", () => {
    expect(rowsUrl("https://x/FeatureServer/0", ["GEOID", "pov_rate"], 2000)).toBe("https://x/FeatureServer/0/query?where=1%3D1&outFields=GEOID%2Cpov_rate&returnGeometry=false&resultOffset=2000&resultRecordCount=2000&f=json");
  });
  it("follows DYCU's pages until the server says there are no more", async () => {
    const page = (n: number, more: boolean) => ({ features: Array.from({ length: n }, (_, i) => ({ attributes: { GEOID: String(55079000100 + i * 100 + n), v: i } })), exceededTransferLimit: more });
    const fetchMock = vi.fn(async (url: string) => new Response(JSON.stringify(url.includes("resultOffset=0") ? page(2000, true) : page(5, false))));
    vi.stubGlobal("fetch", fetchMock);
    const r = await fetchTractRows("https://x/FeatureServer/0", "v", null);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(r.values.length + r.leftOut).toBe(2005);
  });
  it("advances by the rows it received, not the page size", async () => {
    const rows = (n: number, from: number) => Array.from({ length: n }, (_, i) => ({ attributes: { GEOID: String(55079000100 + (from + i) * 100), v: 1 } }));
    const fetchMock = vi.fn(async (url: string) => new Response(JSON.stringify(url.includes("resultOffset=0") ? { features: rows(1000, 0), exceededTransferLimit: true } : { features: rows(5, 1000), exceededTransferLimit: false })));
    vi.stubGlobal("fetch", fetchMock);
    const r = await fetchTractRows("https://x/FeatureServer/0", "v", null);
    expect(fetchMock.mock.calls[1][0]).toContain("resultOffset=1000");
    expect(r.values.length).toBe(1005);
  });
  it("throws on a bad status, an error body, or a result that never finishes", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 500 })));
    await expect(fetchTractRows("https://x/FeatureServer/0", "v", null)).rejects.toThrow(/500/);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { message: "boom" } }))));
    await expect(fetchTractRows("https://x/FeatureServer/0", "v", null)).rejects.toThrow(/boom/);
    const endless = vi.fn(async () => new Response(JSON.stringify({ features: [{ attributes: { GEOID: "55079000100", v: 1 } }], exceededTransferLimit: true })));
    vi.stubGlobal("fetch", endless);
    await expect(fetchTractRows("https://x/FeatureServer/0", "v", null)).rejects.toThrow(/more than/);
    expect(endless).toHaveBeenCalledTimes(10);
  });
});
