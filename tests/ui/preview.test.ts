import { describe, expect, it, vi } from "vitest";
import { fetchJson, fieldValue, headlineColumn, rowsUrl, sharedScale, valuesUrl } from "../../ui/lib/preview";

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
});
