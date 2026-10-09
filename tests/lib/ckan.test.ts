import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchCityCatalog, parseCkan } from "../../convex/lib/ckan";
import { CRIME_CURRENT_RID, cityCatalog, cityPackages } from "../helpers/cityFixtures";
import { installFakeFetch } from "../helpers/fakeFetch";

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

describe("fetchCityCatalog", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("reads every package", async () => {
    installFakeFetch({ cityCatalog: cityCatalog() });
    expect(await fetchCityCatalog()).toHaveLength(3);
  });
  it("throws when the catalog ends before its own count", async () => {
    installFakeFetch({ cityCatalog: { success: true, result: { count: 3, results: cityPackages().slice(0, 1) } } });
    await expect(fetchCityCatalog()).rejects.toThrow("City catalog ended early: got 1 of 3");
  });
  it("throws when the catalog comes back empty", async () => {
    installFakeFetch({ cityCatalog: { success: true, result: { count: 0, results: [] } } });
    await expect(fetchCityCatalog()).rejects.toThrow("City catalog came back empty");
  });
});
