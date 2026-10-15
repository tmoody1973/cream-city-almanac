import { describe, expect, it } from "vitest";
import { toCsv } from "../../ui/lib/cardExport";
import { cityLine, nExport, nFollowUps, nLead, nMap, nNotes, nTable } from "../../ui/lib/neighborhoodText";
import type { NRankDetail, NRelateDetail } from "../../convex/tracts";

const head = { code: "E09", name: "Rent Burdened Households", column: "pct_burdened", meaning: "Percentage of renter households paying 30% or more of income on rent", kind: "rate" as const, place: "City", year: "2023", n: 300, leftOut: 0, confidence: "90% confidence (Census)", url: "https://x/FeatureServer/0", caveats: [] };
const row = (name: string, value: number, verdict: "higher" | "same" | "lower") => ({ name, value, lo: value - 2, hi: value + 2, kind: "moe90" as const, residents: 9000, tracts: 3, verdict });
const rank: NRankDetail = { status: "ok", tool: "rank-n", header: head, direction: "high", city: { name: "City of Milwaukee", value: 51.2, lo: 50.6, hi: 51.8, kind: "moe90", residents: 560000, tracts: 290 }, top: [row("Harambee", 68.1, "higher"), row("Lindsay Heights", 66, "higher"), row("Metcalfe Park", 64.4, "higher")], uncertain: [], small: [{ name: "Buchel Park", residents: 120 }], thin: [], key: "tracts:x" };
const ctx = { origin: "https://www.creamcityalmanac.app", date: "October 15, 2026" };

describe("neighborhood card words", () => {
  it("leads with the answer, in neighborhoods, and shows the city figure", () => {
    expect(nLead(rank)).toEqual({ strong: "Highest rent burdened households: Harambee, Lindsay Heights, Metcalfe Park.", rest: null });
    expect(cityLine(rank)).toBe("City of Milwaukee: 51.2% (50.6%–51.8%).");
  });
  it("rows read neighborhood, figure with range, and the verdict", () => {
    expect(nTable(rank).rows[0]).toEqual(["Harambee", "68.1% (66.1%–70.1%)", "clearly higher"]);
  });
  it("says how the figures were built, names who was left out, and keeps codes out of the words", () => {
    const n = nNotes(rank).join("\n");
    expect(n).toContain("Neighborhood figures are built from census areas, weighted by how many residents live in each part, so they're approximate.");
    expect(n).toContain("Left out (fewer than 1,000 residents): Buchel Park.");
    expect(n).toContain("Percentage of renter households paying 30% or more of income on rent");
    expect(n).not.toMatch(/\bE09\b|pct_burdened/);
  });
  it("credits DYCU on the export, with the dataset link", () => {
    const e = nExport(rank, ctx);
    expect(toCsv(e)).toContain("Data You Can Use");
    expect(e.notes.join("\n")).toContain("/d/E09");
  });
  it("maps the neighborhoods by the City layer's own names", () => {
    expect(nMap(rank)).toMatchObject({ fits: ["HARAMBEE", "LINDSAY HEIGHTS", "METCALFE PARK"], close: [], field: "NEIGHBORHD", noun: "neighborhood" });
  });
  it("offers the same question by census area", () => {
    expect(nFollowUps({ code: "E09", column: "pct_burdened", place: "City", year: "2023", direction: "high" }, rank)).toEqual([{ label: "BY CENSUS AREA", question: "Rank census tracts by Rent Burdened Households (E09, pct_burdened, City 2023), by census tract." }]);
  });
  it("leads a mismatch with the closest neighborhoods", () => {
    const rel: NRelateDetail = { status: "ok", tool: "relate-n", mode: "mismatch", a: head, b: { ...head, code: "H04", name: "Households with Broadband", meaning: "Percentage of households with a broadband subscription" }, city: { a: rank.city, b: { ...rank.city!, value: 80 } }, n: 120, strength: "moderate", direction: "lower", aSide: "high", bSide: "low", cutA: 58, fits: [], close: [{ name: "Riverwest", a: row("Riverwest", 60, "higher"), b: row("Riverwest", 75, "lower") }], uncertain: [], small: [], key: "tracts:y" };
    expect(nLead(rel).strong).toBe("No neighborhood clearly has high rent burdened households with low households with broadband. Possible: Riverwest.");
  });
});
