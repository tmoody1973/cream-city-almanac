import { describe, expect, it } from "vitest";
import { proseSegments } from "../../ui/lib/askProse";
import { askTools, type AskBackend } from "../../lib/ask/tools";
import { useFakeModel } from "../../lib/ask/model";

const flagged = (t: string) => proseSegments(t).filter((s) => s.unverified).map((s) => s.text);

describe("proseSegments", () => {
  it("flags figures in the model's words", () => {
    expect(flagged("About 6,520 people, or 18% of residents.")).toEqual(["6,520", "18%"]);
    expect(flagged("A rate of 12.5 per 1000.")).toEqual(["12.5", "1000"]);
  });
  it("allows years and dataset codes", () => {
    expect(flagged("Harambee's 2024 table in N03, and W01 for 2021.")).toEqual([]);
  });
  it("flags years outside 1900–2099 and numbers glued to codes", () => {
    expect(flagged("In 1850 there were 3 mills.")).toEqual(["1850", "3"]);
  });
  it("reads a year followed by a comma as a year", () => {
    expect(flagged("It covers 2023, 2024 and 2025.")).toEqual([]);
    expect(flagged("About 6,520 people.")).toEqual(["6,520"]);
  });
  it("allows numbers inside a quoted row label, not a quoted figure", () => {
    expect(flagged('Harambee\'s "Under 5 years" row is below.')).toEqual([]);
    expect(flagged("The \u201cIncome in the past 12 months\u201d row.")).toEqual([]);
    expect(flagged('The estimate is "608".')).toEqual(["608"]);
  });
  it("treats digits glued to letters as identifiers, not figures", () => {
    expect(flagged("Census tables B17001, S1501 and DP04 cover it, with PM2.5 readings.")).toEqual([]);
    expect(flagged("Adults over 18.")).toEqual(["18"]);
  });
  it("allows definitions: age bands, survey periods and table numbers", () => {
    expect(flagged("Adults 18 and older, ages 20 to 64, people aged 65 and over.")).toEqual([]);
    expect(flagged("Ages 20\u201364 and ages 5-17.")).toEqual([]);
    expect(flagged("American Community Survey 5-year estimates, a 12-month window.")).toEqual([]);
    expect(flagged("See Table 11 and table 3.")).toEqual([]);
  });
  it("still flags figures that sit near those words", () => {
    expect(flagged("18% of adults and 6,520 people aged 20 to 64.")).toEqual(["18%", "6,520"]);
    expect(flagged("608 children under 5 years.")).toEqual(["608", "5"]);
  });
  it("keeps the text intact", () => {
    const t = "Between 2021 and 2023 it rose by 4 points.";
    expect(proseSegments(t).map((s) => s.text).join("")).toBe(t);
  });
});

const backend: AskBackend = {
  search: async () => ({ mode: "search", degraded: false, results: Array.from({ length: 8 }, (_, i) => ({ key: `k${i}`, code: `W0${i}`, name: `Set ${i}`, kind: "dataset", topic: "Health", places: ["City"], years: [2023], latestModified: "", snippet: null })) }) as never,
  sheet: async (code) =>
    code === "V02"
      ? ({ family: { code: "V02", name: "Daily Air Quality", places: ["City"], years: [2023] }, members: [{ place: "City", yearLabel: "2023", featureServerUrl: "https://feed" }, { place: "City", yearLabel: "2022", featureServerUrl: null }], card: { explainer: "e", caveats: ["c"], glossary: [{ field: "Day" }, { field: "AvgAQI" }] } } as never)
      : null,
  number: async () => ({ status: "no-topic", topics: ["Rent Paid"] }) as never,
  report: async () => ({ status: "ok", passages: [] }),
};
const tool = (name: string) => askTools(backend).find((t) => t.name === name)!;

describe("Ask tools", () => {
  it("returns at most five search rows, IDs and names only", async () => {
    const r = (await tool("searchCatalog").execute({ query: "asthma" })) as { rows: unknown[] };
    expect(r.rows).toHaveLength(5);
    expect(r.rows[0]).toEqual({ code: "W00", name: "Set 0", places: ["City"], years: [2023] });
  });
  it("gives the model a dataset's caveats and its sheet's story angles to ground new angles", async () => {
    const angles = { ...backend, sheet: async () => ({ family: { code: "H05", name: "Housing Built Before 1950", places: ["County"], years: [2024] }, members: [], card: { explainer: "e", caveats: ["County only."], storyAngles: ["Which tracts have the oldest housing?"], glossary: [] } }) as never };
    const r = await askTools(angles).find((t) => t.name === "showDataset")!.execute({ code: "h05" });
    expect(r).toMatchObject({ status: "ok", code: "H05", caveats: ["County only."], storyAngles: ["Which tracts have the oldest housing?"] });
  });
  it("says when a dataset code is unknown", async () => {
    expect(await tool("showDataset").execute({ code: "zz9" })).toEqual({ status: "not-found", code: "ZZ9" });
  });
  it("hands the preview card only live feeds and the glossary's columns", async () => {
    expect(await tool("previewData").execute({ code: "V02" })).toEqual({ status: "ok", code: "V02", name: "Daily Air Quality", members: [{ place: "City", yearLabel: "2023", featureServerUrl: "https://feed" }], fields: ["Day", "AvgAQI"] });
  });
  it("passes number and report lookups straight through", async () => {
    expect(await tool("getNumber").execute({ neighborhood: "Harambee", topic: "x", row: "Total" })).toEqual({ status: "no-topic", topics: ["Rent Paid"] });
  });
});

describe("fake model switch", () => {
  const req = (h: Record<string, string>) => new Request("https://x.test/api/copilotkit", { headers: h });
  it("uses the fake model only when asked and not in production", () => {
    expect(useFakeModel(req({ "x-ask-fake": "1" }), { VERCEL_ENV: "preview" })).toBe(true);
    expect(useFakeModel(req({}), { VERCEL_ENV: "preview" })).toBe(false);
  });
  it("ignores the fake header in production", () => {
    expect(useFakeModel(req({ "x-ask-fake": "1" }), { VERCEL_ENV: "production" })).toBe(false);
  });
});
