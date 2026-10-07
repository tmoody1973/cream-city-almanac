import { describe, expect, it } from "vitest";
import { cellKey, placeYearGrid } from "../../convex/lib/grid";

describe("placeYearGrid", () => {
  it("lists City and County first, years ascending, and the filled cells", () => {
    const grid = placeYearGrid([
      { place: "County", years: [2023] },
      { place: "City", years: [2022] },
      { place: "Harambee", years: [2022, 2023] },
    ]);
    expect(grid.places).toEqual(["City", "County", "Harambee"]);
    expect(grid.years).toEqual([2022, 2023]);
    expect(grid.cells.sort()).toEqual([cellKey("City", 2022), cellKey("County", 2023), cellKey("Harambee", 2022), cellKey("Harambee", 2023)].sort());
  });
  it("labels a member without a place as Milwaukee and handles no years", () => {
    expect(placeYearGrid([{ place: null, years: [] }])).toEqual({ places: ["Milwaukee"], years: [], cells: [] });
  });
});
