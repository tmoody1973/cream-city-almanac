export type SearchState = "idle" | "loading" | "error";

export function searchNotice(state: SearchState, response: { degraded: boolean; results: unknown[] } | null): string | null {
  if (state === "error") return "Search failed. Check your connection and try again.";
  if (state === "loading" || !response) return null;
  if (response.results.length === 0) return "No datasets matched. Try fewer words, or email hub@datayoucanuse.org to ask DYCU.";
  if (response.degraded) return "Showing keyword matches only right now.";
  return null;
}
