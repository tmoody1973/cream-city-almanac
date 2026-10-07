import { describe, expect, it, vi } from "vitest";
import { searchNotice, SEARCH_TIMEOUT_MS, withTimeout } from "../../ui/lib/search";

describe("searchNotice explains each state", () => {
  it("covers failure, no results, degraded, and normal", () => {
    expect(searchNotice("error", null)).toBe("Search failed. Check your connection and try again.");
    expect(searchNotice("idle", { degraded: false, results: [] })).toBe(
      "No datasets matched. Try fewer words, or email hub@datayoucanuse.org to ask DYCU.",
    );
    expect(searchNotice("idle", { degraded: true, results: [1] })).toBe("Showing keyword matches only right now.");
    expect(searchNotice("idle", { degraded: false, results: [1] })).toBeNull();
    expect(searchNotice("loading", null)).toBeNull();
  });
});

describe("withTimeout", () => {
  it("rejects a search that never answers, so a dropped connection shows the failure notice", async () => {
    vi.useFakeTimers();
    try {
      const pending = withTimeout(new Promise<never>(() => {}), SEARCH_TIMEOUT_MS);
      const settled = pending.then(() => "resolved", (e: Error) => e.message);
      await vi.advanceTimersByTimeAsync(SEARCH_TIMEOUT_MS);
      expect(await settled).toBe("timeout");
    } finally {
      vi.useRealTimers();
    }
  });
  it("passes a prompt answer through", async () => {
    expect(await withTimeout(Promise.resolve(42), SEARCH_TIMEOUT_MS)).toBe(42);
  });
});
