import { describe, expect, it } from "vitest";
import { parseCkan } from "../../convex/lib/ckan";
import { cityRepresentative, cityTopic, groupCityItems } from "../../convex/lib/cityFamilies";
import { codeLetter } from "../../convex/lib/codes";
import { cityPackages } from "../helpers/cityFixtures";

const NOW = new Date("2026-10-09T12:00:00Z");
describe("City families", () => {
  const fams = groupCityItems(parseCkan(cityPackages() as never), NOW);
  it("joins Current and Historical into one live family", () => {
    const crime = fams.find((f) => f.key === "city:nibrs-crime-data")!;
    expect(crime).toMatchObject({ name: "NIBRS Crime Data", source: "city", live: true, topic: "Public Safety", kind: "dataset", places: ["City"] });
    expect(crime.members.map((m) => m.hubId).sort()).toEqual(["city:a1", "city:a2"]);
  });
  it("dates a live family by its newest creation, not its daily refresh", () => {
    expect(fams.find((f) => f.key === "city:nibrs-crime-data")!.latestModified).toBe("2023-01-05T00:00:00.000000");
  });
  it("groups election files by election date", () => {
    const e = fams.find((f) => f.key === "city:election-2016-11-08")!;
    expect(e).toMatchObject({ name: "Election results, Nov 8, 2016", topic: "Elections", years: [2016], live: false, latestModified: "2019-03-01T00:00:00.000000" });
  });
  it("maps City groups to topics and letters", () => {
    expect([cityTopic(["Public Safety"]), cityTopic(["Elections & Campaign"]), cityTopic(["City Services"]), cityTopic(["Maps"]), cityTopic(["Housing & Property "])]).toEqual(["Public Safety", "Elections", "City Services", "Maps", "Housing"]);
    expect(["Public Safety", "Elections", "City Services", "Maps", "Housing"].map((t) => codeLetter("dataset", t))).toEqual(["P", "B", "C", "G", "H"]);
  });
  it("unknown group gets Other (letter X), still a family", () => {
    expect(cityTopic(["Something New"])).toBe("Other");
    expect(codeLetter("dataset", "Other")).toBe("X");
  });
  it("counts read the (Current) resource when Current and Historical tie on modified", () => {
    const crime = fams.find((f) => f.key === "city:nibrs-crime-data")!;
    // Historical is listed first and is newest-by-created-order-agnostic: the title must decide.
    expect(cityRepresentative([...crime.members].reverse())?.title).toBe("NIBRS Crime Data (Current)");
    expect(cityRepresentative(crime.members)?.title).toBe("NIBRS Crime Data (Current)");
  });
  it("without a Current title, the newest modified queryable member wins; non-queryable are ignored", () => {
    const m = (hubId: string, modified: string, datastoreId: string | null) => ({ hubId, title: hubId, modified, datastoreId });
    expect(cityRepresentative([m("old", "2020", "r1"), m("new", "2024", "r2"), m("newest-no-feed", "2025", null)])?.hubId).toBe("new");
    expect(cityRepresentative([m("a", "2024", null)])).toBeUndefined();
  });
  it("an ungrouped package is sorted by its publisher, then its title, then its file types", () => {
    const t = (title: string, organization?: string, formats: string[] = ["CSV"]) => cityTopic([], { organization, title, formats });
    expect(t("Firehouse Locations", "Milwaukee Fire Department ", ["SHP", "ESRI REST"])).toBe("Public Safety");
    expect(t("Library Service Areas", "Milwaukee Public Library", ["ESRI REST", "SHP"])).toBe("City Services");
    expect(t("Election results, Nov 6, 2016", "Election Commission")).toBe("Elections");
    expect(t("Ward 12 turnout", "Information Technology and Management Division")).toBe("Elections");
    expect(t("Land Use Code", "Information Technology and Management Division")).toBe("Housing");
    expect(t("Building Permits", undefined)).toBe("Housing");
    expect(t("Traffic Crash Locations", "Department of Public Works")).toBe("City Services");
    expect(t("Crash Data", "Information Technology and Management Division")).toBe("Public Safety");
    expect(t("MMSD Geography", "External Organizations ", ["Esri REST", "Esri REST"].map((f) => f.toUpperCase()))).toBe("Maps");
    expect(t("Aldermanic Districts", "Common Council" )).toBe("City Services");
    expect(t("Aldermanic Districts", "Something Else")).toBe("Maps");
    expect(t("Things", "Something Else")).toBe("Other");
  });
  it("groups still win over the publisher", () => {
    expect(cityTopic(["Housing & Property"], { organization: "Milwaukee Fire Department", title: "Firehouse Locations" })).toBe("Housing");
  });
  it("parseCkan carries the organization title, trimmed", () => {
    const items = parseCkan(cityPackages() as never);
    expect(items[0].organization).toBe("Milwaukee Police Department");
  });
});
