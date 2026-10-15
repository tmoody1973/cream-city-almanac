import { describe, expect, it } from "vitest";
import { parseDataPage, parseTopicsPage, pickFigures } from "../../convex/lib/healthCompass";
import { answer, type HealthData } from "../../convex/lib/healthAnswer";
import { HC_ROWS, HC_TOPICS_PAGE } from "../fixtures/healthCompass";

const geos = [...new Set(HC_ROWS.map((r) => r.g))];
const data: HealthData = {
  topics: parseTopicsPage(HC_TOPICS_PAGE).topics,
  places: geos.map((geo) => ({ layer: geo === "55079" ? "county" : "zip", geo, figures: pickFigures(parseDataPage({ results: HC_ROWS.filter((r) => r.g === geo) })) })),
  hoods: { "53208": ["Washington Park", "Sherman Park"] },
  asOf: Date.UTC(2026, 9, 12),
};

describe("ZIP health answers", () => {
  it("answers 'low food insecurity despite high poverty' with 53208 possible, named by its neighborhoods", () => {
    const r = answer({ mode: "mismatch", measure: "Food Insecurity (2024 Food Insecurity)", side: "low", other: "Poverty rate", otherSide: "high" }, data);
    expect(r).toMatchObject({ status: "ok", mode: "mismatch", measure: { key: "MQ35" }, other: { key: "POV" }, fits: [], uncertain: ["53203"] });
    if (r.status !== "ok" || r.mode !== "mismatch") throw new Error("not a mismatch answer");
    expect(r.close[0]).toMatchObject({ zip: "53208", places: ["Washington Park", "Sherman Park"], town: "Milwaukee" });
    expect(r.county!.value).toBeCloseTo(13.85, 1);
  });
  it("compares one ZIP with the county", () => {
    const r = answer({ mode: "one", measure: "Food Insecurity (2024 Food Insecurity)", zip: "53208" }, data);
    expect(r).toMatchObject({ status: "ok", mode: "one", zip: { zip: "53208", verdict: "same" }, city: null });
  });
  it("ranks ZIPs and compares each with the county", () => {
    const r = answer({ mode: "rank", measure: "Food Insecurity (2024 Food Insecurity)" }, data);
    if (r.status !== "ok" || r.mode !== "rank") throw new Error("not a ranking");
    expect(r.rows[0]).toMatchObject({ zip: "53205", verdict: "higher" });
  });
  it("asks which measure when several fit, and says so when none does", () => {
    expect(answer({ mode: "rank", measure: "food insecurity" }, data)).toMatchObject({ status: "choose", which: "measure" });
    expect(answer({ mode: "mismatch", measure: "Poverty rate", other: "zebra" }, data)).toEqual({ status: "not-found", which: "other", words: "zebra" });
  });
  it("refuses plainly: no second measure, a ZIP outside the county, a ZIP with no figure, a measure with no county figure (review focus 2)", () => {
    expect(answer({ mode: "mismatch", measure: "Poverty rate" }, data)).toMatchObject({ status: "refused" });
    expect(answer({ mode: "one", measure: "Poverty rate", zip: "60601" }, data)).toEqual({ status: "outside", zip: "60601" });
    expect(answer({ mode: "one", measure: "Poverty rate", zip: "53x" }, data)).toMatchObject({ status: "bad-zip" });
    expect(answer({ mode: "one", measure: "Food Insecurity (2024 Food Insecurity)", zip: "53126" }, data)).toMatchObject({ status: "no-data", zip: "53126" });
    const noCounty = { ...data, places: data.places.filter((p) => p.geo !== "55079") };
    expect(answer({ mode: "mismatch", measure: "Food Insecurity (2024 Food Insecurity)", other: "Poverty rate" }, noCounty)).toMatchObject({ status: "refused", reason: expect.stringMatching(/no Milwaukee County figure/) });
  });
  it("says the figures aren't loaded yet when nothing is stored", () => {
    expect(answer({ mode: "rank", measure: "Poverty rate" }, { topics: [], places: [], hoods: {}, asOf: null })).toEqual({ status: "unavailable" });
  });
});
