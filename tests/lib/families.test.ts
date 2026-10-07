import { describe, expect, it } from "vitest";
import { groupItems, isPdfFamily, reportDelays, searchTextWithCard } from "../../convex/lib/families";
import { fixtureFamilies, fixtureItems } from "../helpers/fixtures";

describe("groupItems on the real Hub catalog", () => {
  const items = fixtureItems();
  const families = fixtureFamilies();
  const get = (key: string) => families.find((f) => f.key === key)!;

  it("produces 46 families", () => {
    expect(families).toHaveLength(46);
  });

  it("places every non-page item in exactly one family", () => {
    const memberIds = families.flatMap((f) => f.members.map((m) => m.hubId));
    const expected = items.filter((i) => i.kind !== "page").map((i) => i.hubId);
    expect(memberIds).toHaveLength(379);
    expect(new Set(memberIds)).toEqual(new Set(expected));
  });

  it("merges case variants and keeps the most common name", () => {
    const poverty = get("dataset:households-living-in-poverty");
    expect(poverty.members).toHaveLength(5);
    expect(poverty.places).toEqual(["City", "County"]);
    expect(poverty.name).toBe("Households Living in Poverty");
  });

  it("merges aliased measures", () => {
    const schools = get("dataset:school-proficiency");
    expect(schools.members).toHaveLength(2);
    expect(schools.years).toEqual([2015, 2016, 2024, 2025]);
  });

  it("groups neighborhood reports by document type", () => {
    expect(get("document:neighborhood-portrait").members).toHaveLength(100);
    expect(get("document:neighborhood-change-over-time-report").members).toHaveLength(80);
    expect(get("document:neighborhood-portrait-spreadsheet").members).toHaveLength(99);
  });

  it("parses year ranges", () => {
    expect(get("dataset:daily-air-quality").years).toEqual([2023, 2024, 2025]);
    expect(get("dataset:population-change").years).toEqual([2010, 2020]);
  });

  it("assigns a topic", () => {
    expect(get("dataset:asthma-prevalence").topic).toBe("Health");
  });

  it("counts 180 report PDFs", () => {
    const pdfs = families.filter(isPdfFamily).flatMap((f) => f.members);
    expect(pdfs).toHaveLength(180);
  });

  it("applies item overrides", () => {
    const parks = items.find((i) => i.title === "2018 Milwaukee Access to Parks")!;
    const moved = groupItems(items, [{ hubId: parks.hubId, measure: "Access to Grocery Stores", place: null, years: null }]);
    expect(moved.find((f) => f.key === "dataset:access-to-grocery-stores")!.members).toHaveLength(2);
    expect(moved.find((f) => f.key === "dataset:access-to-parks")).toBeUndefined();
  });
});

describe("searchTextWithCard", () => {
  it("appends explainer and glossary and caps the length", () => {
    const text = searchTextWithCard("base", { explainer: "Explains.", glossary: [{ field: "GEOID", meaning: "Tract id", provenance: "DYCU" }] });
    expect(text).toBe("base Explains. GEOID Tract id");
    expect(searchTextWithCard("x".repeat(20000), { explainer: "", glossary: [] }).length).toBe(12000);
  });
});

describe("reportDelays", () => {
  it("spaces only reports that need reading and runs unchanged ones immediately", () => {
    const reports = [
      { hubId: "a", modified: "2026-01-01" },
      { hubId: "b", modified: "2026-02-01" },
      { hubId: "c", modified: "2026-03-01" },
      { hubId: "d", modified: "2026-04-01" },
    ];
    const indexed = new Map([
      ["a", "2026-01-01"],
      ["c", "2025-12-01"],
    ]);
    expect(reportDelays(reports, indexed, 7000)).toEqual([
      { hubId: "a", delayMs: 0 },
      { hubId: "b", delayMs: 0 },
      { hubId: "c", delayMs: 7000 },
      { hubId: "d", delayMs: 14000 },
    ]);
  });
});
