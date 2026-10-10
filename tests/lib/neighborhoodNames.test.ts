// tests/lib/neighborhoodNames.test.ts
import { describe, expect, it } from "vitest";
import { matchName, nameKey, titleCase } from "../../convex/lib/neighborhoodNames";

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
