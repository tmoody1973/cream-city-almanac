import { describe, expect, it } from "vitest";
import { creditLines, HC_CREDIT, parseDataPage, parseTopicsPage, pickFigures, placeUrl, topicUrl, type RawRow } from "../../convex/lib/healthCompass";
import { HC_ROWS, HC_TOPICS_PAGE } from "../fixtures/healthCompass";

describe("reading Health Compass", () => {
  it("reads topics into what Ask stores, keeping their words and sources", () => {
    const { next, topics } = parseTopicsPage(HC_TOPICS_PAGE);
    expect(next).toBeNull();
    const mq35 = topics.find((t) => t.key === "MQ35")!;
    expect(mq35.description).toBe("In the last 12 months, did you ever eat less than you felt you should because there wasn’t enough money for food? % who answered yes");
    expect(mq35).toMatchObject({ units: "% of residents", decimals: 2, isCount: false, team: "milwaukee-health-partnership", sources: [] });
    expect(topics.find((t) => t.key === "POV")!.sources).toEqual(["U.S. Census Bureau · American Community Survey (ACS) · Table B17001"]);
  });
  it("refuses a changed shape instead of storing it (review focus 1)", () => {
    expect(() => parseTopicsPage({ results: [{ key: "X" }] })).toThrow(/topics changed shape/);
    expect(() => parseDataPage({ count: 1 })).toThrow(/figures changed shape/);
    expect(() => parseDataPage({ results: [{ g: "53208", l: "zip", a: "POV", p: "", d: "2024", v: "9.7" }] })).toThrow(/figures changed shape/);
  });
  it("keeps the whole population and one period per topic: newest end year, then the longer span", () => {
    const rows: RawRow[] = [
      { g: "53208", l: "zip", a: "POV", p: "", d: "2019-2023", v: 25, se: 2 },
      { g: "53208", l: "zip", a: "POV", p: "", d: "2020-2024", v: 21.6, se: 2.2 },
      { g: "53208", l: "zip", a: "POV", p: "B", d: "2020-2024", v: 30, se: 3 },
      { g: "53208", l: "zip", a: "X", p: "", d: "2024", v: 1, se: null },
      { g: "53208", l: "zip", a: "X", p: "", d: "2020-2024", v: 2, se: 0.5 },
      { g: "53208", l: "zip", a: "Y", p: "", d: "2024", v: null, se: null },
      { g: "53208", l: "zip", a: "Z", p: "", d: "FY24", v: 3, se: null },
    ];
    expect(pickFigures(rows)).toEqual([
      { topic: "POV", period: "2020-2024", value: 21.6, se: 2.2 },
      { topic: "X", period: "2020-2024", value: 2, se: 0.5 },
    ]);
  });
  it("takes a preferred period when the place has it (the ZIPs' own period, for the county) (review I1)", () => {
    const rows: RawRow[] = [
      { g: "55079", l: "county", a: "DIA", p: "", d: "2023", v: 10, se: 1 },
      { g: "55079", l: "county", a: "DIA", p: "", d: "2024", v: 11, se: 1 },
      { g: "55079", l: "county", a: "OBE", p: "", d: "2024", v: 30, se: 1 },
    ];
    expect(pickFigures(rows, { DIA: "2023", OBE: "2023" })).toEqual([
      { topic: "DIA", period: "2023", value: 10, se: 1 },
      { topic: "OBE", period: "2024", value: 30, se: 1 },
    ]);
  });
  it("reads the real fixture", () => {
    const figs = pickFigures(parseDataPage({ results: HC_ROWS.filter((r) => r.g === "53208") }));
    expect(figs.map((f) => f.topic)).toEqual(["MQ35", "POV"]);
    expect(figs[0]).toMatchObject({ period: "2024", value: 9.7143 });
  });
  it("credits Health Compass, the source and the period, with the topic's link", () => {
    const { topics } = parseTopicsPage(HC_TOPICS_PAGE);
    const pov = topics.find((t) => t.key === "POV")!;
    expect(creditLines(pov, "2020-2024")).toEqual([
      HC_CREDIT,
      "Source: U.S. Census Bureau · American Community Survey (ACS) · Table B17001",
      "Period: 2020-2024",
      "https://healthcompassmilwaukee.org/topics/POV",
    ]);
    expect(creditLines(topics.find((t) => t.key === "MQ35")!, "2024")).toEqual([HC_CREDIT, "Period: 2024", "https://healthcompassmilwaukee.org/topics/MQ35"]);
    expect(topicUrl("MQ35")).toBe("https://healthcompassmilwaukee.org/topics/MQ35");
    expect(placeUrl("zip", "53208")).toBe("https://healthcompassmilwaukee.org/api/v1/data/?layer=zip&geography=53208");
  });
});
