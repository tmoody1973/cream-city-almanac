import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { WIDE } from "../src/timeline.ts";

test("every timeline scene has a component in the scene index", () => {
  const index = readFileSync(new URL("../src/scenes/index.ts", import.meta.url), "utf8");
  for (const s of WIDE) assert.match(index, new RegExp(`"${s.id}":`), s.id);
});
