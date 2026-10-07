import { fetchWithTimeout } from "./http";

const SCRAPE_TIMEOUT_MS = 150_000;

export function firecrawlKey(): string {
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) throw new Error("FIRECRAWL_API_KEY is not set (run: npx convex env set FIRECRAWL_API_KEY <key>)");
  return key;
}

export async function scrapeMarkdown(url: string, key: string): Promise<string> {
  const res = await fetchWithTimeout("https://api.firecrawl.dev/v2/scrape", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ url, formats: ["markdown"] }),
  }, SCRAPE_TIMEOUT_MS);
  if (!res.ok) throw new Error(`Firecrawl ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = await res.json();
  if (!body.success || typeof body.data?.markdown !== "string") throw new Error("Firecrawl returned no markdown");
  return body.data.markdown;
}
