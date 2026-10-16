import { describe, expect, it } from "vitest";
import { buildCityFigures } from "../../convex/lib/cityFactSheet";
import { shareOf } from "../../convex/lib/factMath";

const tract = (part: [number, number], of: [number, number]) => ({ B17001_002: { estimate: part[0], moe: part[1] }, B17001_001: { estimate: of[0], moe: of[1] } });
const A = "55079000100";
const B = "55079000200";
const values = new Map([[A, tract([400, 60], [2000, 100])], [B, tract([300, 80], [1000, 90])]]);
const pops = new Map([[A, 2000], [B, 1000]]);
const city = { B17001_002: { estimate: 125891, moe: 4212 }, B17001_001: { estimate: 552601, moe: 503 } };
const poverty = (r: ReturnType<typeof buildCityFigures>) => (r.status === "ok" ? r.headlines.find((h) => h.id === "poverty")! : null);

describe("a neighborhood built from census tracts", () => {
  it("inside one tract (share 100) is that tract", () => {
    const r = buildCityFigures([{ geoid: A, share: 100 }], values, pops, city);
    expect(r).toMatchObject({ status: "ok", people: 2000 });
    const h = poverty(r)!;
    expect(h.hood!.count).toEqual({ estimate: 400, moe: 60 });
    expect(h.hood!.rate).toEqual(shareOf({ estimate: 400, moe: 60 }, { estimate: 2000, moe: 100 }));
  });
  it("across two tracts adds each tract's share of counts and combines margins (hand-checked)", () => {
    const r = buildCityFigures([{ geoid: A, share: 60 }, { geoid: B, share: 25 }], values, pops, city);
    expect(r.status === "ok" && r.people).toBe(1450);
    const h = poverty(r)!;
    expect(h.hood!.count.estimate).toBeCloseTo(315, 6);
    expect(h.hood!.count.moe!).toBeCloseTo(41.183, 3);
    expect(h.hood!.of!.estimate).toBeCloseTo(1450, 6);
    expect(h.hood!.of!.moe!).toBeCloseTo(64.08, 2);
    expect(h.hood!.rate!.estimate).toBeCloseTo(0.21724, 5);
    expect(h.hood!.rate!.moe!).toBeCloseTo(0.02673, 5);
    expect(h.city!.rate!.estimate).toBeCloseTo(125891 / 552601, 6);
    expect(h.verdict).toBe("same");
  });
  it("marks a figure missing when tracts with its values hold under half the residents", () => {
    const thin = new Map([[A, {}], [B, tract([300, 80], [1000, 90])]]);
    const r = buildCityFigures([{ geoid: A, share: 60 }, { geoid: B, share: 25 }], thin, pops, city);
    expect(poverty(r)!.hood).toBeNull();
  });
  it("gives people as a count with no range, and says it comes from tract counts", () => {
    const r = buildCityFigures([{ geoid: A, share: 100 }], values, pops, city);
    const people = r.status === "ok" ? r.headlines.find((h) => h.id === "population")! : null;
    expect(people).toMatchObject({ isCount: true, hood: { count: { estimate: 2000, moe: null }, rate: null }, verdict: "unknown" });
    expect(people!.meaning).toMatch(/census tract/i);
  });
  it("returns small, without figures, under 1,000 residents and for a neighborhood with no tracts", () => {
    expect(buildCityFigures([{ geoid: B, share: 50 }], values, pops, city)).toEqual({ status: "small", people: 500 });
    expect(buildCityFigures([], values, pops, city)).toEqual({ status: "small", people: 0 });
  });
});
