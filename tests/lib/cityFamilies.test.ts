import { describe, expect, it } from "vitest";
import { parseCkan } from "../../convex/lib/ckan";
import { cityTopic, groupCityItems } from "../../convex/lib/cityFamilies";
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
});
