import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchColumns, pdfUrl } from "../../convex/lib/arcgis";
import { scrapeMarkdown } from "../../convex/lib/firecrawl";
import { hashInputs } from "../../convex/lib/hash";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

afterEach(() => vi.unstubAllGlobals());

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
