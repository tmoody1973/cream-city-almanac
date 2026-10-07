export type SearchState = "idle" | "loading" | "error";

export function searchNotice(state: SearchState, response: { degraded: boolean; results: unknown[] } | null): string | null {
  if (state === "error") return "Search failed. Check your connection and try again.";
  if (state === "loading" || !response) return null;
  if (response.results.length === 0) return "No datasets matched. Try fewer words, or email hub@datayoucanuse.org to ask DYCU.";
  if (response.degraded) return "Showing keyword matches only right now.";
  return null;
}

// Convex queues a request while its socket is down and never rejects it, so a dropped phone connection would
// leave search loading forever. Give up after this long and show the failure notice instead.
export const SEARCH_TIMEOUT_MS = 10_000;

export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("timeout")), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
