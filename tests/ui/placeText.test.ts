import { describe, expect, it } from "vitest";
import { PLACE_PRIVACY, placeFollowUps, placeRefusal, sheetFor } from "../../ui/lib/placeText";

const ok = { status: "ok" as const, matched: "2400 W CENTER ST, MILWAUKEE, WI, 53206", tract: { geoid: "55079008800", number: "88" }, neighborhood: "Harambee", inCity: true, dycu: [{ name: "Harambee", slug: "harambee" }] };

describe("the place card's words", () => {
  it("says where the address went, and refuses plainly", () => {
    expect(PLACE_PRIVACY).toBe("This address was sent to the U.S. Census Bureau's geocoder to find its location; Cream City Almanac doesn't keep it.");
    expect(placeRefusal("no-match")).toBe("The Census Bureau couldn't find that address. Try the house number, street name and ZIP code.");
    expect(placeRefusal("unavailable")).toBe("The address service didn't respond. Try again shortly.");
    expect(placeRefusal("outside-county")).toBe("That address is outside Milwaukee County.");
    expect(placeRefusal("bad-address")).toBe("Type a street address or an intersection, like 2400 W Center St.");
  });
  it("offers the tract's ranking and the neighborhood's counts and tracts, never anything about the property", () => {
    expect(placeFollowUps(ok).map((f) => f.question)).toEqual([
      "How does census tract 88 rank on poverty in Milwaukee County?",
      "How many robberies were there in Harambee this year?",
      "What's the poverty rate in Harambee's tracts?",
    ]);
    expect(placeFollowUps({ ...ok, neighborhood: null, inCity: false }).map((f) => f.question)).toEqual(["How does census tract 88 rank on poverty in Milwaukee County?"]);
  });
  it("opens the DYCU area named like the City neighborhood when a tract is in two areas", () => {
    // 2400 W Center St: City neighborhood Amani; tract 88 is in DYCU's Metcalfe Park and Amani (checked on dev, 2026-10-12).
    const two = { ...ok, neighborhood: "Amani", dycu: [{ name: "Metcalfe Park", slug: "metcalfe-park" }, { name: "Amani", slug: "amani" }] };
    expect(sheetFor(two)).toBe("amani");
    expect(sheetFor({ ...two, neighborhood: "Franklin Heights" })).toBe("metcalfe-park");
    expect(sheetFor({ ...two, dycu: [] })).toBeNull();
  });
});
