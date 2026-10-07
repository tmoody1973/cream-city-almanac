import { describe, expect, it } from "vitest";
import { parseDcat } from "../../convex/lib/dcat";
import { hubCatalog } from "../helpers/fixtures";

describe("parseDcat", () => {
  const items = parseDcat(hubCatalog);

  it("reads every Hub item", () => {
    expect(items).toHaveLength(382);
  });

  it("classifies kinds from the landing-page path", () => {
    const count = (kind: string) => items.filter((i) => i.kind === kind).length;
    expect([count("dataset"), count("document"), count("app"), count("page")]).toEqual([93, 279, 7, 3]);
  });

  it("extracts id, FeatureServer URL, downloads and clean text for a dataset", () => {
    const air = items.find((i) => i.title === "2025 Milwaukee Daily Air Quality")!;
    expect(air.hubId).toBe("71c0bb622b424b659f3527d05ac34797");
    expect(air.featureServerUrl).toMatch(/FeatureServer\/0$/);
    expect(air.downloads.CSV).toContain("/api/download/v1/items/71c0bb622b424b659f3527d05ac34797/csv");
    expect(air.description).not.toMatch(/<|&nbsp;/);
  });

  it("keeps the app URL for apps instead of a FeatureServer URL", () => {
    const app = items.find((i) => i.title === "MKE FreshAir Dashboard")!;
    expect(app.featureServerUrl).toBeNull();
    expect(app.downloads.App).toMatch(/^https:\/\//);
  });

  it("rejects a feed without a dataset array", () => {
    expect(() => parseDcat({})).toThrow("Hub feed has no dataset array");
  });
});
