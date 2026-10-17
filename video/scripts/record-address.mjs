// Run from video/: ego-browser nodejs < scripts/record-address.mjs
// ego-browser can't subscribe to the screencast's frame events, so this takes screenshots in a tight loop
// while it types City Hall's address into the live /about page. ego-browser scripts don't see the shell's
// environment or working directory, so the frames folder is an absolute path (git-ignored video/.frames).
const OUT = "/Users/tarikmoody/Projects/dycu/inventory/video/.frames";
const fs = await import("node:fs");
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const task = await taskSpace("cca explainer video");
const page = task.page("p1");
await page.cdp("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
await page.goto("https://www.creamcityalmanac.app/about");
await page.waitForSelector("#find-address", { timeout: 30000 });
await page.evaluate(() => document.getElementById("find-address").scrollIntoView({ block: "start" }));
await page.waitForTimeout(800);

const times = [];
let recording = true;
const t0 = Date.now();
const loop = (async () => {
  while (recording) {
    await page.screenshot({ path: `${OUT}/f${String(times.length).padStart(5, "0")}.png` });
    times.push(Date.now() - t0);
  }
})();

await page.waitForTimeout(1000);
await page.click("#find-address", { label: "address box" });
for (const ch of "200 E Wells St") {
  await page.keyboard.type(ch);
  await page.waitForTimeout(90);
}
await page.keyboard.press("Enter");
const sent = Date.now() - t0;
await page.waitForFunction(() => /ward/i.test(document.querySelector("[data-place-message]")?.textContent ?? ""), undefined, { timeout: 20000 });
const resultAt = Date.now() - t0;
await page.waitForTimeout(3000);
recording = false;
await loop;
await page.cdp("Emulation.clearDeviceMetricsOverride");
fs.writeFileSync(`${OUT}/times.json`, JSON.stringify(times));
const seconds = times.at(-1) / 1000;
console.log({ frames: times.length, seconds, fps: (times.length / seconds).toFixed(1), sent: sent / 1000, resultAt: resultAt / 1000 });
