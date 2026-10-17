// ffmpeg arguments that turn a raw recording into public/address.mp4: start `trim` seconds in (about 1 s before
// typing), hold the last frame `hold` seconds so the clip outlasts the 15 s address scene, 30 fps H.264.
export function clipArgs(input, output, trim, hold = 10) {
  return ["-y", "-ss", String(trim), "-i", input, "-vf", `fps=30,format=yuv420p,tpad=stop_mode=clone:stop_duration=${hold}`, "-c:v", "libx264", "-crf", "18", output];
}
