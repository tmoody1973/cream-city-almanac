/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { describe, expect, it } from "vitest";
import { fixtureFamilies } from "../tests/helpers/fixtures";
import { api, internal } from "./_generated/api";
import { toFamilyInput } from "./lib/families";
import { placeKey } from "./lib/portrait";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");

async function seed(t: TestConvex<typeof schema>) {
  const buildId = await t.mutation(internal.buildStore.beginBuild, {});
  await t.mutation(internal.buildStore.swapCatalog, { buildId, families: fixtureFamilies().map((f) => toFamilyInput(f, null)), dictionaries: [] });
  return buildId;
}
const codeOf = (t: TestConvex<typeof schema>, key: string) =>
  t.run(async (ctx) => (await ctx.db.query("families").withIndex("by_key", (q) => q.eq("key", key)).first())!.code);

describe("catalog queries", () => {
  it("rundown returns the ten most recently updated families, newest first", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const rows = await t.query(api.catalog.rundown, {});
    expect(rows).toHaveLength(10);
    expect(rows.map((r) => r.latestModified)).toEqual([...rows.map((r) => r.latestModified)].sort().reverse());
  });

  it("the rundown lists data only, still ten rows", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    await t.run(async (ctx) => {
      const x02 = (await ctx.db.query("families").withIndex("by_key", (q) => q.eq("key", "page:getting-started")).first())!;
      await ctx.db.patch(x02._id, { latestModified: "2099-01-01T00:00:00.000Z" });
    });
    const rows = await t.query(api.catalog.rundown, {});
    expect(rows).toHaveLength(10);
    expect(rows.some((r) => r.kind === "page")).toBe(false);
  });

  it("a guide page's preview points at its Hub page", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const preview = (await t.query(api.catalog.familyPreview, { key: "page:getting-started" }))!;
    expect(preview.kind).toBe("page");
    expect(preview.guideUrl).toMatch(/^https:\/\/getdata-dycu\.hub\.arcgis\.com\/pages\//);
    const data = (await t.query(api.catalog.familyPreview, { key: "dataset:asthma-prevalence" }))!;
    expect(data.guideUrl).toBeNull();
  });

  it("familySheet accepts lowercase and returns null for unknown codes", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const code = await codeOf(t, "dataset:households-living-in-poverty");
    const sheet = await t.query(api.catalog.familySheet, { code: code.toLowerCase() });
    expect(sheet!.family.name).toBe("Households Living in Poverty");
    expect(sheet!.members).toHaveLength(5);
    expect(sheet!.members.map((m) => m.modified)).toEqual([...sheet!.members.map((m) => m.modified)].sort().reverse());
    expect(sheet!.grid.places).toEqual(["City", "County"]);
    expect(sheet!.card).toBeNull();
    expect(sheet!.fileLabel).toBeNull();
    expect(await t.query(api.catalog.familySheet, { code: "Z99" })).toBeNull();
  });

  it("familySheet gives report families a file link", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const sheet = await t.query(api.catalog.familySheet, { code: await codeOf(t, "document:neighborhood-portrait") });
    expect(sheet!.fileLabel).toBe("PDF");
    expect(sheet!.members[0].fileUrl).toMatch(/^https:\/\/www\.arcgis\.com\/sharing\/rest\/content\/items\/\w+\/data$/);
  });

  it("familyPreview links the newest CSV and falls back to the Hub description", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const preview = await t.query(api.catalog.familyPreview, { key: "dataset:daily-air-quality" });
    expect(preview!.csvUrl).toMatch(/\/csv/);
    expect(preview!.explainerProvenance).toBe("HUB");
    expect(preview!.grid.years).toEqual([2023, 2024, 2025]);
    expect(await t.query(api.catalog.familyPreview, { key: "dataset:nope" })).toBeNull();
  });

  it("catalogStatus reports the Hub-collection counts from the last good build", async () => {
    const t = convexTest(schema, modules);
    const buildId = await seed(t);
    await t.mutation(internal.buildStore.setPending, {
      buildId, pending: 229, hubCounts: { rawData: 93, reports: 282, visualizations: 7 }, pdfReports: 180, notes: [],
      mismatch: { unlinkedTabs: [], suspectLinks: [], unmatchedHomeTitles: [], typoFixes: [] },
    });
    await t.mutation(internal.buildStore.completeBuild, { buildId, orphanChunksDeleted: 0 });
    expect(await t.query(api.search.catalogStatus, {})).toMatchObject({
      counts: { rawData: 93, reports: 282, visualizations: 7 },
      pdfReports: 180,
      lastRunFailed: false,
    });
  });
});

describe("neighborhood spreadsheets", () => {
  it("groups files into neighborhoods whatever their name order, newest first", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const code = await codeOf(t, "document:neighborhood-portrait-spreadsheet");
    const sheet = (await t.query(api.catalog.familySheet, { code }))!;
    const silver = sheet.portraits!.neighborhoods.find((n) => n.key === "burnham-park-layton-park-silver-city")!;
    expect(silver.files.map((f) => f.year)).toEqual([2024, 2023, 2022, 2021]);
    expect(sheet.portraits!.neighborhoods.length).toBeGreaterThan(20);
    const other = (await t.query(api.catalog.familySheet, { code: await codeOf(t, "dataset:food-insecurity-prevalence") }))!;
    expect(other.portraits).toBeNull();
  });

  it("orders a neighborhood's files by year and opens the newest year that has tables", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const code = await codeOf(t, "document:neighborhood-portrait-spreadsheet");
    const members = fixtureFamilies().find((f) => f.key === "document:neighborhood-portrait-spreadsheet")!.members;
    const silver = (year: number) => members.find((m) => placeKey(m.place ?? m.title) === "burnham-park-layton-park-silver-city" && m.years[0] === year)!;
    await t.run(async (ctx) => {
      // DYCU re-uploads the 2021 file (now the most recently modified, not yet read); only the 2024 file has tables.
      const m = (await ctx.db.query("members").withIndex("by_hubId", (q) => q.eq("hubId", silver(2021).hubId)).first())!;
      await ctx.db.patch(m._id, { modified: "2099-01-01T00:00:00.000Z" });
      await ctx.db.insert("portraitTables", {
        hubId: silver(2024).hubId, modified: "m", slug: "race-and-ethnicity", topic: "Race and Ethnicity", tab: "Race and Ethnicity",
        order: 0, tableIds: [], tableIdText: "", vintage: null, groups: [""], rows: [], issues: [],
      });
    });
    const sheet = (await t.query(api.catalog.familySheet, { code }))!;
    expect(sheet.portraits!.neighborhoods.find((n) => n.key === "burnham-park-layton-park-silver-city")!.files.map((f) => f.year)).toEqual([2024, 2023, 2022, 2021]);
    expect(sheet.portraits!.initial!.hubId).toBe(silver(2024).hubId);
  });

  it("returns a file's tables in tab order", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    await t.run(async (ctx) => {
      for (const [order, slug] of [[1, "sex-and-age"], [0, "race-and-ethnicity"]] as const) {
        await ctx.db.insert("portraitTables", {
          hubId: "h1", modified: "m", slug, topic: slug, tab: slug, order, tableIds: [], tableIdText: "", vintage: null, groups: [""], rows: [], issues: [],
        });
      }
    });
    expect((await t.query(api.catalog.portraitTables, { hubId: "h1" })).map((x) => x.slug)).toEqual(["race-and-ethnicity", "sex-and-age"]);
  });
});

describe("startHere", () => {
  const card = (familyKey: string, extra: { caveats?: string[]; storyAngles?: string[]; glossary?: { field: string; meaning: string; provenance: "AI" }[] }) => ({
    familyKey, inputHash: "h", explainer: "x", explainerProvenance: "AI" as const, hubSummary: "", glossary: extra.glossary ?? [],
    caveats: extra.caveats ?? [], storyAngles: extra.storyAngles ?? [], basic: false, embedding: [],
  });
  const poverty = (hubId: string) => ({
    hubId, modified: "m", slug: "poverty-status-by-age", topic: "Poverty Status by Age", tab: "Poverty Status by Age", order: 2,
    tableIds: ["B17001"], tableIdText: "B17001", vintage: null, groups: [""],
    rows: [{ label: "Total", heading: false, values: [{ estimate: "100", moe: "5" }] }], issues: [],
  });
  const harambee = (year: number) =>
    fixtureFamilies().find((f) => f.key === "document:neighborhood-portrait-spreadsheet")!.members.find((m) => m.place === "Harambee" && m.years[0] === year)!;

  it("gathers each example's real data", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    await t.run(async (ctx) => {
      await ctx.db.insert("cards", card("dataset:housing-built-before-1950", { storyAngles: ["Angle one?", "Angle two?", "Angle three?"] }));
      await ctx.db.insert("cards", card("dataset:asthma-prevalence", { caveats: ["Modeled estimates."] }));
      await ctx.db.insert("cards", card("dataset:daily-air-quality", { caveats: ["Citywide average."], glossary: [{ field: "AQI", meaning: "m", provenance: "AI" }] }));
      await ctx.db.insert("portraitTables", poverty(harambee(2024).hubId));
    });
    const d = await t.query(api.catalog.startHere, {});
    expect(d.reporter.housing).toMatchObject({ code: expect.any(String), angles: ["Angle one?", "Angle two?"] });
    expect(d.reporter.asthma!.caveat).toBe("Modeled estimates.");
    expect(d.nonprofit).toMatchObject({ year: 2024, table: { slug: "poverty-status-by-age" } });
    expect(d.resident!.fields).toEqual(["AQI"]);
    expect(d.resident!.members.some((m) => m.featureServerUrl)).toBe(true);
    expect(d.guides.map((g) => g.name)).toEqual(["About the Data", "Getting Started", "Questions and Feedback"]);
    expect(d.guides.every((g) => g.url?.startsWith("https://"))).toBe(true);
  });

  it("lists a guide page without a link when it has no landing page", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    await t.run(async (ctx) => {
      for (const m of await ctx.db.query("members").withIndex("by_family", (q) => q.eq("familyKey", "page:getting-started")).collect()) {
        await ctx.db.patch(m._id, { landingPage: "" });
      }
    });
    const guide = (await t.query(api.catalog.startHere, {})).guides.find((g) => g.name === "Getting Started")!;
    expect(guide.url).toBeFalsy();
  });

  it("uses the newest Harambee year that has the poverty table", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    await t.run((ctx) => ctx.db.insert("portraitTables", poverty(harambee(2022).hubId)));
    expect((await t.query(api.catalog.startHere, {})).nonprofit!.year).toBe(2022);
  });

  it("returns nulls instead of failing when data is missing", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const d = await t.query(api.catalog.startHere, {});
    expect(d.reporter.housing).toMatchObject({ angles: [] });
    expect(d.reporter.asthma!.caveat).toBeNull();
    expect(d.nonprofit).toBeNull();
    expect(d.resident!.caveat).toBeNull();
  });
});

describe("City sheets", () => {
  it("list every file and point a replaced dataset at its replacement", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      for (const [key, code, name] of [["city:wibr-crime-monthly", "P38", "WIBR Crime (Monthly)"], ["city:nibrs-crime-data", "P08", "NIBRS Crime Data"]]) {
        await ctx.db.insert("families", { key, code, name, kind: "dataset", topic: "Public Safety", keywords: [], places: ["City"], years: [], latestModified: "2021-01-13", baseSearchText: "", searchText: "", dictionaryTab: null, source: "city", live: false });
      }
      await ctx.db.insert("members", {
        familyKey: "city:wibr-crime-monthly", hubId: "city:w", kind: "dataset", title: "WIBR Crime (Monthly)", landingPage: "https://data.milwaukee.gov/dataset/wibr-crime-monthly",
        place: "City", years: [], yearLabel: null, modified: "2025-03-24T00:00:00", featureServerUrl: null, downloads: {}, description: "", keywords: [], source: "city",
        files: [{ name: "Homicides", format: "Esri REST", url: "https://maps.example/MapServer/0" }],
      });
    });
    const wibr = (await t.query(api.catalog.familySheet, { code: "P38" }))!;
    expect(wibr.members[0].files).toEqual([{ name: "Homicides", format: "Esri REST", url: "https://maps.example/MapServer/0" }]);
    expect(wibr.layers).toEqual([{ name: "Homicides", url: "https://maps.example/MapServer/0" }]);
    expect(wibr.city!.replacedBy).toEqual({ code: "P08", name: "NIBRS Crime Data" });
    expect((await t.query(api.catalog.familySheet, { code: "P08" }))!.city!.replacedBy).toBeNull();
    expect((await t.query(api.catalog.familySheet, { code: "P08" }))!.city!.note).toBe("The City's file names still say WIBR (wibr.csv), the system Milwaukee police used before NIBRS.");
    expect(wibr.city!.note).toBeNull();
  });

  it("offer a What menu and a map only where the dataset has locations", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("families", { key: "city:nibrs-crime-data", code: "P08", name: "NIBRS Crime Data", kind: "dataset", topic: "Public Safety", keywords: [], places: ["City"], years: [], latestModified: "2021-01-13", baseSearchText: "", searchText: "", dictionaryTab: null, source: "city", live: false });
      await ctx.db.insert("cityProfiles", {
        familyKey: "city:nibrs-crime-data", resourceId: "r1", columns: [{ name: "Offense_All", type: "text" }], dateColumn: null, districtColumns: [],
        categories: [{ column: "Offense_All", values: [{ value: "120", count: 5 }] }], rowCount: 5, minDate: null, maxDate: null, namesPeople: false,
        latColumn: "RoundedLatitude", lonColumn: "RoundedLongitude", signature: "s", updatedAt: 0,
      });
    });
    const nibrs = (await t.query(api.catalog.familySheet, { code: "P08" }))!;
    expect(nibrs.city!.located).toBe(true);
    expect(nibrs.city!.what).toEqual({ column: "Offense_All", options: [{ value: "120", label: "Robbery" }] });
  });
});
