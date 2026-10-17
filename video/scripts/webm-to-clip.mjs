// Usage (repo root): node video/scripts/webm-to-clip.mjs <trim seconds>
// Turns video/.frames/address.webm (from record-address.playwright.mjs) into video/public/address.mp4.
// Use trim = typingAt - 1, then set RESULT_AT in video/src/clip.ts to resultAt - trim.
import { execFileSync } from "node:child_process";
import { clipArgs } from "./clip-lib.mjs";

const trim = Number(process.argv[2]);
if (!Number.isFinite(trim) || trim < 0) throw new Error("Pass the trim in seconds (typingAt - 1)");
execFileSync("ffmpeg", clipArgs("video/.frames/address.webm", "video/public/address.mp4", trim), { stdio: "inherit" });
