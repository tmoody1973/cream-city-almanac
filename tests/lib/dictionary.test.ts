import { describe, expect, it } from "vitest";
import {
  isSuspectLink,
  mapDictionaries,
  parseDictionaryTab,
  readInventory,
  unlinkedTabs,
} from "../../convex/lib/dictionary";
import { fixtureFamilies, inventoryBytes } from "../helpers/fixtures";

describe("parseDictionaryTab", () => {
  it("reads the data source and the field rows under the Label header", () => {
    const d = parseDictionaryTab("Tab", [
      ["Data Source: CDC Places"],
      ["Label", "Description", "Source", "Calculation (if applicable)"],
      ["GEOID", "Census Tract identifier"],
      ["per_obesity", "Estimate", "CDC PLACES", "x / y"],
      [""],
    ]);
    expect(d).toEqual({
      tab: "Tab",
      dataSource: "CDC Places",
      fields: [
        { label: "GEOID", description: "Census Tract identifier", source: "", calculation: "" },
        { label: "per_obesity", description: "Estimate", source: "CDC PLACES", calculation: "x / y" },
      ],
    });
  });
  it("returns null when there is no Label header", () => {
    expect(parseDictionaryTab("Tab", [["Data Source: X"], ["GEOID", "id"]])).toBeNull();
  });
});

describe("readInventory on the real workbook", () => {
  const inv = readInventory(inventoryBytes());
  const families = fixtureFamilies();

  it("reads 29 dictionaries holding 360 fields", () => {
    expect(inv.dictionaries).toHaveLength(29);
    expect(inv.dictionaries.reduce((n, d) => n + d.fields.length, 0)).toBe(360);
    expect(inv.dictionaries.every((d) => d.dataSource.length > 0)).toBe(true);
  });

  it("reads the 60 Home-tab links", () => {
    expect(inv.links).toHaveLength(60);
  });

  it("finds the two tabs no Home row links to", () => {
    expect(unlinkedTabs(inv.tabs, inv.links)).toEqual(["Milwaukee County Food Insecurit", "Milwaukee County Racial Demogra"]);
  });

  it("maps every Home link to a Hub family", () => {
    const { byFamily, unmatchedHomeTitles } = mapDictionaries(families, inv.links, []);
    expect(unmatchedHomeTitles).toEqual([]);
    expect(byFamily["dataset:obesity-prevalence"]).toBe("Milwaukee County Obesity Preval");
    expect(byFamily["dataset:racial-demographics"]).toBe("Milwaukee County Racial and Eth");
  });

  it("lets a dictionary override win", () => {
    const { byFamily } = mapDictionaries(families, inv.links, [
      { familyKey: "dataset:racial-demographics", tab: "Milwaukee County Racial Demogra" },
    ]);
    expect(byFamily["dataset:racial-demographics"]).toBe("Milwaukee County Racial Demogra");
  });
});

describe("isSuspectLink", () => {
  it("flags a Home row whose tab is named for a different measure", () => {
    expect(isSuspectLink({ title: "2022 Milwaukee County Racial Demographics", tab: "Milwaukee County Racial and Eth" })).toBe(true);
  });
  it("accepts a truncated tab name for the same measure", () => {
    expect(isSuspectLink({ title: "2022 Milwaukee County Disability Status by Type", tab: "Milwaukee County Disability by " })).toBe(false);
    expect(isSuspectLink({ title: "2022 Milwaukee County Obesity Prevalence", tab: "Milwaukee County Obesity Preval" })).toBe(false);
  });
});
