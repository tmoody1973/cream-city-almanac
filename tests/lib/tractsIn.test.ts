import { describe, expect, it } from "vitest";
import { areaHead, placeRanks, shareIn } from "../../convex/lib/tractsIn";
import { areaYears } from "../../convex/lib/tractNames";

const row = (city: { name: string; share: number }[], dycu: string[] = []) => ({ city, dycu });
const tv = (geoid: string, value: number, moe = 1) => ({ geoid, value, lo: value - moe, hi: value + moe, kind: "moe90" as const });

describe("which tracts are in a neighborhood", () => {
  it("reads the City share from the tract's own list, and 100 for a DYCU area", () => {
    expect(shareIn(row([{ name: "Bay View", share: 61 }, { name: "Fernwood", share: 39 }]), { name: "Bay View", map: "city" })).toBe(61);
    expect(shareIn(row([{ name: "Fernwood", share: 100 }]), { name: "Bay View", map: "city" })).toBeNull();
    expect(shareIn(row([], ["Harambee"]), { name: "Harambee", map: "dycu" })).toBe(100);
    expect(shareIn(row([{ name: "Harambee", share: 80 }]), { name: "Harambee", map: "dycu" })).toBeNull();
  });
  it("counts tracts under 90% inside as partly inside", () => {
    expect(areaHead({ name: "Bay View", map: "city" }, [100, 97, 61, 15])).toEqual({ name: "Bay View", map: "city", tracts: 4, partly: 2 });
  });
  it("ranks each reliable tract across the whole place, in the asked direction", () => {
    const r = placeRanks([tv("a", 10), tv("b", 30), tv("c", 20), tv("d", 25, 40)], "high");
    expect(r.of).toBe(3);
    expect([r.position.get("b"), r.position.get("c"), r.position.get("a"), r.position.get("d")]).toEqual([1, 2, 3, undefined]);
    expect(placeRanks([tv("a", 10), tv("b", 30)], "low").position.get("a")).toBe(1);
  });
  it("lists the years DYCU defines an area for", () => {
    expect(areaYears([{ name: "Harambee", tracts: [{ years: [2022, 2021], tracts: ["1860"] }, { years: [2023], tracts: ["1860"] }] }], "Harambee")).toEqual([2021, 2022, 2023]);
  });
});

describe("equal figures share a rank", () => {
  it("gives tied values the same position (1, 1, 3)", () => {
    const r = placeRanks([tv("a", 1950, 0), tv("b", 1950, 0), tv("c", 1940, 0)], "high");
    expect([r.position.get("a"), r.position.get("b"), r.position.get("c")]).toEqual([1, 1, 3]);
  });
});
