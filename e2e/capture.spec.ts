import { type Page } from "@playwright/test";
import { test } from "./fixtures";

// Marks appear after hydration reads storage and then load an image; capture only once all of that has landed.
async function settle(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => [...document.images].every((img) => img.complete && img.naturalWidth > 0));
  await page.waitForTimeout(1000); // the pencil draw-on runs 250ms + 600ms
}

const FIXED = new Date("2026-10-07T17:00:00Z");

test.describe("@capture", () => {
  test("hero at the comp's size", async ({ page }) => {
    await page.clock.setFixedTime(FIXED);
    await page.setViewportSize({ width: 1024, height: 1536 });
    await page.goto("/");
    await settle(page);
    await page.screenshot({ path: ".impeccable/review/hero-repro.png" });
  });

  test("results state at the comp's size", async ({ page }) => {
    await page.clock.setFixedTime(FIXED);
    await page.setViewportSize({ width: 1024, height: 1536 });
    // E01 was opened on an earlier visit, so its row shows the grease-pencil tick.
    await page.addInitScript(() => localStorage.setItem("cca:opened", JSON.stringify(["E01"])));
    await page.goto("/?q=" + encodeURIComponent("kids who can't afford food"));
    await page.locator("li[data-code] button").first().click();
    await page.locator("[id^='preview-'] a", { hasText: "Open sheet" }).waitFor();
    await settle(page);
    await page.screenshot({ path: ".impeccable/review/results-repro.png" });
  });

  test("desktop and mobile full pages", async ({ page }) => {
    await page.clock.setFixedTime(FIXED);
    for (const [width, height, file] of [
      [1440, 900, "desktop.png"],
      [390, 844, "mobile.png"],
    ] as const) {
      await page.setViewportSize({ width, height });
      await page.goto("/");
      await settle(page);
      await page.screenshot({ path: `.impeccable/review/${file}`, fullPage: true });
    }
  });
  test("laptop two-pane at the comp's size", async ({ page }) => {
    await page.clock.setFixedTime(FIXED);
    await page.setViewportSize({ width: 1536, height: 1024 });
    await page.goto("/");
    await page.locator("#sheet-pane h2").waitFor();
    await settle(page);
    await page.screenshot({ path: ".impeccable/review/laptop-repro.png" });
  });
  test("how it works at the comp sizes", async ({ page }) => {
    await page.clock.setFixedTime(FIXED);
    for (const [width, height, file] of [
      [1536, 1024, "how-laptop-repro.png"],
      [1024, 1536, "how-phone-repro.png"],
    ] as const) {
      await page.setViewportSize({ width, height });
      await page.goto("/how-it-works");
      await page.locator("figure svg").first().waitFor({ timeout: 20_000 });
      await settle(page);
      await page.screenshot({ path: `.impeccable/review/${file}` });
    }
  });
  test("neighborhood spreadsheet section at the comp crop", async ({ page }) => {
    await page.clock.setFixedTime(FIXED);
    // Laptop: the gate diffs the section against .impeccable/mocks/portraits-b-laptop-section.png, comp px 628,236 (788x752).
    await page.setViewportSize({ width: 1536, height: 1024 });
    await page.goto("/?open=N03&place=walkers-point&year=2023&topic=sex-and-age");
    const section = page.locator("section[aria-labelledby=portrait-heading]");
    await section.locator("table").waitFor();
    await settle(page);
    await section.evaluate((s) => {
      const pane = document.getElementById("sheet-pane")!;
      pane.scrollTop += s.getBoundingClientRect().top - 236;
    });
    await page.screenshot({ path: ".impeccable/review/hero-repro.png", clip: { x: 628, y: 236, width: 788, height: 752 } });
    // Phone: compared with portraits-a-phone.webp by eye.
    await page.setViewportSize({ width: 1024, height: 1536 });
    await page.goto("/d/N03?place=walkers-point&year=2023&topic=sex-and-age");
    await section.locator("table").waitFor();
    await settle(page);
    await section.evaluate((s) => window.scrollBy(0, s.getBoundingClientRect().top - 220));
    await page.screenshot({ path: ".impeccable/review/portraits-phone-repro.png" });
  });
  test("neighborhood spreadsheet section, responsive", async ({ page }) => {
    await page.clock.setFixedTime(FIXED);
    const section = page.locator("section[aria-labelledby=portrait-heading]");
    // Desktop 1440: the same crop of the section the comp shows (the gate diffs it against the comp).
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/?open=N03&place=walkers-point&year=2023&topic=sex-and-age");
    await section.locator("table").waitFor();
    await settle(page);
    await section.evaluate((s) => {
      document.getElementById("sheet-pane")!.scrollTop += s.getBoundingClientRect().top - 100;
    });
    const box = (await section.boundingBox())!;
    await page.screenshot({ path: ".impeccable/review/desktop.png", clip: { x: box.x - 16, y: 100, width: 788, height: 752 } });
    // Phone 390: the whole section.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/d/N03?place=walkers-point&year=2023&topic=sex-and-age");
    await section.locator("table").waitFor();
    await settle(page);
    await section.screenshot({ path: ".impeccable/review/mobile.png" });
  });
  test("Start here at the comp sizes", async ({ page }) => {
    await page.clock.setFixedTime(FIXED);
    for (const [width, height, file] of [
      [1536, 1024, "hero-repro.png"],
      [1024, 1536, "start-phone-repro.png"],
      [1440, 900, "desktop.png"],
    ] as const) {
      await page.setViewportSize({ width, height });
      await page.goto("/start-here");
      await page.locator("[data-example=resident] figcaption").waitFor();
      await settle(page);
      // desktop.png is full page: the responsive gate scales it to the comp's width and reads the top.
      await page.screenshot({ path: `.impeccable/review/${file}`, fullPage: file === "desktop.png" });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/start-here");
    await settle(page);
    await page.screenshot({ path: ".impeccable/review/mobile.png", fullPage: true });
  });
});
