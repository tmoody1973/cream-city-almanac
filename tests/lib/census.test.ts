import { describe, expect, it } from "vitest";
import { censusUrl, parseCensus, requestsFor, scrubKey, zctaGeo } from "../../convex/lib/census";

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

describe("ZIP areas (Z1)", () => {
  it("asks for one ZIP area instead of the City", () => {
    expect(censusUrl(2024, "", ["B03002_001"], "k", zctaGeo("53228"))).toBe("https://api.census.gov/data/2024/acs/acs5?get=B03002_001E,B03002_001M&for=zip%20code%20tabulation%20area:53228&key=k");
  });
  it("keeps the City URL unchanged without a geography", () => {
    expect(censusUrl(2024, "", ["B03002_001"], "k")).toBe("https://api.census.gov/data/2024/acs/acs5?get=B03002_001E,B03002_001M&for=place:53000&in=state:55&key=k");
  });
  it("adds the race codes to the detailed-table request, so the city refresh stores them", () => {
    expect(requestsFor().find((x) => x.kind === "")!.codes).toEqual(expect.arrayContaining(["B03002_001", "B03002_012", "B03002_008"]));
    expect(requestsFor()).toHaveLength(3);
  });
  it("scrubs the key from error text", () => {
    expect(scrubKey("fetch failed: https://api.census.gov/data?get=x&key=SECRET123&y=1")).toBe("fetch failed: https://api.census.gov/data?get=x&key=\u2026&y=1");
    expect(scrubKey("no key here")).toBe("no key here");
  });
});
