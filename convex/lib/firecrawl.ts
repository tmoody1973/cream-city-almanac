import { fetchWithTimeout } from "./http";

// Worst case per call: 3 attempts × 120s timeout + 2 waits × 120s = 600s; typical waits are 60s.
const SCRAPE_TIMEOUT_MS = 120_000;
const MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_MS = 60_000;
const MAX_RETRY_MS = 120_000;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function firecrawlKey(): string {
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) throw new Error("FIRECRAWL_API_KEY is not set (run: npx convex env set FIRECRAWL_API_KEY <key>)");
  return key;
}

// Retry-After may be seconds or an HTTP date; dates fall back to the default wait.
export function retryAfterMs(header: string | null): number {
  const seconds = Number(header);
  return header && Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds * 1000, MAX_RETRY_MS) : DEFAULT_RETRY_MS;
}

export async function scrapeMarkdown(url: string, key: string): Promise<string> {
  for (let attempt = 1; ; attempt++) {
    const res = await fetchWithTimeout(
      "https://api.firecrawl.dev/v2/scrape",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ url, formats: ["markdown"] }),
      },
      SCRAPE_TIMEOUT_MS,
    );
    if (res.status === 429 && attempt < MAX_ATTEMPTS) {
      await sleep(retryAfterMs(res.headers.get("retry-after")));
      continue;
    }
    if (!res.ok) throw new Error(`Firecrawl ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const body = await res.json();
    if (!body.success || typeof body.data?.markdown !== "string") throw new Error("Firecrawl returned no markdown");
    return body.data.markdown;
  }
}
