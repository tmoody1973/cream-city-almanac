import { test } from "node:test";
import assert from "node:assert/strict";
import { concatList } from "../scripts/frames-lib.mjs";

test("each frame lasts until the next capture; the last holds to the target length", () => {
  assert.equal(
    concatList([0, 100, 250], 1),
    "ffconcat version 1.0\nfile f00000.png\nduration 0.100\nfile f00001.png\nduration 0.150\nfile f00002.png\nduration 0.750\nfile f00002.png\n",
  );
});

test("never a negative hold when the recording already runs long", () => {
  assert.match(concatList([0, 2000], 1), /duration 0\.000\nfile f00001\.png\n$/);
});
