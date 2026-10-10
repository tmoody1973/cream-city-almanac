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
  it("calls a column a rate, a count or a value from its name and meaning", () => {
    expect(columnKind("pov_rate", "Share of households in poverty")).toBe("rate");
    expect(columnKind("per_insecure", "Percent of adults")).toBe("rate");
    expect(columnKind("households", "Number of households")).toBe("count");
    expect(columnKind("med_age", "Median age")).toBe("value");
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
});
