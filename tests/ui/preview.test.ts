import { canChart } from "../../ui/lib/preview";
import { describe, expect, it, vi } from "vitest";
import { bySeriesYear, chartSeries, fetchFeatures, fetchJson, fieldValue, formatCell, formatScale, headlineColumn, isSystemColumn, rowsUrl, sharedScale, valuesUrl } from "../../ui/lib/preview";

describe("live preview helpers", () => {
  it("builds ArcGIS query URLs", () => {
    expect(rowsUrl("https://s.test/FeatureServer/0", 10)).toBe(
      "https://s.test/FeatureServer/0/query?where=1%3D1&outFields=*&returnGeometry=false&resultRecordCount=10&f=json",
    );
    expect(valuesUrl("https://s.test/FeatureServer/0", "per_asthma")).toContain("outFields=per_asthma");
  });
  it("picks a headline measure column", () => {
    expect(headlineColumn(["GEOID", "NAME", "per_asthma", "TotalPopulation"])).toBe("per_asthma");
    expect(headlineColumn(["GEOID", "median_income"])).toBe("median_income");
    expect(headlineColumn(["GEOID", "NAME"])).toBeNull();
  });
  it("reads a column whatever its capitalisation in that year's layer", () => {
    // W01's 2021 and 2022 layers answer a per_asthma query with "Per_Asthma"; 2023 uses "per_asthma".
    expect(fieldValue({ Per_Asthma: 10.7 }, "per_asthma")).toBe(10.7);
    expect(fieldValue({ per_asthma: 11.1 }, "per_asthma")).toBe(11.1);
    expect(fieldValue({ GEOID: "55079130100" }, "per_asthma")).toBeUndefined();
  });
  it("puts every year on one shared scale", () => {
    expect(sharedScale([[1, 5], [3, 9]])).toEqual({ min: 1, max: 9 });
    expect(sharedScale([[4], [4]])).toEqual({ min: 3, max: 5 });
    expect(sharedScale([[], [Number.NaN]])).toBeNull();
  });
  it("fetchJson gives up after the timeout", async () => {
    vi.useFakeTimers();
    const pending = fetchJson("https://slow.test", 8000, () => new Promise<Response>(() => {}));
    await vi.advanceTimersByTimeAsync(8000);
    expect(await pending).toEqual({ ok: false, reason: "timeout" });
    vi.useRealTimers();
  });
  it("fetchJson reports HTTP and ArcGIS errors", async () => {
    expect(await fetchJson("u", 8000, async () => new Response("", { status: 503 }))).toEqual({ ok: false, reason: "HTTP 503" });
    expect(await fetchJson("u", 8000, async () => new Response(JSON.stringify({ error: { message: "Invalid URL" } })))).toEqual({
      ok: false,
      reason: "Invalid URL",
    });
  });
  it("fetchFeatures turns a 200 without a features list into a handled failure, not a crash", async () => {
    const reply = (body: unknown) => async () => new Response(JSON.stringify(body));
    expect(await fetchFeatures("u", 8000, reply({}))).toEqual({ ok: false, reason: "unexpected response from the Hub" });
    expect(await fetchFeatures("u", 8000, reply({ features: [{ attributes: { per_asthma: 11 } }] }))).toEqual({
      ok: true,
      data: { features: [{ attributes: { per_asthma: 11 } }] },
    });
  });
});

describe("isSystemColumn", () => {
  it("flags the Hub's bookkeeping columns, not the data", () => {
    expect(["OBJECTID", "object_id", "FID", "GlobalID", "Shape__Area"].every(isSystemColumn)).toBe(true);
    expect(["GEOID", "per_asthma", "Year"].some(isSystemColumn)).toBe(false);
  });
});

describe("chart ordering and labels", () => {
  it("rounds the scale ends to one decimal", () => {
    expect(formatScale(9.10000038)).toBe("9.1");
    expect(formatScale(17.5)).toBe("17.5");
    expect(formatScale(1234.56)).toBe("1,234.6");
  });
  it("orders rows by year, then place", () => {
    expect(["County 2023", "City 2021", "City 2022", "County 2021"].sort(bySeriesYear)).toEqual(["City 2021", "County 2021", "City 2022", "County 2023"]);
  });
});

describe("formatCell", () => {
  it("shows Hub floats to two decimals and leaves text and whole numbers alone", () => {
    expect(formatCell(93.94166666666668)).toBe("93.94");
    expect(formatCell(42)).toBe("42");
    expect(formatCell("2023-01-01")).toBe("2023-01-01");
    expect(formatCell(55079130100)).toBe("55079130100");
    expect(formatCell(null)).toBe("");
  });
});

describe("chartSeries", () => {
  const s = (label: string) => ({ label, values: [1] });
  it("drops a multi-year layer when single years exist, so days aren't plotted twice", () => {
    expect(chartSeries([s("City 2023"), s("City 2024"), s("City 2023–2025"), s("City 2025")]).map((x) => x.label)).toEqual(["City 2023", "City 2024", "City 2025"]);
  });
  it("keeps a multi-year layer when it is all there is, and orders by year", () => {
    expect(chartSeries([s("City 2021–2023")]).map((x) => x.label)).toEqual(["City 2021–2023"]);
    expect(chartSeries([s("County 2023"), s("City 2021")]).map((x) => x.label)).toEqual(["City 2021", "County 2023"]);
  });
});

describe("canChart", () => {
  const feed = [{ featureServerUrl: "https://example.com/FeatureServer/0" }];
  it("needs a headline column and a live feed", () => {
    expect(canChart(["Day", "AvgAQI"], feed)).toBe(true);
    expect(canChart([], feed)).toBe(false);
    expect(canChart(["Day", "AvgAQI"], [{ featureServerUrl: null }])).toBe(false);
  });
});
