// convex/boundaries.test.ts
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runRefresh, seedBoundaryData } from "../tests/helpers/boundaryFixtures";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

async function seed() {
  const t = convexTest(schema, modules);
  await seedBoundaryData(t);
  return t;
}
const overlap = (t: Awaited<ReturnType<typeof seed>>, placeType: string, place: string) =>
  t.run((ctx) => ctx.db.query("boundaryOverlaps").withIndex("by_place", (q) => q.eq("placeType", placeType as never).eq("place", place)).unique());

describe("refreshBoundaries", () => {
  it("stores all eight kinds of the City's boundaries", async () => {
    const t = await seed();
    expect(await runRefresh(t)).toEqual([]);
    const rows = await t.run((ctx) => ctx.db.query("boundaries").collect());
    expect(rows.map((r) => [r.kind, r.name]).sort()).toEqual([
      ["bid", "BID 4: Far Away"], ["district", "District 6"], ["nrsa", "NRSA 1"], ["nsp", "NSP 7: Harambee Great Neighborhood Initiative"],
      ["oz", "Opportunity Zone (2010 tract 88)"], ["tid", "TID 72: Bronzeville"], ["tin", "Harambee Proud TIN"], ["ward", "Ward 112"],
    ]);
    expect(rows.find((r) => r.kind === "ward")?.details).toMatchObject({ pollingPlace: "North Division High School" });
  });
  it("builds overlaps for a tract, a City neighborhood, a DYCU area and a district", async () => {
    const t = await seed();
    await runRefresh(t);
    const tract = await overlap(t, "tract", "55079008800");
    expect(tract?.covers.map((c) => c.name)).toEqual(["District 6", "Ward 112", "Harambee Proud TIN", "NRSA 1", "NSP 7: Harambee Great Neighborhood Initiative", "TID 72: Bronzeville", "Opportunity Zone (2010 tract 88)"]);
    expect(tract?.covers.find((c) => c.kind === "tin")?.share).toBeGreaterThanOrEqual(48);
    expect(tract?.covers.find((c) => c.kind === "tin")?.share).toBeLessThanOrEqual(52);
    expect(tract?.covers.find((c) => c.kind === "ward")?.details).toMatchObject({ pollingPlace: "North Division High School" });
    expect((await overlap(t, "city", "Harambee"))?.covers.map((c) => c.name)).toContain("Harambee Proud TIN");
    expect((await overlap(t, "dycu", "Harambee"))?.covers.map((c) => c.name)).toContain("Harambee Proud TIN");
    const district = await overlap(t, "district", "6");
    expect(district?.covers.map((c) => c.kind)).not.toContain("district"); // a district doesn't list itself
    expect(district?.covers.map((c) => c.name)).toContain("Ward 112");
    expect((await overlap(t, "tract", "55079150100"))?.covers).toEqual([]); // a County tract the City's boundaries don't reach
  });
  it("keeps last week's rows for a layer that fails, says so, and still builds overlaps from them", async () => {
    const t = await seed();
    await runRefresh(t);
    const notes = await runRefresh(t, { cityLayerStatus: { "planning/special_districts/MapServer/13": 503 } });
    expect(notes).toEqual([expect.stringMatching(/^Targeted Investment Neighborhood boundaries unavailable, kept last week's: /)]);
    expect((await t.run((ctx) => ctx.db.query("boundaries").withIndex("by_kind", (q) => q.eq("kind", "tin")).collect())).map((r) => r.name)).toEqual(["Harambee Proud TIN"]);
    expect((await overlap(t, "tract", "55079008800"))?.covers.map((c) => c.name)).toContain("Harambee Proud TIN");
  });
  it("keeps last week's overlaps when the tract outlines can't be read", async () => {
    const t = await seed();
    await runRefresh(t);
    const notes = await runRefresh(t, { tractShapesStatus: 503 });
    expect(notes).toEqual([expect.stringMatching(/^Boundary overlaps unavailable, kept last week's: /)]);
    expect(await overlap(t, "tract", "55079008800")).not.toBeNull();
  });
});
