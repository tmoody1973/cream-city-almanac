import { describe, expect, it } from "vitest";
import { parseDataPage, parseTopicsPage, pickFigures } from "../../convex/lib/healthCompass";
import { matchTopic, mismatchZips, rangeOf, rankZips, togetherZips, tooUncertain, versus, type Fig } from "../../convex/lib/healthMath";
import { HC_ROWS, HC_TOPICS_PAGE } from "../fixtures/healthCompass";

const topics = parseTopicsPage(HC_TOPICS_PAGE).topics;
const fig = (geo: string, key: string): Fig | null => pickFigures(parseDataPage({ results: HC_ROWS.filter((r) => r.g === geo) })).find((f) => f.topic === key) ?? null;
const zips = [...new Set(HC_ROWS.filter((r) => r.l === "zip").map((r) => r.g))].sort();
const pairs = zips.flatMap((zip) => { const a = fig(zip, "MQ35"); const b = fig(zip, "POV"); return a && b ? [{ zip, a, b }] : []; });

describe("ranges and verdicts", () => {
  it("is ± 1.96 standard errors, or none without one (review focus 3)", () => {
    expect(rangeOf({ value: 10, se: 1 })).toEqual({ lo: 8.04, hi: 11.96 });
    expect(rangeOf({ value: 10, se: null })).toBeNull();
  });
  it("is too uncertain past a standard error of 40% of the value", () => {
    expect(tooUncertain({ value: 10, se: 4 })).toBe(false);
    expect(tooUncertain({ value: 10, se: 4.1 })).toBe(true);
    expect(tooUncertain({ value: 10, se: null })).toBe(false);
  });
  it("compares a ZIP with the county by its whole range", () => {
    const county = { value: 13.85, se: 0.47 };
    expect(versus({ value: 5, se: 1 }, county)).toBe("lower");
    expect(versus({ value: 25, se: 2 }, county)).toBe("higher");
    expect(versus({ value: 9.71, se: 2.24 }, county)).toBe("same");
    expect(versus({ value: 5, se: null }, county)).toBe("no-range");
    expect(versus({ value: 5, se: 3 }, county)).toBe("uncertain");
  });
});

describe("ZIPs on real Health Compass figures", () => {
  it("finds no clear 'low food insecurity despite high poverty' ZIP, and 53208 as the only possible one", () => {
    const county = fig("55079", "MQ35")!;
    const r = mismatchZips(pairs, "low", "high", county.value);
    expect(pairs).toHaveLength(35);
    expect(r.uncertain).toEqual(["53203"]);
    expect(r.n).toBe(34);
    expect(r.fits).toEqual([]);
    expect(r.close.map((p) => p.zip)).toEqual(["53208"]);
    expect(r.cut).toBeCloseTo(21.63, 1);
  });
  it("never calls a ZIP with no range clear", () => {
    const r = mismatchZips([{ zip: "1", a: { value: 1, se: null }, b: { value: 99, se: null } }, ...pairs], "low", "high", 13.85);
    expect(r.fits.map((p) => p.zip)).not.toContain("1");
  });
  it("ranks ZIPs, setting the too-uncertain aside", () => {
    const lines = pairs.map(({ zip, a }) => ({ zip, a }));
    const { rows, uncertain } = rankZips(lines, "high");
    expect(rows.slice(0, 3).map((l) => l.zip)).toEqual(["53205", "53218", "53235"]);
    expect(uncertain.map((l) => l.zip)).toEqual(["53203"]);
  });
  it("says whether two measures go together across ZIPs", () => {
    const t = togetherZips(pairs);
    expect(t.n).toBe(34);
    expect(t.direction).toBe("higher");
    expect(["moderate", "strong"]).toContain(t.strength);
  });
});

describe("topic matching", () => {
  it("matches plain words to one topic when one clearly fits", () => {
    expect(matchTopic("poverty", topics)).toMatchObject({ status: "ok", topic: { key: "POV" } });
    expect(matchTopic("asthma emergency visits", topics)).toMatchObject({ status: "ok", topic: { key: "WIHRA" } });
  });
  it("offers choices when several fit, survey first among equals", () => {
    const m = matchTopic("food insecurity", topics);
    expect(m.status).toBe("choose");
    expect(m.status === "choose" && m.choices.map((c) => c.key).slice(0, 2).sort()).toEqual(["FAI", "MQ35"]);
  });
  it("takes an exact name or key on the first try (review focus 5)", () => {
    expect(matchTopic("Food Insecurity (2024 Food Insecurity)", topics)).toMatchObject({ status: "ok", topic: { key: "MQ35" } });
    expect(matchTopic("mq35", topics)).toMatchObject({ status: "ok", topic: { key: "MQ35" } });
  });
  it("finds nothing for words no topic uses", () => {
    expect(matchTopic("zebra stripes", topics)).toEqual({ status: "not-found" });
    expect(matchTopic("the rate", topics)).toEqual({ status: "not-found" });
  });
});
