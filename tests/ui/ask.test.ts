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
