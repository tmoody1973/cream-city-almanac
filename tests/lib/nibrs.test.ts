import { describe, expect, it } from "vitest";
import { isOffenseColumn, offenseCodes, offenseName } from "../../convex/lib/nibrs";

describe("NIBRS offense names", () => {
  it("names codes and keeps unknown ones readable", () => {
    expect(offenseName("240")).toBe("Motor Vehicle Theft");
    expect(offenseName("23H")).toBe("All Other Larceny");
    expect(offenseName("999")).toBe("Offense code 999");
  });
  it("turns words back into codes, case-insensitive, by name or code", () => {
    expect(offenseCodes("robbery")).toEqual(["120"]);
    expect(offenseCodes("13B")).toEqual(["13B"]);
    expect(offenseCodes("theft").length).toBeGreaterThan(3);
  });
  it("knows the offense column", () => {
    expect(isOffenseColumn("Offense_All")).toBe(true);
    expect(isOffenseColumn("Police_District")).toBe(false);
  });
});
