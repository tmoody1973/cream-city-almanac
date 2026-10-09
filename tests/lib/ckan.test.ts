import { describe, expect, it } from "vitest";
import { parseCkan } from "../../convex/lib/ckan";
import { CRIME_CURRENT_RID, cityPackages } from "../helpers/cityFixtures";

describe("parseCkan", () => {
  const items = parseCkan(cityPackages() as never);
  it("maps a package to a City item with its live resource", () => {
    expect(items[0]).toMatchObject({
      hubId: "city:a1", kind: "dataset", title: "NIBRS Crime Data (Current)", source: "city",
      datastoreId: CRIME_CURRENT_RID, landingPage: "https://data.milwaukee.gov/dataset/wibr",
      description: "NIBRS Crime Data (Current) from the City of Milwaukee.", keywords: ["crime"],
      groups: ["Public Safety"], created: "2023-01-05T00:00:00.000000", featureServerUrl: null,
    });
    expect(items[0].downloads).toEqual({ CSV: "https://data.milwaukee.gov/x/current.csv" });
  });
  it("leaves datastoreId null when no resource is live", () => {
    expect(items[2].datastoreId).toBeNull();
  });
});
