// ffmpeg's concat format for screenshots taken at uneven times (ms since start). The last frame repeats
// so ffmpeg honors its duration, and holds until `holdUntil` seconds so the clip never runs out mid-scene.
export function concatList(times, holdUntil) {
  const name = (i) => `f${String(i).padStart(5, "0")}.png`;
  const last = times.length - 1;
  const lines = times.map((t, i) => {
    const end = i < last ? times[i + 1] : Math.max(t, holdUntil * 1000);
    return `file ${name(i)}\nduration ${((end - t) / 1000).toFixed(3)}`;
  });
  return `ffconcat version 1.0\n${lines.join("\n")}\nfile ${name(last)}\n`;
}
