import { describe, expect, it } from "vitest";
import { neighborhoodsFor } from "../../convex/lib/tractNames";

const defs = [
  { name: "Harambee", tracts: [{ years: [2023], tracts: ["1860", "45"] }] },
  { name: "Hillside", tracts: [{ years: [2023], tracts: ["1860"] }] },
  { name: "Lindsay Heights", tracts: [{ years: [2022, 2023], tracts: ["1860"] }] },
];

describe("neighborhoodsFor", () => {
  it("names every DYCU area that lists the tract that year, in definition order", () => {
    expect(neighborhoodsFor("1860", 2023, defs)).toEqual(["Harambee", "Hillside", "Lindsay Heights"]);
    expect(neighborhoodsFor("1860", 2022, defs)).toEqual(["Lindsay Heights"]);
  });
  it("returns none for a tract in no area", () => {
    expect(neighborhoodsFor("601", 2023, defs)).toEqual([]);
  });
});
