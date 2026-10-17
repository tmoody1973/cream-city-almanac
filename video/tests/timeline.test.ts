import { test } from "node:test";
import assert from "node:assert/strict";
import { VERTICAL, WIDE, total } from "../src/timeline.ts";

test("cuts are 90 s and 30 s", () => {
  assert.equal(total(WIDE), 2700);
  assert.equal(total(VERTICAL), 900);
});

test("every cut lands on a 120 BPM beat (15 frames)", () => {
  for (const tl of [WIDE, VERTICAL]) {
    let at = 0;
    for (const s of tl) {
      assert.equal(at % 15, 0, s.id);
      at += s.frames;
    }
  }
});

test("the vertical cut only uses wide scenes", () => {
  const ids = new Set(WIDE.map((s) => s.id));
  for (const s of VERTICAL) assert.ok(ids.has(s.id), s.id);
});
