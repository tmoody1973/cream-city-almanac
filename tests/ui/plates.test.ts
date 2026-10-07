import { readdirSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Phone-first: the grease-pencil plates show at 30–230px, so each served file stays small.
const MAX_BYTES = 60_000;

describe("served grease-pencil plates", () => {
  it("are each under 60 KB", () => {
    const dir = "public/plates";
    const sizes = readdirSync(dir)
      .filter((f) => f.endsWith(".png"))
      .map((f) => [f, statSync(`${dir}/${f}`).size] as const);
    expect(sizes.length).toBeGreaterThan(0);
    expect(sizes.filter(([, size]) => size > MAX_BYTES)).toEqual([]);
  });
});
