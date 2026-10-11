import { describe, expect, it } from "vitest";
import { cityList, cityWord, dycuText, placeLabel } from "@/ui/lib/placeNames";
import { AREA_NOTE } from "@/ui/lib/tractSummary";

const hillside = [{ name: "Hillside", share: 51 }, { name: "Halyard Park", share: 27 }, { name: "Triangle North", share: 13 }];

describe("place names", () => {
  it("says mostly at half the tract or more, partly below", () => {
    expect(cityWord({ name: "Hillside", share: 50 })).toBe("mostly Hillside");
    expect(cityWord({ name: "Northridge", share: 49 })).toBe("partly Northridge");
  });
  it("lists every neighborhood with its share", () => {
    expect(cityList(hillside)).toBe("Hillside 51% · Halyard Park 27% · Triangle North 13%");
  });
  it("joins DYCU areas, or a dash", () => {
    expect(dycuText(["Harambee", "Hillside", "Lindsay Heights"])).toBe("Harambee, Hillside, Lindsay Heights");
    expect(dycuText([])).toBe("—");
    expect(dycuText(undefined)).toBe("—"); // a card cached before tracts carried dycu
  });
  it("labels a scatter dot with either part, or neither", () => {
    expect(placeLabel(hillside, ["Harambee", "Hillside", "Lindsay Heights"])).toBe(" (mostly Hillside; DYCU: Harambee, Hillside, Lindsay Heights)");
    expect(placeLabel([], ["Harambee"])).toBe(" (DYCU: Harambee)");
    expect(placeLabel([{ name: "Northridge", share: 42 }], [])).toBe(" (partly Northridge)");
    expect(placeLabel(undefined, undefined)).toBe("");
  });
  it("the footer says what each column means", () => {
    expect(AREA_NOTE).toBe("Neighborhood: the City's official neighborhoods covering at least 10% of the tract, biggest first. DYCU area: the areas DYCU's reports group the tract into.");
  });
});
