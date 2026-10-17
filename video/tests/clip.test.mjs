import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { clipArgs } from "../scripts/clip-lib.mjs";

test("a raw recording becomes the clip: trimmed, last frame held, 30 fps H.264", () => {
  assert.deepEqual(clipArgs("in.webm", "out.mp4", 1.6), ["-y", "-ss", "1.6", "-i", "in.webm", "-vf", "fps=30,format=yuv420p,tpad=stop_mode=clone:stop_duration=10", "-c:v", "libx264", "-crf", "18", "out.mp4"]);
});

test("the committed clip outlasts the 15 s address scene", () => {
  const seconds = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", new URL("../public/address.mp4", import.meta.url).pathname]).toString());
  assert.ok(seconds >= 15.5, `address.mp4 is ${seconds} s`);
});
