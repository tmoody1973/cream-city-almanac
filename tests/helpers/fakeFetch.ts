import { vi } from "vitest";
import { hubCatalog, inventoryBase64 } from "./fixtures";

export interface FakeOptions {
  card?: unknown;
  cardStatus?: number;
  embeddingsStatus?: number;
  firecrawlStatus?: number;
  firecrawlMarkdown?: string;
  hubFeed?: unknown;
  hubStatus?: number;
  columns?: { name: string; alias?: string; type?: string }[];
}

export const DEFAULT_CARD = {
  explainer: "Estimated share of adults with obesity in each census tract (a neighborhood-sized area the Census Bureau uses).",
  glossary: [
    { field: "GEOID", meaning: "AI guess for GEOID" },
    { field: "per_obesity", meaning: "Estimated percent of adults with obesity." },
    { field: "made_up_column", meaning: "Should be dropped." },
  ],
  caveats: ["These are model-based estimates, not counts."],
  storyAngles: ["Which neighborhoods changed the most?", "How does this track with food access?"],
};

export const DEFAULT_MARKDOWN =
  "# Harambee Neighborhood Portrait\n\nIntro paragraph about the neighborhood with enough words to keep.\n\n## Housing\n\nMost homes in Harambee were built before 1950, and many are rented.";

// One-hot on the first word, so texts that start with the same word are identical vectors.
export function fakeEmbedding(text: string): number[] {
  const word = (text.trim().split(/\s+/)[0] ?? "").toLowerCase().replace(/[^a-z]/g, "");
  let h = 0;
  for (const ch of word) h = (h * 31 + ch.charCodeAt(0)) % 1536;
  const vec = new Array<number>(1536).fill(0.001);
  vec[h] = 1;
  return vec;
}

export function installFakeFetch(opts: FakeOptions = {}) {
  const calls: { url: string; body: any }[] = [];
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, body });

    if (url.includes("/api/feed/dcat-us/")) return json(opts.hubStatus ?? 200, opts.hubFeed ?? hubCatalog);
    if (url.includes("docs.google.com/spreadsheets"))
      return new Response(Uint8Array.from(atob(inventoryBase64), (c) => c.charCodeAt(0)), { status: 200 });
    if (url.includes("FeatureServer") && url.endsWith("?f=json"))
      return json(200, {
        fields: opts.columns ?? [
          { name: "OBJECTID", type: "esriFieldTypeOID" },
          { name: "GEOID", alias: "GEOID", type: "esriFieldTypeString" },
          { name: "per_obesity", alias: "per_obesity", type: "esriFieldTypeDouble" },
        ],
      });
    if (url.endsWith("/v1/embeddings")) {
      if (opts.embeddingsStatus && opts.embeddingsStatus !== 200) return json(opts.embeddingsStatus, { error: "down" });
      const texts: string[] = body.input;
      return json(200, {
        data: texts.map((t, index) => ({ index, embedding: fakeEmbedding(t) })),
        usage: { prompt_tokens: texts.length * 10 },
      });
    }
    if (url.endsWith("/v1/chat/completions")) {
      const schemaName = body.response_format?.json_schema?.name;
      if (schemaName === "source_profile")
        return json(200, {
          choices: [{ message: { content: JSON.stringify({ summary: "A public data publisher.", limits: "Estimates carry margins of error." }) } }],
          usage: { prompt_tokens: 500, completion_tokens: 100 },
        });
      if (opts.cardStatus && opts.cardStatus !== 200) return json(opts.cardStatus, { error: "down" });
      const card = opts.card ?? DEFAULT_CARD;
      return json(200, {
        choices: [{ message: { content: typeof card === "string" ? card : JSON.stringify(card) } }],
        usage: { prompt_tokens: 1000, completion_tokens: 300 },
      });
    }
    if (url.includes("api.firecrawl.dev/v2/scrape")) {
      if (opts.firecrawlStatus && opts.firecrawlStatus !== 200) return json(opts.firecrawlStatus, { success: false });
      return json(200, { success: true, data: { markdown: opts.firecrawlMarkdown ?? DEFAULT_MARKDOWN, metadata: {} } });
    }
    return json(404, { error: `unexpected URL in test: ${url}` });
  });

  vi.stubGlobal("fetch", fetchMock);
  return {
    calls,
    count: (part: string) => calls.filter((c) => c.url.includes(part)).length,
    countSchema: (name: string) => calls.filter((c) => c.body?.response_format?.json_schema?.name === name).length,
  };
}
