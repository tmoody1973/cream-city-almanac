import { describe, expect, it } from "vitest";
import { censusUrl, parseCensus, requestsFor } from "../../convex/lib/census";

describe("Census requests", () => {
  it("asks for each code's estimate and margin for the City of Milwaukee", () => {
    expect(censusUrl(2024, "/profile", ["DP04_0001", "DP04_0003"], "k")).toBe("https://api.census.gov/data/2024/acs/acs5/profile?get=DP04_0001E,DP04_0001M,DP04_0003E,DP04_0003M&for=place:53000&in=state:55&key=k");
  });
  it("groups every headline's codes into one request per table kind", () => {
    const r = requestsFor();
    expect(r.map((x) => x.kind).sort()).toEqual(["", "/profile", "/subject"]);
    expect(r.find((x) => x.kind === "")!.codes).toEqual(expect.arrayContaining(["B17001_001", "B17001_002", "B19001_005", "B08201_002"]));
  });
  it("reads the reply, keeps 'no sampling error' as a zero margin and never turns a special value into a number", () => {
    const body = [["B17001_001E", "B17001_001M", "B17001_002E", "B17001_002M", "state", "place"], ["552601", "-555555555", "125891", "-222222222", "55", "53000"]];
    expect(parseCensus(body, ["B17001_001", "B17001_002"])).toEqual({ B17001_001: { estimate: 552601, moe: 0 }, B17001_002: { estimate: 125891, moe: null } });
    expect(parseCensus([["B17001_001E", "B17001_001M"], ["-666666666", "5"]], ["B17001_001"])).toEqual({});
    expect(() => parseCensus("<html>", ["B17001_001"])).toThrow();
  });
});
