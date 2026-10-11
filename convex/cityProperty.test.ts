/// <reference types="vite/client" />
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { installFakeFetch } from "../tests/helpers/fakeFetch";
import { api } from "./_generated/api";
import { MPROP_RID } from "./lib/cityProfile";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");
const reader = { subject: "u1", issuer: "test", tokenIdentifier: "test|u1" };
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

async function seed() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  await t.run(async (ctx) => {
    await ctx.db.insert("families", { key: "city:master-property-file-mprop", code: "H28", name: "Master Property File (MPROP)", kind: "dataset", topic: "Housing", keywords: [], places: ["City"], years: [], latestModified: "2026-10-01", baseSearchText: "", searchText: "", dictionaryTab: null, source: "city", live: true });
    await ctx.db.insert("cityProfiles", { familyKey: "city:master-property-file-mprop", resourceId: MPROP_RID, columns: [], dateColumn: "CONVEY_DATE", districtColumns: [], categories: [{ column: "YR_ASSMT", values: [{ value: "2026", count: 159555 }] }, { column: "STREET", values: [{ value: "15TH", count: 1926 }] }], rowCount: 159949, minDate: "1900-01-01", maxDate: "2026-09-30", namesPeople: true, signature: "s", updatedAt: 0 });
    await ctx.db.insert("families", { key: "e02", code: "E02", name: "Households Living in Poverty", kind: "dataset", topic: "Economy", keywords: [], places: ["County"], years: [2024], latestModified: "2024-01-01", baseSearchText: "", searchText: "", dictionaryTab: null });
    await ctx.db.insert("members", { familyKey: "e02", hubId: "h1", title: "Poverty County 2024", yearLabel: "2024", featureServerUrl: "https://services.arcgis.com/x/PovCounty2024/FeatureServer/0", kind: "dataset", landingPage: "", place: "County", years: [2024], modified: "2024-01-01", downloads: {}, description: "", keywords: [] });
  });
  return t;
}

// 60 tracts: the first 40 have most homes over the cutoff, the last 20 don't; one tract has too few properties to judge.
const tractRows = () => [
  ...Array.from({ length: 60 }, (_, i) => ({ t: String(100000 + i * 100), hit: i < 40 ? "80" : "10", n: "100" })),
  { t: "999900", hit: "5", n: "6" },
];

describe("countRecords on the property file", () => {
  it("counts properties over a cutoff by district, out of all assessed, with the tracts where most pass", async () => {
    const t = await seed();
    installFakeFetch({
      citySql: (sql) =>
        sql.includes(`GROUP BY "GEO_TRACT"`) ? tractRows()
          : sql.includes("AS g") ? [{ g: "6", n: "4200" }, { g: "3", n: "3900" }]
            : sql.includes("> 200000") ? [{ n: "83243" }]
              : [{ n: "151500" }],
    });
    const r = await t.withIdentity(reader).action(api.city.countRecords, { code: "H28", filters: [{ column: "C_A_TOTAL", over: 200000 }], groupBy: "GEO_ALDER" });
    expect(r).toMatchObject({
      status: "ok", count: 83243, period: "2026 assessment", filters: ["assessed over $200,000"],
      groups: [{ label: "Aldermanic district 6", count: 4200 }, { label: "Aldermanic district 3", count: 3900 }],
      of: { count: 151500, label: "with an assessed value" },
      tractMap: { url: "https://services.arcgis.com/x/PovCounty2024/FeatureServer/0", total: 40 },
    });
    if (r.status !== "ok" || !r.tractMap) return;
    expect(r.tractMap.ids).toHaveLength(40);
    expect(r.tractMap.ids[0]).toBe("55079100000");
    expect(JSON.stringify(r)).not.toMatch(/OWNER|TAXKEY|STREET|15TH/);
  });
  it("keeps the count when the tract query fails (the map is lost, never the count)", async () => {
    const t = await seed();
    installFakeFetch({ citySql: (sql) => { if (sql.includes(`GROUP BY "GEO_TRACT"`)) throw new Error("boom"); return sql.includes("> 200000") ? [{ n: "83243" }] : [{ n: "151500" }]; } });
    const r = await t.withIdentity(reader).action(api.city.countRecords, { code: "H28", filters: [{ column: "C_A_TOTAL", over: 200000 }] });
    expect(r).toMatchObject({ status: "ok", count: 83243 });
    if (r.status === "ok") expect(r.tractMap).toBeUndefined();
  });
});
