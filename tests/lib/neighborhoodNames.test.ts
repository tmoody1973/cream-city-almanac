// tests/lib/neighborhoodNames.test.ts
import { describe, expect, it } from "vitest";
import { areaInText, matchName, nameKey, titleCase } from "../../convex/lib/neighborhoodNames";

const rows = ["HARAMBEE", "BAY VIEW", "SOUTH BAY VIEW", "WALKER'S POINT", "ST. JOSEPH", "RIVERWEST"].map((n) => ({ name: titleCase(n), matchKey: nameKey(n) }));

describe("neighborhood names", () => {
  it("normalizes case, 'St.', apostrophes, '&' and a trailing 'neighborhood'", () => {
    expect(nameKey("Walker's Point neighborhood")).toBe("walkers point");
    expect(nameKey("St. Joseph")).toBe(nameKey("Saint Joseph"));
    expect(nameKey("Arts & Crafts")).toBe("arts and crafts");
    expect(titleCase("WALKER'S POINT")).toBe("Walker's Point");
  });
  it("matches one name exactly", () => {
    expect(matchName("harambee", rows)).toMatchObject({ kind: "one", row: { name: "Harambee" } });
    expect(matchName("Walkers Point neighborhood", rows)).toMatchObject({ kind: "one", row: { name: "Walker's Point" } });
    expect(matchName("Saint Joseph", rows)).toMatchObject({ kind: "one", row: { name: "St. Joseph" } });
  });
  it("asks which one when the name is close to several, or misspelled", () => {
    expect(matchName("Bay", rows)).toEqual({ kind: "choose", names: ["Bay View", "South Bay View"] });
    expect(matchName("Harambe", rows)).toEqual({ kind: "choose", names: ["Harambee"] });
  });
  it("never matches a made-up name, and offers the nearest three", () => {
    const r = matchName("Gotham Heights", rows);
    expect(r.kind).toBe("none");
    if (r.kind === "none") expect(r.nearest).toHaveLength(3);
    expect(matchName("   ", rows).kind).toBe("none");
  });
});

describe("title case after a slash (follow-up)", () => {
  it("capitalizes each part of a slashed City name", () => {
    expect(titleCase("THE VALLEY/PIGSVILLE")).toBe("The Valley/Pigsville");
  });
});

describe("areaInText", () => {
  const areas = [
    { name: "Riverwest", slug: "riverwest", spellings: ["Riverwest"] },
    { name: "Historic Mitchell St.", slug: "historic-mitchell-st", spellings: ["Historic Mitchell St."] },
    { name: "Silver City, Layton Park, and Burnham Park", slug: "silver-city-layton-park-and-burnham-park", spellings: ["Silver City, Layton Park, and Burnham Park", "Silver City, Burnham Park, and Layton Park"] },
    { name: "Near South Side", slug: "near-south-side", spellings: ["Near South Side"] },
  ];
  it("finds an area named alone or inside other search words", () => {
    expect(areaInText("Riverwest", areas)?.slug).toBe("riverwest");
    expect(areaInText("riverwest crime", areas)?.slug).toBe("riverwest");
    expect(areaInText("poverty in historic mitchell st", areas)?.slug).toBe("historic-mitchell-st");
    expect(areaInText("silver city, burnham park, and layton park", areas)?.slug).toBe("silver-city-layton-park-and-burnham-park");
  });
  it("matches whole words only and ignores searches without an area", () => {
    expect(areaInText("crime", areas)).toBeNull();
    expect(areaInText("riverwestern", areas)).toBeNull();
    expect(areaInText("south side", areas)).toBeNull();
    expect(areaInText("", areas)).toBeNull();
  });
});
