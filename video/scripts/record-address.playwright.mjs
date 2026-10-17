// Run from the repo root (Playwright is a root dev dependency): node video/scripts/record-address.playwright.mjs
// Records City Hall's address lookup on the live /about page with Playwright's own video recorder,
// then prints when typing starts and when the result appears (seconds into the recording).
import { chromium } from "@playwright/test";
import { renameSync } from "node:fs";

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, recordVideo: { dir: "video/.frames/pw", size: { width: 1280, height: 800 } } });
const page = await context.newPage();
const t0 = Date.now();
// "load", not "networkidle": the page keeps a live Convex connection open.
await page.goto("https://www.creamcityalmanac.app/about", { waitUntil: "load" });
const box = page.locator("#find-address");
await box.waitFor();
await box.evaluate((el) => el.scrollIntoView({ block: "start" }));
await page.waitForTimeout(1500);
const typingAt = (Date.now() - t0) / 1000;
await box.pressSequentially("200 E Wells St", { delay: 90 });
await page.keyboard.press("Enter");
await page.waitForFunction(() => /ward/i.test(document.querySelector("[data-place-message]")?.textContent ?? ""), undefined, { timeout: 20000 });
const resultAt = (Date.now() - t0) / 1000;
await page.waitForTimeout(3000);
const video = page.video();
await context.close();
renameSync(await video.path(), "video/.frames/address.webm");
await browser.close();
console.log({ typingAt, resultAt });
