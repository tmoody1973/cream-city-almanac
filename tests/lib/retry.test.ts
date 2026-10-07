import { describe, expect, it, vi } from "vitest";
import { retryOnConflict } from "../../convex/lib/retry";

const CONFLICT = new Error(
  'Documents read from or written to the "builds" table changed while this mutation was being run and on every subsequent retry.',
);
const noWait = async () => {};

describe("retryOnConflict", () => {
  it("retries a write conflict until it succeeds", async () => {
    const fn = vi.fn().mockRejectedValueOnce(CONFLICT).mockRejectedValueOnce(CONFLICT).mockResolvedValue("ok");
    const wait = vi.fn(noWait);
    expect(await retryOnConflict(fn, { attempts: 5, wait })).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
    expect(wait).toHaveBeenCalledTimes(2);
  });

  it("does not retry other errors", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("ArgumentValidationError"));
    await expect(retryOnConflict(fn, { attempts: 5, wait: noWait })).rejects.toThrow("ArgumentValidationError");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("gives up after the last attempt", async () => {
    const fn = vi.fn().mockRejectedValue(CONFLICT);
    await expect(retryOnConflict(fn, { attempts: 3, wait: noWait })).rejects.toBe(CONFLICT);
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
