// tests/propertyMeasures.test.ts
import { describe, expect, it } from "vitest";
import {
  assessmentYear, measureById, measureMeaning, measureMenu, measureSql, measureValues, MEASURES, MIN_HOMES, parseCutoff, tractGeoid,
} from "../convex/lib/propertyMeasures";
import { MPROP_RID } from "../convex/lib/cityProfile";
import { isUnreliable, mismatch, rankValues, type TractValue } from "../convex/lib/tractStats";

const exact = (geoid: string, value: number): TractValue => ({ geoid, value, lo: value, hi: value, kind: "exact" });

describe("property measures", () => {
  it("knows its five measures and offers them as a column menu", () => {
    expect(MEASURES.map((m) => m.id)).toEqual(["median_value", "share_over", "share_under", "owner_share", "median_year_built"]);
    expect(measureById(" Median_Value ")?.id).toBe("median_value");
    expect(measureById("OWNER_NAME_1")).toBeNull();
    expect(measureMenu().every((c) => c.range === true)).toBe(true);
    expect(JSON.stringify(measureMenu())).not.toMatch(/OWNER|TAXKEY|STREET/);
  });
  it("puts the cutoff into a share's meaning, in dollars", () => {
    expect(measureMeaning(measureById("share_over")!, 200000)).toBe("Percentage of homes (houses and condos) assessed over $200,000");
    expect(measureMeaning(measureById("median_value")!)).toBe("Median assessed value of homes (houses and condos)");
  });
  it("accepts only whole-dollar cutoffs from 1,000 to 10,000,000", () => {
    expect(parseCutoff(200000)).toBe(200000);
    expect(parseCutoff(5)).toBeNull();
    expect(parseCutoff(200000.5)).toBeNull();
    expect(parseCutoff(20_000_000)).toBeNull();
    expect(parseCutoff("200000")).toBeNull();
    expect(parseCutoff(undefined)).toBeNull();
  });
  it("reads the file's current assessment year from its profile (the most common YR_ASSMT)", () => {
    expect(assessmentYear([{ column: "YR_ASSMT", values: [{ value: "2026" }, { value: "2025" }] }])).toBe("2026");
    expect(assessmentYear([{ column: "STREET", values: [{ value: "15TH" }] }])).toBeNull();
    expect(assessmentYear([{ column: "YR_ASSMT", values: [{ value: "26'; DROP" }] }])).toBeNull();
  });
  it("builds each measure's SQL from fixed text: homes in the current year, grouped by tract", () => {
    const median = measureSql(MPROP_RID, measureById("median_value")!, "2026");
    expect(median).toContain(`FROM "${MPROP_RID}"`);
    expect(median).toContain(`"C_A_CLASS" IN ('1', '5')`);
    expect(median).toContain(`"YR_ASSMT" = '2026'`);
    expect(median).toContain("percentile_cont(0.5) WITHIN GROUP");
    expect(median).toContain(`GROUP BY "GEO_TRACT"`);
    expect(measureSql(MPROP_RID, measureById("share_over")!, "2026", 200000)).toMatch(/::float END\) > 200000 THEN 1/);
    expect(measureSql(MPROP_RID, measureById("share_under")!, "2026", 150000)).toMatch(/::float END\) < 150000 THEN 1/);
    expect(measureSql(MPROP_RID, measureById("owner_share")!, "2026")).toContain(`"OWN_OCPD" = 'O'`);
    const built = measureSql(MPROP_RID, measureById("median_year_built")!, "2026");
    expect(built).toContain(`"C_A_CLASS" = '1'`);
    expect(built).toContain(">= 1800");
  });
  it("refuses to build SQL from anything unvalidated", () => {
    expect(() => measureSql("not-a-rid", measureById("median_value")!, "2026")).toThrow();
    expect(() => measureSql(MPROP_RID, measureById("median_value")!, "2026' OR 1=1")).toThrow();
    expect(() => measureSql(MPROP_RID, measureById("share_over")!, "2026")).toThrow(/cutoff/);
  });
  it("pads the City's tract to DYCU's GEOID and drops what isn't a tract", () => {
    expect(tractGeoid("101")).toBe("55079000101");
    expect(tractGeoid("187000")).toBe("55079187000");
    expect(tractGeoid(" 1000 ")).toBe("55079001000");
    expect(tractGeoid("000000")).toBeNull();
    expect(tractGeoid("0")).toBeNull();
    expect(tractGeoid("1234567")).toBeNull();
    expect(tractGeoid(null)).toBeNull();
    expect(tractGeoid("12a")).toBeNull();
  });
  it("turns rows into exact values, leaving out thin tracts and rows with no tract", () => {
    const r = measureValues([
      { t: "101", v: "251850", n: "400" },
      { t: "1000", v: 141600, n: MIN_HOMES },
      { t: "1100", v: "99000", n: String(MIN_HOMES - 1) }, // too few homes
      { t: "000000", v: "50000", n: "900" }, // no tract
      { t: "1200", v: null, n: "300" }, // no value
    ]);
    expect(r.values).toEqual([exact("55079000101", 251850), exact("55079001000", 141600)]);
    expect(r.thin).toBe(2);
    expect(r.noTract).toBe(1);
  });
});

describe("exact ranges in the honesty rules", () => {
  it("are never unreliable, even at zero", () => {
    expect(isUnreliable(exact("1", 0))).toBe(false);
    expect(isUnreliable(exact("1", 250000))).toBe(false);
  });
  it("tie in a ranking only when the values are equal", () => {
    const vals = Array.from({ length: 12 }, (_, i) => exact(String(i), 100 - i));
    vals.push(exact("dup", 91)); // equal to #10 (value 91)
    const r = rankValues(vals, "high");
    expect(r.ties.map((v) => v.geoid)).toEqual(["dup"]);
  });
  it("let a mismatch's clearness depend only on the side with a margin", () => {
    const pairs = Array.from({ length: 30 }, (_, i) => ({
      geoid: String(i),
      a: exact(String(i), i), // property side: exact
      b: { geoid: String(i), value: 30 - i, lo: 30 - i - 0.5, hi: 30 - i + 0.5, kind: "moe90" as const },
    }));
    // A tract in the corner whose b range crosses b's cutoff (10, the bottom third) while staying reliable.
    pairs.push({ geoid: "wide", a: exact("wide", 29), b: { geoid: "wide", value: 10, lo: 8.8, hi: 11.2, kind: "moe90" } });
    const m = mismatch(pairs, "high", "low");
    expect(m.fits.length).toBeGreaterThan(0);
    expect(m.fits.some((p) => p.geoid === "wide")).toBe(false);
    expect(m.close.some((p) => p.geoid === "wide")).toBe(true);
  });
});
