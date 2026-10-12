import { describe, expect, it } from "vitest";
import { checkAddress, geocodeUrl, parseGeocode, withCity } from "../../convex/lib/geocode";

const reply = (matches: unknown[]) => ({ result: { input: {}, addressMatches: matches } });
const match = (matchedAddress: string, x: number, y: number, geoid?: string) => ({ matchedAddress, coordinates: { x, y }, geographies: geoid ? { "Census Tracts": [{ GEOID: geoid }] } : {} });

describe("the address the person typed", () => {
  it("trims it, and refuses one too short or too long", () => {
    expect(checkAddress("  2400  W Center St ")).toBe("2400 W Center St");
    expect(checkAddress("ab")).toBeNull();
    expect(checkAddress("x".repeat(201))).toBeNull();
  });
  it("adds Milwaukee when no city, state or ZIP is given", () => {
    expect(withCity("2400 W Center St")).toBe("2400 W Center St, Milwaukee, WI");
    expect(withCity("2400 W Center St, Milwaukee")).toBe("2400 W Center St, Milwaukee");
    expect(withCity("2400 W Center St 53206")).toBe("2400 W Center St 53206");
    expect(withCity("N 2nd St and W Center St, WI")).toBe("N 2nd St and W Center St, WI");
  });
});

describe("the Census geocoder", () => {
  it("asks for the location and its 2020 tract in one request", () => {
    expect(geocodeUrl("2400 W Center St, Milwaukee, WI")).toBe("https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress?address=2400%20W%20Center%20St%2C%20Milwaukee%2C%20WI&benchmark=Public_AR_Current&vintage=Current_Current&layers=Census%20Tracts&format=json");
  });
  it("reads a match (street or intersection), no match, and refuses a malformed reply", () => {
    expect(parseGeocode(reply([match("2400 W CENTER ST, MILWAUKEE, WI, 53206", -87.9425, 43.0679, "55079008800")]))).toEqual({ matched: "2400 W CENTER ST, MILWAUKEE, WI, 53206", lat: 43.0679, lon: -87.9425, geoid: "55079008800" });
    expect(parseGeocode(reply([match("N 2ND ST & W CENTER ST, MILWAUKEE, WI, 53212", -87.91, 43.07, "55079185700")]))!.geoid).toBe("55079185700");
    expect(parseGeocode(reply([match("SOMEWHERE", -87.9, 43.0)]))!.geoid).toBeNull();
    expect(parseGeocode(reply([]))).toBeNull();
    expect(() => parseGeocode({ error: "x" })).toThrow();
  });
});
