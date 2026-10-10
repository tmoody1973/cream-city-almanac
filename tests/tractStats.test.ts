import { describe, expect, it } from "vitest";
import { changeOf, halfWidth, isUnreliable, mismatch, overlaps, quantile, rankValues, relationship, spearman, type TractValue } from "../convex/lib/tractStats";

const moe = (geoid: string, value: number, m: number): TractValue => ({ geoid, value, lo: value - m, hi: value + m, kind: "moe90" });
const ci = (geoid: string, value: number, lo: number, hi: number): TractValue => ({ geoid, value, lo, hi, kind: "ci95" });
const bare = (geoid: string, value: number): TractValue => ({ geoid, value, lo: null, hi: null, kind: null });

describe("ranges and reliability", () => {
  it("half-width is the moe or half the CDC interval, null without a range", () => {
    expect(halfWidth(moe("a", 40, 6))).toBe(6);
    expect(halfWidth(ci("a", 14, 11, 17))).toBe(3);
    expect(halfWidth(bare("a", 14))).toBeNull();
  });
  it("marks a Census estimate unreliable past a 40% coefficient of variation", () => {
    expect(isUnreliable(moe("a", 40, 26))).toBe(false); // (26/1.645)/40 = 0.395
    expect(isUnreliable(moe("a", 40, 27))).toBe(true); // 0.410
    expect(isUnreliable(moe("a", 0, 1))).toBe(true);
    expect(isUnreliable(moe("a", 0, 0))).toBe(false);
  });
  it("marks a CDC estimate unreliable when its half-width passes 40% of the value", () => {
    expect(isUnreliable(ci("a", 10, 6.2, 13.8))).toBe(false); // 3.8/10
    expect(isUnreliable(ci("a", 10, 5, 15))).toBe(true); // 5/10
    expect(isUnreliable(bare("a", 10))).toBe(false);
  });
  it("overlap needs both ranges", () => {
    expect(overlaps(moe("a", 40, 5), moe("b", 48, 4))).toBe(true);
    expect(overlaps(moe("a", 40, 3), moe("b", 48, 4))).toBe(false);
    expect(overlaps(bare("a", 40), moe("b", 40, 4))).toBe(false);
  });
});

describe("rankValues", () => {
  it("ranks reliable tracts, lists overlapping ones below #10 as ties, and sets unreliable aside", () => {
    const values = Array.from({ length: 12 }, (_, i) => moe(`t${i}`, 100 - i * 5, 2)); // 100, 95, … 45
    values.push(moe("tie", 52, 6)); // overlaps #10 (55 ± 2)
    values.push(moe("shaky", 99, 80));
    const r = rankValues(values, "high");
    expect(r.top.map((v) => v.geoid)).toEqual(["t0", "t1", "t2", "t3", "t4", "t5", "t6", "t7", "t8", "t9"]);
    expect(r.ties.map((v) => v.geoid)).toEqual(["tie"]);
    expect(r.unreliable.map((v) => v.geoid)).toEqual(["shaky"]);
  });
  it("ranks low to high when asked", () => {
    expect(rankValues([moe("a", 3, 1), moe("b", 1, 0.5), moe("c", 2, 0.5)], "low").top.map((v) => v.geoid)).toEqual(["b", "c", "a"]);
  });
  it("lists no ties when the column has no ranges", () => {
    expect(rankValues(Array.from({ length: 12 }, (_, i) => bare(`t${i}`, 12 - i)), "high").ties).toEqual([]);
  });
});

describe("changeOf", () => {
  it("is clear only when the change beats both margins combined", () => {
    expect(changeOf(moe("a", 48, 7), moe("a", 63, 6))).toBe("increase"); // 15 > 9.22
    expect(changeOf(moe("a", 48, 7), moe("a", 55, 6))).toBe("none"); // 7 < 9.22
    expect(changeOf(moe("a", 60, 3), moe("a", 50, 3))).toBe("decrease");
    expect(changeOf(bare("a", 10), bare("a", 90))).toBe("none");
  });
});

describe("spearman and relationship", () => {
  it("is 1 for the same order, -1 for the reverse, and handles ties by average rank", () => {
    expect(spearman([1, 2, 3, 4], [10, 20, 30, 40])).toBeCloseTo(1);
    expect(spearman([1, 2, 3, 4], [40, 30, 20, 10])).toBeCloseTo(-1);
    expect(spearman([1, 2, 2, 3], [1, 2, 3, 4])).toBeCloseTo(0.9487, 3);
  });
  it("words the verdict by strength and direction, and refuses under 20 tracts", () => {
    expect(relationship(0.65, 40)).toEqual({ strength: "strong", direction: "higher" });
    expect(relationship(-0.45, 40)).toEqual({ strength: "moderate", direction: "lower" });
    expect(relationship(0.25, 40)).toEqual({ strength: "weak", direction: "higher" });
    expect(relationship(0.1, 40)).toEqual({ strength: "little", direction: "higher" });
    expect(relationship(0.9, 19).strength).toBe("too-few");
  });
});

describe("quantile and mismatch", () => {
  it("interpolates between sorted values", () => {
    expect(quantile([0, 10, 20, 30], 1 / 3)).toBeCloseTo(10);
    expect(quantile([0, 10, 20, 30], 2 / 3)).toBeCloseTo(20);
  });
  it("counts a tract only when its whole range clears both cutoffs; a value on the right side with a crossing range is close", () => {
    // a: poverty 0..100 step 5 (21 tracts); b: food insecurity mirrors it, except two high-poverty tracts with low b.
    const pairs = Array.from({ length: 21 }, (_, i) => ({ geoid: `t${i}`, a: moe(`t${i}`, i * 5, 1), b: ci(`t${i}`, i * 5, i * 5 - 1, i * 5 + 1) }));
    pairs[20] = { geoid: "fits", a: moe("fits", 100, 2), b: ci("fits", 5, 4, 6) }; // clearly high a, clearly low b
    pairs[19] = { geoid: "close", a: moe("close", 95, 2), b: ci("close", 30, 20, 40) }; // low-ish b whose range crosses the cutoff
    const r = mismatch(pairs, "high", "low");
    expect(r.fits.map((p) => p.geoid)).toEqual(["fits"]);
    expect(r.close.map((p) => p.geoid)).toEqual(["close"]);
  });
  it("leaves unreliable tracts out of cutoffs and findings", () => {
    const pairs = Array.from({ length: 21 }, (_, i) => ({ geoid: `t${i}`, a: moe(`t${i}`, i, 0.5), b: moe(`t${i}`, 20 - i, 0.5) }));
    pairs.push({ geoid: "shaky", a: moe("shaky", 30, 30), b: moe("shaky", 0, 0.1) });
    expect(mismatch(pairs, "high", "low").fits.some((p) => p.geoid === "shaky")).toBe(false);
  });
});
