import { describe, expect, it } from "vitest";
import { buildNeighborhoods, MIN_RESIDENTS, nMismatch, nTogether, versusCity, type NFigure } from "../../convex/lib/neighborhoodFigures";
import type { TractValue } from "../../convex/lib/tractStats";

// Two tracts: A (4,000 people) is 75% Alpha, 25% Beta; B (2,000 people) is 100% Beta. Tract C (300 people) is 100% Gamma.
const v = (geoid: string, value: number, half: number | null): TractValue => ({ geoid, value, lo: half === null ? null : value - half, hi: half === null ? null : value + half, kind: half === null ? null : "moe90" });
const pieces = new Map([["A", [{ name: "Alpha", share: 75 }, { name: "Beta", share: 25 }]], ["B", [{ name: "Beta", share: 100 }]], ["C", [{ name: "Gamma", share: 100 }]]]);
const pops = new Map([["A", 4000], ["B", 2000], ["C", 300]]);

describe("building neighborhood figures", () => {
  it("weights each piece by its residents and combines the ranges", () => {
    const b = buildNeighborhoods([v("A", 20, 2), v("B", 40, 4), v("C", 5, 1)], pieces, pops);
    const alpha = b.figures.find((f) => f.name === "Alpha")!;
    expect(alpha).toMatchObject({ value: 20, residents: 3000, tracts: 1, kind: "moe90" });
    expect(alpha.hi! - alpha.value).toBeCloseTo(2, 6);
    // Beta: 1,000 people from A at 20, 2,000 from B at 40 → (1000·20 + 2000·40) / 3000 = 33.33…
    const beta = b.figures.find((f) => f.name === "Beta")!;
    expect(beta.value).toBeCloseTo(33.333, 2);
    expect(beta.residents).toBe(3000);
    // half-width √((1/3·2)² + (2/3·4)²)
    expect(beta.hi! - beta.value).toBeCloseTo(Math.sqrt((2 / 3) ** 2 + (8 / 3) ** 2), 6);
  });
  it(`leaves out neighborhoods under ${MIN_RESIDENTS} residents, by name`, () => {
    const b = buildNeighborhoods([v("A", 20, 2), v("B", 40, 4), v("C", 5, 1)], pieces, pops);
    expect(b.figures.map((f) => f.name).sort()).toEqual(["Alpha", "Beta"]);
    expect(b.small).toEqual([{ name: "Gamma", residents: 300 }]);
  });
  it("leaves out a neighborhood whose valued pieces cover under half its residents (review focus 2)", () => {
    const b = buildNeighborhoods([v("A", 20, 2)], pieces, pops); // B has no value: Beta keeps only A's 1,000 of 3,000
    expect(b.thin).toEqual(["Beta"]);
    expect(b.figures.map((f) => f.name)).toEqual(["Alpha"]);
  });
  it("has no range when a piece lacks one", () => {
    const b = buildNeighborhoods([v("A", 20, null), v("B", 40, 4)], pieces, pops);
    expect(b.figures.find((f) => f.name === "Beta")).toMatchObject({ lo: null, hi: null });
  });
  it("builds the city the same way over every City tract", () => {
    const b = buildNeighborhoods([v("A", 20, 2), v("B", 40, 4), v("C", 5, 1)], pieces, pops);
    // (4000·20 + 2000·40 + 300·5) / 6300
    expect(b.city!.value).toBeCloseTo((80000 + 80000 + 1500) / 6300, 6);
    expect(b.city!.residents).toBe(6300);
  });
  it("judges a neighborhood against the city by its whole range", () => {
    const city: NFigure = { name: "City of Milwaukee", value: 30, lo: 29, hi: 31, kind: "moe90", residents: 1, tracts: 1 };
    const f = (value: number, half: number | null): NFigure => ({ name: "x", value, lo: half === null ? null : value - half, hi: half === null ? null : value + half, kind: "moe90", residents: 2000, tracts: 1 });
    expect(versusCity(f(40, 2), city)).toBe("higher");
    expect(versusCity(f(20, 2), city)).toBe("lower");
    expect(versusCity(f(31, 2), city)).toBe("same");
    expect(versusCity(f(31, null), city)).toBe("no-range");
    expect(versusCity(f(10, 9), city)).toBe("uncertain");
    expect(versusCity(f(10, 1), null)).toBeNull();
  });
});

describe("comparing neighborhoods", () => {
  const fig = (name: string, value: number): NFigure => ({ name, value, lo: value - 1, hi: value + 1, kind: "moe90", residents: 5000, tracts: 2 });
  // Values start at 10: a value of 0 or 1 with a ±1 range is too uncertain to use (isUnreliable).
  const pairs = Array.from({ length: 24 }, (_, i) => ({ name: `N${i}`, a: fig(`N${i}`, 10 + i), b: fig(`N${i}`, 50 + i) }));
  it("finds 'b low despite a high' against the city figure and the thirds of a", () => {
    const withLow = [...pairs, { name: "Odd", a: fig("Odd", 30), b: fig("Odd", 10) }];
    const r = nMismatch(withLow, "high", "low", 50);
    expect(r.fits.map((p) => p.name)).toEqual(["Odd"]);
  });
  it("says whether two measures go together across neighborhoods", () => {
    expect(nTogether(pairs)).toMatchObject({ n: 24, strength: "strong", direction: "higher" });
    expect(nTogether(pairs.slice(0, 10)).strength).toBe("too-few");
  });
});
