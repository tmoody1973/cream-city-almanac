import { describe, expect, it } from "vitest";
import { askTools, type AskBackend } from "../../lib/ask/tools";

const backend = (relateResult: unknown): AskBackend => ({
  search: async () => ({ results: [] }) as never, sheet: async () => null, number: async () => ({}) as never, report: async () => ({}) as never, count: async () => ({}) as never,
  rank: async () => ({ status: "busy" }) as never, change: async () => ({ status: "busy" }) as never, relate: async () => relateResult as never,
});

const row = (i: number) => ({ geoid: `5507910${String(i).padStart(4, "0")}`, tract: String(i), neighborhood: "Harambee", value: 41.2, lo: 35.1, hi: 47.3, unreliable: false });
const call = (b: AskBackend) =>
  askTools(b).find((t) => t.name === "relateTracts")!.execute({ a: { code: "E02", column: "pov_rate" }, b: { code: "F02", column: "per_insecure" }, place: "City", year: "2022", mode: "mismatch" } as never);

describe("tract tools", () => {
  it("offers rankTracts, compareYears and relateTracts", () => {
    expect(askTools(backend({})).map((t) => t.name)).toEqual(expect.arrayContaining(["rankTracts", "compareYears", "relateTracts"]));
  });
  it("passes each backend result through unchanged", async () => {
    const answer = { status: "choose-year", dataset: "b", available: { a: [], b: [] } };
    expect(await call(backend(answer))).toBe(answer);
  });
  it("describes aSide and bSide as sides of dataset a and dataset b", () => {
    const shape = (askTools(backend({})).find((t) => t.name === "relateTracts")!.parameters as { shape: Record<string, { description?: string }> }).shape;
    expect(shape.aSide.description).toMatch(/dataset a/);
    expect(shape.bSide.description).toMatch(/dataset b/);
  });
  it("keeps a 300-tract relate answer under 8 KB in the conversation", async () => {
    const head = { code: "E02", name: "Households Living in Poverty", column: "pov_rate", meaning: "Share of households below the poverty line.", kind: "rate", place: "City", year: "2022", n: 300, leftOut: 4, confidence: "90% confidence (Census)", url: "https://services.arcgis.com/x/FeatureServer/0", caveats: ["Survey estimates pool five years."] };
    const answer = { status: "ok", tool: "relate", mode: "mismatch", a: head, b: { ...head, code: "F02" }, n: 300, rho: 0.71, strength: "strong", direction: "higher", fits: Array.from({ length: 10 }, (_, i) => ({ a: row(i), b: row(i) })), close: Array.from({ length: 10 }, (_, i) => ({ a: row(i), b: row(i) })), highlighted: [], closeIds: [], key: "tracts:abc" };
    expect(JSON.stringify(await call(backend(answer))).length).toBeLessThan(8_000);
  });
  it("keeps the slim relate return (headers without caveats or url, 10 fits, 10 close, totals) under 8 KB", async () => {
    const { caveats: _c, url: _u, ...head } = { code: "E02", name: "Households Living in Poverty", column: "pov_rate", meaning: "Share of households below the poverty line.", kind: "rate", place: "City", year: "2022", n: 300, leftOut: 4, confidence: "90% confidence (Census)", url: "x", caveats: ["c"] };
    const answer = { status: "ok", tool: "relate", mode: "mismatch", a: head, b: { ...head, code: "F02" }, n: 300, rho: 0.71, strength: "strong", direction: "higher", fits: Array.from({ length: 10 }, (_, i) => ({ a: row(i), b: row(i) })), fitsCount: 57, close: Array.from({ length: 10 }, (_, i) => ({ a: row(i), b: row(i) })), closeCount: 31, unreliableCount: 12, key: "tracts:abc", aSide: "high", bSide: "low", cutA: 20.5, cutB: 8.1 };
    expect(JSON.stringify(await call(backend(answer))).length).toBeLessThan(8_000);
  });
});
