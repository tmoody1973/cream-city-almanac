import { describe, expect, it } from "vitest";
import { addDays, cleanAddress, daysToClose, medianOf, mergeHist, parseBatchReply, resolveTypes, toBatchCsv, yearOf } from "./requests311";

describe("311 helpers", () => {
  it("cleans an address, dropping a unit and keeping Milwaukee as a street", () => {
    expect(cleanAddress("2613 W CAPITOL DR, 3, MILWAUKEE, WI, 53206-1413")).toEqual({ street: "2613 W CAPITOL DR", city: "MILWAUKEE", state: "WI", zip: "53206" });
    expect(cleanAddress("1 N MILWAUKEE ST, MILWAUKEE, WI, 53202-0000")).toEqual({ street: "1 N MILWAUKEE ST", city: "MILWAUKEE", state: "WI", zip: "53202" });
    expect(cleanAddress("3814 W KAUL AV")).toBeNull();
    expect(cleanAddress("W WELLS ST, MILWAUKEE, WI, 53202")).toBeNull();
    expect(cleanAddress(null)).toBeNull();
  });
  it("round-trips a batch: CSV out, Census reply in", () => {
    expect(toBatchCsv([{ key: "a1", street: "200 E WELLS ST", city: "MILWAUKEE", state: "WI", zip: "53202" }])).toBe('"a1","200 E WELLS ST","MILWAUKEE","WI","53202"\n');
    const reply = '"a1","200 E WELLS ST, MILWAUKEE, WI, 53202","Match","Exact","200 E WELLS ST, MILWAUKEE, WI, 53202","-87.909,43.041","1","L","55","079","187000","1000"\n"a2","9 NOWHERE, MILWAUKEE, WI, 53202","No_Match"\n';
    expect(parseBatchReply(reply)).toEqual(new Map([["a1", { lat: 43.041, lon: -87.909, geoid: "55079187000" }], ["a2", null]]));
  });
  it("counts days only for readable, non-negative spans", () => {
    expect(daysToClose("2026-01-01 00:00:00", "2026-01-04 00:00:00")).toEqual({ closed: true, days: 3 });
    expect(daysToClose("2026-01-04 00:00:00", "2026-01-01 00:00:00")).toEqual({ closed: true, days: null });
    expect(daysToClose("2026-01-01 00:00:00", null)).toEqual({ closed: false, days: null });
    expect(daysToClose("2026-01-01 00:00:00", "soon")).toEqual({ closed: false, days: null });
    expect(yearOf("2026-10-19 00:00:00")).toBe(2026);
    expect(yearOf("")).toBeNull();
  });
  it("merges histograms exactly and takes the middle", () => {
    const h = mergeHist(addDays(addDays({}, 0), 2), { "2": 1, "10": 1 });
    expect(h).toEqual({ "0": 1, "2": 2, "10": 1 });
    expect(medianOf(h)).toBe(2);
    expect(medianOf({ "1": 1, "4": 1 })).toBe(2.5);
    expect(medianOf({})).toBeNull();
  });
  it("resolves type words and groups, or offers choices", () => {
    const known = ["Potholes", "Pothole in Alley", "Street Light Out", "Area Dark", "Dead Animal"];
    expect(resolveTypes("potholes", known)).toEqual({ types: ["Potholes", "Pothole in Alley"] });
    expect(resolveTypes("streetlights", known)).toEqual({ types: ["Street Light Out", "Area Dark"] });
    expect(resolveTypes("dead animal", known)).toEqual({ types: ["Dead Animal"] });
    expect(resolveTypes(undefined, known)).toEqual({ types: known });
    expect(resolveTypes("snow", known)).toMatchObject({ choices: expect.any(Array) });
  });
});
