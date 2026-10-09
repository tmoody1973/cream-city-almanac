import { describe, expect, it } from "vitest";
import {
  aiCardSchema,
  assembleCard,
  basicCard,
  buildCardPrompt,
  cardEmbeddingText,
  cardMaxTokens,
  latestDescription,
  parseAiCard,
  type CardBase,
} from "../../convex/lib/card";

const base: CardBase = {
  familyKey: "dataset:obesity-prevalence",
  name: "Obesity Prevalence",
  hubSummary: "Share of adults with obesity by census tract.",
  columns: [
    { name: "GEOID", alias: "GEOID", type: "String" },
    { name: "per_obesity", alias: "per_obesity", type: "Double" },
    { name: "TotalPopulation", alias: "TotalPopulation", type: "Integer" },
  ],
  dictionary: {
    tab: "Milwaukee County Obesity Preval",
    dataSource: "CDC Places",
    fields: [
      { label: "GEOID", description: "Census Tract identifier", source: "", calculation: "" },
      { label: "TotalPopulation", description: "Total population", source: "ACS", calculation: "Sum of tracts" },
    ],
  },
};

const ai = {
  explainer: "Estimated share of adults with obesity in each census tract.",
  glossary: [
    { field: "GEOID", meaning: "AI's own guess" },
    { field: "per_obesity", meaning: "Estimated percent of adults with obesity." },
    { field: "made_up_column", meaning: "Should vanish." },
  ],
  caveats: ["one", "two", "three", "four", "five"].map((w) => `Caveat ${w} is long enough.`),
  storyAngles: ["Which tracts changed most?", "How does this track income?", "Where are clinics?", "Extra angle?"],
};

describe("assembleCard", () => {
  const card = assembleCard(ai, base);

  it("uses DYCU wording over the AI's for defined columns, with calculations", () => {
    expect(card.glossary).toContainEqual({ field: "GEOID", meaning: "Census Tract identifier", provenance: "DYCU" });
    expect(card.glossary).toContainEqual({
      field: "TotalPopulation",
      meaning: "Total population Calculation: Sum of tracts",
      provenance: "DYCU",
    });
  });

  it("keeps AI meanings for columns DYCU did not define, tagged AI", () => {
    expect(card.glossary).toContainEqual({
      field: "per_obesity",
      meaning: "Estimated percent of adults with obesity.",
      provenance: "AI",
    });
  });

  it("drops AI glossary entries for columns that do not exist", () => {
    expect(card.glossary.map((g) => g.field)).not.toContain("made_up_column");
  });

  it("tags the explainer AI, caps caveats at 4 and angles at 3", () => {
    expect(card.explainerProvenance).toBe("AI");
    expect(card.caveats).toHaveLength(4);
    expect(card.storyAngles).toHaveLength(3);
    expect(card.basic).toBe(false);
  });
});

describe("basicCard", () => {
  it("uses only Hub and DYCU facts", () => {
    const card = basicCard(base);
    expect(card).toMatchObject({ explainer: base.hubSummary, explainerProvenance: "HUB", caveats: [], storyAngles: [], basic: true });
    expect(card.glossary.every((g) => g.provenance === "DYCU")).toBe(true);
  });
  it("falls back to the family name when the Hub has no description", () => {
    expect(basicCard({ ...base, hubSummary: "" }).explainer).toBe("Obesity Prevalence");
  });
});

describe("aiCardSchema", () => {
  it("rejects output missing the explainer", () => {
    expect(aiCardSchema.safeParse({ glossary: [], caveats: [], storyAngles: [] }).success).toBe(false);
  });
});

describe("prompt and embedding text", () => {
  it("puts columns and DYCU definitions in the prompt", () => {
    const prompt = buildCardPrompt({
      name: "Obesity Prevalence",
      kind: "dataset",
      places: ["County"],
      years: [2022],
      descriptions: ["desc"],
      columns: base.columns,
      dycuDefinitions: base.dictionary!.fields,
      sources: [],
    });
    expect(JSON.parse(prompt)).toMatchObject({ dataset: "Obesity Prevalence", columns: [{ name: "GEOID" }, { name: "per_obesity" }, { name: "TotalPopulation" }] });
  });
  it("starts the embedding text with the family name", () => {
    const text = cardEmbeddingText({ name: "Obesity Prevalence", places: ["County"], years: [2022] }, assembleCard(ai, base));
    expect(text.startsWith("Obesity Prevalence.")).toBe(true);
    expect(text).toContain("Census Tract identifier");
  });
  it("picks the newest member's description", () => {
    expect(latestDescription([{ description: "old", modified: "2025-01-01" }, { description: "new", modified: "2026-01-01" }])).toBe("new");
  });
});

describe("cardMaxTokens", () => {
  it("grows with the number of columns and is capped", () => {
    expect(cardMaxTokens(0)).toBe(1500);
    expect(cardMaxTokens(30)).toBe(3300);
    expect(cardMaxTokens(500)).toBe(8000);
  });
});

describe("parseAiCard", () => {
  const ai = (n: number) => ({
    explainer: "This dataset lists every property in the City of Milwaukee.",
    glossary: Array.from({ length: n }, (_, i) => ({ field: `COL_${i}`, meaning: "What this column holds." })),
    caveats: ["Check the update date before citing."],
    storyAngles: ["Which blocks changed most?"],
  });
  it("keeps a 90-column glossary (the widest City tables have 92 columns)", () => {
    const r = parseAiCard(ai(90));
    expect(r.success && r.data.glossary).toHaveLength(90);
  });
  it("trims an over-long list to the cap rather than throwing the whole card away", () => {
    const r = parseAiCard({ ...ai(250), caveats: Array(12).fill("A caveat that is long enough."), storyAngles: Array(9).fill("A question to chase?") });
    expect(r.success).toBe(true);
    if (r.success) expect([r.data.glossary.length, r.data.caveats.length, r.data.storyAngles.length]).toEqual([200, 8, 6]);
  });
  it("still rejects a card that is wrong in kind, not just long", () => {
    expect(parseAiCard({ ...ai(3), explainer: "short" }).success).toBe(false);
    expect(parseAiCard("nope").success).toBe(false);
  });
});
