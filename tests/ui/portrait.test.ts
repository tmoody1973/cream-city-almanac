import { describe, expect, it } from "vitest";
import { censusTableUrl, formatPortraitNumber, portraitFocusQuery, resolvePortraitFocus } from "../../ui/lib/portrait";

const index = {
  neighborhoods: [
    { key: "walkers-point", label: "Walker's Point", files: [{ hubId: "wp23", year: 2023 }, { hubId: "wp22", year: 2022 }] },
    { key: "amani", label: "Amani", files: [{ hubId: "am24", year: 2024 }] },
  ],
  initial: { hubId: "am24", tables: [] },
};
const TOPICS = ["race-and-ethnicity", "sex-and-age"];

describe("formatPortraitNumber", () => {
  it("rounds estimates and margins to whole numbers with commas", () => {
    expect(formatPortraitNumber("28133")).toBe("28,133");
    expect(formatPortraitNumber("1694.69348260976")).toBe("1,695");
  });
  it("keeps rates readable and text exactly as written", () => {
    expect(formatPortraitNumber("0.745902875254698")).toBe("0.746");
    expect(formatPortraitNumber("6.0%")).toBe("6.0%");
    expect(formatPortraitNumber("N/A")).toBe("N/A");
    expect(formatPortraitNumber("#NUM!")).toBe("#NUM!");
  });
});

describe("resolvePortraitFocus", () => {
  it("reads place, year and topic from the address", () => {
    expect(resolvePortraitFocus(index, new URLSearchParams("place=walkers-point&year=2022&topic=sex-and-age"), TOPICS)).toEqual({
      place: "walkers-point",
      hubId: "wp22",
      topic: "sex-and-age",
    });
  });
  it("falls back to the newest file and its first topic", () => {
    expect(resolvePortraitFocus(index, new URLSearchParams("place=nowhere&year=1999&topic=zzz"), TOPICS)).toEqual({
      place: "amani",
      hubId: "am24",
      topic: "race-and-ethnicity",
    });
    expect(resolvePortraitFocus(index, new URLSearchParams("place=walkers-point&year=1999"), TOPICS).hubId).toBe("wp23");
  });
});

describe("links", () => {
  it("builds a focus query and a Census table link", () => {
    expect(portraitFocusQuery({ place: "walkers-point", year: 2023, topic: "rent-paid" })).toBe("?place=walkers-point&year=2023&topic=rent-paid");
    expect(portraitFocusQuery(null)).toBe("");
    expect(censusTableUrl("B25063")).toBe("https://data.census.gov/table?q=B25063");
  });
});
