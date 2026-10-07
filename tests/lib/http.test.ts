import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchWithTimeout } from "../../convex/lib/http";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("fetchWithTimeout", () => {
  it("rejects when the server does not answer in time", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => {})));
    const assertion = expect(fetchWithTimeout("https://slow.test", {}, 30_000)).rejects.toThrow(
      "Timed out after 30s: https://slow.test",
    );
    await vi.advanceTimersByTimeAsync(30_000);
    await assertion;
  });

  it("returns the response when it arrives in time", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("ok")));
    expect(await (await fetchWithTimeout("https://fast.test", {}, 1000)).text()).toBe("ok");
  });
});
