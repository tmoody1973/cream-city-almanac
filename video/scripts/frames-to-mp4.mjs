// Usage: node scripts/frames-to-mp4.mjs <frames dir with times.json> <out.mp4>
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { concatList } from "./frames-lib.mjs";

const [dir, out] = process.argv.slice(2);
const times = JSON.parse(readFileSync(join(dir, "times.json"), "utf8"));
writeFileSync(join(dir, "list.txt"), concatList(times, 16));
execFileSync("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", join(dir, "list.txt"), "-vf", "fps=30,format=yuv420p", "-c:v", "libx264", "-crf", "18", out], { stdio: "inherit" });
