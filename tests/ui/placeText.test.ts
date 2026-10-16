import { describe, expect, it } from "vitest";
import { asOfDate, askAboutArea, boundariesShown, BOUNDARIES_NOT_COVERED, BOUNDARIES_NOT_LOADED, notInCityText, PLACE_PRIVACY, pollingNote, PLACE_PRIVACY_ASK, placeFollowUps, placeRefusal, sheetFor } from "../../ui/lib/placeText";

const ok = { status: "ok" as const, matched: "2400 W CENTER ST, MILWAUKEE, WI, 53206", tract: { geoid: "55079008800", number: "88" }, neighborhood: "Harambee", inCity: true, dycu: [{ name: "Harambee", slug: "harambee" }], boundaries: { asOf: null, district: null, ward: null, investment: [], development: [] } };

describe("the place card's words", () => {
  it("says where the address went, and refuses plainly", () => {
    expect(PLACE_PRIVACY).toBe("This address was sent to the U.S. Census Bureau's geocoder to find its location; Cream City Almanac doesn't keep it.");
    expect(placeRefusal("no-match")).toBe("The Census Bureau couldn't find that address. Try the house number, street name and ZIP code.");
    expect(placeRefusal("unavailable")).toBe("The address service didn't respond. Try again shortly.");
    expect(placeRefusal("outside-county")).toBe("That address is outside Milwaukee County.");
    expect(placeRefusal("bad-address")).toBe("Type a street address or an intersection, like 2400 W Center St.");
  });
  it("offers the tract's ranking and the neighborhood's counts and tracts, never anything about the property", () => {
    // No "rank tract 88" button: no tool places one tract; the neighborhood's tracts list each with its citywide rank.
    expect(placeFollowUps(ok).map((f) => f.question)).toEqual([
      "How many robberies were there in Harambee this year?",
      "What's the poverty rate in Harambee's tracts?",
    ]);
    expect(placeFollowUps({ ...ok, neighborhood: null, inCity: false })).toEqual([]);
  });
  it("opens the DYCU area named like the City neighborhood when a tract is in two areas", () => {
    // 2400 W Center St: City neighborhood Amani; tract 88 is in DYCU's Metcalfe Park and Amani (checked on dev, 2026-10-12).
    const two = { ...ok, neighborhood: "Amani", dycu: [{ name: "Metcalfe Park", slug: "metcalfe-park" }, { name: "Amani", slug: "amani" }] };
    expect(sheetFor(two)).toBe("amani");
    expect(sheetFor({ ...two, neighborhood: "Franklin Heights" })).toBe("metcalfe-park");
    expect(sheetFor({ ...two, dycu: [] })).toBeNull();
  });
});

describe("honest wording", () => {
  it("never claims a point outside every neighborhood shape is outside the City", () => {
    expect(notInCityText("1501")).toBe("Not inside one of the City of Milwaukee's neighborhood boundaries (census tract 1501).");
  });
  it("says in Ask that the address also goes to the AI, like every question", () => {
    expect(PLACE_PRIVACY_ASK).toBe("This address was sent to the U.S. Census Bureau's geocoder to find its location, and, like every question here, to the AI; Cream City Almanac doesn't keep it.");
    expect(PLACE_PRIVACY).not.toContain("AI");
  });
});

describe("boundary wording", () => {
  it("dates the polling place list and sends people to the state to confirm", () => {
    const oct12 = Date.UTC(2026, 9, 12, 15);
    expect(asOfDate(oct12)).toBe("Oct 12, 2026");
    expect(pollingNote(oct12)).toBe("From the City's polling place list as of Oct 12, 2026. Polling places can change before an election; confirm yours at myvote.wi.gov.");
  });
  it("says plainly when the files aren't loaded or don't cover the address", () => {
    expect(BOUNDARIES_NOT_LOADED).toBe("The City's boundary files haven't been loaded yet.");
    expect(BOUNDARIES_NOT_COVERED).toBe("The City's boundaries (districts, wards, investment and development areas) don't cover this address.");
  });
  it("offers the district's wards as a follow-up", () => {
    const b = { asOf: 1, district: { name: "District 6", alder: "Jane Doe" }, ward: null, investment: [], development: [] };
    expect(placeFollowUps({ ...ok, boundaries: b }).map((f) => f.question)).toContain("Which wards are in District 6, and where do they vote?");
  });
});

describe("an address between neighborhood shapes (review fix)", () => {
  const ward = { name: "Ward 156", pollingPlace: "School", pollingAddress: "1 Main St", mainEntrance: "", accessibleEntrance: "", mainParking: "", accessibleParking: "" };
  const gap = { ...ok, neighborhood: null, inCity: false, boundaries: { asOf: 1, district: { name: "District 3", alder: "A" }, ward, investment: [], development: [] } };
  it("still shows the ward and district the point is in", () => {
    expect(boundariesShown(gap)).toBe("lines");
    expect(boundariesShown({ ...gap, boundaries: { ...gap.boundaries, district: null, ward: null } })).toBe("not-covered");
    expect(boundariesShown({ ...ok, boundaries: { asOf: null, district: null, ward: null, investment: [], development: [] } })).toBe("not-loaded");
    expect(placeFollowUps(gap).map((f) => f.question)).toContain("Which wards are in District 3, and where do they vote?");
  });
});

describe("a City neighborhood DYCU doesn't profile", () => {
  it("opens the neighborhood's sheet built from tracts, and still offers a City-records count in Ask", () => {
    const a = askAboutArea("Bay View");
    expect(a.text).toBe("That address is in the City's Bay View neighborhood.");
    expect(a.sheet).toEqual({ href: "/n/bay-view", label: "Open Bay View's fact sheet →" });
    expect(a.question).toBe("How many robberies in Bay View this year?");
    expect(a.href).toBe(`/ask?prompt=${encodeURIComponent("How many robberies in Bay View this year?")}`);
    expect(askAboutArea("The Valley/Pigsville").sheet.href).toBe("/n/the-valley-pigsville");
  });
});
