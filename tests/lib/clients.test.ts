import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchColumns, pdfUrl } from "../../convex/lib/arcgis";
import { retryAfterMs, scrapeMarkdown } from "../../convex/lib/firecrawl";
import { hashInputs } from "../../convex/lib/hash";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("timeouts", () => {
  it("gives up on hung Firecrawl and ArcGIS requests", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => {})));
    const scrape = expect(scrapeMarkdown("https://x.test/a.pdf", "fc")).rejects.toThrow("Timed out");
    const columns = expect(fetchColumns("https://s.test/FeatureServer/0")).rejects.toThrow("Timed out");
    await vi.advanceTimersByTimeAsync(200_000);
    await scrape;
    await columns;
  });
});

describe("scrapeMarkdown", () => {
  it("posts to Firecrawl v2 and returns the markdown", async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => json(200, { success: true, data: { markdown: "# Hi" } }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await scrapeMarkdown("https://x.test/a.pdf", "fc")).toBe("# Hi");
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.firecrawl.dev/v2/scrape");
    expect(JSON.parse(String(fetchMock.mock.calls[0][1].body))).toEqual({ url: "https://x.test/a.pdf", formats: ["markdown"] });
  });
  it("throws when Firecrawl reports failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(200, { success: false })));
    await expect(scrapeMarkdown("u", "fc")).rejects.toThrow("no markdown");
  });
});

describe("Firecrawl rate limits", () => {
  it("waits for Retry-After on a 429 and then succeeds", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: false }), { status: 429, headers: { "Retry-After": "2" } }))
      .mockResolvedValueOnce(json(200, { success: true, data: { markdown: "# Hi" } }));
    vi.stubGlobal("fetch", fetchMock);
    const result = scrapeMarkdown("https://x.test/a.pdf", "fc");
    await vi.advanceTimersByTimeAsync(2_000);
    expect(await result).toBe("# Hi");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives up after three 429s", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async () => json(429, { success: false, error: "Rate limit exceeded" }));
    vi.stubGlobal("fetch", fetchMock);
    const assertion = expect(scrapeMarkdown("https://x.test/a.pdf", "fc")).rejects.toThrow("Firecrawl 429");
    await vi.advanceTimersByTimeAsync(300_000);
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("reads Retry-After seconds, capped at two minutes, defaulting to one minute", () => {
    expect(retryAfterMs("5")).toBe(5_000);
    expect(retryAfterMs("999")).toBe(120_000);
    expect(retryAfterMs(null)).toBe(60_000);
    expect(retryAfterMs("Wed, 21 Oct 2026 07:28:00 GMT")).toBe(60_000);
  });
});

describe("fetchColumns", () => {
  it("drops system columns and the esriFieldType prefix", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        json(200, {
          fields: [
            { name: "OBJECTID", type: "esriFieldTypeOID" },
            { name: "GEOID", alias: "Tract", type: "esriFieldTypeString" },
            { name: "Shape__Area", type: "esriFieldTypeDouble" },
          ],
        }),
      ),
    );
    expect(await fetchColumns("https://s.test/FeatureServer/0")).toEqual([{ name: "GEOID", alias: "Tract", type: "String" }]);
  });
  it("throws on an ArcGIS error body", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(200, { error: { message: "Invalid URL" } })));
    await expect(fetchColumns("https://s.test/FeatureServer/0")).rejects.toThrow("Invalid URL");
  });
  it("builds the report PDF URL", () => {
    expect(pdfUrl("abc")).toBe("https://www.arcgis.com/sharing/rest/content/items/abc/data");
  });
});

describe("hashInputs", () => {
  it("ignores key order and detects changes", async () => {
    expect(await hashInputs({ a: 1, b: [1, { c: 2, d: 3 }] })).toBe(await hashInputs({ b: [1, { d: 3, c: 2 }], a: 1 }));
    expect(await hashInputs({ a: 1 })).not.toBe(await hashInputs({ a: 2 }));
  });
});
