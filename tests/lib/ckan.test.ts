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
  it("with several live files and none '(Current)', picks the newest and keeps its name for the card (C2)", () => {
    const res = (id: string, name: string, last_modified: string | null, created: string) => ({ id, name, format: "CSV", url: `https://x/${name}.csv`, datastore_active: true, last_modified, created });
    const base = cityPackages()[0];
    const [yearly] = parseCkan([{ ...base, resources: [res("r-2024", "2024", "2025-01-02T00:00:00", "2024-01-01T00:00:00"), res("r-2025", "2025", null, "2025-01-03T00:00:00"), { id: "r-pdf", name: "Guide", format: "PDF", url: "https://x/g.pdf", datastore_active: false }] }] as never);
    expect(yearly).toMatchObject({ datastoreId: "r-2025", datastoreName: "2025" });
    const [current] = parseCkan([{ ...base, resources: [res("r-cur", "Crime (Current)", "2020-01-01T00:00:00", "2020-01-01T00:00:00"), res("r-2025", "2025", "2026-01-01T00:00:00", "2025-01-01T00:00:00")] }] as never);
    expect(current).toMatchObject({ datastoreId: "r-cur", datastoreName: "Crime (Current)" });
    expect(items[0].datastoreName).toBeNull();
  });
  it("keeps every file with its name, even several of one format (WIBR's ten map layers)", () => {
    const layer = (n: number, name: string) => ({ id: `l${n}`, name, format: "Esri REST", url: `https://maps.example/MapServer/${n}`, datastore_active: false });
    const note = { id: "note", name: "UPDATE 3/2025 - Shootings", format: "link", url: "" };
    const [wibr] = parseCkan([{ ...cityPackages()[0], resources: [layer(0, "Homicides"), layer(1, " Arson "), note] }] as never);
    expect(wibr.files).toEqual([
      { name: "Homicides", format: "Esri REST", url: "https://maps.example/MapServer/0" },
      { name: "Arson", format: "Esri REST", url: "https://maps.example/MapServer/1" },
    ]);
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
