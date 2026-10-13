import { describe, expect, it } from "vitest";
import { boundariesFootnote, boundariesRefusal, placeHeading, shareText } from "../../ui/lib/boundaryText";

describe("boundary card wording", () => {
  it("says shares as estimates", () => {
    expect([100, 99, 37, 5, 4, 1].map(shareText)).toEqual(["all of it", "all of it", "about 37%", "about 5%", "a small part (under 5%)", "a small part (under 5%)"]);
  });
  it("names which map a neighborhood is, and dates the files", () => {
    expect(placeHeading({ type: "city", name: "Harambee" })).toBe("Harambee (City of Milwaukee boundary)");
    expect(placeHeading({ type: "dycu", name: "Harambee" })).toBe("Harambee (DYCU's area)");
    expect(placeHeading({ type: "district", name: "District 6" })).toBe("District 6");
    expect(boundariesFootnote(Date.UTC(2026, 9, 12, 15))).toBe("Shares are estimated from a grid of points, about ±2%. From the City's boundary files as of Oct 12, 2026.");
  });
  it("refuses plainly", () => {
    expect(boundariesRefusal({ status: "unknown-place", suggestions: ["Harambee", "Halyard Park"] })).toBe("I couldn't find that place. Did you mean: Harambee, Halyard Park?");
    expect(boundariesRefusal({ status: "unknown-place", suggestions: [] })).toBe("I couldn't find that place. Name one neighborhood, census tract or aldermanic district (1–15).");
    expect(boundariesRefusal({ status: "outside-city" })).toBe("The City's boundaries don't reach this tract.");
    expect(boundariesRefusal({ status: "not-loaded" })).toBe("The City's boundary files haven't been loaded yet.");
  });
});
